import { mutateJson, readJson } from "@/lib/storage";
import type { SignInAttempt } from "./attempts-shared";

/**
 * The log of tries at signing in, for admins (what's recorded, and how it's
 * shown: `attempts-shared.ts`): kept beside the sign-in log, the newest
 * 2000, in `auth/sign-in-attempts.json`. Recording never throws — a logging
 * failure must not stop anyone signing in.
 */

const KEY = "auth/sign-in-attempts.json";
const MAX_ENTRIES = 2000;

function normalize(raw: unknown): SignInAttempt[] {
  const entries = (raw as { entries?: unknown } | null)?.entries;
  return Array.isArray(entries) ? (entries as SignInAttempt[]) : [];
}

/** Newest first. */
export async function listAttempts(): Promise<SignInAttempt[]> {
  return [...normalize(await readJson(KEY))].reverse();
}

export async function recordAttempt(
  person: { id: string; displayName: string },
  attempt: Omit<SignInAttempt, "at" | "personId" | "name">
): Promise<void> {
  try {
    const entry: SignInAttempt = {
      at: new Date().toISOString(),
      personId: person.id,
      name: person.displayName,
      ...attempt,
    };
    await mutateJson(KEY, (raw) => ({
      value: { entries: [...normalize(raw), entry].slice(-MAX_ENTRIES) },
      result: null,
    }));
  } catch (error) {
    console.error(
      "[auth] could not record a sign-in attempt",
      error instanceof Error ? error.name : "error"
    );
  }
}
