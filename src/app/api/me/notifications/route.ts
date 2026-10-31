import { NextResponse } from "next/server";
import { reader } from "@/lib/me/http";
import { readDeliveries, whoOf } from "@/lib/notifications/store";
import { outcomeFor, topicLabel } from "@/lib/notifications/shared";

export const dynamic = "force-dynamic";

/** How many days back "Sent to you lately" looks. */
const DAYS = 30;

/**
 * What's been sent to you lately — each notification (and sign-in link) of
 * the last thirty days that was for you, and how it went by app and by
 * email (`lib/notifications`), newest first.
 */
export async function GET() {
  const ctx = await reader();
  if ("error" in ctx) return ctx.error;
  const me = whoOf(ctx.user);
  const sent = (await readDeliveries(DAYS)).flatMap((record) => {
    const { app, email } = outcomeFor(record, me);
    if (!app && !email) return [];
    return [
      {
        id: record.id,
        at: record.at,
        topic: topicLabel(record.topic),
        title: record.title,
        url: record.url,
        app: app ?? null,
        email: email ?? null,
        noEmail: record.noEmail ?? null,
      },
    ];
  });
  return NextResponse.json(
    { days: DAYS, sent },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
