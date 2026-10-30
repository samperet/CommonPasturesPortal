"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import { Check, History, Pencil, Plus, Trash2, UserCheck, UserMinus, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { featureEnabled } from "@/lib/circles/features";
import {
  PRIORITY_LABELS,
  REPEAT_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_REPEATS,
  TASK_STATUSES,
  checklistProgress,
  type ServedTask as Task,
  type TaskPriority,
  type TaskRepeat,
} from "@/lib/tasks/shared";
import { timeAgo } from "@/lib/time";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { TaskComments } from "@/components/tasks/task-comments";
import {
  DueLabel,
  OwnerSelect,
  TaskOwner,
  PriorityFlag,
  STATUS_STYLES,
  StatusPill,
  canMoveTask,
  useTaskUpdate,
  type TaskResponse,
} from "@/components/tasks/task-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useDirectory } from "@/components/directory/use-directory";
import { Loading, NotFoundCard } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { Select } from "@/components/ui/select";
import { pillTone } from "@/components/ui/pill";

function TitleEditor({
  task,
  onSave,
  onCancel,
  busy,
}: {
  task: Task;
  onSave: (title: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  return (
    <form
      className="flex flex-1 flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) onSave(title.trim());
      }}
    >
      <Input
        autoFocus
        value={title}
        maxLength={160}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="bg-white text-lg font-semibold"
        aria-label="Title"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!title.trim() || busy}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DescriptionEditor({
  task,
  onSave,
  onCancel,
  busy,
}: {
  task: Task;
  onSave: (description: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [text, setText] = useState(task.description);
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        rows={8}
        value={text}
        maxLength={10_000}
        onChange={(e) => setText(e.target.value)}
        className="bg-white font-mono text-sm"
        placeholder={
          "What needs doing, and anything that helps: where the tools are, who to call.\n\nMarkdown works — **bold**, lists, and [[Wiki page]] or [[doc:Document title]] links."
        }
        aria-label="Description"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => onSave(text)}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The checklist: tick items off (the circle's editors and the task's owner), add and remove them (editors). */
function Checklist({
  task,
  canTick,
  canEdit,
  update,
  busy,
}: {
  task: Task;
  canTick: boolean;
  canEdit: boolean;
  update: (change: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const progress = checklistProgress(task);
  if (!progress && !canEdit) return null;
  const add = () => {
    if (!text.trim()) return;
    update({ checklist: [...task.checklist, { text: text.trim(), done: false }] });
    setText("");
  };
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Checklist</h2>
        {progress ? (
          <span className="text-xs text-muted">
            {progress.done} of {progress.total} done
          </span>
        ) : null}
      </div>
      {progress ? (
        <div
          className="h-2 overflow-hidden rounded-full bg-accent"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Checklist progress"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              progress.percent === 100 ? "bg-pine" : "bg-primary"
            )}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      ) : null}
      <ul className="flex flex-col">
        {task.checklist.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-accent/50"
          >
            <input
              type="checkbox"
              checked={item.done}
              disabled={!canTick || busy}
              onChange={(event) => update({ toggle: { id: item.id, done: event.target.checked } })}
              className="h-4 w-4 shrink-0 accent-primary"
              aria-label={item.text}
            />
            <span
              className={cn(
                "flex-1 text-sm text-foreground",
                item.done && "text-muted line-through"
              )}
            >
              {item.text}
            </span>
            {canEdit ? (
              <button
                type="button"
                className="text-muted opacity-60 hover:text-destructive group-hover:opacity-100"
                onClick={() =>
                  update({ checklist: task.checklist.filter((entry) => entry.id !== item.id) })
                }
                aria-label={`Remove “${item.text}”`}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a step"
            className="h-9 bg-white"
            aria-label="New checklist item"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={!text.trim() || busy}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
      ) : null}
    </section>
  );
}

/**
 * One task, up close: what it is, its checklist, and its conversation; beside
 * them, its status, owner, due date, priority, and what's happened to it.
 */
export function TaskPageClient({ circleId, number }: { circleId: string; number: number }) {
  const confirm = useConfirm();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const directory = useDirectory();
  const circle = directory?.circles.find((entry) => entry.id === circleId);
  const { data, isLoading, error } = useQuery({
    queryKey: ["task", circleId, number],
    queryFn: () => apiFetch<TaskResponse>(`/api/circles/${circleId}/tasks/${number}`),
  });
  const wikiPages = useWikiPages().data?.pages ?? [];
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const update = useTaskUpdate(circleId, number);
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/circles/${circleId}/tasks/${number}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", circleId] });
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      toast({ title: "Task deleted" });
      router.replace(`/circles/${circleId}/tasks`);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not delete the task",
        description: err.message,
        variant: "destructive",
      }),
  });

  const back = (
    <BackLink
      href={`/circles/${circleId}/tasks`}
      label={circle ? `${circle.name} tasks` : "Tasks"}
    />
  );
  const task = data?.task;
  if (isLoading) return <Loading />;
  if (error || !task) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {back}
        <NotFoundCard error={error} message="That task wasn't found." />
      </div>
    );
  }

  const enabled = featureEnabled(circle, "tasks") && !!data?.enabled;
  const canEdit = !!data?.canEdit && enabled;
  const me = user?.personId ?? null;
  const canMove = enabled && canMoveTask(task, canEdit, me);
  // Handing back is for a person's task (a role's stays with the role).
  const isOwner = !!me && task.ownerId === me && !task.ownerRole;
  const save = (change: Record<string, unknown>) => update.mutate(change);

  return (
    <div className="flex flex-col gap-4">
      {back}
      {/* On phones the status and owner sit between the task and its comments, where they're easy to reach. */}
      <div className="grid items-start gap-6 [grid-template-areas:'task'_'side'_'comments'] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'task_side'_'comments_side']">
        <Card className="flex min-w-0 flex-col gap-5 [grid-area:task]">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>#{task.number}</span>
              <StatusPill status={task.status} />
              <PriorityFlag task={task} />
              <DueLabel task={task} />
            </div>
            {editingTitle ? (
              <TitleEditor
                task={task}
                busy={update.isPending}
                onCancel={() => setEditingTitle(false)}
                onSave={(title) =>
                  update.mutate({ title }, { onSuccess: () => setEditingTitle(false) })
                }
              />
            ) : (
              <div className="flex items-start gap-2">
                <h1
                  className={cn(
                    "flex-1 text-2xl font-semibold text-foreground",
                    task.status === "done" && "text-muted"
                  )}
                >
                  {task.title}
                </h1>
                {canEdit ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setEditingTitle(true)}
                    aria-label="Rename the task"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Details</h2>
              {canEdit && !editingDescription ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-secondary-foreground hover:underline"
                  onClick={() => setEditingDescription(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />{" "}
                  {task.description.trim() ? "Edit" : "Add details"}
                </button>
              ) : null}
            </div>
            {editingDescription ? (
              <DescriptionEditor
                task={task}
                busy={update.isPending}
                onCancel={() => setEditingDescription(false)}
                onSave={(description) =>
                  update.mutate({ description }, { onSuccess: () => setEditingDescription(false) })
                }
              />
            ) : task.description.trim() ? (
              <WikiMarkdown source={task.description} circleId={circleId} pages={wikiPages} />
            ) : (
              <p className="text-sm text-muted">No details yet.</p>
            )}
          </section>

          <Checklist
            task={task}
            canTick={canMove}
            canEdit={canEdit}
            update={save}
            busy={update.isPending}
          />
        </Card>

        <Card className="min-w-0 [grid-area:comments]">
          <TaskComments circleId={circleId} number={number} canComment={!!user && enabled} />
        </Card>

        <aside className="flex flex-col gap-4 [grid-area:side] lg:sticky lg:top-20 lg:row-span-2">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Status</p>
              <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Status">
                {TASK_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    role="radio"
                    aria-checked={task.status === status}
                    disabled={!canMove || update.isPending}
                    onClick={() => task.status !== status && save({ status })}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm font-medium transition disabled:cursor-default",
                      task.status === status
                        ? cn(
                            "border-transparent",
                            pillTone(STATUS_STYLES[status].pill),
                            "font-semibold shadow-soft"
                          )
                        : "border-border bg-white text-muted enabled:hover:text-foreground"
                    )}
                  >
                    {task.status === status ? (
                      <Check className="h-4 w-4" aria-hidden />
                    ) : (
                      <span
                        className={cn("h-2 w-2 rounded-full", STATUS_STYLES[status].dot)}
                        aria-hidden
                      />
                    )}
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Owner</p>
              {canEdit ? (
                <OwnerSelect
                  circle={circle}
                  value={{
                    ownerId: task.ownerRole ? null : task.ownerId,
                    ownerRole: task.ownerRole ?? null,
                  }}
                  onChange={(owner) =>
                    save(
                      owner.ownerRole ? { ownerRole: owner.ownerRole } : { ownerId: owner.ownerId }
                    )
                  }
                  disabled={update.isPending}
                />
              ) : (
                <TaskOwner task={task} hereId={circleId} className="text-sm" />
              )}
              {canEdit && task.ownerRole ? (
                <p className="text-xs text-muted" data-task-role-note>
                  Whoever holds the role has it
                  {task.repeat ? ", each time it comes round" : ""}.
                </p>
              ) : null}
              {enabled && me && !task.ownerId && !task.ownerRole ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={update.isPending}
                  onClick={() => save({ ownerId: me })}
                >
                  <UserCheck className="h-4 w-4" /> I&apos;ll take it
                </Button>
              ) : null}
              {enabled && isOwner && !canEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-muted"
                  disabled={update.isPending}
                  onClick={() => save({ ownerId: null })}
                >
                  <UserMinus className="h-4 w-4" /> Hand it back
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                Due
                {canEdit ? (
                  <Input
                    type="date"
                    value={task.dueDate ?? ""}
                    onChange={(e) => save({ dueDate: e.target.value || null })}
                    className="h-9 bg-white px-2 text-sm normal-case tracking-normal"
                  />
                ) : (
                  <span className="text-sm font-normal normal-case tracking-normal text-foreground">
                    {task.dueDate ? <DueLabel task={task} className="text-sm" /> : "—"}
                  </span>
                )}
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                Priority
                {canEdit ? (
                  <Select
                    value={task.priority}
                    onChange={(e) => save({ priority: e.target.value as TaskPriority })}
                    className="h-9 px-2 font-normal normal-case tracking-normal"
                  >
                    {TASK_PRIORITIES.map((value) => (
                      <option key={value} value={value}>
                        {PRIORITY_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-sm font-normal normal-case tracking-normal text-foreground">
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                )}
              </label>
              <label className="col-span-2 flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                Repeats
                {canEdit ? (
                  <Select
                    value={task.repeat ?? ""}
                    onChange={(e) => save({ repeat: (e.target.value as TaskRepeat) || null })}
                    className="h-9 px-2 font-normal normal-case tracking-normal"
                    data-task-repeat
                  >
                    <option value="">Doesn&apos;t repeat</option>
                    {TASK_REPEATS.map((value) => (
                      <option key={value} value={value}>
                        {REPEAT_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-sm font-normal normal-case tracking-normal text-foreground">
                    {task.repeat ? REPEAT_LABELS[task.repeat] : "Doesn't repeat"}
                  </span>
                )}
                {task.repeat ? (
                  <span className="text-xs font-normal normal-case tracking-normal text-muted">
                    {task.repeatedAs
                      ? `The next one is #${task.repeatedAs}.`
                      : "When it's done, the next one is made, due a period on."}
                  </span>
                ) : null}
              </label>
            </div>

            <p className="border-t border-border pt-3 text-xs text-muted">
              Added by {task.createdBy.name} · {timeAgo(task.createdAt)}
              {task.completedAt ? ` · done ${timeAgo(task.completedAt)}` : ""}
            </p>
            {canEdit ? (
              <button
                type="button"
                className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted hover:text-destructive"
                disabled={remove.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Delete “${task.title}” and its comments?`,
                      destructive: true,
                    })
                  )
                    remove.mutate();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete task
              </button>
            ) : null}
          </Card>

          {task.activity.length ? (
            <Card className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <History className="h-3.5 w-3.5" /> Activity
              </p>
              <ol className="flex flex-col gap-1.5 text-sm">
                {[...task.activity]
                  .reverse()
                  .slice(0, 12)
                  .map((event, index) => (
                    <li key={`${event.at}-${index}`} className="leading-snug text-foreground-light">
                      <span className="font-medium text-foreground">{event.by}</span> {event.text}{" "}
                      <span className="text-xs text-muted">· {timeAgo(event.at)}</span>
                    </li>
                  ))}
              </ol>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
