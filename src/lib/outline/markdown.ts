/**
 * Outline's Markdown, turned into CVC's (`lib/wiki`): the parts the two
 * write differently. Pure, so it's tested without a server. Code blocks are
 * left as they are.
 *
 * - `==words==` → `:mark[words]{color="yellow"}`
 * - `:::info` / `:::warning` / `:::tip` / `:::success` → `:::callout{kind="…"}`
 * - `__words__` (Outline's underline) → plain words
 * - `@[Name](mention://…/user/<id>)` → a resident mention, or the name
 * - `[text](/doc/<slug>-<urlId>)` → `[[Title|text]]` when that document was
 *   imported, else a link to the Outline page
 * - `![alt](/api/attachments.redirect?id=…)` and `[text](/api/attachments.redirect?id=…)`
 *   → what the import re-hosted them as (an image here, a document here), or a note
 * - other links to the Outline server made absolute
 * - a line that would start a CVC directive (`::`, `:::`) or a `[[link]]` that
 *   wasn't meant as one is escaped, so Outline's text never turns into one
 */

export interface ConvertContext {
  /** The Outline server, for links that stay links ("https://wiki.example"). */
  host: string;
  /** The CVC title of an imported document, by its Outline urlId. */
  linkTitle: (urlId: string) => string | null;
  /** How to write a mention of an Outline user. */
  mention: (userId: string, name: string) => string;
  /** What an attachment was re-hosted as (Markdown), or null when it wasn't. */
  attachment: (id: string, kind: "image" | "file", text: string) => string | null;
}

export const MAX_BODY = 50_000;

const NOTICE_KINDS: Record<string, string> = {
  info: "info",
  warning: "warning",
  tip: "tip",
  success: "tip",
};
const ATTACHMENT = /\/api\/attachments\.redirect\?id=([A-Za-z0-9_-]+)/;
const DOC_LINK = /^\/doc\/(?:[^/\s)]*-)?([A-Za-z0-9]{10})(?:[?#][^\s)]*)?$/;

/** The attachment ids a document refers to (images and files), in order, once each. */
export function attachmentIdsIn(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(new RegExp(ATTACHMENT.source, "g")))
    if (!ids.includes(match[1])) ids.push(match[1]);
  return ids;
}

/** The urlIds of the Outline documents a document links to. */
export function linkedDocumentsIn(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/\]\((\/doc\/[^)\s]+)\)/g)) {
    const id = DOC_LINK.exec(match[1])?.[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function convertProse(text: string, ctx: ConvertContext): string {
  let out = text;
  // Notices → callouts with a kind.
  out = out.replace(
    /^(\s*):::(info|warning|tip|success)\b[^\n]*$/gm,
    (_match, indent: string, kind: string) => `${indent}:::callout{kind="${NOTICE_KINDS[kind]}"}`
  );
  // Anything else that would start a CVC directive is escaped.
  out = out.replace(
    /^(\s*)(:{2,})(?!:)(?!callout\{kind=)(?=\S)/gm,
    (_match, indent: string, colons: string) => `${indent}\\${colons}`
  );
  // A bare "[[…]]" that Outline meant literally.
  out = out.replace(/\[\[/g, "\\[\\[");
  // Mentions.
  out = out.replace(
    /@\[([^\]]*)\]\(mention:\/\/[^/\s)]+\/user\/([^/\s)]+)\)/g,
    (_match, name: string, userId: string) => ctx.mention(userId, name)
  );
  // Links between documents, and other links into the Outline server (attachments come next).
  out = out.replace(
    /\[([^\]]*)\]\((\/(?!api\/attachments\.redirect)[^)\s]*)\)/g,
    (_match, label: string, href: string) => {
      const urlId = DOC_LINK.exec(href)?.[1];
      const title = urlId ? ctx.linkTitle(urlId) : null;
      if (title)
        return label.trim().toLowerCase() === title.toLowerCase()
          ? `[[${title}]]`
          : `[[${title}|${label}]]`;
      return `[${label}](${ctx.host}${href})`;
    }
  );
  // Images and files kept by Outline.
  out = out.replace(
    /!\[([^\]]*)\]\((\/api\/attachments\.redirect\?id=[^)\s]+)\)/g,
    (_match, alt: string, href: string) => {
      const id = ATTACHMENT.exec(href)?.[1] ?? "";
      return (
        ctx.attachment(id, "image", alt) ?? `*(an image kept in the wiki${alt ? `: ${alt}` : ""})*`
      );
    }
  );
  out = out.replace(
    /\[([^\]]*)\]\((\/api\/attachments\.redirect\?id=[^)\s]+)\)/g,
    (_match, label: string, href: string) => {
      const id = ATTACHMENT.exec(href)?.[1] ?? "";
      return ctx.attachment(id, "file", label) ?? label;
    }
  );
  // Highlights and underlines.
  out = out.replace(
    /==([^=\n][^\n]*?)==/g,
    (_match, words: string) => `:mark[${words}]{color="yellow"}`
  );
  out = out.replace(/__([^_\n][^\n]*?)__/g, "$1");
  return out;
}

/** Outline's Markdown as a CVC page body (code blocks untouched), cut at `MAX_BODY` with a note. */
export function outlineToWiki(text: string, ctx: ConvertContext): { body: string; cut: boolean } {
  const parts = text.replace(/\r\n?/g, "\n").split(/(^```[^\n]*\n[\s\S]*?^```[ \t]*$)/m);
  const body = parts
    .map((part, index) => (index % 2 === 1 ? part : convertProse(part, ctx)))
    .join("")
    .trim();
  if (body.length <= MAX_BODY) return { body, cut: false };
  return {
    body: `${body.slice(
      0,
      MAX_BODY - 80
    )}\n\n*(The rest of this page didn't fit when it was brought over from the wiki.)*`,
    cut: true,
  };
}

/** A comment's text, from Outline's ProseMirror JSON: paragraphs apart, list items on their own lines. */
export function commentText(data: unknown): string {
  const node = data as { type?: string; text?: string; content?: unknown[] } | null;
  if (!node || typeof node !== "object") return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak" || node.type === "hard_break") return "\n";
  const children = Array.isArray(node.content) ? node.content.map(commentText) : [];
  switch (node.type) {
    case "doc":
      return children.filter(Boolean).join("\n\n").trim();
    case "paragraph":
    case "heading":
      return children.join("").trim();
    case "bullet_list":
    case "bulletList":
    case "ordered_list":
    case "orderedList":
    case "checkbox_list":
      return children.filter(Boolean).join("\n");
    case "list_item":
    case "listItem":
    case "checkbox_item":
      return `- ${children.filter(Boolean).join(" ")}`;
    case "mention":
      return (node as { attrs?: { label?: string } }).attrs?.label ?? "";
    default:
      return children.join(node.type === "blockquote" ? "\n" : "");
  }
}
