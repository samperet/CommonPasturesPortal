import type { Circle } from "./types";
import { BOARD_ID, isCommunity } from "./ids";

/**
 * Sub groups: smaller groups within a circle, each a circle of its own (its
 * own members, page, and icon) with a `parentId`. One level only — a sub
 * group has no sub groups — and never the Board or Community, whose rules
 * depend on their being top-level. A parent that isn't there (or can't be
 * one) is ignored. The parent's members manage a sub group, as the Board
 * manages every circle. Safe for the browser.
 *
 * Every circle is also shown within Community (`circlesWithin`,
 * `circleTree`, `circlePath`): Community is everyone at CVC, so it's the
 * root of the tree. That's only how circles are shown and filtered —
 * nothing is stored as Community's, and since Community has no members its
 * place at the root gives nobody rights over the circles within it.
 */

/** What placing a circle needs: its id, and its parent's. */
type Linked = Pick<Circle, "id" | "parentId">;
/** …and, to say who manages it, its seats. */
type Tiered = Linked & { seats: { personId: string | null }[] };

/** A sub group's parent; null for a top-level circle. */
export function parentOf<T extends Linked>(circles: T[], circle: Linked) {
  const { id, parentId } = circle;
  if (!parentId || parentId === id || id === BOARD_ID || isCommunity(id)) return null;
  const parent = circles.find((entry) => entry.id === parentId);
  return parent && !parent.parentId && !isCommunity(parent.id) ? parent : null;
}

/** A circle's sub groups. */
export const subgroupsOf = <T extends Linked>(circles: T[], parentId: string) =>
  circles.filter((circle) => circle.parentId === parentId && parentOf(circles, circle));

/** The circles that aren't sub groups. */
export const topLevel = <T extends Linked>(circles: T[]) =>
  circles.filter((circle) => !parentOf(circles, circle));

/** Whether a circle can have sub groups: a top-level one, not Community. */
export const canHaveSubgroups = <T extends Linked>(circles: T[], circle: T) =>
  !isCommunity(circle.id) && !parentOf(circles, circle);

/** "Land Care Circle › Hedge Team" for a sub group; just its name for a circle. */
export function circleLabel<T extends Linked & Pick<Circle, "name">>(circles: T[], circle: T) {
  const parent = parentOf(circles, circle);
  return parent ? `${parent.name} › ${circle.name}` : circle.name;
}

/**
 * Whether someone may manage a circle — its details, members, page, and
 * things: they're in it, in its parent (for a sub group), or on the Board.
 * (Admins too, which callers add.)
 */
export function managesCircle<T extends Tiered>(
  circles: T[],
  circleId: string,
  personId: string | null | undefined
) {
  if (!personId) return false;
  const seated = (circle: T | null | undefined) =>
    !!circle?.seats.some((seat) => seat.personId === personId);
  const circle = circles.find((entry) => entry.id === circleId);
  return (
    seated(circle) ||
    (!!circle && seated(parentOf(circles, circle))) ||
    seated(circles.find((entry) => entry.id === BOARD_ID))
  );
}

/** Circles by name, each followed by its sub groups, labelled for a list ("Land Care Circle › Hedge Team"). */
export function labelledCircles<T extends Linked & Pick<Circle, "name">>(circles: T[]) {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return topLevel(circles)
    .sort(byName)
    .flatMap((circle) => [
      { ...circle, label: circle.name },
      ...subgroupsOf(circles, circle.id)
        .sort(byName)
        .map((sub) => ({ ...sub, label: `${circle.name} › ${sub.name}` })),
    ]);
}

/**
 * The circles directly within a circle: its sub groups — or, for Community,
 * every circle that isn't a sub group (the Board included).
 */
export function circlesWithin<T extends Linked & Pick<Circle, "name">>(
  circles: T[],
  circleId: string
) {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return isCommunity(circleId)
    ? topLevel(circles)
        .filter((circle) => !isCommunity(circle.id))
        .sort(byName)
    : subgroupsOf(circles, circleId).sort(byName);
}

/**
 * Every circle as one tree: Community (depth 0), each circle within it by
 * name (1), each followed by its sub groups (2) — for lists that show the
 * hierarchy, such as a circle filter.
 */
export function circleTree<T extends Linked & Pick<Circle, "name">>(circles: T[]) {
  const community = circles.find((circle) => isCommunity(circle.id));
  const rows: { circle: T; depth: number }[] = community ? [{ circle: community, depth: 0 }] : [];
  for (const circle of circlesWithin(circles, community?.id ?? "community")) {
    rows.push({ circle, depth: 1 });
    for (const sub of circlesWithin(circles, circle.id)) rows.push({ circle: sub, depth: 2 });
  }
  return rows;
}

/** A circle's place in the tree, from the root: [Community, Land Care, Hedge Team]. */
export function circlePath<T extends Linked>(circles: T[], circle: T): T[] {
  if (isCommunity(circle.id)) return [circle];
  const community = circles.find((entry) => isCommunity(entry.id));
  const parent = parentOf(circles, circle);
  return [...(community ? [community] : []), ...(parent ? [parent] : []), circle];
}

/** The circles a filter on one circle covers: it and the circles within it (for Community, every circle). */
export function circleFamily<T extends Linked>(circles: T[], circleId: string): Set<string> {
  if (isCommunity(circleId)) return new Set(circles.map((circle) => circle.id));
  return new Set([circleId, ...subgroupsOf(circles, circleId).map((circle) => circle.id)]);
}
