import { NextRequest, NextResponse } from "next/server";
import { createPage, getPageById, pageInputSchema, pageSummary, readPages } from "@/lib/wiki/store";
import { builtInTemplate, fillTemplate } from "@/lib/wiki/templates";
import { setFollowing } from "@/lib/wiki/follows";
import { tellMentioned } from "@/lib/wiki/mentions";
import { shortDate, todayInVermont } from "@/lib/time";
import { excerptOf } from "@/lib/wiki/excerpt";
import { canEditPage, canSeePage, circlesYouKeep, visiblePages } from "@/lib/wiki/access";
import { wikiProblem, wikiSession } from "@/lib/wiki/http";
import { COMMUNITY_ID } from "@/lib/circles/store";
import { canUploadTo } from "@/lib/documents/access";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The pages (most recently edited first, each with its opening lines), and the circles you could make a new page's keeper. */
export async function GET() {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const pages = visiblePages(await readPages(), ctx.user)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((page) => ({ ...pageSummary(page), excerpt: excerptOf(page.body, 300) }));
  return NextResponse.json(
    { pages, keepers: circlesYouKeep(ctx.user, ctx.directory) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Add a page, kept by `keeper` (one of your circles). Started from a link in
 * another page (`from`, its id) that you can edit, it's kept by that page's
 * circle unless you say otherwise; with neither, by Community. With
 * `template` (a built-in one's key, or a template page's id) and no body of
 * its own, it starts with the template's text, today's date and its circle
 * filled in (`lib/wiki/templates.ts`). Inside a page (`parentId`, one its
 * keeper keeps) it goes last among that page's pages. As a `draft` only its
 * author and admins see it until it's published (`…/publish`). Its creator
 * follows it from the start, and anyone it mentions is told once it's
 * published.
 */
export async function POST(request: NextRequest) {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, pageInputSchema);
  if ("error" in parsed) return parsed.error;
  const { from, keeper: asked, template, parentId, draft, icon, ...input } = parsed.data;
  const parent = parentId ? await getPageById(parentId) : null;
  if (parentId && (!parent || !canSeePage(ctx.user, parent)))
    return problem("The page to put it inside no longer exists", 404);
  if (parent && asked && asked !== parent.keeper)
    return problem("A page goes inside a page its own circle keeps", 400);
  const source = from && !asked && !parent ? await getPageById(from) : null;
  const keeper =
    asked ??
    parent?.keeper ??
    (source && canEditPage(ctx.user, ctx.directory, source) ? source.keeper : COMMUNITY_ID);
  if (!ctx.directory.circles.some((circle) => circle.id === keeper))
    return problem("Choose the circle that keeps it", 404);
  // Your own circles' — or, started from a page you can edit, that page's circle.
  if (!canUploadTo(ctx.user, ctx.directory, keeper) && !(source && source.keeper === keeper)) {
    return problem("You can only start pages kept by your own circles", 403);
  }
  let body = input.body;
  if (template && !body.trim()) {
    const page = builtInTemplate(template) ? null : await getPageById(template);
    const text = builtInTemplate(template)?.body ?? (page?.template ? page.body : null);
    if (text === null) return problem("That template isn't there any more", 404);
    const circle = ctx.directory.circles.find((entry) => entry.id === keeper)?.name ?? "";
    body = fillTemplate(text, {
      date: shortDate(input.meetingDate ?? todayInVermont(), true),
      circle,
    });
  }
  const result = await createPage(ctx.actor, {
    ...input,
    body,
    keeper,
    parentId: parent?.id ?? null,
    draft: !!draft,
    ...(icon ? { icon } : {}),
  });
  if (!result.ok) return wikiProblem(result.reason);
  if (result.page) {
    // Whoever starts a page follows it; anyone it mentions hears (once it's published).
    await setFollowing(result.page.id, ctx.actor.userId, true);
    if (!result.page.draft) await tellMentioned(result.page, ctx.actor);
  }
  return NextResponse.json({ page: result.page }, { status: 201 });
}
