import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";

/**
 * Devices signed up for push notifications, and each resident's choice of
 * what to be notified about (shared by all their devices).
 */

import { DEFAULT_PREFERENCES, TOPICS, type Preferences, type Topic } from "./topics";

export { DEFAULT_PREFERENCES, TOPICS, type Preferences, type Topic };

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: string;
  createdAt: string;
}

export const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export const preferencesSchema = z
  .object(
    Object.fromEntries(
      Object.keys(TOPICS).map((topic) => [topic, z.boolean().optional()])
    ) as Record<Topic, z.ZodOptional<z.ZodBoolean>>
  )
  .strict();

const SUBSCRIPTIONS = "push/subscriptions.json";
const PREFERENCES = "push/preferences.json";
const MAX_SUBSCRIPTIONS = 2000;

function normalizeSubscriptions(raw: unknown): PushSubscriptionRecord[] {
  const list = (raw as { subscriptions?: unknown } | null)?.subscriptions;
  return Array.isArray(list) ? (list as PushSubscriptionRecord[]) : [];
}

export async function listSubscriptions(): Promise<PushSubscriptionRecord[]> {
  return normalizeSubscriptions(await readJson(SUBSCRIPTIONS));
}

/**
 * Save a device's subscription for this resident (a device that changes
 * hands moves to its new owner). Whether it's new to them.
 */
export async function saveSubscription(
  userId: string,
  subscription: z.infer<typeof subscriptionSchema>
): Promise<boolean> {
  const record: PushSubscriptionRecord = {
    ...subscription,
    userId,
    createdAt: new Date().toISOString(),
  };
  return mutateJson(SUBSCRIPTIONS, (raw) => {
    const list = normalizeSubscriptions(raw);
    const others = list.filter((entry) => entry.endpoint !== subscription.endpoint);
    const known = list.some(
      (entry) => entry.endpoint === subscription.endpoint && entry.userId === userId
    );
    return {
      value: { subscriptions: [...others, record].slice(-MAX_SUBSCRIPTIONS) },
      result: !known,
    };
  });
}

/** Forget subscriptions by endpoint (turned off, or rejected by the push service as expired). */
export async function removeSubscriptions(endpoints: string[], userId?: string) {
  if (!endpoints.length) return;
  const drop = new Set(endpoints);
  await mutateJson(SUBSCRIPTIONS, (raw) => {
    const list = normalizeSubscriptions(raw);
    const kept = list.filter(
      (entry) => !(drop.has(entry.endpoint) && (!userId || entry.userId === userId))
    );
    if (kept.length === list.length) return { write: false, result: null };
    return { value: { subscriptions: kept }, result: null };
  });
}

/** Forget every device and preference of these accounts (closed accounts get no more notifications). */
export async function removeUserPush(userIds: string[]) {
  if (!userIds.length) return;
  const ids = new Set(userIds);
  await mutateJson(SUBSCRIPTIONS, (raw) => {
    const list = normalizeSubscriptions(raw);
    const kept = list.filter((entry) => !ids.has(entry.userId));
    if (kept.length === list.length) return { write: false, result: null };
    return { value: { subscriptions: kept }, result: null };
  });
  await mutateJson(PREFERENCES, (raw) => {
    const map = normalizePreferences(raw);
    const kept = Object.fromEntries(Object.entries(map).filter(([userId]) => !ids.has(userId)));
    if (Object.keys(kept).length === Object.keys(map).length) return { write: false, result: null };
    return { value: { byUser: kept }, result: null };
  });
}

function normalizePreferences(raw: unknown): Record<string, Partial<Preferences>> {
  const doc = raw as { byUser?: Record<string, Partial<Preferences>> } | null;
  return doc?.byUser && typeof doc.byUser === "object" ? doc.byUser : {};
}

async function readPreferenceMap(): Promise<Record<string, Partial<Preferences>>> {
  return normalizePreferences(await readJson(PREFERENCES));
}

export async function allPreferences(): Promise<Record<string, Preferences>> {
  const map = await readPreferenceMap();
  return Object.fromEntries(
    Object.entries(map).map(([userId, prefs]) => [userId, { ...DEFAULT_PREFERENCES, ...prefs }])
  );
}

export async function preferencesFor(userId: string): Promise<Preferences> {
  return { ...DEFAULT_PREFERENCES, ...(await readPreferenceMap())[userId] };
}

export async function updatePreferences(
  userId: string,
  update: Partial<Preferences>
): Promise<Preferences> {
  return mutateJson<Preferences>(PREFERENCES, (raw) => {
    const map = normalizePreferences(raw);
    const next = { ...DEFAULT_PREFERENCES, ...map[userId], ...update };
    return { value: { byUser: { ...map, [userId]: next } }, result: next };
  });
}
