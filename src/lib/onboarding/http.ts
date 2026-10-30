import { NextResponse } from "next/server";
import { actorOf } from "@/lib/auth/actor";
import { getSessionUser } from "@/lib/auth/session";
import { canManageDirectory } from "@/lib/directory/access";
import { adminPersonIds } from "@/lib/auth/admins";
import { loadAdmins } from "@/lib/auth/admin-store";
import { boardSecretaryIds } from "@/lib/circles/secretary";
import type { DirectoryDocument } from "@/lib/directory/types";
import { readDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";
import { siteUrl } from "@/lib/site-url";
import { getInvitation, type Failure } from "./store";
import { invitationStatus, linkExpired, type Invitation, type InvitationListing } from "./shared";
import { invitationToken, readInvitationToken } from "./token";

/**
 * Who may do what with new member intake. The Secretary page and its API are
 * for whoever manages the directory — the Board Secretary (the Board seat
 * whose role is exactly "Secretary": `lib/circles/secretary.ts`) and admins.
 * A welcome page is for whoever holds its link: no account needed, the signed
 * token is the key.
 */

export async function secretaryContext() {
  const user = await getSessionUser();
  if (!user) return { error: problem("Sign in to continue", 401) };
  const directory = await readDirectory();
  if (!directory) return { error: problem("The directory hasn't been imported yet", 503) };
  if (!canManageDirectory(user, directory))
    return { error: problem("Only the Board Secretary and admins can do that", 403) };
  return { user, directory, actor: actorOf(user) };
}

/** Whoever holds the Board's Secretary seat (the first, if two do), by name — or null. */
export function boardSecretary(directory: DirectoryDocument) {
  const [personId] = boardSecretaryIds(directory.circles);
  const person = personId ? directory.people.find((entry) => entry.id === personId) : null;
  return person ? { personId: person.id, name: person.displayName } : null;
}

/** Who manages new members: the Board Secretary seat's holders, and the admins (person ids). */
export async function intakeManagers(directory: DirectoryDocument): Promise<string[]> {
  await loadAdmins();
  const secretaries = boardSecretaryIds(directory.circles);
  return Array.from(new Set([...secretaries, ...Array.from(adminPersonIds())]));
}

/** The invitation a welcome link is for. */
export async function joinContext(
  token: string
): Promise<{ invitation: Invitation } | { error: NextResponse }> {
  const id = readInvitationToken(token);
  const invitation = id ? await getInvitation(id) : null;
  if (!invitation)
    return {
      error: problem(
        "This welcome link isn't working. Ask the Board Secretary to send you a new one.",
        404
      ),
    };
  return { invitation };
}

export const welcomeLink = (id: string) => `${siteUrl()}/join/${invitationToken(id)}`;

export function toListing(
  invitation: Invitation,
  people: { id: string; displayName: string }[]
): InvitationListing {
  return {
    ...invitation,
    status: invitationStatus(invitation),
    link: welcomeLink(invitation.id),
    expired: linkExpired(invitation),
    personName: invitation.personId
      ? people.find((person) => person.id === invitation.personId)?.displayName ?? null
      : null,
  };
}

export function onboardingProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That invitation no longer exists", 404);
    case "already_invited":
      return problem("That address already has an open invitation — send it again instead", 409);
    case "full":
      return problem("There are too many invitations; remove some old ones", 409);
    case "expired":
      return problem(
        "This welcome link has expired. Ask the Board Secretary to send you a new one.",
        410
      );
    case "already_added":
      return problem("They've already been added to the directory", 409);
  }
}
