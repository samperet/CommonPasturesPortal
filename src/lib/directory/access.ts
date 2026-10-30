import { isAdmin } from "@/lib/auth/admins";
import { BOARD_ID } from "@/lib/circles/ids";
import { holdsSeat } from "@/lib/circles/icons";
import { SECRETARY_ROLE } from "@/lib/circles/secretary";
import type { DirectoryDocument } from "./types";

/**
 * Who manages the directory — adds, edits, and removes people: admins, and
 * whoever holds the Secretary seat on the Board (so it follows the role as
 * the Board changes). The role must be "Secretary" itself, not one that
 * mentions it ("Assistant secretary"), and only admins and the Secretary can
 * give it to a Board seat (`lib/circles/secretary.ts`).
 */
export function canManageDirectory(
  user: { personId?: string | null },
  directory: DirectoryDocument
) {
  if (isAdmin(user)) return true;
  return !!user.personId && holdsSeat(directory, BOARD_ID, user.personId, SECRETARY_ROLE);
}
