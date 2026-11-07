"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ListTree, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth/client";
import { DocumentsSidebar } from "@/components/documents/sidebar";
import {
  DocsShellContext,
  type PageParent,
  type SidebarMotion,
} from "@/components/documents/docs-context";
import { WritePageDialog } from "@/components/documents/new-menu";
import { useWikiPages } from "@/components/wiki/wiki-client";

/**
 * The shell around Documents and every page (`/documents*`, `/wiki/*`): the
 * sidebar (`sidebar.tsx`) — all documents, starred and recent, drafts, and
 * every circle, each choosing what the Documents list shows — beside the
 * content, as in Outline. On a wide screen it stays in view and can be
 * hidden (`[`) and shown again (`]`); on a phone it slides in from a
 * **Browse** button. `n` starts a page. Spreadsheets
 * (`…/sheet`) take the whole width. Pages inside start a page through the
 * shell (`useDocsShell`), inside another page or not.
 *
 * A page's own column (On this page, Comments) folds with the sidebar: one
 * state for both (`sidebars` in the context), and on a page that `claim`s
 * them one button — the page's — instead of the sidebar's own (the folded
 * sidebar then takes no room at all). They move together: folding, a small
 * step back first, then out; coming back, in past where they belong and
 * bouncing into place (the columns' widths change, timed in `globals.css`
 * under `data-sidebars-moving`; none for those who'd rather less motion).
 */

const OPEN_KEY = "cvc-docs-sidebar";
/** How long each way takes — the same as `globals.css`. */
const MOTION_MS = { out: 420, in: 760 } as const;

const isTyping = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return (
    !!element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName))
  );
};

export function DocsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  // Spreadsheets want the whole width: no sidebar there.
  const plain = /\/sheet$/.test(pathname);
  const [open, setOpen] = useState(true);
  const [moving, setMoving] = useState<SidebarMotion>(null);
  const settle = useRef<ReturnType<typeof setTimeout>>();
  // Pages showing the one button for both sidebars (the shell's own then goes).
  const [claims, setClaims] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [writing, setWriting] = useState<{ parent?: PageParent } | null>(null);
  const canWrite = (useWikiPages().data?.keepers.length ?? 0) > 0;

  // Hidden last time: hidden again (remembered in this browser).
  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === "closed") setOpen(false);
    } catch {
      // Private browsing: the sidebar just starts open.
    }
  }, []);
  const toggle = useCallback(
    (next?: boolean) => {
      const value = next ?? !open;
      if (value === open) return;
      setOpen(value);
      try {
        localStorage.setItem(OPEN_KEY, value ? "open" : "closed");
      } catch {
        // Not remembered, then.
      }
      clearTimeout(settle.current);
      const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (still) return setMoving(null);
      const way = value ? "in" : "out";
      setMoving(way);
      settle.current = setTimeout(() => setMoving(null), MOTION_MS[way]);
    },
    [open]
  );
  useEffect(() => () => clearTimeout(settle.current), []);
  const claim = useCallback(() => {
    setClaims((count) => count + 1);
    return () => setClaims((count) => count - 1);
  }, []);
  useEffect(() => setDrawer(false), [pathname]);

  // Keyboard: [ hides the sidebar, ] shows it; n starts a page; Escape closes the phone drawer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (drawer) setDrawer(false);
        return;
      }
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector("[role=dialog]")) return;
      if (event.key === "[") {
        event.preventDefault();
        toggle(false);
      } else if (event.key === "]") {
        event.preventDefault();
        toggle(true);
      } else if (event.key === "n" && canWrite && !writing) {
        event.preventDefault();
        setWriting({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, canWrite, writing, drawer]);

  const shell = useMemo(
    () => ({
      newPage: (parent?: PageParent) => setWriting({ parent }),
      canWrite,
      sidebars: { open, moving, toggle, claim },
    }),
    [canWrite, open, moving, toggle, claim]
  );
  // On a page with the one button, a folded sidebar takes no room; elsewhere it leaves its button.
  const claimed = claims > 0;
  const shown = open || moving === "out";

  if (!user || plain) return <>{children}</>;

  const iconButton =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-accent hover:text-foreground";
  return (
    <DocsShellContext.Provider value={shell}>
      <div
        className={cn(
          "flex flex-col gap-3 lg:grid lg:items-start lg:gap-6",
          open
            ? "lg:grid-cols-[16rem_minmax(0,1fr)]"
            : claimed
              ? "lg:grid-cols-[0rem_minmax(0,1fr)] lg:gap-x-0"
              : "lg:grid-cols-[2.5rem_minmax(0,1fr)]"
        )}
        data-docs-shell={open ? "open" : "closed"}
        data-sidebars-moving={moving ?? undefined}
      >
        {/* Phones: the button that slides the sidebar in. */}
        <div className="flex items-center lg:hidden print:hidden">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-expanded={drawer}
            aria-controls="docs-drawer"
            data-docs-drawer-open
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm font-medium text-foreground/80 transition hover:bg-accent hover:text-foreground"
          >
            <ListTree className="h-4 w-4" aria-hidden /> Browse
          </button>
        </div>

        {/* While it slides, the sidebar keeps its width and moves with its right edge. */}
        <aside
          className={cn(
            "hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:overflow-x-hidden print:!hidden",
            !shown && claimed && "lg:invisible"
          )}
          data-docs-sidebar={open ? "open" : "closed"}
        >
          {shown ? (
            <div className="ml-auto flex w-64 flex-col gap-1 pr-1">
              {claimed ? null : (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => toggle(false)}
                    className={iconButton}
                    aria-label="Hide the sidebar"
                    title="Hide the sidebar ( [ )"
                    data-docs-hide
                  >
                    <PanelLeftClose className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              )}
              <DocumentsSidebar />
            </div>
          ) : claimed ? null : (
            <button
              type="button"
              onClick={() => toggle(true)}
              className={iconButton}
              aria-label="Show the sidebar"
              title="Show the sidebar ( ] )"
              data-docs-show
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
          )}
        </aside>

        <div className="min-w-0">{children}</div>
      </div>

      {drawer ? (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Browse documents"
          id="docs-drawer"
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div
            className="relative flex h-full w-[85vw] max-w-xs flex-col overflow-y-auto bg-background p-3 shadow-elev"
            data-docs-drawer
          >
            <div className="flex items-center justify-between pb-2">
              <span className="px-1 text-sm font-semibold text-foreground">Documents</span>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className={iconButton}
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <DocumentsSidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      ) : null}

      {writing ? (
        <WritePageDialog parent={writing.parent} onClose={() => setWriting(null)} />
      ) : null}
    </DocsShellContext.Provider>
  );
}
