"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileText, PencilLine, Plus, Star, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { useCircles } from "@/components/directory/use-directory";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { useDocsShell } from "@/components/documents/docs-context";
import { CircleIcon } from "@/components/circles/circle-icon";
import { circlePath, parentOf, subgroupsOf, topLevel } from "@/lib/circles/tiers";
import type { Circle } from "@/lib/circles/types";
import { isCommunity } from "@/lib/circles/ids";
import { cn } from "@/lib/utils";

/**
 * The documents sidebar: where to look, not the documents themselves — they
 * are in the main list, which the sidebar filters. All documents (and New),
 * your starred and recent ones (`/documents/mine`), your drafts
 * (`/documents?kind=drafts`), then the circles with documents as one tree:
 * Community at the root, every circle within it (yours first, then the
 * rest, by name), each with its sub groups nested inside it. Any of them
 * folds away what's inside it — Community, every circle — remembered in
 * this browser, and unfolded while what's shown is inside. Choosing a
 * circle lists its documents and its sub groups' (`/documents?circle=`,
 * keeping the kind chosen); Community lists its own, since "every circle"
 * is All documents. On a page, its circle is the one marked. A circle's
 * count is what choosing it lists: its pages (from the pages list) and its
 * files and proposals (`/api/documents/counts`), with its sub groups'. It reads
 * the address without a Suspense boundary of its own (every route here is
 * rendered on request), so it hydrates with the shell, before the lists it
 * reads have arrived — a later pass would find them and not match the HTML.
 */

const FOLDED_KEY = "cvc-docs-folded";

const labelClass = "px-1 pb-0.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted";
/** The circles sit on white, set apart from the sidebar's own links. */
const panelClass = "flex flex-col rounded-lg border border-border bg-white p-1 shadow-soft";
const entryClass =
  "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-foreground/80 hover:bg-accent hover:text-foreground";
const activeClass = "bg-primary/15 font-semibold text-foreground";
const smallButton =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition hover:bg-primary/20 hover:text-foreground";

/** The files and proposals each circle has (the pages are counted here, from the pages list). */
const documentCountsQuery = () => ({
  queryKey: ["documents", "counts"],
  queryFn: () => apiFetch<{ counts: Record<string, number> }>("/api/documents/counts"),
});

const readFolded = (): Record<string, boolean> => {
  try {
    const stored = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
};

export function DocumentsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useSession();
  const circles = useCircles();
  const { data } = useWikiPages();
  const { data: counted } = useQuery(documentCountsQuery());
  const shell = useDocsShell();
  const choose = onNavigate ?? (() => undefined);
  const pages = useMemo(() => data?.pages ?? [], [data]);
  const drafts = pages.filter((page) => page.draft).length;

  // What the main list shows: on Documents, the address's circle and kind; on a page, its circle.
  const onDocuments = pathname === "/documents";
  const kind = onDocuments ? params.get("kind") ?? "" : "";
  const slug = pathname.startsWith("/wiki/")
    ? decodeURIComponent(pathname.slice("/wiki/".length).split("/")[0])
    : null;
  const reading = slug ? pages.find((page) => page.slug === slug) : undefined;
  const active = onDocuments ? params.get("circle") ?? "" : reading?.keeper ?? "";
  const circleHref = (circleId: string) => {
    const next = new URLSearchParams({ circle: circleId });
    if (kind) next.set("kind", kind);
    return `/documents?${next}`;
  };

  // How many documents each circle has: its pages, files and proposals.
  const own = useMemo(() => {
    const counts: Record<string, number> = { ...(counted?.counts ?? {}) };
    for (const page of pages) counts[page.keeper] = (counts[page.keeper] ?? 0) + 1;
    return counts;
  }, [pages, counted]);
  const all = useMemo(() => circles ?? [], [circles]);
  const total = (circle: Circle) =>
    (own[circle.id] ?? 0) +
    subgroupsOf(all, circle.id).reduce((sum, sub) => sum + (own[sub.id] ?? 0), 0);
  // A circle's count: what choosing it lists (Community: its own).
  const countOf = (circle: Circle) =>
    isCommunity(circle.id) ? own[circle.id] ?? 0 : total(circle);
  // Listed: the circles with documents, and the one shown even when it has none — and the circles
  // they're within.
  const shown = all.find((circle) => circle.id === active);
  const showing = new Set(shown ? circlePath(all, shown).map((circle) => circle.id) : []);
  const listed = (circle: Circle) => total(circle) > 0 || showing.has(circle.id);
  const inIt = (circle: Circle) =>
    !!user?.personId && circle.seats.some((seat) => seat.personId === user.personId);
  // The circles directly within one: within Community, every circle that isn't a sub group (yours
  // first); within a circle, its sub groups.
  const within = (circle: Circle) =>
    isCommunity(circle.id)
      ? topLevel(all)
          .filter((entry) => !isCommunity(entry.id) && listed(entry))
          .sort((a, b) => Number(inIt(b)) - Number(inIt(a)) || a.name.localeCompare(b.name))
      : subgroupsOf(all, circle.id)
          .filter(listed)
          .sort((a, b) => a.name.localeCompare(b.name));
  // The tree's root: Community, holding every circle — or, without one, the circles themselves.
  const community = all.find((circle) => isCommunity(circle.id));
  const roots = community
    ? within(community).length || listed(community)
      ? [community]
      : []
    : topLevel(all)
        .filter(listed)
        .sort((a, b) => Number(inIt(b)) - Number(inIt(a)) || a.name.localeCompare(b.name));

  // What's inside a circle shows unless you've folded it away — and always while what's shown is inside.
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  useEffect(() => setFolded(readFolded()), []);
  const isOpen = (circleId: string) =>
    (showing.has(circleId) && circleId !== active) || !folded[circleId];
  const toggle = (circleId: string) =>
    setFolded((state) => {
      const next = { ...state, [circleId]: !state[circleId] };
      try {
        localStorage.setItem(FOLDED_KEY, JSON.stringify(next));
      } catch {
        // Not remembered, then.
      }
      return next;
    });

  /** A circle's link (its documents, in the main list) and, nested inside it, the circles within it. */
  const entry = (circle: Circle, depth: number): ReactNode => {
    const inside = within(circle);
    const open = isOpen(circle.id);
    const here = circle.id === active;
    const count = countOf(circle);
    // Rows that could hold others line up with those that do (their fold button's width).
    const holder = isCommunity(circle.id) || !parentOf(all, circle);
    return (
      <li key={circle.id} data-docs-circle={circle.id} data-depth={depth}>
        <div className="flex items-center gap-0.5">
          {inside.length ? (
            <button
              type="button"
              onClick={() => toggle(circle.id)}
              aria-expanded={open}
              aria-label={`${open ? "Fold" : "Unfold"} ${
                isCommunity(circle.id) ? "the circles within" : `${circle.name}'s sub groups`
              }`}
              className={smallButton}
              data-docs-fold={circle.id}
            >
              <ChevronRight className={cn("h-3.5 w-3.5 transition", open && "rotate-90")} />
            </button>
          ) : (
            <span className={cn("shrink-0", holder ? "w-6" : "w-2")} aria-hidden />
          )}
          <Link
            href={circleHref(circle.id)}
            onClick={choose}
            aria-current={here ? "page" : undefined}
            title={`${circle.name}'s documents`}
            className={cn(entryClass, "min-w-0 flex-1", here && activeClass)}
            data-docs-circle-link={circle.id}
          >
            <CircleIcon circle={circle} size={depth ? 16 : 18} className="shrink-0 rounded-full" />
            <span className="truncate">{circle.name}</span>
            <span className="ml-auto pl-2 text-xs font-normal text-muted">{count || ""}</span>
          </Link>
        </div>
        {inside.length && open ? (
          <ul className="ml-3 border-l-2 border-border pl-1" data-docs-within={circle.id}>
            {inside.map((sub) => entry(sub, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  };

  const link = (href: string, here: boolean, icon: ReactNode, label: string, extra?: object) => (
    <Link
      href={href}
      onClick={choose}
      aria-current={here ? "page" : undefined}
      className={cn(entryClass, "min-w-0 flex-1 font-medium", here && activeClass)}
      {...extra}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <nav aria-label="Documents" className="flex flex-col gap-1 text-sm" data-docs-tree>
      <div className="flex items-center gap-1">
        {link(
          "/documents",
          onDocuments && !active && !kind,
          <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />,
          "All documents",
          { "data-docs-all": true }
        )}
        {shell?.canWrite ? (
          <button
            type="button"
            onClick={() => shell.newPage()}
            className={cn(smallButton, "h-7 w-7")}
            title="New page ( n )"
            aria-label="New page"
            data-docs-new
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
      {link(
        "/documents/mine",
        pathname === "/documents/mine",
        <Star className="h-4 w-4 shrink-0 text-primary" aria-hidden />,
        "Starred and recent",
        { "data-docs-mine": true }
      )}
      {drafts || kind === "drafts" ? (
        <div className="flex items-center" data-docs-drafts>
          {link(
            "/documents?kind=drafts",
            kind === "drafts",
            <PencilLine className="h-4 w-4 shrink-0 text-muted" aria-hidden />,
            "Drafts"
          )}
          <span className="px-1.5 text-xs text-muted">{drafts || ""}</span>
        </div>
      ) : null}

      <section data-docs-circles>
        <p className={labelClass}>Circles</p>
        {roots.length ? (
          <ul className={panelClass}>{roots.map((circle) => entry(circle, 0))}</ul>
        ) : (
          <p className="px-1.5 py-1 text-xs text-muted">No documents yet.</p>
        )}
      </section>

      <Link
        href="/documents/trash"
        onClick={choose}
        aria-current={pathname === "/documents/trash" ? "page" : undefined}
        className={cn(
          entryClass,
          "mt-1 text-muted",
          pathname === "/documents/trash" && activeClass
        )}
      >
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden /> Trash
      </Link>
    </nav>
  );
}
