import { randomUUID } from "crypto";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import {
  deleteBinary,
  mutateJson,
  readBinaryStream,
  readJson,
  writeBinaryStream,
} from "@/lib/storage";
import type { Actor } from "@/lib/auth/actor";
import type { DirectoryDocument } from "@/lib/directory/types";
import { readPages, type WikiPage } from "@/lib/wiki/store";
import { visiblePages } from "@/lib/wiki/access";
import { consentState as pageConsentState, pageStage } from "@/lib/wiki/consent";
import { imageKey, listWikiImages } from "@/lib/wiki/images";
import { listWikiPolls } from "@/lib/polls/wiki";
import { listProposals } from "@/lib/proposals/store";
import { snapshotOf, type DocumentRef, type Proposal } from "@/lib/proposals/shared";
import { siteUrl } from "@/lib/site-url";
import { TIME_ZONE, shortDate, todayInVermont } from "@/lib/time";
import { fileKey, getDocumentTexts, listDocuments } from "./store";
import { readTypeMap, typeLabelFor } from "./type-store";
import { LINK_LABELS } from "./links";
import {
  consentState as fileConsentState,
  currentVersion,
  formatBytes,
  type DocumentRecord,
} from "./types";
import {
  NameBook,
  linkMarkdown,
  pageMarkdown,
  proposalMarkdown,
  proposalStatusText,
  readmeMarkdown,
  safeName,
  type ExportContext,
  type ExportKind,
  type IndexItem,
} from "./export-markdown";

/**
 * Exporting documents as a zip: those chosen — or all of them, or all of a
 * circle's. Written pages, proposals and
 * links become Markdown files (`export-markdown.ts`); files are their latest
 * versions as uploaded; photos in pages come along in `images/`; and a
 * README lists everything, by circle. Each circle's documents are in a
 * folder of its name, its proposals in `Proposals/` there.
 *
 * The zip is made into storage without ever being held whole: each file is
 * read as it streams in (`readBinaryStream`) and the zip goes out in parts
 * (`writeBinaryStream`), so neither the server's memory nor how long a
 * request may last limits the download, which comes from storage directly
 * (`GET /api/documents/export/<id>`). An export is kept for a day
 * (`exports/<id>.zip`, listed in `exports/index.json`), for whoever made it
 * only; older ones are deleted when the next is made.
 */

/** The most file bytes one export takes (a zip without Zip64 tops out at 4 GiB). */
export const MAX_EXPORT_BYTES = 2 * 1024 * 1024 * 1024;
const KEEP_MS = 24 * 60 * 60 * 1000;
const INDEX = "exports/index.json";
const zipKey = (id: string) => `exports/${id}.zip`;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export type ExportChoice =
  | { all: true; circle?: string }
  | { items: { kind: ExportKind; id: string }[] };
export type ExportFailure = "empty" | "too_big";
type Session = { actor: Actor; directory: DirectoryDocument };

/** One file in the zip: text (compressed), or a stored file read when its turn comes (null: it's missing). */
interface Entry {
  path: string;
  /** When it last changed (ISO), for its date in the zip. */
  at: string;
  content: string | (() => Promise<AsyncIterable<Uint8Array> | null>);
  /** How the README lists it (photos aren't listed). */
  item?: IndexItem;
}

export interface ExportPlan {
  /** "CVC documents 2026-10-10.zip"; everything is in a folder of the same name. */
  fileName: string;
  root: string;
  entries: Entry[];
  /** What was asked for and isn't there, in a few words each. */
  missing: string[];
  counts: { pages: number; files: number; links: number; proposals: number };
  /** The files' bytes (pages, links and photos aside). */
  bytes: number;
  exportedBy: string;
}

const extensionOf = (fileName: string) => fileName.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "";
/** "Minutes.pdf" stays "Minutes" + ".pdf" (not "Minutes.pdf.pdf"). */
const withoutExtension = (title: string, extension: string) =>
  extension && title.toLowerCase().endsWith(extension.toLowerCase())
    ? title.slice(0, -extension.length)
    : title;
const vermontDay = (iso: string) => todayInVermont(new Date(iso));
const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** What's in the export: the documents chosen, each named and turned into its file. */
export async function planExport(
  choice: ExportChoice,
  session: Session
): Promise<ExportPlan | { error: ExportFailure }> {
  const { directory, actor } = session;
  const [pages, documents, proposals, polls, types, texts] = await Promise.all([
    readPages().then((all) => visiblePages(all, { id: actor.userId, personId: actor.personId })),
    listDocuments(),
    listProposals(),
    listWikiPolls(),
    readTypeMap(),
    getDocumentTexts(),
  ]);
  const circles = directory.circles.map(({ id, name, code }) => ({ id, name, code }));
  const circleName = (id: string) => circles.find((circle) => circle.id === id)?.name ?? "Other";

  // What's asked for.
  const asked =
    "items" in choice
      ? new Set(choice.items.map((item) => `${item.kind}:${item.id.toLowerCase()}`))
      : null;
  const scope = "all" in choice ? choice.circle ?? null : null;
  const wants = (kind: ExportKind, id: string, circleId: string) =>
    asked ? asked.has(`${kind}:${id}`) : !scope || circleId === scope;
  const chosenPages = pages.filter((page) => wants("page", page.id, page.keeper));
  const chosenDocs = documents.filter((doc) => wants("file", doc.id, doc.circleId));
  const chosenProposals = proposals.filter(
    (proposal) =>
      wants("proposal", proposal.id, proposal.circleId) &&
      (!!asked || proposal.status !== "withdrawn")
  );
  const found = chosenPages.length + chosenDocs.length + chosenProposals.length;
  if (!found) return { error: "empty" };
  const bytes = chosenDocs.reduce((sum, doc) => {
    const version = currentVersion(doc);
    return sum + (version.link ? 0 : version.size);
  }, 0);
  if (bytes > MAX_EXPORT_BYTES) return { error: "too_big" };
  const missing =
    asked && asked.size > found
      ? [
          `${plural(asked.size - found, "document")} that ${
            asked.size - found === 1 ? "is" : "are"
          } gone`,
        ]
      : [];

  // Their names: a folder per circle, its proposals in Proposals/.
  const book = new NameBook();
  const paths = new Map<string, string>();
  const folder = (circleId: string) => safeName(circleName(circleId), "Other");
  const byTitle = <T extends { title: string }>(list: T[]) =>
    [...list].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true })
    );
  for (const page of byTitle(chosenPages))
    paths.set(`page:${page.id}`, book.claim(folder(page.keeper), page.title, ".md"));
  for (const doc of byTitle(chosenDocs)) {
    const version = currentVersion(doc);
    const extension = version.link ? ".md" : extensionOf(version.fileName);
    paths.set(
      `file:${doc.id}`,
      book.claim(
        folder(doc.circleId),
        version.link ? `${doc.title} (link)` : withoutExtension(doc.title, extension),
        extension
      )
    );
  }
  for (const proposal of byTitle(chosenProposals))
    paths.set(
      `proposal:${proposal.id}`,
      book.claim(`${folder(proposal.circleId)}/Proposals`, proposal.title, ".md")
    );

  // Photos in the pages: the circles' lists say what each is.
  const photoCircles = new Set<string>();
  for (const text of [
    ...pages.map((page) => page.body),
    ...proposals.map((proposal) => proposal.body),
  ])
    for (const match of Array.from(text.matchAll(/\/api\/circles\/([a-z0-9-]+)\/wiki\/images\//g)))
      photoCircles.add(match[1]);
  const photoTypes = new Map<string, string>();
  for (const circleId of Array.from(photoCircles))
    for (const image of await listWikiImages(circleId))
      photoTypes.set(`${circleId}/${image.id}`, image.contentType);
  const photos = new Map<string, { path: string; key: string }>();

  const context: ExportContext = {
    siteUrl: siteUrl(),
    circles,
    pages,
    documents: documents.map(({ id, title, circleId }) => ({ id, title, circleId })),
    proposals: new Map(proposals.map((proposal) => [proposal.id, proposal])),
    polls: new Map(
      polls.map((poll) => [
        poll.id,
        { question: poll.question, details: poll.details, poll: poll.poll },
      ])
    ),
    pathOf: (kind, id) => paths.get(`${kind}:${id}`) ?? null,
    imagePath: (circleId, imageId) => {
      const type = photoTypes.get(`${circleId}/${imageId}`);
      if (!type) return null;
      const known = photos.get(imageId);
      if (known) return known.path;
      const path = `images/${imageId}${IMAGE_EXTENSIONS[type] ?? ""}`;
      photos.set(imageId, { path, key: imageKey(circleId, imageId) });
      return path;
    },
  };

  const entries: Entry[] = [];
  for (const page of chosenPages) {
    const path = paths.get(`page:${page.id}`)!;
    entries.push({
      path,
      at: page.updatedAt,
      content: pageMarkdown(page, path, context),
      item: { path, title: page.title, circle: circleName(page.keeper), detail: pageDetail(page) },
    });
  }
  for (const proposal of chosenProposals) {
    const path = paths.get(`proposal:${proposal.id}`)!;
    entries.push({
      path,
      at: proposal.updatedAt,
      content: proposalMarkdown(proposal, path, context, (ref) =>
        describe(ref, proposal, pages, documents)
      ),
      item: {
        path,
        title: proposal.title,
        circle: circleName(proposal.circleId),
        detail: `Proposal · ${proposalStatusText(proposal)}`,
      },
    });
  }
  for (const doc of chosenDocs) {
    const path = paths.get(`file:${doc.id}`)!;
    const version = currentVersion(doc);
    const typeLabel = typeLabelFor(doc, types);
    const item = {
      path,
      title: doc.title,
      circle: circleName(doc.circleId),
      detail: fileDetail(doc, typeLabel),
      description: doc.description,
    };
    if (version.link)
      entries.push({
        path,
        at: version.uploadedAt,
        content: linkMarkdown(
          {
            title: doc.title,
            circleId: doc.circleId,
            description: doc.description,
            typeLabel,
            url: version.link.url,
            kindLabel: LINK_LABELS[version.link.kind],
            addedAt: version.uploadedAt,
            addedBy: version.uploadedBy.name,
          },
          texts[doc.id] ?? "",
          context
        ),
        item,
      });
    else
      entries.push({
        path,
        at: version.uploadedAt,
        content: () => readBinaryStream(fileKey(doc.id, version.number)),
        item,
      });
  }
  // The photos the pages and proposals named (all of them converted by now).
  const now = new Date().toISOString();
  for (const photo of Array.from(photos.values()))
    entries.push({ path: photo.path, at: now, content: () => readBinaryStream(photo.key) });

  const today = todayInVermont();
  const name = scope
    ? `${safeName(circleName(scope))} documents ${today}`
    : `CVC documents ${today}`;
  return {
    fileName: `${name}.zip`,
    root: name,
    entries,
    missing,
    counts: {
      pages: chosenPages.length,
      files: chosenDocs.filter((doc) => !currentVersion(doc).link).length,
      links: chosenDocs.filter((doc) => !!currentVersion(doc).link).length,
      proposals: chosenProposals.length,
    },
    bytes,
    exportedBy: actor.name,
  };
}

/** One of a proposal's documents, as its file names it: what it's called, and where it is in the app. */
function describe(
  ref: DocumentRef,
  proposal: Proposal,
  pages: WikiPage[],
  documents: DocumentRecord[]
): { title: string; appPath: string | null } | null {
  const snapshot = snapshotOf(proposal, ref);
  if (ref.kind === "page") {
    const page = pages.find((entry) => entry.id === ref.id);
    if (page) return { title: page.title, appPath: `/wiki/${page.slug}` };
    // One that's gone is named by its snapshot.
    return snapshot ? { title: snapshot.title, appPath: null } : null;
  }
  const doc = documents.find((entry) => entry.id === ref.id);
  if (doc) return { title: doc.title, appPath: `/api/documents/${doc.id}/file` };
  return snapshot ? { title: snapshot.title, appPath: null } : null;
}

function pageDetail(page: WikiPage) {
  const stage = pageStage(page);
  const standing =
    stage === "consented" && page.consent
      ? `consented ${shortDate(page.consent.date, true)}`
      : stage === "proposed"
        ? "proposed"
        : pageConsentState(page) === "changed" && page.consent
          ? `draft, edited since it was consented ${shortDate(page.consent.date, true)}`
          : "draft";
  return `Page · ${standing} · edited ${shortDate(vermontDay(page.updatedAt), true)} by ${
    page.updatedBy.name
  }`;
}

function fileDetail(doc: DocumentRecord, typeLabel: string) {
  const version = currentVersion(doc);
  if (version.link) return `${typeLabel} · a link to a ${LINK_LABELS[version.link.kind]}`;
  const consent = fileConsentState(doc);
  return [
    typeLabel,
    `${extensionOf(version.fileName).slice(1).toUpperCase() || "File"}, ${formatBytes(
      version.size
    )}`,
    `version ${version.number}, ${shortDate(vermontDay(version.uploadedAt), true)} by ${
      version.uploadedBy.name
    }`,
    consent === "consented" && doc.consent
      ? `consented ${shortDate(doc.consent.date, true)}`
      : consent === "changed" && doc.consent
        ? `version ${doc.consent.version} was consented ${shortDate(doc.consent.date, true)}`
        : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A zip entry's date: when it last changed, by the clock in Vermont. */
function zipTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, Number(part.value)])
  );
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/**
 * The zip's bytes, as they're made: each entry read only when its turn
 * comes, and the README last, listing what made it in (a file whose bytes
 * are missing is left out, and said so).
 */
export async function* zipExport(plan: ExportPlan): AsyncGenerator<Uint8Array> {
  const ready: Uint8Array[] = [];
  const state: { failure: Error | null } = { failure: null };
  const zip = new Zip((error, chunk) => {
    if (error) state.failure = error;
    else ready.push(chunk);
  });
  const start = (path: string, at: string, compress: boolean) => {
    const name = `${plan.root}/${path}`;
    const file = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
    file.mtime = zipTime(at);
    zip.add(file);
    return file;
  };
  const included: IndexItem[] = [];
  const missing = [...plan.missing];
  for (const entry of plan.entries) {
    if (typeof entry.content === "string") {
      start(entry.path, entry.at, true).push(strToU8(entry.content), true);
    } else {
      const source = await entry.content();
      if (!source) {
        if (entry.item)
          missing.push(`${entry.item.title} (${entry.item.circle}): its file couldn't be found`);
        continue;
      }
      const file = start(entry.path, entry.at, false);
      for await (const chunk of source) {
        file.push(chunk);
        while (ready.length) yield ready.shift()!;
        if (state.failure) throw state.failure;
      }
      file.push(new Uint8Array(0), true);
    }
    if (entry.item) included.push(entry.item);
    while (ready.length) yield ready.shift()!;
    if (state.failure) throw state.failure;
  }
  const readme = readmeMarkdown({
    heading: plan.root,
    exportedBy: plan.exportedBy,
    exportedAt: new Date().toISOString(),
    siteUrl: siteUrl(),
    items: included,
    missing,
  });
  start("README.md", new Date().toISOString(), true).push(strToU8(readme), true);
  zip.end();
  while (ready.length) yield ready.shift()!;
  if (state.failure) throw state.failure;
}

// --- Exports kept for downloading ------------------------------------------------------------------

export interface ExportRecord {
  id: string;
  userId: string;
  fileName: string;
  size: number;
  createdAt: string;
}

const normalize = (raw: unknown): ExportRecord[] => {
  const exports = (raw as { exports?: unknown } | null)?.exports;
  return Array.isArray(exports) ? (exports as ExportRecord[]) : [];
};

/** Make the zip into storage and keep it a day for `userId` (deleting exports older than that). */
export async function saveExport(
  userId: string,
  plan: ExportPlan,
  bytes: AsyncIterable<Uint8Array> = zipExport(plan)
): Promise<ExportRecord> {
  const id = randomUUID();
  const size = await writeBinaryStream(zipKey(id), bytes, "application/zip");
  const record: ExportRecord = {
    id,
    userId,
    fileName: plan.fileName,
    size,
    createdAt: new Date().toISOString(),
  };
  const cutoff = Date.now() - KEEP_MS;
  const expired = await mutateJson<ExportRecord[]>(INDEX, (raw) => {
    const all = normalize(raw);
    return {
      value: { exports: [...all.filter((entry) => Date.parse(entry.createdAt) >= cutoff), record] },
      result: all.filter((entry) => Date.parse(entry.createdAt) < cutoff),
    };
  });
  await Promise.all(expired.map((entry) => deleteBinary(zipKey(entry.id)).catch(() => undefined)));
  return record;
}

/** An export `userId` made in the last day (and where it's kept); null otherwise. */
export async function findExport(id: string, userId: string) {
  const record = normalize(await readJson(INDEX)).find((entry) => entry.id === id.toLowerCase());
  if (!record || record.userId !== userId) return null;
  if (Date.parse(record.createdAt) < Date.now() - KEEP_MS) return null;
  return { ...record, key: zipKey(record.id) };
}
