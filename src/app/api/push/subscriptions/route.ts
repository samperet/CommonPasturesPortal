import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { removeSubscriptions, saveSubscription, subscriptionSchema } from "@/lib/push/store";
import { recordChange, whoOf } from "@/lib/notifications/store";
import { problem, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Turn on notifications for this device. */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "push");
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("That notification subscription isn't valid");
  if (await saveSubscription(user.id, parsed.data))
    await recordChange({ who: whoOf(user), channel: "device", device: "added", via: "settings" });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Turn off notifications for this device. */
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  const parsed = z
    .object({ endpoint: z.string().max(1000) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return problem("Say which device to turn off");
  await removeSubscriptions([parsed.data.endpoint], user.id);
  await recordChange({ who: whoOf(user), channel: "device", device: "removed", via: "settings" });
  return NextResponse.json({ ok: true });
}
