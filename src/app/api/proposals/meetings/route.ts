import { NextRequest, NextResponse } from "next/server";
import { problem } from "@/lib/http";
import { readPages } from "@/lib/wiki/store";
import { visiblePages } from "@/lib/wiki/access";
import { listDocuments } from "@/lib/documents/store";
import { meetingsOf, proposalSession } from "@/lib/proposals/http";

export const dynamic = "force-dynamic";

/** A circle's meetings a proposal could be consented at: its notes and minutes with a date, the latest first. */
export async function GET(request: NextRequest) {
  const ctx = await proposalSession();
  if ("error" in ctx) return ctx.error;
  const circleId = request.nextUrl.searchParams.get("circle") ?? "";
  if (!ctx.directory.circles.some((circle) => circle.id === circleId))
    return problem("That circle doesn't exist", 404);
  const [pages, documents] = await Promise.all([
    readPages().then((all) => visiblePages(all, ctx.user)),
    listDocuments(),
  ]);
  return NextResponse.json(
    { meetings: meetingsOf(circleId, ctx, pages, documents) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
