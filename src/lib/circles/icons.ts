import { mutateJson, readJson } from "@/lib/storage";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { Circle } from "@/lib/circles/types";
import { managesCircle } from "./tiers";

/**
 * Circle icons: one uploaded image per circle, stored as a binary object with
 * a small metadata document recording which circles have one. Members of a
 * circle — and the Board, so empty circles can get one too — may change it.
 */

interface IconMeta {
  contentType: string;
  updatedAt: string;
}

const KEY = "circles/icons.json";

/** Circle ids come from URLs and become storage keys. */
export function isCircleId(id: string) {
  return /^[a-z0-9-]{1,40}$/.test(id);
}

export function iconKey(circleId: string) {
  if (!isCircleId(circleId)) throw new Error("Invalid circle id");
  return `circles/icons/${circleId}`;
}

function normalize(raw: unknown): Record<string, IconMeta> {
  const doc = raw as { icons?: Record<string, IconMeta> } | null;
  return doc?.icons && typeof doc.icons === "object" ? doc.icons : {};
}

export async function readCircleIcons(): Promise<Record<string, IconMeta>> {
  return normalize(await readJson(KEY));
}

export async function setCircleIcon(circleId: string, meta: IconMeta | null): Promise<void> {
  await mutateJson(KEY, (raw) => {
    const { [circleId]: _old, ...rest } = normalize(raw);
    return { value: { icons: meta ? { ...rest, [circleId]: meta } : rest }, result: null };
  });
}

export function applyCircleIcon(circle: Circle, meta: IconMeta | undefined): Circle {
  return {
    ...circle,
    iconUrl: meta ? `/api/circles/${circle.id}/icon?v=${encodeURIComponent(meta.updatedAt)}` : null,
  };
}

/**
 * Whether a person holds a seat on a circle whose position matches — the
 * whole role, so anchor the pattern (`SECRETARY_ROLE` in `secretary.ts`):
 * an unanchored /secretary/i would match "Assistant secretary" too.
 */
export function holdsSeat(
  directory: DirectoryDocument,
  circleId: string,
  personId: string,
  position: RegExp
): boolean {
  const circle = directory.circles.find((entry) => entry.id === circleId);
  return !!circle?.seats.some(
    (seat) => seat.personId === personId && position.test(seat.position ?? "")
  );
}

/**
 * Whether a resident may manage a circle (details, members, icon, page,
 * things): they're in it, in its parent (a sub group), or on the Board
 * (`managesCircle`). Admins aren't included: callers add them.
 */
export function canManageCircle(
  directory: DirectoryDocument,
  circleId: string,
  personId: string
): boolean {
  return managesCircle(directory.circles, circleId, personId);
}
