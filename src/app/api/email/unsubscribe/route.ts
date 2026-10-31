import { NextRequest, NextResponse } from "next/server";
import { emailPreferences, NO_EMAIL, updateEmailPreferences } from "@/lib/email/preferences";
import { changedTopics } from "@/lib/notifications/shared";
import { recordChange } from "@/lib/notifications/store";
import {
  readUnsubscribeToken,
  unsubscribeToken,
  type UnsubscribeScope,
} from "@/lib/email/unsubscribe";
import { escapeHtml } from "@/lib/email/deliver";
import { throttled } from "@/lib/http";
import { TOPICS, type Topic } from "@/lib/push/topics";

export const dynamic = "force-dynamic";

/**
 * An email's "Stop them" link (no sign-in: the signed token says who and
 * what). Opening it changes nothing — it asks, with a button — because mail
 * scanners open every link in an email; pressing the button (a POST), or a
 * mail app's one-click unsubscribe (also a POST), makes the change: that
 * notification topic is turned off, or, for "all", every one.
 */

const page = (title: string, body: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(
      title
    )}</title></head>
<body style="margin:0;background:#f6fef9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,sans-serif;color:#1e4620">
<main style="max-width:480px;margin:64px auto;padding:0 16px;line-height:1.55">
<h1 style="font-family:Georgia,serif;font-size:26px">${escapeHtml(title)}</h1>
${body}
<p style="color:#6b8e70;font-size:14px;margin-top:28px">You can choose which emails you get from your profile in Common Pastures.</p>
</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );

const button = (label: string) =>
  `<button type="submit" name="confirm" value="1" style="font:600 16px/1 inherit;padding:13px 22px;border-radius:999px;border:0;background:#315a39;color:#fff;cursor:pointer">${escapeHtml(
    label
  )}</button>`;

async function describe(scope: UnsubscribeScope) {
  if (scope === "all")
    return {
      ask: "Stop all emails from Common Pastures?",
      explain: "No notifications by email. Everything stays in the app.",
      action: "Stop all emails",
      done: "You won't get any more emails",
    };
  return {
    ask: "Stop these emails?",
    explain: `You won't be emailed about ${escapeHtml(
      TOPICS[scope as Topic].toLowerCase()
    )} any more.`,
    action: "Stop these emails",
    done: "Done — no more of these emails",
  };
}

/** Turn it off, and note that it was (and how) in the opt-in/opt-out log. */
async function apply(personId: string, scope: UnsubscribeScope, via: "email link" | "one-click") {
  const before = await emailPreferences(personId);
  await updateEmailPreferences(personId, scope === "all" ? NO_EMAIL : { [scope]: false });
  const topics = changedTopics(before, scope === "all" ? NO_EMAIL : { [scope]: false });
  await recordChange({
    who: personId,
    channel: "email",
    topics: scope === "all" && Object.keys(topics).length ? { all: false } : topics,
    via,
  });
}

const invalid = () =>
  page(
    "That link doesn't work",
    "<p>It may have been copied incompletely, or it has been changed.</p>",
    400
  );

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const found = readUnsubscribeToken(token);
  if (!found) return throttled(request, "unsubscribe") ?? invalid();
  const words = await describe(found.scope);
  return page(
    words.ask,
    `<p>${words.explain}</p>
<form method="post" action="/api/email/unsubscribe?t=${encodeURIComponent(token)}">${button(
      words.action
    )}</form>`
  );
}

/** The confirm button, or a mail app's one-click unsubscribe (`List-Unsubscribe-Post`). */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const found = readUnsubscribeToken(token);
  if (!found) return throttled(request, "unsubscribe") ?? invalid();
  const form = await request.formData().catch(() => null);
  // A mail app's one-click: a plain answer is enough.
  const oneClick = form?.get("List-Unsubscribe") === "One-Click" || !form?.get("confirm");
  await apply(found.personId, found.scope, oneClick ? "one-click" : "email link");
  if (oneClick) return new NextResponse("Unsubscribed", { status: 200 });
  const words = await describe(found.scope);
  const all =
    found.scope === "all"
      ? ""
      : `<form method="post" action="/api/email/unsubscribe?t=${encodeURIComponent(
          unsubscribeToken(found.personId, "all")
        )}"><p>Or ${button("Stop all emails from Common Pastures")}</p></form>`;
  return page(words.done, all);
}
