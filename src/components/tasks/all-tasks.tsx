"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { useCircles } from "@/components/directory/use-directory";
import { circleFamily, circlePath, circleTree } from "@/lib/circles/tiers";
import { isCommunity } from "@/lib/circles/ids";
import {
  REPEAT_LABELS,
  STATUS_LABELS,
  TASK_STATUSES,
  isHolder,
  type TaskSummary,
} from "@/lib/tasks/shared";
import { isUnassigned } from "@/lib/tasks/roles";
import { todayInVermont } from "@/lib/time";
import { DueLabel, PriorityFlag, STATUS_STYLES, TaskOwner } from "@/components/tasks/task-bits";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented";
import { ErrorCard, Loading } from "@/components/ui/status";
import { cn } from "@/lib/utils";

/**
 * Every circle's tasks in one place (`/tasks`): everyone's, yours (yours, or
 * your roles') or nobody's; open, done or all; only repeating ones; for one
 * circle, with or without its sub groups — Community covers them all, since
 * every circle is within it. The choices are kept in the address
 * (`?whose=mine&show=done&repeating=1&circle=lcc&subs=0&q=`), so a view can
 * be linked to. Tasks are listed by circle, in the circles' tree order, the
 * most urgent first.
 */

type AllTask = Omit<TaskSummary, "commentCount"> & { circleId: string; circleName: string };
type Whose = "everyone" | "mine" | "unassigned";
type Show = "open" | "done" | "all";

const byUrgency = (a: AllTask, b: AllTask) =>
  TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) ||
  Number(b.priority === "high") - Number(a.priority === "high") ||
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
  a.number - b.number;

export function AllTasksClient() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const circles = useCircles();
  const { data, isLoading, error } = useQuery({
    queryKey: ["all-tasks"],
    queryFn: () => apiFetch<{ tasks: AllTask[] }>("/api/tasks"),
  });

  const whose = (
    ["mine", "unassigned"].includes(params.get("whose") ?? "") ? params.get("whose") : "everyone"
  ) as Whose;
  const show = (
    ["done", "all"].includes(params.get("show") ?? "") ? params.get("show") : "open"
  ) as Show;
  const repeating = params.get("repeating") === "1";
  const circleId = params.get("circle") ?? "";
  const withSubs = params.get("subs") !== "0";
  const query = params.get("q") ?? "";
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const tree = useMemo(() => circleTree(circles ?? []), [circles]);
  const order = useMemo(() => new Map(tree.map(({ circle }, index) => [circle.id, index])), [tree]);
  const chosen = circleId ? circles?.find((circle) => circle.id === circleId) : undefined;
  const covered = useMemo(() => {
    if (!circleId || !circles) return null;
    return withSubs || isCommunity(circleId)
      ? circleFamily(circles, circleId)
      : new Set([circleId]);
  }, [circles, circleId, withSubs]);

  const tasks = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    return (data?.tasks ?? [])
      .filter((task) =>
        show === "open" ? task.status !== "done" : show === "done" ? task.status === "done" : true
      )
      .filter((task) =>
        whose === "mine"
          ? isHolder(task, user?.personId)
          : whose === "unassigned"
            ? isUnassigned(task)
            : true
      )
      .filter((task) => !repeating || !!task.repeat)
      .filter((task) => !covered || covered.has(task.circleId))
      .filter(
        (task) =>
          !wanted ||
          task.title.toLowerCase().includes(wanted) ||
          task.circleName.toLowerCase().includes(wanted) ||
          task.holders.some((holder) => holder.name.toLowerCase().includes(wanted)) ||
          !!task.ownerRole?.position?.toLowerCase().includes(wanted)
      )
      .sort(
        (a, b) =>
          (order.get(a.circleId) ?? 999) - (order.get(b.circleId) ?? 999) ||
          (show === "done"
            ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
            : byUrgency(a, b))
      );
  }, [data, show, whose, repeating, covered, query, user, order]);

  const groups = useMemo(() => {
    const byCircle = new Map<string, AllTask[]>();
    for (const task of tasks)
      byCircle.set(task.circleId, [...(byCircle.get(task.circleId) ?? []), task]);
    return Array.from(byCircle.entries());
  }, [tasks]);
  const today = todayInVermont();
  const overdue = tasks.filter(
    (task) => task.status !== "done" && task.dueDate && task.dueDate < today
  ).length;

  return (
    <div className="flex flex-col gap-5" data-all-tasks>
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <ListChecks className="h-6 w-6 text-primary" aria-hidden /> Tasks
        </h1>
        <p className="text-sm text-muted">
          Every circle&apos;s tasks. A task given to a role is whoever holds the role now.
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-4" data-task-filters>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            size="sm"
            label="Whose tasks"
            value={whose}
            onChange={(value) => set({ whose: value === "everyone" ? null : value })}
            options={[
              { value: "everyone", label: "Everyone's" },
              { value: "mine", label: "Mine" },
              { value: "unassigned", label: "Unassigned" },
            ]}
          />
          <SegmentedControl
            size="sm"
            label="Open or done"
            value={show}
            onChange={(value) => set({ show: value === "open" ? null : value })}
            options={[
              { value: "open", label: "Open" },
              { value: "done", label: "Done" },
              { value: "all", label: "All" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={repeating}
              onChange={(event) => set({ repeating: event.target.checked ? "1" : null })}
              className="h-4 w-4 accent-primary"
              data-filter-repeating
            />
            Repeating only
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-0 items-center gap-2 text-sm text-foreground">
            Circle
            <Select
              value={circleId}
              onChange={(event) => set({ circle: event.target.value || null })}
              className="h-9 max-w-[16rem] rounded-md px-2"
              data-filter-circle
            >
              <option value="">All circles</option>
              {tree
                .filter(({ circle }) => !isCommunity(circle.id))
                .map(({ circle, depth }) => (
                  <option key={circle.id} value={circle.id}>
                    {depth > 1 ? "    › " : ""}
                    {circle.name}
                  </option>
                ))}
              {tree.some(({ circle }) => isCommunity(circle.id)) ? (
                <option value="community">Community only</option>
              ) : null}
            </Select>
          </label>
          {chosen &&
          !isCommunity(chosen.id) &&
          tree.some(({ circle }) => circle.parentId === chosen.id) ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={withSubs}
                onChange={(event) => set({ subs: event.target.checked ? null : "0" })}
                className="h-4 w-4 accent-primary"
                data-filter-subs
              />
              With its sub groups
            </label>
          ) : null}
          <div className="relative w-full sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              placeholder="Find a task, circle, or person"
              value={query}
              onChange={(event) => set({ q: event.target.value || null })}
              className="bg-white pl-9"
              aria-label="Find a task"
            />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Loading>Loading tasks…</Loading>
      ) : error ? (
        <ErrorCard error={error} fallback="Tasks are unavailable." />
      ) : (
        <>
          <p className="text-sm text-muted" data-task-count>
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            {overdue ? ` · ${overdue} overdue` : ""}
            {groups.length > 1 ? ` in ${groups.length} circles` : ""}
          </p>
          {groups.length ? (
            groups.map(([id, list]) => {
              const circle = circles?.find((entry) => entry.id === id);
              const path = circle && circles ? circlePath(circles, circle).slice(1) : [];
              return (
                <Card key={id} className="flex flex-col gap-2 p-4" data-task-group={id}>
                  <h2 className="flex flex-wrap items-center gap-x-1.5 text-base font-semibold text-foreground">
                    {(path.length ? path : [{ id, name: list[0].circleName }]).map(
                      (step, index) => (
                        <span key={step.id} className="inline-flex items-center gap-1.5">
                          {index ? (
                            <span className="text-muted" aria-hidden>
                              ›
                            </span>
                          ) : null}
                          <Link href={`/circles/${step.id}`} className="hover:underline">
                            {step.name}
                          </Link>
                        </span>
                      )
                    )}
                    <Link
                      href={`/circles/${id}/tasks`}
                      className="ml-auto text-xs font-medium text-secondary-foreground hover:underline"
                    >
                      Board
                    </Link>
                  </h2>
                  <ul className="flex flex-col divide-y divide-border">
                    {list.map((task) => (
                      <li
                        key={task.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                        data-task-row={`${task.circleId}#${task.number}`}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            STATUS_STYLES[task.status].dot
                          )}
                          title={STATUS_LABELS[task.status]}
                          aria-hidden
                        />
                        <Link
                          href={`/circles/${task.circleId}/tasks/${task.number}`}
                          className={cn(
                            "min-w-0 flex-1 font-medium text-foreground hover:underline",
                            task.status === "done" && "text-muted line-through decoration-muted"
                          )}
                        >
                          {task.title}
                        </Link>
                        <PriorityFlag task={task} />
                        <DueLabel task={task} />
                        {task.repeat ? (
                          <span className="text-xs text-muted">{REPEAT_LABELS[task.repeat]}</span>
                        ) : null}
                        <TaskOwner task={task} hereId={task.circleId} className="max-w-[14rem]" />
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })
          ) : (
            <Card>
              <p className="text-sm text-muted">No tasks here.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
