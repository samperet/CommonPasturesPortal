"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarDays,
  FileText,
  LayoutGrid,
  List,
  ListChecks,
  ListPlus,
  MessagesSquare,
  Network,
  Plus,
  ScrollText,
  Search,
  Settings2,
  Siren,
  Type,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  DEFAULT_INFO_VIEW,
  INFO_VIEWS,
  INFO_VIEW_LABELS,
  MAX_CHOSEN_PAGES,
  MAX_TEXT_MODULE,
  MODULE_NAMES,
  RECENT_LIMITS,
  REPEATABLE_MODULES,
  TEXT_BACKGROUNDS,
  TEXT_BACKGROUND_STYLES,
  type TextBackground,
  TASK_ADDERS,
  TASK_ADDER_LABELS,
  LOG_POSTERS,
  LOG_POSTER_LABELS,
  type CircleModule,
  type InfoFilter,
  type InfoSort,
  defaultInfoSort,
  type InfoView,
  type ModuleType,
} from "@/lib/circles/layout";
import type { Circle } from "@/lib/circles/types";
import { pagesFor, sortsFor } from "@/lib/circles/info-sort";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isCommunity } from "@/lib/circles/ids";
import { featureEnabled } from "@/lib/circles/features";
import { assigneePhrase, roleLabel, type TaskRole } from "@/lib/tasks/roles";
import { OwnerSelect } from "@/components/tasks/task-bits";
import { useCircles } from "@/components/directory/use-directory";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  DEFAULT_TASK_VIEW,
  DUE_LABELS,
  SHOW_LABELS,
  TASK_DUES,
  TASK_SHOWS,
  TASK_WHOSE,
  WHOSE_LABELS,
  describeView,
  type TaskDue,
  type TaskView,
  type TaskWhose,
} from "@/lib/tasks/shared";

/** Adding a module to a circle's page, and setting up which pages a Filtered Documents module shows. */

export const MODULE_ICONS: Record<ModuleType, typeof BookOpen> = {
  information: BookOpen,
  members: Users,
  schedule: CalendarDays,
  tasks: ListChecks,
  forum: MessagesSquare,
  log: ScrollText,
  finances: Wallet,
  documents: FileText,
  text: Type,
  subgroups: Network,
  alert: Siren,
  taskbutton: ListPlus,
};

const MODULE_HINTS: Record<ModuleType, string> = {
  information:
    "Show documents that match certain criteria — chosen pages, all of a circle's, its proposals waiting for consent, or the latest edited — right on the circle's page. Add as many as you like.",
  members: "Who's in the circle, and joining it.",
  schedule: "The circle's duty schedule.",
  tasks: "The circle's tasks.",
  forum:
    "Conversations and polls for the circle's members, who get an app notification for each new message.",
  log: "Short updates, with replies — a small forum of the circle's own that never notifies or emails anyone.",
  finances: "Track the circle's spending against its budget, with receipts.",
  documents:
    "The circle's documents — pages written here and files uploaded — searchable, with New to add one.",
  text: "Your own words, formatted — headings, lists, links, highlights, tables. Add as many as you like.",
  subgroups:
    "Smaller groups within the circle, each with its own members, page, and icon — and New sub group to start one.",
  alert:
    "A button any resident can press to alert the circle's members — or everyone at CVC — by notification and email. The Safety Crew's; always on its page.",
  taskbutton:
    "A button any resident can press to make a task for a role or a group — for requests like “Report a broken light”. Add as many as you like.",
};

// The visual editor is large, and needs the browser; load it only when someone edits.
const TextModuleEditor = dynamic(
  () => import("@/components/circles/text-module-editor").then((module) => module.TextModuleEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[16rem] animate-pulse rounded-lg border border-border bg-white" />
    ),
  }
);

const VIEW_ICONS: Record<InfoView, typeof List> = {
  full: FileText,
  summary: LayoutGrid,
  titles: List,
};

const newId = (type: ModuleType, taken: CircleModule[]) =>
  !REPEATABLE_MODULES.includes(type) && !taken.some((module) => module.id === type)
    ? type
    : `${type}-${Math.random().toString(36).slice(2, 8)}`;

/** A new Filtered Documents module: this circle's pages, as cards. */
export const newInformationModule = (circle: Circle, taken: CircleModule[]): CircleModule => ({
  id: newId("information", taken),
  type: "information",
  size: "full",
  info: { filter: { kind: "circle", circleId: circle.id }, view: DEFAULT_INFO_VIEW },
});

/** A new Custom Text module, empty, full width. */
export const newTextModule = (taken: CircleModule[]): CircleModule => ({
  id: newId("text", taken),
  type: "text",
  size: "full",
  text: { body: "" },
});

/** What a Custom Text module holds, in a few words. */
export const describeText = (module: CircleModule) => {
  const words = (module.text?.body ?? "").split(/\s+/).filter(Boolean).length;
  return words ? `${words} word${words === 1 ? "" : "s"}` : "Nothing written yet";
};

/** Writing a Custom Text module: its heading and its words, with the wiki's formatting. */
export function TextSettings({
  module,
  onSave,
  onClose,
}: {
  module: CircleModule;
  onSave: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(module.title ?? "");
  const [body, setBody] = useState(module.text?.body ?? "");
  const [background, setBackground] = useState<TextBackground>(module.text?.background ?? "white");
  const tooLong = body.length > MAX_TEXT_MODULE;
  return (
    <Dialog
      title="Custom Text"
      icon={<Type className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
      wide
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (tooLong) return;
          onSave({
            ...module,
            title: title.trim() || undefined,
            text: {
              body: body.trim(),
              ...(background !== "white" ? { background } : {}),
            },
          });
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Heading
          <Input
            value={title}
            maxLength={60}
            placeholder={MODULE_NAMES.text}
            onChange={(event) => setTitle(event.target.value)}
            className="bg-white"
          />
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-foreground">Background</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Background">
            {TEXT_BACKGROUNDS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={background === value}
                aria-label={TEXT_BACKGROUND_STYLES[value].label}
                title={TEXT_BACKGROUND_STYLES[value].label}
                onClick={() => setBackground(value)}
                className={cn(
                  "h-8 w-8 rounded-full border border-border transition",
                  background === value
                    ? "ring-2 ring-primary ring-offset-2"
                    : "hover:ring-2 hover:ring-border hover:ring-offset-1"
                )}
                style={{ backgroundColor: TEXT_BACKGROUND_STYLES[value].color }}
              />
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1" data-text-editor>
          <span className="text-sm font-medium text-foreground">Text</span>
          <TextModuleEditor markdown={body} onChange={setBody} />
          {tooLong ? (
            <p className="text-xs text-destructive">
              That&apos;s longer than {MAX_TEXT_MODULE.toLocaleString()} characters — for something
              this long, write a page and show it with a Filtered Documents module.
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={tooLong}>
            Done
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** What a Forum module does, in a few words. */
export const describeForum = () => "Conversations, with app notifications";

/** What a Log module allows, in a few words. */
export const describeLog = (module: CircleModule) =>
  module.log?.post === "anyone" ? "Any resident can post" : "Members post updates";

/** Setting up a Log module: who can post updates (anyone signed in can reply). */
export function LogSettings({
  module,
  onSave,
  onClose,
}: {
  module: CircleModule;
  onSave: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const [post, setPost] = useState(module.log?.post ?? "members");
  return (
    <Dialog
      title="Log settings"
      icon={<Settings2 className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ ...module, log: { post } });
        }}
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-foreground">Who can post updates</legend>
          {LOG_POSTERS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="log-post"
                checked={post === value}
                onChange={() => setPost(value)}
                className="h-4 w-4 accent-primary"
              />
              {LOG_POSTER_LABELS[value]}
            </label>
          ))}
          <p className="text-xs text-muted">
            Anyone signed in can reply. Nothing posted here notifies or emails anyone.
          </p>
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Done</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** What a Tasks module allows, in a few words. */
export const describeTasks = (module: CircleModule, personName?: (id: string) => string | null) => {
  const view = module.tasks?.view ?? DEFAULT_TASK_VIEW;
  const who = module.tasks?.add === "anyone" ? "any resident adds tasks" : "members add tasks";
  return `${describeView(view, view.personId ? personName?.(view.personId) : null)} · ${who}`;
};

/** Who can see a Finances module, in a few words. */
export const describeFinances = (module: CircleModule) =>
  module.finances?.view === "members" ? "Members and the Board see it" : "Everyone at CVC sees it";

/** What a Filtered Documents module shows, in a few words. */
export function describeFilter(filter: InfoFilter, circleName: (id: string) => string | undefined) {
  if (filter.kind === "pages")
    return filter.pageIds.length === 1 ? "1 chosen page" : `${filter.pageIds.length} chosen pages`;
  if (filter.kind === "circle") return `All ${circleName(filter.circleId) ?? "circle"} pages`;
  if (filter.kind === "proposed")
    return `${circleName(filter.circleId) ?? "Circle"} proposals waiting for consent`;
  return `${filter.limit} recently edited${
    filter.circleId ? ` ${circleName(filter.circleId) ?? ""}` : ""
  } pages`;
}

/**
 * Choosing what to add: Filtered Documents, Custom Text and Tasks any number
 * of times; the others when they're not on the page. Log and Finances aren't
 * offered any more (`lib/circles/layout.ts`), nor is the Alert: it's the
 * Safety Crew's, always on its page.
 */
export function AddModuleDialog({
  circle,
  modules,
  hasSchedule,
  onAdd,
  onClose,
}: {
  circle: Circle;
  modules: CircleModule[];
  hasSchedule: boolean;
  onAdd: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const offered = (
    [
      "information",
      "text",
      "members",
      "schedule",
      "tasks",
      "forum",
      "documents",
      "subgroups",
      "taskbutton",
    ] as const
  ).filter((type) => {
    if (REPEATABLE_MODULES.includes(type)) return true;
    if (modules.some((module) => module.type === type)) return false;
    if (type === "members" || type === "forum") return !isCommunity(circle.id);
    // Sub groups are one level deep.
    if (type === "subgroups") return !isCommunity(circle.id) && !circle.parentId;
    if (type === "schedule") return hasSchedule;
    return true;
  });
  return (
    <Dialog
      title="Add a module"
      icon={<Plus className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <ul className="flex flex-col gap-2">
        {offered.map((type) => {
          const Icon = MODULE_ICONS[type];
          return (
            <li key={type}>
              <button
                type="button"
                onClick={() =>
                  onAdd(
                    type === "information"
                      ? newInformationModule(circle, modules)
                      : type === "text"
                        ? newTextModule(modules)
                        : {
                            id: newId(type, modules),
                            type,
                            size: type === "members" ? "small" : "full",
                          }
                  )
                }
                className="flex w-full items-start gap-3 rounded-lg border border-border bg-white px-3 py-2.5 text-left transition hover:border-primary hover:bg-accent/50"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="flex flex-col">
                  <span className="font-medium text-foreground">{MODULE_NAMES[type]}</span>
                  <span className="text-xs text-muted">{MODULE_HINTS[type]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/**
 * Setting up a Tasks module: its title, which tasks it shows (open, done or
 * all; whose; when due; high priority only; repeating only), and who can add tasks — that
 * last for all of the circle's Tasks modules.
 */
export function TasksSettings({
  module,
  circle,
  onSave,
  onClose,
}: {
  module: CircleModule;
  circle: Circle;
  onSave: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(module.title ?? "");
  const [add, setAdd] = useState(module.tasks?.add ?? "members");
  const [view, setView] = useState<TaskView>(module.tasks?.view ?? DEFAULT_TASK_VIEW);
  const set = (change: Partial<TaskView>) => setView((current) => ({ ...current, ...change }));
  const person = (id: string | null) =>
    id ? circle.seats.find((seat) => seat.personId === id)?.name ?? null : null;
  const ready = view.whose !== "person" || !!view.personId;
  return (
    <Dialog
      title="Tasks settings"
      icon={<Settings2 className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          const { personId, high, repeating, ...rest } = view;
          onSave({
            ...module,
            title: title.trim() || undefined,
            tasks: {
              add,
              view: {
                ...rest,
                ...(rest.whose === "person" && personId ? { personId } : {}),
                ...(high ? { high } : {}),
                ...(repeating ? { repeating } : {}),
              },
            },
          });
        }}
        data-tasks-settings
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Title
          <Input
            value={title}
            maxLength={60}
            placeholder="Tasks"
            onChange={(event) => setTitle(event.target.value)}
            className="bg-white"
          />
        </label>
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-1 text-sm font-medium text-foreground">Which tasks it shows</legend>
          <SegmentedControl
            label="Show"
            value={view.show}
            onChange={(show) => set({ show })}
            options={TASK_SHOWS.map((value) => ({ value, label: SHOW_LABELS[value] }))}
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Whose
            <Select
              value={view.whose}
              onChange={(event) => set({ whose: event.target.value as TaskWhose })}
            >
              {TASK_WHOSE.map((value) => (
                <option key={value} value={value}>
                  {WHOSE_LABELS[value]}
                </option>
              ))}
            </Select>
          </label>
          {view.whose === "person" ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Whose tasks
              <Select
                value={view.personId ?? ""}
                onChange={(event) => set({ personId: event.target.value || undefined })}
              >
                <option value="">Choose a member…</option>
                {circle.seats
                  .filter((seat) => seat.personId)
                  .map((seat) => (
                    <option key={seat.personId} value={seat.personId!}>
                      {seat.name}
                    </option>
                  ))}
              </Select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            When due
            <Select
              value={view.due}
              onChange={(event) => set({ due: event.target.value as TaskDue })}
            >
              {TASK_DUES.map((value) => (
                <option key={value} value={value}>
                  {DUE_LABELS[value]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={!!view.high}
              onChange={(event) => set({ high: event.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            High priority only
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={!!view.repeating}
              onChange={(event) => set({ repeating: event.target.checked })}
              className="h-4 w-4 accent-primary"
              data-tasks-repeating
            />
            Repeating tasks only
          </label>
          <p className="text-xs text-muted">
            Shows: {describeView(view, person(view.personId ?? null))}. Add another Tasks module for
            another view.
          </p>
        </fieldset>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-foreground">
            Who can add tasks (in all of this circle&apos;s task lists)
          </legend>
          {TASK_ADDERS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="tasks-add"
                checked={add === value}
                onChange={() => setAdd(value)}
                className="h-4 w-4 accent-primary"
              />
              {TASK_ADDER_LABELS[value]}
            </label>
          ))}
          <p className="text-xs text-muted">
            {add === "anyone"
              ? "Anyone signed in can add a task here, and change or delete the ones they added. The circle's members, the Board, and admins change any task."
              : "The circle's members, the Board, and admins add and change tasks. Anyone can comment, and take on a task nobody has."}
          </p>
        </fieldset>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready}>
            Done
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const FILTER_KINDS: [InfoFilter["kind"], string][] = [
  ["pages", "Specific pages"],
  ["circle", "All pages of a circle"],
  ["proposed", "Proposals waiting for consent"],
  ["recent", "Recently edited"],
];

/**
 * Setting up a Filtered Documents module: its title, which pages it shows
 * (chosen ones, all of a circle's, its proposals waiting for consent, or
 * the latest edited), in what order, and how.
 */
export function InformationSettings({
  circle,
  module,
  onSave,
  onClose,
}: {
  circle: Circle;
  module: CircleModule;
  onSave: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const { data: wiki } = useWikiPages();
  const pages = useMemo(() => wiki?.pages ?? [], [wiki]);
  const circles = (useCircles() ?? [])
    .slice()
    .sort((a, b) =>
      isCommunity(a.id) ? -1 : isCommunity(b.id) ? 1 : a.name.localeCompare(b.name)
    );
  const start = module.info ?? {
    filter: { kind: "circle" as const, circleId: circle.id },
    view: DEFAULT_INFO_VIEW,
  };
  const [title, setTitle] = useState(module.title ?? "");
  const [kind, setKind] = useState<InfoFilter["kind"]>(start.filter.kind);
  const [pageIds, setPageIds] = useState<string[]>(
    start.filter.kind === "pages" ? start.filter.pageIds : []
  );
  const [circleId, setCircleId] = useState(
    start.filter.kind === "circle" || start.filter.kind === "proposed"
      ? start.filter.circleId
      : circle.id
  );
  const [limit, setLimit] = useState(
    start.filter.kind === "recent" ? start.filter.limit : RECENT_LIMITS.default
  );
  const [recentCircle, setRecentCircle] = useState(
    start.filter.kind === "recent" ? start.filter.circleId ?? "" : ""
  );
  const [view, setView] = useState<InfoView>(start.view);
  const [sort, setSort] = useState<InfoSort | "">(start.sort ?? "");
  const [find, setFind] = useState("");

  const filter: InfoFilter =
    kind === "pages"
      ? { kind, pageIds }
      : kind === "circle" || kind === "proposed"
        ? { kind, circleId }
        : { kind, limit, ...(recentCircle ? { circleId: recentCircle } : {}) };
  const valid = kind !== "pages" || pageIds.length > 0;
  const byId = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const circleName = (id: string) => circles.find((entry) => entry.id === id)?.name;
  const matches = useMemo(() => {
    const wanted = find.trim().toLowerCase();
    return pages
      .filter(
        (page) =>
          !pageIds.includes(page.id) && (!wanted || page.title.toLowerCase().includes(wanted))
      )
      .sort((a, b) => {
        if (!wanted) return a.title.localeCompare(b.title);
        const at = (title: string) => (title.toLowerCase().startsWith(wanted) ? 0 : 1);
        return at(a.title) - at(b.title) || a.title.localeCompare(b.title);
      })
      .slice(0, 8);
  }, [find, pages, pageIds]);
  const preview =
    valid && kind !== "pages" ? pagesFor({ filter, ...(sort ? { sort } : {}) }, pages) : [];
  // The order offered depends on the filter: a change of filter goes back to its own order.
  const chooseKind = (next: InfoFilter["kind"]) => {
    setKind(next);
    setSort("");
  };
  const sorts = sortsFor(kind);
  const shownSort = sort || (kind === "proposed" ? "" : defaultInfoSort(filter));
  const moveChosen = (from: number, to: number) => {
    if (to < 0 || to >= pageIds.length) return;
    const next = [...pageIds];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    setPageIds(next);
  };
  const small =
    "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-accent hover:text-foreground disabled:opacity-40";

  return (
    <Dialog
      title="Filtered Documents settings"
      icon={<Settings2 className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          const { title: _old, ...rest } = module;
          onSave({
            ...rest,
            ...(title.trim() ? { title: title.trim() } : {}),
            info: {
              filter,
              view,
              ...(sort && sort !== defaultInfoSort(filter) ? { sort } : {}),
            },
          });
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Title
          <Input
            value={title}
            maxLength={60}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Filtered Documents"
            className="bg-white"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Show</legend>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Which pages">
            {FILTER_KINDS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="info-filter"
                  checked={kind === value}
                  onChange={() => chooseKind(value)}
                  className="h-4 w-4 accent-primary"
                />
                {label}
              </label>
            ))}
          </div>

          {kind === "pages" ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-accent/30 p-3">
              {pageIds.length ? (
                <ol className="flex flex-col gap-1" aria-label="Chosen pages">
                  {pageIds.map((id, index) => {
                    const page = byId.get(id);
                    return (
                      <li
                        key={id}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1 text-sm"
                      >
                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                        <span
                          className={cn("min-w-0 flex-1 truncate", !page && "italic text-muted")}
                        >
                          {page?.title ?? "A page that's gone"}
                        </span>
                        <button
                          type="button"
                          className={small}
                          onClick={() => moveChosen(index, index - 1)}
                          disabled={index === 0}
                          aria-label={`Move ${page?.title ?? "page"} up`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={small}
                          onClick={() => moveChosen(index, index + 1)}
                          disabled={index === pageIds.length - 1}
                          aria-label={`Move ${page?.title ?? "page"} down`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className={small}
                          onClick={() => setPageIds(pageIds.filter((other) => other !== id))}
                          aria-label={`Take ${page?.title ?? "page"} out`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-xs text-muted">
                  Choose up to {MAX_CHOSEN_PAGES} pages; they show in this order.
                </p>
              )}
              {pageIds.length < MAX_CHOSEN_PAGES ? (
                <>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                      aria-hidden
                    />
                    <Input
                      value={find}
                      onChange={(event) => setFind(event.target.value)}
                      placeholder="Find a page…"
                      className="bg-white pl-8"
                      aria-label="Find a page"
                    />
                  </div>
                  <ul className="flex max-h-48 flex-col overflow-y-auto" aria-label="Pages to add">
                    {matches.map((page) => (
                      <li key={page.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPageIds([...pageIds, page.id]);
                            setFind("");
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          <Plus className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{page.title}</span>
                          <span className="shrink-0 text-xs text-muted">
                            {circleName(page.keeper)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {!matches.length ? (
                      <li className="px-2 py-1.5 text-xs text-muted">No pages match.</li>
                    ) : null}
                  </ul>
                </>
              ) : null}
            </div>
          ) : kind === "circle" || kind === "proposed" ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Circle
              <Select
                value={circleId}
                onChange={(event) => setCircleId(event.target.value)}
                className="px-2"
              >
                {circles.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                How many
                <Select
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                  className="px-2"
                >
                  {Array.from(
                    { length: RECENT_LIMITS.max - RECENT_LIMITS.min + 1 },
                    (_, index) => RECENT_LIMITS.min + index
                  ).map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                From
                <Select
                  value={recentCircle}
                  onChange={(event) => setRecentCircle(event.target.value)}
                  className="px-2"
                >
                  <option value="">The whole wiki</option>
                  {circles.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          )}
          {kind !== "pages" ? (
            <p className="text-xs text-muted">
              {preview.length
                ? `Shows ${preview.length === 1 ? "1 page" : `${preview.length} pages`} now.`
                : "No pages there yet."}
            </p>
          ) : null}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Sort by
          <Select
            value={shownSort}
            onChange={(event) => setSort(event.target.value as InfoSort | "")}
            aria-label="Sort by"
            className="px-2"
          >
            {sorts.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium text-foreground">Show pages as</legend>
          <SegmentedControl
            size="xs"
            label="Show pages as"
            value={view}
            onChange={setView}
            options={INFO_VIEWS.map((option) => ({
              value: option,
              label: INFO_VIEW_LABELS[option],
              icon: VIEW_ICONS[option],
            }))}
          />
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid}>
            Done
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** A Task button, in a few words: "“Report a broken light” makes “Broken light” for the Trash Master". */
export function describeTaskButton(module: CircleModule, circles: Pick<Circle, "id" | "name">[]) {
  const button = module.taskButton;
  if (!button) return "Not set up yet";
  return `“${button.label}” makes “${button.title}” for ${assigneePhrase(
    button.assignee,
    roleLabel(button.assignee, circles)
  )}`;
}

/**
 * Setting up a Task button: what the button says, the task it makes, and
 * who it's for — a role or a whole group, in a circle you look after (the
 * server checks too); the task goes on that circle's board, so that circle
 * needs its tasks on (a Tasks module on its page).
 */
export function TaskButtonSettings({
  module,
  circle,
  onSave,
  onClose,
}: {
  module: CircleModule;
  circle: Circle;
  onSave: (module: CircleModule) => void;
  onClose: () => void;
}) {
  const circles = useCircles() ?? [];
  const [label, setLabel] = useState(module.taskButton?.label ?? "");
  const [title, setTitle] = useState(module.taskButton?.title ?? "");
  const [assignee, setAssignee] = useState<TaskRole | null>(module.taskButton?.assignee ?? null);
  const target = assignee ? circles.find((entry) => entry.id === assignee.circleId) : undefined;
  const ready = !!label.trim() && !!title.trim() && !!assignee;
  return (
    <Dialog
      title="Task button"
      icon={<ListPlus className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          onSave({
            ...module,
            taskButton: { label: label.trim(), title: title.trim(), assignee: assignee! },
          });
        }}
        data-task-button-settings
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          What the button says
          <Input
            value={label}
            maxLength={60}
            placeholder="Report a broken light"
            onChange={(event) => setLabel(event.target.value)}
            className="bg-white"
            data-task-button-label
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          The task it makes
          <Input
            value={title}
            maxLength={160}
            placeholder="Broken light"
            onChange={(event) => setTitle(event.target.value)}
            className="bg-white"
            data-task-button-title
          />
          <span className="text-xs font-normal text-muted">
            Whoever presses it can add a note, which becomes the task&apos;s description.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Who it&apos;s for
          <OwnerSelect
            circle={circle}
            value={{ ownerId: null, ownerRole: assignee }}
            onChange={(chosen) => setAssignee(chosen.ownerRole)}
            people={false}
            className="h-10"
          />
          <span className="text-xs font-normal text-muted">
            A role (whoever holds it then has the task) or a whole group. The task goes on
            {target ? ` ${target.name}'s` : " that circle's"} board.
          </span>
        </label>
        {target && !featureEnabled(target, "tasks") ? (
          <p className="rounded-md bg-sun/15 px-3 py-2 text-sm text-[#7a5200]" data-task-button-off>
            {target.name} has no Tasks module on its page, so its tasks are off: the button
            can&apos;t make one there until it has.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready}>
            Done
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
