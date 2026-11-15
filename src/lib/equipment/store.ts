import { randomUUID } from "crypto";
import { z } from "zod";
import { mutateJson, readJson, readOrSeedJson } from "@/lib/storage";
import type { Actor } from "@/lib/auth/actor";
import { isOperations } from "@/lib/circles/ids";
import { todayInVermont } from "@/lib/time";
import { DR_MOWER_SEED } from "./seed";
import {
  EQUIPMENT_STATUSES,
  LOG_KINDS,
  type EquipmentItem,
  type EquipmentLogEntry,
} from "./shared";

/**
 * A circle's equipment (`equipment/<circleId>.json`): each item's details
 * and its log book. Read by every resident; the circle's members, the
 * Board and admins add, change and remove items; any resident adds to an
 * item's log, and changes or removes their own entries (the circle's
 * members, the Board and admins, any) — the rules are in `http.ts`. The O&M
 * circle's list starts with the DR mower (`seed.ts`), written the first
 * time it's read, write-if-absent, so it's there once and never again.
 */

const MAX_ITEMS = 300;
const MAX_ENTRIES = 3000;
const key = (circleId: string) => `equipment/${circleId}.json`;

type Store = { items: EquipmentItem[] };
const normalize = (raw: unknown): Store | null => {
  const items = (raw as Partial<Store> | null)?.items;
  return Array.isArray(items) ? { items } : null;
};

const line = (max: number) =>
  z.string().trim().max(max, `Keep it to ${max} characters`).default("");

export const itemInputSchema = z.object({
  name: z.string().trim().min(1, "Name it").max(120, "Keep the name to 120 characters"),
  kind: line(160),
  makeModel: line(160),
  serial: line(120),
  location: line(240),
  acquired: line(400),
  owner: line(400),
  keeper: line(400),
  status: z.enum(EQUIPMENT_STATUSES).default("in-service"),
  notes: line(8000),
});
export const itemUpdateSchema = itemInputSchema.partial();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a day");
export const entryInputSchema = z.object({
  date: isoDate,
  kind: z.enum(LOG_KINDS),
  text: z.string().trim().min(1, "Say what was done").max(4000, "Keep it to 4000 characters"),
  hours: z.number().min(0).max(1000).nullable().optional(),
  cost: z.number().int().min(0).max(100_000_000).nullable().optional(),
});
export const entryUpdateSchema = entryInputSchema.partial();

export type Failure = "not_found" | "forbidden" | "full" | "future";
type Result<T> = { ok: true; value: T } | { ok: false; reason: Failure };

/** A circle's equipment — for O&M, starting with the DR mower the first time. */
export async function readEquipment(circle: {
  id: string;
  name: string;
}): Promise<EquipmentItem[]> {
  if (isOperations(circle))
    return (await readOrSeedJson(key(circle.id), normalize, () => ({ items: [DR_MOWER_SEED] })))
      .items;
  return normalize(await readJson(key(circle.id)))?.items ?? [];
}

function mutate<T>(
  circle: { id: string; name: string },
  change: (items: EquipmentItem[]) => { items: EquipmentItem[]; value: T } | Failure
): Promise<Result<T>> {
  return readEquipment(circle).then(() =>
    mutateJson<Result<T>>(key(circle.id), (raw) => {
      const result = change(normalize(raw)?.items ?? []);
      if (typeof result === "string")
        return { write: false, result: { ok: false, reason: result } };
      return { value: { items: result.items }, result: { ok: true, value: result.value } };
    })
  );
}

const author = (actor: Pick<Actor, "userId" | "name">) => ({
  userId: actor.userId,
  name: actor.name,
});

export function addItem(
  circle: { id: string; name: string },
  actor: Pick<Actor, "userId" | "name">,
  input: z.infer<typeof itemInputSchema>
) {
  return mutate(circle, (items) => {
    if (items.length >= MAX_ITEMS) return "full";
    const now = new Date().toISOString();
    const item: EquipmentItem = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      createdBy: author(actor),
      updatedAt: now,
      log: [],
    };
    return { items: [...items, item], value: item };
  });
}

export function updateItem(
  circle: { id: string; name: string },
  itemId: string,
  update: z.infer<typeof itemUpdateSchema>
) {
  return mutate(circle, (items) => {
    const index = items.findIndex((item) => item.id === itemId);
    if (index === -1) return "not_found";
    const next = [...items];
    next[index] = { ...next[index], ...update, updatedAt: new Date().toISOString() };
    return { items: next, value: next[index] };
  });
}

export function removeItem(circle: { id: string; name: string }, itemId: string) {
  return mutate(circle, (items) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return "not_found";
    return { items: items.filter((entry) => entry.id !== itemId), value: item };
  });
}

export function addEntry(
  circle: { id: string; name: string },
  itemId: string,
  actor: Pick<Actor, "userId" | "name">,
  input: z.infer<typeof entryInputSchema>
) {
  return mutate(circle, (items) => {
    const index = items.findIndex((item) => item.id === itemId);
    if (index === -1) return "not_found";
    if (input.date > todayInVermont()) return "future";
    if (items[index].log.length >= MAX_ENTRIES) return "full";
    const entry: EquipmentLogEntry = {
      id: randomUUID(),
      date: input.date,
      kind: input.kind,
      text: input.text,
      ...(input.hours != null ? { hours: input.hours } : {}),
      ...(input.cost != null ? { cost: input.cost } : {}),
      by: author(actor),
      createdAt: new Date().toISOString(),
    };
    const next = [...items];
    next[index] = { ...next[index], log: [...next[index].log, entry] };
    return { items: next, value: entry };
  });
}

/** Change or remove an entry: its author, or (`moderator`) the circle's members, the Board, admins. */
export function changeEntry(
  circle: { id: string; name: string },
  itemId: string,
  entryId: string,
  actor: Pick<Actor, "userId">,
  moderator: boolean,
  update: z.infer<typeof entryUpdateSchema> | null
) {
  return mutate(circle, (items) => {
    const index = items.findIndex((item) => item.id === itemId);
    if (index === -1) return "not_found";
    const entry = items[index].log.find((candidate) => candidate.id === entryId);
    if (!entry) return "not_found";
    const own = !!entry.by.userId && entry.by.userId === actor.userId;
    if (!own && !moderator) return "forbidden";
    if (update?.date && update.date > todayInVermont()) return "future";
    const changed: EquipmentLogEntry | null = update
      ? {
          ...entry,
          ...update,
          hours: update.hours === undefined ? entry.hours : update.hours,
          cost: update.cost === undefined ? entry.cost : update.cost,
          editedAt: new Date().toISOString(),
        }
      : null;
    const next = [...items];
    next[index] = {
      ...next[index],
      log: changed
        ? next[index].log.map((candidate) => (candidate.id === entryId ? changed : candidate))
        : next[index].log.filter((candidate) => candidate.id !== entryId),
    };
    return { items: next, value: changed ?? entry };
  });
}
