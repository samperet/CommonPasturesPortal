"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  MODULE_SIZES,
  rowSpans,
  SIZE_LABELS,
  SIZE_NAMES,
  type CircleModule,
  type ModuleSize,
} from "@/lib/circles/layout";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm";
import { SegmentedControl } from "@/components/ui/segmented";
import { useSession } from "@/lib/auth/client";

/**
 * A circle page's modules, laid out as the circle chose: in its order, each
 * a third, half, two thirds, or the full width of the main column on wider
 * screens, in rows — the last of a row widening to fill it (phones stack
 * them). Members always sits in its own column on the
 * right, so its length never pushes the other modules apart (on phones it
 * comes after them). Each reader can fold any module away; that's remembered
 * on their device. Editing the page, the circle's members drag modules (or
 * use the arrows), pick their sizes, set modules up, and remove them.
 */

const SPAN: Record<number, string> = {
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
};

export interface ModuleView {
  title: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
  /** What it shows, in a word or two (while editing the page). */
  detail?: string;
}

/** Each module's title, icon, and content, by module id (a module without one isn't shown). */
export type ModuleViews = Record<string, ModuleView | undefined>;

const REMOVE_NOTE: Partial<Record<CircleModule["type"], string>> = {
  information: " Its pages stay in Documents.",
  tasks: " The circle's tasks are kept, and come back if you add Tasks again.",
  log: " The circle's updates are kept, and come back if you add Log again.",
  finances:
    " The circle's expenses, budgets, and receipts are kept, and come back if you add Finances again.",
  forum: " The circle's conversations are kept; add Forum again to see them here.",
  documents: " The circle's documents are kept, and come back if you add Documents again.",
  text: " Its words go with it.",
  subgroups: " The sub groups stay, within this circle; only their list goes from its page.",
  alert: " Its alerts are kept, and come back if an admin adds Alert again.",
};

/** Members goes in the right-hand column; everything else in the main one, in order. */
const isAside = (module: Pick<CircleModule, "type">) => module.type === "members";

/** The main column and, when there is one, the right-hand column beside it. */
function Columns({ main, aside }: { main: React.ReactNode; aside: React.ReactNode | null }) {
  if (!aside) return <>{main}</>;
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">{main}</div>
      <aside className="min-w-0 lg:w-80 lg:shrink-0 xl:w-96">{aside}</aside>
    </div>
  );
}

type ModuleState = { collapsed: boolean; toggle: () => void; title: string };
const ModuleContext = createContext<ModuleState | null>(null);

/** Fold or unfold the module a heading belongs to (nothing, outside a circle page). */
export function ModuleToggle({ className }: { className?: string }) {
  const section = useContext(ModuleContext);
  if (!section) return null;
  return (
    <button
      type="button"
      onClick={section.toggle}
      className={cn(
        "-ml-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-accent hover:text-foreground",
        className
      )}
      aria-expanded={!section.collapsed}
      aria-label={section.collapsed ? `Show ${section.title}` : `Fold away ${section.title}`}
      title={section.collapsed ? "Show" : "Fold away"}
    >
      {section.collapsed ? (
        <ChevronRight className="h-4 w-4" />
      ) : (
        <ChevronDown className="h-4 w-4" />
      )}
    </button>
  );
}

/** Which of a circle's modules this reader has folded away (by id), kept on this device. */
function useCollapsed(circleId: string) {
  const key = `cvc-circle-folded:${circleId}`;
  const [folded, setFolded] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setFolded(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setFolded([]);
    }
  }, [key]);
  const toggle = useCallback(
    (id: string) =>
      setFolded((current) => {
        const next = current.includes(id)
          ? current.filter((entry) => entry !== id)
          : [...current, id];
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Private browsing: it just isn't remembered.
        }
        return next;
      }),
    [key]
  );
  return [folded, toggle] as const;
}

/** A folded module: its title, to unfold it. */
function FoldedModule({
  title,
  icon,
  onOpen,
}: {
  title: string;
  icon?: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2 rounded-2xl px-5 py-3.5 text-left hover:bg-accent/50"
        aria-expanded={false}
      >
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        {icon}
        <span className="text-lg font-semibold text-foreground">{title}</span>
      </button>
    </Card>
  );
}

export function CircleModules({
  circleId,
  modules,
  sections,
}: {
  circleId: string;
  modules: CircleModule[];
  sections: ModuleViews;
}) {
  const [folded, toggle] = useCollapsed(circleId);
  const main = modules.filter((module) => !isAside(module) && sections[module.id]);
  const spans = rowSpans(main.map((module) => module.size));
  const render = ({ id, type }: CircleModule, span: number | null) => {
    const section = sections[id];
    if (!section) return null;
    const collapsed = folded.includes(id);
    return (
      <div
        key={id}
        id={id}
        className={cn("min-w-0 scroll-mt-24", span && SPAN[span])}
        data-module={type}
        data-module-id={id}
      >
        <ModuleContext.Provider
          value={{ collapsed, toggle: () => toggle(id), title: section.title }}
        >
          {collapsed ? (
            <FoldedModule title={section.title} icon={section.icon} onOpen={() => toggle(id)} />
          ) : (
            section.content
          )}
        </ModuleContext.Provider>
      </div>
    );
  };
  const aside = modules.filter((module) => isAside(module) && sections[module.id]);
  return (
    <Columns
      main={
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-6">
          {main.map((module, index) => render(module, spans[index]))}
        </div>
      }
      aside={
        aside.length ? (
          <div className="flex flex-col gap-6">{aside.map((module) => render(module, null))}</div>
        ) : null
      }
    />
  );
}

/**
 * Editing the page: each module as a small card — dragged into place (or
 * moved with its arrows, on phones), sized for wider screens, set up (an
 * Filtered Documents module's pages), or removed. Members stays in its column on
 * the right: it can be removed, but not moved or sized.
 */
export function ModuleEditor({
  modules: layout,
  sections,
  safetyCrew,
  community = false,
  onChange,
  onSettings,
}: {
  modules: CircleModule[];
  sections: ModuleViews;
  /** The Safety Crew's page: its Alert is built in, so nobody removes it. */
  safetyCrew: boolean;
  /** Community's page: its list of the circles within it is built in. */
  community?: boolean;
  onChange: (modules: CircleModule[]) => void;
  onSettings: (module: CircleModule) => void;
}) {
  const confirm = useConfirm();
  // An Alert an admin placed before the module stopped being offered: only an admin removes it (the server checks too).
  const admin = !!useSession().user?.isAdmin;
  const [dragging, setDragging] = useState<string | null>(null);
  const main = layout.filter((module) => !isAside(module));
  const aside = layout.filter(isAside);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= main.length || from === to) return;
    const next = [...main];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry);
    onChange([...next, ...aside]);
  };
  const remove = (id: string) => onChange(layout.filter((entry) => entry.id !== id));
  const resize = (id: string, size: ModuleSize) =>
    onChange(layout.map((entry) => (entry.id === id ? { ...entry, size } : entry)));
  const control =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-foreground transition hover:bg-accent disabled:opacity-40";
  const spans = rowSpans(main.map((module) => module.size));
  const card = (module: CircleModule, index: number, fixed: boolean) => {
    const { id, size } = module;
    const section = sections[id];
    if (!section) return null;
    return (
      <div
        key={id}
        data-module={module.type}
        data-module-id={id}
        data-editing=""
        className={cn("min-w-0", !fixed && SPAN[spans[index]])}
        draggable={!fixed}
        onDragStart={(event) => {
          setDragging(id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", id);
        }}
        onDragOver={(event) => {
          if (fixed || !dragging || dragging === id) return;
          event.preventDefault();
          move(
            main.findIndex((entry) => entry.id === dragging),
            index
          );
        }}
        onDrop={(event) => event.preventDefault()}
        onDragEnd={() => setDragging(null)}
      >
        <Card
          className={cn(
            "flex flex-col gap-3 border-dashed border-primary/60 p-4 transition",
            dragging === id && "opacity-50 ring-2 ring-primary"
          )}
        >
          <div className="flex items-center gap-2">
            {fixed ? null : (
              <GripVertical
                className="hidden h-5 w-5 shrink-0 cursor-grab text-muted lg:block"
                aria-hidden
              />
            )}
            {section.icon}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold text-foreground">{section.title}</span>
              {section.detail ? (
                <span className="truncate text-xs text-muted">{section.detail}</span>
              ) : null}
            </span>
            {fixed ? null : (
              <>
                <button
                  type="button"
                  className={control}
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${section.title} up`}
                  title="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={control}
                  onClick={() => move(index, index + 1)}
                  disabled={index === main.length - 1}
                  aria-label={`Move ${section.title} down`}
                  title="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {module.type === "information" ||
            module.type === "text" ||
            module.type === "tasks" ||
            module.type === "log" ||
            module.type === "finances" ||
            module.type === "taskbutton" ? (
              <button
                type="button"
                className={cn(control, "w-auto gap-1.5 px-2.5 text-sm")}
                onClick={() => onSettings(module)}
                aria-label={`Set up ${section.title}`}
              >
                <Settings2 className="h-4 w-4" /> Settings
              </button>
            ) : null}
            {module.type === "alert" && safetyCrew ? (
              <span className="text-xs text-muted">Built in: the Safety Crew&apos;s alert.</span>
            ) : module.type === "subgroups" && community ? (
              <span className="text-xs text-muted">
                Built in: every circle is within Community.
              </span>
            ) : module.type === "alert" && !admin ? (
              <span className="text-xs text-muted">Only an admin can remove it.</span>
            ) : (
              <button
                type="button"
                className={cn(
                  control,
                  "w-auto gap-1.5 px-2.5 text-sm text-muted hover:text-destructive"
                )}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Remove ${section.title} from this page?`,
                      body: REMOVE_NOTE[module.type]?.trim(),
                      confirmLabel: "Remove",
                    })
                  )
                    remove(id);
                }}
                aria-label={`Remove ${section.title}`}
              >
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            )}
          </div>
          {fixed ? (
            <p className="text-xs text-muted">Always in the right-hand column.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Size</span>
              <SegmentedControl
                size="xs"
                label={`${section.title} size`}
                value={size}
                onChange={(option) => resize(id, option)}
                options={MODULE_SIZES.map((option) => ({
                  value: option,
                  label: SIZE_LABELS[option],
                  title: SIZE_NAMES[option],
                }))}
              />
            </div>
          )}
        </Card>
      </div>
    );
  };
  return (
    <Columns
      main={
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-6">
          {main.map((module, index) => card(module, index, false))}
        </div>
      }
      aside={
        aside.length ? (
          <div className="flex flex-col gap-4">
            {aside.map((module, index) => card(module, index, true))}
          </div>
        ) : null
      }
    />
  );
}
