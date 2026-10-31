import { randomUUID } from "crypto";
import webpush from "web-push";
import {
  allPreferences as savedAppPreferences,
  listSubscriptions,
  removeSubscriptions,
} from "./store";
import type { Topic } from "./topics";
import { vapidKeys, vapidSubject } from "./vapid";
import { listUsers } from "@/lib/auth/users";
import { readDirectory } from "@/lib/directory/store";
import { emailConfigured, emailNotification } from "@/lib/email/send";
import { allEmailPreferences } from "@/lib/email/preferences";
import { readEmailSettings } from "@/lib/email/settings";
import { PUSH_ONLY_TOPICS } from "@/lib/email/shared";
import { planDelivery, type Planned } from "@/lib/notifications/plan";
import { recordChange, recordDelivery } from "@/lib/notifications/store";
import type { AppOutcome, EmailOutcome } from "@/lib/notifications/shared";
import type { PushSubscriptionRecord } from "./store";

type Message = {
  topic: Topic;
  title: string;
  body: string;
  url: string;
  /** Notifications with the same tag replace each other on a device. */
  tag?: string;
  exceptUserId: string | null;
  onlyUserIds?: string[];
  /**
   * Narrows it to these residents (e.g. a circle's members) — emailed even if
   * they've never signed in, which `onlyUserIds` can't reach.
   */
  onlyPersonIds?: string[];
  /** Deliver regardless of preferences, by push only (the "send a test" button; bug reports, to the admins). */
  ignorePreferences?: boolean;
  /** Push only, never emailed (as for every push-only topic). */
  skipEmail?: boolean;
};

/** How long a post waits for the push services before going on without their answers. */
const PUSH_WAIT_MS = 6000;

/**
 * Tell residents about something just posted — the one way the app sends a
 * notification. Who it's for and how each of them gets it is planned once
 * (`planDelivery`): by app on each of their devices, and by email for those
 * who chose its topic (`lib/email/send.ts`) — never the person who posted
 * it. `onlyUserIds` narrows it (e.g. to a discussion's participants), and
 * `onlyPersonIds` to residents (both: those in each). A test push
 * (`ignorePreferences`), one marked `skipEmail`, and one on a push-only
 * topic (`PUSH_ONLY_TOPICS`) aren't emailed — whatever a resident once
 * saved. Then each resident's outcome, by app and by email, goes in the
 * delivery log (`lib/notifications/store.ts`). Never throws and never takes
 * long: a notification that can't be delivered must not break or stall the
 * post that caused it.
 */
export async function notify(message: Message) {
  try {
    const appOnly =
      !!message.ignorePreferences ||
      !!message.skipEmail ||
      PUSH_ONLY_TOPICS.includes(message.topic);
    const emailed = !appOnly && emailConfigured();
    const [directory, users, appPreferences, devices, emailPreferences, emailSettings] =
      await Promise.all([
        readDirectory(),
        listUsers(),
        savedAppPreferences(),
        listSubscriptions(),
        emailed ? allEmailPreferences() : {},
        readEmailSettings(),
      ]);
    const plan = planDelivery({
      topic: message.topic,
      exceptUserId: message.exceptUserId,
      onlyUserIds: message.onlyUserIds,
      onlyPersonIds: message.onlyPersonIds,
      ignorePreferences: message.ignorePreferences,
      emailed: emailed && !!directory,
      people: directory?.people ?? [],
      users,
      appPreferences,
      emailPreferences,
      devices,
      emailSettings,
    });
    const toEmail = plan.flatMap((entry) =>
      entry.email === "send" && entry.address ? [{ personId: entry.key, email: entry.address }] : []
    );
    const [app, email] = await Promise.all([
      push(message, plan),
      emailNotification(
        message,
        toEmail,
        plan.filter((entry) => entry.email === "held").length,
        emailSettings.testMode
      ),
    ]);
    const author = message.exceptUserId
      ? users.find((user) => user.id === message.exceptUserId)
      : undefined;
    // A private message's log keeps neither its sender nor its words: only that one was sent.
    const secret = message.topic === "messages";
    await recordDelivery({
      id: randomUUID(),
      at: new Date().toISOString(),
      topic: message.topic,
      title: secret ? "A private message" : message.title.slice(0, 200),
      url: secret ? null : message.url,
      by: author && !secret ? { personId: author.personId ?? null, name: author.name } : null,
      narrowed: !!(message.onlyUserIds || message.onlyPersonIds),
      ...(message.ignorePreferences ? { ignoredPreferences: true } : {}),
      ...(appOnly
        ? { noEmail: "app-only" as const }
        : emailed
          ? {}
          : { noEmail: "not-set-up" as const }),
      testMode: emailed && emailSettings.testMode,
      app: bucket(plan, (entry) =>
        entry.app === "send" ? app.get(entry.key) ?? "pending" : entry.app
      ),
      email: bucket(plan, (entry) =>
        entry.email === null
          ? null
          : entry.email !== "send"
            ? entry.email
            : email.failed.includes(entry.key)
              ? "failed"
              : email.overQuota.includes(entry.key)
                ? "over-quota"
                : "sent"
      ),
    });
  } catch (error) {
    console.error("[notify] notification failed", error instanceof Error ? error.name : "error");
  }
}

/** Each outcome's people. */
function bucket<K extends AppOutcome | EmailOutcome>(
  plan: Planned<PushSubscriptionRecord>[],
  outcome: (entry: Planned<PushSubscriptionRecord>) => K | null
): Partial<Record<K, string[]>> {
  const buckets: Partial<Record<K, string[]>> = {};
  for (const entry of plan) {
    const result = outcome(entry);
    if (result) (buckets[result] ??= []).push(entry.key);
  }
  return buckets;
}

/**
 * Push to each planned resident's devices; how it went for each of them:
 * sent (a device took it), failed (every device refused it), or pending (no
 * answer yet when the wait ran out). Devices whose push service says
 * they're gone are forgotten, and noted in the opt-in/opt-out log.
 */
async function push(
  message: Message,
  plan: Planned<PushSubscriptionRecord>[]
): Promise<Map<string, AppOutcome>> {
  const outcomes = new Map<string, AppOutcome>();
  const sending = plan.filter((entry) => entry.app === "send");
  if (!sending.length) return outcomes;
  try {
    const { publicKey, privateKey } = await vapidKeys();
    const payload = JSON.stringify({
      title: message.title.slice(0, 120),
      body: message.body.length > 180 ? `${message.body.slice(0, 177)}…` : message.body,
      url: message.url,
      tag: message.tag,
    });
    const expired: PushSubscriptionRecord[] = [];
    // Each device's answer, as it comes: true (taken) or false (refused).
    const answers = new Map<string, boolean>();
    const deliveries = Promise.allSettled(
      sending.flatMap((entry) =>
        entry.devices.map((device) =>
          webpush
            .sendNotification({ endpoint: device.endpoint, keys: device.keys }, payload, {
              TTL: 60 * 60 * 24,
              timeout: 5000,
              vapidDetails: { subject: vapidSubject(), publicKey, privateKey },
            })
            .then(() => answers.set(device.endpoint, true))
            .catch((error: { statusCode?: number }) => {
              answers.set(device.endpoint, false);
              // Gone or not found: the device unsubscribed or the browser dropped it.
              if (error?.statusCode === 404 || error?.statusCode === 410) expired.push(device);
            })
        )
      )
    );
    await Promise.race([deliveries, new Promise((resolve) => setTimeout(resolve, PUSH_WAIT_MS))]);
    for (const entry of sending) {
      const heard = entry.devices.map((device) => answers.get(device.endpoint));
      outcomes.set(
        entry.key,
        heard.includes(true)
          ? "sent"
          : heard.every((answer) => answer === false)
            ? "failed"
            : "pending"
      );
    }
    await removeSubscriptions(expired.map((device) => device.endpoint));
    const usersGone = Array.from(new Set(expired.map((device) => device.userId)));
    const keyOf = new Map(
      sending.flatMap((entry) => entry.devices.map((device) => [device.userId, entry.key]))
    );
    await Promise.all(
      usersGone.map((userId) =>
        recordChange({
          who: keyOf.get(userId) ?? `user:${userId}`,
          channel: "device",
          device: "expired",
          via: "push service",
        })
      )
    );
  } catch (error) {
    console.error("[push] notification failed", error instanceof Error ? error.name : "error");
    for (const entry of sending) if (!outcomes.has(entry.key)) outcomes.set(entry.key, "failed");
  }
  return outcomes;
}

/** First line of a post, trimmed for a notification. */
export const excerpt = (text: string) => text.replace(/\s+/g, " ").trim();
