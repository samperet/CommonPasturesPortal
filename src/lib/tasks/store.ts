import { randomUUID } from "crypto";
import { z } from "zod";
import { deleteJson, enqueue, mutateJson, readJson } from "@/lib/storage";
import { todayInVermont } from "@/lib/time";
import {
  PRIORITY_LABELS,
  REPEAT_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_REPEATS,
  TASK_STATUSES,
  nextOccurrence,
  type Task,
  type TaskPerson,
} from "./shared";
import { assigneePhrase, sameAssignee, type Holder, type TaskRole } from "./roles";

/**
 * Circle tasks: each circle's in one document (`tasks/<circleId>.json`),
 * numbered in the order they're added. A task keeps a short log of what's
 * happened to it (who moved it along, who took it on). A task is for a
 * person (`ownerId`) or a role (`ownerRole`, `roles.ts`), never both. A task
 * can repeat (weekly, monthly, every 3 months, yearly): when it's done, the
 * next one is made at once — the same, not started, checklist unticked, due
 * a period after it was due (the first such date not already past) — once.
 * A role's task, done, keeps who held the role then (`holderAtCompletion`);
 * its next one is the role's again, for whoever holds it by then.
 */

const MAX_TASKS = 1000;
const MAX_ACTIVITY = 50;
const MAX_CHECKLIST = 50;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-15");
const title = z
  .string()
  .trim()
  .min(1, "Give the task a title")
  .max(160, "Keep the title to 160 characters");
const description = z.string().max(10_000, "Keep the description to 10,000 characters");
const roleSchema = z.object({
  circleId: z.string().min(1).max(80),
  /** Null: the whole group, everyone in the circle. */
  position: z.string().trim().min(1, "Choose a role").max(40).nullable(),
});
const checklistItem = z.object({
  id: z.string().max(40).optional(),
  text: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});

export const taskInputSchema = z.object({
  title,
  description: description.default(""),
  status: z.enum(TASK_STATUSES).default("todo"),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  ownerId: z.string().max(80).nullable().default(null),
  /** Or a role (not with `ownerId`). */
  ownerRole: roleSchema.nullable().default(null),
  dueDate: isoDate.nullable().default(null),
  checklist: z.array(checklistItem).max(MAX_CHECKLIST).default([]),
  repeat: z.enum(TASK_REPEATS).nullable().default(null),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const taskUpdateSchema = z
  .object({
    title,
    description,
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    ownerId: z.string().max(80).nullable(),
    /** Give it to a role (null: to nobody); setting a person clears the role, and the other way round. */
    ownerRole: roleSchema.nullable(),
    dueDate: isoDate.nullable(),
    checklist: z.array(checklistItem).max(MAX_CHECKLIST),
    repeat: z.enum(TASK_REPEATS).nullable(),
    /** Tick (or untick) one checklist item. */
    toggle: z.object({ id: z.string().max(40), done: z.boolean() }),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

const key = (circleId: string) => `tasks/${circleId}.json`;
type Stored = { nextNumber: number; tasks: Task[] };

function normalize(raw: unknown): Stored {
  const value = raw as Partial<Stored> | null;
  const tasks = Array.isArray(value?.tasks) ? (value!.tasks as Task[]) : [];
  return {
    tasks,
    nextNumber: value?.nextNumber ?? tasks.reduce((max, task) => Math.max(max, task.number), 0) + 1,
  };
}

export async function listTasks(circleId: string): Promise<Task[]> {
  return normalize(await readJson(key(circleId))).tasks;
}

export async function getTask(circleId: string, number: number): Promise<Task | null> {
  return (await listTasks(circleId)).find((task) => task.number === number) ?? null;
}

export type Failure = "not_found" | "full" | "forbidden";
export type TaskResult =
  | { ok: true; task: Task | null; before: Task | null; next?: Task | null }
  | { ok: false; reason: Failure };

type Change = { stored: Stored; task: Task | null; before: Task | null; next?: Task | null };

async function mutate(
  circleId: string,
  change: (stored: Stored) => Change | Failure
): Promise<TaskResult> {
  return mutateJson<TaskResult>(key(circleId), (raw) => {
    const result = change(normalize(raw));
    if (typeof result === "string") return { write: false, result: { ok: false, reason: result } };
    return {
      value: result.stored,
      result: { ok: true, task: result.task, before: result.before, next: result.next ?? null },
    };
  });
}

const log = (task: Task, by: string, text: string): Task => ({
  ...task,
  activity: [...task.activity, { at: new Date().toISOString(), by, text }].slice(-MAX_ACTIVITY),
});
const withIds = (items: { id?: string; text: string; done: boolean }[]) =>
  items.map((item) => ({
    id: item.id || randomUUID().slice(0, 8),
    text: item.text,
    done: item.done,
  }));

/** "the Trash Master", or a group's name: how the log names a role. */
const theRole = (role: TaskRole, label: string | null | undefined) =>
  assigneePhrase(role, label ?? role.position ?? "group");

/**
 * Add a task. `ownerName` names its owner; for a role, `roleLabel` names the
 * role (the route checks both against the directory first).
 */
export function createTask(
  circleId: string,
  author: TaskPerson,
  input: TaskInput,
  ownerName: string | null,
  roleLabel: string | null = null
) {
  return mutate(circleId, (stored) => {
    if (stored.tasks.length >= MAX_TASKS) return "full";
    const now = new Date().toISOString();
    const role: TaskRole | null = input.ownerRole && !input.ownerId ? input.ownerRole : null;
    let task: Task = {
      id: randomUUID(),
      number: stored.nextNumber,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      ownerId: input.ownerId,
      ownerName: input.ownerId ? ownerName : null,
      ...(role ? { ownerRole: role } : {}),
      dueDate: input.dueDate,
      checklist: withIds(input.checklist),
      createdAt: now,
      createdBy: { userId: author.userId, personId: author.personId, name: author.name },
      updatedAt: now,
      completedAt: input.status === "done" ? now : null,
      activity: [],
      repeat: input.repeat,
    };
    task = log(
      task,
      author.name,
      ownerName && input.ownerId
        ? `added this task, for ${ownerName}`
        : role
          ? `added this task, for ${theRole(role, roleLabel)}`
          : "added this task"
    );
    return {
      stored: { nextNumber: stored.nextNumber + 1, tasks: [...stored.tasks, task] },
      task,
      before: null,
    };
  });
}

/**
 * The next of a repeating task: the same, not started, its checklist
 * unticked, due a period on — a role's again (whoever then holds it), not
 * the person who held it this time.
 */
function nextOf(task: Task, number: number, by: string): Task {
  const now = new Date().toISOString();
  const repeat = task.repeat!;
  return log(
    {
      ...task,
      ...(task.ownerRole ? { ownerId: null, ownerName: null } : {}),
      id: randomUUID(),
      number,
      status: "todo",
      dueDate: nextOccurrence(task.dueDate, repeat, todayInVermont()),
      checklist: task.checklist.map((item) => ({ ...item, done: false })),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      activity: [],
      repeatedAs: null,
    },
    by,
    `made this when #${task.number} was done (it repeats ${REPEAT_LABELS[repeat].toLowerCase()})`
  );
}

/** For a change to a task: who a new owner or role is, and who'd be kept as doing a role's task. */
export interface TaskNames {
  /** The new owner's name (`update.ownerId`). */
  ownerName: string | null;
  /** The new role's label (`update.ownerRole`). */
  roleLabel?: string | null;
  /** Who held a role's task when it's done (`roles.ts`: `holderAtCompletion`). */
  completedBy?: (task: Task) => Holder | null;
}

/**
 * Change a task. `canEdit`: the circle's editors change anything; others
 * (the task's owner, say) only what `allowed` lets them.
 */
export function updateTask(
  circleId: string,
  number: number,
  actor: { name: string },
  update: TaskUpdate,
  names: TaskNames,
  allowed: (task: Task, update: TaskUpdate) => boolean
) {
  const { ownerName } = names;
  return mutate(circleId, (stored) => {
    const before = stored.tasks.find((task) => task.number === number);
    if (!before) return "not_found";
    if (!allowed(before, update)) return "forbidden";
    let task: Task = { ...before };
    const say = (text: string) => (task = log(task, actor.name, text));

    if (update.title !== undefined && update.title !== task.title) {
      task.title = update.title;
      say("renamed this task");
    }
    if (update.description !== undefined && update.description !== task.description) {
      task.description = update.description;
      say("edited the description");
    }
    if (update.status && update.status !== task.status) {
      task.status = update.status;
      task.completedAt = update.status === "done" ? new Date().toISOString() : null;
      say(`moved this to ${STATUS_LABELS[update.status]}`);
      // A role's task: done, it keeps who held the role; opened again, it's the role's again.
      if (task.ownerRole) {
        const holder = update.status === "done" ? names.completedBy?.(task) ?? null : null;
        task.ownerId = holder?.personId ?? null;
        task.ownerName = holder?.name ?? null;
      }
    }
    if (update.priority && update.priority !== task.priority) {
      task.priority = update.priority;
      say(`set the priority to ${PRIORITY_LABELS[update.priority]}`);
    }
    if (
      update.ownerId !== undefined &&
      (update.ownerId !== task.ownerId || (update.ownerId && task.ownerRole))
    ) {
      task.ownerId = update.ownerId;
      task.ownerName = update.ownerId ? ownerName : null;
      task.ownerRole = null;
      say(
        update.ownerId
          ? ownerName === actor.name
            ? "took this on"
            : `gave this to ${ownerName}`
          : "left this unassigned"
      );
    } else if (update.ownerRole !== undefined) {
      const role = update.ownerRole;
      const same = sameAssignee(role, task.ownerRole);
      if (!same && (role || task.ownerRole)) {
        task.ownerRole = role;
        if (task.status !== "done" || !role) {
          task.ownerId = null;
          task.ownerName = null;
        }
        say(role ? `gave this to ${theRole(role, names.roleLabel)}` : "left this unassigned");
      }
    }
    if (update.dueDate !== undefined && update.dueDate !== task.dueDate) {
      task.dueDate = update.dueDate;
      say(update.dueDate ? `set it due ${update.dueDate}` : "removed the due date");
    }
    if (update.repeat !== undefined && update.repeat !== (task.repeat ?? null)) {
      task.repeat = update.repeat;
      say(
        update.repeat
          ? `set it to repeat ${REPEAT_LABELS[update.repeat].toLowerCase()}`
          : "stopped it repeating"
      );
    }
    if (update.checklist) {
      const next = withIds(update.checklist);
      const had = new Set(task.checklist.map((item) => item.id));
      const has = new Set(next.map((item) => item.id));
      const added = next.filter((item) => !had.has(item.id));
      const removed = task.checklist.filter((item) => !has.has(item.id));
      task.checklist = next;
      if (added.length === 1 && !removed.length) say(`added “${added[0].text}” to the checklist`);
      else if (removed.length === 1 && !added.length)
        say(`removed “${removed[0].text}” from the checklist`);
      else say("updated the checklist");
    }
    if (update.toggle) {
      const item = task.checklist.find((entry) => entry.id === update.toggle!.id);
      if (!item) return "not_found";
      if (item.done !== update.toggle.done) {
        task.checklist = task.checklist.map((entry) =>
          entry.id === item.id ? { ...entry, done: update.toggle!.done } : entry
        );
        say(`${update.toggle.done ? "checked off" : "unchecked"} “${item.text}”`);
      }
    }
    if (task.activity === before.activity) return { stored, task: before, before };
    task.updatedAt = new Date().toISOString();
    // A repeating task, done (the first time): the next one, due a period on.
    let next: Task | null = null;
    if (
      task.repeat &&
      task.status === "done" &&
      before.status !== "done" &&
      !task.repeatedAs &&
      stored.tasks.length < MAX_TASKS
    ) {
      next = nextOf(task, stored.nextNumber, actor.name);
      task.repeatedAs = next.number;
      say(`made the next one, #${next.number}, due ${next.dueDate}`);
    }
    const tasks = stored.tasks.map((entry) => (entry.id === task.id ? task : entry));
    return {
      stored: next
        ? { nextNumber: stored.nextNumber + 1, tasks: [...tasks, next] }
        : { ...stored, tasks },
      task,
      before,
      next,
    };
  });
}

export function deleteTask(circleId: string, number: number) {
  return mutate(circleId, (stored) => {
    const task = stored.tasks.find((entry) => entry.number === number);
    if (!task) return "not_found";
    return {
      stored: { ...stored, tasks: stored.tasks.filter((entry) => entry.id !== task.id) },
      task: null,
      before: task,
    };
  });
}

/** Remove a circle's tasks (when the circle is deleted). */
export function deleteCircleTasks(circleId: string) {
  return enqueue(key(circleId), () => deleteJson(key(circleId)));
}
