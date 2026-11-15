"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Wrench } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  LOG_KIND_LABELS,
  STATUS_LABELS,
  type EquipmentItem,
  type EquipmentStatus,
  type EquipmentSummary,
} from "@/lib/equipment/shared";
import { shortDate } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";
import { EquipmentDialog, type EquipmentForm } from "@/components/equipment/equipment-dialog";

/**
 * A circle's Equipment module: each piece of equipment as a card — its
 * name, what it is, whether it's in service, and its latest log entry —
 * that opens its page (`/circles/<id>/equipment/<itemId>`), with its
 * details and log book. The circle's members, the Board and admins add
 * equipment here (**Add equipment**).
 */

export const equipmentQuery = (circleId: string) => ({
  queryKey: ["equipment", circleId],
  queryFn: () =>
    apiFetch<{ items: EquipmentSummary[]; canManage: boolean }>(
      `/api/circles/${circleId}/equipment`
    ),
});

export const STATUS_TONES: Record<EquipmentStatus, PillTone> = {
  "in-service": "pine",
  "needs-repair": "amber",
  "out-of-service": "destructive",
  retired: "muted",
};

export function EquipmentModule({ circleId }: { circleId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error } = useQuery(equipmentQuery(circleId));
  const add = useMutation({
    mutationFn: (form: EquipmentForm) =>
      apiFetch<{ item: EquipmentItem }>(`/api/circles/${circleId}/equipment`, {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: ({ item }) => {
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: ["equipment", circleId] });
      toast({ title: `Added ${item.name}` });
    },
    onError: (err: Error) =>
      toast({ title: "Could not add it", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <Loading>Loading equipment…</Loading>;
  if (error || !data) return <ErrorCard error={error} />;
  const { items, canManage } = data;
  return (
    <div className="flex flex-col gap-3" data-equipment>
      {items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/circles/${circleId}/equipment/${item.id}`}
                className="group flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 transition hover:border-primary hover:bg-accent/40"
                data-equipment-item={item.id}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
                  <Wrench className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{item.name}</span>
                    <Pill tone={STATUS_TONES[item.status]} size="xs">
                      {STATUS_LABELS[item.status]}
                    </Pill>
                  </span>
                  {item.kind ? (
                    <span className="truncate text-xs text-muted">{item.kind}</span>
                  ) : null}
                  <span className="text-xs text-foreground-light">
                    {item.latest
                      ? `${LOG_KIND_LABELS[item.latest.kind]} · ${shortDate(
                          item.latest.date,
                          true
                        )}`
                      : "Nothing in its log yet"}
                    {item.entries > 1 ? ` · ${item.entries} in its log` : ""}
                  </span>
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No equipment listed yet.</p>
      )}
      {canManage ? (
        <Button variant="outline" className="gap-1.5 self-start" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add equipment
        </Button>
      ) : null}
      {adding ? (
        <EquipmentDialog
          title="Add equipment"
          saving={add.isPending}
          onSave={(form) => add.mutate(form)}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
