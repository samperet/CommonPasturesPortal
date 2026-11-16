import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { createSignInLink } from "@/lib/auth/sign-in-links";
import { findSignInPerson } from "@/lib/auth/sign-in";
import { recordAttempt } from "@/lib/auth/sign-in-attempts";
import { problem, readBody, throttled } from "@/lib/http";
import { requestSite } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * An admin makes a sign-in link (and code) for a resident, to send them
 * some other way — a text, say — when their sign-in email isn't arriving.
 * It's an ordinary link: once, within a day, outside the hourly count of
 * links asked for. Kept in the log of tries at signing in, with the admin's
 * name; the link and code themselves are shown only in this answer.
 */

const schema = z.object({ personId: z.string().trim().min(1).max(64) });

export async function POST(request: NextRequest) {
  const limited = throttled(request, "admin-sign-in-link");
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  if (!isAdmin(user)) return problem("Only admins can make sign-in links", 403);
  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const person = await findSignInPerson(parsed.data.personId);
  if (!person) return problem("That resident isn't in the directory", 404);
  const made = await createSignInLink(person.id, undefined, Date.now(), { unlimited: true });
  if (made === "too-many") return problem("Couldn't make a link just now", 503);
  await recordAttempt(person, { kind: "admin-link", outcome: "made", by: user.name });
  return NextResponse.json(
    {
      name: person.displayName,
      link: `${requestSite(request)}/login/${made.token}`,
      code: made.code,
      expiresAt: made.expiresAt,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
