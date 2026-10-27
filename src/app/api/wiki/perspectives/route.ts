import { NextRequest, NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { readPages } from "@/lib/wiki/store";
import { visiblePages } from "@/lib/wiki/access";
import { listPerspectives } from "@/lib/wiki/perspectives";
import { isLive, summaryOf, type PerspectiveSummary } from "@/lib/wiki/perspectives-shared";

export const dynamic = "force-dynamic";

/**
 * The alternative versions still being worked on of some pages
 * (`?pages=<id>,<id>`, up to 20), by page — for choosing which to put to a
 * meeting with a proposal.
 */
export async function GET(request: NextRequest) {
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;
  const wanted = (request.nextUrl.searchParams.get("pages") ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => /^[0-9a-f-]{36}$/.test(id))
    .slice(0, 20);
  const pages = visiblePages(await readPages(), ctx.user).filter((page) =>
    wanted.includes(page.id)
  );
  const versions: { pageId: string; perspectives: PerspectiveSummary[] }[] = await Promise.all(
    pages.map(async (page) => ({
      pageId: page.id,
      perspectives: (await listPerspectives(page.id))
        .filter(isLive)
        .map((perspective) => summaryOf(perspective, page.updatedAt)),
    }))
  );
  return NextResponse.json(
    { versions: versions.filter((entry) => entry.perspectives.length) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
