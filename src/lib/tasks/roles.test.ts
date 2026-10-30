import { describe, expect, it } from "vitest";
import {
  assigneePhrase,
  findRole,
  holderAtCompletion,
  isUnassigned,
  roleHolders,
  roleLabel,
  rolesOf,
  sameAssignee,
  taskHolders,
} from "./roles";

/** Tasks given to roles: a seat position in a circle, whoever holds it now. */

const seat = (personId: string | null, position: string | null, name?: string) => ({
  personId,
  position,
  termEnds: null,
  name: name ?? null,
});
const circles = [
  { id: "community", name: "Community", seats: [] },
  {
    id: "facilities",
    name: "Facilities",
    seats: [
      seat("p-cara", "Trash master", "Cara Cedar"),
      seat("p-dev", "Member", "Dev Dogwood"),
      seat("p-eve", "Treasurer", "Eve Elm"),
      seat("p-finn", "trash Master"),
    ],
  },
  { id: "lcc", name: "Land Care Circle", seats: [seat("p-ada", "Op leader", "Ada Ash")] },
];
const names: Record<string, string> = { "p-finn": "Finn Fir" };
const nameOf = (personId: string) => names[personId] ?? null;
const trash = { circleId: "facilities", position: "Trash Master" };

describe("roles", () => {
  it("are a circle's seat positions, once each, leaving out plain membership", () => {
    expect(rolesOf(circles[1])).toEqual(["Trash master", "Treasurer"]);
    expect(rolesOf(circles[0])).toEqual([]);
  });

  it("are found by name whatever the case, as the circle names them now", () => {
    expect(findRole(circles, { circleId: "facilities", position: "TRASH MASTER" })).toEqual({
      circleId: "facilities",
      position: "Trash master",
    });
    expect(findRole(circles, { circleId: "facilities", position: "Compost queen" })).toBeNull();
    expect(findRole(circles, { circleId: "gone", position: "Treasurer" })).toBeNull();
  });

  it("are held by everyone in a seat with that position (named from the directory first)", () => {
    expect(roleHolders(circles, trash, nameOf)).toEqual([
      { personId: "p-cara", name: "Cara Cedar" },
      { personId: "p-finn", name: "Finn Fir" },
    ]);
    expect(roleHolders(circles, { circleId: "lcc", position: "Treasurer" })).toEqual([]);
  });

  it("make an open task whoever holds the role; a done one whoever held it then", () => {
    const open = { status: "todo" as const, ownerId: null, ownerName: null, ownerRole: trash };
    expect(taskHolders(open, circles, nameOf).map((holder) => holder.personId)).toEqual([
      "p-cara",
      "p-finn",
    ]);
    const done = { ...open, status: "done" as const, ownerId: "p-cara", ownerName: "Cara Cedar" };
    expect(taskHolders(done, circles)).toEqual([{ personId: "p-cara", name: "Cara Cedar" }]);
    const person = { status: "todo" as const, ownerId: "p-ada", ownerName: "Ada Ash" };
    expect(taskHolders(person, circles)).toEqual([{ personId: "p-ada", name: "Ada Ash" }]);
    expect(isUnassigned(open)).toBe(false);
    expect(isUnassigned({ ownerId: null, ownerRole: null })).toBe(true);
  });

  it("keep whoever marked a role's task done if they hold it, else its first holder", () => {
    const holders = roleHolders(circles, trash, nameOf);
    expect(holderAtCompletion(holders, "p-finn")?.name).toBe("Finn Fir");
    expect(holderAtCompletion(holders, "p-ada")?.name).toBe("Cara Cedar");
    expect(holderAtCompletion([], "p-ada")).toBeNull();
  });

  it("name another circle's role with its circle", () => {
    expect(roleLabel(trash, circles, "facilities")).toBe("Trash Master");
    expect(roleLabel(trash, circles, "lcc")).toBe("Trash Master (Facilities)");
  });
});

describe("groups", () => {
  const facilities = { circleId: "facilities", position: null };
  it("are everyone in a circle, named by the circle; never Community", () => {
    expect(roleHolders(circles, facilities, nameOf).map((holder) => holder.personId)).toEqual([
      "p-cara",
      "p-dev",
      "p-eve",
      "p-finn",
    ]);
    expect(findRole(circles, facilities)).toEqual(facilities);
    expect(findRole(circles, { circleId: "community", position: null })).toBeNull();
    expect(roleLabel(facilities, circles, "facilities")).toBe("Facilities");
    expect(assigneePhrase(facilities, "Facilities")).toBe("Facilities");
    expect(assigneePhrase(trash, "Trash Master")).toBe("the Trash Master");
  });

  it("are told apart from roles", () => {
    expect(sameAssignee(facilities, { circleId: "facilities", position: null })).toBe(true);
    expect(sameAssignee(facilities, trash)).toBe(false);
    expect(sameAssignee(trash, { circleId: "facilities", position: "TRASH MASTER" })).toBe(true);
    expect(sameAssignee(trash, null)).toBe(false);
  });
});
