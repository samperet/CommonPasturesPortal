import { pollIsOpen, type Poll } from "@/lib/polls/shared";
import { normalizeWikiLinks, parseWikiLink, WIKI_LINK, type CircleRef } from "@/lib/wiki/links";
import { sectionOf } from "@/lib/wiki/sections";
import { consentState, pageStage, type PageConsent, type PageProposal } from "@/lib/wiki/consent";
import { namesOf, type NamedPerson } from "@/lib/people";
import {
  PROPOSAL_DIRECTIVE,
  meetingDateOf,
  chosenFor,
  snapshotOf,
  type Proposal,
  type ProposalConsent,
} from "@/lib/proposals/shared";
import { versionOf } from "@/lib/wiki/perspectives-shared";
import { shortDate, todayInVermont } from "@/lib/time";

/**
 * Documents as files in an export (`export.ts`): written pages, proposals,
 * and links as Markdown that any editor reads, and the names they're filed
 * under. Pure, for tests.
 *
 * A page's own syntax becomes plain Markdown:
 * - `[[Page]]` and `[[doc:Title]]` link to that page's or file's place in
 *   the export (relatively), or else to the app; a page that isn't there, or
 *   can't be seen, is just its words;
 * - `:mark[words]{color}` → `<mark>words</mark>`;
 * - `:::details{title}` (a collapsible section from before they were taken
 *   out) → its title in bold, then what it held, as the app shows it;
 * - `:::callout` → a quote (`> `);
 * - `::poll{id}` → the question, and each option with its votes;
 * - `::proposal{id}` → the proposal, quoted: where it stands, and a link;
 * - `::embed{page section}` → that page (or section) quoted, with a link —
 *   pages embedded in it are links only;
 * - photos added to the wiki → the photos, filed in `images/`;
 * - links into the app (`/wiki/…`) → its full address;
 * code (fenced or `inline`) is left as it is. Each file starts with its
 * details as front matter (YAML), then its title.
 */

export type ExportKind = "page" | "file" | "proposal";

/** A page, as much as an export needs. */
export interface ExportPage {
  id: string;
  slug: string;
  title: string;
  keeper: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: { name: string };
  meetingDate?: string | null;
  present?: NamedPerson[];
  transcript?: string;
  consent?: PageConsent | null;
  proposal?: PageProposal | null;
}

export interface ExportContext {
  siteUrl: string;
  circles: CircleRef[];
  /** The pages the reader can see (for links and embeds). */
  pages: ExportPage[];
  /** Every document, file or link (for `[[doc:…]]`). */
  documents: { id: string; title: string; circleId: string }[];
  proposals: Map<string, Proposal>;
  polls: Map<string, { question: string; details: string | null; poll: Poll }>;
  /** Where an item is in this export ("Land Care Circle/Mowing.md"); null when it isn't in it. */
  pathOf: (kind: ExportKind, id: string) => string | null;
  /** Where a photo added to a page is put in this export (asking adds it); null if it can't be. */
  imagePath: (circleId: string, imageId: string) => string | null;
}

// --- Names ------------------------------------------------------------------------------------

/** A title as a file or folder name that works everywhere: no slashes or reserved characters, not too long. */
export function safeName(title: string, fallback = "Untitled") {
  const cleaned = Array.from(
    title
      .normalize("NFC")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[.\s]+/, "")
  )
    .slice(0, 120)
    .join("")
    .replace(/[.\s]+$/, "");
  const name = cleaned || fallback;
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name) ? `${name}-` : name;
}

/** The names given out in an export, so no two are the same (ignoring case): "Minutes (2).pdf". */
export class NameBook {
  private taken = new Set<string>();

  /** A free path for `title` + `extension` in `folder` (a path made of safe names). */
  claim(folder: string, title: string, extension: string) {
    const base = safeName(title);
    for (let copy = 1; ; copy++) {
      const name = `${base}${copy > 1 ? ` (${copy})` : ""}${extension}`;
      const path = folder ? `${folder}/${name}` : name;
      if (!this.taken.has(path.toLowerCase())) {
        this.taken.add(path.toLowerCase());
        return path;
      }
    }
  }
}

const encodeSegment = (segment: string) =>
  segment === ".."
    ? segment
    : encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29");

/** A link from one file in the export to another, as Markdown wants it ("../images/a.jpg"). */
export function relativeLink(from: string, to: string) {
  const fromFolder = from.split("/").slice(0, -1);
  const target = to.split("/");
  let shared = 0;
  while (
    shared < fromFolder.length &&
    shared < target.length - 1 &&
    fromFolder[shared] === target[shared]
  )
    shared++;
  return [...fromFolder.slice(shared).map(() => ".."), ...target.slice(shared)]
    .map(encodeSegment)
    .join("/");
}

// --- Pieces --------------------------------------------------------------------------------------

const vermontDay = (iso: string) => todayInVermont(new Date(iso));
const longDay = (date: string) => shortDate(date, true);
const circleName = (ctx: ExportContext, id: string) =>
  ctx.circles.find((circle) => circle.id === id)?.name ?? "A circle";
const escapeLabel = (text: string) => text.replace(/([\\[\]])/g, "\\$1");

/** Details first, as YAML (strings quoted as JSON, which YAML reads); empty ones left out. */
function frontMatter(fields: [string, string | string[] | null | undefined][]) {
  const lines = fields.flatMap(([key, value]) => {
    if (value === null || value === undefined || value === "") return [];
    if (Array.isArray(value))
      return value.length
        ? [`${key}: [${value.map((item) => JSON.stringify(item)).join(", ")}]`]
        : [];
    return [`${key}: ${JSON.stringify(value)}`];
  });
  return ["---", ...lines, "---"].join("\n");
}

/** "Present: Cara Cedar and Dev Dogwood · also there: Sam (guest)". */
function presentText(present: (NamedPerson & { member?: boolean })[]) {
  const members = present.filter((person) => person.member !== false);
  const others = present.filter((person) => person.member === false);
  const named = (people: NamedPerson[]) =>
    namesOf(
      people.map((person) => ({
        ...person,
        name: `${person.name}${person.personId ? "" : " (guest)"}`,
      }))
    );
  return [
    members.length ? `Present: ${named(members)}` : "",
    others.length ? `${members.length ? "also there" : "Present"}: ${named(others)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Where a proposal stands, in a few words. */
export function proposalStatusText(proposal: Pick<Proposal, "status" | "decideOn" | "consent">) {
  if (proposal.status === "consented" && proposal.consent)
    return `Consented ${longDay(proposal.consent.meeting.date)} at ${
      proposal.consent.meeting.title
    }`;
  if (proposal.status === "withdrawn") return "Withdrawn";
  return `Proposed${proposal.decideOn ? `, to be decided ${longDay(proposal.decideOn)}` : ""}`;
}

/** A link to a page, file or proposal: its place in the export, or else the app. */
function hrefFor(ctx: ExportContext, from: string, kind: ExportKind, id: string, appPath: string) {
  const path = ctx.pathOf(kind, id);
  return path ? relativeLink(from, path) : `${ctx.siteUrl}${appPath}`;
}

const findPage = (ctx: ExportContext, title: string) =>
  ctx.pages.find((page) => page.title.toLowerCase() === title.trim().toLowerCase());

/** As the app finds `[[doc:Title]]`: the named circle's, else this circle's, else any. */
function findDoc(ctx: ExportContext, title: string, circleId: string | null, fromCircleId: string) {
  const matches = ctx.documents.filter((doc) => doc.title.toLowerCase() === title.toLowerCase());
  if (circleId) return matches.find((doc) => doc.circleId === circleId);
  return matches.find((doc) => doc.circleId === fromCircleId) ?? matches[0];
}

type From = { path: string; circleId: string };

/** One line's words: marks, `[[links]]`, photos and links into the app (code spans left alone). */
function inlineMarkdown(line: string, from: From, ctx: ExportContext) {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, index) => (index % 2 ? part : convertWords(part, from, ctx)))
    .join("");
}

function convertWords(text: string, from: From, ctx: ExportContext) {
  return text
    .replace(
      /:mark\[((?:\\.|\[\[[^\]\n]*\]\]|\[[^\]\n]*\]|[^\]\\\n])*)\]\{[^}\n]*\}/g,
      "<mark>$1</mark>"
    )
    .replace(
      /!\[([^\]\n]*)\]\(\/api\/circles\/([a-z0-9-]+)\/wiki\/images\/([0-9a-f-]{36})((?:\s+"[^"\n]*")?)\)/g,
      (_match, alt: string, circleId: string, imageId: string, title: string) => {
        const path = ctx.imagePath(circleId, imageId);
        return `![${alt}](${
          path
            ? relativeLink(from.path, path)
            : `${ctx.siteUrl}/api/circles/${circleId}/wiki/images/${imageId}`
        }${title})`;
      }
    )
    .replace(
      /(\]\()(\/(?!\/)[^)\s]*)/g,
      (_match, open: string, path: string) => `${open}${ctx.siteUrl}${path}`
    )
    .replace(WIKI_LINK, (_match, target: string, label?: string) => {
      const link = parseWikiLink(target, ctx.circles);
      const words = escapeLabel((label ?? link.title).trim());
      if (link.kind === "doc") {
        const doc = findDoc(ctx, link.title, link.circleId, from.circleId);
        return doc
          ? `[${words}](${hrefFor(
              ctx,
              from.path,
              "file",
              doc.id,
              `/api/documents/${doc.id}/file`
            )})`
          : words;
      }
      const page = findPage(ctx, link.title);
      return page
        ? `[${words}](${hrefFor(ctx, from.path, "page", page.id, `/wiki/${page.slug}`)})`
        : words;
    });
}

const quoted = (lines: string[]) => lines.map((line) => (line ? `> ${line}` : ">"));

/** The value of `name="…"` in a directive's attributes. */
const attribute = (attributes: string, name: string) =>
  attributes.match(new RegExp(`(?:^|[\\s{])${name}="([^"\\n]*)"`))?.[1]?.trim();
const directiveId = (attributes: string) =>
  (
    attributes.match(/(?:^|\s)id="?([0-9a-f-]{36})"?/i)?.[1] ??
    attributes.match(/#([0-9a-f-]{36})/i)?.[1]
  )?.toLowerCase() ?? null;

function pollLines(attributes: string, ctx: ExportContext): string[] {
  const id = directiveId(attributes);
  const found = id ? ctx.polls.get(id) : undefined;
  if (!found) return ["*(A poll that's no longer there.)*"];
  const { question, details, poll } = found;
  const votes = new Map<string, number>();
  for (const vote of poll.votes)
    for (const option of vote.optionIds) votes.set(option, (votes.get(option) ?? 0) + 1);
  return [
    `**Poll: ${question}**${pollIsOpen(poll) ? "" : " (closed)"}`,
    ...(details ? ["", details] : []),
    "",
    ...poll.options.map((option) => {
      const count = votes.get(option.id) ?? 0;
      return `- ${option.text} — ${count} ${count === 1 ? "vote" : "votes"}`;
    }),
  ];
}

function proposalLines(attributes: string, from: From, ctx: ExportContext): string[] {
  const id = directiveId(attributes);
  const proposal = id ? ctx.proposals.get(id) : undefined;
  if (!proposal) return ["*(A proposal that's no longer there.)*"];
  const href = hrefFor(ctx, from.path, "proposal", proposal.id, `/proposals/${proposal.id}`);
  const body = proposal.body.replace(PROPOSAL_DIRECTIVE, "").trim();
  return quoted([
    `**Proposal to ${circleName(ctx, proposal.circleId)}: [${escapeLabel(
      proposal.title
    )}](${href})** — ${proposalStatusText(proposal)}`,
    ...(body ? ["", ...bodyLines(body, { ...from, circleId: proposal.circleId }, ctx, 1)] : []),
  ]);
}

function embedLines(attributes: string, from: From, ctx: ExportContext, depth: number): string[] {
  const target = attribute(attributes, "page") ?? "";
  const section = attribute(attributes, "section");
  const link = parseWikiLink(target, ctx.circles);
  const page = link.kind === "page" ? findPage(ctx, link.title) : undefined;
  if (!page) return ["*(A page shown here that's gone.)*"];
  const href = hrefFor(ctx, from.path, "page", page.id, `/wiki/${page.slug}`);
  const heading = `*From [${escapeLabel(
    section ? `${page.title} › ${section}` : page.title
  )}](${href}):*`;
  const content = section ? sectionOf(page.body, section) : page.body;
  if (depth > 0 || !content?.trim()) return [heading];
  return quoted([
    heading,
    "",
    ...bodyLines(content, { path: from.path, circleId: page.keeper }, ctx, depth + 1),
  ]);
}

/** A details block's title: `{title="…"}`, or `[…]`. */
const detailsTitle = (rest: string) =>
  (attribute(rest, "title") ?? rest.match(/^\[([^\]\n]*)\]/)?.[1] ?? "").trim() || "Details";

/** A page's Markdown, its own syntax made plain (see the top of this file). */
function bodyLines(body: string, from: From, ctx: ExportContext, depth = 0): string[] {
  const out: string[] = [];
  // Open blocks: a callout quotes what's inside it.
  const open: ("details" | "callout" | "other")[] = [];
  let fence: string | null = null;
  const push = (...lines: string[]) => {
    const depthQuoted = open.filter((kind) => kind === "callout").length;
    for (const line of lines) {
      let quotedLine = line;
      for (let level = 0; level < depthQuoted; level++)
        quotedLine = quotedLine ? `> ${quotedLine}` : ">";
      out.push(quotedLine);
    }
  };
  for (const line of normalizeWikiLinks(body).replace(/\r\n?/g, "\n").split("\n")) {
    if (fence) {
      push(line);
      if (line.trim().startsWith(fence) && line.trim().replace(/[`~]/g, "") === "") fence = null;
      continue;
    }
    const opens = /^\s*(`{3,}|~{3,})/.exec(line);
    if (opens) {
      fence = opens[1];
      push(line);
      continue;
    }
    const container = /^\s*:{3,}\s*([A-Za-z][\w-]*)(.*)$/.exec(line);
    if (container) {
      const [, name, rest] = container;
      if (name === "details") {
        push(`**${detailsTitle(rest.trim()).replace(/([*_\\<])/g, "\\$1")}**`, "");
        open.push("details");
      } else open.push(name === "callout" ? "callout" : "other");
      continue;
    }
    if (/^\s*:{3,}\s*$/.test(line) && open.length) {
      const closing = open.pop();
      if (closing === "details" || closing === "callout") push("");
      continue;
    }
    const leaf = /^[ \t]*::(poll|proposal|embed)\{([^}\n]*)\}[ \t]*$/i.exec(line);
    if (leaf) {
      const [, name, attributes] = leaf;
      const kind = name.toLowerCase();
      push(
        ...(kind === "poll"
          ? pollLines(attributes, ctx)
          : kind === "proposal"
            ? proposalLines(attributes, from, ctx)
            : embedLines(attributes, from, ctx, depth))
      );
      continue;
    }
    push(inlineMarkdown(line, from, ctx));
  }
  return out;
}

/** A page's (or a proposal's) Markdown made plain, for a file at `from.path`. */
export const convertBody = (body: string, from: From, ctx: ExportContext) =>
  bodyLines(body, from, ctx).join("\n");

// --- Files ------------------------------------------------------------------------------------

/** A page's text without a first heading that only repeats its title (the file's own heading says it). */
export function withoutTitle(body: string, title: string) {
  const first = /^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/.exec(body);
  return first && first[1].trim().toLowerCase() === title.trim().toLowerCase()
    ? body.slice(first[0].length)
    : body;
}

/** A written page as a Markdown file. */
export function pageMarkdown(page: ExportPage, path: string, ctx: ExportContext) {
  const circle = circleName(ctx, page.keeper);
  const stage = pageStage(page);
  const changed = consentState(page) === "changed";
  const meeting = meetingDateOf(page);
  const present = page.present ?? [];
  const notes = [
    meeting ? `Meeting, ${longDay(meeting)}` : "",
    present.length ? presentText(present) : "",
    stage === "consented" && page.consent
      ? `Consented by ${circle} on ${longDay(page.consent.date)}`
      : changed && page.consent
        ? `Edited since ${circle} consented on ${longDay(page.consent.date)}`
        : "",
    stage === "proposed" ? `Proposed to ${circle}` : "",
  ].filter(Boolean);
  const lines = [
    frontMatter([
      ["title", page.title],
      ["circle", circle],
      ["stage", stage],
      ["consented", page.consent?.date],
      ["meeting", meeting],
      ["present", present.map((person) => person.name)],
      ["created", vermontDay(page.createdAt)],
      ["updated", vermontDay(page.updatedAt)],
      ["updated_by", page.updatedBy.name],
      ["source", `${ctx.siteUrl}/wiki/${page.slug}`],
    ]),
    "",
    `# ${page.title}`,
    "",
    ...(notes.length ? [`*${notes.join(" · ")}*`, ""] : []),
    convertBody(withoutTitle(page.body, page.title), { path, circleId: page.keeper }, ctx).trim(),
  ];
  if (page.transcript?.trim())
    lines.push(
      "",
      "<details>",
      "<summary>Transcript</summary>",
      "",
      page.transcript.trim(),
      "",
      "</details>"
    );
  return `${lines.join("\n").trim()}\n`;
}

/** A proposal as a Markdown file: the proposal, the documents it's about, the versions put forward with them, and its consent. */
export function proposalMarkdown(
  proposal: Proposal,
  path: string,
  ctx: ExportContext,
  /**
   * Each document it's about: what it's called, and where it is in the app
   * (null once it's gone); null for one that's gone or can't be seen.
   */
  describe: (ref: Proposal["documents"][number]) => { title: string; appPath: string | null } | null
) {
  const circle = circleName(ctx, proposal.circleId);
  const body = proposal.body.replace(PROPOSAL_DIRECTIVE, "").trim();
  const lines = [
    frontMatter([
      ["title", proposal.title],
      ["circle", circle],
      ["status", proposal.status],
      ["proposed_by", proposal.proposedBy.name],
      ["proposed", vermontDay(proposal.createdAt)],
      ["decide_on", proposal.decideOn],
      ["consented", proposal.consent?.meeting.date],
      ["meeting", proposal.consent?.meeting.title],
      ["source", `${ctx.siteUrl}/proposals/${proposal.id}`],
    ]),
    "",
    `# ${proposal.title}`,
    "",
    `*Proposal to ${circle}, by ${proposal.proposedBy.name}, ${longDay(
      vermontDay(proposal.createdAt)
    )} · ${proposalStatusText(proposal)}*`,
  ];
  if (body) lines.push("", convertBody(body, { path, circleId: proposal.circleId }, ctx).trim());
  if (proposal.documents.length) {
    lines.push("", "## The documents it's about", "");
    for (const ref of proposal.documents) {
      const document = describe(ref);
      const snapshot = snapshotOf(proposal, ref);
      const inExport = ctx.pathOf(ref.kind, ref.id);
      const shown = !document
        ? "A document that's gone"
        : inExport || document.appPath
          ? `[${escapeLabel(document.title)}](${hrefFor(
              ctx,
              path,
              ref.kind,
              ref.id,
              document.appPath ?? ""
            )})`
          : `${escapeLabel(document.title)} (no longer in Documents)`;
      const asDecided = proposal.status === "consented" ? "consented" : "proposed";
      lines.push(
        `- ${shown}${
          document && snapshot
            ? ` — as ${asDecided}: [its snapshot from ${longDay(vermontDay(snapshot.takenAt))}](${
                ctx.siteUrl
              }/proposals/${proposal.id}/snapshots/${snapshot.snapshotId})`
            : ""
        }`
      );
    }
  }
  const versions = proposal.versions ?? [];
  if (versions.length) {
    lines.push("", "## Alternative versions put forward", "");
    for (const version of versions) {
      const page = describe({ kind: "page", id: version.pageId });
      const chosen =
        proposal.status === "consented" ? chosenFor(proposal, version.pageId) : undefined;
      const outcome =
        chosen === undefined
          ? ""
          : chosen === version.perspectiveId
            ? " — **consented**: it became the page"
            : chosen === null
              ? " — set aside (the page as proposed was consented)"
              : " — set aside";
      lines.push(
        `- ${versionOf(version.author)} of ${escapeLabel(
          page?.title ?? "a page that's gone"
        )}: “${escapeLabel(version.name)}” — [as put forward ${longDay(
          vermontDay(version.takenAt)
        )}](${ctx.siteUrl}/proposals/${proposal.id}/snapshots/${version.snapshotId})${outcome}`
      );
    }
  }
  if (proposal.consent)
    lines.push("", "## Consent", "", ...consentLines(proposal.consent, circle, path, ctx));
  return `${lines.join("\n").trim()}\n`;
}

function consentLines(consent: ProposalConsent, circle: string, path: string, ctx: ExportContext) {
  const meeting = consent.meeting;
  const href = hrefFor(ctx, path, meeting.kind, meeting.id, meeting.href);
  return [
    `${circle} consented on ${longDay(meeting.date)}, at [${escapeLabel(meeting.title)}](${href}).`,
    ...(consent.present.length ? ["", `${presentText(consent.present)}.`] : []),
    "",
    `Recorded by ${consent.submittedBy.name}.`,
    ...(consent.note ? ["", `> ${consent.note}`] : []),
  ];
}

/** A link (to a Google Doc, or a web page) as a Markdown file: where it goes, and the text it had. */
export function linkMarkdown(
  doc: {
    title: string;
    circleId: string;
    description: string | null;
    typeLabel: string;
    url: string;
    kindLabel: string;
    addedAt: string;
    addedBy: string;
  },
  text: string,
  ctx: ExportContext
) {
  const fence = "`".repeat(
    Math.max(3, ...Array.from(text.matchAll(/`+/g), (run) => run[0].length + 1))
  );
  return `${[
    frontMatter([
      ["title", doc.title],
      ["circle", circleName(ctx, doc.circleId)],
      ["type", doc.typeLabel],
      ["link", doc.url],
      ["added", vermontDay(doc.addedAt)],
      ["added_by", doc.addedBy],
    ]),
    "",
    `# ${doc.title}`,
    "",
    `A link to a ${doc.kindLabel}: <${doc.url}>`,
    ...(doc.description ? ["", doc.description] : []),
    ...(text.trim()
      ? ["", "## Its text, as read when the link was added", "", `${fence}text`, text.trim(), fence]
      : []),
  ].join("\n")}\n`;
}

/** One thing in the export, as the index lists it. */
export interface IndexItem {
  path: string;
  title: string;
  circle: string;
  /** "Page · consented Oct 8, 2026 · edited …". */
  detail: string;
  description?: string | null;
}

/** The export's README: what's in it, by circle, and anything that couldn't be included. */
export function readmeMarkdown({
  heading,
  exportedBy,
  exportedAt,
  siteUrl,
  items,
  missing,
}: {
  heading: string;
  exportedBy: string;
  exportedAt: string;
  siteUrl: string;
  items: IndexItem[];
  /** What was asked for and isn't here, in a few words each. */
  missing: string[];
}) {
  const circles = Array.from(new Set(items.map((item) => item.circle))).sort((a, b) =>
    a.localeCompare(b)
  );
  const lines = [
    `# ${heading}`,
    "",
    `Exported from Common Pastures (${siteUrl}) on ${longDay(
      vermontDay(exportedAt)
    )} by ${exportedBy}: ${items.length} ${items.length === 1 ? "document" : "documents"}.`,
    "",
    "Written pages, proposals, and links are Markdown (`.md`) files, each starting with its details. Links between them work within this folder; anything not in it links to Common Pastures. Files are their latest versions, as uploaded.",
  ];
  for (const circle of circles) {
    lines.push("", `## ${circle}`, "");
    for (const item of items
      .filter((entry) => entry.circle === circle)
      .sort((a, b) => a.path.localeCompare(b.path))) {
      lines.push(
        `- [${escapeLabel(item.title)}](${relativeLink("README.md", item.path)}) — ${item.detail}`
      );
      if (item.description?.trim())
        lines.push(`  ${item.description.trim().replace(/\s*\n\s*/g, " ")}`);
    }
  }
  if (missing.length)
    lines.push("", "## Not included", "", ...missing.map((entry) => `- ${entry}`));
  return `${lines.join("\n")}\n`;
}
