import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `notify()` end to end, with storage and the outside world stubbed: who's
 * emailed (never for a push-only topic, one marked `skipEmail`, or a test
 * push), how each device's push went, devices that are gone, and what the
 * delivery log keeps.
 */

const sent = vi.hoisted(() => ({
  emails: [] as { title: string; to: string[] }[],
  pushes: [] as string[],
  removed: [] as string[],
  records: [] as Record<string, unknown>[],
  changes: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/email/send", () => ({
  emailConfigured: () => true,
  emailNotification: async (message: { title: string }, to: { personId: string }[]) => {
    sent.emails.push({ title: message.title, to: to.map((entry) => entry.personId) });
    return { failed: [], overQuota: [] };
  },
}));
vi.mock("@/lib/email/preferences", () => ({ allEmailPreferences: async () => ({}) }));
vi.mock("@/lib/email/settings", () => ({
  readEmailSettings: async () => ({ testMode: false, allowed: [] }),
}));
vi.mock("@/lib/directory/store", () => ({
  readDirectory: async () => ({
    people: [
      { id: "ada", displayName: "Ada Ash", email: "ada@example.org" },
      { id: "ben", displayName: "Ben Birch", email: "ben@example.org" },
    ],
  }),
}));
vi.mock("@/lib/auth/users", () => ({
  listUsers: async () => [
    { id: "u-ada", personId: "ada", name: "Ada Ash" },
    { id: "u-ben", personId: "ben", name: "Ben Birch" },
  ],
}));
vi.mock("./store", () => ({
  listSubscriptions: async () => [
    { userId: "u-ada", endpoint: "ada-phone", keys: {} },
    { userId: "u-ben", endpoint: "ben-gone", keys: {} },
  ],
  allPreferences: async () => ({}),
  removeSubscriptions: async (endpoints: string[]) => void sent.removed.push(...endpoints),
}));
vi.mock("@/lib/notifications/store", () => ({
  recordDelivery: async (record: Record<string, unknown>) => void sent.records.push(record),
  recordChange: async (change: Record<string, unknown>) => void sent.changes.push(change),
}));
vi.mock("./vapid", () => ({ vapidKeys: async () => ({}), vapidSubject: () => "" }));
vi.mock("web-push", () => ({
  default: {
    sendNotification: async ({ endpoint }: { endpoint: string }) => {
      sent.pushes.push(endpoint);
      if (endpoint === "ben-gone") throw { statusCode: 410 };
    },
  },
}));

const { notify } = await import("./notify");
const base = { body: "…", url: "/", exceptUserId: null };

beforeEach(() => {
  for (const list of Object.values(sent)) list.splice(0);
});

describe("notify", () => {
  it("emails a topic people can choose by email, and logs how it went for each", async () => {
    await notify({ ...base, topic: "discussions", title: "A discussion" });
    expect(sent.emails).toEqual([{ title: "A discussion", to: ["ada", "ben"] }]);
    expect(sent.records[0]).toMatchObject({
      topic: "discussions",
      title: "A discussion",
      narrowed: false,
      app: { sent: ["ada"], failed: ["ben"] },
      email: { sent: ["ada", "ben"] },
    });
  });

  it("forgets a device whose push service says it's gone, and notes it", async () => {
    await notify({ ...base, topic: "photos", title: "New photos" });
    expect(sent.removed).toEqual(["ben-gone"]);
    expect(sent.changes).toEqual([
      { who: "ben", channel: "device", device: "expired", via: "push service" },
    ]);
  });

  it("never emails a push-only topic, one marked skipEmail, or a test push", async () => {
    await notify({ ...base, topic: "groups", title: "A circle forum message" });
    await notify({ ...base, topic: "discussions", title: "Skipped", skipEmail: true });
    await notify({ ...base, topic: "discussions", title: "A test", ignorePreferences: true });
    expect(sent.emails.flatMap((email) => email.to)).toEqual([]);
    expect(sent.records.map((record) => record.noEmail)).toEqual([
      "app-only",
      "app-only",
      "app-only",
    ]);
  });

  it("leaves the author out, and keeps neither a private message's sender nor its words", async () => {
    await notify({
      ...base,
      topic: "messages",
      title: "Ada: are you around?",
      exceptUserId: "u-ada",
      onlyUserIds: ["u-ben"],
    });
    expect(sent.pushes).toEqual(["ben-gone"]);
    expect(sent.records[0]).toMatchObject({
      title: "A private message",
      url: null,
      by: null,
      narrowed: true,
    });
  });
});
