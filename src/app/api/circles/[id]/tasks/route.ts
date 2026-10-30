import { NextRequest, NextResponse } from "next/server";
import { createTask, listTasks, taskInputSchema } from "@/lib/tasks/store";
import { listTaskComments } from "@/lib/tasks/comments";
import {
  holdersOf,
  namedRole,
  personName,
  served,
  taskProblem,
  tasksContext,
} from "@/lib/tasks/http";
import type { TaskSummary } from "@/lib/tasks/shared";
import { assigneePhrase } from "@/lib/tasks/roles";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A circle's tasks (without their descriptions and logs), and whether you can change them. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await tasksContext(params.id);
  if ("error" in ctx) return ctx.error;
  const [tasks, comments] = await Promise.all([listTasks(params.id), listTaskComments(params.id)]);
  const counts = new Map<string, number>();
  for (const comment of comments)
    if (!comment.deletedAt) counts.set(comment.taskId, (counts.get(comment.taskId) ?? 0) + 1);
  const summaries: TaskSummary[] = tasks.map(({ activity: _activity, description, ...task }) => ({
    ...served(task, ctx.directory),
    hasDescription: !!description.trim(),
    commentCount: counts.get(task.id) ?? 0,
  }));
  return NextResponse.json(
    { tasks: summaries, canEdit: ctx.canEdit, canAdd: ctx.canAdd, enabled: ctx.enabled },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Add a task: the circle's members, the Board, and admins — or any resident,
 * if the circle's Tasks module allows. It's for a person (`ownerId`), a role
 * (`ownerRole`: a seat position in any circle), or nobody yet; whoever it's
 * for hears about it.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await tasksContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  if (!ctx.canAdd) return taskProblem("forbidden");
  const parsed = await readBody(request, taskInputSchema);
  if ("error" in parsed) return parsed.error;
  const ownerName = personName(ctx.directory, parsed.data.ownerId);
  if (parsed.data.ownerId && !ownerName) return problem("That person isn't in the directory");
  const role =
    parsed.data.ownerRole && !parsed.data.ownerId
      ? namedRole(ctx.directory, parsed.data.ownerRole, params.id)
      : null;
  if (parsed.data.ownerRole && !parsed.data.ownerId && !role)
    return problem("Nobody in that circle has that role");
  const result = await createTask(
    params.id,
    ctx.actor,
    { ...parsed.data, ownerRole: role?.role ?? null },
    ownerName,
    role?.label ?? null
  );
  if (!result.ok || !result.task) return taskProblem(result.ok ? "not_found" : result.reason);
  const task = result.task;
  const told = holdersOf(task, ctx.directory)
    .map((holder) => holder.personId)
    .filter((personId) => personId !== ctx.user.personId);
  if (told.length) {
    await notify({
      topic: "tasks",
      title: role
        ? `${ctx.user.name} gave ${assigneePhrase(role.role, role.label)} a task in ${
            ctx.circle.name
          }`
        : `${ctx.user.name} gave you a task in ${ctx.circle.name}`,
      body: task.title,
      url: `/circles/${params.id}/tasks/${task.number}`,
      tag: `task-${task.id}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: await userIdsForPeople(told),
    });
  }
  return NextResponse.json({ task: served(task, ctx.directory) }, { status: 201 });
}
