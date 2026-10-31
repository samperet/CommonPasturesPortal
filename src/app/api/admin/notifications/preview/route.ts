import { NextRequest, NextResponse } from "next/server";
import { adminContext } from "@/lib/auth/admin-http";
import { listUsers } from "@/lib/auth/users";
import { allPreferences, listSubscriptions } from "@/lib/push/store";
import { TOPICS, type Topic } from "@/lib/push/topics";
import { allEmailPreferences } from "@/lib/email/preferences";
import { readEmailSettings } from "@/lib/email/settings";
import { emailConfigured } from "@/lib/email/send";
import { PUSH_ONLY_TOPICS } from "@/lib/email/shared";
import { isCommunity } from "@/lib/circles/ids";
import { planDelivery } from "@/lib/notifications/plan";
import { problem } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Who would get a notification on `topic` if one were sent now — to
 * everyone, or (`circle`) to a circle's members — and how: the same plan
 * `notify()` follows, with nothing sent. No author is left out. Each
 * resident's planned outcome by app and by email ("send", or the reason not).
 */
export async function GET(request: NextRequest) {
  const ctx = await adminContext();
  if ("error" in ctx) return ctx.error;
  const params = request.nextUrl.searchParams;
  const topic = params.get("topic") ?? "";
  if (!(topic in TOPICS)) return problem("Choose a notification topic");
  const circleId = params.get("circle");
  const circle = circleId ? ctx.directory.circles.find((entry) => entry.id === circleId) : null;
  if (circleId && !circle) return problem("Circle not found", 404);
  const members =
    circle && !isCommunity(circle.id)
      ? circle.seats.map((seat) => seat.personId).filter((id): id is string => !!id)
      : undefined;
  const emailed = !PUSH_ONLY_TOPICS.includes(topic as Topic) && emailConfigured();
  const [users, appPreferences, devices, emailPreferences, emailSettings] = await Promise.all([
    listUsers(),
    allPreferences(),
    listSubscriptions(),
    emailed ? allEmailPreferences() : {},
    readEmailSettings(),
  ]);
  const plan = planDelivery({
    topic: topic as Topic,
    exceptUserId: null,
    onlyPersonIds: members,
    emailed,
    people: ctx.directory.people,
    users,
    appPreferences,
    emailPreferences,
    devices,
    emailSettings,
  });
  return NextResponse.json(
    {
      topic,
      circle: circle ? { id: circle.id, name: circle.name } : null,
      emailed,
      testMode: emailed && emailSettings.testMode,
      plan: plan.map((entry) => ({
        key: entry.key,
        name: entry.name,
        app: entry.app,
        devices: entry.devices.length,
        email: entry.email,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
