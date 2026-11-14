import { createHmac, timingSafeEqual } from "crypto";
import { authSecret } from "@/lib/auth/secret";

/**
 * A circle icon's address for outside the app — in a document's shared
 * card pasted into an email, which the recipient's mail service fetches
 * without signing in. It's the icon's own address with a signature over
 * the circle and the icon's version (`s`), made with the app's secret, so
 * only links the app hands out open without a session; anything else still
 * needs one. Server only.
 */

const sign = (circleId: string, version: string) =>
  createHmac("sha256", `circle-icon:${authSecret()}`)
    .update(`${circleId}.${version}`)
    .digest("base64url")
    .slice(0, 32);

/** The signed address of a circle's icon (version: when it was last changed). */
export const signedIconPath = (circleId: string, version: string) =>
  `/api/circles/${encodeURIComponent(circleId)}/icon?${new URLSearchParams({
    v: version,
    s: sign(circleId, version),
  })}`;

/** Whether `signature` is the app's own for this circle's icon at this version. */
export function iconSignatureValid(
  circleId: string,
  version: string | null,
  signature: string | null
) {
  if (!version || !signature) return false;
  const expected = new TextEncoder().encode(sign(circleId, version));
  const given = new TextEncoder().encode(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
