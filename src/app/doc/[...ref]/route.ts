import { NextRequest, NextResponse } from "next/server";
import { readPages } from "@/lib/wiki/store";

export const dynamic = "force-dynamic";

/**
 * An Outline address kept alive: `/doc/<title>-<urlId>` opens the page that
 * document became (`source.outline.urlId`), so links made before the import
 * still arrive once the wiki's domain points here. Unknown: the documents.
 */
export async function GET(_request: NextRequest, { params }: { params: { ref: string[] } }) {
  const urlId = /([A-Za-z0-9]{10})$/.exec(params.ref[0] ?? "")?.[1];
  const page = urlId
    ? (await readPages()).find((entry) => entry.source?.outline.urlId === urlId)
    : undefined;
  return NextResponse.redirect(
    new URL(page ? `/wiki/${page.slug}` : "/documents", _request.url),
    302
  );
}
