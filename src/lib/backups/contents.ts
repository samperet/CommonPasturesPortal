import type { BackupKind } from "./shared";

/**
 * What goes in a backup, and how it's described (pure, for tests). Each
 * stored object goes under `data/` at its storage key, described by the
 * dataset it belongs to in `manifest.json` and the README.
 *
 * An export can be made of only some of it: the parts a person picks
 * (`EXPORT_PARTS`), each a set of datasets (`partOf`). With documents, the
 * zip also has them readable — `documents/`, pages as Markdown with their
 * formatting, files by name (`lib/documents/export.ts`).
 *
 * A **community** backup (the weekly one, sent to residents who sign up)
 * holds what every resident can see: it also leaves out private messages,
 * the app's push key and devices, what only admins see (the sign-in and email
 * logs, feedback, invitations), and circles' finances kept to their members.
 * A **complete** backup (admins only, never sent anywhere) holds everything
 * a restore needs; both leave out earlier backups and what's only temporary.
 */

type Rule = { prefix: string; why: string };

/** Left out of every backup, and why. */
export const ALWAYS_LEFT_OUT: Rule[] = [
  { prefix: "backups/", why: "earlier backups, and who signed up for them" },
  { prefix: "exports/", why: "temporary document exports" },
  { prefix: "presence/", why: "who's online (it changes every minute)" },
  { prefix: "wiki/presence.json", why: "who's editing (it changes every few seconds)" },
  { prefix: "documents/uploads/", why: "unfinished uploads" },
  { prefix: "auth/sign-in-links", why: "sign-in links (secrets that last minutes)" },
  { prefix: "email-sink.json", why: "test emails (only on a developer's machine)" },
];

/** Also left out of the community backup residents get, and why. */
export const FOR_RESIDENTS_LEFT_OUT: Rule[] = [
  { prefix: "chat/", why: "private messages between two residents" },
  { prefix: "push/vapid.json", why: "the app's push-notification key (a secret)" },
  { prefix: "push/subscriptions.json", why: "devices' push addresses and keys" },
  { prefix: "auth/sign-in-log.json", why: "who signed in when (only admins see it)" },
  { prefix: "auth/last-seen.json", why: "when each resident was last seen (only admins see it)" },
  { prefix: "email/log.json", why: "the email log (only admins see it)" },
  { prefix: "email/quota.json", why: "emails sent this month (only admins see it)" },
  {
    prefix: "notifications/",
    why: "who each notification went to, and who turned what on or off (only admins see it)",
  },
  {
    prefix: "email/settings.json",
    why: "email's test mode and its addresses (only admins see them)",
  },
  { prefix: "feedback/", why: "feedback reports (only admins see them)" },
  { prefix: "onboarding/invitations.json", why: "invitations to join, with their links (secrets)" },
];

/** What a backup of this kind leaves out, by prefix. */
export const leftOutOf = (kind: BackupKind) =>
  kind === "complete" ? ALWAYS_LEFT_OUT : [...ALWAYS_LEFT_OUT, ...FOR_RESIDENTS_LEFT_OUT];

/** Where a circle's finances are kept: its document, and its receipts. */
const FINANCES = /^circles\/finances\/([^/]+?)(?:\.json$|\/)/;

/**
 * Whether a stored object is left out of a backup of this kind (and why), or
 * null if it goes in. `privateFinances`: the circles whose Finances module
 * only their members and the Board see — left out of community backups.
 */
export function leftOut(
  key: string,
  privateFinances: ReadonlySet<string> = new Set(),
  kind: BackupKind = "community"
): string | null {
  if (/^circles\/finances\/[^/]+\/uploads\//.test(key)) return "unfinished uploads";
  const finances = FINANCES.exec(key);
  if (kind === "community" && finances && privateFinances.has(finances[1]))
    return "finances only the circle's members and the Board see";
  return leftOutOf(kind).find((rule) => key.startsWith(rule.prefix))?.why ?? null;
}

/** The datasets, by storage key (most specific first): what each holds, for people and agents. */
const DATASETS: [RegExp, string, string][] = [
  [/^directory\//, "directory", "Residents: names, units, contact details, households (JSON)"],
  [
    /^circles\/circles\.json$/,
    "circles",
    "Circles: members (seats), pages (modules), join rules (JSON)",
  ],
  [
    /^circles\/finances\//,
    "finances",
    "Circle finances: expenses in whole cents, budgets, receipts",
  ],
  [/^circles\/eggs\//, "eggs", "Duty schedules' daily counts, and photos of the printed calendars"],
  [/^circles\/schedules\//, "schedules", "Duty rotations (JSON)"],
  [/^circles\//, "circles", "Circle icons and settings"],
  [
    /^wiki\/pages\.json$/,
    "pages",
    "Written pages (Markdown bodies), with their circle and history count (JSON)",
  ],
  [/^wiki\/history\//, "page-history", "Earlier versions of each page (JSON)"],
  [/^wiki\/comments\//, "page-comments", "Comments on pages (JSON)"],
  [/^wiki\/perspectives\//, "page-versions", "Alternative versions of pages (JSON)"],
  [/^wiki\//, "wiki", "Polls in pages, the trash, who follows which pages, mentions (JSON)"],
  [/^wiki-images\//, "page-photos", "Photos in pages"],
  [/^documents\/files\//, "files", "Uploaded files, every version (as uploaded)"],
  [/^documents\//, "documents", "Uploaded files' details, extracted text, and types (JSON)"],
  [/^proposals\/snapshots\//, "proposal-snapshots", "Documents as they were when proposed"],
  [/^proposals\//, "proposals", "Proposals and their consent (JSON)"],
  [/^tasks\/|^task-comments\//, "tasks", "Circle tasks and their comments (JSON)"],
  [/^logs\//, "logs", "Circle logs (JSON)"],
  [/^groups\//, "circle-forums", "Circle forums: conversations and polls (JSON)"],
  [/^forum\//, "forum", "Community forum discussions (JSON)"],
  [/^alerts\//, "alerts", "Alerts sent from circles (JSON)"],
  [/^library\//, "loan-library", "Things residents lend, with photos"],
  [/^photos\//, "photos", "Shared photos"],
  [/^profiles\//, "profiles", "Residents' profiles and photos"],
  [/^homes\//, "homes-for-sale", "Homes for sale, with photos"],
  [/^me\//, "starred-and-recent", "Each account's starred and recent documents (JSON)"],
  [/^auth\//, "accounts", "Accounts and who the admins are (JSON)"],
  [/^email\//, "email", "Residents' email choices (JSON)"],
  [/^push\//, "notifications", "Notification choices (JSON)"],
  [/^onboarding\//, "onboarding", "New member invitations and welcome resources (JSON)"],
];

/** What an export can be made of: the parts a person picks, in the order they're offered. */
export const EXPORT_PARTS = {
  documents: {
    label: "Documents",
    about:
      "Pages as readable Markdown, uploaded files by name, links, proposals, photos in pages, and their history and comments",
  },
  photos: { label: "Photos", about: "The shared photo gallery" },
  people: {
    label: "Directory and circles",
    about: "Residents, households, profiles and their photos, skills, circles and their members",
  },
  conversations: {
    label: "Conversations",
    about: "The forum, circle forums, alerts, appreciations and recommendations",
  },
  work: { label: "Circle work", about: "Tasks, logs, duty schedules and circles' finances" },
  other: {
    label: "Everything else",
    about: "The loan library, homes for sale, accounts and settings",
  },
  code: { label: "The site's code", about: "The Portal's own code, to run it again" },
} as const;
export type ExportPart = keyof typeof EXPORT_PARTS;
export const ALL_PARTS = Object.keys(EXPORT_PARTS) as ExportPart[];

/** Which part each dataset is in (any not named: "other"). */
const PART_OF: Record<string, ExportPart> = {
  pages: "documents",
  "page-history": "documents",
  "page-comments": "documents",
  "page-versions": "documents",
  wiki: "documents",
  "wiki-polls": "documents",
  "wiki-comments": "documents",
  "page-photos": "documents",
  files: "documents",
  documents: "documents",
  "proposal-snapshots": "documents",
  proposals: "documents",
  outline: "documents",
  photos: "photos",
  directory: "people",
  circles: "people",
  profiles: "people",
  skills: "people",
  cars: "people",
  onboarding: "people",
  forum: "conversations",
  "circle-forums": "conversations",
  alerts: "conversations",
  chat: "conversations",
  appreciations: "conversations",
  resources: "conversations",
  tasks: "work",
  logs: "work",
  finances: "work",
  eggs: "work",
  schedules: "work",
};

/** The part a dataset belongs to. */
export const partOf = (dataset: string): ExportPart => PART_OF[dataset] ?? "other";

/** Every part, or not. */
export const isEverything = (parts: readonly ExportPart[]) =>
  ALL_PARTS.every((part) => parts.includes(part));

/** Which dataset a stored object belongs to, and what that dataset is. */
export function datasetOf(key: string): { dataset: string; about: string } {
  const found = DATASETS.find(([pattern]) => pattern.test(key));
  return found
    ? { dataset: found[1], about: found[2] }
    : { dataset: key.split("/")[0], about: "Other app data" };
}

/** A safe file or folder name (no slashes or characters file systems refuse). */
export const safeName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "Untitled";

/** How the readable documents fared: in the zip, too big to copy twice, or not asked for. */
export type ReadableDocuments = "included" | "too big" | "not chosen";

/** The README at the top of a backup (or an export of some of it). */
export function backupReadme(info: {
  at: string;
  kind: BackupKind;
  siteUrl: string;
  files: number;
  site: { included: boolean; repository: string | null; commit: string | null };
  datasets: { dataset: string; about: string; files: number }[];
  /** The parts in it (every part, unless it's an export of some). */
  parts?: readonly ExportPart[];
  documents?: ReadableDocuments;
}) {
  const complete = info.kind === "complete";
  const parts = info.parts ?? ALL_PARTS;
  const some = !isEverything(parts);
  const documents = info.documents ?? "included";
  return `# Common Pastures (CVC) — ${
    complete ? "complete backup" : some ? "export" : "backup"
  } of ${info.at}

${
  complete
    ? "Everything the app needs to be restored, as of this moment, from " +
      `${info.siteUrl}. A complete backup is for CVC's admins only.`
    : `${
        some ? "Some of what" : "Everything"
      } every resident can see in the app, as of this moment, from ${info.siteUrl}.`
}${
    some
      ? `\n\nIt holds only what was chosen: ${parts
          .map((part) => EXPORT_PARTS[part].label.toLowerCase())
          .join(", ")}.`
      : ""
  }
${
  documents === "included"
    ? `
- **\`documents/\`** — the documents, to read without the app: each page as Markdown with its
  formatting (headings, lists, tables, highlights, links between pages that work in the folder),
  in a folder for its circle; uploaded files by name, as their latest version; links and
  proposals as short notes; photos in pages in \`images/\`; and a README listing them all.`
    : documents === "too big"
      ? `
- **\`documents/\`** — left out: the files are too many to copy twice. They're all under
  \`data/documents/files/\`, and the pages' Markdown is in \`data/wiki/pages.json\`.`
      : ""
}
- **\`data/\`** — every stored object (${info.files} files), each at its storage key: the app's
  data as JSON documents, and uploaded files and photos as they were uploaded. This is what the
  app reads; it can be restored to a bucket key for key (each file's type is in the manifest).
- **\`manifest.json\`** — for agents and scripts: every file's path, size, type, SHA-256 and
  dataset, what each dataset holds, and what's left out.
- **\`site/\`** — ${
    info.site.included
      ? `the app's code (\`source.zip\`, ${info.site.repository} at ${info.site.commit}).`
      : `the app's code wasn't included${
          info.site.repository
            ? ` (it's at ${info.site.repository}${info.site.commit ? `, ${info.site.commit}` : ""})`
            : ""
        }.`
  }

## What it holds

${info.datasets
  .map((entry) => `- **${entry.dataset}** (${entry.files}) — ${entry.about}`)
  .join("\n")}

## Left out

${leftOutOf(info.kind)
  .map((rule) => `- \`${rule.prefix}\` — ${rule.why}`)
  .join("\n")}
- unfinished uploads to circles' finances${
    complete ? "" : "\n- the finances of circles that keep them to their members and the Board"
  }

## Keep it safe

${
  complete
    ? "It holds everything: residents' contact details, private messages between residents, " +
      "admins' logs, every circle's finances, and the app's push-notification key. Keep it " +
      "where only CVC's admins can read it, and delete copies you don't need."
    : "It holds residents' names, contact details and households, circles' finances (those " +
      "every resident can see), and everything written in the app. Store it where only you " +
      "can read it."
}

${
  some
    ? ""
    : `## Proving it

The zip's SHA-256 fingerprint was timestamped with OpenTimestamps (anchored in Bitcoin): the
\`.ots\` proof beside it, from the backups page, shows it existed unchanged on this date —
\`ots verify backup.zip.ots\` (https://opentimestamps.org).
`
}`;
}
