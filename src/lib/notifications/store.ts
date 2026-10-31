import { deleteJson, mutateJson, readJson } from "@/lib/storage";
import { todayInVermont } from "@/lib/time";
import type { ChangeRecord, DeliveryRecord } from "./shared";

/**
 * The delivery log — every notification and direct email, with each
 * resident's outcome by app and by email (`shared.ts`) — kept one file per
 * Vermont day (`notifications/log/<YYYY-MM-DD>.json`), newest first, for
 * about thirteen months: starting a new day's file clears the days a little
 * over a year before it. And the opt-in/opt-out log
 * (`notifications/changes.json`): each change to what someone is told, and
 * each device turned on or off, the latest few thousand. Neither keeps what
 * a notification said beyond its title — and a private message's not even
 * that. Writing never throws: a log that can't be written mustn't stop a
 * notification.
 */

const dayKey = (day: string) => `notifications/log/${day}.json`;
const CHANGES = "notifications/changes.json";
const MAX_PER_DAY = 1000;
const MAX_CHANGES = 3000;
/** How long the log is kept, in days (cleared a week's worth at a time). */
const KEEP_DAYS = 400;
const CLEAR_SPAN = 7;

const dayOf = (iso: string) => todayInVermont(new Date(iso));
const daysBefore = (day: string, count: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10);
};

function normalizeRecords(raw: unknown): DeliveryRecord[] {
  const records = (raw as { records?: unknown } | null)?.records;
  return Array.isArray(records) ? (records as DeliveryRecord[]) : [];
}

export async function recordDelivery(record: DeliveryRecord): Promise<void> {
  try {
    const day = dayOf(record.at);
    const fresh = await mutateJson(dayKey(day), (raw) => ({
      value: { records: [record, ...normalizeRecords(raw)].slice(0, MAX_PER_DAY) },
      result: raw === null,
    }));
    // A new day: clear the days that have aged out.
    if (fresh)
      await Promise.all(
        Array.from({ length: CLEAR_SPAN }, (_, index) =>
          deleteJson(dayKey(daysBefore(day, KEEP_DAYS + index))).catch(() => undefined)
        )
      );
  } catch (error) {
    console.error("[notifications] couldn't log a delivery", (error as Error)?.name);
  }
}

/** The last `days` days' deliveries (today included), newest first. */
export async function readDeliveries(days = 14, now = new Date()): Promise<DeliveryRecord[]> {
  const today = todayInVermont(now);
  const files = await Promise.all(
    Array.from({ length: Math.max(1, days) }, (_, index) =>
      readJson(dayKey(daysBefore(today, index)))
    )
  );
  return files.flatMap(normalizeRecords);
}

function normalizeChanges(raw: unknown): ChangeRecord[] {
  const changes = (raw as { changes?: unknown } | null)?.changes;
  return Array.isArray(changes) ? (changes as ChangeRecord[]) : [];
}

/** Whose a change is, as the logs name them: their directory person, or their account. */
export const whoOf = (user: { id: string; personId?: string | null }) =>
  user.personId ?? `user:${user.id}`;

/** Note a change to what someone is told (nothing, when nothing changed). */
export async function recordChange(change: Omit<ChangeRecord, "at">): Promise<void> {
  if (change.topics && !Object.keys(change.topics).length) return;
  try {
    const entry: ChangeRecord = { at: new Date().toISOString(), ...change };
    await mutateJson(CHANGES, (raw) => ({
      value: { changes: [entry, ...normalizeChanges(raw)].slice(0, MAX_CHANGES) },
      result: undefined,
    }));
  } catch (error) {
    console.error("[notifications] couldn't log a change", (error as Error)?.name);
  }
}

/** The opt-in/opt-out log, newest first. */
export async function readChanges(): Promise<ChangeRecord[]> {
  return normalizeChanges(await readJson(CHANGES));
}
