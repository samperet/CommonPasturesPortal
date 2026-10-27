import type { ZodError } from "zod";
import { actorOf } from "@/lib/auth/actor";
import type { CommunityUser } from "@/lib/auth/users";
import type { DirectoryDocument } from "@/lib/directory/types";
import { COMMUNITY_ID } from "@/lib/circles/ids";
import { featureEnabled } from "@/lib/circles/features";
import {
  createPage,
  movePage,
  pageInputSchema,
  pageUpdateSchema,
  readPages,
  updatePage,
  type WikiPage,
  type Failure as WikiFailure,
} from "@/lib/wiki/store";
import { TRASH_DAYS, trashPage } from "@/lib/wiki/trash";
import { canEditPage, canManagePage, canMovePageTo, visiblePages } from "@/lib/wiki/access";
import { setFollowing, tellFollowers } from "@/lib/wiki/follows";
import { tellMentioned } from "@/lib/wiki/mentions";
import { canManageDocument, canUploadTo } from "@/lib/documents/access";
import { announceDocument } from "@/lib/documents/announce";
import { readGoogleText } from "@/lib/documents/link-fetch";
import { LINK_CONTENT_TYPE, classifyLink, linkName, readableKinds } from "@/lib/documents/links";
import { extractText, identifyDocument } from "@/lib/documents/files";
import {
  addVersion,
  createDocument,
  deleteDocument,
  documentDetailsSchema,
  getDocument,
  updateDocument,
  type DocumentDetails,
  type VersionContent,
} from "@/lib/documents/store";
import { readTypeMap, typesFor } from "@/lib/documents/type-store";
import { ACCEPTED_EXTENSIONS, currentVersion } from "@/lib/documents/types";
import type { Done, McpWriter } from "./server";

/**
 * What an AI assistant with a key that can write does on CVC's behalf
 * (`server.ts` → `McpWriter`): the same stores, rules and side effects as
 * the app's own routes — a page's creator follows it and those it mentions
 * are told; an edit tells the page's followers; a new document is announced
 * — so nothing an assistant does could be done by a resident who couldn't
 * do it in the app. Every refusal is in the app's own words. Files come as
 * base64 in the JSON request, so they're capped well under the platform's
 * request limit; larger ones are uploaded in the app.
 */

/** The largest file `add_file` takes (base64 in one JSON request; the platform stops at 4.5 MB). */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;

/** Why something couldn't be done (in the app's own words). */
type Refused = { ok: false; message: string };
const yes = (said: string): Done => ({ ok: true, said });
const no = (message: string): Refused => ({ ok: false, message });
const invalid = (error: ZodError) => error.issues[0]?.message ?? "That isn't valid";

const wikiMessage = (reason: WikiFailure) =>
  reason === "exists"
    ? "A page with that title already exists"
    : reason === "full"
      ? "The wiki has as many pages as it can hold"
      : reason === "conflict"
        ? "Someone else saved this page while you were editing it"
        : reason === "no_version"
          ? "That version no longer exists"
          : reason === "bad_parent"
            ? "A page can only go inside a page its own circle keeps — not inside itself or one of its own pages"
            : "That page no longer exists";

const documentMessage = (reason: "full" | "conflict" | "not_found") =>
  reason === "full"
    ? "The document library is full"
    : reason === "conflict"
      ? "Someone else changed it at the same moment — try again"
      : "That document no longer exists";

/** A page by its slug, or its exact title (any case) — among the pages this viewer sees (null: no drafts). */
export async function findPage(
  ref: string,
  viewer: Parameters<typeof visiblePages>[1]
): Promise<WikiPage | null> {
  const wanted = ref.trim().toLowerCase();
  return (
    visiblePages(await readPages(), viewer).find(
      (page) => page.slug === wanted || page.title.toLowerCase() === wanted
    ) ?? null
  );
}

export function writerFor(
  user: CommunityUser,
  directory: DirectoryDocument,
  site: string
): McpWriter {
  const actor = actorOf(user);
  const circles = directory.circles;
  const circleFor = (id: string) => circles.find((circle) => circle.id === id);
  const noCircle = (id: string) => no(`No circle with id ${id}. list_circles gives the ids.`);
  const noPage = (ref: string) =>
    no(`No page called “${ref}”. Use list_pages or search to find its slug.`);
  const pageUrl = (page: WikiPage) => `${site}/wiki/${page.slug}`;
  const documentsUrl = (circleId: string) => `${site}/documents?circle=${circleId}`;

  /** Whether the resident may add documents to a circle (and it takes them). */
  const mayAddTo = (circleId: string) => {
    const circle = circleFor(circleId);
    if (!circle) return noCircle(circleId);
    if (!featureEnabled(circle, "documents")) return no(`${circle.name} has turned documents off`);
    if (!canUploadTo(user, directory, circle.id))
      return no("Only this circle's members, the Board, and admins can add its documents");
    return { ok: true as const, circle };
  };

  /** One of a circle's document types, by id or name (left out: its first). */
  const typeIn = async (circleId: string, type: string | undefined) => {
    const types = typesFor(circleId, await readTypeMap());
    const option = type
      ? types.find((entry) => entry.id === type || entry.label.toLowerCase() === type.toLowerCase())
      : types[0];
    return (
      option ??
      no(
        `Choose one of this circle's document types: ${types
          .map((entry) => `${entry.label} (${entry.id})`)
          .join(", ")}`
      )
    );
  };

  const detailsFor = async (
    circleId: string,
    input: { title?: string; type?: string; description?: string; meetingDate?: string }
  ) => {
    const option = await typeIn(circleId, input.type);
    if ("ok" in option) return option;
    const parsed = documentDetailsSchema.safeParse({
      title: input.title ?? "",
      type: option.id,
      description: input.description,
      meetingDate: input.meetingDate,
    });
    if (!parsed.success) return no(invalid(parsed.error));
    const details: DocumentDetails = { ...parsed.data, typeLabel: option.label };
    return { ok: true as const, details };
  };

  return {
    async createPage({ title, body, circle, parent: parentRef, draft }) {
      const parent = parentRef ? await findPage(parentRef, user) : null;
      if (parentRef && !parent) return noPage(parentRef);
      if (parent && circle && circle !== parent.keeper)
        return no("A page goes inside a page its own circle keeps");
      const keeper = parent?.keeper ?? circle ?? COMMUNITY_ID;
      const found = circleFor(keeper);
      if (!found) return noCircle(keeper);
      if (!canUploadTo(user, directory, keeper))
        return no("You can only start pages kept by your own circles");
      const parsed = pageInputSchema.pick({ title: true, body: true }).safeParse({ title, body });
      if (!parsed.success) return no(invalid(parsed.error));
      const result = await createPage(actor, {
        ...parsed.data,
        keeper,
        parentId: parent?.id ?? null,
        draft: !!draft,
      });
      if (!result.ok) return no(wikiMessage(result.reason));
      if (!result.page) return no("That page no longer exists");
      // Whoever starts a page follows it; anyone it mentions hears (once it's published).
      await setFollowing(result.page.id, actor.userId, true);
      if (!result.page.draft) await tellMentioned(result.page, actor);
      return yes(
        `Started “${result.page.title}” in ${found.name}${
          parent ? ` inside “${parent.title}”` : ""
        }${
          result.page.draft
            ? " as a draft (only its author and admins see it until it's published in CVC)"
            : ""
        } (slug: ${result.page.slug}, updatedAt: ${result.page.updatedAt}): ${pageUrl(result.page)}`
      );
    },

    async updatePage({ page: ref, title, body, baseUpdatedAt }) {
      const page = await findPage(ref, user);
      if (!page) return noPage(ref);
      if (!canEditPage(user, directory, page))
        return no("Only those this page is open to can edit it");
      const parsed = pageUpdateSchema.safeParse({ title, body, baseUpdatedAt });
      if (!parsed.success) return no(invalid(parsed.error));
      const result = await updatePage(page.slug, actor, parsed.data);
      if (!result.ok && result.reason === "conflict") {
        const now = (await findPage(page.slug, user)) ?? page;
        return {
          conflict: { body: now.body, updatedAt: now.updatedAt, updatedBy: now.updatedBy.name },
        };
      }
      if (!result.ok) return no(wikiMessage(result.reason));
      if (!result.page) return no("That page no longer exists");
      // Anyone newly mentioned hears, once; so do those following the page.
      if (result.page.body !== page.body) await tellMentioned(result.page, actor);
      await tellFollowers(result.page, actor, "edited it");
      return yes(
        `Saved “${result.page.title}” (updatedAt: ${result.page.updatedAt}): ${pageUrl(
          result.page
        )}`
      );
    },

    async movePage({ page: ref, circle: circleId, parent: parentRef }) {
      const page = await findPage(ref, user);
      if (!page) return noPage(ref);
      if (!canManagePage(user, directory, page))
        return no("Only the circle that keeps this page (or the Board) can change that");
      const done: string[] = [];
      let keeper = page.keeper;
      if (circleId) {
        const circle = circleFor(circleId);
        if (!circle) return noCircle(circleId);
        if (!canMovePageTo(user, directory, page, circle.id))
          return no(`Join ${circle.name} first: only its members can move pages to it`);
        if (page.keeper !== circle.id) {
          const result = await updatePage(page.slug, actor, { keeper: circle.id });
          if (!result.ok) return no(wikiMessage(result.reason));
          keeper = circle.id;
          done.push(`to ${circle.name}`);
        }
      }
      if (parentRef !== undefined) {
        const top = !parentRef.trim() || parentRef.trim().toLowerCase() === "top";
        const parent = top ? null : await findPage(parentRef, user);
        if (!top && !parent) return noPage(parentRef);
        if (parent && parent.keeper !== keeper)
          return no("A page goes inside a page its own circle keeps");
        const result = await movePage(page.slug, { parentId: parent?.id ?? null });
        if (!result.ok) return no(wikiMessage(result.reason));
        done.push(parent ? `inside “${parent.title}”` : "to the circle's top level");
      }
      if (!done.length) return yes(`“${page.title}” is already where you asked: ${pageUrl(page)}`);
      return yes(`Moved “${page.title}” ${done.join(", ")}: ${pageUrl(page)}`);
    },

    async deletePage({ page: ref }) {
      const page = await findPage(ref, user);
      if (!page) return noPage(ref);
      if (!canManagePage(user, directory, page))
        return no("Only the circle that keeps this page (or the Board) can change that");
      const result = await trashPage(page, actor);
      if (!result.ok) return no(wikiMessage(result.reason));
      return yes(
        `Put “${page.title}” in the trash. It can be restored for ${TRASH_DAYS} days at ${site}/documents/trash.`
      );
    },

    async documentTypes(circleId) {
      if (!circleFor(circleId)) return null;
      return typesFor(circleId, await readTypeMap()).map(({ id, label }) => ({ id, label }));
    },

    async addLink({ circle: circleId, url, title, type, description, meetingDate }) {
      const info = classifyLink(url);
      if (!info) return no("That doesn't look like a web address");
      const may = mayAddTo(circleId);
      if (!may.ok) return may;
      const details = await detailsFor(circleId, { title, type, description, meetingDate });
      if (!details.ok) return details;
      const read = readableKinds.includes(info.kind) ? await readGoogleText(info) : null;
      const content: VersionContent = {
        fileName: linkName(info),
        contentType: LINK_CONTENT_TYPE,
        viewable: true,
        text: read?.text ?? "",
        link: { url: info.url, kind: info.kind },
      };
      const result = await createDocument(circleId, details.details, content, actor);
      if (!result.ok) return no(documentMessage(result.reason));
      await announceDocument(result.value, user, directory, false);
      return yes(
        `Added the link “${result.value.title}” to ${may.circle.name}'s documents (id: ${
          result.value.id
        }): ${documentsUrl(circleId)}${
          read && !read.shared
            ? "\n\nNote: this Google file isn't shared with anyone who has the link, so residents may not be able to open it."
            : ""
        }`
      );
    },

    async addFile({
      circle: circleId,
      fileName,
      contentBase64,
      title,
      type,
      description,
      meetingDate,
      replaces,
    }) {
      if (fileName.length > 200) return no("Keep the file name to 200 characters");
      if (!ACCEPTED_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(extension)))
        return no("Upload a PDF, Word, Excel, PowerPoint, text, or image file");
      const bytes = new Uint8Array(Buffer.from(contentBase64.replace(/\s+/g, ""), "base64"));
      if (!bytes.length) return no("The file is empty (is contentBase64 valid base64?)");
      if (bytes.length > MAX_FILE_BYTES)
        return no(
          `Files sent this way must be ${
            MAX_FILE_BYTES / 1024 / 1024
          } MB or smaller; upload larger ones in the app`
        );
      const identified = identifyDocument(bytes, fileName);
      if (!identified)
        return no(
          "That file isn't a PDF, Word, Excel, PowerPoint, text, or image file we can accept"
        );
      const file: VersionContent = {
        bytes,
        fileName,
        contentType: identified.contentType,
        viewable: identified.viewable,
        text: await extractText(bytes, identified.kind),
      };
      if (replaces) {
        const existing = await getDocument(replaces);
        if (!existing) return no("That document no longer exists");
        if (!canManageDocument(user, directory, existing))
          return no("You can't replace this document");
        const result = await addVersion(existing.id, file, actor);
        if (!result.ok) return no(documentMessage(result.reason));
        await announceDocument(result.value, user, directory, true);
        return yes(
          `Added version ${currentVersion(result.value).number} of “${result.value.title}” (id: ${
            result.value.id
          }): ${documentsUrl(result.value.circleId)}`
        );
      }
      if (!circleId)
        return no("Say which circle the document goes to (its id), or which document it replaces");
      const may = mayAddTo(circleId);
      if (!may.ok) return may;
      const details = await detailsFor(circleId, { title, type, description, meetingDate });
      if (!details.ok) return details;
      const result = await createDocument(circleId, details.details, file, actor);
      if (!result.ok) return no(documentMessage(result.reason));
      await announceDocument(result.value, user, directory, false);
      return yes(
        `Added “${result.value.title}” to ${may.circle.name}'s documents (id: ${result.value.id}${
          file.text ? ", its text searchable" : ", no text found in it"
        }): ${documentsUrl(circleId)}`
      );
    },

    async updateDocument({ id, title, description, type, meetingDate }) {
      const doc = await getDocument(id);
      if (!doc) return no("That document no longer exists");
      if (!canManageDocument(user, directory, doc)) return no("You can't edit this document");
      const option = type === undefined ? null : await typeIn(doc.circleId, type);
      if (option && "ok" in option) return option;
      const parsed = documentDetailsSchema.partial().safeParse({
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(option ? { type: option.id } : {}),
        ...(meetingDate !== undefined ? { meetingDate: meetingDate || null } : {}),
      });
      if (!parsed.success) return no(invalid(parsed.error));
      const result = await updateDocument(id, {
        ...parsed.data,
        ...(option ? { typeLabel: option.label } : {}),
      });
      if (!result.ok) return no("That document no longer exists");
      return yes(`Changed “${result.value.title}” (id: ${id}): ${documentsUrl(doc.circleId)}`);
    },

    async deleteDocument({ id }) {
      const doc = await getDocument(id);
      if (!doc) return no("That document no longer exists");
      if (!canManageDocument(user, directory, doc)) return no("You can't delete this document");
      const result = await deleteDocument(id);
      if (!result.ok) return no("That document no longer exists");
      return yes(`Deleted “${doc.title}” and its files.`);
    },
  };
}
