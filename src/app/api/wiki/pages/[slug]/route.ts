import { NextRequest, NextResponse } from "next/server";
import {
  getHistory,
  movePage,
  pageUpdateSchema,
  updatePage,
  type WikiPage,
} from "@/lib/wiki/store";
import { trashPage } from "@/lib/wiki/trash";
import { pageContext, wikiProblem } from "@/lib/wiki/http";
import { canMovePageTo, circlesYouKeep } from "@/lib/wiki/access";
import { problem, readBody } from "@/lib/http";
import { claimAnnouncements, pollIdsIn } from "@/lib/polls/wiki";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { isCommunity } from "@/lib/circles/ids";
import { tellMentioned } from "@/lib/wiki/mentions";
import { isFollowing } from "@/lib/wiki/follows";

export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

/**
 * A page, its earlier versions, whether you can edit it or change its
 * settings, and whether you follow it — and, for those who can choose its
 * parent circle, the circles they can move it to (`canMoveTo`: theirs; for
 * the Board and admins, any).
 */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(
    {
      page: ctx.page,
      history: await getHistory(ctx.page.id),
      canEdit: ctx.canEdit,
      canManage: ctx.canManage,
      canConsent: ctx.canConsent,
      following: await isFollowing(ctx.page.id, ctx.user.id),
      ...(ctx.canManage
        ? { canMoveTo: circlesYouKeep(ctx.user, ctx.directory).map((circle) => circle.id) }
        : {}),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Save a new version (title and/or body; its editors), its settings —
 * keeper, who edits it, whether it's offered as a template (the circle that
 * keeps it, or the Board; a page moves only to a circle you're in), its
 * place in the tree (`parentId`, `order`: the same), its emoji and width
 * (its editors) — who was present and the meeting's date
 * (meeting notes; its editors), or withdraw a proposal or record of consent
 * from before proposals were their own (consent: the circle's members, the
 * Board). Proposals and consent are now `/api/proposals`. Polls newly in the
 * page are announced, and residents newly mentioned are told.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await pageContext(params.slug, "edit");
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, pageUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const update = parsed.data;
  const settings =
    update.keeper !== undefined || update.edit !== undefined || update.template !== undefined;
  if (settings && !ctx.canManage)
    return problem(
      "Only the circle that keeps this page (or the Board) can change its settings",
      403
    );
  const placing = update.parentId !== undefined || update.order !== undefined;
  if (placing && !ctx.canManage)
    return problem("Only the circle that keeps this page (or the Board) can move it", 403);
  if (update.consent !== undefined && !ctx.canConsent)
    return problem("Only the circle's members and the Board can withdraw its consent", 403);
  if (update.keeper && update.keeper !== ctx.page.keeper) {
    const circle = ctx.directory.circles.find((entry) => entry.id === update.keeper);
    if (!circle) return problem("That circle doesn't exist", 404);
    if (!canMovePageTo(ctx.user, ctx.directory, ctx.page, circle.id))
      return problem(`Join ${circle.name} first: only its members can move pages to it`, 403);
  }

  const before = ctx.page;
  const result = await updatePage(params.slug, ctx.actor, update);
  if (!result.ok && result.reason === "conflict") {
    const current = (await pageContext(params.slug)) as { page?: WikiPage };
    return NextResponse.json(
      {
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: `${
          current.page?.updatedBy.name ?? "Someone"
        } saved this page while you were editing it`,
        page: current.page,
      },
      { status: 409 }
    );
  }
  if (!result.ok) return wikiProblem(result.reason);
  if (placing) {
    const moved = await movePage(params.slug, { parentId: update.parentId, order: update.order });
    if (!moved.ok) return wikiProblem(moved.reason);
    if (result.page && moved.page)
      result.page = { ...result.page, parentId: moved.page.parentId, order: moved.page.order };
  }
  if (result.page) {
    const had = new Set(pollIdsIn(before.body));
    const fresh = await claimAnnouncements(
      pollIdsIn(result.page.body).filter((id) => !had.has(id))
    );
    for (const poll of fresh) {
      const circle = ctx.directory.circles.find((entry) => entry.id === poll.circleId);
      const only = poll.membersOnly
        ? await userIdsForPeople(circle?.seats.map((seat) => seat.personId) ?? [])
        : null;
      await notify({
        topic: "polls",
        title:
          isCommunity(poll.circleId) || !circle
            ? `New poll: ${poll.question}`
            : `New ${circle.name} poll: ${poll.question}`,
        body: `${poll.authorName} asks: ${poll.poll.options
          .map((option) => option.text)
          .join(" · ")}`,
        url: `/wiki/${result.page.slug}`,
        tag: `wiki-poll-${poll.id}`,
        exceptUserId: ctx.user.id,
        ...(only ? { onlyUserIds: only } : {}),
      });
    }
    // Anyone newly mentioned hears, once.
    if (result.page.body !== before.body) await tellMentioned(result.page, ctx.actor);
  }
  return NextResponse.json({ page: result.page });
}

/**
 * Delete a page (its parent circle): it goes to the trash for 30 days
 * (`lib/wiki/trash.ts`), its history, comments and alternative versions
 * kept with it, and can be restored from there.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await pageContext(params.slug, "manage");
  if ("error" in ctx) return ctx.error;
  const result = await trashPage(ctx.page, ctx.actor);
  if (!result.ok) return wikiProblem(result.reason);
  return NextResponse.json({ ok: true });
}
