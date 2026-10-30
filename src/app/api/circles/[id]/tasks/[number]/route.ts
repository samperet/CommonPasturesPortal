import { NextRequest, NextResponse } from "next/server";
import {
  deleteTask,
  getTask,
  taskUpdateSchema,
  updateTask,
  type TaskUpdate,
} from "@/lib/tasks/store";
import { deleteCommentsForTask } from "@/lib/tasks/comments";
import {
  holdersOf,
  namedRole,
  parseNumber,
  personName,
  served,
  taskProblem,
  tasksContext,
} from "@/lib/tasks/http";
import { isHolder, type Task } from "@/lib/tasks/shared";
import { assigneePhrase, holderAtCompletion, isUnassigned, sameAssignee } from "@/lib/tasks/roles";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify } from "@/lib/push/notify";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; number: string } };

/** A task, with its log. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await tasksContext(params.id);
  if ("error" in ctx) return ctx.error;
  const number = parseNumber(params.number);
  const task = number ? await getTask(params.id, number) : null;
  if (!task) return taskProblem("not_found");
  return NextResponse.json(
    {
      task: served(task, ctx.directory),
      canEdit: ctx.ownTask(task),
      canAdd: ctx.canAdd,
      enabled: ctx.enabled,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Change a task. The circle's editors change anything (so can whoever added
 * it, where any resident may add tasks), including giving it to a person or
 * a role. The task's owner — or whoever holds its role — can move it along
 * (status, checklist ticks); an owner can hand it back; anyone can take on a
 * task nobody (and no role) has. Done, a role's task keeps who held the
 * role (`holderAtCompletion`).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await tasksContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  const number = parseNumber(params.number);
  if (!number) return taskProblem("not_found");
  const parsed = await readBody(request, taskUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const ownerName = personName(ctx.directory, parsed.data.ownerId ?? null);
  if (parsed.data.ownerId && !ownerName) return problem("That person isn't in the directory");
  const role = parsed.data.ownerRole
    ? namedRole(ctx.directory, parsed.data.ownerRole, params.id)
    : null;
  if (parsed.data.ownerRole && !role) return problem("Nobody in that circle has that role");
  const update: TaskUpdate = parsed.data.ownerRole
    ? { ...parsed.data, ownerRole: role!.role }
    : parsed.data;

  const me = ctx.user.personId ?? null;
  const allowed = (task: Task, change: TaskUpdate) => {
    if (ctx.ownTask(task)) return true;
    const fields = Object.keys(change);
    const has = isHolder(served(task, ctx.directory), me);
    const claiming = fields.length === 1 && change.ownerId === me && !!me && isUnassigned(task);
    const movingAlong =
      has &&
      fields.every(
        (field) =>
          field === "status" ||
          field === "toggle" ||
          // Handing it back: a person's task (a role's stays the role's).
          (field === "ownerId" && change.ownerId === null && !task.ownerRole)
      );
    return claiming || movingAlong;
  };
  const result = await updateTask(
    params.id,
    number,
    { name: ctx.user.name },
    update,
    {
      ownerName,
      roleLabel: role?.label ?? null,
      completedBy: (task) =>
        holderAtCompletion(holdersOf({ ...task, status: "todo" }, ctx.directory), me),
    },
    allowed
  );
  if (!result.ok) return taskProblem(result.reason);
  const task = result.task!;
  const before = result.before!;
  const url = `/circles/${params.id}/tasks/${task.number}`;

  // A new owner (or a role's holders) hears about it; so does whoever added a task when it's done.
  const newRole = !!task.ownerRole && !sameAssignee(task.ownerRole, before.ownerRole);
  const newOwner = !!task.ownerId && task.ownerId !== before.ownerId && !task.ownerRole;
  if (newOwner || (newRole && task.status !== "done")) {
    const told = holdersOf(task, ctx.directory)
      .map((holder) => holder.personId)
      .filter((personId) => personId !== me);
    if (told.length)
      await notify({
        topic: "tasks",
        title: newRole
          ? `${ctx.user.name} gave ${assigneePhrase(
              task.ownerRole!,
              role?.label ?? task.ownerRole!.position ?? ctx.circle.name
            )} a task in ${ctx.circle.name}`
          : `${ctx.user.name} gave you a task in ${ctx.circle.name}`,
        body: task.title,
        url,
        tag: `task-${task.id}`,
        exceptUserId: ctx.user.id,
        onlyUserIds: await userIdsForPeople(told),
      });
  }
  if (task.status === "done" && before.status !== "done") {
    await notify({
      topic: "tasks",
      title: `${ctx.user.name} finished a task in ${ctx.circle.name}`,
      body: task.title,
      url,
      tag: `task-${task.id}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: [task.createdBy.userId],
    });
  }
  // A repeating task, done: the next one was made (`next`).
  return NextResponse.json({
    task: served(task, ctx.directory),
    next: result.next ? served(result.next, ctx.directory) : null,
  });
}

/** Delete a task: the circle's editors, or whoever added it where any resident may add tasks. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await tasksContext(params.id, { write: true });
  if ("error" in ctx) return ctx.error;
  const number = parseNumber(params.number);
  if (!number) return taskProblem("not_found");
  const existing = await getTask(params.id, number);
  if (!existing) return taskProblem("not_found");
  if (!ctx.ownTask(existing)) return taskProblem("forbidden");
  const result = await deleteTask(params.id, number);
  if (!result.ok) return taskProblem(result.reason);
  if (result.before) await deleteCommentsForTask(params.id, result.before.id);
  return NextResponse.json({ ok: true });
}
