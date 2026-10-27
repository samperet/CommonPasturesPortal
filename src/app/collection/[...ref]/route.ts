import { NextRequest, NextResponse } from "next/server";
import { readPages } from "@/lib/wiki/store";

export const dynamic = "force-dynamic";

/** An Outline collection's address (`/collection/<name>-<urlId>/…`) opens the circle its documents went to. */
export async function GET(request: NextRequest, { params }: { params: { ref: string[] } }) {
  const urlId = /([A-Za-z0-9]{10})$/.exec(params.ref[0] ?? "")?.[1];
  const page = urlId
    ? (await readPages()).find((entry) => entry.source?.outline.collectionUrlId === urlId)
    : undefined;
  return NextResponse.redirect(
    new URL(page ? `/circles/${page.keeper}` : "/documents", request.url),
    302
  );
}
