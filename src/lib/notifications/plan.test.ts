import { describe, expect, it } from "vitest";
import { planDelivery, type PlanInput, type Planned } from "./plan";

const people = [
  { id: "ada", displayName: "Ada Ash", email: "ada@example.org" },
  { id: "ben", displayName: "Ben Birch", email: "ben@example.org" },
  { id: "cara", displayName: "Cara Cedar", email: "cara@example.org" },
  { id: "dev", displayName: "Dev Dogwood", email: "cara@example.org" }, // shares Cara's address
  { id: "eve", displayName: "Eve Elm", email: null },
];
const users = [
  { id: "u-ada", personId: "ada", name: "Ada Ash" },
  { id: "u-ben", personId: "ben", name: "Ben Birch" },
  { id: "u-cara", personId: "cara", name: "Cara Cedar" },
  { id: "u-old", personId: null, name: "An old account" },
];
const devices = [
  { userId: "u-ada", endpoint: "ada-phone" },
  { userId: "u-ada", endpoint: "ada-laptop" },
  { userId: "u-cara", endpoint: "cara-phone" },
  { userId: "u-old", endpoint: "old-phone" },
];
const base: PlanInput<(typeof devices)[number]> = {
  topic: "discussions",
  exceptUserId: "u-ben",
  emailed: true,
  people,
  users,
  appPreferences: {},
  emailPreferences: {},
  devices,
  emailSettings: { testMode: false, allowed: [] },
};
const byKey = <D>(plan: Planned<D>[]) =>
  Object.fromEntries(plan.map((entry) => [entry.key, entry]));

describe("planDelivery", () => {
  it("plans everyone but the author, by app and by email, with a reason for each", () => {
    const plan = byKey(planDelivery(base));
    expect(Object.keys(plan)).toEqual(["ada", "cara", "dev", "eve", "user:u-old"]);
    expect(plan.ada.app).toBe("send");
    expect(plan.ada.devices.map((device) => device.endpoint)).toEqual(["ada-phone", "ada-laptop"]);
    expect(plan.ada.email).toBe("send");
    expect(plan.ada.address).toBe("ada@example.org");
    expect(plan.dev.app).toBe("no-account");
    expect(plan.dev.email).toBe("shared-address");
    expect(plan.eve.email).toBe("no-address");
    expect(plan["user:u-old"]).toMatchObject({ app: "send", email: "no-address" });
  });

  it("follows each one's choices: app off, email not chosen, a device-less account", () => {
    const plan = byKey(
      planDelivery({
        ...base,
        topic: "appreciations",
        exceptUserId: null,
        appPreferences: { "u-ada": { appreciations: false } },
        emailPreferences: { cara: { appreciations: true } },
      })
    );
    expect(plan.ada.app).toBe("off");
    expect(plan.ben.app).toBe("no-device");
    expect(plan.ada.email).toBe("off"); // appreciations aren't emailed until chosen
    expect(plan.cara.email).toBe("send");
  });

  it("holds emails back in test mode, except to allowed addresses", () => {
    const plan = byKey(
      planDelivery({ ...base, emailSettings: { testMode: true, allowed: ["cara@example.org"] } })
    );
    expect(plan.ada.email).toBe("held");
    expect(plan.cara.email).toBe("send");
  });

  it("keeps to those it's for: accounts, or residents (who may never have signed in)", () => {
    const accounts = planDelivery({ ...base, onlyUserIds: ["u-ada", "u-old"] });
    expect(accounts.map((entry) => entry.key)).toEqual(["ada", "user:u-old"]);
    const residents = byKey(planDelivery({ ...base, onlyPersonIds: ["dev", "eve"] }));
    expect(Object.keys(residents)).toEqual(["dev", "eve"]);
    expect(residents.dev.email).toBe("send"); // Cara isn't in it, so Dev gets the shared address's
  });

  it("sends a test or a bug report whatever their settings, by app only", () => {
    const plan = byKey(
      planDelivery({
        ...base,
        emailed: false,
        ignorePreferences: true,
        onlyUserIds: ["u-ada"],
        appPreferences: { "u-ada": { discussions: false } },
      })
    );
    expect(plan.ada).toMatchObject({ app: "send", email: null });
  });
});
