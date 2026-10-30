import type { Actor } from "@/lib/auth/actor";
import { BOARD_ID } from "./ids";
import type { Circle } from "./types";

/**
 * The Board Secretary: whoever holds a Board seat whose role is "Secretary" —
 * the whole role, in any case, spaces around it ignored, so an "Assistant
 * secretary" isn't. The seat manages the directory (`canManageDirectory`) and
 * new member intake (`lib/onboarding/http.ts`), so only admins and the
 * Secretary may give a Board seat that role or take it away
 * (`maySetSecretary`, which the circle store checks as members are added and
 * changed). Safe for the browser.
 */

/** The Secretary's role, matched whole (for `holdsSeat`). */
export const SECRETARY_ROLE = /^\s*secretary\s*$/i;

export const isSecretaryRole = (position: string | null | undefined) =>
  SECRETARY_ROLE.test(position ?? "");

type Seated = Pick<Circle, "id" | "seats">;

/** Who holds the Board's Secretary seat: person ids, in seat order (usually one). */
export function boardSecretaryIds(circles: Seated[]): string[] {
  const board = circles.find((circle) => circle.id === BOARD_ID);
  return (board?.seats ?? [])
    .filter((seat) => seat.personId && isSecretaryRole(seat.position))
    .map((seat) => seat.personId as string);
}

/**
 * Whether a seat's role going from `before` to `after` makes it the Board
 * Secretary or stops it being one (a new seat's `before` is null). A change
 * of case or spacing doesn't, nor does any role on another circle.
 */
export const changesSecretary = (
  circleId: string,
  before: string | null | undefined,
  after: string | null | undefined
) => circleId === BOARD_ID && isSecretaryRole(before) !== isSecretaryRole(after);

/** Whether someone may make that change: an admin, or the Board Secretary as things stand. */
export const maySetSecretary = (circles: Seated[], actor: Pick<Actor, "personId" | "admin">) =>
  actor.admin || (!!actor.personId && boardSecretaryIds(circles).includes(actor.personId));
