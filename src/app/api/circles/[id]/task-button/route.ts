import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { featureEnabled } from "@/lib/circles/features";
import { createTask, taskInputSchema } from "@/lib/tasks/store";
import { holdersOf, served, taskProblem } from "@/lib/tasks/http";
import { assigneePhrase, findRole, roleLabel } from "@/lib/tasks/roles";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const pressSchema = z.object({
  /** Which of the circle's Task buttons. */
  moduleId: z.string().min(1).max(80),
  /** What the presser adds: the task's description. */
  details: z.string().trim().max(2000, "Keep it to 2,000 characters").default(""),
});

/**
 * Press a circle's Task button (any resident): it makes the task the button
 * was set up to make — its title, with what the presser added as its
 * description — for its role or group, on the board of that role's or
 * group's circle, and tells whoever has it. Everything but the details
 * comes from the button as saved on the circle's page, never from the press.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "task-button");
  if (limited) return limited;
  const ctx = await circleContext({ circleId: params.id });
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, pressSchema);
  if ("error" in parsed) return parsed.error;
  const circle = ctx.directory.circles.find((entry) => entry.id === params.id)!;
  const button = circle.modules?.find(
    (module) => module.id === parsed.data.moduleId && module.type === "taskbutton"
  )?.taskButton;
  if (!button) return problem("That button is no longer on this page", 404);
  const assignee = findRole(ctx.directory.circles, button.assignee);
  if (!assignee)
    return problem(
      button.assignee.position
        ? `Nobody has the role “${button.assignee.position}” any more: the button needs setting up again`
        : "That group is gone: the button needs setting up again",
      409
    );
  const target = ctx.directory.circles.find((entry) => entry.id === assignee.circleId)!;
  if (!featureEnabled(target, "tasks"))
    return problem(`${target.name} has turned its tasks off, so the button can't make one`, 409);
  const label = roleLabel(assignee, ctx.directory.circles, target.id);
  const result = await createTask(
    target.id,
    ctx.actor,
    taskInputSchema.parse({
      title: button.title,
      description: parsed.data.details,
      ownerRole: assignee,
    }),
    null,
    label
  );
  if (!result.ok || !result.task) return taskProblem(result.ok ? "not_found" : result.reason);
  const task = result.task;
  const told = holdersOf(task, ctx.directory)
    .map((holder) => holder.personId)
    .filter((personId) => personId !== ctx.personId);
  if (told.length)
    await notify({
      topic: "tasks",
      title: `${ctx.user.name} asked ${assigneePhrase(assignee, label)}: ${button.title}`,
      body: parsed.data.details || `A new task in ${target.name}`,
      url: `/circles/${target.id}/tasks/${task.number}`,
      tag: `task-${task.id}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: await userIdsForPeople(told),
    });
  return NextResponse.json(
    { task: served(task, ctx.directory), circleId: target.id, circleName: target.name },
    { status: 201 }
  );
}
