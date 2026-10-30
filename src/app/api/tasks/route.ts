import { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { featureEnabled } from "@/lib/circles/features";
import { listTasks } from "@/lib/tasks/store";
import { served } from "@/lib/tasks/http";

export const dynamic = "force-dynamic";

/**
 * Every task in every circle with tasks turned on (without descriptions and
 * logs), each with its circle and who has it now (its owner, or its role's
 * holders) — for the Tasks page, which filters them: everyone's, yours or
 * nobody's; open, done or all; repeating only; one circle, with or without
 * its sub groups. Every signed-in resident sees every circle's tasks.
 */
export async function GET() {
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;
  const circles = ctx.directory.circles.filter((circle) => featureEnabled(circle, "tasks"));
  const lists = await Promise.all(
    circles.map(async (circle) =>
      (await listTasks(circle.id)).map(({ activity: _activity, description, ...task }) => ({
        ...served(task, ctx.directory),
        hasDescription: !!description.trim(),
        circleId: circle.id,
        circleName: circle.name,
      }))
    )
  );
  return NextResponse.json(
    { tasks: lists.flat() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
