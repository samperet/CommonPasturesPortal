import { describe, expect, it } from "vitest";
import { boardSecretaryIds, changesSecretary, isSecretaryRole, maySetSecretary } from "./secretary";

/** The Board Secretary: the whole role "Secretary", given or taken away by admins and the Secretary. */

const ada = "000000000001"; // the Secretary
const ben = "000000000002"; // on the Board
const cara = "000000000003"; // the Board's Assistant secretary

const seat = (personId: string, position: string | null) => ({
  id: `seat-${personId}`,
  personId,
  name: null,
  position,
  termEnds: null,
});
const circles = [
  {
    id: "board",
    seats: [seat(ada, "Secretary"), seat(ben, "Treasurer"), seat(cara, "Assistant secretary")],
  },
  { id: "lcc", seats: [seat(ben, "Secretary")] },
];
const resident = (personId: string | null) => ({ personId, admin: false });

describe("the Secretary role", () => {
  it("is the whole role, in any case, with spaces around it ignored", () => {
    for (const role of ["Secretary", "secretary", "SECRETARY", "  Secretary "])
      expect(isSecretaryRole(role)).toBe(true);
  });

  it("isn't a role that only mentions it", () => {
    const others = [
      "Assistant secretary",
      "Not the secretary",
      "Secretary/Treasurer",
      "Secretary 2",
    ];
    for (const role of [...others, "Secretaries", "", null, undefined])
      expect(isSecretaryRole(role)).toBe(false);
  });
});

describe("boardSecretaryIds", () => {
  it("is who holds the Board's Secretary seat, not an assistant or another circle's secretary", () => {
    expect(boardSecretaryIds(circles)).toEqual([ada]);
  });

  it("is nobody without a Board, or with an empty Secretary seat", () => {
    expect(boardSecretaryIds([])).toEqual([]);
    expect(
      boardSecretaryIds([{ id: "board", seats: [{ ...seat(ada, "Secretary"), personId: null }] }])
    ).toEqual([]);
  });
});

describe("changesSecretary", () => {
  it("is a Board seat becoming the Secretary, or stopping being it", () => {
    expect(changesSecretary("board", "Treasurer", "Secretary")).toBe(true);
    expect(changesSecretary("board", null, "secretary")).toBe(true);
    expect(changesSecretary("board", "Secretary", "Member")).toBe(true);
    expect(changesSecretary("board", "Secretary", null)).toBe(true);
  });

  it("isn't a change of case or spacing, a role that only mentions it, or another circle", () => {
    expect(changesSecretary("board", "Secretary", " secretary")).toBe(false);
    expect(changesSecretary("board", "Member", "Assistant secretary")).toBe(false);
    expect(changesSecretary("board", "Treasurer", "Member")).toBe(false);
    expect(changesSecretary("lcc", "Member", "Secretary")).toBe(false);
  });
});

describe("maySetSecretary", () => {
  it("is admins and the Board Secretary", () => {
    expect(maySetSecretary(circles, resident(ada))).toBe(true);
    expect(maySetSecretary(circles, { personId: ben, admin: true })).toBe(true);
    expect(maySetSecretary(circles, { personId: null, admin: true })).toBe(true);
  });

  it("isn't the rest of the Board, an assistant, or another circle's secretary", () => {
    expect(maySetSecretary(circles, resident(ben))).toBe(false);
    expect(maySetSecretary(circles, resident(cara))).toBe(false);
    expect(maySetSecretary(circles, resident(null))).toBe(false);
  });
});
