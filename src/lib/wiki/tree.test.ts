import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  buildTree,
  canNest,
  childrenOf,
  descendantsOf,
  orderAfterLast,
  orderBetween,
  placeAfter,
  sortSiblings,
  type TreePage,
} from "./tree";

const page = (id: string, title: string, parentId?: string | null, order?: string): TreePage => ({
  id,
  title,
  keeper: "lcc",
  ...(parentId !== undefined ? { parentId } : {}),
  ...(order ? { order } : {}),
});

const pages: TreePage[] = [
  page("mowing", "Mowing", null, "i"),
  page("june", "June plan", "mowing", "r"),
  page("may", "May plan", "mowing", "i"),
  page("hedges", "Hedges", null, "r"),
  page("notes", "Notes"), // no order: after the ordered ones, by title
  page("archive", "Archive"),
  page("orphan", "Orphan", "gone"),
  { id: "board", title: "Agenda", keeper: "board", order: "i" },
];

describe("the page tree", () => {
  it("orders siblings: by order key, then the unordered by title", () => {
    expect(
      sortSiblings([page("b", "B"), page("a", "A", null, "r"), page("c", "C", null, "i")]).map(
        (entry) => entry.id
      )
    ).toEqual(["c", "a", "b"]);
    // Strictly the top level: a page whose parent is gone isn't among them (the tree lifts it).
    expect(childrenOf(pages, null, "lcc").map((entry) => entry.id)).toEqual([
      "mowing",
      "hedges",
      "archive",
      "notes",
    ]);
    expect(childrenOf(pages, "mowing").map((entry) => entry.id)).toEqual(["may", "june"]);
  });

  it("builds a circle's tree, showing a page whose parent is gone at the top", () => {
    const tree = buildTree(pages, "lcc");
    expect(tree.map((node) => node.page.id)).toEqual([
      "mowing",
      "hedges",
      "archive",
      "notes",
      "orphan",
    ]);
    expect(tree[0].children.map((node) => node.page.id)).toEqual(["may", "june"]);
    expect(buildTree(pages).some((node) => node.page.id === "board")).toBe(true);
  });

  it("knows ancestors and descendants, and what can nest where", () => {
    expect(ancestorsOf(pages, pages[1]).map((entry) => entry.id)).toEqual(["mowing"]);
    expect(ancestorsOf(pages, pages[6])).toEqual([]);
    expect(
      descendantsOf(pages, "mowing")
        .map((entry) => entry.id)
        .sort()
    ).toEqual(["june", "may"]);
    const mowing = pages[0];
    expect(canNest(pages, mowing, pages[1])).toBe(false); // its own page
    expect(canNest(pages, mowing, mowing)).toBe(false);
    expect(canNest(pages, mowing, pages[3])).toBe(true);
    expect(canNest(pages, mowing, pages[7])).toBe(false); // another circle's
  });

  it("makes order keys that sort between their neighbours and never end in 0", () => {
    expect(orderBetween()).toBe("i");
    const first = orderBetween(undefined, "i");
    expect(first < "i").toBe(true);
    const between = orderBetween("i", "r");
    expect(between > "i" && between < "r").toBe(true);
    expect(orderBetween("a", "b")).toBe("ai");
    expect(orderBetween("ai", "aj")).toBe("aii");
    expect(orderBetween("", "1") < "1").toBe(true);
    // Dropping pages into the same gap again and again stays sorted.
    let lo = "i";
    const hi = "j";
    for (let n = 0; n < 40; n++) {
      const key = orderBetween(lo, hi);
      expect(key > lo && key < hi).toBe(true);
      expect(key.endsWith("0")).toBe(false);
      lo = key;
    }
    // Appending keeps growing above the last.
    let last = "i";
    for (let n = 0; n < 60; n++) {
      const key = orderBetween(last, undefined);
      expect(key > last).toBe(true);
      last = key;
    }
    expect(last.length).toBeLessThan(8);
    // Neighbours out of order: the key goes after the first.
    expect(orderBetween("r", "i") > "r").toBe(true);
    expect(orderAfterLast(childrenOf(pages, "mowing")) > "r").toBe(true);
    expect(orderAfterLast([])).toBe("i");
  });

  it("places a page after a sibling, renumbering only when the neighbours leave no room", () => {
    const siblings = pages.filter(
      (entry) => (entry.parentId ?? null) === null && entry.keeper === "lcc"
    );
    const moving = page("may", "May plan", "mowing", "i");
    // Between two ordered neighbours: just the one new key.
    const between = placeAfter(siblings, moving, "mowing");
    expect(Array.from(between.keys())).toEqual(["may"]);
    expect(between.get("may")! > "i" && between.get("may")! < "r").toBe(true);
    // First: before everything.
    expect(placeAfter(siblings, moving, null).get("may")! < "i").toBe(true);
    // After a sibling that isn't there: last — the unordered ones have no keys, so every sibling gets one.
    const last = placeAfter(siblings, moving, "nowhere");
    expect(Array.from(last.keys())).toEqual(["mowing", "hedges", "archive", "notes", "may"]);
    const keys = Array.from(last.values());
    expect([...keys].sort()).toEqual(keys);
    // After an unordered sibling: renumbered in the order shown, the page in its place.
    const after = placeAfter(siblings, moving, "archive");
    expect(Array.from(after.keys())).toEqual(["mowing", "hedges", "archive", "may", "notes"]);
    // A page already among the siblings is placed afresh, not counted twice.
    expect(Array.from(placeAfter(siblings, siblings[1], "mowing").keys())).toEqual([
      "mowing",
      "hedges",
      "archive",
      "notes",
    ]);
  });
});
