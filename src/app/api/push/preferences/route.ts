import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { preferencesFor, preferencesSchema, updatePreferences } from "@/lib/push/store";
import { changedTopics } from "@/lib/notifications/shared";
import { recordChange, whoOf } from "@/lib/notifications/store";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Choose what to be notified about (applies to all your devices). */
export async function PUT(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  const parsed = preferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Unknown notification setting");
  const before = await preferencesFor(user.id);
  const preferences = await updatePreferences(user.id, parsed.data);
  await recordChange({
    who: whoOf(user),
    channel: "app",
    topics: changedTopics(before, parsed.data),
    via: "settings",
  });
  return NextResponse.json({ preferences });
}
