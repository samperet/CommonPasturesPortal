"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookText, Pencil, Trash2, Wrench } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  DETAIL_FIELDS,
  LOG_KINDS,
  LOG_KIND_LABELS,
  STATUS_LABELS,
  newestFirst,
  totalsFor,
  type EquipmentItem,
  type EquipmentLogEntry,
  type LogKind,
} from "@/lib/equipment/shared";
import { formatMoney, moneyInput, parseMoney } from "@/lib/finances/shared";
import { shortDate, todayInVermont } from "@/lib/time";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { ErrorCard, Loading, NotFoundCard } from "@/components/ui/status";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { STATUS_TONES } from "@/components/equipment/equipment-module";
import { EquipmentDialog, type EquipmentForm } from "@/components/equipment/equipment-dialog";

/**
 * One piece of equipment (`/circles/<id>/equipment/<itemId>`): its status,
 * details and notes — changed with **Edit**, or removed, by the circle's
 * members, the Board and admins — and its log book: this year's totals,
 * **Add to the log** for any resident (the day, what kind of entry — used,
 * maintenance, repair, inspection, a note — what was done, and the hours
 * and cost if they know them), and the entries newest first, each changed
 * or removed by whoever wrote it (or the circle's members).
 */

type ItemResponse = {
  item: EquipmentItem;
  circle: { id: string; name: string };
  canManage: boolean;
  canLog: boolean;
  userId: string;
};

const hoursText = (hours: number) =>
  `${hours % 1 ? hours.toFixed(2).replace(/0$/, "") : hours} ${hours === 1 ? "hour" : "hours"}`;

type EntryDraft = { date: string; kind: LogKind; text: string; hours: string; cost: string };

const draftOf = (entry?: EquipmentLogEntry): EntryDraft => ({
  date: entry?.date ?? todayInVermont(),
  kind: entry?.kind ?? "use",
  text: entry?.text ?? "",
  hours: entry?.hours != null ? String(entry.hours) : "",
  cost: entry?.cost != null ? moneyInput(entry.cost) : "",
});

/** A log entry being written or changed. */
function EntryForm({
  initial,
  saving,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial?: EquipmentLogEntry;
  saving: boolean;
  submitLabel: string;
  onSave: (entry: {
    date: string;
    kind: LogKind;
    text: string;
    hours: number | null;
    cost: number | null;
  }) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<EntryDraft>(() => draftOf(initial));
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-accent/30 p-3"
      data-log-form
      onSubmit={(event) => {
        event.preventDefault();
        const hours = draft.hours.trim() ? Number(draft.hours) : null;
        const cost = draft.cost.trim() ? parseMoney(draft.cost) : null;
        if (hours !== null && (!Number.isFinite(hours) || hours < 0))
          return setProblem("Hours should be a number, like 1.5");
        if (draft.cost.trim() && (cost === null || cost < 0))
          return setProblem("The cost should be an amount, like 12.50");
        setProblem(null);
        onSave({ date: draft.date, kind: draft.kind, text: draft.text.trim(), hours, cost });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_12rem_minmax(0,1fr)]">
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground-light">
          Day
          <Input
            type="date"
            required
            max={todayInVermont()}
            value={draft.date}
            onChange={(event) => set("date", event.target.value)}
            className="bg-white text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-foreground-light">
          What kind
          <Select
            value={draft.kind}
            onChange={(event) => set("kind", event.target.value as LogKind)}
            className="text-sm"
            data-log-kind
          >
            {LOG_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {LOG_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground-light">
            Hours (if known)
            <Input
              inputMode="decimal"
              value={draft.hours}
              onChange={(event) => set("hours", event.target.value)}
              placeholder="1.5"
              className="bg-white text-sm"
              data-log-hours
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground-light">
            Cost (if any)
            <Input
              inputMode="decimal"
              value={draft.cost}
              onChange={(event) => set("cost", event.target.value)}
              placeholder="$0.00"
              className="bg-white text-sm"
              data-log-cost
            />
          </label>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-foreground-light">
        What was done
        <Textarea
          required
          rows={3}
          maxLength={4000}
          value={draft.text}
          onChange={(event) => set("text", event.target.value)}
          placeholder="Mowed the orchard paths; sharpened the blade; the belt is wearing…"
          className="bg-white text-sm"
          data-log-text
        />
      </label>
      {problem ? (
        <p className="text-sm text-destructive" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={saving || !draft.text.trim()}>
          {saving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function EquipmentPage({ circleId, itemId }: { circleId: string; itemId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [changing, setChanging] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const base = `/api/circles/${circleId}/equipment/${itemId}`;
  const queryKey = ["equipment", circleId, itemId];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => apiFetch<ItemResponse>(base),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["equipment", circleId] });
  const failed = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });

  const save = useMutation({
    mutationFn: (form: EquipmentForm) =>
      apiFetch(base, { method: "PATCH", body: JSON.stringify(form) }),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
    onError: failed("Could not save it"),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(base, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      router.push(`/circles/${circleId}`);
    },
    onError: failed("Could not remove it"),
  });
  const log = useMutation({
    mutationFn: (entry: object) =>
      apiFetch(`${base}/log`, { method: "POST", body: JSON.stringify(entry) }),
    onSuccess: () => {
      setFormKey((key) => key + 1);
      refresh();
      toast({ title: "Added to the log" });
    },
    onError: failed("Could not add it to the log"),
  });
  const change = useMutation({
    mutationFn: ({ id, entry }: { id: string; entry: object | null }) =>
      apiFetch(`${base}/log/${id}`, {
        method: entry ? "PATCH" : "DELETE",
        ...(entry ? { body: JSON.stringify(entry) } : {}),
      }),
    onSuccess: () => {
      setChanging(null);
      refresh();
    },
    onError: failed("Could not change the entry"),
  });

  if (isLoading) return <Loading>Loading…</Loading>;
  if (error || !data)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <BackLink href={`/circles/${circleId}`} label="Back to the circle" />
        {error && /not found/i.test(error.message) ? (
          <NotFoundCard error={error} message="That equipment isn't here any more." />
        ) : (
          <ErrorCard error={error} />
        )}
      </div>
    );

  const { item, circle, canManage, canLog, userId } = data;
  const details = DETAIL_FIELDS.filter(([key]) => item[key]?.trim());
  const year = todayInVermont().slice(0, 4);
  const totals = totalsFor(item.log, year);
  const entries = newestFirst(item.log);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4" data-equipment-page>
      <BackLink href={`/circles/${circle.id}`} label={circle.name} />
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-primary">
            <Wrench className="h-6 w-6" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-foreground">{item.name}</h1>
              <Pill tone={STATUS_TONES[item.status]} data-equipment-status>
                {STATUS_LABELS[item.status]}
              </Pill>
            </div>
            <p className="text-sm text-muted">{circle.name}&apos;s equipment</p>
          </div>
          {canManage ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted hover:text-destructive"
                disabled={remove.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Remove ${item.name}, log book and all?`,
                      confirmLabel: "Remove",
                      destructive: true,
                    })
                  )
                    remove.mutate();
                }}
              >
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            </div>
          ) : null}
        </div>
        {details.length ? (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2" data-equipment-details>
            {details.map(([key, label]) => (
              <div key={key} className="flex flex-col gap-0.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
                <dd className="text-sm text-foreground">{item[key]}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {item.notes.trim() ? (
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Notes</p>
            <p
              className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
              data-equipment-notes
            >
              {item.notes}
            </p>
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4" data-log-book>
        <SectionHeading icon={BookText} count={item.log.length}>
          Log book
        </SectionHeading>
        <p className="text-sm text-foreground-light" data-log-totals>
          {totals.entries
            ? `${year}: ${totals.entries} ${totals.entries === 1 ? "entry" : "entries"}${
                totals.uses ? ` · used ${totals.uses} ${totals.uses === 1 ? "time" : "times"}` : ""
              }${totals.hours ? ` · ${hoursText(totals.hours)}` : ""}${
                totals.cost ? ` · ${formatMoney(totals.cost)} spent` : ""
              }`
            : `Nothing logged in ${year} yet.`}
        </p>
        {canLog ? (
          <EntryForm
            key={formKey}
            saving={log.isPending}
            submitLabel="Add to the log"
            onSave={(entry) => log.mutate(entry)}
          />
        ) : null}
        {entries.length ? (
          <ol className="flex flex-col divide-y divide-border" data-log-entries>
            {entries.map((entry) => {
              const mine = !!entry.by.userId && entry.by.userId === userId;
              const canChange = mine || canManage;
              return (
                <li
                  key={entry.id}
                  className="group/post flex flex-col gap-1.5 py-3"
                  data-log-entry={entry.kind}
                >
                  {changing === entry.id ? (
                    <EntryForm
                      initial={entry}
                      saving={change.isPending}
                      submitLabel="Save"
                      onSave={(changed) => change.mutate({ id: entry.id, entry: changed })}
                      onCancel={() => setChanging(null)}
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-semibold text-foreground">
                          {shortDate(entry.date, true)}
                        </span>
                        <Pill
                          tone={
                            entry.kind === "repair"
                              ? "amber"
                              : entry.kind === "note"
                                ? "outline"
                                : "accent"
                          }
                          size="xs"
                        >
                          {LOG_KIND_LABELS[entry.kind]}
                        </Pill>
                        {entry.hours ? (
                          <span className="text-xs text-foreground-light">
                            {hoursText(entry.hours)}
                          </span>
                        ) : null}
                        {entry.cost ? (
                          <span className="text-xs font-medium text-foreground">
                            {formatMoney(entry.cost)}
                          </span>
                        ) : null}
                        <span className="text-xs text-muted">
                          {entry.imported ? entry.by.name : `by ${entry.by.name}`}
                          {entry.editedAt ? " · edited" : ""}
                        </span>
                        {canChange ? (
                          <span className="ml-auto flex gap-1 opacity-70 transition group-hover/post:opacity-100">
                            <button
                              type="button"
                              className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-accent hover:text-foreground"
                              onClick={() => setChanging(entry.id)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-accent hover:text-destructive"
                              onClick={async () => {
                                if (
                                  await confirm({
                                    title: "Remove this entry from the log?",
                                    confirmLabel: "Remove",
                                    destructive: true,
                                  })
                                )
                                  change.mutate({ id: entry.id, entry: null });
                              }}
                            >
                              Remove
                            </button>
                          </span>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {entry.text}
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted">Nothing in the log yet.</p>
        )}
      </Card>

      {editing ? (
        <EquipmentDialog
          title={`Edit ${item.name}`}
          initial={item}
          saving={save.isPending}
          onSave={(form) => save.mutate(form)}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
