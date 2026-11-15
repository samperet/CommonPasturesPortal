import type { Circle } from "@/lib/circles/types";

/**
 * The two circles every CVC directory has, by id — safe to import anywhere
 * (the circle store itself is server-only).
 */

/** The Community circle: everyone who lives at CVC, with no member list. */
export const COMMUNITY_ID = "community";
/** The Board, whose members can manage every circle. */
export const BOARD_ID = "board";

export const isCommunity = (circleId: string) => circleId === COMMUNITY_ID;

/** Whether a resident sits on the Board. */
export const sitsOnBoard = (
  circles: Pick<Circle, "id" | "seats">[],
  personId: string | null | undefined
) =>
  !!personId &&
  circles.some(
    (circle) => circle.id === BOARD_ID && circle.seats.some((seat) => seat.personId === personId)
  );

/**
 * The Safety Crew: any circle with "safety" in its name. Its page always has
 * the Alert module (`modulesFor`), and its alerts can always be sent
 * (`hasAlert`) — the module isn't offered to other circles any more.
 */
export const isSafetyCrew = (circle: { name?: string } | undefined) =>
  /safety/i.test(circle?.name ?? "");

/**
 * The O&M (operations and maintenance) circle: named "O&M", or "Operations
 * and Maintenance". Its page always has the Equipment module (`modulesFor`),
 * and its equipment list starts with the DR mower (`lib/equipment/seed.ts`).
 */
export const isOperations = (circle: { name?: string } | undefined) =>
  /(^|[^a-z])o\s*&\s*m([^a-z]|$)|operations\s*(and|&)\s*maintenance/i.test(circle?.name ?? "");
