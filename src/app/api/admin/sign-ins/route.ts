import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admins";
import { listSignIns } from "@/lib/auth/sign-in-log";
import { listAttempts } from "@/lib/auth/sign-in-attempts";
import { listLastSeen } from "@/lib/auth/last-seen";
import { readDirectory } from "@/lib/directory/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * The sign-in log, newest first, the tries at signing in (asks for an
 * email, codes and links that didn't work, links admins made), when each
 * resident was last seen in the app, and the residents (so those never seen
 * are listed too) — for app admins only.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  if (!isAdmin(user)) return problem("Only admins can view the sign-in log", 403);
  const [signIns, attempts, lastSeen, directory] = await Promise.all([
    listSignIns(),
    listAttempts(),
    listLastSeen(),
    readDirectory(),
  ]);
  // Only residents' own sign-ins; admins viewing as someone aren't shown (older entries included).
  const entries = signIns.filter((entry) => !entry.viewedBy);
  const people = (directory?.people ?? []).map((person) => ({
    personId: person.id,
    name: person.displayName,
  }));
  return NextResponse.json(
    { entries, attempts, lastSeen, people },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
