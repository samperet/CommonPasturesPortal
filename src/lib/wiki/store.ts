import { randomUUID } from "crypto";
import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";
import { readDirectory } from "@/lib/directory/store";
import { WIKI_LINK, circleNamed, normalizeWikiLinks, type CircleRef } from "./links";
import type { Actor } from "@/lib/auth/actor";
import type { PageConsent, PageProposal } from "./consent";
import { namedPeopleSchema, type NamedPerson } from "@/lib/people";
import { differs } from "@/lib/proposals/mirror";
import {
  canNest,
  childrenOf,
  descendantsOf,
  orderAfterLast,
  orderBetween,
  placeAfter,
} from "./tree";

/**
 * The wiki: one for all of CVC, every page seen by every resident. Each
 * page, written in Markdown, has a keeper — the circle that looks after it —
 * and its own setting for who can edit it (the keeper circle, or anyone).
 * Pages connect by linking to (and embedding) each other, and can sit
 * inside one another, as in Outline: a page's `parentId` names a page of the
 * same circle, `order` its place among its siblings (`tree.ts`), `icon` an
 * emoji shown before its title. A page starts as a `draft` when asked —
 * seen only by its author and admins until it's published (`access.ts`
 * `visiblePages`). A page imported from Outline remembers where it came
 * from (`source`), so old links can be sent to it.
 *
 * All pages' current text is in one document (`wiki/pages.json`); each page's
 * earlier versions (the most recent 25) are in their own
 * (`wiki/history/<pageId>.json`), so they can be looked back on and restored.
 * A page's address (slug) comes from its first title and stays put when it's
 * renamed; renaming updates the links to it.
 *
 * The wiki used to be one per circle (`wiki/<circleId>.json`). The first time
 * it's read, those are brought together here (see `migrate`); the old
 * documents are left as they were.
 */

/** Who wrote a version (stored with it). */
export type WikiAuthor = Pick<Actor, "userId" | "name">;

export interface WikiVersion {
  title: string;
  body: string;
  editedAt: string;
  editedBy: WikiAuthor;
}

/**
 * Who could see a page, from before every page was open to every resident:
 * no longer set, and read only for welcome links (`onboarding/resources.ts`).
 */
export type PageView =
  | { kind: "everyone" }
  | { kind: "keeper" }
  | { kind: "circles"; circles: string[] };
/** Who can edit a page: the keeper circle, or any resident (the Board and admins always can). */
export type PageEdit = { kind: "keeper" } | { kind: "anyone" };
/** Someone present for what a page records (a meeting's notes): a resident, or a guest by name. */
export type PagePerson = NamedPerson;

/** Where an imported page came from: the Outline document it was (`lib/outline`). */
export interface PageSource {
  outline: {
    documentId: string;
    urlId: string;
    url: string;
    collectionId: string;
    /** The collection's short id in Outline's addresses (`/collection/<name>-<urlId>`). */
    collectionUrlId?: string;
    /** Its title in Outline (so a later rename there is noticed). */
    title: string;
    importedAt: string;
  };
}

export interface WikiPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  createdAt: string;
  createdBy: WikiAuthor;
  updatedAt: string;
  updatedBy: WikiAuthor;
  /** The circle that looks after it. */
  keeper: string;
  /** Who could see it once (see `PageView`): kept on pages from then. */
  view?: PageView;
  edit: PageEdit;
  /** How many earlier versions it has kept. */
  historyCount: number;
  /** The parent circle's consent to the page (see `consent.ts`). */
  consent?: PageConsent | null;
  /** Put to the parent circle for consent (see `consent.ts`). */
  proposal?: PageProposal | null;
  /** Who was present (for a meeting's notes), shown under the title; set by its editors. */
  present?: PagePerson[];
  /** For a meeting's notes: the day of the meeting (YYYY-MM-DD). Proposals are consented at meetings. */
  meetingDate?: string | null;
  /** What was said, transcribed while the notes were taken; shown folded away at the end of the page. */
  transcript?: string;
  /** The current version was saved as someone typed (so the next autosave can fold into it). */
  autosaved?: boolean;
  /** Its addresses from when each circle had its own wiki, so old links still arrive. */
  aliases?: { circleId: string; slug: string }[];
  /** Offered as a template for new pages (`lib/wiki/templates.ts`); set by its parent circle. */
  template?: boolean;
  /** The page this one sits inside (one of the same circle's); unset: the circle's top level. */
  parentId?: string | null;
  /** Its place among its siblings (`tree.ts` `orderBetween`); unset until first moved: after the ordered ones, by title. */
  order?: string;
  /** An emoji shown before its title. */
  icon?: string | null;
  /** Not yet published: only its author (`by`, an account id) and admins see it. */
  draft?: { by: string } | null;
  /** Shown as wide as the window, rather than a reading column. */
  fullWidth?: boolean;
  /** Where it was imported from. */
  source?: PageSource | null;
}

export type WikiPageSummary = Pick<
  WikiPage,
  | "id"
  | "slug"
  | "title"
  | "updatedAt"
  | "updatedBy"
  | "keeper"
  | "edit"
  | "consent"
  | "proposal"
  | "meetingDate"
  | "template"
  | "parentId"
  | "order"
  | "icon"
  | "draft"
  | "fullWidth"
> & {
  /** Its opening lines, as plain text (in the page list, for cards). */
  excerpt?: string;
};

const MAX_PAGES = 1000;
const MAX_HISTORY = 25;
const VERSION = 1;
const KEY = "wiki/pages.json";
const historyKey = (pageId: string) => `wiki/history/${pageId}.json`;

const title = z
  .string()
  .trim()
  .min(1, "Give the page a title")
  .max(120, "Titles must be 120 characters or fewer");
const body = z.string().max(50_000, "Pages must be 50,000 characters or fewer");
const circleIdSchema = z.string().min(1).max(80);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-08");
/** An emoji (one symbol, with any modifiers), as a page's icon. */
export const iconSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .refine((value) => /^\p{Extended_Pictographic}/u.test(value), "Choose an emoji");
const orderSchema = z.string().regex(/^[0-9a-z]{1,64}$/, "Not a place in the order");
export const editSchema = z.union([
  z.object({ kind: z.literal("keeper") }),
  z.object({ kind: z.literal("anyone") }),
]);
export const pageInputSchema = z.object({
  title,
  body: body.default(""),
  /** The page it was started from (a link in it): the new page is kept by the same circle, when you can edit that page. */
  from: z.string().max(80).optional(),
  /** The circle that keeps it (otherwise the keeper of the page it was started from, or Community). */
  keeper: circleIdSchema.optional(),
  /** Meeting notes: the day of the meeting, and who was there. */
  meetingDate: isoDate.optional(),
  present: namedPeopleSchema(200).optional(),
  /** Start from a template: a built-in one's key, or a template page's id (`lib/wiki/templates.ts`). */
  template: z.string().max(80).optional(),
  /** The page to start it inside (one its keeper circle keeps). */
  parentId: z.string().max(80).optional(),
  /** Start it as a draft, seen only by you until you publish it. */
  draft: z.boolean().optional(),
  icon: iconSchema.optional(),
});
export const pageUpdateSchema = z
  .object({
    title: title.optional(),
    body: body.optional(),
    /** When the page was last saved as the editor started, so a save can't silently undo someone else's. */
    baseUpdatedAt: z.string().optional(),
    /** Saved as you type: folded into your own recent version rather than adding one to the history each time. */
    autosave: z.boolean().optional(),
    keeper: circleIdSchema.optional(),
    edit: editSchema.optional(),
    /**
     * Withdraw a record of consent, or a proposal, from before proposals were
     * their own (null). New ones are proposals (`/api/proposals`), consented at a meeting.
     */
    consent: z.null().optional(),
    proposal: z.null().optional(),
    /** Meeting notes: the day of the meeting (null: these aren't a meeting's notes). */
    meetingDate: isoDate.nullable().optional(),
    /** Who was present (the whole list; empty to clear it). */
    present: namedPeopleSchema(200).optional(),
    /** The whole transcript (empty to clear it). */
    transcript: z.string().max(200_000, "The transcript is too long").optional(),
    /** Offer it as a template for new pages (its parent circle's choice). */
    template: z.boolean().optional(),
    /** Its emoji (null: none). */
    icon: iconSchema.nullable().optional(),
    fullWidth: z.boolean().optional(),
    /** Where it sits: inside this page (null: the circle's top level), at this place among its siblings. */
    parentId: z.string().max(80).nullable().optional(),
    order: orderSchema.optional(),
    /** Or: right after this sibling (null: first). */
    after: z.string().max(80).nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "Nothing to update"
  );
export const restoreSchema = z.object({ index: z.number().int().min(0) });

export const isSlug = (slug: string) => /^[a-z0-9-]{1,60}$/.test(slug);

export const DEFAULT_EDIT: PageEdit = { kind: "keeper" };

export const pageSummary = (page: WikiPage): WikiPageSummary => ({
  id: page.id,
  slug: page.slug,
  title: page.title,
  updatedAt: page.updatedAt,
  updatedBy: page.updatedBy,
  keeper: page.keeper,
  edit: page.edit,
  ...(page.consent ? { consent: page.consent } : {}),
  ...(page.proposal ? { proposal: page.proposal } : {}),
  ...(page.meetingDate ? { meetingDate: page.meetingDate } : {}),
  ...(page.template ? { template: true } : {}),
  ...(page.parentId ? { parentId: page.parentId } : {}),
  ...(page.order ? { order: page.order } : {}),
  ...(page.icon ? { icon: page.icon } : {}),
  ...(page.draft ? { draft: page.draft } : {}),
  ...(page.fullWidth ? { fullWidth: true } : {}),
});

type Stored = { version: number; pages: WikiPage[] };
function normalize(raw: unknown): Stored | null {
  const value = raw as Partial<Stored> | null;
  if (!value || value.version !== VERSION || !Array.isArray(value.pages)) return null;
  // Pages once had a colour (`color`): dropped as they're read. (`parentId` is back: pages nest again.)
  return {
    version: VERSION,
    pages: value.pages.map((page) =>
      "color" in page
        ? (({ color: _old, ...rest }) => rest as WikiPage)(page as WikiPage & { color?: string })
        : page
    ),
  };
}

/** Every page in full (the first read brings the circles' old wikis together). */
export async function readPages(): Promise<WikiPage[]> {
  const stored = normalize(await readJson(KEY));
  if (stored) return stored.pages;
  return migrate();
}

/** Every page, most recently edited first. */
export async function listPages(): Promise<WikiPageSummary[]> {
  return (await readPages())
    .map(pageSummary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPage(slug: string): Promise<WikiPage | null> {
  return (await readPages()).find((page) => page.slug === slug) ?? null;
}

export async function getPageById(id: string): Promise<WikiPage | null> {
  return (await readPages()).find((page) => page.id === id) ?? null;
}

/** The page that was at a circle's old wiki address. */
export async function pageAtOldAddress(circleId: string, slug: string): Promise<WikiPage | null> {
  return (
    (await readPages()).find(
      (page) => page.aliases?.some((alias) => alias.circleId === circleId && alias.slug === slug)
    ) ?? null
  );
}

/** A page's earlier versions, oldest first. */
export async function getHistory(pageId: string): Promise<WikiVersion[]> {
  const versions = ((await readJson(historyKey(pageId))) as { versions?: unknown } | null)
    ?.versions;
  return Array.isArray(versions) ? (versions as WikiVersion[]) : [];
}

export type Failure = "not_found" | "exists" | "full" | "no_version" | "conflict" | "bad_parent";
export type WikiResult = { ok: true; page: WikiPage | null } | { ok: false; reason: Failure };

/** Change the pages; `archive` is a version to keep in a page's history once the change is saved. */
async function mutate(
  change: (pages: WikiPage[]) =>
    | {
        pages: WikiPage[];
        page: WikiPage | null;
        archive?: { pageId: string; version: WikiVersion };
        /** Anything else the caller wants back (the import's tally). */
        outcome?: unknown;
      }
    | Failure
): Promise<WikiResult & { outcome?: unknown }> {
  await readPages(); // brings the old wikis over first, if that hasn't happened yet
  let archive: { pageId: string; version: WikiVersion } | undefined;
  // Several people can be saving at once (on different servers): a conditional write, retried, keeps everyone's.
  const result = await mutateJson<WikiResult & { outcome?: unknown }>(KEY, (raw) => {
    archive = undefined;
    const stored = normalize(raw) ?? { version: VERSION, pages: [] };
    const next = change(stored.pages);
    if (typeof next === "string") return { write: false, result: { ok: false, reason: next } };
    archive = next.archive;
    return {
      value: { version: VERSION, pages: next.pages },
      result: {
        ok: true,
        page: next.page,
        ...(next.outcome !== undefined ? { outcome: next.outcome } : {}),
      },
    };
  });
  if (result.ok && archive) {
    const { pageId, version } = archive;
    await mutateJson(historyKey(pageId), (raw) => {
      const versions = Array.isArray((raw as { versions?: unknown } | null)?.versions)
        ? (raw as { versions: WikiVersion[] }).versions
        : [];
      return { value: { versions: [...versions, version].slice(-MAX_HISTORY) }, result: null };
    });
  }
  return result;
}

export const slugFor = (text: string, taken: Set<string>) => {
  const base =
    text
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "page";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
};

export function createPage(
  author: WikiAuthor,
  input: {
    title: string;
    body: string;
    keeper: string;
    edit?: PageEdit;
    meetingDate?: string;
    present?: PagePerson[];
    /** Inside this page (which must be the keeper's); it goes last among its siblings. */
    parentId?: string | null;
    icon?: string | null;
    /** A draft: seen only by its author and admins until published. */
    draft?: boolean;
    source?: PageSource;
  }
) {
  return mutate((pages) => {
    if (pages.some((page) => page.title.toLowerCase() === input.title.toLowerCase()))
      return "exists";
    if (pages.length >= MAX_PAGES) return "full";
    const parent = input.parentId ? pages.find((page) => page.id === input.parentId) : null;
    if (input.parentId && (!parent || parent.keeper !== input.keeper)) return "bad_parent";
    const now = new Date().toISOString();
    const by = { userId: author.userId, name: author.name };
    const page: WikiPage = {
      id: randomUUID(),
      slug: slugFor(
        input.title,
        new Set(
          pages.flatMap((entry) => [
            entry.slug,
            ...(entry.aliases ?? []).map((alias) => alias.slug),
          ])
        )
      ),
      title: input.title,
      body: input.body,
      createdAt: now,
      createdBy: by,
      updatedAt: now,
      updatedBy: by,
      keeper: input.keeper,
      edit: input.edit ?? DEFAULT_EDIT,
      historyCount: 0,
      ...(input.meetingDate ? { meetingDate: input.meetingDate } : {}),
      ...(input.present?.length ? { present: input.present } : {}),
      ...(parent ? { parentId: parent.id } : {}),
      order: orderAfterLast(childrenOf(pages, parent?.id ?? null, input.keeper)),
      ...(input.icon ? { icon: input.icon } : {}),
      ...(input.draft ? { draft: { by: author.userId } } : {}),
      ...(input.source ? { source: input.source } : {}),
    };
    return { pages: [...pages, page], page };
  });
}

/**
 * Put a page somewhere else in its circle's tree: inside `parentId` (null:
 * the top level), at `order` among its siblings — or right `after` one of
 * them (null: first), its siblings renumbered if they need to be
 * (`placeAfter`) — or, with neither, last. Never inside itself or one of its
 * own pages, and only inside a page its circle keeps.
 */
export function movePage(
  slug: string,
  move: { parentId?: string | null; order?: string; after?: string | null }
) {
  return mutate((pages) => {
    const page = pages.find((entry) => entry.slug === slug);
    if (!page) return "not_found";
    const parentId = move.parentId === undefined ? page.parentId ?? null : move.parentId;
    const parent = parentId ? pages.find((entry) => entry.id === parentId) : null;
    if (parentId && (!parent || !canNest(pages, page, parent))) return "bad_parent";
    const siblings = childrenOf(pages, parentId, page.keeper).filter(
      (entry) => entry.id !== page.id
    );
    if (move.after !== undefined) {
      const keys = placeAfter(siblings, page, move.after);
      const moved: WikiPage = { ...page, parentId, order: keys.get(page.id) };
      return {
        pages: pages.map((entry) =>
          entry.id === page.id
            ? moved
            : keys.has(entry.id)
              ? { ...entry, order: keys.get(entry.id) }
              : entry
        ),
        page: moved,
      };
    }
    const moved: WikiPage = {
      ...page,
      parentId,
      order: move.order ?? (move.parentId !== undefined ? orderAfterLast(siblings) : page.order),
    };
    if (!moved.order) moved.order = orderAfterLast(siblings);
    return { pages: pages.map((entry) => (entry.id === page.id ? moved : entry)), page: moved };
  });
}

/** Publish a draft: from now on every resident sees it. Already published: left as it is. */
export function publishPage(slug: string) {
  return mutate((pages) => {
    const page = pages.find((entry) => entry.slug === slug);
    if (!page) return "not_found";
    if (!page.draft) return { pages, page };
    const { draft: _draft, ...rest } = page;
    const published: WikiPage = { ...rest, updatedAt: new Date().toISOString() };
    return {
      pages: pages.map((entry) => (entry.id === page.id ? published : entry)),
      page: published,
    };
  });
}

/** How long a run of autosaves by one person stays one version. */
const AUTOSAVE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Save a new version of a page (keeping the one it replaces in its history).
 * An autosave over a version from the last few minutes — the same person's,
 * or another autosave — replaces it instead, so a session of typing (alone
 * or together) is one version, not dozens.
 */
function withVersion(
  page: WikiPage,
  editor: WikiAuthor,
  next: { title: string; body: string },
  autosave = false
): { page: WikiPage; archive?: WikiVersion } {
  const by = { userId: editor.userId, name: editor.name };
  const recent = Date.now() - Date.parse(page.updatedAt) < AUTOSAVE_WINDOW_MS;
  // Co-editing: everyone's autosaves in one session make one version.
  if (
    autosave &&
    recent &&
    (page.updatedBy.userId === editor.userId || page.autosaved) &&
    page.historyCount
  ) {
    return {
      page: {
        ...page,
        ...next,
        updatedAt: new Date().toISOString(),
        updatedBy: by,
        autosaved: true,
      },
    };
  }
  const { autosaved: _autosaved, ...rest } = page;
  const archive: WikiVersion = {
    title: page.title,
    body: page.body,
    editedAt: page.updatedAt,
    editedBy: page.updatedBy,
  };
  return {
    page: {
      ...rest,
      ...next,
      updatedAt: new Date().toISOString(),
      updatedBy: by,
      historyCount: Math.min(MAX_HISTORY, page.historyCount + 1),
      ...(autosave ? { autosaved: true } : {}),
    },
    archive,
  };
}

/** Links (`[[Old]]`, `[[Circle:Old|shown]]`) and embeds (`page="Old"`) of a renamed page, pointed at its new title. */
export function renameLinks(markdown: string, from: string, to: string) {
  const wanted = from.trim().toLowerCase();
  const strip = (target: string) =>
    target
      .slice(target.indexOf(":") + 1)
      .trim()
      .toLowerCase();
  return normalizeWikiLinks(markdown)
    .replace(WIKI_LINK, (match, target: string, label?: string) => {
      if (/^\s*doc\s*:/i.test(target)) return match;
      const plain = target.trim().toLowerCase();
      return plain === wanted || strip(target) === wanted
        ? `[[${to}${label ? `|${label}` : ""}]]`
        : match;
    })
    .replace(
      /^([ \t]*::embed\{[^}\n]*?page=")([^"\n]*)("[^}\n]*\}[ \t]*)$/gm,
      (match, before: string, page: string, after: string) =>
        page.trim().toLowerCase() === wanted || strip(page) === wanted
          ? `${before}${to}${after}`
          : match
    );
}

type PageUpdate = {
  title?: string;
  body?: string;
  baseUpdatedAt?: string;
  autosave?: boolean;
  keeper?: string;
  edit?: PageEdit;
  consent?: null;
  proposal?: null;
  present?: PagePerson[];
  meetingDate?: string | null;
  transcript?: string;
  template?: boolean;
  icon?: string | null;
  fullWidth?: boolean;
};

export function updatePage(slug: string, editor: WikiAuthor, update: PageUpdate) {
  return mutate((found) => {
    let pages = found;
    let page = pages.find((entry) => entry.slug === slug);
    if (!page) return "not_found";
    if (update.baseUpdatedAt && update.baseUpdatedAt !== page.updatedAt) return "conflict";
    // Its keeper, who can edit it, whether it's a template, its stage, who was present, and the
    // transcript aren't new versions.
    const settings: Partial<WikiPage> = {
      ...(update.present ? { present: update.present } : {}),
      ...(update.meetingDate !== undefined ? { meetingDate: update.meetingDate } : {}),
      ...(update.transcript !== undefined ? { transcript: update.transcript } : {}),
      ...(update.keeper ? { keeper: update.keeper } : {}),
      ...(update.edit ? { edit: update.edit } : {}),
      ...(update.template !== undefined ? { template: update.template } : {}),
      ...(update.consent === null ? { consent: null } : {}),
      ...(update.proposal === null ? { proposal: null } : {}),
      ...(update.icon !== undefined ? { icon: update.icon } : {}),
      ...(update.fullWidth !== undefined ? { fullWidth: update.fullWidth } : {}),
    };
    page = { ...page, ...settings };
    const current = page;
    // A new keeper takes the pages inside it along, and lifts the page to the new circle's top level.
    const moving =
      update.keeper && update.keeper !== found.find((entry) => entry.id === current.id)?.keeper;
    const branch = moving
      ? new Set(descendantsOf(found, current.id).map((entry) => entry.id))
      : null;
    pages = pages.map((entry) =>
      entry.id === current.id
        ? moving
          ? { ...current, parentId: null }
          : current
        : branch?.has(entry.id)
          ? { ...entry, keeper: update.keeper! }
          : entry
    );
    if (moving) page = { ...current, parentId: null };
    const next = { title: update.title ?? page.title, body: update.body ?? page.body };
    const renamed = next.title !== page.title;
    if (
      renamed &&
      next.title.toLowerCase() !== page.title.toLowerCase() &&
      pages.some(
        (entry) => entry.id !== current.id && entry.title.toLowerCase() === next.title.toLowerCase()
      )
    ) {
      return "exists";
    }
    if (!renamed && next.body === page.body) return { pages, page };
    const { page: updated, archive } = withVersion(page, editor, next, update.autosave);
    pages = pages.map((entry) => (entry.id === updated.id ? updated : entry));
    // A new title: the links to it follow.
    if (renamed)
      pages = pages.map((entry) =>
        entry.id === updated.id
          ? entry
          : { ...entry, body: renameLinks(entry.body, current.title, next.title) }
      );
    return {
      pages,
      page: updated,
      ...(archive ? { archive: { pageId: updated.id, version: archive } } : {}),
    };
  });
}

/** Bring back an earlier version (the current one goes into the history, so this can be undone too). */
export async function restoreVersion(slug: string, editor: WikiAuthor, index: number) {
  const page = await getPage(slug);
  if (!page) return { ok: false, reason: "not_found" } as const;
  const version = (await getHistory(page.id))[index];
  if (!version) return { ok: false, reason: "no_version" } as const;
  return updatePage(slug, editor, { title: version.title, body: version.body });
}

/**
 * Put a page back (from the trash): under its own title and address — or,
 * if another page has taken them meanwhile, as "Title (restored)" at a new
 * address. Already back (a delete that didn't finish): left as it is.
 */
export function reinsertPage(page: WikiPage) {
  return mutate((pages) => {
    const live = pages.find((entry) => entry.id === page.id);
    if (live) return { pages, page: live };
    if (pages.length >= MAX_PAGES) return "full";
    const titles = new Set(pages.map((entry) => entry.title.toLowerCase()));
    let title = page.title;
    for (let n = 1; titles.has(title.toLowerCase()); n++)
      title = `${page.title.slice(0, 100)} (restored${n > 1 ? ` ${n}` : ""})`;
    const taken = new Set(
      pages.flatMap((entry) => [entry.slug, ...(entry.aliases ?? []).map((alias) => alias.slug)])
    );
    const restored: WikiPage = {
      ...page,
      title,
      slug: taken.has(page.slug) ? slugFor(title, taken) : page.slug,
      ...(page.aliases ? { aliases: page.aliases.filter((alias) => !taken.has(alias.slug)) } : {}),
    };
    return { pages: [...pages, restored], page: restored };
  });
}

export function deletePage(slug: string) {
  return mutate((pages) => {
    const page = pages.find((entry) => entry.slug === slug);
    if (!page) return "not_found";
    return { pages: pages.filter((entry) => entry.id !== page.id), page: null };
  });
}

/**
 * Copy where proposals stand onto the pages they're about (`decide` says
 * what each page should show; see `lib/proposals/mirror.ts`). Not a new
 * version; pages that already show it aren't rewritten.
 */
export async function setPageDecisions(
  pageIds: string[],
  decide: (page: WikiPage) => Pick<WikiPage, "proposal" | "consent">
) {
  const wanted = new Set(pageIds);
  const stale = (page: WikiPage) => {
    if (!wanted.has(page.id)) return null;
    const next = decide(page);
    return differs(page.proposal, next.proposal) || differs(page.consent, next.consent)
      ? next
      : null;
  };
  if (!(await readPages()).some(stale)) return;
  await mutate((pages) => ({
    page: null,
    pages: pages.map((page) => {
      const next = stale(page);
      return next ? { ...page, proposal: next.proposal, consent: next.consent } : page;
    }),
  }));
}

/** A page as the Outline import hands it over (`lib/outline/import.ts`). */
export interface ImportedPageInput {
  source: PageSource;
  title: string;
  body: string;
  keeper: string;
  /** The Outline id of the document it sits inside (in this batch, or imported before), null for the top level — or undefined to leave a page where it is. */
  parentOutlineId: string | null | undefined;
  /** Its place among its siblings in Outline, from 0 — or undefined to leave a page where it is. */
  index: number | undefined;
  icon: string | null;
  createdAt: string;
  createdBy: WikiAuthor;
  updatedAt: string;
  updatedBy: WikiAuthor;
  template: boolean;
}

export interface ImportOutcome {
  created: number;
  updated: number;
  unchanged: number;
  /** Each Outline document's page id. */
  pageIds: Record<string, string>;
  /** Titles that had to change because another page had them. */
  renamed: { outlineTitle: string; title: string }[];
}

/**
 * Bring pages over from Outline, or bring them up to date: a page is found
 * by the Outline document it came from (`source`), else made. Titles must be
 * unique here (links are by title), so a clash gets a suffix; a page's
 * own earlier suffix stays unless Outline renamed it. Each page sits where
 * Outline's tree puts it (`parentOutlineId`, `index` → `order`), with
 * Outline's dates and authors. Not versions: the import replaces the text.
 */
export function importPages(
  entries: ImportedPageInput[]
): Promise<{ ok: true; outcome: ImportOutcome } | { ok: false; reason: Failure }> {
  return mutate((pages) => {
    const byOutline = new Map(
      pages
        .filter((page) => page.source?.outline)
        .map((page) => [page.source!.outline.documentId, page] as const)
    );
    if (
      pages.length +
        entries.filter((entry) => !byOutline.has(entry.source.outline.documentId)).length >
      MAX_PAGES
    )
      return "full";
    const titles = new Map(pages.map((page) => [page.title.toLowerCase(), page.id]));
    const taken = new Set(
      pages.flatMap((entry) => [entry.slug, ...(entry.aliases ?? []).map((alias) => alias.slug)])
    );
    const outcome: ImportOutcome = {
      created: 0,
      updated: 0,
      unchanged: 0,
      pageIds: {},
      renamed: [],
    };
    const ids = new Map<string, string>(); // Outline document → page id (existing or new)
    for (const entry of entries)
      ids.set(
        entry.source.outline.documentId,
        byOutline.get(entry.source.outline.documentId)?.id ?? randomUUID()
      );
    const free = (title: string, pageId: string) => {
      const owner = titles.get(title.toLowerCase());
      return !owner || owner === pageId;
    };
    let next = pages;
    const renamedLinks: { from: string; to: string }[] = [];
    // Order keys by position: the same for the same position, run after run.
    const keys: string[] = [];
    const keyFor = (index: number) => {
      while (keys.length <= index)
        keys.push(keys.length ? orderBetween(keys[keys.length - 1]) : orderBetween());
      return keys[index];
    };
    for (const entry of entries) {
      const outlineId = entry.source.outline.documentId;
      const id = ids.get(outlineId)!;
      const existing = byOutline.get(outlineId);
      // Its title: Outline's, unless another page has it (then a suffix); a page keeps its earlier suffix.
      let title = entry.title;
      if (existing && existing.source?.outline.title === entry.title && !free(title, id))
        title = existing.title;
      if (!free(title, id)) {
        const circleName = entry.source.outline.collectionId;
        for (const candidate of [
          `${entry.title} (from the wiki)`,
          ...Array.from({ length: 50 }, (_, n) => `${entry.title} (${n + 2})`),
        ]) {
          if (free(candidate, id)) {
            title = candidate;
            break;
          }
        }
        void circleName;
        if (!free(title, id)) return "exists";
        outcome.renamed.push({ outlineTitle: entry.title, title });
      }
      titles.set(title.toLowerCase(), id);
      const parentId =
        entry.parentOutlineId === undefined
          ? existing?.parentId ?? null
          : entry.parentOutlineId
            ? ids.get(entry.parentOutlineId) ?? byOutline.get(entry.parentOutlineId)?.id ?? null
            : null;
      const order = entry.index === undefined ? existing?.order ?? keyFor(0) : keyFor(entry.index);
      if (existing) {
        const updated: WikiPage = {
          ...existing,
          title,
          body: entry.body,
          keeper: entry.keeper,
          parentId,
          order,
          icon: entry.icon,
          updatedAt: entry.updatedAt,
          updatedBy: entry.updatedBy,
          source: entry.source,
          ...(entry.template ? { template: true } : {}),
        };
        if (!entry.template) delete updated.template;
        const changed =
          existing.title !== title ||
          existing.body !== entry.body ||
          existing.keeper !== entry.keeper ||
          (existing.parentId ?? null) !== parentId ||
          existing.order !== order ||
          (existing.icon ?? null) !== (entry.icon ?? null) ||
          !!existing.template !== entry.template ||
          existing.updatedAt !== entry.updatedAt;
        if (changed) {
          if (existing.title !== title) renamedLinks.push({ from: existing.title, to: title });
          next = next.map((page) => (page.id === id ? updated : page));
          outcome.updated++;
        } else outcome.unchanged++;
      } else {
        const slug = slugFor(title, taken);
        taken.add(slug);
        const page: WikiPage = {
          id,
          slug,
          title,
          body: entry.body,
          createdAt: entry.createdAt,
          createdBy: entry.createdBy,
          updatedAt: entry.updatedAt,
          updatedBy: entry.updatedBy,
          keeper: entry.keeper,
          edit: DEFAULT_EDIT,
          historyCount: 0,
          parentId,
          order,
          ...(entry.icon ? { icon: entry.icon } : {}),
          ...(entry.template ? { template: true } : {}),
          source: entry.source,
        };
        next = [...next, page];
        outcome.created++;
      }
      outcome.pageIds[outlineId] = id;
    }
    // Pages renamed here: the links to them follow.
    for (const { from, to } of renamedLinks)
      next = next.map((page) => ({ ...page, body: renameLinks(page.body, from, to) }));
    return { pages: next, page: null, outcome };
  }).then((result) =>
    result.ok ? { ok: true, outcome: (result as { outcome?: ImportOutcome }).outcome! } : result
  );
}

/** The pages inside `pageId`, at any depth (the branch that goes with it to the trash). */
export async function branchOf(pageId: string): Promise<WikiPage[]> {
  return descendantsOf(await readPages(), pageId);
}

/** When a circle is deleted, the Board keeps its pages (as with its documents). */
export function handOverPages(fromCircleId: string, toCircleId: string) {
  return mutate((pages) => ({
    page: null,
    pages: pages.map((page) =>
      page.keeper === fromCircleId ? { ...page, keeper: toCircleId } : page
    ),
  }));
}

// --- Bringing the circles' old wikis together ---------------------------------

/** A page in a circle's old wiki. */
interface OldPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  createdAt: string;
  createdBy: WikiAuthor;
  updatedAt: string;
  updatedBy: WikiAuthor;
  history?: WikiVersion[];
  parentId?: string;
  autosaved?: boolean;
}

/** Pages renamed as they come over (by circle, then old title, lower case). */
const RENAMES: Record<string, Record<string, string>> = { om: { yurt: "Yurt maintenance" } };

/** Write a document only if it isn't there yet (so a second server doing the same never overwrites newer data). */
const createOnce = (key: string, value: unknown) =>
  mutateJson(key, (current) =>
    current ? { write: false, result: null } : { value, result: null }
  );

/**
 * Bring every circle's old wiki into the one wiki: each page kept by its old
 * circle, seen by everyone, edited by its circle (as before). Titles stay
 * unique (a clash takes its circle's name), addresses too (a clash takes its
 * circle's id), and the old addresses are kept for redirects. Links and
 * embeds in the pages lose their circle prefixes, following any renames.
 * Comments go page by page (`wiki/comments/<pageId>.json`) and polls into one
 * document (`wiki/polls.json`). Earlier versions go to the history documents.
 */
async function migrate(): Promise<WikiPage[]> {
  const circles: CircleRef[] =
    (await readDirectory())?.circles.map((circle) => ({
      id: circle.id,
      name: circle.name,
      code: circle.code ?? undefined,
    })) ?? [];
  const old = await Promise.all(
    circles.map(async (circle) => {
      const raw = (await readJson(`wiki/${circle.id}.json`)) as { pages?: OldPage[] } | null;
      return { circle, pages: Array.isArray(raw?.pages) ? raw!.pages : [] };
    })
  );

  // New titles and addresses, first come first served (circles in directory order).
  const titles = new Set<string>();
  const slugs = new Set<string>();
  const titleFor = new Map<string, string>(); // `${circleId}|${old title, lower case}` → new title
  const placed: { circle: CircleRef; page: OldPage; title: string; slug: string }[] = [];
  for (const { circle, pages } of old) {
    for (const page of [...pages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      let newTitle = RENAMES[circle.id]?.[page.title.toLowerCase()] ?? page.title;
      if (titles.has(newTitle.toLowerCase())) newTitle = `${newTitle} (${circle.name})`;
      for (let n = 2; titles.has(newTitle.toLowerCase()); n++)
        newTitle = `${page.title} (${circle.name} ${n})`;
      titles.add(newTitle.toLowerCase());
      titleFor.set(`${circle.id}|${page.title.toLowerCase()}`, newTitle);
      let slug =
        newTitle !== page.title && RENAMES[circle.id]?.[page.title.toLowerCase()]
          ? slugFor(newTitle, slugs)
          : page.slug;
      if (slugs.has(slug)) slug = slugFor(`${page.slug}-${circle.id}`, slugs);
      slugs.add(slug);
      placed.push({ circle, page, title: newTitle, slug });
    }
  }

  // Links and embeds name pages by title alone now.
  // (Read as they were: a bare title meant the page's own circle's wiki.)
  const retitle = (target: string, circleId: string) => {
    if (/^\s*doc\s*:/i.test(target)) return null;
    let owner = circleId;
    let wanted = target.trim();
    const colon = target.indexOf(":");
    const named = colon > 0 ? circleNamed(target.slice(0, colon), circles) : undefined;
    if (named && target.slice(colon + 1).trim()) {
      owner = named.id;
      wanted = target.slice(colon + 1).trim();
    }
    return titleFor.get(`${owner}|${wanted.toLowerCase()}`) ?? wanted;
  };
  const rewrite = (markdown: string, circleId: string) =>
    normalizeWikiLinks(markdown)
      .replace(WIKI_LINK, (match, target: string, label?: string) => {
        const next = retitle(target, circleId);
        return next ? `[[${next}${label ? `|${label}` : ""}]]` : match;
      })
      .replace(
        /^([ \t]*::embed\{[^}\n]*?page=")([^"\n]*)("[^}\n]*\}[ \t]*)$/gm,
        (match, before: string, page: string, after: string) => {
          const next = retitle(page, circleId);
          return next ? `${before}${next.replace(/"/g, "")}${after}` : match;
        }
      );

  const pages: WikiPage[] = placed.map(({ circle, page, title: newTitle, slug }) => ({
    id: page.id,
    slug,
    title: newTitle,
    body: rewrite(page.body, circle.id),
    createdAt: page.createdAt,
    createdBy: page.createdBy,
    updatedAt: page.updatedAt,
    updatedBy: page.updatedBy,
    keeper: circle.id,
    edit: DEFAULT_EDIT,
    historyCount: Math.min(MAX_HISTORY, page.history?.length ?? 0),
    ...(page.autosaved ? { autosaved: true } : {}),
    aliases: [{ circleId: circle.id, slug: page.slug }],
  }));

  // Earlier versions, comments, and polls go first; the pages document last, as the sign it's done.
  for (const { page } of placed)
    if (page.history?.length)
      await createOnce(historyKey(page.id), { versions: page.history.slice(-MAX_HISTORY) });
  const ids = new Set(pages.map((page) => page.id));
  const comments = new Map<string, unknown[]>();
  const polls: unknown[] = [];
  for (const { circle } of old) {
    const circleComments =
      (
        (await readJson(`wiki-comments/${circle.id}.json`)) as {
          comments?: { pageId: string }[];
        } | null
      )?.comments ?? [];
    for (const comment of circleComments)
      if (ids.has(comment.pageId))
        comments.set(comment.pageId, [...(comments.get(comment.pageId) ?? []), comment]);
    const circlePolls =
      ((await readJson(`wiki-polls/${circle.id}.json`)) as { polls?: object[] } | null)?.polls ??
      [];
    polls.push(...circlePolls.map((poll) => ({ ...poll, circleId: circle.id })));
  }
  for (const [pageId, list] of Array.from(comments.entries()))
    await createOnce(`wiki/comments/${pageId}.json`, { comments: list });
  await createOnce("wiki/polls.json", { polls });
  return mutateJson<WikiPage[]>(KEY, (current) => {
    const stored = normalize(current);
    return stored
      ? { write: false, result: stored.pages }
      : { value: { version: VERSION, pages }, result: pages };
  });
}
