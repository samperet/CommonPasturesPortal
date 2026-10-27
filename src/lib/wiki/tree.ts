/**
 * Pages as a tree (as in Outline): a page can sit inside another of the same
 * circle (`parentId`), and siblings keep an order (`order`, a fractional
 * index: a string that sorts between its neighbours', so one move rewrites
 * one page). Pure, safe for the browser: the sidebar, breadcrumbs and the
 * store all use it. A page without an `order` sorts after those with one,
 * by title, until it's first moved.
 */

export interface TreePage {
  id: string;
  title: string;
  keeper: string;
  parentId?: string | null;
  order?: string;
}

export interface TreeNode<T extends TreePage = TreePage> {
  page: T;
  children: TreeNode<T>[];
}

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Siblings in order: those with an `order` first (by it), then the rest by title. */
export function sortSiblings<T extends TreePage>(pages: T[]): T[] {
  return [...pages].sort((a, b) => {
    if (a.order && b.order) return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
    if (a.order) return -1;
    if (b.order) return 1;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
  });
}

/** The pages directly inside `parentId` (null: a circle's top level), in order. */
export function childrenOf<T extends TreePage>(
  pages: T[],
  parentId: string | null,
  keeper?: string
): T[] {
  return sortSiblings(
    pages.filter(
      (page) =>
        (page.parentId ?? null) === parentId && (keeper === undefined || page.keeper === keeper)
    )
  );
}

/**
 * The tree of a circle's pages (or of every circle's, without `keeper`). A
 * page whose parent isn't among the pages (in the trash, say) is shown at
 * the top level rather than lost.
 */
export function buildTree<T extends TreePage>(pages: T[], keeper?: string): TreeNode<T>[] {
  const mine = keeper === undefined ? pages : pages.filter((page) => page.keeper === keeper);
  const ids = new Set(mine.map((page) => page.id));
  const byParent = new Map<string | null, T[]>();
  for (const page of mine) {
    const parent = page.parentId && ids.has(page.parentId) ? page.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), page]);
  }
  const seen = new Set<string>();
  const nodes = (parent: string | null): TreeNode<T>[] =>
    sortSiblings(byParent.get(parent) ?? [])
      .filter((page) => !seen.has(page.id) && seen.add(page.id))
      .map((page) => ({ page, children: nodes(page.id) }));
  return nodes(null);
}

/** A page's ancestors, outermost first (a parent that's missing ends the chain). */
export function ancestorsOf<T extends TreePage>(pages: T[], page: TreePage): T[] {
  const byId = new Map(pages.map((entry) => [entry.id, entry]));
  const chain: T[] = [];
  const seen = new Set<string>([page.id]);
  let current = page.parentId ? byId.get(page.parentId) : undefined;
  while (current && !seen.has(current.id)) {
    chain.unshift(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/** Every page inside `pageId`, at any depth (children first, then theirs). */
export function descendantsOf<T extends TreePage>(pages: T[], pageId: string): T[] {
  const found: T[] = [];
  const seen = new Set<string>([pageId]);
  let frontier = [pageId];
  while (frontier.length) {
    const next: string[] = [];
    for (const page of pages) {
      if (page.parentId && frontier.includes(page.parentId) && !seen.has(page.id)) {
        seen.add(page.id);
        found.push(page);
        next.push(page.id);
      }
    }
    frontier = next;
  }
  return found;
}

/** Whether `candidate` could be `page`'s parent: not itself, not one of its own pages. */
export const canNest = (pages: TreePage[], page: TreePage, candidate: TreePage) =>
  candidate.id !== page.id &&
  candidate.keeper === page.keeper &&
  !descendantsOf(pages, page.id).some((entry) => entry.id === candidate.id);

/**
 * An order key between two neighbours' (either may be missing: before the
 * first, after the last; neither: the first key, "i"). Keys are base-36
 * strings compared as strings, and never end in "0", so there's always room
 * below one. Between two keys, digit by digit: where the neighbours leave a
 * gap, the key takes the middle of it; where they're adjacent or equal, it
 * copies the lower digit and looks one place further — so keys grow by a
 * character only where pages keep being dropped into the same gap.
 */
export function orderBetween(before?: string, after?: string): string {
  const lo = before ?? "";
  const hi = after ?? "";
  // Not a gap at all (the neighbours are out of order): go after `before`.
  if (hi && lo >= hi) return orderBetween(lo, undefined);
  // After the last: step the last digit up (a new digit only past "z"), so appending stays short.
  if (!hi) {
    if (!lo) return "i";
    const last = DIGITS.indexOf(lo[lo.length - 1]);
    return last < DIGITS.length - 1 ? lo.slice(0, -1) + DIGITS[last + 1] : `${lo}i`;
  }
  let prefix = "";
  for (let i = 0; ; i++) {
    const low = i < lo.length ? DIGITS.indexOf(lo[i]) : 0;
    const high = i < hi.length ? DIGITS.indexOf(hi[i]) : DIGITS.length;
    if (high - low > 1) return prefix + DIGITS[Math.floor((low + high) / 2)];
    prefix += DIGITS[low];
  }
}

/** The key that puts a page last among `siblings`. */
export const orderAfterLast = (siblings: TreePage[]) => {
  const ordered = sortSiblings(siblings);
  const last = ordered.length ? ordered[ordered.length - 1].order : undefined;
  return orderBetween(last, undefined);
};

/**
 * The order keys that put `page` right after `after` among `siblings` (null:
 * first; a sibling that isn't there: last), as a map of page id → key. When
 * both neighbours have keys with room between them, only the page's key is
 * new; otherwise (a sibling never moved has no key yet) every sibling is
 * given a key in its present order, so the drop lands exactly where it was
 * aimed. All the pages live in one document, so renumbering costs nothing.
 */
export function placeAfter<T extends TreePage>(
  siblings: T[],
  page: TreePage,
  after: string | null
): Map<string, string> {
  const others = sortSiblings(siblings.filter((entry) => entry.id !== page.id));
  const at = after === null ? 0 : others.findIndex((entry) => entry.id === after) + 1;
  const index = after !== null && at === 0 ? others.length : at;
  const before = others[index - 1];
  const next = others[index];
  const room =
    (!before || !!before.order) &&
    (!next || !!next.order) &&
    (!before || !next || before.order! < next.order!);
  if (room) return new Map([[page.id, orderBetween(before?.order, next?.order)]]);
  const keys = new Map<string, string>();
  let last: string | undefined;
  for (const entry of [...others.slice(0, index), page, ...others.slice(index)]) {
    last = orderBetween(last, undefined);
    keys.set(entry.id, last);
  }
  return keys;
}
