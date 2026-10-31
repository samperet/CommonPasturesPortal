"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Check, Download, Send, Share } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Preferences, Topic } from "@/lib/push/topics";
import {
  APP_SHORT,
  EMAIL_SHORT,
  NO_EMAIL,
  REACHED,
  type AppOutcome,
  type EmailOutcome,
} from "@/lib/notifications/shared";
import { usePush, useInstall } from "@/components/notifications/pwa";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time";

/**
 * "App & notifications" on your profile: install the app, turn notifications
 * on for this device, and choose what about — and, separately, what you're
 * emailed about (at your directory entry's address); the pages you follow;
 * and what's been sent to you lately, and how (`/api/me/notifications`).
 */
export function AppSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const install = useInstall();
  const push = usePush();
  const preferences = push.info.data?.preferences;
  const topics = push.info.data?.topics;

  const setPreference = useMutation({
    mutationFn: (update: Partial<Preferences>) =>
      apiFetch<{ preferences: Preferences }>("/api/push/preferences", {
        method: "PUT",
        body: JSON.stringify(update),
      }),
    onMutate: (update) => {
      queryClient.setQueryData(["push"], (current: typeof push.info.data) =>
        current ? { ...current, preferences: { ...current.preferences, ...update } } : current
      );
    },
    onSuccess: ({ preferences: saved }) =>
      queryClient.setQueryData(["push"], (current: typeof push.info.data) =>
        current ? { ...current, preferences: saved } : current
      ),
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["push"] });
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    },
  });

  const test = useMutation({
    mutationFn: () => apiFetch("/api/push/test", { method: "POST" }),
    onSuccess: () => toast({ title: "Test sent", description: "It should appear in a moment." }),
    onError: (err: Error) =>
      toast({ title: "Could not send a test", description: err.message, variant: "destructive" }),
  });

  const run = (action: () => Promise<void>, done: string) =>
    action()
      .then(() => toast({ title: done }))
      .catch((err: Error) =>
        toast({ title: "Notifications", description: err.message, variant: "destructive" })
      );

  const needsInstallFirst = install.ios && !install.installed;

  // Arriving from "App & notifications" in the menu: bring this card into view once it has rendered.
  useEffect(() => {
    if (window.location.hash === "#app")
      document.getElementById("app")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <Card id="app" className="flex scroll-mt-24 flex-col gap-5">
      <h2 className="text-lg font-semibold text-foreground">App &amp; notifications</h2>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Install the app</h3>
        {install.installed ? (
          <p className="flex items-center gap-1.5 text-sm text-foreground-light">
            <Check className="h-4 w-4 text-primary" /> Installed — you&apos;re using the app.
          </p>
        ) : install.canPrompt ? (
          <Button size="sm" className="w-fit gap-1.5" onClick={() => void install.install()}>
            <Download className="h-4 w-4" /> Install CVC on this device
          </Button>
        ) : install.ios ? (
          <p className="text-sm text-foreground-light">
            In Safari, tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" />{" "}
            Share, then <strong>Add to Home Screen</strong>. Open CVC from your home screen to turn
            on notifications.
          </p>
        ) : (
          <p className="text-sm text-foreground-light">
            Use your browser&apos;s menu — <strong>Install app</strong> or{" "}
            <strong>Add to Home screen</strong> — to add CVC to this device.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Notifications on this device</h3>
        {!push.ready ? (
          <p className="text-sm text-muted">Checking…</p>
        ) : !push.supported ? (
          <p className="text-sm text-foreground-light">
            {needsInstallFirst
              ? "On iPhone and iPad, notifications work once CVC is on your home screen (see above). Open it from there, then come back here."
              : "This browser can't show notifications. Try Chrome, Edge, Firefox, or Safari."}
          </p>
        ) : push.permission === "denied" ? (
          <p className="text-sm text-foreground-light">
            Notifications are blocked for this site. Allow them in your browser&apos;s site
            settings, then reload this page.
          </p>
        ) : push.subscribed ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm text-foreground-light">
              <Bell className="h-4 w-4 text-primary" /> On for this device.
            </span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => test.mutate()}
              disabled={test.isPending}
            >
              <Send className="h-4 w-4" /> {test.isPending ? "Sending…" : "Send a test"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted"
              onClick={() => void run(push.disable, "Notifications turned off for this device")}
              disabled={push.busy}
            >
              <BellOff className="h-4 w-4" /> Turn off
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            className="w-fit gap-1.5"
            onClick={() => void run(push.enable, "Notifications are on")}
            disabled={push.busy}
          >
            <Bell className="h-4 w-4" /> {push.busy ? "Turning on…" : "Turn on notifications"}
          </Button>
        )}
      </section>

      {preferences && topics ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">Notify me about</h3>
          <p className="-mt-1 text-xs text-muted">
            Applies to every device you&apos;ve turned notifications on for. You&apos;re never
            notified about your own posts.
          </p>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {(Object.keys(topics) as Topic[]).map((topic) => {
              const on = preferences[topic];
              return (
                <li key={topic}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm text-foreground">
                    {topics[topic]}
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={on}
                      onChange={() => setPreference.mutate({ [topic]: !on })}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "relative h-6 w-10 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                        on ? "bg-primary" : "bg-border"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                          on ? "left-[1.125rem]" : "left-0.5"
                        )}
                      />
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <EmailChoices />
      <FollowedPages />
      <SentToYou />
    </Card>
  );
}

/** The pages you follow (`lib/wiki/follows.ts`), each with Unfollow. */
function FollowedPages() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["me-follows"],
    queryFn: () =>
      apiFetch<{ pages: { id: string; slug: string; title: string }[] }>("/api/me/follows"),
  });
  const unfollow = useMutation({
    mutationFn: (slug: string) =>
      apiFetch(`/api/wiki/pages/${slug}/follow`, {
        method: "PUT",
        body: JSON.stringify({ following: false }),
      }),
    onSuccess: (_result, slug) => {
      void queryClient.invalidateQueries({ queryKey: ["me-follows"] });
      void queryClient.invalidateQueries({ queryKey: ["wiki-page", slug] });
    },
    onError: (err: Error) =>
      toast({ title: "Could not unfollow it", description: err.message, variant: "destructive" }),
  });
  if (!data) return null;
  return (
    <section className="flex flex-col gap-2" data-followed-pages>
      <h3 className="text-sm font-semibold text-foreground">Pages you follow</h3>
      <p className="-mt-1 text-xs text-muted">
        You hear when one changes — at most once an hour each, by app notification (and email, if
        you chose “Changes to pages you follow” above). You follow the pages you start; press Follow
        on any other.
      </p>
      {data.pages.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {data.pages.map((page) => (
            <li
              key={page.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              data-followed={page.slug}
            >
              <Link
                href={`/wiki/${page.slug}`}
                className="min-w-0 truncate text-foreground hover:underline"
              >
                {page.title}
              </Link>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-muted"
                disabled={unfollow.isPending}
                onClick={() => unfollow.mutate(page.slug)}
              >
                Unfollow
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None yet.</p>
      )}
    </section>
  );
}

type EmailChoicesData = {
  preferences: Preferences;
  topics: Record<Topic, string>;
  email: string | null;
};

/** What you're emailed about: a switch per topic, saved at once. */
function EmailChoices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ["email-preferences"];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => apiFetch<EmailChoicesData>("/api/email/preferences"),
  });
  const set = useMutation({
    mutationFn: (update: Partial<Preferences>) =>
      apiFetch<{ preferences: Preferences }>("/api/email/preferences", {
        method: "PATCH",
        body: JSON.stringify(update),
      }),
    onMutate: (update) =>
      queryClient.setQueryData(key, (current: EmailChoicesData | undefined) =>
        current ? { ...current, preferences: { ...current.preferences, ...update } } : current
      ),
    onSuccess: ({ preferences }) =>
      queryClient.setQueryData(key, (current: EmailChoicesData | undefined) =>
        current ? { ...current, preferences } : current
      ),
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    },
  });
  if (!data) return null;
  return (
    <section className="flex flex-col gap-2" data-email-choices>
      <h3 className="text-sm font-semibold text-foreground">Email me about</h3>
      <p className="-mt-1 text-xs text-muted">
        {data.email ? (
          <>
            Emails go to <strong className="font-medium">{data.email}</strong>, the address in your
            directory entry. You&apos;re never emailed about your own posts.
          </>
        ) : (
          "There's no email address in your directory entry, so you won't get emails. Add one to your profile to get them."
        )}
      </p>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {(Object.keys(data.topics) as Topic[]).map((topic) => {
          const on = data.preferences[topic];
          return (
            <li key={topic}>
              <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm text-foreground">
                {data.topics[topic]}
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={on}
                  aria-label={`Email: ${data.topics[topic]}`}
                  onChange={() => set.mutate({ [topic]: !on })}
                />
                <span
                  aria-hidden
                  className={cn(
                    "relative h-6 w-10 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                    on ? "bg-primary" : "bg-border"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                      on ? "left-[1.125rem]" : "left-0.5"
                    )}
                  />
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type SentData = {
  days: number;
  sent: {
    id: string;
    at: string;
    topic: string;
    title: string;
    url: string | null;
    app: AppOutcome | null;
    email: EmailOutcome | null;
    noEmail: keyof typeof NO_EMAIL | null;
  }[];
};

/** What's been sent to you lately, and how each reached you (or why it didn't). */
function SentToYou() {
  const { data } = useQuery({
    queryKey: ["me-notifications"],
    queryFn: () => apiFetch<SentData>("/api/me/notifications"),
  });
  const [all, setAll] = useState(false);
  if (!data) return null;
  const shown = all ? data.sent : data.sent.slice(0, 8);
  const tone = (reached: boolean) => (reached ? "text-pine" : "text-muted");
  return (
    <section className="flex flex-col gap-2" data-sent-to-you>
      <h3 className="text-sm font-semibold text-foreground">Sent to you lately</h3>
      <p className="-mt-1 text-xs text-muted">
        The last {data.days} days: each notification that was for you, and how it reached you — or
        why it didn&apos;t.
      </p>
      {shown.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {shown.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
              <span className="text-xs text-muted">
                {entry.topic} · {timeAgo(entry.at)}
              </span>
              {entry.url ? (
                <Link href={entry.url} className="text-foreground hover:underline">
                  {entry.title}
                </Link>
              ) : (
                <span className="text-foreground">{entry.title}</span>
              )}
              <span className="text-xs">
                {/* A sign-in link is only ever emailed. */}
                {entry.app ? (
                  <>
                    <span className={tone(REACHED.app.includes(entry.app))}>
                      App: {APP_SHORT[entry.app]}
                    </span>{" "}
                    ·{" "}
                  </>
                ) : null}
                <span className={tone(!!entry.email && REACHED.email.includes(entry.email))}>
                  Email:{" "}
                  {entry.email
                    ? EMAIL_SHORT[entry.email]
                    : entry.noEmail
                      ? NO_EMAIL[entry.noEmail].toLowerCase()
                      : "not sent"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing yet.</p>
      )}
      {data.sent.length > shown.length ? (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => setAll(true)}>
          Show all {data.sent.length}
        </Button>
      ) : null}
    </section>
  );
}
