import { todayInVermont } from "@/lib/time";
import type { Actor } from "@/lib/auth/actor";
import type { CommentRecord } from "@/lib/comments/shared";
import { isUnassigned, type Holder, type TaskRole } from "./roles";

/**
 * Circle tasks, as shared by the server and the browser (no server imports).
 */

export const TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

/** How often a task comes round again: when it's done, the next one is made (`lib/tasks/store.ts`). */
export const TASK_REPEATS = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type TaskRepeat = (typeof TASK_REPEATS)[number];
export const REPEAT_LABELS: Record<TaskRepeat, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  yearly: "Yearly",
};

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The date a week, a month, three months, or a year after `from`
 * (YYYY-MM-DD). From a day the next month hasn't got (the 31st), it's that
 * month's last day.
 */
export function nextDue(from: string, repeat: TaskRepeat): string {
  const [year, month, day] = from.split("-").map(Number);
  if (repeat === "weekly")
    return new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10);
  const months = month - 1 + { monthly: 1, quarterly: 3, yearly: 12 }[repeat];
  const nextYear = year + Math.floor(months / 12);
  const nextMonth = months % 12;
  const last = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  return `${nextYear}-${pad(nextMonth + 1)}-${pad(Math.min(day, last))}`;
}

/** When a repeating task done now is next due: a period after it was due (or today), and not already past. */
export function nextOccurrence(dueDate: string | null, repeat: TaskRepeat, today: string) {
  let next = nextDue(dueDate ?? today, repeat);
  while (next < today) next = nextDue(next, repeat);
  return next;
}

/**
 * Which tasks a Tasks module (or the Tasks page) shows; a circle can have
 * several modules, each its own view: open, done or all; everyone's, the
 * reader's own, nobody's, or one person's ("own" and "one person's" count
 * tasks given to a role they hold); due any time, overdue, or within a week
 * or a month (overdue ones included); and perhaps only high priority, or
 * only repeating tasks.
 */
export const TASK_SHOWS = ["open", "done", "all"] as const;
export type TaskShow = (typeof TASK_SHOWS)[number];
export const SHOW_LABELS: Record<TaskShow, string> = { open: "Open", done: "Done", all: "All" };
export const TASK_WHOSE = ["everyone", "mine", "unassigned", "person"] as const;
export type TaskWhose = (typeof TASK_WHOSE)[number];
export const WHOSE_LABELS: Record<TaskWhose, string> = {
  everyone: "Everyone's",
  mine: "Each reader's own",
  unassigned: "Nobody's yet (unassigned)",
  person: "One person's",
};
export const TASK_DUES = ["any", "overdue", "week", "month"] as const;
export type TaskDue = (typeof TASK_DUES)[number];
export const DUE_LABELS: Record<TaskDue, string> = {
  any: "Any time",
  overdue: "Overdue",
  week: "Due within 7 days (and overdue)",
  month: "Due within 30 days (and overdue)",
};

export interface TaskView {
  show: TaskShow;
  whose: TaskWhose;
  /** With `whose: "person"`. */
  personId?: string;
  due: TaskDue;
  /** Only high priority. */
  high?: boolean;
  /** Only tasks that repeat. */
  repeating?: boolean;
}
export const DEFAULT_TASK_VIEW: TaskView = { show: "open", whose: "everyone", due: "any" };

const addDays = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

/** Whether a person has a task now: they're its owner, or hold the role it's given to (`holders`, as served). */
export const isHolder = (
  task: Pick<Task, "ownerId"> & { holders?: Holder[] },
  personId: string | null | undefined
) =>
  !!personId &&
  (task.holders
    ? task.holders.some((holder) => holder.personId === personId)
    : task.ownerId === personId);

/** Whether a task is in a view (`me`: the reader's person id; `today`: YYYY-MM-DD). */
export function inView(
  task: Pick<Task, "status" | "ownerId" | "dueDate" | "priority" | "ownerRole" | "repeat"> & {
    holders?: Holder[];
  },
  view: TaskView,
  me: string | null,
  today: string
) {
  if (view.show === "open" && task.status === "done") return false;
  if (view.show === "done" && task.status !== "done") return false;
  if (view.whose === "mine" && !isHolder(task, me)) return false;
  if (view.whose === "unassigned" && !isUnassigned(task)) return false;
  if (view.whose === "person" && !isHolder(task, view.personId)) return false;
  if (view.high && task.priority !== "high") return false;
  if (view.repeating && !task.repeat) return false;
  if (view.due === "any") return true;
  if (!task.dueDate) return false;
  if (view.due === "overdue") return task.status !== "done" && task.dueDate < today;
  return task.dueDate <= addDays(today, view.due === "week" ? 7 : 30);
}

/** A view in a few words: "Open overdue tasks, nobody's yet". */
export function describeView(view: TaskView, personName?: string | null) {
  const show = SHOW_LABELS[view.show];
  const parts = [view.due === "overdue" ? `${show} overdue tasks` : `${show} tasks`];
  if (view.due === "week" || view.due === "month")
    parts.push(`due within ${view.due === "week" ? 7 : 30} days`);
  if (view.whose === "mine") parts.push("each reader's own");
  else if (view.whose === "unassigned") parts.push("nobody's yet");
  else if (view.whose === "person") parts.push(`${personName ?? "one person"}'s`);
  if (view.high) parts.push("high priority");
  if (view.repeating) parts.push("repeating");
  return parts.join(", ");
}

/** Who added a task (stored with it). */
export type TaskPerson = Pick<Actor, "userId" | "personId" | "name">;

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** Something that happened to a task: "moved this to In progress". */
export interface TaskEvent {
  at: string;
  by: string;
  text: string;
}

export interface Task {
  id: string;
  /** Numbered per circle (#1, #2, …): the task's address. */
  number: number;
  title: string;
  /** Markdown, shown like a wiki page (so `[[Page]]` links work). */
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /**
   * Who's doing it: a person in the directory. For a task given to a role,
   * unset while it's open (whoever holds the role has it) and, once done,
   * whoever held the role then.
   */
  ownerId: string | null;
  ownerName: string | null;
  /** Or a role (`roles.ts`): whoever holds it now has the task. */
  ownerRole?: TaskRole | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  checklist: ChecklistItem[];
  createdAt: string;
  createdBy: TaskPerson;
  updatedAt: string;
  completedAt: string | null;
  /** Newest last; the most recent 50. */
  activity: TaskEvent[];
  /** It comes round again: done, the next one is made. */
  repeat?: TaskRepeat | null;
  /** The next one, made when this was done (so doing it again doesn't make another). */
  repeatedAs?: number | null;
}

/** A task as served: with who has it now (its owner, or its role's holders; `roles.ts`). */
export type ServedTask = Task & { holders: Holder[] };

/** A task as listed: with how many comments it has, and who has it now. */
export type TaskSummary = Omit<Task, "activity" | "description"> & {
  commentCount: number;
  hasDescription: boolean;
  holders: Holder[];
};

/** A comment on a task (replies nest to any depth); see `lib/comments/shared.ts`. */
export type TaskComment = CommentRecord & { taskId: string };

/** How far along a task's checklist is, or null with no checklist. */
export function checklistProgress(task: Pick<Task, "checklist">) {
  if (!task.checklist.length) return null;
  const done = task.checklist.filter((item) => item.done).length;
  return {
    done,
    total: task.checklist.length,
    percent: Math.round((done / task.checklist.length) * 100),
  };
}

export const isOverdue = (task: Pick<Task, "dueDate" | "status">, today = todayInVermont()) =>
  !!task.dueDate && task.status !== "done" && task.dueDate < today;
