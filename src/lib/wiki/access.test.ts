import { describe, expect, it } from "vitest";
import type { DirectoryDocument } from "@/lib/directory/types";
import {
  canEditPage,
  canManagePage,
  canMovePageTo,
  canSeePage,
  circlesYouKeep,
  visiblePages,
} from "./access";

/** Who edits a page, and where it can move: only to a circle you're in (the Board: anywhere). */

const directory = {
  people: [],
  households: [],
  circles: [
    { id: "community", name: "Community", seats: [] },
    { id: "board", name: "Board", seats: [{ personId: "000000000001" }] },
    { id: "lcc", name: "Land Care Circle", seats: [{ personId: "000000000003" }] },
    {
      id: "cht",
      name: "Chicken Tenders",
      seats: [{ personId: "000000000004" }],
      joinPolicy: "open",
    },
  ],
} as unknown as DirectoryDocument;
const ada = { id: "u-ada", personId: "000000000001" };
const cara = { id: "u-cara", personId: "000000000003" };
const dev = { id: "u-dev", personId: "000000000004" };
const page = (edit: "keeper" | "anyone") => ({ keeper: "lcc", edit: { kind: edit } as const });

describe("wiki access", () => {
  it("is edited by its circle and the Board — or, if it says so, anyone", () => {
    expect(canEditPage(cara, directory, page("keeper"))).toBe(true);
    expect(canEditPage(ada, directory, page("keeper"))).toBe(true);
    expect(canEditPage(dev, directory, page("keeper"))).toBe(false);
    expect(canEditPage(dev, directory, page("anyone"))).toBe(true);
    // A setting from before every page was open to all is no longer kept to.
    const once = { ...page("anyone"), view: { kind: "keeper" } as const };
    expect(canEditPage(dev, directory, once)).toBe(true);
  });

  it("moves only to a circle you're in (and Community's), but anywhere for the Board", () => {
    expect(canMovePageTo(cara, directory, page("keeper"), "community")).toBe(true);
    expect(canMovePageTo(cara, directory, page("keeper"), "cht")).toBe(false);
    expect(canMovePageTo(cara, directory, page("keeper"), "board")).toBe(false);
    expect(circlesYouKeep(cara, directory).map((circle) => circle.id)).toEqual([
      "community",
      "lcc",
    ]);
    expect(canMovePageTo(ada, directory, page("keeper"), "cht")).toBe(true);
    expect(circlesYouKeep(ada, directory)).toHaveLength(4);
  });

  it("is moved only by those who look after it, even where anyone can edit it", () => {
    expect(canManagePage(dev, directory, page("anyone"))).toBe(false);
    expect(canMovePageTo(dev, directory, page("anyone"), "cht")).toBe(false);
  });

  it("shows a draft only to its author (and admins), and a published page to everyone", () => {
    const published = { id: "1", draft: undefined };
    const carasDraft = { id: "2", draft: { by: "u-cara" } };
    expect(canSeePage(dev, published)).toBe(true);
    expect(canSeePage(null, published)).toBe(true);
    expect(canSeePage(cara, carasDraft)).toBe(true);
    expect(canSeePage(dev, carasDraft)).toBe(false);
    expect(canSeePage(null, carasDraft)).toBe(false);
    expect(visiblePages([published, carasDraft], dev).map((page) => page.id)).toEqual(["1"]);
    expect(visiblePages([published, carasDraft], cara).map((page) => page.id)).toEqual(["1", "2"]);
    expect(visiblePages([published, carasDraft], null).map((page) => page.id)).toEqual(["1"]);
  });
});
