"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import { ListChecks, MessageSquare, Plus, Search, SlidersHorizontal } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { Circle } from "@/lib/circles/types";
import type { CircleModule } from "@/lib/circles/layout";
import { todayInVermont } from "@/lib/time";
import { featureEnabled } from "@/lib/circles/features";
import {
  PRIORITY_LABELS,
  REPEAT_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_REPEATS,
  TASK_STATUSES,
  DEFAULT_TASK_VIEW,
  describeView,
  inView,
  isHolder,
  type ServedTask as Task,
  type TaskPriority,
  type TaskRepeat,
  type TaskStatus,
  type TaskSummary,
} from "@/lib/tasks/shared";
import { isUnassigned } from "@/lib/tasks/roles";
import {
  DueLabel,
  OwnerSelect,
  TaskOwner,
  type Assignee,
  PriorityFlag,
  ProgressBar,
  RepeatMark,
  STATUS_STYLES,
  StatusSelect,
  canMoveTask,
  nextTaskToast,
  tasksQuery,
  type TasksResponse,
} from "@/components/tasks/task-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { ModuleToggle } from "@/components/circles/circle-modules";
import { useDirectory } from "@/components/directory/use-directory";
import { SectionHeading } from "@/components/ui/section-heading";
import { Pill } from "@/components/ui/pill";
import { Loading } from "@/components/ui/status";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented";

/** Open tasks first by status, then high priority, then soonest due, then oldest. */
const byUrgency = (a: TaskSummary, b: TaskSummary) =>
  TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) ||
  Number(b.priority === "high") - Number(a.priority === "high") ||
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
  a.number - b.number;

/** Move a task to another status straight away, then save it. */
function useMoveTask(circleId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ number, status }: { number: number; status: TaskStatus }) =>
      apiFetch<{ task: Task; next?: Task | null }>(`/api/circles/${circleId}/tasks/${number}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: ({ next }) => {
      const said = nextTaskToast(next);
      if (said) toast(said);
    },
    onMutate: async ({ number, status }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", circleId] });
      const previous = queryClient.getQueryData<TasksResponse>(["tasks", circleId]);
      queryClient.setQueryData<TasksResponse>(["tasks", circleId], (old) =>
        old
          ? {
              ...old,
              tasks: old.tasks.map((task) =>
                task.number === number
                  ? {
                      ...task,
                      status,
                      completedAt: status === "done" ? new Date().toISOString() : null,
                    }
                  : task
              ),
            }
          : old
      );
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["tasks", circleId], context.previous);
      toast({
        title: "Could not move the task",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: (_data, _error, { number }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", circleId] });
      queryClient.invalidateQueries({ queryKey: ["task", circleId, number] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
    },
  });
}

/** Add a task: a title, and optionally who it's for, when it's due, and how urgent it is. */
export function NewTaskForm({
  circle,
  onDone,
  onCancel,
}: {
  circle: Circle | undefined;
  onDone?: (task: Task) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const nobody: Assignee = { ownerId: null, ownerRole: null };
  const [owner, setOwner] = useState<Assignee>(nobody);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [repeat, setRepeat] = useState<TaskRepeat | "">("");
  const [more, setMore] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ task: Task }>(`/api/circles/${circle!.id}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title,
          ...owner,
          dueDate: dueDate || null,
          priority,
          repeat: repeat || null,
        }),
      }),
    onSuccess: ({ task }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", circle!.id] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      setTitle("");
      setOwner(nobody);
      setDueDate("");
      setPriority("normal");
      setRepeat("");
      toast({ title: `Task #${task.number} added` });
      onDone?.(task);
    },
    onError: (error: Error) =>
      toast({
        title: "Could not add the task",
        description: error.message,
        variant: "destructive",
      }),
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim() && circle) create.mutate();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          autoFocus
          placeholder="What needs doing? e.g. Clean the pellet stove"
          value={title}
          maxLength={160}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-white"
          aria-label="Task title"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setMore(!more)}
            aria-label="More details"
            aria-expanded={more}
            title="Owner, due date, priority, repeat"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          <Button type="submit" className="shrink-0" disabled={!title.trim() || create.isPending}>
            {create.isPending ? "Adding…" : "Add task"}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
      {more ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Owner
            <OwnerSelect circle={circle} value={owner} onChange={setOwner} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Due
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Priority
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {TASK_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Repeats
            <Select value={repeat} onChange={(e) => setRepeat(e.target.value as TaskRepeat | "")}>
              <option value="">Doesn&apos;t repeat</option>
              {TASK_REPEATS.map((value) => (
                <option key={value} value={value}>
                  {REPEAT_LABELS[value]}
                </option>
              ))}
            </Select>
          </label>
        </div>
      ) : null}
    </form>
  );
}

/** One task on the board or in a list. */
export function TaskCard({
  circleId,
  task,
  canEdit,
  onMove,
  draggable = false,
}: {
  circleId: string;
  task: TaskSummary;
  canEdit: boolean;
  onMove?: (status: TaskStatus) => void;
  draggable?: boolean;
}) {
  const { user } = useSession();
  const movable = canMoveTask(task, canEdit, user?.personId) && !!onMove;
  return (
    <div
      draggable={draggable && movable}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/task-number", String(task.number));
        event.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group flex flex-col gap-2 rounded-lg border border-border bg-white p-3 shadow-soft transition hover:border-primary",
        draggable && movable && "cursor-grab active:cursor-grabbing",
        task.status === "done" && "opacity-75"
      )}
    >
      <Link
        href={`/circles/${circleId}/tasks/${task.number}`}
        className="text-sm font-semibold leading-snug text-foreground hover:underline"
      >
        <span className="mr-1 font-normal text-muted">#{task.number}</span>
        <span className={cn(task.status === "done" && "line-through decoration-muted")}>
          {task.title}
        </span>
      </Link>
      {task.priority === "high" ||
      task.dueDate ||
      task.repeat ||
      task.checklist.length ||
      task.commentCount ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <PriorityFlag task={task} />
          <DueLabel task={task} />
          <RepeatMark task={task} />
          <ProgressBar task={task} />
          {task.commentCount ? (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted"
              title={`${task.commentCount} comments`}
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden /> {task.commentCount}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <TaskOwner task={task} hereId={circleId} />
        {movable ? (
          <StatusSelect value={task.status} onChange={(status) => onMove!(status)} />
        ) : null}
      </div>
    </div>
  );
}

type Who = "everyone" | "mine" | "unassigned";
type Kind = "all" | "repeating";

/** A circle's tasks as a board: a column for each status (stacked on phones), with filters and quick add. */
export function TaskBoardClient({ circleId }: { circleId: string }) {
  const directory = useDirectory();
  const circle = directory?.circles.find((entry) => entry.id === circleId);
  const { user } = useSession();
  const { data, isLoading, error } = useQuery(tasksQuery(circleId));
  const move = useMoveTask(circleId);
  const [who, setWho] = useState<Who>("everyone");
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const [showAllDone, setShowAllDone] = useState(false);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const enabled = featureEnabled(circle, "tasks");
  const canEdit = !!data?.canEdit && enabled;
  const canAdd = !!data?.canAdd && enabled;

  const visible = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    return (data?.tasks ?? [])
      .filter(
        (task) =>
          who === "everyone" ||
          (who === "mine" ? isHolder(task, user?.personId) : isUnassigned(task))
      )
      .filter((task) => kind === "all" || !!task.repeat)
      .filter(
        (task) =>
          !wanted ||
          task.title.toLowerCase().includes(wanted) ||
          String(task.number) === wanted.replace(/^#/, "")
      )
      .sort(byUrgency);
  }, [data, who, kind, query, user]);

  const columns = TASK_STATUSES.map((status) => {
    let tasks = visible.filter((task) => task.status === status);
    const total = tasks.length;
    if (status === "done") {
      tasks = [...tasks].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
      if (!showAllDone) tasks = tasks.slice(0, 8);
    }
    return { status, tasks, total };
  });

  const dropOn = (status: TaskStatus, event: React.DragEvent) => {
    event.preventDefault();
    setOver(null);
    const number = Number(event.dataTransfer.getData("text/task-number"));
    const task = data?.tasks.find((entry) => entry.number === number);
    if (task && task.status !== status) move.mutate({ number, status });
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={`/circles/${circleId}`} label={circle?.name ?? "Circle"} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <ListChecks className="h-6 w-6 text-primary" aria-hidden />{" "}
          {circle ? `${circle.name} tasks` : "Tasks"}
        </h1>
        <Link
          href={`/tasks?circle=${circleId}`}
          className="text-sm font-medium text-secondary-foreground hover:underline"
          data-all-tasks-link
        >
          Every circle&apos;s tasks
        </Link>
      </div>
      {circle && !enabled ? (
        <p className="text-sm text-muted">
          {circle.name} has turned its tasks off; these are kept as they were.
        </p>
      ) : null}
      {canAdd ? (
        <Card>
          <NewTaskForm circle={circle} />
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          size="sm"
          label="Whose tasks"
          value={who}
          onChange={setWho}
          options={[
            { value: "everyone", label: "Everyone" },
            { value: "mine", label: "Mine" },
            { value: "unassigned", label: "Unassigned" },
          ]}
        />
        <SegmentedControl
          size="sm"
          label="Which tasks"
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "repeating", label: "Repeating" },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            placeholder="Find a task"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-white pl-9"
            aria-label="Find a task"
          />
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <p className="text-sm text-foreground">{(error as Error).message}</p>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map(({ status, tasks, total }) => (
            <section
              key={status}
              aria-label={STATUS_LABELS[status]}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((current) => (current === status ? null : current))}
              onDrop={(event) => dropOn(status, event)}
              className={cn(
                "flex flex-col gap-2 rounded-card border border-t-4 border-border bg-surface/70 p-3 transition",
                STATUS_STYLES[status].column,
                over === status && "bg-accent ring-2 ring-primary"
              )}
            >
              <h2 className="flex items-center justify-between px-1 text-sm font-semibold text-foreground">
                {STATUS_LABELS[status]}{" "}
                <Pill tone="accent" className="py-0 text-muted">
                  {total}
                </Pill>
              </h2>
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  circleId={circleId}
                  task={task}
                  canEdit={canEdit}
                  draggable
                  onMove={
                    enabled
                      ? (next) => move.mutate({ number: task.number, status: next })
                      : undefined
                  }
                />
              ))}
              {!total ? (
                <p className="px-1 py-3 text-center text-xs text-muted">Nothing here</p>
              ) : null}
              {status === "done" && total > tasks.length ? (
                <button
                  type="button"
                  onClick={() => setShowAllDone(true)}
                  className="text-xs font-medium text-secondary-foreground hover:underline"
                >
                  Show all {total} done
                </button>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A circle's Tasks module: the tasks its view picks (its settings — open
 * ones by default; a circle can have several, each its own view), most
 * urgent first (done ones, the latest done first), with **New task** and
 * a link to the board.
 */
export function TasksModule({
  circle,
  module,
  title,
}: {
  circle: Circle;
  module: CircleModule;
  title: string;
}) {
  const { data, isLoading } = useQuery(tasksQuery(circle.id));
  const { user } = useSession();
  const [adding, setAdding] = useState(false);
  const canAdd = !!data?.canAdd;
  const tasks = data?.tasks ?? [];
  const view = module.tasks?.view ?? DEFAULT_TASK_VIEW;
  const plain =
    view.show === "open" && view.whose === "everyone" && view.due === "any" && !view.high;
  const today = todayInVermont();
  const shown = tasks
    .filter((task) => inView(task, view, user?.personId ?? null, today))
    .sort((a, b) =>
      view.show === "done"
        ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
        : byUrgency(a, b)
    );
  const counts = (["todo", "doing", "blocked"] as const)
    .map((status) => ({ status, count: shown.filter((task) => task.status === status).length }))
    .filter((entry) => entry.count);
  return (
    <div className="flex flex-col gap-4" data-tasks-view={view.show}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading icon={ListChecks} toggle={<ModuleToggle />}>
          <Link href={`/circles/${circle.id}/tasks`} className="hover:underline">
            {title}
          </Link>
        </SectionHeading>
        {canAdd && !adding ? (
          <Button className="gap-1" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> New task
          </Button>
        ) : null}
      </div>
      {adding ? (
        <NewTaskForm
          circle={circle}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : null}
      {isLoading ? (
        <Loading />
      ) : shown.length ? (
        <>
          <p className="text-sm text-muted">
            {plain
              ? counts
                  .map(({ status, count }) => `${count} ${STATUS_LABELS[status].toLowerCase()}`)
                  .join(" · ")
              : `${describeView(
                  view,
                  view.personId ? personName(circle, view.personId) : null
                )} · ${shown.length}`}
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {shown.slice(0, 6).map((task) => (
              <li
                key={task.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0"
                data-task-row={task.number}
              >
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_STYLES[task.status].dot)}
                  title={STATUS_LABELS[task.status]}
                  aria-hidden
                />
                <Link
                  href={`/circles/${circle.id}/tasks/${task.number}`}
                  className={cn(
                    "min-w-0 flex-1 font-medium text-foreground hover:underline",
                    task.status === "done" && "text-muted line-through decoration-muted"
                  )}
                >
                  {task.title}
                </Link>
                <PriorityFlag task={task} />
                <DueLabel task={task} />
                <RepeatMark task={task} />
                <TaskOwner task={task} hereId={circle.id} className="max-w-[12rem] justify-end" />
              </li>
            ))}
          </ul>
          <Link
            href={`/circles/${circle.id}/tasks`}
            className="w-fit text-sm font-medium text-secondary-foreground hover:underline"
          >
            {shown.length > 6 ? `All ${shown.length} on the board` : "Open the task board"}
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted">
          {!tasks.length
            ? "No tasks yet."
            : plain
              ? "Everything's done."
              : `Nothing here: ${describeView(
                  view,
                  view.personId ? personName(circle, view.personId) : null
                ).toLowerCase()}.`}{" "}
          {tasks.length ? (
            <Link
              href={`/circles/${circle.id}/tasks`}
              className="font-medium text-secondary-foreground hover:underline"
            >
              See the board
            </Link>
          ) : null}
        </p>
      )}
    </div>
  );
}

/** A circle member's name, for a view of their tasks. */
const personName = (circle: Circle, personId: string) =>
  circle.seats.find((seat) => seat.personId === personId)?.name ?? null;
