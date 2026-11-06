import { NextRequest, NextResponse } from "next/server";
import { MAX_WIKI_IMAGE_BYTES, saveWikiImage, wikiImageUrl } from "@/lib/wiki/images";
import { pageContext } from "@/lib/wiki/http";
import { readImageUpload } from "@/lib/images";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Add a photo to a page (`?page=<slug>`; its editors): the image as the raw
 * request body (JPEG, PNG, or WebP). Kept with the page's keeper circle's
 * photos.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "wiki-image");
  if (limited) return limited;
  const search = request.nextUrl.searchParams;
  const ctx = await pageContext(search.get("page") ?? "", "edit");
  if ("error" in ctx) return ctx.error;
  const upload = await readImageUpload(request, {
    maxBytes: MAX_WIKI_IMAGE_BYTES,
    label: "Photos",
  });
  if ("error" in upload) return upload.error;
  const { bytes, contentType } = upload.file;
  const id = await saveWikiImage(ctx.page.keeper, bytes, contentType, ctx.user.name);
  if (!id) return problem("This circle has as many wiki photos as it can hold", 409);
  return NextResponse.json({ url: wikiImageUrl(ctx.page.keeper, id) }, { status: 201 });
}
