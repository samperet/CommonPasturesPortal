"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { STATUS_LABELS, type TaskSummary } from "@/lib/tasks/shared";
import { DueLabel, PriorityFlag, ProgressBar, STATUS_STYLES } from "@/components/tasks/task-bits";
import { cn } from "@/lib/utils";
import { SectionHeading } from "@/components/ui/section-heading";

type MyTask = Omit<TaskSummary, "commentCount" | "hasDescription"> & {
  circleId: string;
  circleName: string;
};

/**
 * On the dashboard: the unfinished tasks you have — yours, or given to a role
 * you hold — in any circle, shown only when there are some, with the way to
 * all of them on the Tasks page.
 */
export function MyTasks() {
  const { data } = useQuery({
    queryKey: ["my-tasks"],
    queryFn: () => apiFetch<{ tasks: MyTask[] }>("/api/tasks/mine"),
  });
  const tasks = data?.tasks ?? [];
  if (!tasks.length) return null;
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-soft">
      <SectionHeading icon={ListChecks}>Your tasks</SectionHeading>
      <ul className="flex flex-col divide-y divide-border">
        {tasks.slice(0, 6).map((task) => (
          <li
            key={task.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0"
          >
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_STYLES[task.status].dot)}
              title={STATUS_LABELS[task.status]}
              aria-hidden
            />
            <Link
              href={`/circles/${task.circleId}/tasks/${task.number}`}
              className="min-w-0 flex-1 font-medium text-foreground hover:underline"
            >
              {task.title}
            </Link>
            <PriorityFlag task={task} />
            <DueLabel task={task} />
            <ProgressBar task={task} />
            <span className="text-xs text-muted">
              {task.ownerRole?.position ? `as ${task.ownerRole.position} · ` : ""}
              {task.circleName}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/tasks?whose=mine"
        className="w-fit text-sm font-medium text-secondary-foreground hover:underline"
        data-my-tasks-all
      >
        {tasks.length > 6 ? `All ${tasks.length} of your tasks` : "See all your tasks"}
      </Link>
    </section>
  );
}
