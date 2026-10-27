import { z } from "zod";
import { deleteJson, mutateJson, readJson } from "@/lib/storage";
import {
  addComment as addToList,
  deleteComment as deleteFromList,
  editComment as editInList,
  type CommentActor,
  type CommentChange,
  type CommentFailure,
} from "@/lib/comments/store";
import { normalizeComment, type CommentRecord } from "@/lib/comments/shared";

/**
 * Comments on wiki pages: each thread on the whole page, or on a passage
 * someone selected (its `quote`, any length, highlighted on the page). A
 * comment and its replies make a thread (one level), which can be resolved
 * (and reopened). Stored page by page (`wiki/comments/<pageId>.json`),
 * following the shared comment rules (`lib/comments/store.ts`); admins
 * moderate.
 */

export type WikiComment = CommentRecord & {
  pageId: string;
  /** The passage it's about (thread starts only). */
  quote: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
};

const MAX_COMMENTS = 1000;

export const commentInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a comment")
    .max(2000, "Comments must be 2000 characters or fewer"),
  /** The passage a new thread is on, as long as the page (a word, or the whole thing); none for the page as a whole. */
  quote: z
    .string()
    .trim()
    .max(50_000)
    .nullable()
    .optional()
    .transform((value) => value || null),
  parentId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});
export const commentUpdateSchema = z.union([
  z.object({
    body: z
      .string()
      .trim()
      .min(1, "Write a comment")
      .max(2000, "Comments must be 2000 characters or fewer"),
  }),
  z.object({ resolved: z.boolean() }),
]);

const key = (pageId: string) => `wiki/comments/${pageId}.json`;

function normalize(raw: unknown): WikiComment[] {
  const comments = (raw as { comments?: unknown } | null)?.comments;
  return Array.isArray(comments) ? (comments as WikiComment[]).map(normalizeComment) : [];
}

/** A page's comments, oldest first. */
export async function listComments(pageId: string): Promise<WikiComment[]> {
  return normalize(await readJson(key(pageId))).filter((comment) => comment.pageId === pageId);
}

export type Failure = CommentFailure;
export type CommentResult =
  | { ok: true; comment: WikiComment | null; thread: WikiComment[] }
  | { ok: false; reason: Failure };

/** Apply a change; the result carries the thread the changed comment is in (for telling its people). */
function mutate(
  pageId: string,
  change: (comments: WikiComment[]) => CommentChange<WikiComment> | Failure,
  threadOf: (change: CommentChange<WikiComment>, before: WikiComment[]) => string | null
): Promise<CommentResult> {
  return mutateJson<CommentResult>(key(pageId), (raw) => {
    const before = normalize(raw);
    const result = change(before);
    if (typeof result === "string") return { write: false, result: { ok: false, reason: result } };
    const rootId = threadOf(result, before);
    const thread = rootId
      ? result.comments.filter((entry) => entry.id === rootId || entry.parentId === rootId)
      : [];
    return {
      value: { comments: result.comments },
      result: { ok: true, comment: result.comment, thread },
    };
  });
}

const onPage = (pageId: string) => ({
  nesting: "one" as const,
  max: MAX_COMMENTS,
  among: (comment: WikiComment) => comment.pageId === pageId,
});
const rootOf = (comment: WikiComment) => comment.parentId ?? comment.id;

export function addComment(
  pageId: string,
  author: Pick<CommentActor, "userId" | "personId" | "name">,
  input: { body: string; quote: string | null; parentId: string | null }
) {
  return mutate(
    pageId,
    (comments) =>
      addToList(comments, author, input, onPage(pageId), {
        pageId,
        quote: input.parentId ? null : input.quote,
      }),
    (change) => rootOf(change.comment!)
  );
}

/**
 * Comments brought over from Outline (`lib/outline/import.ts`), with ids
 * of their own (`outline:<id>`): any already there with the same id are
 * replaced, the page's other comments kept. How many the page then has.
 */
export async function importComments(pageId: string, imported: WikiComment[]) {
  const ids = new Set(imported.map((comment) => comment.id));
  return mutateJson<number>(key(pageId), (raw) => {
    const before = normalize(raw).filter((comment) => comment.pageId === pageId);
    const kept = before.filter((comment) => !ids.has(comment.id));
    const comments = [...kept, ...imported]
      .slice(0, MAX_COMMENTS)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const same =
      comments.length === before.length &&
      comments.every((comment, index) => JSON.stringify(comment) === JSON.stringify(before[index]));
    return same
      ? { write: false, result: before.length }
      : { value: { comments }, result: comments.length };
  });
}

/** Change what you wrote (admins can change any). */
export function editComment(pageId: string, commentId: string, actor: CommentActor, body: string) {
  return mutate(
    pageId,
    (comments) => editInList(comments, commentId, actor, body, onPage(pageId)),
    (change) => rootOf(change.comment!)
  );
}

/** Resolve or reopen a thread: whoever started it, the page's editors, or an admin. */
export function setResolved(
  pageId: string,
  commentId: string,
  actor: CommentActor,
  resolved: boolean
) {
  return mutate(
    pageId,
    (comments) => {
      const root = comments.find(
        (entry) => entry.id === commentId && entry.pageId === pageId && entry.parentId === null
      );
      if (!root) return "not_found";
      if (!actor.canModerate && root.authorId !== actor.userId) return "forbidden";
      const updated = {
        ...root,
        resolvedAt: resolved ? new Date().toISOString() : null,
        resolvedBy: resolved ? actor.name : null,
      };
      return {
        comments: comments.map((entry) => (entry.id === commentId ? updated : entry)),
        comment: updated,
      };
    },
    () => commentId
  );
}

/** Delete a comment (its author or an admin); one with replies stays as a placeholder. */
export function deleteComment(pageId: string, commentId: string, actor: CommentActor) {
  return mutate(
    pageId,
    (comments) => deleteFromList(comments, commentId, actor, onPage(pageId)),
    (_change, before) => {
      const removed = before.find((entry) => entry.id === commentId);
      return removed ? rootOf(removed) : null;
    }
  );
}

/** Remove a page's comments (when the page is deleted). */
export function deletePageComments(pageId: string) {
  return deleteJson(key(pageId));
}
