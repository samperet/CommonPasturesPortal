import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { mutateJson, readJson } from "@/lib/storage";
import { authSecret } from "./secret";

/**
 * Sign-in by email: each request makes a link and a six-digit code, sent to
 * the resident's directory address. Either one signs in, once, within a day
 * (so yesterday's email still works) — the link on the device that opens
 * it, the code typed on the device that asked (for an app added to a
 * phone's home screen, which doesn't share the browser's sign-in). Only
 * keyed hashes of the token and code are stored. A resident can ask for a
 * few links an hour, and five wrong codes spoil their open links, so a code
 * can't be guessed. Signing in clears that person's other links — they're
 * spent, and so is the count. An admin can also make a link for someone
 * (to send them another way, when their email isn't arriving): the same
 * kind of link, outside the hourly count.
 */

// "-2": the count started over on 2026-10-05 (the first file is left as it was).
const KEY = "auth/sign-in-links-2.json";
export const LINK_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_LINKS_PER_HOUR = 5;
export const MAX_CODE_ATTEMPTS = 5;

export interface SignInLink {
  personId: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  /** Wrong codes typed while this link was open. */
  attempts: number;
  /** Where to go after signing in (a same-site path). */
  next?: string;
}

/** Keyed by the token's hash. */
type Links = Record<string, SignInLink>;

export type LinkFailure = "unknown" | "expired" | "used";

const digest = (purpose: string, value: string) =>
  createHmac("sha256", authSecret()).update(`sign-in-${purpose}:${value}`).digest("hex");

export const tokenHash = (token: string) => digest("link", token);
export const codeHash = (personId: string, code: string) =>
  digest("code", `${personId}:${code.replace(/\D/g, "")}`);

const sameHash = (a: string, b: string) =>
  a.length === b.length &&
  timingSafeEqual(new Uint8Array(Buffer.from(a)), new Uint8Array(Buffer.from(b)));

function normalize(raw: unknown): Links {
  const links = (raw as { links?: Links } | null)?.links;
  return links && typeof links === "object" ? links : {};
}

/** Drop links that can no longer be used, keeping the last hour's for the rate limit. */
export function prune(links: Links, now: number): Links {
  return Object.fromEntries(
    Object.entries(links).filter(
      ([, link]) => now - new Date(link.createdAt).getTime() < Math.max(LINK_TTL_MS, 3600_000)
    )
  );
}

/** Whether a link can still be used (pure, for tests). */
export function linkState(link: SignInLink | undefined, now: number): LinkFailure | "ok" {
  if (!link) return "unknown";
  if (link.usedAt) return "used";
  if (new Date(link.expiresAt).getTime() <= now || link.attempts >= MAX_CODE_ATTEMPTS)
    return "expired";
  return "ok";
}

/** A same-site path to continue to, or nothing. */
export function safeNext(next: string | undefined | null): string | undefined {
  return next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !next.startsWith("/login") &&
    next.length <= 500
    ? next
    : undefined;
}

/**
 * A new link and code for someone, or "too-many" when they've asked too
 * often this hour (`unlimited`: an admin's, which doesn't count).
 */
export function createSignInLink(
  personId: string,
  next?: string,
  now = Date.now(),
  options: { unlimited?: boolean } = {}
): Promise<{ token: string; code: string; expiresAt: string } | "too-many"> {
  const token = randomBytes(24).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return mutateJson<{ token: string; code: string; expiresAt: string } | "too-many">(KEY, (raw) => {
    const links = prune(normalize(raw), now);
    const recent = Object.values(links).filter(
      (link) => link.personId === personId && now - new Date(link.createdAt).getTime() < 3600_000
    ).length;
    if (recent >= MAX_LINKS_PER_HOUR && !options.unlimited)
      return { write: false, result: "too-many" as const };
    const link: SignInLink = {
      personId,
      codeHash: codeHash(personId, code),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + LINK_TTL_MS).toISOString(),
      attempts: 0,
      ...(safeNext(next) ? { next: safeNext(next) } : {}),
    };
    return {
      value: { links: { ...links, [tokenHash(token)]: link } },
      result: { token, code, expiresAt: link.expiresAt },
    };
  });
}

type Used = { personId: string; next?: string };

/** Whose a link is (while it's still kept: a day), for the log of tries that failed. */
export async function linkOwner(token: string): Promise<string | null> {
  return normalize(await readJson(KEY))[tokenHash(token)]?.personId ?? null;
}

/** The links once `key` is used: it marked used, and the same person's others gone. */
function spend(links: Links, key: string, now: number): Links {
  const link = links[key];
  return {
    ...Object.fromEntries(
      Object.entries(links).filter(([, other]) => other.personId !== link.personId)
    ),
    [key]: { ...link, usedAt: new Date(now).toISOString() },
  };
}

/** Use a link: who it signs in, once. */
export function redeemSignInLink(token: string, now = Date.now()): Promise<Used | LinkFailure> {
  const hash = tokenHash(token);
  return mutateJson<Used | LinkFailure>(KEY, (raw) => {
    const links = normalize(raw);
    const link = links[hash];
    const state = linkState(link, now);
    if (state !== "ok") return { write: false, result: state };
    return {
      value: { links: spend(links, hash, now) },
      result: { personId: link!.personId, next: link!.next },
    };
  });
}

/**
 * Sign in with a typed code: it must match one of the person's open links,
 * which it then uses. A wrong code counts against all of their open links.
 */
export function redeemSignInCode(
  personId: string,
  code: string,
  now = Date.now()
): Promise<Used | "wrong" | "none"> {
  const hash = codeHash(personId, code);
  return mutateJson<Used | "wrong" | "none">(KEY, (raw) => {
    const links = normalize(raw);
    const open = Object.entries(links).filter(
      ([, link]) => link.personId === personId && linkState(link, now) === "ok"
    );
    if (!open.length) return { write: false, result: "none" as const };
    const match = open.find(([, link]) => sameHash(link.codeHash, hash));
    if (match) {
      const [key, link] = match;
      return {
        value: { links: spend(links, key, now) },
        result: { personId, next: link.next },
      };
    }
    const counted = Object.fromEntries(
      open.map(([key, link]) => [key, { ...link, attempts: link.attempts + 1 }])
    );
    return { value: { links: { ...links, ...counted } }, result: "wrong" as const };
  });
}
