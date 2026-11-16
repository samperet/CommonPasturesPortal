"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { SignInEntry } from "@/lib/auth/sign-in-log";
import {
  describeAttempt,
  failed,
  laterBy,
  signedInAfter,
  stillTrying,
  type SignInAttempt,
} from "@/lib/auth/attempts-shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { SignInLinkDialog } from "@/components/admin/sign-in-link-dialog";
import { Input } from "@/components/ui/input";
import { Loading, ErrorCard } from "@/components/ui/status";
import { SegmentedControl } from "@/components/ui/segmented";
import { timeAgo } from "@/lib/time";

/**
 * The admins' sign-in log: every sign-in, by day; **Attempts**, every try
 * at signing in by day (asks for an email and whether it went, codes and
 * links that didn't work, links admins made), each with whether they
 * signed in after; or **By resident**, each resident with when they were
 * last seen in the app (noted while they have it open; "Never" if not since
 * it began being noted), how often they've signed in, and when they last
 * did, sorted by last seen or by name. Above them, anyone who's tried in
 * the last fortnight and not got in since. An admin can make a sign-in link
 * for anyone (`sign-in-link-dialog.tsx`) — from those rows, or By resident.
 */

type View = "all" | "attempts" | "people";
type Sort = "seen" | "name";
type LogData = {
  entries: SignInEntry[];
  attempts: SignInAttempt[];
  lastSeen: Record<string, string>;
  people: { personId: string; name: string }[];
};
const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back "trying to sign in" looks. */
const TRYING_DAYS = 14;

const dayKey = (date: Date) => date.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return "Today";
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

const time = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const shortDate = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
  ", " +
  time(date);

export function SignInLogClient() {
  const [view, setView] = useState<View>("all");
  const [sort, setSort] = useState<Sort>("seen");
  const [query, setQuery] = useState("");
  const [linkFor, setLinkFor] = useState<{ personId: string; name: string } | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "sign-ins"],
    queryFn: () => apiFetch<LogData>("/api/admin/sign-ins"),
    refetchInterval: 60_000,
  });

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.entries ?? []).filter((entry) => !q || entry.name.toLowerCase().includes(q));
  }, [data, query]);

  const byDay = useMemo(() => groupByDay(entries), [entries]);

  const attempts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.attempts ?? []).filter((attempt) => !q || attempt.name.toLowerCase().includes(q));
  }, [data, query]);
  const attemptsByDay = useMemo(() => groupByDay(attempts), [attempts]);

  // Whoever's tried lately and not got in since: one row each.
  const trying = useMemo(() => {
    const since = new Date(Date.now() - TRYING_DAYS * DAY_MS).toISOString();
    return stillTrying(
      (data?.attempts ?? []).filter((attempt) => attempt.at >= since),
      data?.entries ?? []
    );
  }, [data]);

  // Every resident (and anyone with sign-ins who's since left), with when they were last seen.
  const byPerson = useMemo(() => {
    const q = query.trim().toLowerCase();
    const people = new Map<
      string,
      { personId: string; name: string; count: number; last: string | null; seen: string | null }
    >();
    const row = (personId: string, name: string) => {
      const existing = people.get(personId);
      if (existing) return existing;
      const made = { personId, name, count: 0, last: null, seen: data?.lastSeen[personId] ?? null };
      people.set(personId, made);
      return made;
    };
    for (const person of data?.people ?? []) row(person.personId, person.name);
    for (const entry of data?.entries ?? []) {
      const person = row(entry.personId, entry.name);
      person.count += 1;
      person.last ??= entry.at; // entries are newest first
    }
    return Array.from(people.values())
      .filter((person) => !q || person.name.toLowerCase().includes(q))
      .sort((a, b) =>
        sort === "seen" && (a.seen ?? "") !== (b.seen ?? "")
          ? (b.seen ?? "").localeCompare(a.seen ?? "")
          : a.name.localeCompare(b.name)
      );
  }, [data, query, sort]);

  const signIns = data?.entries ?? [];
  const total = signIns.length;
  const residents = new Set(signIns.map((entry) => entry.personId)).size;
  const now = Date.now();
  const seenThisWeek = Object.values(data?.lastSeen ?? {}).filter(
    (at) => now - Date.parse(at) < 7 * DAY_MS
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sign-in log</h1>
        {total ? (
          <p className="text-sm text-muted">
            {total} sign-in{total === 1 ? "" : "s"} by {residents} resident
            {residents === 1 ? "" : "s"} · {seenThisWeek} seen in the app this week
          </p>
        ) : null}
      </div>

      {trying.length ? (
        <Card className="flex flex-col gap-3" data-trying>
          <div>
            <h2 className="text-base font-semibold text-foreground">Trying to sign in</h2>
            <p className="text-sm text-muted">
              Tried in the last {TRYING_DAYS} days and not signed in since. If their email
              isn&apos;t arriving, make them a sign-in link to send another way.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {trying.map((attempt) => (
              <li
                key={attempt.personId}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 text-sm"
                data-trying-person={attempt.personId}
              >
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{attempt.name}</span>
                  <p className="text-muted">
                    {describeAttempt(attempt)} · {timeAgo(attempt.at)}
                  </p>
                </div>
                <LinkButton onClick={() => setLinkFor(attempt)} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          role="tablist"
          label="Sign-ins"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "All sign-ins" },
            { value: "attempts", label: "Attempts" },
            { value: "people", label: "By resident" },
          ]}
        />
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Filter by name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-white pl-9"
            aria-label="Filter by name"
          />
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorCard error={error} />
      ) : view === "attempts" && !attempts.length ? (
        <Card>
          <p className="text-sm text-muted">
            {query ? `No attempts match “${query}”.` : "No attempts to sign in recorded yet."}
          </p>
        </Card>
      ) : view === "attempts" ? (
        attemptsByDay.map((group) => (
          <section key={group.key} className="flex flex-col gap-2" data-attempts-day>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </h2>
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {group.entries.map((attempt, index) => {
                  const after = signedInAfter(attempt, data?.entries ?? []);
                  return (
                    <li
                      key={`${attempt.at}-${index}`}
                      className="flex flex-col gap-1.5 px-5 py-3 text-sm"
                      data-attempt={attempt.outcome}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="font-medium text-foreground">{attempt.name}</span>
                          <p className={failed(attempt) ? "text-[#7a5200]" : "text-muted"}>
                            {describeAttempt(attempt)}
                          </p>
                        </div>
                        <time dateTime={attempt.at} className="shrink-0 tabular-nums text-muted">
                          {time(new Date(attempt.at))}
                        </time>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {after ? (
                          <Pill tone="pine" size="xs" data-signed-in-after>
                            Signed in {laterBy(attempt.at, after)}
                          </Pill>
                        ) : (
                          <>
                            <Pill tone="amber" size="xs" data-not-signed-in>
                              Not signed in since
                            </Pill>
                            <LinkButton onClick={() => setLinkFor(attempt)} />
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))
      ) : view === "all" && !entries.length ? (
        <Card>
          <p className="text-sm text-muted">
            {query ? `No sign-ins match “${query}”.` : "No sign-ins recorded yet."}
          </p>
        </Card>
      ) : view === "all" ? (
        byDay.map((group) => (
          <section key={group.key} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {group.label}
            </h2>
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {group.entries.map((entry, index) => (
                  <li
                    key={`${entry.at}-${index}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <span className="font-medium text-foreground">{entry.name}</span>
                    <time dateTime={entry.at} className="shrink-0 tabular-nums text-muted">
                      {time(new Date(entry.at))}
                    </time>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Last seen: when they last had the app open (to within ten minutes).
            </p>
            <SegmentedControl
              size="sm"
              label="Sort by"
              value={sort}
              onChange={setSort}
              options={[
                { value: "seen", label: "Last seen" },
                { value: "name", label: "Name" },
              ]}
            />
          </div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm" data-residents>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-semibold">Resident</th>
                  <th className="px-3 py-3 font-semibold">Last seen</th>
                  <th className="px-3 py-3 text-right font-semibold">Sign-ins</th>
                  <th className="px-3 py-3 font-semibold">Last signed in</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">Sign-in link</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byPerson.map((person) => (
                  <tr key={person.personId} data-resident={person.personId}>
                    <td className="px-5 py-3 font-medium text-foreground">{person.name}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-foreground-light">
                      {person.seen ? (
                        <time dateTime={person.seen} title={shortDate(new Date(person.seen))}>
                          {timeAgo(person.seen)}
                        </time>
                      ) : (
                        <span className="text-muted">Never</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-foreground-light">
                      {person.count}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted">
                      {person.last ? (
                        <time dateTime={person.last}>{shortDate(new Date(person.last))}</time>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-2 text-right">
                      <LinkButton onClick={() => setLinkFor(person)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
      {linkFor ? <SignInLinkDialog person={linkFor} onClose={() => setLinkFor(null)} /> : null}
    </div>
  );
}

/** Entries (newest first) by the day they happened. */
function groupByDay<T extends { at: string }>(entries: T[]) {
  const groups: { key: string; label: string; entries: T[] }[] = [];
  for (const entry of entries) {
    const date = new Date(entry.at);
    const key = dayKey(date);
    if (groups.at(-1)?.key !== key) groups.push({ key, label: dayLabel(date), entries: [] });
    groups.at(-1)!.entries.push(entry);
  }
  return groups;
}

function LinkButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className="h-8 shrink-0 gap-1.5 whitespace-nowrap px-2.5 text-xs"
      data-sign-in-link
    >
      <KeyRound className="h-3.5 w-3.5" aria-hidden />
      Sign-in link
    </Button>
  );
}
