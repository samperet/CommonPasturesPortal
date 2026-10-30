"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronDown, ChevronRight, Trash2, Upload } from "lucide-react";
import { MyDocumentsLinks } from "@/components/documents/my-documents";
import { useSession } from "@/lib/auth/client";
import { useCircles } from "@/components/directory/use-directory";
import { CircleIcon } from "@/components/circles/circle-icon";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { useUploadCircles } from "@/components/documents/use-upload-circles";
import { cn } from "@/lib/utils";
import { subgroupsOf, topLevel } from "@/lib/circles/tiers";
import { isCommunity } from "@/lib/circles/ids";
import type { Circle } from "@/lib/circles/types";

/**
 * Where an item's own menu (a sub tier) opens: beside the menu, outside its
 * scrolling list (which would clip it), but inside the menu, so pointing at it
 * keeps the menu open.
 */
const FlyoutHost = createContext<HTMLDivElement | null>(null);

/**
 * A header item with a menu: its label still goes to its page; pointing at it
 * (after a moment) or pressing its arrow opens the menu, which ↑/↓ move
 * through and Escape, a click elsewhere, or a choice closes. ↑/↓ keep to the
 * list that has focus: the menu, or a sub tier opened beside it.
 */
export function NavMenu({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  /** The menu's items (rendered only while it's open). */
  children: (close: () => void) => ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const later = (next: boolean, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), ms);
  };
  const close = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => close(), [pathname]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        box.current?.querySelector<HTMLElement>("[data-nav-chevron]")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const items = () => {
    const tier = (document.activeElement as HTMLElement | null)?.closest("[data-submenu]") ?? null;
    return Array.from(box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []).filter(
      (item) => item.closest("[data-submenu]") === tier
    );
  };
  const move = (step: number) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    list[(at + step + list.length) % list.length]?.focus();
  };

  return (
    <div
      ref={box}
      className="relative"
      data-nav-menu
      onMouseEnter={() => later(true, 150)}
      onMouseLeave={() => later(false, 250)}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      <div
        className={cn(
          "flex items-center rounded-full text-sm font-medium transition",
          active
            ? "bg-primary text-primary-foreground shadow-soft"
            : "text-foreground/70 hover:bg-accent hover:text-foreground"
        )}
      >
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className="whitespace-nowrap py-2 pl-2.5 pr-0.5"
        >
          {label}
        </Link>
        <button
          type="button"
          data-nav-chevron
          aria-label={`${label} menu`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              requestAnimationFrame(() => items()[0]?.focus());
            }
          }}
          className="rounded-full py-2 pl-0.5 pr-2"
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 opacity-70 transition", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>
      {open ? (
        // The padding bridges the gap, so moving the pointer down doesn't close it.
        <div className="absolute left-0 top-full z-50 pt-1.5">
          <div
            role="menu"
            aria-label={label}
            className="max-h-[60vh] w-64 overflow-y-auto rounded-xl border border-border bg-white p-1 shadow-elev"
          >
            <FlyoutHost.Provider value={host}>{children(close)}</FlyoutHost.Provider>
          </div>
          <div ref={setHost} className="absolute left-full top-1.5" />
        </div>
      ) : null}
    </div>
  );
}

const itemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:bg-accent";
const groupLabel = "px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted";

/** The Documents menu: all of them, your starred and recent ones, start one (if you can), or the trash. */
export function DocumentsMenuItems({ close }: { close: () => void }) {
  const canWrite = (useWikiPages().data?.keepers.length ?? 0) > 0;
  const canUpload = useUploadCircles().uploadCircles.length > 0;
  return (
    <>
      <Link href="/documents" role="menuitem" className={itemClass} onClick={close}>
        All documents
      </Link>
      <MyDocumentsLinks menu linkClass={itemClass} labelClass={groupLabel} onChoose={close} />
      {canWrite || canUpload ? <div className="my-1 h-px bg-border" role="separator" /> : null}
      {canWrite ? (
        <Link href="/documents?new=" role="menuitem" className={itemClass} onClick={close}>
          <BookOpen className="h-4 w-4 text-primary" aria-hidden /> New document
        </Link>
      ) : null}
      {canUpload ? (
        <Link href="/documents?upload=1" role="menuitem" className={itemClass} onClick={close}>
          <Upload className="h-4 w-4 text-primary" aria-hidden /> Upload a file
        </Link>
      ) : null}
      <div className="my-1 h-px bg-border" role="separator" />
      <Link href="/documents/trash" role="menuitem" className={itemClass} onClick={close}>
        <Trash2 className="h-4 w-4 text-muted" aria-hidden /> Trash
      </Link>
    </>
  );
}

/**
 * The circles (sub groups within theirs), split into yours — those you're in,
 * or in one of whose sub groups — and the rest, each by name with its icon;
 * and Community, everyone, listed first as the circle every other is within.
 */
export function useCircleGroups() {
  const circles = useCircles();
  const { user } = useSession();
  const all = circles ?? [];
  const byName = (a: Circle, b: Circle) => a.name.localeCompare(b.name);
  const subsOf = (circleId: string) => subgroupsOf(all, circleId).sort(byName);
  const inIt = (circle: Circle) =>
    circle.seats.some((seat) => !!user?.personId && seat.personId === user.personId);
  const community = all.find((circle) => isCommunity(circle.id)) ?? null;
  const sorted = topLevel(all)
    .filter((circle) => !isCommunity(circle.id))
    .sort(byName);
  const mine = sorted.filter((circle) => inIt(circle) || subsOf(circle.id).some(inIt));
  const others = sorted.filter((circle) => !mine.includes(circle));
  return { community, mine, others, subsOf };
}

/**
 * The Circles menu: all of them, then yours and the others, with their
 * icons. A circle with sub groups shows them in a sub tier beside the menu —
 * pointing at it (after a moment), its arrow, or → — which ← or Escape
 * leaves.
 */
export function CirclesMenuItems({ close }: { close: () => void }) {
  const { community, mine, others, subsOf } = useCircleGroups();
  const host = useContext(FlyoutHost);
  const [flyout, setFlyout] = useState<{ id: string; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  // It's placed beside its row: when the list scrolls, it closes.
  useEffect(() => {
    const list = host?.previousElementSibling;
    if (!list) return;
    const onScroll = () => setFlyout(null);
    list.addEventListener("scroll", onScroll);
    return () => list.removeEventListener("scroll", onScroll);
  }, [host]);
  const show = (circleId: string, row: HTMLElement, focus = false) => {
    if (!host) return;
    setFlyout({
      id: circleId,
      top: row.getBoundingClientRect().top - host.getBoundingClientRect().top,
    });
    if (focus)
      requestAnimationFrame(
        () => host.querySelector<HTMLElement>("[data-submenu] [role=menuitem]")?.focus()
      );
  };
  const pointAt = (circleId: string | null, row: HTMLElement) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => (circleId ? show(circleId, row) : setFlyout(null)), 120);
  };
  const row = (circle: Circle) => {
    const subs = subsOf(circle.id);
    return (
      <div
        key={circle.id}
        className="relative flex items-center"
        onMouseEnter={(event) => pointAt(subs.length ? circle.id : null, event.currentTarget)}
      >
        <Link
          href={`/circles/${circle.id}`}
          role="menuitem"
          className={cn(itemClass, "min-w-0 flex-1", subs.length && "pr-9")}
          onClick={close}
          data-circle-row={circle.id}
          aria-haspopup={subs.length ? "menu" : undefined}
          aria-expanded={subs.length ? flyout?.id === circle.id : undefined}
          onKeyDown={(event) => {
            if (subs.length && event.key === "ArrowRight") {
              event.preventDefault();
              show(circle.id, event.currentTarget.parentElement!, true);
            }
          }}
        >
          <CircleIcon circle={circle} size={22} className="shrink-0 rounded-full" />
          <span className="truncate">{circle.name}</span>
        </Link>
        {subs.length ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`${circle.name}: its sub groups`}
            className="absolute right-1 rounded-md p-1 text-muted hover:bg-accent hover:text-foreground"
            onClick={(event) =>
              flyout?.id === circle.id
                ? setFlyout(null)
                : show(circle.id, event.currentTarget.parentElement!)
            }
            data-subgroups-chevron={circle.id}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  };
  const opened = flyout ? [...mine, ...others].find((circle) => circle.id === flyout.id) : null;
  return (
    <>
      <Link
        href="/circles"
        role="menuitem"
        className={itemClass}
        onClick={close}
        onMouseEnter={(event) => pointAt(null, event.currentTarget)}
      >
        All circles
      </Link>
      {community ? row(community) : null}
      {mine.length ? (
        <>
          <p className={groupLabel}>Your circles</p>
          {mine.map(row)}
        </>
      ) : null}
      {others.length ? (
        <>
          <p className={groupLabel}>{mine.length ? "Other circles" : "Circles"}</p>
          {others.map(row)}
        </>
      ) : null}
      {opened && flyout && host
        ? createPortal(
            <div
              role="menu"
              aria-label={`${opened.name}: sub groups`}
              data-submenu={opened.id}
              style={{ top: flyout.top }}
              className="absolute left-1 w-60 rounded-xl border border-border bg-white p-1 shadow-elev"
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "Escape") {
                  // Back to its row, the menu still open.
                  event.preventDefault();
                  event.stopPropagation();
                  setFlyout(null);
                  host
                    .closest("[data-nav-menu]")
                    ?.querySelector<HTMLElement>(`[data-circle-row="${opened.id}"]`)
                    ?.focus();
                }
              }}
            >
              <p className={groupLabel}>{opened.name}</p>
              {subsOf(opened.id).map((sub) => (
                <Link
                  key={sub.id}
                  href={`/circles/${sub.id}`}
                  role="menuitem"
                  className={itemClass}
                  onClick={close}
                >
                  <CircleIcon circle={sub} size={22} className="shrink-0 rounded-full" />
                  <span className="truncate">{sub.name}</span>
                </Link>
              ))}
            </div>,
            host
          )
        : null}
    </>
  );
}

const subLink =
  "flex items-center gap-2 rounded-lg py-1.5 pl-11 pr-3 text-sm text-foreground/80 hover:bg-accent hover:text-foreground";
/** The buttons that fold a section's links or a circle's sub groups out: wide, bordered, easy to hit. */
const foldButton =
  "flex shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-white text-primary shadow-soft transition hover:bg-accent active:bg-primary/20";
const foldChevron = "h-5 w-5 stroke-[2.5] transition";
const mobileGroupLabel =
  "pb-0.5 pl-11 pt-2 text-xs font-semibold uppercase tracking-wide text-muted";

/**
 * In the phone menu: a section's row (Circles, Documents) with its links
 * folded away behind a chevron until it's pressed, so the menu opens short.
 * The row itself still goes to the section.
 */
export function MobileFold({
  id,
  label,
  row,
  children,
}: {
  id: string;
  label: string;
  row: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-stretch gap-1">
        <div className="min-w-0 flex-1">{row}</div>
        <button
          type="button"
          className={cn(foldButton, "w-16")}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} ${label} links`}
          data-menu-fold={id}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown className={cn(foldChevron, open && "rotate-180")} aria-hidden />
        </button>
      </div>
      {open ? children : null}
    </div>
  );
}

/** In the phone menu, under Documents: your starred and recent ones, start one (if you can), or the trash. */
export function MobileDocumentsLinks({ onChoose }: { onChoose: () => void }) {
  const canWrite = (useWikiPages().data?.keepers.length ?? 0) > 0;
  const canUpload = useUploadCircles().uploadCircles.length > 0;
  return (
    <>
      <MyDocumentsLinks linkClass={subLink} labelClass={mobileGroupLabel} onChoose={onChoose} />
      {canWrite ? (
        <Link href="/documents?new=" className={subLink} onClick={onChoose}>
          <BookOpen className="h-4 w-4 text-primary" aria-hidden /> New document
        </Link>
      ) : null}
      {canUpload ? (
        <Link href="/documents?upload=1" className={subLink} onClick={onChoose}>
          <Upload className="h-4 w-4 text-primary" aria-hidden /> Upload a file
        </Link>
      ) : null}
      <Link href="/documents/trash" className={subLink} onClick={onChoose}>
        <Trash2 className="h-4 w-4 text-muted" aria-hidden /> Trash
      </Link>
    </>
  );
}

/** In the phone menu, under Circles: yours, with their icons (sub groups under theirs) — and the rest on request. */
export function MobileCircleLinks({ onChoose }: { onChoose: () => void }) {
  const { community, mine, others, subsOf } = useCircleGroups();
  const [all, setAll] = useState(false);
  // A circle's sub groups stay folded until its button is pressed, so the list stays short.
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set());
  const row = (circle: Circle) => {
    const subs = subsOf(circle.id);
    const open = unfolded.has(circle.id);
    return (
      <div key={circle.id} className="flex flex-col">
        <div className="flex items-stretch">
          <Link
            href={`/circles/${circle.id}`}
            className={cn(subLink, "min-w-0 flex-1")}
            onClick={onChoose}
          >
            <CircleIcon circle={circle} size={20} className="shrink-0 rounded-full" />
            <span className="truncate">{circle.name}</span>
          </Link>
          {subs.length ? (
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} ${circle.name}'s ${
                subs.length === 1 ? "sub group" : `${subs.length} sub groups`
              }`}
              data-subgroups-toggle={circle.id}
              onClick={() =>
                setUnfolded((current) => {
                  const next = new Set(current);
                  if (next.has(circle.id)) next.delete(circle.id);
                  else next.add(circle.id);
                  return next;
                })
              }
              className={cn(foldButton, "gap-1 px-3 text-sm font-semibold")}
            >
              {subs.length}
              <ChevronDown className={cn(foldChevron, open && "rotate-180")} aria-hidden />
            </button>
          ) : null}
        </div>
        {open
          ? subs.map((sub) => (
              <Link
                key={sub.id}
                href={`/circles/${sub.id}`}
                className={cn(subLink, "pl-16")}
                onClick={onChoose}
              >
                <CircleIcon circle={sub} size={18} className="shrink-0 rounded-full" />
                <span className="truncate">{sub.name}</span>
              </Link>
            ))
          : null}
      </div>
    );
  };
  return (
    <>
      {community ? row(community) : null}
      {mine.map(row)}
      {all ? others.map(row) : null}
      {others.length ? (
        <button
          type="button"
          onClick={() => setAll((value) => !value)}
          aria-expanded={all}
          className={cn(subLink, "font-medium text-secondary-foreground")}
        >
          <ChevronDown className={cn("h-4 w-4 transition", all && "rotate-180")} aria-hidden />
          {all ? "Show fewer circles" : mine.length ? "Show all circles" : "Show the circles"}
        </button>
      ) : null}
    </>
  );
}
