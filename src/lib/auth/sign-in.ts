import { NextResponse } from "next/server";
import { readDirectory } from "@/lib/directory/store";
import { emailLayout, PALETTE, SANS, SERIF } from "@/lib/email/templates/layout";
import { escapeHtml } from "@/lib/email/send";
import { sendDirectEmail } from "@/lib/email/send";
import { isEmailAddress } from "@/lib/email/shared";
import { problem } from "@/lib/http";
import { siteUrl } from "@/lib/site-url";
import { createSessionValue, sessionCookieOptions } from "./session";
import { recordSignIn } from "./sign-in-log";
import { noteSeen } from "./last-seen";
import { LINK_TTL_MS } from "./sign-in-links";
import { toPublicUser, userForPerson } from "./users";

/**
 * Signing in by email: who can (residents with an email address in the
 * directory), the email with the link and code, and the response that
 * starts a session once a link or code has been used.
 */

export const signInEmailOf = (person: { email: string | null }) => {
  const email = person.email?.trim().toLowerCase();
  return email && isEmailAddress(email) ? email : null;
};

/** "a•••@example.org": enough to recognise, not enough to collect. */
export const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
};

export async function findSignInPerson(personId: string) {
  const directory = await readDirectory();
  if (!directory) return null;
  return directory.people.find((person) => person.id === personId) ?? null;
}

/**
 * Email someone their link and code: whether it went, and why each sender
 * refused if not. The email is the logo, a greeting, and one big Sign in
 * button; the code is a small line beneath, for an app on a phone's home
 * screen.
 */
export function sendSignInEmail(
  person: { id?: string; displayName: string },
  to: string,
  token: string,
  code: string,
  /** Where the link leads: the site, or the wiki's own address when asked for there. */
  site: string = siteUrl()
) {
  const link = `${site}/login/${token}`;
  const hours = LINK_TTL_MS / 3_600_000;
  const lifetime = hours === 24 ? "a day" : hours >= 1 ? `${hours} hours` : `${hours * 60} minutes`;
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const first = person.displayName.split(/\s+/)[0];
  const note = `The button and code work once, for ${lifetime}. If you didn't ask to sign in, ignore this email — nobody can sign in without it.`;
  const html = `<div style="text-align:center;padding:12px 0 4px">
<img src="${escapeHtml(
    `${site}/CVC.png`
  )}" width="72" height="79" alt="" style="display:inline-block;width:72px;height:79px;border:0">
<div style="margin:10px 0 0;font:700 22px/1.3 ${SERIF};color:${PALETTE.text}">Common Pastures</div>
<p style="margin:22px 0 24px;font:16px/1.6 ${SANS};color:${PALETTE.text}">Hello ${escapeHtml(
    first
  )}, tap the button to sign in.</p>
<a href="${escapeHtml(
    link
  )}" style="display:inline-block;padding:16px 48px;border-radius:999px;background:${
    PALETTE.forest
  };color:#ffffff;font:700 18px/1.2 ${SANS};text-decoration:none">Sign in</a>
<p style="margin:28px 0 0;font:13px/1.6 ${SANS};color:${
    PALETTE.muted
  }">Or enter this code: <span style="letter-spacing:1px;color:${PALETTE.soft}">${spaced}</span></p>
<p style="margin:4px 0 0;font:12px/1.6 ${SANS};color:${PALETTE.muted}">${escapeHtml(note)}</p>
</div>`;
  return sendDirectEmail(
    "sign-in",
    {
      to,
      subject: "Sign in to Common Pastures",
      text: [
        `Hello ${first},`,
        "",
        "Open this link to sign in to Common Pastures:",
        link,
        "",
        `Or enter this code: ${spaced}`,
        "",
        note,
      ].join("\n"),
      html: emailLayout({
        preheader: "Tap the button to sign in to Common Pastures.",
        body: html,
        footer: "Sent because someone asked to sign in as you on Common Pastures.",
      }),
    },
    person.id
  );
}

/** Start a session for a resident whose link or code was just used. */
export async function signedIn(person: { id: string; displayName: string }, next?: string) {
  const user = await userForPerson(person);
  let session: string;
  try {
    session = createSessionValue(user.id);
  } catch {
    console.error("[auth] cannot sign sessions: set AUTH_SECRET");
    return problem("Sign-in is temporarily unavailable", 503);
  }
  await Promise.all([recordSignIn(person), noteSeen(person.id)]);
  const response = NextResponse.json({ user: toPublicUser(user), next: next ?? "/" });
  const { name, ...options } = sessionCookieOptions();
  response.cookies.set(name, session, options);
  return response;
}
