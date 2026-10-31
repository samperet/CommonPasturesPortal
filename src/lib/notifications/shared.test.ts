import { describe, expect, it } from "vitest";
import { changedTopics, describeChange, outcomeFor, type DeliveryRecord } from "./shared";

const record: DeliveryRecord = {
  id: "1",
  at: "2026-10-30T12:00:00.000Z",
  topic: "appreciations",
  title: "Ada appreciates Ben",
  url: "/appreciations",
  by: { personId: "ada", name: "Ada Ash" },
  narrowed: false,
  testMode: true,
  app: { sent: ["ben"], "no-device": ["cara"] },
  email: { held: ["ben"], off: ["cara"] },
};

describe("the delivery log's helpers", () => {
  it("finds how it went to one person", () => {
    expect(outcomeFor(record, "ben")).toEqual({ app: "sent", email: "held" });
    expect(outcomeFor(record, "eve")).toEqual({ app: undefined, email: undefined });
  });

  it("keeps only the topics that changed", () => {
    expect(
      changedTopics({ photos: true, library: true }, { photos: false, library: true })
    ).toEqual({
      photos: false,
    });
  });

  it("says what changed, and how", () => {
    expect(
      describeChange({
        at: "",
        who: "ada",
        channel: "email",
        topics: { appreciations: true },
        via: "settings",
      })
    ).toBe("Chose emails about new appreciations in their settings");
    expect(
      describeChange({
        at: "",
        who: "ada",
        channel: "email",
        topics: { all: false },
        via: "one-click",
      })
    ).toBe("Stopped all emails with their mail app's unsubscribe");
    expect(
      describeChange({
        at: "",
        who: "ada",
        channel: "app",
        topics: { photos: false },
        via: "settings",
      })
    ).toBe("Turned off app notifications for new photos in their settings");
    expect(
      describeChange({
        at: "",
        who: "ada",
        channel: "device",
        device: "expired",
        via: "push service",
      })
    ).toMatch(/dropped it/);
  });
});
