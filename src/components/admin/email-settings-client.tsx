"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FlaskConical, Gauge, Mail, Plus, Send, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { TOPICS } from "@/lib/push/topics";
import {
  isEmailAddress,
  PROVIDER_NAMES,
  type EmailLogEntry,
  type EmailSettings,
} from "@/lib/email/shared";
import type { QuotaStatus } from "@/lib/email/quota";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { SectionHeading } from "@/components/ui/section-heading";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type EmailState = {
  settings: EmailSettings;
  log: EmailLogEntry[];
  configured: boolean;
  from: string;
  residentsWithEmail: number;
  quota: QuotaStatus;
};

const KEY = ["admin", "email"];

const LOG_KINDS: Record<string, string> = {
  test: "Test email",
  welcome: "New member welcome",
  "sign-in": "Sign-in link",
  // From the group email the app once had.
  group: "Circle email",
  summary: "Daily summary",
  confirm: "“Did you send this?” check",
};
const logKind = (topic: EmailLogEntry["topic"]) =>
  LOG_KINDS[topic] ?? TOPICS[topic as keyof typeof TOPICS] ?? topic;

const providers = Object.keys(PROVIDER_NAMES) as (keyof typeof PROVIDER_NAMES)[];

/** "via Brevo 3, Resend 1" */
const viaText = (by: EmailLogEntry["by"]) => {
  const parts = providers
    .filter((provider) => by?.[provider])
    .map((provider) => `${PROVIDER_NAMES[provider]} ${by![provider]}`);
  return parts.length ? ` · via ${parts.join(", ")}` : "";
};

/**
 * The admin's email settings: test mode (on: only the allowed addresses
 * are emailed), the allowed addresses, a test email, and what was sent
 * lately. Turning test mode off asks first, since email then goes to every
 * resident who chooses it.
 */
export function EmailSettingsClient() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<EmailState>("/api/admin/email"),
  });
  const saved = (next: EmailState) => queryClient.setQueryData(KEY, next);
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });
  const save = useMutation({
    mutationFn: (update: { testMode?: boolean; allowed?: string[] }) =>
      apiFetch<EmailState>("/api/admin/email", { method: "PATCH", body: JSON.stringify(update) }),
    onSuccess: saved,
    onError: fail("Could not save"),
  });
  const test = useMutation({
    mutationFn: (to: string) =>
      apiFetch<EmailState & { sentThrough: string[]; refused?: string }>("/api/admin/email", {
        method: "POST",
        body: JSON.stringify({ to }),
      }),
    onSuccess: ({ sentThrough, ...next }, to) => {
      saved(next);
      toast({
        title: `Test email sent to ${to}`,
        description: `Through ${sentThrough.join(" and ")}`,
      });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      fail("Could not send the test")(err);
    },
  });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorCard error={error} />;
  const { settings, log } = data;
  const wanted = adding.trim().toLowerCase();
  const canAdd = isEmailAddress(wanted) && !settings.allowed.includes(wanted);

  const setTestMode = async (on: boolean) => {
    if (
      !on &&
      !(await confirm({
        title: "Turn test mode off?",
        body: `Email will go to every resident who chooses it — about ${data.residentsWithEmail} people have an address in the directory. Nothing already sent will be sent again.`,
        confirmLabel: "Send to everyone",
      }))
    )
      return;
    save.mutate({ testMode: on });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Email</h1>
        <p className="text-sm text-muted">
          {data.configured ? (
            <>Sending from {data.from}.</>
          ) : (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Email is off: neither BREVO_KEY nor RESEND_KEY
              is set.
            </span>
          )}{" "}
          Who each notification went to, and why not:{" "}
          <Link href="/admin/notifications" className="font-medium text-pine hover:underline">
            Notifications
          </Link>
          .
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <SectionHeading icon={FlaskConical}>Test mode</SectionHeading>
            <p className="text-sm text-foreground-light">
              {settings.testMode
                ? "On: email only goes to the addresses below. Everyone else is skipped."
                : "Off: email goes to every resident who chooses it."}
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={settings.testMode}
              disabled={save.isPending}
              onChange={() => void setTestMode(!settings.testMode)}
              aria-label="Test mode"
            />
            <span
              aria-hidden
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                settings.testMode ? "bg-sun" : "bg-primary"
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                  settings.testMode ? "left-6" : "left-1"
                )}
              />
            </span>
            {settings.testMode ? "On" : "Off — live"}
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">Allowed in test mode</h3>
          {settings.allowed.length ? (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {settings.allowed.map((address) => (
                <li key={address} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 basis-[12rem] break-all text-foreground">
                    {address}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    disabled={test.isPending || !data.configured}
                    onClick={() => test.mutate(address)}
                  >
                    <Send className="h-3.5 w-3.5" /> Send a test
                  </Button>
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-accent hover:text-foreground"
                    aria-label={`Remove ${address}`}
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate({
                        allowed: settings.allowed.filter((entry) => entry !== address),
                      })
                    }
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              No addresses yet — while test mode is on, nobody is emailed.
            </p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (canAdd)
                save.mutate(
                  { allowed: [...settings.allowed, wanted] },
                  { onSuccess: () => setAdding("") }
                );
            }}
          >
            <Input
              type="email"
              inputMode="email"
              value={adding}
              onChange={(event) => setAdding(event.target.value)}
              placeholder="name@example.com"
              aria-label="Address to allow"
              className="bg-white"
            />
            <Button type="submit" className="shrink-0 gap-1" disabled={!canAdd || save.isPending}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
        </div>
        {settings.updatedBy && settings.updatedAt ? (
          <p className="text-xs text-muted">
            Last changed by {settings.updatedBy} {timeAgo(settings.updatedAt)}.
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3" data-quota>
        <SectionHeading icon={Gauge}>Free plan allowance</SectionHeading>
        <ul className="flex flex-col gap-1 text-sm text-foreground-light">
          {providers.map((provider) => {
            const use = data.quota[provider];
            return (
              <li key={provider} data-provider={provider}>
                <strong className="text-foreground">{PROVIDER_NAMES[provider]}</strong>
                {provider === "brevo" ? " (tried first)" : " (backup)"}:{" "}
                {use.configured ? (
                  <>
                    today <strong>{use.dayCount}</strong> of {use.limits.day} · this month{" "}
                    <strong>{use.monthCount}</strong> of {use.limits.month}
                  </>
                ) : (
                  <span className="text-muted">not set up</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">
          Each email goes through Brevo while it has room and works, otherwise Resend. Sign-in links
          and welcomes go first: notification emails stop at 70% of each day&apos;s allowance.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionHeading icon={Mail}>Recent sends</SectionHeading>
        {log.length ? (
          <ul className="flex flex-col divide-y divide-border" aria-label="Recent sends">
            {log.slice(0, 50).map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex flex-col gap-0.5 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-medium text-foreground">
                    {entry.subject}
                  </span>
                  {entry.testMode ? <Pill tone="sun">test</Pill> : <Pill tone="pine">live</Pill>}
                </div>
                <p className="text-xs text-muted">
                  {timeAgo(entry.at)} · {logKind(entry.topic)} · sent {entry.sent}
                  {entry.skipped ? ` · skipped ${entry.skipped}` : ""}
                  {viaText(entry.by)}
                  {entry.overQuota ? ` · over today's quota ${entry.overQuota}` : ""}
                  {entry.failed ? (
                    <span className="text-destructive"> · failed {entry.failed}</span>
                  ) : null}
                  {entry.to?.length ? ` · to ${entry.to.join(", ")}` : ""}
                </p>
                {entry.errors
                  ? providers
                      .filter((provider) => entry.errors?.[provider])
                      .map((provider) => (
                        <p key={provider} className="text-xs text-destructive" data-refusal>
                          {PROVIDER_NAMES[provider]} refused: {entry.errors![provider]}
                        </p>
                      ))
                  : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing sent yet.</p>
        )}
      </Card>
    </div>
  );
}
