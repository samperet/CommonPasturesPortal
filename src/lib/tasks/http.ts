import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { anyoneAddsTasks, featureEnabled } from "@/lib/circles/features";
import { canUploadTo } from "@/lib/documents/access";
import { problem } from "@/lib/http";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { Failure } from "./store";
import type { Failure as CommentFailure } from "./comments";
import type { Task } from "./shared";
import { findRole, roleLabel, taskHolders, type TaskRole } from "./roles";

/**
 * Who may see and change a circle's tasks. Every signed-in resident sees
 * them and can comment. The circle's editors — those who can add its
 * documents: its members, the Board, and admins (anyone, for the Community
 * circle) — add, change, and delete any task. A circle whose Tasks module
 * lets any resident add tasks also lets each resident change and delete
 * the tasks they added (`ownTask`). A task's owner — or, for a task given to
 * a role, whoever holds the role — can move it along (status and checklist),
 * and anyone can take on a task nobody has yet.
 */
export async function tasksContext(circleId: string, { write = false } = {}) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  const enabled = featureEnabled(circle, "tasks");
  if (write && !enabled) return { error: problem(`${circle.name} has turned its tasks off`, 409) };
  const canEdit = enabled && canUploadTo(ctx.user, ctx.directory, circleId);
  const canAdd = canEdit || (enabled && anyoneAddsTasks(circle));
  const ownTask = (task: { createdBy: { userId: string } }) =>
    canEdit || (canAdd && task.createdBy.userId === ctx.user.id);
  return {
    user: ctx.user,
    actor: ctx.actor,
    directory: ctx.directory,
    circle,
    enabled,
    canEdit,
    canAdd,
    ownTask,
    canModerate: canEdit || ctx.actor.admin,
  };
}

/** A person's name from the directory, if they're in it. */
export const personName = (directory: DirectoryDocument, personId: string | null) =>
  personId ? directory.people.find((person) => person.id === personId)?.displayName ?? null : null;

type Owned = Pick<Task, "status" | "ownerId" | "ownerName" | "ownerRole">;

/** Who has a task now: its owner, or whoever holds its role (named as in the directory). */
export const holdersOf = (task: Owned, directory: DirectoryDocument) =>
  taskHolders(task, directory.circles, (personId) => personName(directory, personId));

/** A task as served: with who has it now. */
export const served = <T extends Owned>(task: T, directory: DirectoryDocument) => ({
  ...task,
  holders: holdersOf(task, directory),
});

/**
 * A role a task is being given to, as its circle names it now, with its
 * label ("Trash Master", or "Trash Master (Facilities)" from another circle
 * than `hereId`) — or null when no seat in that circle has that role.
 */
export function namedRole(directory: DirectoryDocument, role: TaskRole, hereId: string) {
  const found = findRole(directory.circles, role);
  return found ? { role: found, label: roleLabel(found, directory.circles, hereId) } : null;
}

export const parseNumber = (value: string) => (/^\d{1,6}$/.test(value) ? Number(value) : null);

export function taskProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That task no longer exists", 404);
    case "full":
      return problem("This circle has as many tasks as it can hold", 409);
    case "forbidden":
      return problem("Only this circle's members, the Board, and admins can change that", 403);
  }
}

export function taskCommentProblem(reason: CommentFailure) {
  switch (reason) {
    case "not_found":
    case "unknown_parent":
      return problem("That comment no longer exists", 404);
    case "forbidden":
      return problem("Only the comment's author can do that", 403);
    case "full":
      return problem("This circle's tasks have too many comments", 409);
  }
}
