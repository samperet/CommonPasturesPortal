/**
 * What a document's Share button puts on the clipboard (pure, safe for the
 * browser): the link itself as plain text, for an address bar, a chat or a
 * plain email; and as HTML a small card — the circle's icon (or its initials
 * in a green circle, as in the app), the title as a link, and beneath it the
 * circle and what the document is — which Gmail, Apple Mail, Outlook and
 * most editors keep when it's pasted. Tables and inline styles only, in the
 * emails' colours (`lib/email/templates/layout.ts`), text kept live; the icon
 * at its signed address so a mail service can fetch it (`lib/circles/icon-link.ts`).
 */

const COLOURS = {
  text: "#1e4620",
  muted: "#6b8e70",
  border: "#d1e7d8",
  forest: "#315a39",
  accent: "#e8f5e9",
};
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface ShareCard {
  /** The document's whole address. */
  url: string;
  title: string;
  /** Its circle, if it has one: its name, its icon's whole (signed) address, its initials. */
  circle?: { name: string; iconUrl?: string | null; initials: string } | null;
  /** What it is: "Page", "Proposal", "Google Doc", "Minutes"… */
  label?: string;
}

/** The card, as HTML to paste. */
export function shareCardHtml({ url, title, circle, label }: ShareCard) {
  const href = escape(url);
  const badge = circle
    ? circle.iconUrl
      ? `<img src="${escape(circle.iconUrl)}" width="40" height="40" alt="${escape(
          circle.name
        )}" style="display:block;width:40px;height:40px;border-radius:50%;border:0">`
      : `<div style="width:40px;height:40px;border-radius:50%;background:${COLOURS.accent};color:${
          COLOURS.forest
        };font-family:${SANS};font-size:${
          circle.initials.length > 2 ? 12 : 15
        }px;font-weight:700;line-height:40px;text-align:center">${escape(circle.initials)}</div>`
    : "";
  const details = [circle?.name, label]
    .filter(Boolean)
    .map((part) => escape(part!))
    .join(" · ");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${
    COLOURS.border
  };border-radius:12px;background:#ffffff"><tr>${
    badge
      ? `<td style="padding:12px 0 12px 14px;vertical-align:middle;width:40px"><a href="${href}" style="text-decoration:none">${badge}</a></td>`
      : ""
  }<td style="padding:12px 18px 12px 14px;vertical-align:middle"><a href="${href}" style="font-family:${SANS};font-size:16px;font-weight:600;line-height:1.3;color:${
    COLOURS.forest
  };text-decoration:none">${escape(title)}</a>${
    details
      ? `<br><span style="font-family:${SANS};font-size:13px;line-height:1.5;color:${COLOURS.muted}">${details}</span>`
      : ""
  }</td></tr></table>`;
}
