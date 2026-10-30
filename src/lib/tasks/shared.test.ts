import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_VIEW,
  describeView,
  inView,
  nextDue,
  nextOccurrence,
  type TaskView,
} from "./shared";

describe("repeating tasks", () => {
  it("steps a week, a month, three months or a year", () => {
    expect(nextDue("2026-10-12", "weekly")).toBe("2026-10-19");
    expect(nextDue("2026-12-29", "weekly")).toBe("2027-01-05");
    expect(nextDue("2026-10-12", "monthly")).toBe("2026-11-12");
    expect(nextDue("2026-12-15", "monthly")).toBe("2027-01-15");
    expect(nextDue("2026-11-30", "quarterly")).toBe("2027-02-28");
    expect(nextDue("2026-10-12", "yearly")).toBe("2027-10-12");
  });

  it("keeps to the month's last day when the next month is shorter", () => {
    expect(nextDue("2027-01-31", "monthly")).toBe("2027-02-28");
    expect(nextDue("2028-01-31", "monthly")).toBe("2028-02-29");
    expect(nextDue("2028-02-29", "yearly")).toBe("2029-02-28");
  });

  it("comes due after this one was due, or after today, and never already past", () => {
    expect(nextOccurrence("2026-10-01", "monthly", "2026-10-12")).toBe("2026-11-01");
    expect(nextOccurrence(null, "weekly", "2026-10-12")).toBe("2026-10-19");
    // Done late: the next one still ahead, not the ones missed.
    expect(nextOccurrence("2026-06-01", "monthly", "2026-10-12")).toBe("2026-11-01");
    expect(nextOccurrence("2026-10-05", "weekly", "2026-10-12")).toBe("2026-10-12");
  });
});

describe("task views", () => {
  const today = "2026-10-12";
  const task = (over: Partial<Parameters<typeof inView>[0]> = {}) => ({
    status: "todo" as const,
    ownerId: null as string | null,
    dueDate: null as string | null,
    priority: "normal" as const,
    ...over,
  });
  const view = (over: Partial<TaskView> = {}): TaskView => ({ ...DEFAULT_TASK_VIEW, ...over });

  it("shows open, done or all", () => {
    expect(inView(task(), view(), null, today)).toBe(true);
    expect(inView(task({ status: "done" }), view(), null, today)).toBe(false);
    expect(inView(task({ status: "done" }), view({ show: "done" }), null, today)).toBe(true);
    expect(inView(task(), view({ show: "done" }), null, today)).toBe(false);
    expect(inView(task({ status: "done" }), view({ show: "all" }), null, today)).toBe(true);
  });

  it("shows whose: the reader's, nobody's, or one person's", () => {
    expect(inView(task({ ownerId: "p1" }), view({ whose: "mine" }), "p1", today)).toBe(true);
    expect(inView(task({ ownerId: "p2" }), view({ whose: "mine" }), "p1", today)).toBe(false);
    expect(inView(task(), view({ whose: "mine" }), null, today)).toBe(false);
    expect(inView(task(), view({ whose: "unassigned" }), "p1", today)).toBe(true);
    expect(inView(task({ ownerId: "p1" }), view({ whose: "unassigned" }), "p1", today)).toBe(false);
    expect(
      inView(task({ ownerId: "p3" }), view({ whose: "person", personId: "p3" }), null, today)
    ).toBe(true);
  });

  it("shows overdue, or due within a week or a month (overdue included)", () => {
    expect(inView(task({ dueDate: "2026-10-11" }), view({ due: "overdue" }), null, today)).toBe(
      true
    );
    expect(inView(task({ dueDate: "2026-10-12" }), view({ due: "overdue" }), null, today)).toBe(
      false
    );
    expect(inView(task(), view({ due: "overdue" }), null, today)).toBe(false);
    expect(inView(task({ dueDate: "2026-10-19" }), view({ due: "week" }), null, today)).toBe(true);
    expect(inView(task({ dueDate: "2026-10-20" }), view({ due: "week" }), null, today)).toBe(false);
    expect(inView(task({ dueDate: "2026-10-01" }), view({ due: "week" }), null, today)).toBe(true);
    expect(inView(task({ dueDate: "2026-11-11" }), view({ due: "month" }), null, today)).toBe(true);
    expect(inView(task({ priority: "normal" }), view({ high: true }), null, today)).toBe(false);
  });

  it("says what it shows", () => {
    expect(describeView(DEFAULT_TASK_VIEW)).toBe("Open tasks");
    expect(describeView(view({ due: "overdue", whose: "unassigned" }))).toBe(
      "Open overdue tasks, nobody's yet"
    );
    expect(
      describeView(view({ show: "all", due: "week", whose: "person", high: true }), "Ada Ash")
    ).toBe("All tasks, due within 7 days, Ada Ash's, high priority");
  });
});

describe("views and roles", () => {
  const today = "2026-10-12";
  const roleTask = {
    status: "todo" as const,
    ownerId: null,
    dueDate: null,
    priority: "normal" as const,
    ownerRole: { circleId: "facilities", position: "Trash Master" },
    repeat: "yearly" as const,
    holders: [{ personId: "p-cara", name: "Cara Cedar" }],
  };
  it("count a role's task as each holder's own, and not as nobody's", () => {
    const view: TaskView = { ...DEFAULT_TASK_VIEW, whose: "mine" };
    expect(inView(roleTask, view, "p-cara", today)).toBe(true);
    expect(inView(roleTask, view, "p-ada", today)).toBe(false);
    expect(inView(roleTask, { ...DEFAULT_TASK_VIEW, whose: "unassigned" }, null, today)).toBe(
      false
    );
    expect(
      inView(roleTask, { ...DEFAULT_TASK_VIEW, whose: "person", personId: "p-cara" }, null, today)
    ).toBe(true);
  });

  it("can keep to repeating tasks", () => {
    const view: TaskView = { ...DEFAULT_TASK_VIEW, repeating: true };
    expect(inView(roleTask, view, null, today)).toBe(true);
    expect(inView({ ...roleTask, repeat: null }, view, null, today)).toBe(false);
    expect(describeView(view)).toBe("Open tasks, repeating");
  });
});
