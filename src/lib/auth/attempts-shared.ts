/**
 * Tries at signing in, as the admins' sign-in log shows them (safe for the
 * browser; the store is `sign-in-attempts.ts`): each ask for a sign-in
 * email and whether it went (and through which sender, to which address,
 * half hidden), each code that didn't work, each sign-in link opened too
 * late or a second time, and each sign-in link an admin made for someone.
 * No full email addresses, codes or links are kept.
 */

export type AttemptKind = "email" | "code" | "link" | "admin-link";

export type AttemptOutcome =
  /** email: handed to a sender. */
  | "sent"
  /** email: every sender refused it, or there was no room today. */
  | "not-sent"
  /** email: the directory has no address for them. */
  | "no-email"
  /** email: they'd asked too often in the last hour, so none went. */
  | "too-many"
  /** code: it didn't match. */
  | "wrong"
  /** code: their links had all expired or been used. */
  | "none"
  /** link: opened after its day was up (or after too many wrong codes). */
  | "expired"
  /** link: opened again, after it had signed someone in. */
  | "used"
  /** admin-link: an admin made one. */
  | "made";

export interface SignInAttempt {
  at: string;
  personId: string;
  name: string;
  kind: AttemptKind;
  outcome: AttemptOutcome;
  /** Where the email went, half hidden: "b•••@example.org". */
  to?: string;
  /** Which sender took it, or each sender's refusal by status (no addresses). */
  detail?: string;
  /** The admin who made the link. */
  by?: string;
}

/** Whether it went wrong (the log marks these). */
export const failed = (attempt: Pick<SignInAttempt, "outcome">) =>
  !["sent", "made"].includes(attempt.outcome);

/** What happened, in a line: "Asked for a sign-in email: sent to b•••@example.org through Brevo". */
export function describeAttempt(attempt: SignInAttempt): string {
  switch (attempt.outcome) {
    case "sent":
      return `Asked for a sign-in email: sent${attempt.to ? ` to ${attempt.to}` : ""}${
        attempt.detail ? ` through ${attempt.detail}` : ""
      }`;
    case "not-sent":
      return `Asked for a sign-in email: it couldn't be sent${
        attempt.detail ? ` (${attempt.detail})` : ""
      }`;
    case "no-email":
      return "Asked for a sign-in email: there's no email address for them in the directory";
    case "too-many":
      return "Asked for a sign-in email: too many asked for in an hour, so none was sent";
    case "wrong":
      return "Typed a code that didn't match";
    case "none":
      return "Typed a code, but their sign-in emails had expired or been used";
    case "expired":
      return "Opened a sign-in link that had expired";
    case "used":
      return "Opened a sign-in link that had already been used";
    case "made":
      return `${attempt.by ?? "An admin"} made a sign-in link for them`;
  }
}

/**
 * When they next signed in, at or after the attempt: the earliest such of
 * `signIns` (any order), or null if they haven't since.
 */
export function signedInAfter(
  attempt: Pick<SignInAttempt, "personId" | "at">,
  signIns: { personId: string; at: string }[]
): string | null {
  let first: string | null = null;
  for (const signIn of signIns)
    if (signIn.personId === attempt.personId && signIn.at >= attempt.at)
      if (!first || signIn.at < first) first = signIn.at;
  return first;
}

/** How long after: "2 minutes later", "the next day"… */
export function laterBy(from: string, to: string): string {
  const minutes = Math.round((Date.parse(to) - Date.parse(from)) / 60_000);
  if (minutes < 1) return "right away";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} later`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} later`;
  const days = Math.round(hours / 24);
  return days === 1 ? "a day later" : `${days} days later`;
}

/**
 * Those whose latest try hasn't been followed by a sign-in: one row each,
 * newest first — who may be stuck. A link opened again after it was used
 * doesn't count: that link did sign them in.
 */
export function stillTrying(
  attempts: SignInAttempt[],
  signIns: { personId: string; at: string }[]
): SignInAttempt[] {
  const latest = new Map<string, SignInAttempt>();
  for (const attempt of attempts) {
    if (attempt.outcome === "used") continue;
    const seen = latest.get(attempt.personId);
    if (!seen || attempt.at > seen.at) latest.set(attempt.personId, attempt);
  }
  return Array.from(latest.values())
    .filter((attempt) => !signedInAfter(attempt, signIns))
    .sort((a, b) => b.at.localeCompare(a.at));
}
