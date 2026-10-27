"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Handshake,
  Link2,
  NotebookPen,
  Plus,
  Sheet as SheetIcon,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { NewPageForm } from "@/components/wiki/wiki-client";

/**
 * The Documents list's one "New" button: **Write a page** (a title, then the
 * editor), **Meeting notes** (a page for a meeting: its day, then the
 * editor), **A proposal** (put to a circle for consent), **Upload a file**,
 * **Spreadsheet** (a blank one, filled in here), or **Add a link** (a
 * Google Doc, say). Each may be missing for someone who
 * can't do it; with none, there's no button.
 */
export function NewMenu({
  canWrite,
  canUpload,
  onUpload,
  onWrite,
  onMeeting,
  onPropose,
  onLink,
  onSpreadsheet,
}: {
  /** Start pages, meeting notes, and proposals. */
  canWrite: boolean;
  /** Upload files and add links. */
  canUpload: boolean;
  onUpload: () => void;
  onWrite: () => void;
  onMeeting: () => void;
  onPropose: () => void;
  onLink: () => void;
  onSpreadsheet: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Kept on screen: nudged right when its left edge would leave the window (a phone), left when its right edge would.
  useLayoutEffect(() => {
    const element = menu.current;
    if (!open || !element) return;
    element.style.transform = "";
    const rect = element.getBoundingClientRect();
    const shift = Math.max(0, 8 - rect.left) - Math.max(0, rect.right - (window.innerWidth - 8));
    if (shift) element.style.transform = `translateX(${shift}px)`;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !box.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!canWrite && !canUpload) return null;
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div ref={box} className="relative">
      <Button
        className="gap-1.5"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus className="h-4 w-4" /> New <ChevronDown className="h-3.5 w-3.5 opacity-80" />
      </Button>
      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label="New"
          className="absolute right-0 z-30 mt-1.5 w-64 rounded-lg border border-border bg-white p-1 shadow-elev"
        >
          {canWrite ? (
            <button
              type="button"
              role="menuitem"
              onClick={choose(onWrite)}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-foreground">Write a page</span>
                <span className="block text-xs text-muted">
                  Written here, kept up to date together
                </span>
              </span>
            </button>
          ) : null}
          {canWrite ? (
            <button
              type="button"
              role="menuitem"
              onClick={choose(onMeeting)}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-foreground">Meeting notes</span>
                <span className="block text-xs text-muted">
                  Who&apos;s there, what&apos;s decided — proposals consented on the spot
                </span>
              </span>
            </button>
          ) : null}
          {canWrite ? (
            <button
              type="button"
              role="menuitem"
              onClick={choose(onPropose)}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-foreground">A proposal</span>
                <span className="block text-xs text-muted">
                  Put to a circle for consent at a meeting
                </span>
              </span>
            </button>
          ) : null}
          {canUpload ? (
            <button
              type="button"
              role="menuitem"
              onClick={choose(onUpload)}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <Upload className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-foreground">Upload a file</span>
                <span className="block text-xs text-muted">
                  A PDF, Word file, spreadsheet, scan, or photo
                </span>
              </span>
            </button>
          ) : null}
          {canUpload ? (
            <button
              type="button"
              role="menuitem"
              onClick={choose(onSpreadsheet)}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <SheetIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-foreground">Spreadsheet</span>
                <span className="block text-xs text-muted">A blank one, to fill in here</span>
              </span>
            </button>
          ) : null}
          {canUpload ? (
            <button
              type="button"
              role="menuitem"
              onClick={choose(onLink)}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
            >
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-foreground">Add a link</span>
                <span className="block text-xs text-muted">
                  A Google Doc, Sheet or Slides, or any web page
                </span>
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** "Write a page": its title and (unless a circle's page decides) the circle that keeps it, then the editor. */
export function WritePageDialog({
  initialTitle,
  from,
  parent,
  circleId,
  preferredCircle,
  meeting = false,
  onClose,
}: {
  initialTitle?: string;
  from?: string;
  /** The page it goes inside (its circle keeps it). */
  parent?: { id: string; title: string; keeper: string };
  /** From a circle's page: that circle keeps it. */
  circleId?: string;
  /** The circle chosen at first (the list's circle filter), which can be changed. */
  preferredCircle?: string;
  /** Notes for a meeting. */
  meeting?: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={meeting ? "Meeting notes" : "Write a page"}
      icon={
        meeting ? (
          <NotebookPen className="h-5 w-5 text-primary" />
        ) : (
          <BookOpen className="h-5 w-5 text-primary" />
        )
      }
      onClose={onClose}
    >
      <p className="text-sm text-muted">
        {meeting
          ? "Notes for one of a circle's meetings: say who's there with the people button in the editor; proposals to the circle can be consented right in the notes."
          : "Give it a title; you'll write it next. Everyone it's open to can improve it, and it can be proposed to its circle for consent."}
      </p>
      <NewPageForm
        initialTitle={initialTitle}
        from={from}
        parent={parent}
        keeper={circleId ?? (preferredCircle || undefined)}
        lockKeeper={!!circleId}
        meeting={meeting}
        onCancel={onClose}
      />
    </Dialog>
  );
}
