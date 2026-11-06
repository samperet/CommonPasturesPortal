import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, mutateJson, readJson } from "@/lib/storage";
import type { Actor } from "@/lib/auth/actor";
import { mergeText, type MergeConflict } from "./merge";
import type { WikiPage } from "./store";
import {
  MAX_NAME,
  MAX_OPEN,
  isLive,
  type Perspective,
  type PerspectivePerson,
} from "./perspectives-shared";

/**
 * Alternative versions of a page (`perspectives-shared.ts`), each page's in
 * `wiki/perspectives/<pageId>.json`. Writing them was removed from the app in
 * November 2026 (no routes start, change, share or adopt one any more); what
 * remains serves proposals that already put versions forward — their
 * snapshots, the meeting's choice, consent — and clearing a deleted page's.
 * As it worked: anyone started one, as a copy of the page;
 * only its author (or an admin) changes it, saving against its own last
 * save so one device can't undo another's. When the page has moved on, its
 * author can bring the page's changes in (a three-way merge from the text it
 * started from; where both changed the same passage, theirs stays and the
 * clash is reported). A page keeps up to `MAX_OPEN` open versions and, in
 * all, the most recent `MAX_KEPT` (the oldest closed ones go first).
 */

const MAX_KEPT = 60;
const MAX_BODY = 50_000;
const key = (pageId: string) => `wiki/perspectives/${pageId}.json`;

export type Failure = "not_found" | "forbidden" | "closed" | "conflict" | "full";
type Result<T> = { ok: true; value: T } | { ok: false; reason: Failure };

/** Who's acting: their account, entry, name, and whether they're an admin. */
type Editor = Pick<Actor, "userId" | "personId" | "name" | "admin">;

const name = z
  .string()
  .trim()
  .min(1, "Name your version")
  .max(MAX_NAME, `Names must be ${MAX_NAME} characters or fewer`);
export const startSchema = z.object({ name });
export const saveSchema = z
  .object({
    name: name.optional(),
    body: z.string().max(MAX_BODY, "Pages must be 50,000 characters or fewer").optional(),
    /** Its `updatedAt` as the editor last had it. */
    baseUpdatedAt: z.string(),
  })
  .refine((value) => value.name !== undefined || value.body !== undefined, "Nothing to save");

function normalize(raw: unknown): Perspective[] {
  const list = (raw as { perspectives?: unknown } | null)?.perspectives;
  return Array.isArray(list) ? (list as Perspective[]) : [];
}

const person = (editor: Editor): PerspectivePerson => ({
  userId: editor.userId,
  personId: editor.personId,
  name: editor.name,
});

export const isAuthor = (perspective: Perspective, editor: Pick<Editor, "userId" | "admin">) =>
  editor.admin || perspective.createdBy.userId === editor.userId;

export async function listPerspectives(pageId: string) {
  return normalize(await readJson(key(pageId)));
}

export async function getPerspective(pageId: string, id: string) {
  return (await listPerspectives(pageId)).find((perspective) => perspective.id === id) ?? null;
}

function change<T>(
  pageId: string,
  decide: (list: Perspective[]) => { list: Perspective[]; value: T } | Failure
): Promise<Result<T>> {
  return mutateJson<Result<T>>(key(pageId), (raw) => {
    const next = decide(normalize(raw));
    if (typeof next === "string") return { write: false, result: { ok: false, reason: next } };
    return { value: { perspectives: next.list }, result: { ok: true, value: next.value } };
  });
}

/** Keep the most recent `MAX_KEPT`, the oldest closed ones going first. */
function trimmed(list: Perspective[]) {
  if (list.length <= MAX_KEPT) return list;
  const closed = list
    .filter((perspective) => !isLive(perspective))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, list.length - MAX_KEPT)
    .map((perspective) => perspective.id);
  return list.filter((perspective) => !closed.includes(perspective.id));
}

/** Start a version of a page: a copy of it as it is now. */
export function startPerspective(
  page: Pick<WikiPage, "id" | "body" | "updatedAt">,
  editor: Editor,
  input: { name: string },
  now = new Date()
) {
  return change<Perspective>(page.id, (list) => {
    if (list.filter(isLive).length >= MAX_OPEN) return "full";
    const at = now.toISOString();
    const perspective: Perspective = {
      id: randomUUID(),
      pageId: page.id,
      name: input.name,
      body: page.body,
      base: { updatedAt: page.updatedAt, body: page.body },
      createdBy: person(editor),
      createdAt: at,
      updatedBy: person(editor),
      updatedAt: at,
      status: "open",
    };
    return { list: trimmed([...list, perspective]), value: perspective };
  });
}

/** Change one of yours (refused if it's been saved since you last had it). */
function edit(
  pageId: string,
  id: string,
  editor: Editor,
  apply: (perspective: Perspective) => Perspective | Failure,
  options: { live?: boolean; baseUpdatedAt?: string } = { live: true }
) {
  return change<Perspective>(pageId, (list) => {
    const perspective = list.find((entry) => entry.id === id);
    if (!perspective) return "not_found";
    if (!isAuthor(perspective, editor)) return "forbidden";
    if (options.live !== false && !isLive(perspective)) return "closed";
    if (options.baseUpdatedAt && options.baseUpdatedAt !== perspective.updatedAt) return "conflict";
    const next = apply(perspective);
    if (typeof next === "string") return next;
    return { list: list.map((entry) => (entry.id === id ? next : entry)), value: next };
  });
}

export function savePerspective(
  pageId: string,
  id: string,
  editor: Editor,
  input: { name?: string; body?: string; baseUpdatedAt: string },
  now = new Date()
) {
  return edit(
    pageId,
    id,
    editor,
    (perspective) => ({
      ...perspective,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      updatedBy: person(editor),
      updatedAt: now.toISOString(),
    }),
    { live: true, baseUpdatedAt: input.baseUpdatedAt }
  );
}

/** The version with the page's changes since it started brought in (for showing, or saving). */
export function caughtUp(perspective: Perspective, page: Pick<WikiPage, "body">) {
  return mergeText(perspective.base.body, perspective.body, page.body);
}

/** Bring the page's changes into one of yours: the merged text, and where it clashed. */
export async function catchUp(
  pageId: string,
  id: string,
  editor: Editor,
  page: Pick<WikiPage, "body" | "updatedAt">,
  now = new Date()
): Promise<Result<{ perspective: Perspective; conflicts: MergeConflict[] }>> {
  let conflicts: MergeConflict[] = [];
  const result = await edit(pageId, id, editor, (perspective) => {
    const merged = caughtUp(perspective, page);
    conflicts = merged.conflicts;
    return {
      ...perspective,
      body: merged.text,
      base: { updatedAt: page.updatedAt, body: page.body },
      updatedBy: person(editor),
      updatedAt: now.toISOString(),
    };
  });
  return result.ok ? { ok: true, value: { perspective: result.value, conflicts } } : result;
}

/** Share one of yours with the page's circle (once): whether it's newly shared. */
export async function sharePerspective(
  pageId: string,
  id: string,
  editor: Editor,
  now = new Date()
) {
  let fresh = false;
  const result = await edit(pageId, id, editor, (perspective) => {
    fresh = !perspective.sharedAt;
    return fresh ? { ...perspective, sharedAt: now.toISOString() } : perspective;
  });
  return result.ok ? { ok: true as const, value: { perspective: result.value, fresh } } : result;
}

export function withdrawPerspective(pageId: string, id: string, editor: Editor, now = new Date()) {
  return edit(pageId, id, editor, (perspective) => ({
    ...perspective,
    status: "withdrawn",
    updatedAt: now.toISOString(),
  }));
}

/** Record what became of a version (adopted, or set aside) — or clear it (`null`). */
export function setOutcome(pageId: string, id: string, outcome: Perspective["outcome"]) {
  return change<Perspective>(pageId, (list) => {
    const perspective = list.find((entry) => entry.id === id);
    if (!perspective) return "not_found";
    const next = { ...perspective, outcome };
    return { list: list.map((entry) => (entry.id === id ? next : entry)), value: next };
  });
}

/** A page is deleted: its versions go too. */
export const deletePerspectives = (pageId: string) => deleteJson(key(pageId));
