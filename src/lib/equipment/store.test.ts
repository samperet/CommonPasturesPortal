import { beforeEach, describe, expect, it, vi } from "vitest";

// The equipment's documents, in memory.
const docs = new Map<string, unknown>();
vi.mock("@/lib/storage", () => {
  const mutateJson = async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(docs.get(key) ?? null);
    if ("value" in next) docs.set(key, next.value);
    return next.result;
  };
  return {
    readJson: async (key: string) => docs.get(key) ?? null,
    mutateJson,
    readOrSeedJson: (key: string, parse: (raw: unknown) => unknown, seed: () => unknown) =>
      mutateJson(key, (current) => {
        const stored = parse(current);
        if (stored) return { result: stored };
        const value = seed();
        return { value, result: parse(value) };
      }),
  };
});

const {
  addEntry,
  addItem,
  changeEntry,
  entryInputSchema,
  itemInputSchema,
  readEquipment,
  removeItem,
} = await import("./store");
const { isOperations } = await import("@/lib/circles/ids");
const { modulesFor } = await import("@/lib/circles/layout");

const om = { id: "om", name: "O&M" };
const land = { id: "lcc", name: "Land Care Circle" };
const ada = { userId: "u-ada", name: "Ada Ash" };
const ben = { userId: "u-ben", name: "Ben Birch" };

beforeEach(() => docs.clear());

describe("equipment", () => {
  it("knows the O&M circle by its name", () => {
    expect(isOperations({ name: "O&M" })).toBe(true);
    expect(isOperations({ name: "O & M Circle" })).toBe(true);
    expect(isOperations({ name: "Operations and Maintenance" })).toBe(true);
    expect(isOperations({ name: "Land Care Circle" })).toBe(false);
    expect(isOperations({ name: "Mom&Pop" })).toBe(false);
  });

  it("puts Equipment on O&M's page, saved there or not, and nowhere else unasked", () => {
    const modules = modulesFor(
      { ...om, modules: [{ id: "members", type: "members", size: "small" }] },
      { hasSchedule: false }
    );
    expect(modules.map((module) => module.type)).toEqual(["members", "equipment"]);
    const saved = modulesFor(
      { ...om, modules: [{ id: "eq", type: "equipment", size: "medium" }] },
      { hasSchedule: false }
    );
    expect(saved).toEqual([{ id: "eq", type: "equipment", size: "medium" }]);
    expect(modulesFor({ ...land, modules: [] }, { hasSchedule: false })).toEqual([]);
  });

  it("starts O&M's list with the DR mower, once — and no one else's", async () => {
    const first = await readEquipment(om);
    expect(first.map((item) => item.name)).toEqual(["DR mower"]);
    expect(first[0].log.length).toBeGreaterThan(3);
    expect(first[0].log.find((entry) => entry.kind === "repair")?.cost).toBe(66749);
    // Removed, it stays removed: the list is there now.
    await removeItem(om, "dr-mower");
    expect(await readEquipment(om)).toEqual([]);
    expect(await readEquipment(land)).toEqual([]);
  });

  it("names no residents in what it starts with (the code is public)", async () => {
    const [mower] = await readEquipment(om);
    const words = JSON.stringify(mower);
    expect(words).not.toMatch(/@|\d{3}-\d{3}-\d{4}/);
    expect(mower.log.every((entry) => entry.imported && entry.by.userId === "")).toBe(true);
  });

  it("adds equipment and log entries; only their writers (or moderators) change entries", async () => {
    const added = await addItem(
      land,
      ada,
      itemInputSchema.parse({ name: "Snow blower", kind: "Two-stage" })
    );
    if (!added.ok) throw new Error("not added");
    expect(added.value.status).toBe("in-service");
    const logged = await addEntry(
      land,
      added.value.id,
      ada,
      entryInputSchema.parse({
        date: "2026-01-05",
        kind: "use",
        text: "Cleared the circle road",
        hours: 1.5,
      })
    );
    if (!logged.ok) throw new Error("not logged");
    expect(logged.value).toMatchObject({ hours: 1.5, by: ada });
    expect(
      await changeEntry(land, added.value.id, logged.value.id, ben, false, { text: "No" })
    ).toEqual({
      ok: false,
      reason: "forbidden",
    });
    const fixed = await changeEntry(land, added.value.id, logged.value.id, ada, false, {
      text: "Cleared it all",
      cost: 500,
    });
    expect(fixed.ok && fixed.value).toMatchObject({
      text: "Cleared it all",
      hours: 1.5,
      cost: 500,
    });
    expect((await changeEntry(land, added.value.id, logged.value.id, ben, true, null)).ok).toBe(
      true
    );
    expect((await readEquipment(land))[0].log).toEqual([]);
  });

  it("logs only what's happened", async () => {
    const added = await addItem(land, ada, itemInputSchema.parse({ name: "Mower" }));
    if (!added.ok) throw new Error("not added");
    const later = await addEntry(
      land,
      added.value.id,
      ada,
      entryInputSchema.parse({ date: "2999-01-01", kind: "note", text: "Soon" })
    );
    expect(later).toEqual({ ok: false, reason: "future" });
  });
});
