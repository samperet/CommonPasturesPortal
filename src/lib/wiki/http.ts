import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { problem } from "@/lib/http";
import { canEditPage, canManagePage, canSeePage } from "./access";
import { getPage, isSlug, type Failure, type WikiPage } from "./store";
import type { Failure as CommentFailure } from "./comments";
import type { Failure as PerspectiveFailure } from "./perspectives";
import type { Actor } from "@/lib/auth/actor";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { Circle } from "@/lib/circles/types";
import type { CommunityUser } from "@/lib/auth/users";
import { canRecordConsent } from "@/lib/circles/consent";

/**
 * The wiki's routes: who's asking (any signed-in resident, who can see
 * every page), and — for a page — whether they can edit it or look after it
 * (see `access.ts`).
 */

type Session = {
  user: CommunityUser;
  actor: Actor;
  directory: DirectoryDocument;
  imported: Circle[];
};
type PageSession = Session & {
  page: WikiPage;
  canEdit: boolean;
  canManage: boolean;
  /** Record or withdraw the circle's consent: its members, the Board, admins. */
  canConsent: boolean;
};

export async function wikiSession(): Promise<{ error: NextResponse } | Session> {
  const ctx = await circleContext();
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  return { user: ctx.user, actor: ctx.actor, directory: ctx.directory, imported: ctx.imported };
}

export async function pageContext(
  slug: string,
  need: "view" | "edit" | "manage" = "view"
): Promise<{ error: NextResponse } | PageSession> {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx;
  const page: WikiPage | null = isSlug(slug) ? await getPage(slug) : null;
  // A draft is nobody else's business until it's published.
  if (!page || !canSeePage(ctx.user, page)) return { error: wikiProblem("not_found") };
  const canEdit = canEditPage(ctx.user, ctx.directory, page);
  const canManage = canManagePage(ctx.user, ctx.directory, page);
  if (need === "edit" && !canEdit)
    return { error: problem("Only those this page is open to can edit it", 403) };
  if (need === "manage" && !canManage)
    return {
      error: problem("Only the circle that keeps this page (or the Board) can change that", 403),
    };
  const canConsent = canRecordConsent(ctx.user, ctx.directory, page.keeper);
  return { ...ctx, page, canEdit, canManage, canConsent };
}

export function wikiProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That page no longer exists", 404);
    case "exists":
      return problem("A page with that title already exists", 409);
    case "full":
      return problem("The wiki has as many pages as it can hold", 409);
    case "no_version":
      return problem("That version no longer exists", 404);
    case "conflict":
      return problem("Someone else saved this page while you were editing it", 409);
    case "bad_parent":
      return problem(
        "A page can only go inside a page its own circle keeps — not inside itself or one of its own pages",
        400
      );
  }
}

export function commentProblem(reason: CommentFailure) {
  switch (reason) {
    case "not_found":
    case "unknown_parent":
      return problem("That comment no longer exists", 404);
    case "forbidden":
      return problem("You can't change that comment", 403);
    case "full":
      return problem("This page has as many comments as it can hold", 409);
  }
}

export function perspectiveProblem(reason: PerspectiveFailure) {
  switch (reason) {
    case "not_found":
      return problem("That version no longer exists", 404);
    case "forbidden":
      return problem("Only its author can change it", 403);
    case "closed":
      return problem("It's been withdrawn, adopted, or set aside, so it can't change", 409);
    case "conflict":
      return problem("It was saved somewhere else since — reload it to carry on", 409);
    case "full":
      return problem("This page has as many alternative versions as it can hold", 409);
  }
}
