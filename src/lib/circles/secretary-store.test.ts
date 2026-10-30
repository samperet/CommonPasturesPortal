import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Circle } from "./types";

/**
 * Giving a Board seat the Secretary role, or taking it away, as members are
 * added and changed: only admins and the Secretary may.
 */

const docs = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => structuredClone(docs.get(key) ?? null),
  readOrSeedJson: async (
    key: string,
    normalize: (raw: unknown) => unknown,
    seed: () => unknown
  ) => {
    if (!docs.has(key)) docs.set(key, seed());
    return normalize(structuredClone(docs.get(key)));
  },
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(structuredClone(docs.get(key) ?? null));
    if ("value" in next) docs.set(key, next.value);
    return next.result;
  },
}));

const store = await import("./store");

const ada = { personId: "000000000001", name: "Ada Ash" }; // the Secretary
const ben = { personId: "000000000002", name: "Ben Birch" }; // on the Board
const cara = { personId: "000000000003", name: "Cara Cedar" }; // not yet
const imported: Circle[] = [
  {
    id: "board",
    name: "Board",
    seats: [
      { ...ada, position: "Secretary", termEnds: null },
      { ...ben, position: "Treasurer", termEnds: null },
    ],
  },
  { id: "lcc", name: "Land Care Circle", seats: [{ ...ben, position: "Member", termEnds: null }] },
];
const as = (person: { personId: string }, admin = false) => ({ personId: person.personId, admin });

/** A seat's id in the store, by circle and person. */
async function seatOf(circleId: string, person: { personId: string }) {
  const circles = await store.readCircles(imported);
  const circle = circles.find((entry) => entry.id === circleId);
  return circle?.seats.find((seat) => seat.personId === person.personId)?.id as string;
}
const roleOf = async (circleId: string, person: { personId: string }) =>
  (await store.readCircles(imported))
    .find((circle) => circle.id === circleId)
    ?.seats.find((seat) => seat.personId === person.personId)?.position;

beforeEach(() => docs.clear());

describe("the Board's Secretary role", () => {
  it("can't be taken by a Board member who isn't the Secretary or an admin", async () => {
    const result = await store.updateMember(
      imported,
      "board",
      await seatOf("board", ben),
      { position: "Secretary", termEnds: null },
      as(ben)
    );
    expect(result).toEqual({ ok: false, reason: "secretary" });
    expect(await roleOf("board", ben)).toBe("Treasurer");
  });

  it("can't be given in another spelling, or to someone added to the Board", async () => {
    const memberId = await seatOf("board", ben);
    for (const position of ["secretary", " SECRETARY "]) {
      const result = await store.updateMember(
        imported,
        "board",
        memberId,
        { position, termEnds: null },
        as(ben)
      );
      expect(result).toEqual({ ok: false, reason: "secretary" });
    }
    const added = await store.addMember(
      imported,
      "board",
      { ...cara, position: "Secretary", termEnds: null },
      as(ben)
    );
    expect(added).toEqual({ ok: false, reason: "secretary" });
  });

  it("can't be taken away from the Secretary by the rest of the Board", async () => {
    const result = await store.updateMember(
      imported,
      "board",
      await seatOf("board", ada),
      { position: "Member", termEnds: null },
      as(ben)
    );
    expect(result).toEqual({ ok: false, reason: "secretary" });
    expect(await roleOf("board", ada)).toBe("Secretary");
  });

  it("leaves the Board free to change the Secretary's term, and other roles", async () => {
    const term = await store.updateMember(
      imported,
      "board",
      await seatOf("board", ada),
      { position: "Secretary", termEnds: "2027" },
      as(ben)
    );
    expect(term.ok).toBe(true);
    const assistant = await store.addMember(
      imported,
      "board",
      { ...cara, position: "Assistant secretary", termEnds: null },
      as(ben)
    );
    expect(assistant.ok).toBe(true);
    // Another circle's Secretary isn't the Board's.
    const lcc = await store.updateMember(
      imported,
      "lcc",
      await seatOf("lcc", ben),
      { position: "Secretary", termEnds: null },
      as(ben)
    );
    expect(lcc.ok).toBe(true);
  });

  it("can be handed on by the Secretary", async () => {
    const given = await store.updateMember(
      imported,
      "board",
      await seatOf("board", ben),
      { position: "Secretary", termEnds: null },
      as(ada)
    );
    expect(given.ok).toBe(true);
    const stepped = await store.updateMember(
      imported,
      "board",
      await seatOf("board", ada),
      { position: "Member", termEnds: null },
      as(ada)
    );
    expect(stepped.ok).toBe(true);
    expect(await roleOf("board", ben)).toBe("Secretary");
    expect(await roleOf("board", ada)).toBe("Member");
  });

  it("can be given and taken away by an admin", async () => {
    const added = await store.addMember(
      imported,
      "board",
      { ...cara, position: "Secretary", termEnds: null },
      as(cara, true)
    );
    expect(added.ok).toBe(true);
    const removed = await store.updateMember(
      imported,
      "board",
      await seatOf("board", ada),
      { position: null, termEnds: null },
      as(cara, true)
    );
    expect(removed.ok).toBe(true);
    expect(await roleOf("board", ada)).toBeNull();
  });
});
