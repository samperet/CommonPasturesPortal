"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CalendarDays, Flag, Repeat } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Circle } from "@/lib/circles/types";
import {
  REPEAT_LABELS,
  STATUS_LABELS,
  TASK_STATUSES,
  checklistProgress,
  isHolder,
  isOverdue,
  type ServedTask,
  type TaskStatus,
  type TaskSummary,
} from "@/lib/tasks/shared";
import { roleHolders, roleLabel, rolesOf, sameAssignee, type TaskRole } from "@/lib/tasks/roles";
import { circleFamily, circleTree } from "@/lib/circles/tiers";
import { isCommunity } from "@/lib/circles/ids";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/text";
import { shortDate } from "@/lib/time";
import { useCircles, useDirectory } from "@/components/directory/use-directory";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";

/** `canEdit`: change any task; `canAdd`: add one (any resident, where the circle's Tasks module allows). */
export type TasksResponse = {
  tasks: TaskSummary[];
  canEdit: boolean;
  canAdd: boolean;
  enabled: boolean;
};
/** `canEdit` here is for this task: the circle's editors, or whoever added it where any resident may. */
export type TaskResponse = {
  task: ServedTask;
  canEdit: boolean;
  canAdd: boolean;
  enabled: boolean;
};
type Task = ServedTask;

export const tasksQuery = (circleId: string) => ({
  queryKey: ["tasks", circleId],
  queryFn: () => apiFetch<TasksResponse>(`/api/circles/${circleId}/tasks`),
});

/** Change a task, then refresh the lists it shows up in. */
/** A repeating task, done: say that the next one's been made. */
export function nextTaskToast(next: Task | null | undefined) {
  return next
    ? {
        title: `Next one made: #${next.number}`,
        description: next.dueDate ? `Due ${shortDate(next.dueDate)}` : undefined,
      }
    : null;
}

export function useTaskUpdate(circleId: string, number: number, onDone?: (task: Task) => void) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (update: Record<string, unknown>) =>
      apiFetch<{ task: Task; next?: Task | null }>(`/api/circles/${circleId}/tasks/${number}`, {
        method: "PATCH",
        body: JSON.stringify(update),
      }),
    onSuccess: ({ task, next }) => {
      const said = nextTaskToast(next);
      if (said) toast(said);
      queryClient.setQueryData<TaskResponse>(["task", circleId, number], (old) =>
        old ? { ...old, task } : old
      );
      queryClient.invalidateQueries({ queryKey: ["tasks", circleId] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      onDone?.(task);
    },
    onError: (error: Error) =>
      toast({
        title: "Could not change the task",
        description: error.message,
        variant: "destructive",
      }),
  });
}

/** Whether you can move a task along: the circle's editors, or whoever has it (its owner, or its role's holders). */
export const canMoveTask = (
  task: Pick<Task, "ownerId" | "holders">,
  canEdit: boolean,
  personId: string | null | undefined
) => canEdit || isHolder(task, personId);

export const STATUS_STYLES: Record<TaskStatus, { dot: string; pill: PillTone; column: string }> = {
  todo: { dot: "bg-moss", pill: "accent", column: "border-t-moss" },
  doing: { dot: "bg-sun", pill: "amber", column: "border-t-sun" },
  blocked: { dot: "bg-destructive", pill: "destructive", column: "border-t-destructive" },
  done: { dot: "bg-pine", pill: "pine", column: "border-t-pine" },
};

export function StatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <Pill tone={STATUS_STYLES[status].pill} className={cn("gap-1.5 font-semibold", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_STYLES[status].dot)} aria-hidden />
      {STATUS_LABELS[status]}
    </Pill>
  );
}

export function StatusSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as TaskStatus)}
      onClick={(event) => event.stopPropagation()}
      className={cn("h-8 rounded-md px-2 text-xs font-medium", className)}
      aria-label="Status"
    >
      {TASK_STATUSES.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABELS[status]}
        </option>
      ))}
    </Select>
  );
}

/**
 * Who has a task: a person; or a role — "Trash Master", with whoever holds it
 * now (or "nobody now"); a role's finished task shows who held it then.
 */
export function TaskOwner({
  task,
  hereId,
  className,
}: {
  task: Pick<Task, "ownerName" | "ownerRole" | "holders" | "status">;
  /** The task's circle (a role from another circle names its circle). */
  hereId?: string;
  className?: string;
}) {
  const circles = useCircles();
  if (!task.ownerRole) return <OwnerChip name={task.ownerName} className={className} />;
  const label = roleLabel(task.ownerRole, circles ?? [], hereId);
  const who =
    task.status === "done"
      ? task.ownerName
      : task.ownerRole.position || task.holders.length <= 2
        ? task.holders.map((holder) => holder.name).join(", ") || null
        : `${task.holders.length} people`;
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-foreground", className)}
      title={
        task.ownerRole.position
          ? `Given to the ${label}: whoever holds the role${who ? ` (${who})` : ""}`
          : `Given to ${label}: everyone in it${who ? ` (${who})` : ""}`
      }
      data-task-role={task.ownerRole.position ?? `group:${task.ownerRole.circleId}`}
    >
      <BadgeCheck className="h-5 w-5 shrink-0 text-pine" aria-hidden />
      <span className="min-w-0 truncate">
        <span className="font-medium">{label}</span>
        <span className="text-muted"> · {who ?? "nobody now"}</span>
      </span>
    </span>
  );
}

export function OwnerChip({ name, className }: { name: string | null; className?: string }) {
  if (!name) return <span className={cn("text-xs text-muted", className)}>Unassigned</span>;
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-foreground", className)}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/40 text-[0.65rem] font-bold text-primary-foreground"
        aria-hidden
      >
        {initials(name)}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

/** A repeating task's mark: "Repeats monthly". */
export function RepeatMark({ task }: { task: Pick<Task, "repeat"> }) {
  if (!task.repeat) return null;
  const label = `Repeats ${REPEAT_LABELS[task.repeat].toLowerCase()}`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" title={label}>
      <Repeat className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function DueLabel({
  task,
  className,
}: {
  task: Pick<Task, "dueDate" | "status">;
  className?: string;
}) {
  if (!task.dueDate) return null;
  const late = isOverdue(task);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        late ? "font-semibold text-destructive" : "text-muted",
        className
      )}
      title={late ? "Overdue" : "Due"}
    >
      <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {late ? "Overdue · " : ""}
      {shortDate(task.dueDate)}
    </span>
  );
}

export function PriorityFlag({ task }: { task: Pick<Task, "priority"> }) {
  if (task.priority !== "high") return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold text-destructive"
      title="High priority"
    >
      <Flag className="h-3.5 w-3.5 fill-current" aria-hidden /> High
    </span>
  );
}

export function ProgressBar({
  task,
  className,
}: {
  task: Pick<Task, "checklist">;
  className?: string;
}) {
  const progress = checklistProgress(task);
  if (!progress) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-xs text-muted", className)}
      title={`${progress.done} of ${progress.total} checklist items done`}
    >
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-accent">
        <span
          className="block h-full rounded-full bg-pine transition-all"
          style={{ width: `${progress.percent}%` }}
        />
      </span>
      {progress.done}/{progress.total}
    </span>
  );
}

/** Who a task is for: a person, a role (or a whole group), or neither. */
export type Assignee = { ownerId: string | null; ownerRole: TaskRole | null };

const roleValue = (role: TaskRole) =>
  `r:${role.circleId}:${encodeURIComponent(role.position ?? "")}`;
const fromValue = (value: string): Assignee => {
  if (value.startsWith("p:")) return { ownerId: value.slice(2), ownerRole: null };
  if (value.startsWith("r:")) {
    const [circleId, position] = value.slice(2).split(":");
    return {
      ownerId: null,
      ownerRole: { circleId, position: position ? decodeURIComponent(position) : null },
    };
  }
  return { ownerId: null, ownerRole: null };
};

/** The roles and groups to offer, each with who has it now: "Trash Master · Cara Cedar". */
export function useAssignees(circle: Circle | undefined) {
  const directory = useDirectory();
  return useMemo(() => {
    const people = [...(directory?.people ?? [])]
      .filter((person) => person.resident !== false)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    const circles = directory?.circles ?? [];
    const nameOf = (personId: string) =>
      people.find((person) => person.id === personId)?.displayName ?? null;
    const describe = (role: TaskRole, here: boolean) => {
      const holders = roleHolders(circles, role, nameOf).map((holder) => holder.name);
      const label = here && role.position ? role.position : roleLabel(role, circles);
      const who = role.position
        ? holders.join(", ") || "nobody now"
        : `everyone in it (${holders.length})`;
      return { role, label: `${label} · ${who}` };
    };
    const rolesIn = (entry: Circle, here: boolean) =>
      rolesOf(entry).map((position) => describe({ circleId: entry.id, position }, here));
    // Groups: this circle and its sub groups first, then every other (not Community: it has no members).
    const tree = circleTree(circles).filter(({ circle: entry }) => !isCommunity(entry.id));
    const near = new Set(circle ? circleFamily(circles, circle.id) : []);
    const groups = [
      ...tree.filter(({ circle: entry }) => near.has(entry.id)),
      ...tree.filter(({ circle: entry }) => !near.has(entry.id)),
    ].map(({ circle: entry }) => describe({ circleId: entry.id, position: null }, false));
    return {
      people,
      ownRoles: circle ? rolesIn(circle, true) : [],
      otherRoles: circles
        .filter((entry) => entry.id !== circle?.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((entry) => rolesIn(entry, false)),
      groups,
    };
  }, [directory, circle]);
}

/**
 * Choose who a task is for: one of this circle's roles (whoever holds it
 * then has the task, so a repeating task follows the role), one of its
 * members, a whole group (everyone in a circle or sub group), a role in
 * another circle, or any other resident.
 */
export function OwnerSelect({
  circle,
  value,
  onChange,
  disabled,
  className,
  people = true,
}: {
  circle: Circle | undefined;
  value: Assignee;
  onChange: (assignee: Assignee) => void;
  disabled?: boolean;
  className?: string;
  /** Offer people too (off: roles and groups only, as a task button's choice). */
  people?: boolean;
}) {
  const { people: everyone, ownRoles, otherRoles, groups } = useAssignees(circle);
  const memberIds = new Set((circle?.seats ?? []).map((seat) => seat.personId));
  const members = everyone.filter((person) => memberIds.has(person.id));
  const others = everyone.filter((person) => !memberIds.has(person.id));
  const current = value.ownerRole
    ? roleValue(value.ownerRole)
    : value.ownerId
      ? `p:${value.ownerId}`
      : "";
  // A role the task has that no seat has any more is still shown, so the choice isn't lost.
  const known = [...ownRoles, ...otherRoles, ...groups].some((entry) =>
    sameAssignee(entry.role, value.ownerRole)
  );
  const optionFor = (entry: { role: TaskRole; label: string }) => (
    <option
      key={roleValue(entry.role)}
      value={sameAssignee(entry.role, value.ownerRole) ? current : roleValue(entry.role)}
    >
      {entry.label}
    </option>
  );
  return (
    <Select
      value={current}
      disabled={disabled}
      onChange={(event) => onChange(fromValue(event.target.value))}
      className={className}
      aria-label="Owner"
    >
      <option value="">{people ? "Unassigned" : "Choose a role or group"}</option>
      {value.ownerRole && !known ? (
        <option value={current}>
          {value.ownerRole.position ?? "That group"} · nobody holds it now
        </option>
      ) : null}
      {ownRoles.length ? (
        <optgroup label={circle ? `${circle.name} roles` : "Roles"}>
          {ownRoles.map(optionFor)}
        </optgroup>
      ) : null}
      {people && members.length ? (
        <optgroup label={circle ? `${circle.name} members` : "Members"}>
          {members.map((person) => (
            <option key={person.id} value={`p:${person.id}`}>
              {person.displayName}
            </option>
          ))}
        </optgroup>
      ) : null}
      {groups.length ? <optgroup label="Groups">{groups.map(optionFor)}</optgroup> : null}
      {otherRoles.length ? (
        <optgroup label="Roles in other circles">{otherRoles.map(optionFor)}</optgroup>
      ) : null}
      {people ? (
        <optgroup label={members.length ? "Everyone else" : "Residents"}>
          {others.map((person) => (
            <option key={person.id} value={`p:${person.id}`}>
              {person.displayName}
            </option>
          ))}
        </optgroup>
      ) : null}
    </Select>
  );
}
