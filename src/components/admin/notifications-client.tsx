"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, ChevronRight, Mail, Search, Smartphone } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { TOPICS, type Preferences, type Topic } from "@/lib/push/topics";
import {
  APP_OUTCOMES,
  APP_SHORT,
  DIRECT_EMAILS,
  EMAIL_OUTCOMES,
  EMAIL_SHORT,
  NO_EMAIL,
  REACHED,
  describeChange,
  outcomeFor,
  topicLabel,
  type AppOutcome,
  type ChangeRecord,
  type DeliveryRecord,
  type EmailOutcome,
} from "@/lib/notifications/shared";
import { useCircles } from "@/components/directory/use-directory";
import { labelledCircles } from "@/lib/circles/tiers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented";
import { ErrorCard, Loading } from "@/components/ui/status";
import { TIME_ZONE, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The admins' Notifications page: the full picture of who's told what, and
 * how. **Sent** is the delivery log — every notification (and sign-in link)
 * with, for each resident it was for, how it went by app and by email and
 * why not (held by test mode, not chosen, no device…), filterable by topic
 * and by person. **People** shows each resident's address, account, devices
 * and choices, with what's been sent to them and what they've changed.
 * **Rules** is each topic: who it goes to, its defaults, how many have it
 * on — and who would get one now (`/api/admin/notifications/preview`).
 * **Changes** is the opt-in/opt-out log.
 */

type Person = {
  key: string;
  name: string;
  email: string | null;
  emailValid: boolean;
  signedIn: boolean;
  lastSeen: string | null;
  devices: string[];
  app: Preferences | null;
  appSaved: Partial<Preferences>;
  emailChoices: Preferences | null;
  emailSaved: Partial<Preferences>;
};
type Rule = {
  topic: Topic;
  label: string;
  audience: string;
  appDefault: boolean;
  emailable: boolean;
  emailDefault: boolean;
  appOn: number;
  signedIn: number;
  emailOn: number;
  withAddress: number;
};
type Data = {
  days: number;
  deliveries: DeliveryRecord[];
  changes: ChangeRecord[];
  people: Person[];
  rules: Rule[];
  email: { configured: boolean; testMode: boolean; allowed: number };
};
type Preview = {
  topic: Topic;
  circle: { id: string; name: string } | null;
  emailed: boolean;
  testMode: boolean;
  plan: {
    key: string;
    name: string;
    app: AppOutcome | "send";
    devices: number;
    email: EmailOutcome | "send" | null;
  }[];
};
type View = "sent" | "people" | "rules" | "changes";

/** When, in Vermont time, and how long ago. */
const when = (iso: string) =>
  `${new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  })} · ${timeAgo(iso)}`;

export function NotificationsClient() {
  const [view, setView] = useState<View>("sent");
  const [days, setDays] = useState(14);
  const [person, setPerson] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "notifications", days],
    queryFn: () => apiFetch<Data>(`/api/admin/notifications?days=${days}`),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });
  const names = useMemo(
    () => new Map((data?.people ?? []).map((entry) => [entry.key, entry.name])),
    [data]
  );
  const nameOf = (key: string) => names.get(key) ?? "Someone no longer in the directory";
  const openPerson = (key: string) => {
    setPerson(key);
    setView("people");
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6" data-notifications-admin>
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <BellRing className="h-6 w-6 text-primary" aria-hidden /> Notifications
        </h1>
        <p className="text-sm text-muted">
          What was sent, to whom, how, and why not — by app and by email.
        </p>
        {data ? (
          <p className="text-sm" data-email-state>
            {!data.email.configured ? (
              <span className="text-destructive">Email isn&apos;t set up: nothing is emailed.</span>
            ) : data.email.testMode ? (
              <span>
                <Pill tone="amber">Email test mode</Pill> Only the {data.email.allowed} allowed
                address{data.email.allowed === 1 ? " gets" : "es get"} email; everyone else&apos;s
                is held back.{" "}
                <Link href="/admin/email" className="font-medium text-pine hover:underline">
                  Email settings
                </Link>
              </span>
            ) : (
              <span className="text-muted">
                Email is live.{" "}
                <Link href="/admin/email" className="font-medium text-pine hover:underline">
                  Email settings
                </Link>
              </span>
            )}
          </p>
        ) : null}
      </div>

      <SegmentedControl
        role="tablist"
        label="Notifications"
        value={view}
        onChange={setView}
        options={[
          { value: "sent", label: "Sent" },
          { value: "people", label: "People" },
          { value: "rules", label: "Rules" },
          { value: "changes", label: "Opt-ins & outs" },
        ]}
      />

      {isLoading ? (
        <Loading>Loading notifications…</Loading>
      ) : error || !data ? (
        <ErrorCard error={error} fallback="Couldn't load notifications" />
      ) : view === "sent" ? (
        <SentView
          data={data}
          nameOf={nameOf}
          days={days}
          setDays={setDays}
          openPerson={openPerson}
        />
      ) : view === "people" ? (
        <PeopleView data={data} chosen={person} choose={setPerson} nameOf={nameOf} />
      ) : view === "rules" ? (
        <RulesView data={data} openPerson={openPerson} />
      ) : (
        <ChangesView changes={data.changes} nameOf={nameOf} openPerson={openPerson} />
      )}
    </div>
  );
}

/** Each outcome's count, as short chips: "App 4 sent · 2 no device". */
function Counts<K extends string>({
  label,
  icon,
  buckets,
  short,
  reached,
}: {
  label: string;
  icon: React.ReactNode;
  buckets: Partial<Record<K, string[]>>;
  short: Record<K, string>;
  reached: K[];
}) {
  const entries = (Object.keys(short) as K[]).filter((key) => buckets[key]?.length);
  if (!entries.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
        {icon} {label}
      </span>
      {entries.map((key, index) => (
        <span key={key} className={cn(reached.includes(key) && "font-medium text-pine")}>
          {index ? "· " : ""}
          {buckets[key]!.length} {short[key]}
        </span>
      ))}
    </span>
  );
}

function SentView({
  data,
  nameOf,
  days,
  setDays,
  openPerson,
}: {
  data: Data;
  nameOf: (key: string) => string;
  days: number;
  setDays: (days: number) => void;
  openPerson: (key: string) => void;
}) {
  const [topic, setTopic] = useState("");
  const [who, setWho] = useState("");
  const shown = data.deliveries.filter(
    (record) =>
      (!topic || record.topic === topic) &&
      (!who || outcomeFor(record, who).app || outcomeFor(record, who).email)
  );
  const topics = Array.from(new Set(data.deliveries.map((record) => record.topic)));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={topic} onChange={(event) => setTopic(event.target.value)} aria-label="Topic">
          <option value="">Every topic</option>
          {topics.map((entry) => (
            <option key={entry} value={entry}>
              {topicLabel(entry)}
            </option>
          ))}
        </Select>
        <Select value={who} onChange={(event) => setWho(event.target.value)} aria-label="Person">
          <option value="">Everyone</option>
          {[...data.people]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.name}
              </option>
            ))}
        </Select>
        <Select
          value={String(days)}
          onChange={(event) => setDays(Number(event.target.value))}
          aria-label="How far back"
        >
          {[7, 14, 30, 90, 400].map((count) => (
            <option key={count} value={count}>
              {count === 400 ? "Everything kept" : `Last ${count} days`}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-xs text-muted" data-sent-count>
        {shown.length} sent{who ? ` that were for ${nameOf(who)}` : ""}
      </p>
      {shown.length ? (
        <ul className="flex flex-col gap-2" data-deliveries>
          {shown.map((record) => (
            <DeliveryRow
              key={record.id}
              record={record}
              nameOf={nameOf}
              focus={who}
              openPerson={openPerson}
            />
          ))}
        </ul>
      ) : (
        <Card className="text-sm text-muted">Nothing sent in that time.</Card>
      )}
    </div>
  );
}

function DeliveryRow({
  record,
  nameOf,
  focus,
  openPerson,
}: {
  record: DeliveryRecord;
  nameOf: (key: string) => string;
  focus: string;
  openPerson: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const theirs = focus ? outcomeFor(record, focus) : null;
  return (
    <li data-delivery={record.id}>
      <Card className="flex flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Pill tone="pine">{topicLabel(record.topic)}</Pill>
          <span>{when(record.at)}</span>
          <span>
            {record.by ? `from ${record.by.name}` : "from the app"} ·{" "}
            {record.topic in DIRECT_EMAILS
              ? "to one resident"
              : record.narrowed
                ? "for some"
                : "for everyone"}
          </span>
          {record.testMode ? <Pill tone="amber">Test mode</Pill> : null}
          {record.ignoredPreferences ? <Pill tone="outline">Whatever their settings</Pill> : null}
        </div>
        <p className="font-medium text-foreground">
          {record.url ? (
            <Link href={record.url} className="hover:underline">
              {record.title}
            </Link>
          ) : (
            record.title
          )}
        </p>
        {theirs ? (
          <p className="text-sm" data-their-outcome>
            For {nameOf(focus)}: by app,{" "}
            {theirs.app ? APP_OUTCOMES[theirs.app].toLowerCase() : "not sent"}; by email,{" "}
            {theirs.email
              ? EMAIL_OUTCOMES[theirs.email].toLowerCase()
              : record.noEmail
                ? NO_EMAIL[record.noEmail].toLowerCase()
                : "not sent"}
            .
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Counts
            label="App"
            icon={<Smartphone className="h-3.5 w-3.5" aria-hidden />}
            buckets={record.app}
            short={APP_SHORT}
            reached={REACHED.app}
          />
          {record.noEmail ? (
            <span className="text-xs text-muted">
              <Mail className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              {NO_EMAIL[record.noEmail]}
            </span>
          ) : (
            <Counts
              label="Email"
              icon={<Mail className="h-3.5 w-3.5" aria-hidden />}
              buckets={record.email}
              short={EMAIL_SHORT}
              reached={REACHED.email}
            />
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-pine hover:underline"
            data-delivery-who
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition", open && "rotate-90")} />
            Who
          </button>
        </div>
        {open ? (
          <div
            className="grid gap-3 border-t border-border pt-2 sm:grid-cols-2"
            data-delivery-detail
          >
            <OutcomeLists
              title="By app"
              buckets={record.app}
              labels={APP_OUTCOMES}
              nameOf={nameOf}
              openPerson={openPerson}
            />
            {record.noEmail ? (
              <p className="text-sm text-muted">{NO_EMAIL[record.noEmail]}.</p>
            ) : (
              <OutcomeLists
                title="By email"
                buckets={record.email}
                labels={EMAIL_OUTCOMES}
                nameOf={nameOf}
                openPerson={openPerson}
              />
            )}
          </div>
        ) : null}
      </Card>
    </li>
  );
}

function OutcomeLists<K extends string>({
  title,
  buckets,
  labels,
  nameOf,
  openPerson,
}: {
  title: string;
  buckets: Partial<Record<K, string[]>>;
  labels: Record<K, string>;
  nameOf: (key: string) => string;
  openPerson: (key: string) => void;
}) {
  const entries = (Object.keys(labels) as K[]).filter((key) => buckets[key]?.length);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {entries.length ? (
        entries.map((key) => (
          <div key={key} data-outcome={key}>
            <p className="text-xs font-medium text-foreground">
              {labels[key]} ({buckets[key]!.length})
            </p>
            <p className="text-foreground-light">
              {buckets[key]!.map((who, index) => (
                <Fragment key={who}>
                  {index ? ", " : ""}
                  <button
                    type="button"
                    className="hover:text-foreground hover:underline"
                    onClick={() => openPerson(who)}
                  >
                    {nameOf(who)}
                  </button>
                </Fragment>
              ))}
            </p>
          </div>
        ))
      ) : (
        <p className="text-muted">Nobody.</p>
      )}
    </div>
  );
}

function PeopleView({
  data,
  chosen,
  choose,
  nameOf,
}: {
  data: Data;
  chosen: string;
  choose: (key: string) => void;
  nameOf: (key: string) => string;
}) {
  const [query, setQuery] = useState("");
  const person = data.people.find((entry) => entry.key === chosen);
  if (person)
    return <PersonDetail person={person} data={data} nameOf={nameOf} back={() => choose("")} />;
  const q = query.trim().toLowerCase();
  const people = [...data.people]
    .filter((entry) => !q || entry.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const topics = Object.keys(TOPICS) as Topic[];
  return (
    <div className="flex flex-col gap-3">
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          placeholder="Find someone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
          aria-label="Find someone"
        />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm" data-people-table>
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Resident</th>
              <th className="px-3 py-2 font-medium">App</th>
              <th className="px-3 py-2 font-medium">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {people.map((entry) => (
              <tr key={entry.key} data-person-row={entry.key}>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => choose(entry.key)}
                    className="font-medium text-foreground hover:underline"
                  >
                    {entry.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-muted">
                  {!entry.signedIn
                    ? "Not signed in"
                    : `${entry.devices.length} device${entry.devices.length === 1 ? "" : "s"} · ${
                        topics.filter((topic) => entry.app?.[topic]).length
                      } of ${topics.length} on`}
                </td>
                <td className="px-3 py-2 text-muted">
                  {!entry.emailValid
                    ? "No address"
                    : `${topics.filter((topic) => entry.emailChoices?.[topic]).length} chosen`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function PersonDetail({
  person,
  data,
  nameOf,
  back,
}: {
  person: Person;
  data: Data;
  nameOf: (key: string) => string;
  back: () => void;
}) {
  const topics = Object.keys(TOPICS) as Topic[];
  const emailable = new Set(data.rules.filter((rule) => rule.emailable).map((rule) => rule.topic));
  const theirs = data.deliveries.filter((record) => {
    const outcome = outcomeFor(record, person.key);
    return outcome.app || outcome.email;
  });
  const changes = data.changes.filter((change) => change.who === person.key);
  const choice = (on: boolean | undefined, saved: boolean | undefined) => (
    <span className={cn(on ? "font-medium text-pine" : "text-muted")}>
      {on ? "On" : "Off"}
      {saved === undefined ? <span className="text-xs text-muted"> (default)</span> : null}
    </span>
  );
  return (
    <div className="flex flex-col gap-4" data-person-detail={person.key}>
      <button
        type="button"
        onClick={back}
        className="self-start text-sm font-medium text-pine hover:underline"
      >
        ← Everyone
      </button>
      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">{person.name}</h2>
        <ul className="flex flex-col gap-1 text-sm text-foreground-light">
          <li>
            <strong className="font-medium text-foreground">Email:</strong>{" "}
            {person.email ? (
              <>
                {person.email}
                {person.emailValid ? "" : " — not a working address"}
              </>
            ) : (
              "no address in the directory"
            )}
          </li>
          <li>
            <strong className="font-medium text-foreground">Account:</strong>{" "}
            {person.signedIn
              ? `signed in${person.lastSeen ? `, last seen ${timeAgo(person.lastSeen)}` : ""}`
              : "hasn't signed in, so no app notifications"}
          </li>
          <li data-person-devices>
            <strong className="font-medium text-foreground">Devices:</strong>{" "}
            {person.devices.length
              ? person.devices.map((at) => `one turned on ${timeAgo(at)}`).join("; ")
              : "none has notifications on"}
          </li>
        </ul>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm" data-person-choices>
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Topic</th>
              <th className="px-3 py-2 font-medium">By app</th>
              <th className="px-3 py-2 font-medium">By email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {topics.map((topic) => (
              <tr key={topic} data-choice={topic}>
                <td className="px-3 py-2 text-foreground">{TOPICS[topic]}</td>
                <td className="px-3 py-2" data-app>
                  {person.app ? choice(person.app[topic], person.appSaved[topic]) : "—"}
                </td>
                <td className="px-3 py-2" data-email>
                  {!emailable.has(topic)
                    ? "App only"
                    : person.emailChoices
                      ? choice(person.emailChoices[topic], person.emailSaved[topic])
                      : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <section className="flex flex-col gap-2" data-person-sent>
        <h3 className="text-sm font-semibold text-foreground">
          Sent to them in the last {data.days} days ({theirs.length})
        </h3>
        {theirs.length ? (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-white">
            {theirs.map((record) => {
              const outcome = outcomeFor(record, person.key);
              return (
                <li key={record.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
                  <span className="text-xs text-muted">
                    {topicLabel(record.topic)} · {when(record.at)}
                  </span>
                  <span className="text-foreground">{record.title}</span>
                  <span className="text-xs">
                    <span
                      className={cn(
                        outcome.app && REACHED.app.includes(outcome.app)
                          ? "text-pine"
                          : "text-muted"
                      )}
                    >
                      App: {outcome.app ? APP_SHORT[outcome.app] : "—"}
                    </span>{" "}
                    ·{" "}
                    <span
                      className={cn(
                        outcome.email && REACHED.email.includes(outcome.email)
                          ? "text-pine"
                          : "text-muted"
                      )}
                    >
                      Email:{" "}
                      {outcome.email
                        ? EMAIL_SHORT[outcome.email]
                        : record.noEmail
                          ? NO_EMAIL[record.noEmail].toLowerCase()
                          : "—"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">What they&apos;ve changed</h3>
        <ChangeList changes={changes} nameOf={nameOf} />
      </section>
    </div>
  );
}

function RulesView({ data, openPerson }: { data: Data; openPerson: (key: string) => void }) {
  const [previewing, setPreviewing] = useState<Topic | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Each kind of notification: who it&apos;s for, what it is until someone chooses, and how many
        have it on now. Nobody is told about their own posts.
      </p>
      <ul className="flex flex-col gap-2" data-rules>
        {data.rules.map((rule) => (
          <li key={rule.topic} data-rule={rule.topic}>
            <Card className="flex flex-col gap-1.5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-foreground">{rule.label}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewing(previewing === rule.topic ? null : rule.topic)}
                  aria-expanded={previewing === rule.topic}
                  data-preview-open={rule.topic}
                >
                  Who would get one now?
                </Button>
              </div>
              <p className="text-sm text-foreground-light">{rule.audience}.</p>
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>
                  <Smartphone className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  App: {rule.appDefault ? "on" : "off"} until chosen · on for {rule.appOn} of{" "}
                  {rule.signedIn} signed in
                </span>
                <span>
                  <Mail className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                  {rule.emailable
                    ? `Email: ${rule.emailDefault ? "on" : "off"} until chosen · chosen by ${
                        rule.emailOn
                      } of ${rule.withAddress} with an address`
                    : "Never emailed"}
                </span>
              </p>
              {previewing === rule.topic ? (
                <PreviewPanel topic={rule.topic} openPerson={openPerson} />
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Who would get one on this topic now — everyone, or a circle's members. */
function PreviewPanel({ topic, openPerson }: { topic: Topic; openPerson: (key: string) => void }) {
  const circles = useCircles();
  const [circle, setCircle] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "notifications", "preview", topic, circle],
    queryFn: () =>
      apiFetch<Preview>(
        `/api/admin/notifications/preview?${new URLSearchParams({
          topic,
          ...(circle ? { circle } : {}),
        })}`
      ),
    placeholderData: (previous) => previous,
  });
  const group = <K extends string>(pick: (entry: Preview["plan"][number]) => K | null) => {
    const buckets: Partial<Record<K, string[]>> = {};
    for (const entry of data?.plan ?? []) {
      const key = pick(entry);
      if (key) (buckets[key] ??= []).push(entry.key);
    }
    return buckets;
  };
  const names = new Map((data?.plan ?? []).map((entry) => [entry.key, entry.name]));
  const nameOf = (key: string) => names.get(key) ?? key;
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border pt-3" data-preview={topic}>
      <label className="flex flex-wrap items-center gap-2 text-sm text-foreground">
        Sent to
        <Select
          value={circle}
          onChange={(event) => setCircle(event.target.value)}
          aria-label="Sent to"
        >
          <option value="">everyone</option>
          {labelledCircles(circles ?? []).map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}&apos;s members
            </option>
          ))}
        </Select>
      </label>
      {isLoading ? (
        <Loading>Working it out…</Loading>
      ) : error || !data ? (
        <p className="text-sm text-destructive">{(error as Error)?.message}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <OutcomeLists
            title="By app"
            buckets={group((entry) => (entry.app === "send" ? "sent" : entry.app))}
            labels={{ ...APP_OUTCOMES, sent: "Would be sent to their devices" }}
            nameOf={nameOf}
            openPerson={openPerson}
          />
          {data.emailed ? (
            <OutcomeLists
              title={data.testMode ? "By email (test mode on)" : "By email"}
              buckets={group((entry) => (entry.email === "send" ? "sent" : entry.email))}
              labels={{ ...EMAIL_OUTCOMES, sent: "Would be emailed" }}
              nameOf={nameOf}
              openPerson={openPerson}
            />
          ) : (
            <p className="text-sm text-muted">Not emailed.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ChangesView({
  changes,
  nameOf,
  openPerson,
}: {
  changes: ChangeRecord[];
  nameOf: (key: string) => string;
  openPerson: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Every choice to be told, or not, and every device turned on or off — newest first.
      </p>
      <ChangeList changes={changes} nameOf={nameOf} openPerson={openPerson} />
    </div>
  );
}

function ChangeList({
  changes,
  nameOf,
  openPerson,
}: {
  changes: ChangeRecord[];
  nameOf: (key: string) => string;
  openPerson?: (key: string) => void;
}) {
  if (!changes.length) return <p className="text-sm text-muted">No changes yet.</p>;
  return (
    <ul
      className="flex flex-col divide-y divide-border rounded-xl border border-border bg-white"
      data-changes
    >
      {changes.map((change, index) => (
        <li key={`${change.at}-${index}`} className="flex flex-col gap-0.5 px-3 py-2 text-sm">
          <span className="text-xs text-muted">{when(change.at)}</span>
          <span className="text-foreground">
            {openPerson ? (
              <button
                type="button"
                onClick={() => openPerson(change.who)}
                className="font-medium hover:underline"
              >
                {nameOf(change.who)}
              </button>
            ) : null}
            {openPerson ? ": " : ""}
            {describeChange(change)}
          </span>
        </li>
      ))}
    </ul>
  );
}
