import { NextRequest } from "next/server";
import { linkOwner, redeemSignInLink, type LinkFailure } from "@/lib/auth/sign-in-links";
import { recordAttempt } from "@/lib/auth/sign-in-attempts";
import { findSignInPerson, signedIn } from "@/lib/auth/sign-in";
import { isLinkToken } from "@/lib/auth/validation";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Using a sign-in link (POST). The page the link opens, `/login/<token>`,
 * posts here as soon as it loads; fetching the page alone (as mail
 * scanners do) uses nothing up. A link opened too late, or again, is kept
 * in the admins' log of tries at signing in.
 */

const FAILURES: Record<LinkFailure, string> = {
  unknown: "This sign-in link isn't valid. Ask for a new one.",
  expired: "This sign-in link has expired. Ask for a new one.",
  used: "This sign-in link has already been used. Ask for a new one if you need to sign in again.",
};

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const limited = throttled(request, "sign-in-link-use");
  if (limited) return limited;
  if (!isLinkToken(params.token)) return problem(FAILURES.unknown, 404);
  const used = await redeemSignInLink(params.token);
  if (typeof used === "string") {
    if (used !== "unknown") {
      const owner = await linkOwner(params.token);
      const person = owner ? await findSignInPerson(owner) : null;
      if (person) await recordAttempt(person, { kind: "link", outcome: used });
    }
    return problem(FAILURES[used], 410, "Gone");
  }
  const person = await findSignInPerson(used.personId);
  if (!person) return problem(FAILURES.unknown, 404);
  return signedIn(person, used.next);
}
