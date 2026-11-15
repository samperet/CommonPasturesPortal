import { describe, expect, it } from "vitest";
import {
  newestFirst,
  summaryOf,
  totalsFor,
  type EquipmentItem,
  type EquipmentLogEntry,
} from "./shared";

const entry = (
  id: string,
  date: string,
  extra: Partial<EquipmentLogEntry> = {}
): EquipmentLogEntry => ({
  id,
  date,
  kind: "use",
  text: id,
  by: { userId: "u", name: "Ada Ash" },
  createdAt: `${date}T12:00:00.000Z`,
  ...extra,
});

describe("equipment", () => {
  it("lists the log newest first, and sums a year's hours and costs", () => {
    const log = [
      entry("a", "2026-05-01", { hours: 1.5 }),
      entry("b", "2026-06-10", { kind: "repair", cost: 4250 }),
      entry("c", "2025-09-01", { hours: 3, cost: 1000 }),
      entry("d", "2026-06-10", { hours: 2, createdAt: "2026-06-10T18:00:00.000Z" }),
    ];
    expect(newestFirst(log).map((e) => e.id)).toEqual(["d", "b", "a", "c"]);
    expect(totalsFor(log, "2026")).toEqual({ entries: 3, uses: 2, hours: 3.5, cost: 4250 });
    expect(totalsFor(log, "2024")).toEqual({ entries: 0, uses: 0, hours: 0, cost: 0 });
  });

  it("sums an item up for the list: its latest entry and how many", () => {
    const item = {
      id: "x",
      name: "DR mower",
      log: [entry("a", "2026-05-01"), entry("b", "2026-07-30")],
    } as EquipmentItem;
    const summary = summaryOf(item);
    expect(summary.latest?.id).toBe("b");
    expect(summary.entries).toBe(2);
    expect("log" in summary).toBe(false);
  });
});
