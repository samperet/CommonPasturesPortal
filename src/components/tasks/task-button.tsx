"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListPlus } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { CircleModule } from "@/lib/circles/layout";
import { assigneePhrase, roleLabel } from "@/lib/tasks/roles";
import type { ServedTask } from "@/lib/tasks/shared";
import { useSession } from "@/lib/auth/client";
import { useCircles } from "@/components/directory/use-directory";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

/**
 * A circle's Task button: one press, by any resident, makes a task for a
 * role or a group (set up in the module's settings), with a note of what's
 * needed as its description — on the board of the circle that role or group
 * is in (`api/circles/<id>/task-button`). Its holders are told.
 */
export function TaskButtonModule({
  circleId,
  module,
  title,
}: {
  circleId: string;
  module: CircleModule;
  title: string;
}) {
  const circles = useCircles() ?? [];
  const { user, viewAs } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [details, setDetails] = useState("");
  const [made, setMade] = useState<{ href: string; number: number } | null>(null);
  const button = module.taskButton;
  const press = useMutation({
    mutationFn: () =>
      apiFetch<{ task: ServedTask; circleId: string; circleName: string }>(
        `/api/circles/${circleId}/task-button`,
        { method: "POST", body: JSON.stringify({ moduleId: module.id, details }) }
      ),
    onSuccess: ({ task, circleId: target }) => {
      setAsking(false);
      setDetails("");
      setMade({ href: `/circles/${target}/tasks/${task.number}`, number: task.number });
      void queryClient.invalidateQueries({ queryKey: ["tasks", target] });
      void queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    },
    onError: (error: Error) =>
      toast({
        title: "Couldn't make the task",
        description: error.message,
        variant: "destructive",
      }),
  });
  if (!button) return null;
  const who = assigneePhrase(button.assignee, roleLabel(button.assignee, circles));
  return (
    <Card className="flex flex-col items-start gap-3" data-task-button={module.id}>
      {title !== button.label ? (
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      ) : null}
      <Button
        className="gap-1.5"
        onClick={() => {
          setMade(null);
          setAsking(true);
        }}
        disabled={!user || !!viewAs}
        data-task-button-press
      >
        <ListPlus className="h-4 w-4" aria-hidden /> {button.label}
      </Button>
      <p className="text-xs text-muted">
        Makes a task for {who}: “{button.title}”.
      </p>
      {made ? (
        <p className="text-sm text-foreground" role="status" data-task-button-made>
          Done: task #{made.number} is with {who}.{" "}
          <Link href={made.href} className="font-medium text-secondary-foreground hover:underline">
            See it
          </Link>
        </p>
      ) : null}
      {asking ? (
        <Dialog
          title={button.label}
          icon={<ListPlus className="h-5 w-5 text-primary" aria-hidden />}
          onClose={() => setAsking(false)}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              press.mutate();
            }}
            data-task-button-form
          >
            <p className="text-sm text-foreground-light">
              This makes the task “{button.title}” for {who}, who&apos;ll be told.
            </p>
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Anything they should know? (optional)
              <Textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Where, what you noticed, when it's needed by…"
                className="bg-white"
                data-task-button-details
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={press.isPending}>
                {press.isPending ? "Making it…" : "Make the task"}
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </Card>
  );
}
