import { NextResponse } from "next/server";
import { buildWikiGraph } from "@/lib/wiki/graph";
import { wikiSession } from "@/lib/wiki/http";

export const dynamic = "force-dynamic";

/** The wiki map: how the pages connect — to their parent circles, and by their links. */
export async function GET() {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(await buildWikiGraph(ctx.directory, ctx.user), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
