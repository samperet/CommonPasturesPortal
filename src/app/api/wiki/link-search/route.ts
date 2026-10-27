import { NextRequest, NextResponse } from "next/server";
import { listDocuments } from "@/lib/documents/store";
import { listPages } from "@/lib/wiki/store";
import { wikiSession } from "@/lib/wiki/http";
import { visiblePages } from "@/lib/wiki/access";

export const dynamic = "force-dynamic";

const PAGES = 8;
const DOCUMENTS = 5;

/**
 * What typing @ in a wiki page finds: the pages (those kept by
 * `circle`, the page's keeper, first), and document titles, best matches
 * first — leaving out `page`, the one being written.
 */
export async function GET(request: NextRequest) {
  const ctx = await wikiSession();
  if ("error" in ctx) return ctx.error;
  const params = request.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const circleId = params.get("circle") ?? "";
  const pageId = params.get("page") ?? "";

  // A title starting with the words scores above one containing them; this circle's above others'.
  const rank = (title: string, mine: boolean) => {
    const lower = title.toLowerCase();
    const at = query ? lower.indexOf(query) : 0;
    if (at < 0) return null;
    return (mine ? 0 : 10) + (at === 0 ? 0 : /\s/.test(lower[at - 1] ?? "") ? 1 : 2);
  };

  const all = visiblePages(await listPages(), ctx.user);
  const pages = all
    .flatMap((page) => {
      const score = page.id === pageId ? null : rank(page.title, page.keeper === circleId);
      return score === null
        ? []
        : [
            {
              id: page.id,
              circleId: page.keeper,
              circleName:
                ctx.directory.circles.find((circle) => circle.id === page.keeper)?.name ?? "",
              title: page.title,
              slug: page.slug,
              score,
            },
          ];
    })
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
    .slice(0, PAGES);

  const circleName = (id: string) =>
    ctx.directory.circles.find((circle) => circle.id === id)?.name ?? "";
  const allDocuments = query ? await listDocuments() : [];
  // Another circle's document with the same title: the link then names the circle.
  const ambiguous = (doc: (typeof allDocuments)[number]) =>
    allDocuments.some(
      (other) =>
        other.id !== doc.id &&
        other.circleId !== doc.circleId &&
        other.title.toLowerCase() === doc.title.toLowerCase()
    );
  const documents = query
    ? allDocuments
        .flatMap((doc) => {
          const score = rank(doc.title, doc.circleId === circleId);
          return score === null
            ? []
            : [
                {
                  id: doc.id,
                  title: doc.title,
                  circleId: doc.circleId,
                  circleName: circleName(doc.circleId),
                  ambiguous: ambiguous(doc),
                  score,
                },
              ];
        })
        .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
        .slice(0, DOCUMENTS)
    : [];

  // Whether a page with exactly this title is in the wiki already (so "New page" isn't offered).
  const exists = !!query && all.some((page) => page.title.toLowerCase() === query);
  return NextResponse.json(
    { pages, documents, exists },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
