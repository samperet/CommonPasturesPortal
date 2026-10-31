import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { readDirectory } from "@/lib/directory/store";
import { problem, readBody } from "@/lib/http";
import {
  emailPreferences,
  emailPreferencesSchema,
  updateEmailPreferences,
} from "@/lib/email/preferences";
import { TOPICS, type Topic } from "@/lib/push/topics";
import { changedTopics } from "@/lib/notifications/shared";
import { recordChange } from "@/lib/notifications/store";
import { PUSH_ONLY_TOPICS } from "@/lib/email/shared";

const EMAIL_TOPICS = Object.fromEntries(
  Object.entries(TOPICS).filter(([topic]) => !PUSH_ONLY_TOPICS.includes(topic as Topic))
);

export const dynamic = "force-dynamic";

/** What you're emailed about, and the address it goes to (your directory entry's). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  if (!user.personId) return problem("Your account isn't linked to the directory", 400);
  const [preferences, directory] = await Promise.all([
    emailPreferences(user.personId),
    readDirectory(),
  ]);
  const email = directory?.people.find((person) => person.id === user.personId)?.email ?? null;
  return NextResponse.json(
    { preferences, topics: EMAIL_TOPICS, email },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Choose what to be emailed about. */
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  if (!user.personId) return problem("Your account isn't linked to the directory", 400);
  const parsed = await readBody(request, emailPreferencesSchema);
  if ("error" in parsed) return parsed.error;
  const before = await emailPreferences(user.personId);
  const preferences = await updateEmailPreferences(user.personId, parsed.data);
  await recordChange({
    who: user.personId,
    channel: "email",
    topics: changedTopics(before, parsed.data),
    via: "settings",
  });
  return NextResponse.json({ preferences });
}
