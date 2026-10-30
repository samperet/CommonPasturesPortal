import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectoryDocument } from "./types";

/** Who manages the directory: admins, and the Board seat whose role is "Secretary" itself. */

vi.mock("@/lib/storage", () => ({}));

const { canManageDirectory } = await import("./access");
const { setAddedAdmins } = await import("@/lib/auth/admins");

const seat = (personId: string, position: string) => ({
  personId,
  name: null,
  position,
  termEnds: null,
});
const directory = {
  circles: [
    {
      id: "board",
      name: "Board",
      seats: [
        seat("000000000001", " secretary "),
        seat("000000000002", "Assistant secretary"),
        seat("000000000003", "Not the secretary"),
      ],
    },
    { id: "lcc", name: "Land Care Circle", seats: [seat("000000000004", "Secretary")] },
  ],
} as unknown as DirectoryDocument;

beforeEach(() => {
  setAddedAdmins([]);
  process.env.ADMIN_PERSON_IDS = "000000000005";
});

describe("canManageDirectory", () => {
  it("is the Board Secretary and admins", () => {
    expect(canManageDirectory({ personId: "000000000001" }, directory)).toBe(true);
    expect(canManageDirectory({ personId: "000000000005" }, directory)).toBe(true);
  });

  it("isn't a Board role that only mentions the Secretary, or another circle's secretary", () => {
    for (const personId of ["000000000002", "000000000003", "000000000004", "000000000006"])
      expect(canManageDirectory({ personId }, directory)).toBe(false);
    expect(canManageDirectory({ personId: null }, directory)).toBe(false);
  });
});
