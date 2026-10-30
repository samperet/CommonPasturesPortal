"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Move,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { useCircles } from "@/components/directory/use-directory";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { MyDocumentsLinks } from "@/components/documents/my-documents";
import { useDocsShell } from "@/components/documents/docs-context";
import { CircleIcon } from "@/components/circles/circle-icon";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { buildTree, childrenOf, descendantsOf, ancestorsOf, type TreeNode } from "@/lib/wiki/tree";
import { subgroupsOf, topLevel } from "@/lib/circles/tiers";
import type { WikiPageSummary } from "@/lib/wiki/store";
import type { Circle } from "@/lib/circles/types";
import { isCommunity } from "@/lib/circles/ids";
import { cn } from "@/lib/utils";

/**
 * The documents sidebar (as in Outline): your starred and recent documents,
 * your drafts, then every circle that has pages, each folding out to its
 * page tree — pages inside pages, the one you're reading marked and its
 * parents unfolded — with its sub groups nested inside it, each folding out
 * the same way. Documents sit on white, the circles' headings around them. For the circles whose pages you keep (the server
 * decides; `keepers` says which), a row's **+** starts a page inside it,
 * **Move to…** chooses a new place, and a row can be dragged: onto the top
 * or bottom edge of another to go before or after it, onto its middle to go
 * inside it (at the end), or onto the circle's name to go to its top level.
 * Every move is one `PATCH { parentId, after }`; the tree is rebuilt from
 * the pages list (`wikiPagesQuery`) with `lib/wiki/tree.ts`. Past fifty
 * siblings a **Show more** keeps long lists short.
 */

const MAX_SIBLINGS = 50;
const OPEN_CIRCLES_KEY = "cvc-docs-open-circles";

type Zone = "before" | "after" | "inside";
type Move = { slug: string; parentId: string | null; after: string | null };

const labelClass = "px-1 pb-0.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted";
/** Documents are listed on white, set apart from the circles' headings. */
const panelClass = "flex flex-col rounded-lg border border-border bg-white p-1 shadow-soft";
const entryClass =
  "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-foreground/80 hover:bg-accent hover:text-foreground";
const smallButton =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition hover:bg-primary/20 hover:text-foreground";

const readOpenCircles = (): Record<string, boolean> => {
  try {
    const stored = JSON.parse(localStorage.getItem(OPEN_CIRCLES_KEY) ?? "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
};

export function DocumentsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useSession();
  const circles = useCircles();
  const { data } = useWikiPages();
  const shell = useDocsShell();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const pages = useMemo(() => data?.pages ?? [], [data]);
  const keepers = data?.keepers ?? [];
  const choose = onNavigate ?? (() => undefined);

  // The page being read, if any.
  const slug = pathname.startsWith("/wiki/")
    ? decodeURIComponent(pathname.slice("/wiki/".length).split("/")[0])
    : null;
  const current = slug ? pages.find((page) => page.slug === slug) : undefined;
  const published = useMemo(() => pages.filter((page) => !page.draft), [pages]);
  const drafts = useMemo(() => pages.filter((page) => page.draft), [pages]);
  // Whose pages you may arrange: the circles whose pages you keep (the Board's and admins', every circle's).
  const canArrange = (circleId: string) =>
    !!user?.isAdmin || keepers.some((keeper) => keeper.id === circleId);

  // The circles with pages (or with sub groups that have some): Community first, then yours,
  // then the rest, by name — each sub group nested in its circle (`nested`).
  const withPages = useMemo(() => new Set(published.map((page) => page.keeper)), [published]);
  const nested = (circleId: string) =>
    subgroupsOf(circles ?? [], circleId)
      .filter((sub) => withPages.has(sub.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  const sections = useMemo(() => {
    const all = circles ?? [];
    const inIt = (circle: Circle) =>
      !!user?.personId && circle.seats.some((seat) => seat.personId === user.personId);
    return topLevel(all)
      .filter(
        (circle) =>
          withPages.has(circle.id) ||
          subgroupsOf(all, circle.id).some((sub) => withPages.has(sub.id))
      )
      .sort(
        (a, b) =>
          Number(isCommunity(b.id)) - Number(isCommunity(a.id)) ||
          Number(inIt(b)) - Number(inIt(a)) ||
          a.name.localeCompare(b.name)
      );
  }, [circles, withPages, user?.personId]);

  // Which circles are unfolded (remembered in this browser); the current page's always is.
  const [toggledCircles, setToggledCircles] = useState<Record<string, boolean>>({});
  useEffect(() => setToggledCircles(readOpenCircles()), []);
  // Unfolded by default: the circle of the page you're reading (and, for a sub group's page, its circle).
  const readingIn = (circleId: string) =>
    !!current &&
    (current.keeper === circleId ||
      subgroupsOf(circles ?? [], circleId).some((sub) => sub.id === current.keeper));
  const circleOpen = (circleId: string) =>
    toggledCircles[circleId] ?? (readingIn(circleId) || sections.length === 1);
  const toggleCircle = (circleId: string) =>
    setToggledCircles((state) => {
      const next = { ...state, [circleId]: !circleOpen(circleId) };
      try {
        localStorage.setItem(OPEN_CIRCLES_KEY, JSON.stringify(next));
      } catch {
        // Not remembered, then.
      }
      return next;
    });
  // Which pages' children show: those you've toggled; otherwise the current page's and its parents'.
  const [toggledNodes, setToggledNodes] = useState<Record<string, boolean>>({});
  const unfolded = useMemo(
    () =>
      new Set(current ? [current.id, ...ancestorsOf(pages, current).map((page) => page.id)] : []),
    [pages, current]
  );
  const nodeOpen = (pageId: string) => toggledNodes[pageId] ?? unfolded.has(pageId);
  const toggleNode = (pageId: string) =>
    setToggledNodes((state) => ({ ...state, [pageId]: !nodeOpen(pageId) }));
  // Lists shown in full past the first fifty.
  const [shownInFull, setShownInFull] = useState<Set<string>>(() => new Set());

  // Moving a page: by drag, or through the Move to… dialog.
  const move = useMutation({
    mutationFn: ({ slug: moving, parentId, after }: Move) =>
      apiFetch<{ page: WikiPageSummary }>(`/api/wiki/pages/${moving}`, {
        method: "PATCH",
        body: JSON.stringify({ parentId, after }),
      }),
    onSuccess: (_result, { parentId }) => {
      if (parentId) setToggledNodes((state) => ({ ...state, [parentId]: true }));
      void queryClient.invalidateQueries({ queryKey: ["wiki"], exact: true });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not move the page",
        description: error.message,
        variant: "destructive",
      }),
  });
  const [movingPage, setMovingPage] = useState<WikiPageSummary | null>(null);

  const dragging = useRef<WikiPageSummary | null>(null);
  const [drop, setDrop] = useState<{ id: string; zone: Zone } | null>(null);
  /** Where a drag over `target` would put the page — or nothing, when it can't go there. */
  const zoneFor = (event: DragEvent, target: WikiPageSummary): Zone | null => {
    const moving = dragging.current;
    if (!moving || moving.id === target.id || moving.keeper !== target.keeper) return null;
    if (descendantsOf(pages, moving.id).some((entry) => entry.id === target.id)) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const where = (event.clientY - rect.top) / Math.max(rect.height, 1);
    return where < 0.25 ? "before" : where > 0.75 ? "after" : "inside";
  };
  const siblingsOf = (parentId: string | null, keeper: string, except: string) =>
    childrenOf(pages, parentId, keeper).filter((entry) => entry.id !== except);
  const dropOn = (moving: WikiPageSummary, target: WikiPageSummary, zone: Zone) => {
    if (zone === "inside") {
      const kin = siblingsOf(target.id, target.keeper, moving.id);
      move.mutate({ slug: moving.slug, parentId: target.id, after: kin.at(-1)?.id ?? null });
      return;
    }
    const parentId = target.parentId ?? null;
    if (zone === "after") {
      move.mutate({ slug: moving.slug, parentId, after: target.id });
      return;
    }
    const kin = siblingsOf(parentId, target.keeper, moving.id);
    const index = kin.findIndex((entry) => entry.id === target.id);
    move.mutate({ slug: moving.slug, parentId, after: index > 0 ? kin[index - 1].id : null });
  };
  const dropOnCircle = (moving: WikiPageSummary, circleId: string) => {
    const top = siblingsOf(null, circleId, moving.id);
    move.mutate({ slug: moving.slug, parentId: null, after: top.at(-1)?.id ?? null });
  };
  const endDrag = () => {
    dragging.current = null;
    setDrop(null);
  };

  /** One circle's tree, from `nodes` down, each level indented a little more. */
  const rows = (
    nodes: TreeNode<WikiPageSummary>[],
    depth: number,
    listKey: string,
    arrangeable: boolean
  ): ReactNode => {
    const shown = shownInFull.has(listKey) ? nodes : nodes.slice(0, MAX_SIBLINGS);
    return (
      <>
        {shown.map(({ page, children }) => {
          const here = current?.id === page.id;
          const open = nodeOpen(page.id);
          const target = drop?.id === page.id ? drop.zone : null;
          return (
            <li key={page.id}>
              <div
                className={cn(
                  "group relative flex items-center gap-0.5 rounded-md border-y-2 border-transparent pr-1 text-sm",
                  here
                    ? "bg-primary/15 font-semibold text-foreground"
                    : "text-foreground/80 hover:bg-accent",
                  target === "inside" && "ring-2 ring-inset ring-primary",
                  target === "before" && "border-t-primary",
                  target === "after" && "border-b-primary"
                )}
                style={{ paddingLeft: 2 + depth * 14 }}
                draggable={arrangeable}
                onDragStart={(event) => {
                  dragging.current = page;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", page.id);
                }}
                onDragEnd={endDrag}
                onDragOver={(event) => {
                  const zone = zoneFor(event, page);
                  if (!zone) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (drop?.id !== page.id || drop.zone !== zone) setDrop({ id: page.id, zone });
                }}
                onDragLeave={() => setDrop((state) => (state?.id === page.id ? null : state))}
                onDrop={(event) => {
                  event.preventDefault();
                  const zone = zoneFor(event, page);
                  const moving = dragging.current;
                  endDrag();
                  if (zone && moving) dropOn(moving, page, zone);
                }}
                data-tree-page={page.id}
                data-tree-depth={depth}
                data-drop-zone={target ?? undefined}
              >
                {children.length ? (
                  <button
                    type="button"
                    onClick={() => toggleNode(page.id)}
                    aria-expanded={open}
                    aria-label={`${open ? "Fold" : "Unfold"} ${page.title}`}
                    className={smallButton}
                    data-tree-toggle={page.id}
                  >
                    <ChevronRight
                      className={cn("h-3.5 w-3.5 transition", open && "rotate-90")}
                      aria-hidden
                    />
                  </button>
                ) : (
                  <span className="h-6 w-6 shrink-0" aria-hidden />
                )}
                <Link
                  href={`/wiki/${page.slug}`}
                  aria-current={here ? "page" : undefined}
                  onClick={choose}
                  title={page.title}
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1"
                >
                  <span className="w-5 shrink-0 text-center text-base leading-none" aria-hidden>
                    {page.icon ?? <BookOpen className="mx-auto h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="truncate">{page.title}</span>
                </Link>
                {arrangeable ? (
                  <span className="flex shrink-0 items-center opacity-100 transition lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                    {shell ? (
                      <button
                        type="button"
                        className={smallButton}
                        title="New page inside"
                        aria-label={`New page inside ${page.title}`}
                        onClick={() =>
                          shell.newPage({ id: page.id, title: page.title, keeper: page.keeper })
                        }
                        data-tree-add={page.id}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={smallButton}
                      title="Move to…"
                      aria-label={`Move ${page.title}`}
                      onClick={() => setMovingPage(page)}
                      data-tree-move={page.id}
                    >
                      <Move className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                ) : null}
              </div>
              {open && children.length ? (
                <ul>{rows(children, depth + 1, page.id, arrangeable)}</ul>
              ) : null}
            </li>
          );
        })}
        {shown.length < nodes.length ? (
          <li>
            <button
              type="button"
              onClick={() => setShownInFull((state) => new Set(state).add(listKey))}
              className={cn(entryClass, "text-muted")}
              style={{ paddingLeft: 30 + depth * 14 }}
            >
              Show {nodes.length - shown.length} more
            </button>
          </li>
        ) : null}
      </>
    );
  };

  /** A circle's heading, its pages on white, and its sub groups (that have pages) nested inside it. */
  const section = (circle: Circle, depth: number): ReactNode => {
    const open = circleOpen(circle.id);
    const arrangeable = canArrange(circle.id);
    const count = published.filter((page) => page.keeper === circle.id).length;
    const over = drop?.id === `circle:${circle.id}`;
    const subs = depth === 0 ? nested(circle.id) : [];
    const tree = buildTree(published, circle.id);
    return (
      <div
        key={circle.id}
        data-docs-circle={circle.id}
        data-open={open ? "1" : "0"}
        data-depth={depth}
        className={cn(depth > 0 && "ml-2 border-l-2 border-border pl-1.5")}
      >
        <button
          type="button"
          onClick={() => toggleCircle(circle.id)}
          aria-expanded={open}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left font-medium text-foreground hover:bg-accent",
            over && "ring-2 ring-inset ring-primary"
          )}
          onDragOver={(event) => {
            const moving = dragging.current;
            if (!moving || moving.keeper !== circle.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (!over) setDrop({ id: `circle:${circle.id}`, zone: "inside" });
          }}
          onDragLeave={() => setDrop((state) => (over ? null : state))}
          onDrop={(event) => {
            event.preventDefault();
            const moving = dragging.current;
            endDrag();
            if (moving && moving.keeper === circle.id) dropOnCircle(moving, circle.id);
          }}
        >
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted transition", !open && "-rotate-90")}
            aria-hidden
          />
          <CircleIcon circle={circle} size={depth ? 16 : 18} className="shrink-0 rounded-full" />
          <span className="truncate">{circle.name}</span>
          <span className="ml-auto pl-2 text-xs font-normal text-muted">
            {subs.length ? `${count} · ${subs.length} sub` : count}
          </span>
        </button>
        {open ? (
          <div className="flex flex-col gap-1 pb-1">
            {tree.length ? (
              <ul className={panelClass} data-docs-pages={circle.id}>
                {rows(tree, 0, `circle:${circle.id}`, arrangeable)}
              </ul>
            ) : null}
            {subs.map((sub) => section(sub, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <nav aria-label="Documents" className="flex flex-col gap-2 text-sm" data-docs-tree>
      <div className="flex items-center gap-1">
        <Link
          href="/documents"
          onClick={choose}
          aria-current={pathname === "/documents" ? "page" : undefined}
          className={cn(
            entryClass,
            "min-w-0 flex-1 font-medium",
            pathname === "/documents" && "bg-primary/15 text-foreground"
          )}
        >
          <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">All documents</span>
        </Link>
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

      <MyDocumentsLinks
        linkClass={entryClass}
        labelClass={labelClass}
        onChoose={choose}
        listClass={panelClass}
      />

      {drafts.length ? (
        <section data-docs-drafts>
          <p className={labelClass}>Drafts</p>
          <ul className={panelClass}>
            {drafts.map((page) => (
              <li key={page.id}>
                <Link
                  href={`/wiki/${page.slug}`}
                  onClick={choose}
                  aria-current={current?.id === page.id ? "page" : undefined}
                  className={cn(
                    entryClass,
                    current?.id === page.id && "bg-primary/15 font-semibold text-foreground"
                  )}
                >
                  <PencilLine className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="truncate">{page.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section data-docs-circles>
        <p className={labelClass}>Circles</p>
        {sections.length ? null : <p className="px-1.5 py-1 text-xs text-muted">No pages yet.</p>}
        {sections.map((circle) => section(circle, 0))}
      </section>

      <Link href="/documents/trash" onClick={choose} className={cn(entryClass, "text-muted")}>
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden /> Trash
      </Link>

      {movingPage ? (
        <MoveDialog
          page={movingPage}
          pages={pages}
          circleName={circles?.find((circle) => circle.id === movingPage.keeper)?.name ?? ""}
          moving={move.isPending}
          onMove={(where) => {
            move.mutate(where, { onSuccess: () => setMovingPage(null) });
          }}
          onClose={() => setMovingPage(null)}
        />
      ) : null}
    </nav>
  );
}

/** The circle's pages, top to bottom, with their depth — for a list of places a page could go. */
function flatten<T extends WikiPageSummary>(
  nodes: TreeNode<T>[],
  depth = 0
): { page: T; depth: number }[] {
  return nodes.flatMap((node) => [
    { page: node.page, depth },
    ...flatten(node.children, depth + 1),
  ]);
}

/**
 * Move to…: choose which page it goes inside (or the circle's top level) and
 * where among that page's pages — the keyboard's and the phone's way to move
 * a page, and the exact way for anyone. A page can't go inside itself or
 * one of its own pages.
 */
function MoveDialog({
  page,
  pages,
  circleName,
  moving,
  onMove,
  onClose,
}: {
  page: WikiPageSummary;
  pages: WikiPageSummary[];
  circleName: string;
  moving: boolean;
  onMove: (where: Move) => void;
  onClose: () => void;
}) {
  const kin = useMemo(() => pages.filter((entry) => entry.keeper === page.keeper), [pages, page]);
  const blocked = useMemo(
    () => new Set([page.id, ...descendantsOf(kin, page.id).map((entry) => entry.id)]),
    [kin, page]
  );
  const places = useMemo(
    () => flatten(buildTree(kin)).filter((entry) => !blocked.has(entry.page.id)),
    [kin, blocked]
  );
  const siblingsUnder = (parentId: string | null) =>
    childrenOf(kin, parentId, page.keeper).filter((entry) => entry.id !== page.id);
  const [parentId, setParentId] = useState(page.parentId ?? "");
  // Where it is now: after the sibling before it (or first).
  const [after, setAfter] = useState(() => {
    const siblings = childrenOf(kin, page.parentId ?? null, page.keeper);
    const index = siblings.findIndex((entry) => entry.id === page.id);
    return index > 0 ? siblings[index - 1].id : "";
  });
  const siblings = siblingsUnder(parentId || null);
  const choosePlace = (next: string) => {
    setParentId(next);
    // Somewhere new: last, unless it's back where it was.
    if ((next || null) === (page.parentId ?? null)) {
      const current = childrenOf(kin, page.parentId ?? null, page.keeper);
      const index = current.findIndex((entry) => entry.id === page.id);
      setAfter(index > 0 ? current[index - 1].id : "");
    } else setAfter(siblingsUnder(next || null).at(-1)?.id ?? "");
  };
  return (
    <Dialog
      title="Move the page"
      icon={<Move className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onMove({ slug: page.slug, parentId: parentId || null, after: after || null });
        }}
        data-move-dialog
      >
        <p className="text-sm text-muted">
          Where <span className="font-medium text-foreground">{page.title}</span> sits in{" "}
          {circleName || "its circle"}&apos;s pages.
        </p>
        <label className="flex flex-col gap-1 text-sm text-foreground">
          Inside
          <Select
            value={parentId}
            onChange={(event) => choosePlace(event.target.value)}
            className="h-9 rounded-md px-2"
            data-move-parent
          >
            <option value="">Top level{circleName ? ` of ${circleName}` : ""}</option>
            {places.map(({ page: place, depth }) => (
              <option key={place.id} value={place.id}>
                {"  ".repeat(depth)}
                {place.icon ? `${place.icon} ` : ""}
                {place.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-foreground">
          Position
          <Select
            value={after}
            onChange={(event) => setAfter(event.target.value)}
            className="h-9 rounded-md px-2"
            data-move-after
          >
            <option value="">First</option>
            {siblings.map((sibling) => (
              <option key={sibling.id} value={sibling.id}>
                After {sibling.title}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={moving}>
            {moving ? "Moving…" : "Move"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
