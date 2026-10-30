import { describe, expect, it } from "vitest";
import { moduleTitle, modulesFor, rowSpans, type CircleModule } from "./layout";

const types = (modules: CircleModule[]) => modules.map((module) => module.type);

describe("modulesFor", () => {
  it("uses the modules a circle saved, as they are", () => {
    const modules: CircleModule[] = [{ id: "tasks", type: "tasks", size: "full" }];
    expect(modulesFor({ id: "lcc", modules }, { hasSchedule: true })).toEqual(modules);
  });

  it("gives the Safety Crew its Alert at the end of its page, saved there or not", () => {
    const saved: CircleModule[] = [{ id: "members", type: "members", size: "small" }];
    expect(
      types(modulesFor({ id: "crew", name: "Safety Crew", modules: saved }, { hasSchedule: false }))
    ).toEqual(["members", "alert"]);
    expect(types(modulesFor({ id: "crew", name: "Safety Crew" }, { hasSchedule: false }))).toEqual([
      "information",
      "members",
      "tasks",
      "documents",
      "alert",
    ]);
    const withAlert: CircleModule[] = [{ id: "alert", type: "alert", size: "full" }, ...saved];
    expect(
      modulesFor({ id: "crew", name: "Safety Crew", modules: withAlert }, { hasSchedule: false })
    ).toEqual(withAlert);
    expect(
      types(modulesFor({ id: "lcc", name: "Land Care", modules: saved }, { hasSchedule: false }))
    ).toEqual(["members"]);
  });

  it("leaves out a saved Meetings module (meeting notes are pages now)", () => {
    const modules = [
      { id: "meetings", type: "meetings", size: "full" },
      { id: "tasks", type: "tasks", size: "full" },
    ] as unknown as CircleModule[];
    expect(types(modulesFor({ id: "lcc", modules }, { hasSchedule: false }))).toEqual(["tasks"]);
  });

  it("derives a page for a circle that never saved one: its own pages, members, tasks, documents", () => {
    const modules = modulesFor({ id: "lcc" }, { hasSchedule: false });
    expect(types(modules)).toEqual(["information", "members", "tasks", "documents"]);
    expect(modules[0].info).toEqual({
      filter: { kind: "circle", circleId: "lcc" },
      view: "summary",
    });
  });

  it("leaves out what the circle had turned off, and adds a duty schedule where there is one", () => {
    const modules = modulesFor(
      { id: "lcc", features: { tasks: false, documents: false } },
      { hasSchedule: true }
    );
    expect(types(modules)).toEqual(["information", "members", "schedule"]);
  });

  it("keeps the order and sizes of an older layout, then the rest as they come by default", () => {
    const modules = modulesFor(
      {
        id: "lcc",
        layout: [
          { id: "documents", size: "small" },
          { id: "information", size: "full" },
        ],
        infoView: "titles",
      },
      { hasSchedule: false }
    );
    expect(modules.map((module) => [module.type, module.size])).toEqual([
      ["documents", "small"],
      ["information", "full"],
      ["members", "small"],
      ["tasks", "full"],
    ]);
    expect(modules[1].info?.view).toBe("titles");
  });

  it("gives Community no members (it's everyone)", () => {
    // …and a built-in list of the circles within it.
    expect(types(modulesFor({ id: "community" }, { hasSchedule: false }))).toEqual([
      "information",
      "tasks",
      "documents",
      "subgroups",
    ]);
  });
});

describe("moduleTitle", () => {
  it("prefers the module's own title, then a schedule's name, then the type's name", () => {
    expect(moduleTitle({ type: "information", title: "Stove" })).toBe("Stove");
    expect(moduleTitle({ type: "information", title: "  " })).toBe("Filtered Documents");
    expect(moduleTitle({ type: "schedule" }, "Chicken duty")).toBe("Chicken duty");
    expect(moduleTitle({ type: "schedule" })).toBe("Duty schedule");
  });
});

describe("rowSpans", () => {
  it("lays modules in rows and widens the last of each row to fill it", () => {
    // Filtered Documents (two thirds) alone now that Members has its own column: full width.
    expect(rowSpans(["large", "full", "full"])).toEqual([6, 6, 6]);
    expect(rowSpans(["large", "small", "medium", "medium"])).toEqual([4, 2, 3, 3]);
    expect(rowSpans(["small", "small", "large"])).toEqual([2, 4, 6]);
    expect(rowSpans(["medium", "small", "small"])).toEqual([3, 3, 6]);
    expect(rowSpans([])).toEqual([]);
  });
});
