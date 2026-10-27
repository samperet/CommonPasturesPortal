import { mutateJson, readJson } from "@/lib/storage";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { Circle } from "@/lib/circles/types";
import { createCircle, readCircles } from "@/lib/circles/store";
import { importPages, readPages, type ImportedPageInput, type WikiAuthor } from "@/lib/wiki/store";
import { importComments, type WikiComment } from "@/lib/wiki/comments";
import { saveWikiImage, wikiImageUrl } from "@/lib/wiki/images";
import { createDocument } from "@/lib/documents/store";
import { readTypeMap, typesFor } from "@/lib/documents/type-store";
import { identifyDocument } from "@/lib/documents/files";
import { listUsers } from "@/lib/auth/users";
import type { Actor } from "@/lib/auth/actor";
import { attachmentIdsIn, commentText, linkedDocumentsIn, outlineToWiki } from "./markdown";
import type {
  OutlineClient,
  OutlineCollection,
  OutlineComment,
  OutlineDocument,
  OutlineNode,
  OutlineUser,
} from "./client";

/**
 * Bringing an Outline wiki into CVC (admins, from Admin → Import from
 * Outline): every collection becomes a circle (one with the same name, or
 * a new one), every document a page in that circle's tree, with its icon,
 * dates, authors (matched to residents by email), images (kept here),
 * files (as the circle's documents) and comments. Outline's Markdown is
 * turned into CVC's (`markdown.ts`). Re-runnable: a page is found again by
 * the document it came from (`source`), so running the import again brings
 * over what changed and nothing twice. The work goes in batches (`BATCH`
 * documents a request), its state kept in `outline/import.json` so the
 * admin page can follow it and carry on. Links between documents are
 * settled last, once every page has its title.
 */

const STATE = "outline/import.json";
export const BATCH = 40;

interface QueuedDocument {
  id: string;
  collectionId: string;
  collectionUrlId: string;
  circleId: string;
  parentOutlineId: string | null;
  index: number;
}

export interface ImportState {
  startedAt: string | null;
  finishedAt: string | null;
  /** When the state last changed (a run that's gone quiet is treated as over). */
  touchedAt: string | null;
  by: string | null;
  queue: QueuedDocument[];
  total: number;
  done: number;
  created: number;
  updated: number;
  unchanged: number;
  comments: number;
  images: number;
  files: number;
  circlesMade: string[];
  renamed: { outlineTitle: string; title: string }[];
  unmatchedAuthors: string[];
  errors: string[];
  log: string[];
  /** Outline attachment id → what it became here (kept across runs, so nothing is uploaded twice). */
  attachments: Record<string, { kind: "image"; url: string } | { kind: "file"; title: string }>;
  /** Outline document id → page id. */
  pages: Record<string, string>;
  /** Outline document urlId → the page's title here (for links between pages). */
  titles: Record<string, string>;
  /** Documents whose links couldn't all be settled yet (their targets weren't imported yet). */
  pendingLinks: string[];
}

export const emptyState = (): ImportState => ({
  startedAt: null,
  finishedAt: null,
  touchedAt: null,
  by: null,
  queue: [],
  total: 0,
  done: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  comments: 0,
  images: 0,
  files: 0,
  circlesMade: [],
  renamed: [],
  unmatchedAuthors: [],
  errors: [],
  log: [],
  attachments: {},
  pages: {},
  titles: {},
  pendingLinks: [],
});

const QUIET_MS = 10 * 60 * 1000;

export async function readImportState(): Promise<ImportState> {
  const raw = (await readJson(STATE)) as Partial<ImportState> | null;
  return { ...emptyState(), ...(raw ?? {}) };
}

/** A run that started, hasn't finished, and was active lately. */
export const isRunning = (state: ImportState, now = Date.now()) =>
  !!state.startedAt &&
  !state.finishedAt &&
  !!state.touchedAt &&
  now - Date.parse(state.touchedAt) < QUIET_MS;

const saveState = (state: ImportState) =>
  mutateJson(STATE, () => ({
    value: { ...state, touchedAt: new Date().toISOString() },
    result: null,
  }));

/** What's in Outline, and where it would land (the admin page's preview). */
export interface ImportPlan {
  collections: {
    id: string;
    name: string;
    documents: number;
    circle: { id: string; name: string } | null;
  }[];
  /** Pages already brought over before. */
  alreadyHere: number;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function planImport(
  client: OutlineClient,
  directory: DirectoryDocument
): Promise<ImportPlan> {
  const collections = await client.listAll<OutlineCollection>("collections.list");
  const plan: ImportPlan["collections"] = [];
  for (const collection of collections) {
    const documents = await client.listAll<OutlineDocument>("documents.list", {
      collectionId: collection.id,
    });
    const circle = directory.circles.find((entry) => sameName(entry.name, collection.name));
    plan.push({
      id: collection.id,
      name: collection.name,
      documents: documents.length,
      circle: circle ? { id: circle.id, name: circle.name } : null,
    });
  }
  const alreadyHere = (await readPages()).filter((page) => page.source?.outline).length;
  return { collections: plan, alreadyHere };
}

export interface ImportContext {
  directory: DirectoryDocument;
  /** The directory as imported (what the circle store seeds from). */
  imported: Circle[];
  actor: Actor;
}

const flatten = (
  nodes: OutlineNode[],
  parent: string | null
): Omit<QueuedDocument, "collectionId" | "collectionUrlId" | "circleId">[] =>
  nodes.flatMap((node, index) => [
    { id: node.id, parentOutlineId: parent, index },
    ...flatten(node.children ?? [], node.id),
  ]);

/**
 * Start a run: every collection gets its circle (made if need be), every
 * document its place in the queue, in Outline's order. Then the first batch.
 */
export async function startImport(client: OutlineClient, ctx: ImportContext): Promise<ImportState> {
  const before = await readImportState();
  const state: ImportState = {
    ...emptyState(),
    attachments: before.attachments,
    pages: before.pages,
    titles: before.titles,
    startedAt: new Date().toISOString(),
    by: ctx.actor.name,
  };
  // The circles as managed here (a circle made by an earlier run is among them).
  const circles = [...(await readCircles(ctx.imported))];
  const collections = await client.listAll<OutlineCollection>("collections.list");
  for (const collection of collections) {
    let circle = circles.find((entry) => sameName(entry.name, collection.name));
    if (!circle) {
      const made = await createCircle(
        ctx.imported,
        {
          name: collection.name.trim(),
          description: collection.description ?? null,
          kind: "circle",
        },
        { personId: ctx.actor.personId ?? "", name: ctx.actor.name }
      );
      if (!made.ok) {
        state.errors.push(`Couldn't make a circle for “${collection.name}” (${made.reason})`);
        continue;
      }
      circle = made.value;
      circles.push(circle);
      state.circlesMade.push(circle.name);
      state.log.push(`Made the circle “${circle.name}” for the collection of that name`);
    }
    const tree = await client.call<OutlineNode[]>("collections.documents", { id: collection.id });
    const placed = flatten(tree, null);
    const seen = new Set(placed.map((entry) => entry.id));
    // Documents the tree doesn't list (templates, say) come after, at the top level.
    const extra: OutlineDocument[] = [];
    for (const body of [
      { collectionId: collection.id },
      { collectionId: collection.id, template: true },
    ]) {
      const listed = await client.listAll<OutlineDocument>("documents.list", body).catch(() => []);
      for (const doc of listed)
        if (!seen.has(doc.id) && !doc.archivedAt) {
          seen.add(doc.id);
          extra.push(doc);
        }
    }
    const top = placed.filter((entry) => entry.parentOutlineId === null).length;
    const queued = [
      ...placed,
      ...extra.map((doc, offset) => ({ id: doc.id, parentOutlineId: null, index: top + offset })),
    ];
    state.queue.push(
      ...queued.map((entry) => ({
        ...entry,
        collectionId: collection.id,
        collectionUrlId: collection.urlId,
        circleId: circle!.id,
      }))
    );
  }
  state.total = state.queue.length;
  state.log.push(`${state.total} documents in ${collections.length} collections to bring over`);
  await saveState(state);
  return continueImport(client, ctx, state);
}

/** Carry on with the next batch of the queue (or finish, settling links). */
export async function continueImport(
  client: OutlineClient,
  ctx: ImportContext,
  given?: ImportState,
  limit = BATCH
): Promise<ImportState> {
  const state = given ?? (await readImportState());
  if (!state.startedAt || state.finishedAt) return state;
  const people = new Map(
    ctx.directory.people
      .filter((person) => person.email)
      .map((person) => [person.email!.trim().toLowerCase(), person] as const)
  );
  const userByPerson = new Map(
    (await listUsers())
      .filter((user) => user.personId)
      .map((user) => [user.personId!, user] as const)
  );
  const outlineUsers = new Map<string, OutlineUser>();
  const note = (user: OutlineUser | null | undefined) => {
    if (user) outlineUsers.set(user.id, user);
  };
  const personFor = (user: OutlineUser | null | undefined) =>
    user?.email ? people.get(user.email.trim().toLowerCase()) : undefined;
  const authorOf = (user: OutlineUser | null | undefined): WikiAuthor => {
    note(user);
    const person = personFor(user);
    if (user && !person && !state.unmatchedAuthors.includes(user.name))
      state.unmatchedAuthors.push(user.name);
    const account = person ? userByPerson.get(person.id) : undefined;
    return {
      userId: account?.id ?? `outline:${user?.id ?? "unknown"}`,
      name: person?.displayName ?? user?.name ?? "Someone from the wiki",
    };
  };
  const mention = (userId: string, name: string) => {
    const person = personFor(outlineUsers.get(userId));
    return person ? `:person[${person.displayName}]{#${person.id}}` : name;
  };
  const types = await readTypeMap();

  const commentsCounted = new Set<string>();

  const bringOver = async (queued: QueuedDocument, keepPlace = false) => {
    const doc = await client.call<OutlineDocument>("documents.info", { id: queued.id });
    note(doc.createdBy);
    note(doc.updatedBy);
    // Its images and files, kept here (once).
    for (const id of attachmentIdsIn(doc.text)) {
      if (state.attachments[id]) continue;
      const found = await client.attachment(id);
      if (!found) {
        state.errors.push(`“${doc.title}”: an attachment (${id}) couldn't be fetched`);
        continue;
      }
      const identified = identifyDocument(found.bytes, found.fileName ?? "");
      if (found.contentType.startsWith("image/") || identified?.kind === "image") {
        const imageId = await saveWikiImage(
          queued.circleId,
          found.bytes,
          identified?.contentType ?? found.contentType,
          ctx.actor.userId
        );
        if (imageId) {
          state.attachments[id] = { kind: "image", url: wikiImageUrl(queued.circleId, imageId) };
          state.images++;
        } else state.errors.push(`“${doc.title}”: no room for one of its images`);
      } else {
        const fileName = found.fileName ?? `attachment-${id}`;
        const option = typesFor(queued.circleId, types).at(-1) ?? { id: "other", label: "Other" };
        const title = fileName.replace(/\.[A-Za-z0-9]{1,8}$/, "");
        const made = await createDocument(
          queued.circleId,
          {
            title,
            description: `From the wiki page “${doc.title}”`,
            type: option.id,
            meetingDate: null,
            typeLabel: option.label,
          },
          {
            bytes: found.bytes,
            fileName,
            contentType: identified?.contentType ?? found.contentType,
            viewable: identified?.viewable ?? false,
            text: "",
          },
          ctx.actor
        );
        if (made.ok) {
          state.attachments[id] = { kind: "file", title: made.value.title };
          state.files++;
        } else
          state.errors.push(
            `“${doc.title}”: a file (${fileName}) couldn't be kept (${made.reason})`
          );
      }
    }
    const linked = linkedDocumentsIn(doc.text);
    const { body, cut } = outlineToWiki(doc.text, {
      host: client.host,
      linkTitle: (urlId) => state.titles[urlId] ?? null,
      mention,
      attachment: (id, kind, text) => {
        const kept = state.attachments[id];
        if (!kept) return null;
        if (kept.kind === "image") return `![${text}](${kept.url})`;
        return `[[doc:${kept.title}${text && text !== kept.title ? `|${text}` : ""}]]`;
      },
    });
    if (cut) state.errors.push(`“${doc.title}” was too long and was cut`);
    const entry: ImportedPageInput = {
      source: {
        outline: {
          documentId: doc.id,
          urlId: doc.urlId,
          url: `${client.host}${doc.url}`,
          collectionId: queued.collectionId,
          collectionUrlId: queued.collectionUrlId,
          title: doc.title,
          importedAt: new Date().toISOString(),
        },
      },
      title: doc.title.trim().slice(0, 120) || "Untitled",
      body,
      keeper: queued.circleId,
      parentOutlineId: keepPlace ? undefined : queued.parentOutlineId,
      index: keepPlace ? undefined : queued.index,
      icon: doc.icon && /^\p{Extended_Pictographic}/u.test(doc.icon) ? doc.icon : null,
      createdAt: doc.createdAt,
      createdBy: authorOf(doc.createdBy),
      updatedAt: doc.updatedAt,
      updatedBy: authorOf(doc.updatedBy ?? doc.createdBy),
      template: !!doc.template,
    };
    const result = await importPages([entry]);
    if (!result.ok) {
      state.errors.push(`“${doc.title}” couldn't be saved (${result.reason})`);
      return;
    }
    const { outcome } = result;
    state.created += outcome.created;
    state.updated += outcome.updated;
    state.unchanged += outcome.unchanged;
    for (const renamed of outcome.renamed)
      if (!state.renamed.some((entry) => entry.outlineTitle === renamed.outlineTitle))
        state.renamed.push(renamed);
    const pageId = outcome.pageIds[doc.id];
    state.pages[doc.id] = pageId;
    state.titles[doc.urlId] = outcome.renamed[0]?.title ?? entry.title;
    if (linked.some((urlId) => !state.titles[urlId]) && !state.pendingLinks.includes(doc.id))
      state.pendingLinks.push(doc.id);
    // Its comments.
    const comments = await client
      .listAll<OutlineComment>("comments.list", { documentId: doc.id })
      .catch(() => [] as OutlineComment[]);
    if (comments.length) {
      const ids = new Set(comments.map((comment) => `outline:${comment.id}`));
      const records: WikiComment[] = comments.map((comment) => {
        note(comment.createdBy);
        const author = authorOf(comment.createdBy);
        const parentId = comment.parentCommentId ? `outline:${comment.parentCommentId}` : null;
        return {
          id: `outline:${comment.id}`,
          pageId,
          parentId: parentId && ids.has(parentId) ? parentId : null,
          authorId: author.userId,
          authorPersonId: personFor(comment.createdBy)?.id ?? null,
          authorName: author.name,
          body: commentText(comment.data).slice(0, 2000) || "(an empty comment)",
          createdAt: comment.createdAt,
          quote: null,
        };
      });
      const total = await importComments(pageId, records);
      if (!commentsCounted.has(pageId)) state.comments += total;
      commentsCounted.add(pageId);
    }
    state.log.push(
      `${outcome.created ? "Brought over" : outcome.updated ? "Updated" : "Already here:"} “${
        entry.title
      }”`
    );
  };

  let taken = 0;
  while (state.queue.length && taken < limit) {
    const queued = state.queue.shift()!;
    try {
      await bringOver(queued);
    } catch (error) {
      state.errors.push(`A document (${queued.id}) failed: ${(error as Error).message}`);
    }
    state.done++;
    taken++;
    if (taken % 10 === 0) await saveState(state);
  }
  if (!state.queue.length) {
    // Links to pages that didn't exist yet when their page was written: write those pages again.
    const pending = [...state.pendingLinks];
    state.pendingLinks = [];
    for (const id of pending) {
      const page = (await readPages()).find((entry) => entry.source?.outline.documentId === id);
      if (!page?.source) continue;
      try {
        await bringOver(
          {
            id,
            collectionId: page.source.outline.collectionId,
            collectionUrlId: page.source.outline.collectionUrlId ?? "",
            circleId: page.keeper,
            parentOutlineId: null,
            index: 0,
          },
          true // where it already is
        );
      } catch (error) {
        state.errors.push(`Settling links in a page (${id}) failed: ${(error as Error).message}`);
      }
    }
    state.finishedAt = new Date().toISOString();
    state.log.push(
      `Done: ${state.created} brought over, ${state.updated} updated, ${state.unchanged} already here; ${state.comments} comments, ${state.images} images, ${state.files} files`
    );
  }
  state.log = state.log.slice(-200);
  state.errors = state.errors.slice(-200);
  await saveState(state);
  return state;
}
