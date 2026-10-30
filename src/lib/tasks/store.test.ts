import { beforeEach, describe, expect, it, vi } from "vitest";

// The tasks' documents, in memory.
const docs = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => docs.get(key) ?? null,
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown }
  ) => {
    const next = change(docs.get(key) ?? null);
    if ("value" in next) docs.set(key, next.value);
    return next.result;
  },
  deleteJson: async (key: string) => void docs.delete(key),
  enqueue: (_key: string, task: () => unknown) => task(),
}));

const { createTask, listTasks, taskInputSchema, updateTask } = await import("./store");

/** A role's yearly task follows the role: each year's is whoever holds it then. */

const sam = { userId: "u-sam", personId: "p-sam", name: "Sam Peret" };
const trash = { circleId: "facilities", position: "Trash Master" };
const cara = { personId: "p-cara", name: "Cara Cedar" };
const yes = () => true;

beforeEach(() => docs.clear());

describe("a task given to a role", () => {
  it("is the role's, not a person's, and says so in its log", async () => {
    const made = await createTask(
      "facilities",
      sam,
      taskInputSchema.parse({
        title: "Refuse education",
        ownerRole: trash,
        repeat: "yearly",
        dueDate: "2026-11-01",
      }),
      null,
      "Trash Master"
    );
    expect(made.ok && made.task?.ownerRole).toEqual(trash);
    expect(made.ok && made.task?.ownerId).toBeNull();
    expect(made.ok && made.task?.activity[0].text).toBe("added this task, for the Trash Master");
  });

  it("keeps who held the role when it's done, and the next one is the role's again", async () => {
    await createTask(
      "facilities",
      sam,
      taskInputSchema.parse({
        title: "Refuse education",
        ownerRole: trash,
        repeat: "yearly",
        dueDate: "2026-11-01",
      }),
      null,
      "Trash Master"
    );
    const done = await updateTask(
      "facilities",
      1,
      { name: "Cara Cedar" },
      { status: "done" },
      { ownerName: null, completedBy: () => cara },
      yes
    );
    expect(done.ok && done.task?.ownerId).toBe("p-cara");
    expect(done.ok && done.task?.ownerName).toBe("Cara Cedar");
    expect(done.ok && done.task?.ownerRole).toEqual(trash);
    const next = done.ok ? done.next : null;
    expect(next?.ownerRole).toEqual(trash);
    expect(next?.ownerId).toBeNull();
    expect(next?.dueDate).toBe("2027-11-01");
    // Opened again, the done one is the role's again.
    const reopened = await updateTask(
      "facilities",
      1,
      { name: "Sam Peret" },
      { status: "todo" },
      { ownerName: null },
      yes
    );
    expect(reopened.ok && reopened.task?.ownerId).toBeNull();
    expect(reopened.ok && reopened.task?.ownerRole).toEqual(trash);
  });

  it("is a person's or a role's, never both", async () => {
    await createTask("facilities", sam, taskInputSchema.parse({ title: "Sort the bins" }), null);
    const toRole = await updateTask(
      "facilities",
      1,
      { name: "Sam Peret" },
      { ownerRole: trash },
      { ownerName: null, roleLabel: "Trash Master" },
      yes
    );
    expect(toRole.ok && toRole.task?.ownerRole).toEqual(trash);
    expect(toRole.ok && toRole.task?.activity.at(-1)?.text).toBe("gave this to the Trash Master");
    const toPerson = await updateTask(
      "facilities",
      1,
      { name: "Sam Peret" },
      { ownerId: "p-cara" },
      { ownerName: "Cara Cedar" },
      yes
    );
    expect(toPerson.ok && toPerson.task?.ownerId).toBe("p-cara");
    expect(toPerson.ok && toPerson.task?.ownerRole).toBeNull();
    const nobody = await updateTask(
      "facilities",
      1,
      { name: "Sam Peret" },
      { ownerRole: null },
      { ownerName: null },
      yes
    );
    // Already a person's: clearing a role it hasn't got changes nothing.
    expect(nobody.ok && nobody.task?.ownerId).toBe("p-cara");
    expect(await listTasks("facilities")).toHaveLength(1);
  });
});
