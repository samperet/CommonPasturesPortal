import type { Circle } from "@/lib/circles/types";
import { isCommunity } from "@/lib/circles/ids";
import type { Task } from "./shared";

/**
 * Tasks given to a role rather than a person: a role is a seat position in
 * a circle ("Trash Master" in Facilities), matched by name, whatever its
 * case — or, with no position, a whole group: everyone in that circle (or
 * sub group; not Community, which has no members). Whoever holds the role
 * (or is in the group) now is the task's owner — so a repeating
 * task follows the role from one holder to the next. When an occurrence is
 * done, the holder then is kept with it (`ownerId`), so past occurrences
 * stay attributed to whoever did them. A role can be vacant (a seat with
 * that position and nobody in it), or held by several people at once.
 * Pure, safe for the browser.
 */

export interface TaskRole {
  /** The circle the role is in (not necessarily the task's). */
  circleId: string;
  /** The seat position, as the circle names it; null: the whole group, everyone in the circle. */
  position: string | null;
}

/** Someone a task is for. */
export interface Holder {
  personId: string;
  name: string;
}

type Seated = Pick<Circle, "id" | "seats">;

const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/** Positions that just mean being in the circle, so aren't offered as roles. */
const PLAIN = new Set(["member", "members", "circle member", "participant"]);

/** Whether two position names are the same role. */
export const sameRole = (a: string, b: string) => norm(a) === norm(b);

/** A circle's roles: its seats' positions, each once, as first written (not plain "Member"). */
export function rolesOf(circle: Seated): string[] {
  const seen = new Map<string, string>();
  for (const seat of circle.seats) {
    const position = seat.position?.trim();
    if (!position || PLAIN.has(norm(position))) continue;
    if (!seen.has(norm(position))) seen.set(norm(position), position);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

/** The role as the circle names it now (null: no seat has that position any more, or no such group). */
export function findRole(circles: Seated[], role: TaskRole): TaskRole | null {
  const circle = circles.find((entry) => entry.id === role.circleId);
  if (!circle) return null;
  if (!role.position)
    return isCommunity(circle.id) ? null : { circleId: circle.id, position: null };
  const wanted = role.position;
  const position = rolesOf(circle).find((entry) => sameRole(entry, wanted));
  return position ? { circleId: role.circleId, position } : null;
}

/** Whether two roles (or groups) are the same. */
export const sameAssignee = (a: TaskRole | null | undefined, b: TaskRole | null | undefined) =>
  !!a &&
  !!b &&
  a.circleId === b.circleId &&
  (a.position && b.position ? sameRole(a.position, b.position) : !a.position && !b.position);

/** Who holds a role now: the people in that circle's seats with that position — for a group, everyone in it (each once). */
export function roleHolders(
  circles: Seated[],
  role: TaskRole,
  nameOf: (personId: string) => string | null = () => null
): Holder[] {
  const circle = circles.find((entry) => entry.id === role.circleId);
  const holders = new Map<string, Holder>();
  for (const seat of circle?.seats ?? []) {
    if (!seat.personId) continue;
    if (role.position && (!seat.position || !sameRole(seat.position, role.position))) continue;
    if (!holders.has(seat.personId))
      holders.set(seat.personId, {
        personId: seat.personId,
        name: nameOf(seat.personId) ?? seat.name ?? "Someone",
      });
  }
  return Array.from(holders.values());
}

type Owned = Pick<Task, "status" | "ownerId" | "ownerName"> & { ownerRole?: TaskRole | null };

/**
 * Who a task is for now: an unfinished task given to a role, whoever holds
 * the role; otherwise its owner (for a role's finished task, whoever held
 * the role when it was done).
 */
export function taskHolders(
  task: Owned,
  circles: Seated[],
  nameOf?: (personId: string) => string | null
): Holder[] {
  if (task.ownerRole && task.status !== "done") return roleHolders(circles, task.ownerRole, nameOf);
  return task.ownerId ? [{ personId: task.ownerId, name: task.ownerName ?? "Someone" }] : [];
}

/** Whether nobody has a task: no person and no role. */
export const isUnassigned = (task: Pick<Owned, "ownerId" | "ownerRole">) =>
  !task.ownerId && !task.ownerRole;

/**
 * "Trash Master", or "Trash Master (Facilities)" for a role in another
 * circle than `hereId`; a group is its circle's name ("Facilities").
 */
export function roleLabel(role: TaskRole, circles: Pick<Circle, "id" | "name">[], hereId?: string) {
  const circle = circles.find((entry) => entry.id === role.circleId);
  if (!role.position) return circle?.name ?? "a group";
  if (role.circleId === hereId) return role.position;
  return circle ? `${role.position} (${circle.name})` : role.position;
}

/** How a sentence names it: "the Trash Master", or a group as itself ("Facilities"). */
export const assigneePhrase = (role: TaskRole, label: string) =>
  role.position ? `the ${label}` : label;

/**
 * Who'd be recorded as having done a role's task: whoever marks it done, if
 * they hold the role; otherwise its holder (the first, if there are several).
 */
export function holderAtCompletion(holders: Holder[], actorPersonId: string | null) {
  return holders.find((holder) => holder.personId === actorPersonId) ?? holders[0] ?? null;
}
