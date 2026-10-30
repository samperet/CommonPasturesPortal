import { describe, expect, it } from "vitest";
import {
  canHaveSubgroups,
  circleFamily,
  circleLabel,
  circlePath,
  circleTree,
  circlesWithin,
  managesCircle,
  parentOf,
  subgroupsOf,
  topLevel,
} from "./tiers";

/** Sub groups: one level, never the Board or Community; managed from their circle. */

const circle = (id: string, seats: string[], parentId?: string) => ({
  id,
  name: id === "lcc" ? "Land Care Circle" : id,
  seats: seats.map((personId) => ({ personId })),
  ...(parentId ? { parentId } : {}),
});
const circles = [
  circle("community", []),
  circle("board", ["000000000001"]),
  circle("lcc", ["000000000003"]),
  circle("hedges", ["000000000005"], "lcc"),
  circle("deeper", [], "hedges"),
  circle("odd", [], "community"),
  circle("orphan", [], "gone"),
];

describe("sub groups", () => {
  it("belong to a top-level circle that isn't Community", () => {
    expect(parentOf(circles, circles[3])?.id).toBe("lcc");
    expect(parentOf(circles, circles[4])).toBeNull();
    expect(parentOf(circles, circles[5])).toBeNull();
    expect(parentOf(circles, circles[6])).toBeNull();
    expect(parentOf(circles, { id: "board", parentId: "lcc" })).toBeNull();
    expect(subgroupsOf(circles, "lcc").map((entry) => entry.id)).toEqual(["hedges"]);
    expect(topLevel(circles).map((entry) => entry.id)).not.toContain("hedges");
    expect(circleLabel(circles, circles[3])).toBe("Land Care Circle › hedges");
    expect(canHaveSubgroups(circles, circles[2])).toBe(true);
    expect(canHaveSubgroups(circles, circles[3])).toBe(false);
    expect(canHaveSubgroups(circles, circles[0])).toBe(false);
  });

  it("are managed by their members, their circle's, and the Board's", () => {
    expect(managesCircle(circles, "hedges", "000000000005")).toBe(true);
    expect(managesCircle(circles, "hedges", "000000000003")).toBe(true);
    expect(managesCircle(circles, "hedges", "000000000001")).toBe(true);
    expect(managesCircle(circles, "hedges", "000000000009")).toBe(false);
    // Not the other way round: a sub group's members don't manage its circle.
    expect(managesCircle(circles, "lcc", "000000000005")).toBe(false);
    expect(managesCircle(circles, "lcc", null)).toBe(false);
  });
});

describe("Community at the root", () => {
  it("has every circle that isn't a sub group within it, and each its sub groups", () => {
    expect(circlesWithin(circles, "community").map((entry) => entry.id)).toEqual(
      [
        "board",
        "deeper",
        "Land Care Circle" === circles[2].name ? "lcc" : "lcc",
        "odd",
        "orphan",
      ].sort((a, b) =>
        circles.find((c) => c.id === a)!.name.localeCompare(circles.find((c) => c.id === b)!.name)
      )
    );
    expect(circlesWithin(circles, "lcc").map((entry) => entry.id)).toEqual(["hedges"]);
  });

  it("shows as one tree, gives each circle its path, and filters a circle with its sub groups", () => {
    const tree = circleTree(circles);
    expect(tree[0]).toMatchObject({ circle: { id: "community" }, depth: 0 });
    const lcc = tree.findIndex((row) => row.circle.id === "lcc");
    expect(tree[lcc + 1]).toMatchObject({ circle: { id: "hedges" }, depth: 2 });
    expect(tree.find((row) => row.circle.id === "board")?.depth).toBe(1);
    expect(circlePath(circles, circles[3]).map((entry) => entry.id)).toEqual([
      "community",
      "lcc",
      "hedges",
    ]);
    expect(circlePath(circles, circles[2]).map((entry) => entry.id)).toEqual(["community", "lcc"]);
    expect(Array.from(circleFamily(circles, "lcc"))).toEqual(["lcc", "hedges"]);
    expect(circleFamily(circles, "community").size).toBe(circles.length);
  });

  it("gives nobody rights over the circles within it", () => {
    // Community has no members, and being within it changes no one's rights.
    expect(managesCircle(circles, "lcc", "000000000005")).toBe(false);
    expect(managesCircle(circles, "board", "000000000003")).toBe(false);
  });
});
