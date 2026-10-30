import { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { listDocuments } from "@/lib/documents/store";
import { shownWithPage } from "@/lib/documents/types";
import { listProposals } from "@/lib/proposals/store";
import { readPages } from "@/lib/wiki/store";
import { visiblePages } from "@/lib/wiki/access";

export const dynamic = "force-dynamic";

/**
 * How many files and proposals each circle has, as the Documents list shows
 * them (a file made into a page counts with the page; withdrawn proposals
 * don't count) — for the documents sidebar, which counts the pages itself
 * from the pages list it already has. `{ counts: { [circleId]: number } }`.
 */
export async function GET() {
  const context = await circleContext();
  if ("error" in context) return context.error;
  const livePageIds = new Set(visiblePages(await readPages(), context.user).map((page) => page.id));
  const counts: Record<string, number> = {};
  const count = (circleId: string) => (counts[circleId] = (counts[circleId] ?? 0) + 1);
  for (const doc of await listDocuments())
    if (!shownWithPage(doc, livePageIds)) count(doc.circleId);
  for (const proposal of await listProposals())
    if (proposal.status !== "withdrawn") count(proposal.circleId);
  return NextResponse.json({ counts }, { headers: { "Cache-Control": "private, no-store" } });
}
