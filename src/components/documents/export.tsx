"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { formatBytes } from "@/lib/documents/types";
import { listNames } from "@/lib/text";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

/**
 * Exporting documents as a zip, from the Documents list: **Export** turns
 * each row's icon into a box to tick; tick some (or all of those listed)
 * and **Download zip** — or export all of them (all of a circle's, on its
 * page or with the circle filter). The server makes the zip
 * (`POST /api/documents/export`), then it downloads from the link it gives.
 * Written pages come as Markdown files.
 */

export type ExportItem = { kind: "page" | "file" | "proposal"; id: string };
const keyOf = (item: ExportItem) => `${item.kind}:${item.id}`;

type ExportCounts = { pages: number; files: number; links: number; proposals: number };
type ExportResult = { href: string; fileName: string; size: number; counts: ExportCounts };

/** Choosing documents to export: whether it's on, and what's chosen. */
export function useExportChoice() {
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<Map<string, ExportItem>>(new Map());
  return useMemo(
    () => ({
      choosing,
      chosen,
      start: () => setChoosing(true),
      stop: () => {
        setChoosing(false);
        setChosen(new Map());
      },
      has: (item: ExportItem) => chosen.has(keyOf(item)),
      toggle: (item: ExportItem) =>
        setChosen((current) => {
          const next = new Map(current);
          if (next.has(keyOf(item))) next.delete(keyOf(item));
          else next.set(keyOf(item), item);
          return next;
        }),
      /** Choose (or let go of) all of these. */
      setAll: (items: ExportItem[], on: boolean) =>
        setChosen((current) => {
          const next = new Map(current);
          for (const item of items) {
            if (on) next.set(keyOf(item), item);
            else next.delete(keyOf(item));
          }
          return next;
        }),
    }),
    [choosing, chosen]
  );
}

export type ExportChoice = ReturnType<typeof useExportChoice>;

const ChoiceContext = createContext<ExportChoice | null>(null);

export function ExportChoiceProvider({
  value,
  children,
}: {
  value: ExportChoice;
  children: ReactNode;
}) {
  return <ChoiceContext.Provider value={value}>{children}</ChoiceContext.Provider>;
}

/** A row's icon — or, while choosing documents to export, a box to tick in its place. */
export function RowChoice({
  item,
  title,
  icon,
}: {
  item: ExportItem;
  title: string;
  icon: ReactNode;
}) {
  const choice = useContext(ChoiceContext);
  if (!choice?.choosing) return <>{icon}</>;
  return (
    <input
      type="checkbox"
      checked={choice.has(item)}
      onChange={() => choice.toggle(item)}
      aria-label={`Export “${title}”`}
      className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary"
      data-export-choice={keyOf(item)}
    />
  );
}

/** "3 pages, 2 files and 1 proposal". */
function countsText(counts: ExportCounts) {
  const parts = [
    [counts.pages, "page"],
    [counts.files, "file"],
    [counts.links, "link"],
    [counts.proposals, "proposal"],
  ]
    .filter(([count]) => count)
    .map(([count, word]) => `${count} ${word}${count === 1 ? "" : "s"}`);
  return listNames(parts as string[]);
}

/**
 * The bar above the list while choosing: how many are chosen, a box for all
 * of those listed, **Download zip**, **Export all…** (`allLabel`; `circle`
 * keeps it to one circle's, `subs` with its sub groups'), and **Done**.
 */
export function ExportBar({
  choice,
  listed,
  allLabel,
  circle,
  subs = false,
}: {
  choice: ExportChoice;
  listed: ExportItem[];
  allLabel: string;
  circle?: string;
  subs?: boolean;
}) {
  const { toast } = useToast();
  const run = useMutation({
    mutationFn: (what: { items: ExportItem[] } | { all: true; circle?: string; subs?: boolean }) =>
      apiFetch<ExportResult>("/api/documents/export", {
        method: "POST",
        body: JSON.stringify(what),
      }),
    onSuccess: (result) => {
      toast({
        title: "Your zip is downloading",
        description: `${countsText(result.counts)} · ${formatBytes(result.size)}`,
      });
      window.location.assign(result.href);
    },
    onError: (err: Error) =>
      toast({ title: "Could not export", description: err.message, variant: "destructive" }),
  });
  const listedChosen = listed.filter((item) => choice.has(item)).length;
  const allListed = listed.length > 0 && listedChosen === listed.length;
  const count = choice.chosen.size;
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5"
      data-export-bar
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={allListed}
            ref={(box) => {
              if (box) box.indeterminate = listedChosen > 0 && !allListed;
            }}
            onChange={() => choice.setAll(listed, !allListed)}
            disabled={!listed.length}
            className="h-4 w-4 cursor-pointer accent-primary"
            aria-label="All those listed"
          />
          <span data-export-count>
            {count ? `${count} chosen` : "Tick the documents to export"}
          </span>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!count || run.isPending}
            onClick={() => run.mutate({ items: Array.from(choice.chosen.values()) })}
          >
            {run.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            {run.isPending ? "Making the zip…" : "Download zip"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={run.isPending}
            onClick={() =>
              run.mutate({ all: true, ...(circle ? { circle, ...(subs ? { subs } : {}) } : {}) })
            }
          >
            {allLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={choice.stop} disabled={run.isPending}>
            Done
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">
        Written pages and proposals come as Markdown (.md) files, files as uploaded (their latest
        version), and links as a note of where they go; a README lists them all, by circle.
      </p>
    </div>
  );
}
