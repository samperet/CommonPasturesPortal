import { getSessionUser } from "@/lib/auth/session";
import { readDirectory, readImportedDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";
import { BOARD_ID, type Failure } from "./store";
import { canManageCircle, isCircleId } from "./icons";
import { actorOf } from "@/lib/auth/actor";

/** Map a circle store failure to an HTTP problem response. */
export function circleProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That circle or member no longer exists", 404);
    case "exists":
      return problem("A circle with that name already exists", 409);
    case "duplicate_member":
      return problem("That resident is already in this circle", 409);
    case "last_board_member":
      return problem("The Board needs at least one member", 409);
    case "already_applied":
      return problem("You've already applied to this circle", 409);
    case "not_member":
      return problem("You're not in this circle", 409);
    case "everyone":
      return problem("Everyone at CVC is already in the Community circle", 409);
    case "full":
      return problem("This circle has too many open applications — ask a member", 409);
    case "bad_parent":
      return problem("A sub group belongs to a circle, not to a sub group or Community", 400);
    case "secretary":
      return problem(
        "Only admins and the Board Secretary can give someone the Board's Secretary role or take it away",
        403
      );
  }
}

/**
 * Load the signed-in resident (and who they are to the stores, `actor`), the
 * directory, and the imported circles (used to seed the circle store), and
 * optionally check they may manage a circle. Admins pass every check.
 */
export async function circleContext(
  options: { circleId?: string; require?: "member-or-board" | "board" } = {}
) {
  const user = await getSessionUser();
  if (!user?.personId) return { error: problem("Sign in to manage circles", 401) } as const;
  const [directory, imported] = await Promise.all([readDirectory(), readImportedDirectory()]);
  if (!directory || !imported)
    return { error: problem("The directory hasn't been imported yet", 503) } as const;

  const actor = actorOf(user);
  const { circleId, require } = options;
  if (circleId !== undefined) {
    if (!isCircleId(circleId) || !directory.circles.some((circle) => circle.id === circleId)) {
      return { error: problem("Circle not found", 404) } as const;
    }
    if (
      require === "member-or-board" &&
      !actor.admin &&
      !canManageCircle(directory, circleId, user.personId)
    ) {
      return {
        error: problem("Only this circle's members or the Board can change it", 403),
      } as const;
    }
    if (
      require === "board" &&
      !actor.admin &&
      !canManageCircle(directory, BOARD_ID, user.personId)
    ) {
      return { error: problem("Only the Board can do that", 403) } as const;
    }
  }
  return { user, actor, personId: user.personId, directory, imported: imported.circles } as const;
}
