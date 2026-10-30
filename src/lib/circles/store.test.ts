import { describe, expect, it } from "vitest";
import { circleUpdateSchema, modulesSchema } from "./store";

const finances = { id: "finances", type: "finances", size: "full" };
const messages = (value: unknown) => {
  const parsed = modulesSchema.safeParse(value);
  return parsed.success ? [] : parsed.error.errors.map((error) => error.message);
};

describe("modulesSchema", () => {
  it("keeps who can see a Finances module, and leaves it unset by default", () => {
    expect(modulesSchema.parse([{ ...finances, finances: { view: "members" } }])).toEqual([
      { ...finances, finances: { view: "members" } },
    ]);
    expect(modulesSchema.parse([finances])).toEqual([finances]);
  });

  it("refuses that setting anywhere else, or a setting it doesn't know", () => {
    expect(
      messages([{ id: "log", type: "log", size: "full", finances: { view: "members" } }])
    ).toEqual(["Only a Finances module says who can see it"]);
    expect(messages([{ ...finances, finances: { view: "anyone" } }])).toHaveLength(1);
  });

  it("allows one Finances module on a page, and one Alert", () => {
    const once =
      "Members, the duty schedule, the forum, the log, finances, documents, sub groups, and the alert button can each appear once";
    expect(messages([finances, { ...finances, id: "finances-2" }])).toEqual([once]);
    const alert = { id: "alert", type: "alert", size: "full" };
    expect(modulesSchema.parse([alert])).toEqual([alert]);
    expect(messages([alert, { ...alert, id: "alert-2" }])).toEqual([once]);
  });

  it("allows several Tasks modules, each with its own view", () => {
    const tasks = {
      id: "tasks",
      type: "tasks",
      size: "full",
      tasks: { add: "members", view: { show: "open", whose: "everyone", due: "any" } },
    };
    const overdue = {
      ...tasks,
      id: "tasks-2",
      title: "Overdue",
      tasks: { add: "members", view: { show: "open", whose: "unassigned", due: "overdue" } },
    };
    expect(modulesSchema.parse([tasks, overdue])).toHaveLength(2);
    expect(
      messages([
        { ...tasks, tasks: { add: "members", view: { ...tasks.tasks.view, whose: "person" } } },
      ])
    ).toEqual(["Choose whose tasks it shows"]);
  });

  it("lets a Filtered Documents module choose its order, the chosen order only for chosen pages", () => {
    const info = { id: "info", type: "information", size: "full" };
    const circle = { filter: { kind: "circle", circleId: "lcc" }, view: "summary" };
    expect(modulesSchema.parse([{ ...info, info: { ...circle, sort: "updated" } }])).toEqual([
      { ...info, info: { ...circle, sort: "updated" } },
    ]);
    expect(messages([{ ...info, info: { ...circle, sort: "chosen" } }])).toEqual([
      "Only chosen pages keep their chosen order",
    ]);
    expect(messages([{ ...info, info: { ...circle, sort: "random" } }])).toHaveLength(1);
  });
});

describe("task buttons and parents", () => {
  const button = {
    id: "taskbutton-a1",
    type: "taskbutton",
    size: "full",
    taskButton: {
      label: "Report a broken light",
      title: "Broken light",
      assignee: { circleId: "facilities", position: "Trash Master" },
    },
  };
  it("a Task button says what it makes and for whom; several can be on a page", () => {
    expect(modulesSchema.safeParse([button, { ...button, id: "taskbutton-b2" }]).success).toBe(
      true
    );
    expect(modulesSchema.safeParse([{ ...button, taskButton: undefined }]).success).toBe(false);
    const group = {
      ...button,
      taskButton: { ...button.taskButton, assignee: { circleId: "lcc", position: null } },
    };
    expect(modulesSchema.safeParse([group]).success).toBe(true);
    expect(modulesSchema.safeParse([{ ...button, type: "text" }]).success).toBe(false);
  });

  it("a circle's parent can't be changed by an update", () => {
    const parsed = circleUpdateSchema.safeParse({ name: "Hedges", parentId: "board" });
    expect(parsed.success && "parentId" in parsed.data).toBe(false);
  });
});
