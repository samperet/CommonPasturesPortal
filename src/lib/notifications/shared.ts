import { TOPICS, type Topic } from "@/lib/push/topics";

/**
 * Who was told what, and how: the shapes and words of the delivery log
 * (`store.ts`) and the opt-in/opt-out log, safe for the browser. Every
 * notification (`notify()` in `lib/push/notify.ts`) is planned for each
 * resident it's for (`plan.ts`) — by app (push) and by email, each with an
 * outcome and its reason — and recorded as one `DeliveryRecord`. A text
 * message channel would be a third set of outcomes beside these.
 */

export { TOPICS, type Topic };

/** How a notification went to someone by app (push to their devices). */
export const APP_OUTCOMES = {
  sent: "Sent to their device",
  pending: "Sent, not yet confirmed by the device's push service",
  failed: "Their device's push service refused it",
  off: "They turned these off",
  "no-device": "No device has notifications on",
  "no-account": "Hasn't signed in yet",
} as const;
export type AppOutcome = keyof typeof APP_OUTCOMES;

/** How a notification went to someone by email. */
export const EMAIL_OUTCOMES = {
  sent: "Emailed",
  held: "Held back: email test mode",
  "over-quota": "Not sent: the day's free emails were used up",
  failed: "The email services refused it",
  off: "Hasn't chosen these emails",
  "no-address": "No email address in the directory",
  "shared-address": "Shares an address with someone who was emailed",
} as const;
export type EmailOutcome = keyof typeof EMAIL_OUTCOMES;

/** Outcomes that mean it reached them (or is on its way). */
export const REACHED: { app: AppOutcome[]; email: EmailOutcome[] } = {
  app: ["sent", "pending"],
  email: ["sent", "shared-address"],
};

/** Emails sent to one person on purpose, not as a notification — recorded beside them. */
export const DIRECT_EMAILS = {
  "sign-in": "Sign-in link",
  welcome: "Welcome to a new member",
} as const;
export type DirectEmail = keyof typeof DIRECT_EMAILS;

/** Why a notification wasn't emailed to anyone at all. */
export const NO_EMAIL = {
  "app-only": "By app only",
  "not-set-up": "Email isn't set up",
} as const;

/** Who each topic goes to, in words — what `notify()` is called with across the app. */
export const TOPIC_AUDIENCES: Record<Topic, string> = {
  discussions: "Everyone, when a forum discussion starts",
  replies: "Whoever started or replied in the discussion",
  appreciations: "Everyone",
  photos: "Everyone",
  resources: "Everyone, for a new recommendation; its recommender and commenters, for a comment",
  library: "Everyone",
  documents: "Everyone",
  circles:
    "A circle's members, when someone asks to join; the person who asked, when answered; those who add new members, for a join link",
  polls: "Everyone, or a circle's members for a members-only poll",
  proposals:
    "The circle's members (everyone, for Community's) and whoever proposed it; the writer of a version chosen or set aside",
  wiki: "Those who wrote or commented on the page; a version's writer when it's made the page",
  mentions: "Whoever is mentioned, once a page",
  following: "Those following the page, at most hourly",
  tasks:
    "Whoever has the task (a person, a role's holder, a group's members), those in its comments, and its maker when it's done",
  groups: "The circle's members — by app only",
  messages: "The person it's sent to — by app only",
  alerts: "A circle's members, or everyone",
};

/**
 * One notification (or direct email) as it went out: who caused it, and for
 * each outcome the residents it had — by directory person id, or
 * `user:<id>` for an account with no one in the directory.
 */
export interface DeliveryRecord {
  id: string;
  at: string;
  topic: Topic | DirectEmail;
  title: string;
  url: string | null;
  /** Who caused it; null for the app itself — or a private message, whose sender isn't kept. */
  by: { personId: string | null; name: string } | null;
  /** For only some (a circle's members, a discussion's people…), not everyone. */
  narrowed: boolean;
  /** Sent whatever their settings said (a bug report to the admins, a test). */
  ignoredPreferences?: boolean;
  /** Why nobody was emailed, if nobody could be. */
  noEmail?: keyof typeof NO_EMAIL;
  /** Email test mode was on: only allowed addresses were emailed. */
  testMode: boolean;
  app: Partial<Record<AppOutcome, string[]>>;
  email: Partial<Record<EmailOutcome, string[]>>;
}

/** A change to what someone is told, and how: the opt-in/opt-out log. */
export interface ChangeRecord {
  at: string;
  /** Whose: a directory person id, or `user:<id>`. */
  who: string;
  channel: "app" | "email" | "device";
  /** For app and email: each topic turned on (true) or off (false); `all` for every email at once. */
  topics?: Partial<Record<Topic | "all", boolean>>;
  /** For a device: notifications turned on, turned off, or dropped because its push service said it's gone. */
  device?: "added" | "removed" | "expired";
  via: "settings" | "email link" | "one-click" | "push service";
}

export const CHANGE_VIA: Record<ChangeRecord["via"], string> = {
  settings: "in their settings",
  "email link": "from an email's Stop link",
  "one-click": "with their mail app's unsubscribe",
  "push service": "by the device's push service",
};

/** A topic's name, or a direct email's. */
export const topicLabel = (topic: DeliveryRecord["topic"]) =>
  topic in TOPICS ? TOPICS[topic as Topic] : DIRECT_EMAILS[topic as DirectEmail] ?? topic;

/** How it went to one person: their app and email outcomes (undefined: they weren't in it). */
export function outcomeFor(record: DeliveryRecord, who: string) {
  const find = <K extends string>(buckets: Partial<Record<K, string[]>>) =>
    (Object.keys(buckets) as K[]).find((outcome) => buckets[outcome]?.includes(who));
  return { app: find(record.app), email: find(record.email) };
}

/** How many had each outcome. */
export const counts = <K extends string>(buckets: Partial<Record<K, string[]>>) =>
  Object.fromEntries(
    (Object.keys(buckets) as K[]).map((outcome) => [outcome, buckets[outcome]?.length ?? 0])
  ) as Partial<Record<K, number>>;

/** Everyone a record mentions. */
export const peopleIn = (record: DeliveryRecord) =>
  Array.from(new Set([...Object.values(record.app), ...Object.values(record.email)].flat()));

/** The topics turned on or off between two sets of choices. */
export function changedTopics<T extends string>(
  before: Partial<Record<T, boolean>>,
  after: Partial<Record<T, boolean>>
): Partial<Record<T, boolean>> {
  return Object.fromEntries(
    (Object.keys(after) as T[])
      .filter((topic) => after[topic] !== undefined && after[topic] !== before[topic])
      .map((topic) => [topic, after[topic]])
  ) as Partial<Record<T, boolean>>;
}

/** The outcomes in a word or two, for counts and lists. */
export const APP_SHORT: Record<AppOutcome, string> = {
  sent: "sent",
  pending: "sent, unconfirmed",
  failed: "refused",
  off: "turned off",
  "no-device": "no device",
  "no-account": "not signed in",
};
export const EMAIL_SHORT: Record<EmailOutcome, string> = {
  sent: "emailed",
  held: "held (test mode)",
  "over-quota": "over the day's quota",
  failed: "refused",
  off: "not chosen",
  "no-address": "no address",
  "shared-address": "shared address",
};

/** A change to what someone is told, in a sentence (without who). */
export function describeChange(change: ChangeRecord): string {
  const how = CHANGE_VIA[change.via];
  if (change.channel === "device")
    return change.device === "added"
      ? `Turned notifications on for a device ${how}`
      : change.device === "removed"
        ? `Turned notifications off for a device ${how}`
        : "A device stopped taking notifications: its push service dropped it";
  const entries = Object.entries(change.topics ?? {}) as [Topic | "all", boolean][];
  if (change.channel === "email" && entries.some(([topic, on]) => topic === "all" && !on))
    return `Stopped all emails ${how}`;
  const named = (on: boolean) =>
    entries
      .filter(([topic, value]) => topic !== "all" && value === on)
      .map(([topic]) => TOPICS[topic as Topic].toLowerCase());
  const parts = [
    named(true).length
      ? `${
          change.channel === "app" ? "Turned on app notifications for" : "Chose emails about"
        } ${named(true).join("; ")}`
      : "",
    named(false).length
      ? `${
          change.channel === "app" ? "Turned off app notifications for" : "Stopped emails about"
        } ${named(false).join("; ")}`
      : "",
  ].filter(Boolean);
  return `${parts.join(". ")} ${how}`;
}
