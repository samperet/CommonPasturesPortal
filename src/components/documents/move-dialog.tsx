"use client";

import { useMemo, useState } from "react";
import { Move } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { buildTree, childrenOf, descendantsOf, type TreeNode } from "@/lib/wiki/tree";
import type { WikiPageSummary } from "@/lib/wiki/store";

/**
 * Moving a page among its circle's pages (pages inside pages): the dialog a
 * page's **Move** button opens.
 */

/** Where a page goes: inside which page (null: its circle's top level), after which sibling (null: first). */
export type PageMove = { slug: string; parentId: string | null; after: string | null };

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
 * where among that page's pages — one `PATCH { parentId, after }`, made by
 * whoever opens it (the page's Move button). A page can't go inside itself
 * or one of its own pages.
 */
export function MoveDialog({
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
  onMove: (where: PageMove) => void;
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
