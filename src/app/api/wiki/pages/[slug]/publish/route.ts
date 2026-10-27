import { NextRequest, NextResponse } from "next/server";
import { publishPage } from "@/lib/wiki/store";
import { pageContext, wikiProblem } from "@/lib/wiki/http";
import { tellMentioned } from "@/lib/wiki/mentions";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Publish a draft: from now on every resident sees it, and anyone it
 * mentions is told. Its author, or whoever looks after the page (the
 * keeper circle, the Board, admins).
 */
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const limited = throttled(request, "wiki-publish");
  if (limited) return limited;
  const ctx = await pageContext(params.slug);
  if ("error" in ctx) return ctx.error;
  if (!ctx.page.draft) return NextResponse.json({ page: ctx.page });
  if (ctx.page.draft.by !== ctx.user.id && !ctx.canManage)
    return problem("Only its author (or the circle that keeps it) can publish this page", 403);
  const result = await publishPage(params.slug);
  if (!result.ok) return wikiProblem(result.reason);
  if (result.page) await tellMentioned(result.page, ctx.actor);
  return NextResponse.json({ page: result.page });
}
