/**
 * A circle's equipment and each item's log book (safe for the browser): the
 * types, the words for each status and kind of entry, and the year's totals.
 * Stored per circle (`equipment/<circleId>.json`, `store.ts`); who may do
 * what is in `http.ts`.
 */

export const EQUIPMENT_STATUSES = [
  "in-service",
  "needs-repair",
  "out-of-service",
  "retired",
] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  "in-service": "In service",
  "needs-repair": "Needs repair",
  "out-of-service": "Out of service",
  retired: "Retired",
};

export const LOG_KINDS = ["use", "maintenance", "repair", "inspection", "note"] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export const LOG_KIND_LABELS: Record<LogKind, string> = {
  use: "Used",
  maintenance: "Maintenance",
  repair: "Repair",
  inspection: "Inspection",
  note: "Note",
};

/** Who wrote something, as kept with it (or, for what came from elsewhere, where it came from). */
export interface EquipmentAuthor {
  userId: string;
  name: string;
}

export interface EquipmentLogEntry {
  id: string;
  /** The day it happened (YYYY-MM-DD, Vermont). */
  date: string;
  kind: LogKind;
  text: string;
  /** Hours of use (or of work), if given. */
  hours?: number | null;
  /** What it cost, in whole cents, if given. */
  cost?: number | null;
  by: EquipmentAuthor;
  /** Brought in from elsewhere (the mailing list), not written here by a resident. */
  imported?: boolean;
  createdAt: string;
  editedAt?: string;
}

export interface EquipmentItem {
  id: string;
  name: string;
  /** What it is ("Walk-behind field and brush mower"). */
  kind: string;
  makeModel: string;
  serial: string;
  /** Where it's kept. */
  location: string;
  /** When and how it came to CVC. */
  acquired: string;
  owner: string;
  /** Who looks after it. */
  keeper: string;
  status: EquipmentStatus;
  notes: string;
  createdAt: string;
  createdBy: EquipmentAuthor;
  updatedAt: string;
  log: EquipmentLogEntry[];
}

/** An item as the list shows it: its details, with its latest entry and how many there are. */
export type EquipmentSummary = Omit<EquipmentItem, "log"> & {
  latest: EquipmentLogEntry | null;
  entries: number;
};

/** Newest first (by day, then by when it was written). */
export const newestFirst = (log: EquipmentLogEntry[]) =>
  [...log].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

export const summaryOf = ({ log, ...item }: EquipmentItem): EquipmentSummary => ({
  ...item,
  latest: newestFirst(log)[0] ?? null,
  entries: log.length,
});

/** A year's log: how many entries, the hours given, and what was spent. */
export function totalsFor(log: EquipmentLogEntry[], year: string) {
  const entries = log.filter((entry) => entry.date.startsWith(`${year}-`));
  return {
    entries: entries.length,
    uses: entries.filter((entry) => entry.kind === "use").length,
    hours: entries.reduce((sum, entry) => sum + (entry.hours ?? 0), 0),
    cost: entries.reduce((sum, entry) => sum + (entry.cost ?? 0), 0),
  };
}

/** The details shown on an item's page, in order, with their labels. */
export const DETAIL_FIELDS = [
  ["kind", "What it is"],
  ["makeModel", "Make and model"],
  ["serial", "Serial number"],
  ["location", "Where it's kept"],
  ["acquired", "How it came to CVC"],
  ["owner", "Owner"],
  ["keeper", "Looked after by"],
] as const satisfies readonly (readonly [keyof EquipmentItem, string])[];
