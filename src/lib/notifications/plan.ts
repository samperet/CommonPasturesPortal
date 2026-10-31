import { chooseRecipients, type EmailSettings } from "@/lib/email/shared";
import { DEFAULT_PREFERENCES, type Preferences, type Topic } from "@/lib/push/topics";
import type { AppOutcome, EmailOutcome } from "./shared";

/**
 * Who a notification is for, and how each of them gets it — pure, so the
 * same rules send it (`notify()`), record it, and answer "who would get
 * this?" before anything is sent. The audience is everyone in the
 * directory, or only some (`onlyUserIds`: those accounts' residents;
 * `onlyPersonIds`: these residents; both: those in each), never its author.
 * By app, it goes to their devices if they've signed in, kept the topic on
 * (or `ignorePreferences`) and have a device with notifications on. By
 * email, the email rules decide (`chooseRecipients`: an address, chosen,
 * one per address, test mode). An account with no one in the directory
 * gets it by app only (`user:<id>`).
 */

export interface PlanInput<D extends { userId: string }> {
  topic: Topic;
  exceptUserId: string | null;
  onlyUserIds?: string[];
  onlyPersonIds?: string[];
  ignorePreferences?: boolean;
  /** Whether this notification is emailed at all (not for app-only topics, tests, or without email). */
  emailed: boolean;
  people: { id: string; displayName: string; email: string | null }[];
  users: { id: string; personId?: string | null; name: string }[];
  /** Each account's saved app choices (only what they changed). */
  appPreferences: Record<string, Partial<Preferences> | undefined>;
  /** Each resident's saved email choices (only what they changed). */
  emailPreferences: Record<string, Partial<Preferences> | undefined>;
  devices: D[];
  emailSettings: Pick<EmailSettings, "testMode" | "allowed">;
}

export interface Planned<D> {
  /** A directory person id, or `user:<id>`. */
  key: string;
  name: string;
  app: AppOutcome | "send";
  /** The devices to send to, when `app` is "send". */
  devices: D[];
  /** Null when it isn't emailed at all. */
  email: EmailOutcome | "send" | null;
  /** The address, when `email` is "send". */
  address?: string;
}

export function planDelivery<D extends { userId: string }>(input: PlanInput<D>): Planned<D>[] {
  const { topic, exceptUserId, users, devices } = input;
  const personOf = new Map(users.map((user) => [user.id, user.personId ?? null]));
  const authorPerson = exceptUserId ? personOf.get(exceptUserId) ?? null : null;
  const onlyUsers = input.onlyUserIds ? new Set(input.onlyUserIds) : null;
  const fromAccounts = input.onlyUserIds
    ? new Set(input.onlyUserIds.map((id) => personOf.get(id)).filter((id): id is string => !!id))
    : null;
  const onlyPeople = input.onlyPersonIds ? new Set(input.onlyPersonIds) : null;
  const inAudience = (personId: string) =>
    personId !== authorPerson &&
    (!fromAccounts || fromAccounts.has(personId)) &&
    (!onlyPeople || onlyPeople.has(personId));
  const accountIn = (id: string) => id !== exceptUserId && (!onlyUsers || onlyUsers.has(id));
  const wants = (userId: string) =>
    !!input.ignorePreferences || { ...DEFAULT_PREFERENCES, ...input.appPreferences[userId] }[topic];

  const byApp = (accounts: { id: string }[]): Pick<Planned<D>, "app" | "devices"> => {
    if (!accounts.length) return { app: "no-account", devices: [] };
    const wanting = new Set(accounts.filter((account) => wants(account.id)).map((a) => a.id));
    if (!wanting.size) return { app: "off", devices: [] };
    const theirs = devices.filter((device) => wanting.has(device.userId));
    return theirs.length ? { app: "send", devices: theirs } : { app: "no-device", devices: [] };
  };

  const email = input.emailed
    ? chooseRecipients({
        people: input.people,
        topic,
        preferences: input.emailPreferences,
        onlyPersonIds:
          fromAccounts && onlyPeople
            ? new Set(Array.from(onlyPeople).filter((id) => fromAccounts.has(id)))
            : fromAccounts ?? onlyPeople,
        exceptPersonId: authorPerson,
        settings: input.emailSettings,
      })
    : null;
  const addressOf = new Map(email?.to.map((entry) => [entry.personId, entry.email]) ?? []);

  const planned: Planned<D>[] = [];
  const directory = new Set(input.people.map((person) => person.id));
  for (const person of input.people) {
    if (!inAudience(person.id)) continue;
    const accounts = users.filter((user) => user.personId === person.id && accountIn(user.id));
    const choice = email?.outcomes[person.id];
    planned.push({
      key: person.id,
      name: person.displayName,
      ...byApp(accounts),
      email: email ? choice ?? "no-address" : null,
      ...(choice === "send" ? { address: addressOf.get(person.id) } : {}),
    });
  }
  // Accounts with no one in the directory: by app only (not when it's for chosen residents).
  if (!onlyPeople)
    for (const user of users) {
      if ((user.personId && directory.has(user.personId)) || !accountIn(user.id)) continue;
      planned.push({
        key: `user:${user.id}`,
        name: user.name,
        ...byApp([user]),
        email: email ? "no-address" : null,
      });
    }
  return planned;
}
