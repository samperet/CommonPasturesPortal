import { NextRequest } from "next/server";
import { redeemSignInCode } from "@/lib/auth/sign-in-links";
import { findSignInPerson, signedIn } from "@/lib/auth/sign-in";
import { recordAttempt } from "@/lib/auth/sign-in-attempts";
import { codeSchema } from "@/lib/auth/validation";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Sign in with the six-digit code from a sign-in email, on the device that
 * asked for it. Five wrong codes spoil the open links (see sign-in-links.ts).
 * A code that doesn't work is kept in the admins' log of tries at signing in.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "sign-in-code", "Too many attempts. Please wait a minute.");
  if (limited) return limited;
  const parsed = await readBody(request, codeSchema);
  if ("error" in parsed) return parsed.error;
  const used = await redeemSignInCode(parsed.data.personId, parsed.data.code);
  if (used === "none" || used === "wrong") {
    const trying = await findSignInPerson(parsed.data.personId);
    if (trying) await recordAttempt(trying, { kind: "code", outcome: used });
  }
  if (used === "none")
    return problem("That code has expired or was already used. Ask for a new email.", 410, "Gone");
  if (used === "wrong") {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return problem("That code doesn't match the newest email. Check it and try again.", 401);
  }
  const person = await findSignInPerson(used.personId);
  if (!person) return problem("Sign-in is unavailable for this name", 404);
  return signedIn(person, used.next);
}
