import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { circleContext } from "@/lib/circles/access";
import { iconKey, isCircleId, setCircleIcon } from "@/lib/circles/icons";
import { deleteBinary, readBinary, writeBinary } from "@/lib/storage";
import { MAX_IMAGE_BYTES, PRIVATE_IMAGE_HEADERS, readImageUpload } from "@/lib/images";
import { iconSignatureValid } from "@/lib/circles/icon-link";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Confirm the signed-in resident may change this circle's icon. */
async function authorize(circleId: string) {
  const ctx = await circleContext({ circleId, require: "member-or-board" });
  return "error" in ctx ? ctx.error : null;
}

/**
 * A circle's icon: for residents signed in — or, at the signed address the
 * app hands out (`?v=…&s=…`, `lib/circles/icon-link.ts`), for anyone, such
 * as a mail service showing a shared document's card.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const query = request.nextUrl.searchParams;
  const signed = iconSignatureValid(params.id, query.get("v"), query.get("s"));
  const user = signed ? null : await getSessionUser();
  if (!signed && !user) return problem("Sign in to view circle icons", 401);
  if (!isCircleId(params.id)) return problem("Icon not found", 404);
  const icon = await readBinary(iconKey(params.id));
  if (!icon) return problem("Icon not found", 404);
  return new NextResponse(icon.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": icon.contentType,
      ...(signed
        ? { "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" }
        : PRIVATE_IMAGE_HEADERS),
    },
  });
}

/** Upload a circle icon as the raw request body (JPEG, PNG, or WebP). */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "circle-icon");
  if (limited) return limited;
  const denied = await authorize(params.id);
  if (denied) return denied;

  const upload = await readImageUpload(request, { maxBytes: MAX_IMAGE_BYTES, label: "Icon" });
  if ("error" in upload) return upload.error;
  await writeBinary(iconKey(params.id), upload.file);
  await setCircleIcon(params.id, {
    contentType: upload.file.contentType,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await authorize(params.id);
  if (denied) return denied;
  await deleteBinary(iconKey(params.id));
  await setCircleIcon(params.id, null);
  return NextResponse.json({ ok: true });
}
