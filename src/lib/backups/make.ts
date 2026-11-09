import { createHash, randomBytes } from "crypto";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { listKeys, openBinaryStream, writeBinary, writeBinaryStream } from "@/lib/storage";
import { readDirectory } from "@/lib/directory/store";
import type { Actor } from "@/lib/auth/actor";
import { keepExport, planExport } from "@/lib/documents/export";
import { readmeMarkdown, type IndexItem } from "@/lib/documents/export-markdown";
import { siteUrl } from "@/lib/site-url";
import { financeViewers } from "@/lib/circles/features";
import { todayInVermont } from "@/lib/time";
import {
  ALL_PARTS,
  backupReadme,
  datasetOf,
  leftOut,
  leftOutOf,
  partOf,
  type ExportPart,
  type ReadableDocuments,
} from "./contents";
import { fetchSiteZip, siteSource } from "./site";
import { timestamp } from "./timestamp";
import { otsKey, recordBackup, zipKey } from "./store";
import type { BackupKind, BackupRecord } from "./shared";

/**
 * Making a backup: every stored object but those left out (`contents.ts`:
 * for a community backup, what not every resident can see; for both kinds,
 * earlier backups and what's temporary), each with its type in the manifest,
 * under `data/`; the documents to read without the app under `documents/`
 * — pages as Markdown with their formatting, files by name, links and
 * proposals as notes, photos in pages, made as the Documents page's export
 * makes them (`lib/documents/export.ts`), published pages only; the site's
 * code under `site/` (`site.ts`); and a `manifest.json` and README —
 * streamed into one zip in storage (`backups/<id>.zip`) without holding it
 * whole, its SHA-256 worked out as it goes and then timestamped
 * (`timestamp.ts`). The oldest beyond those kept goes (eight community
 * backups, three complete).
 *
 * An export (`makeExport`) is the same zip made of only the parts someone
 * picked (`EXPORT_PARTS`): not kept as a backup, sent to nobody, kept a day
 * for its maker to download, as the Documents page's exports are.
 */

export type ManifestFile = {
  path: string;
  bytes: number;
  sha256: string;
  dataset: string;
  /** As stored (what the app serves it as); restored with it. */
  contentType: string;
};

/** The bytes as they pass, into a hash too. */
async function* hashing(chunks: AsyncIterable<Uint8Array>, into: ReturnType<typeof createHash>) {
  for await (const chunk of chunks) {
    into.update(chunk);
    yield chunk;
  }
}

/** A readable file's type, by its name. */
const typeOfPath = (path: string) =>
  ({
    md: "text/markdown; charset=utf-8",
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    csv: "text/csv",
    txt: "text/plain",
  })[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

interface ZipJob {
  kind: BackupKind;
  /** The folder everything's in. */
  root: string;
  at: string;
  /** Who's making it ("the weekly schedule", or an admin's name). */
  by: string;
  parts: readonly ExportPart[];
  onFiles?: (count: number) => void;
  onSite?: (included: boolean) => void;
}

async function* backupZip({ kind, root, at, by, parts, onFiles, onSite }: ZipJob) {
  const chosen = new Set(parts);
  const ready: Uint8Array[] = [];
  const state: { failure: Error | null } = { failure: null };
  const zip = new Zip((error, chunk) => {
    if (error) state.failure = error;
    else ready.push(chunk);
  });
  const when = new Date(at);
  const start = (path: string, compress: boolean) => {
    const file = compress
      ? new ZipDeflate(`${root}/${path}`, { level: 6 })
      : new ZipPassThrough(`${root}/${path}`);
    file.mtime = when;
    zip.add(file);
    return file;
  };
  const files: ManifestFile[] = [];
  const counts = new Map<string, { about: string; files: number }>();

  /** One file into the zip, from a stream, noting its size and fingerprint. */
  async function* add(
    path: string,
    source: AsyncIterable<Uint8Array>,
    compress: boolean,
    dataset: string,
    contentType: string
  ) {
    const file = start(path, compress);
    const hash = createHash("sha256");
    let bytes = 0;
    for await (const chunk of source) {
      const piece = new Uint8Array(chunk);
      hash.update(piece);
      bytes += piece.length;
      file.push(piece);
      while (ready.length) yield ready.shift()!;
      if (state.failure) throw state.failure;
    }
    file.push(new Uint8Array(0), true);
    files.push({ path, bytes, sha256: hash.digest("hex"), dataset, contentType });
    while (ready.length) yield ready.shift()!;
    if (state.failure) throw state.failure;
  }
  const text = (path: string, content: string, dataset: string) =>
    add(
      path,
      (async function* () {
        yield strToU8(content);
      })(),
      true,
      dataset,
      path.endsWith(".json") ? "application/json" : "text/markdown; charset=utf-8"
    );

  // The data, key for key (in a community backup, not finances kept to a circle's members), of the parts chosen.
  const directory = await readDirectory();
  const privateFinances = new Set(
    (directory?.circles ?? [])
      .filter((circle) => kind === "community" && financeViewers(circle) !== "everyone")
      .map((circle) => circle.id)
  );
  const objects = (await listKeys()).filter(
    (object) =>
      !leftOut(object.key, privateFinances, kind) &&
      chosen.has(partOf(datasetOf(object.key).dataset))
  );
  for (const object of objects) {
    const source = await openBinaryStream(object.key);
    if (!source) continue;
    const { dataset, about } = datasetOf(object.key);
    counts.set(dataset, { about, files: (counts.get(dataset)?.files ?? 0) + 1 });
    yield* add(
      `data/${object.key}`,
      source.chunks,
      object.key.endsWith(".json"),
      dataset,
      source.contentType
    );
  }
  onFiles?.(objects.length);

  // The documents, to read without the app: as the Documents page exports them all, as a
  // resident sees them (published pages only), each page as Markdown with its formatting.
  let documents: ReadableDocuments = "not chosen";
  if (chosen.has("documents") && directory) {
    const reader: Actor = { userId: "", personId: null, name: by, admin: false };
    const plan = await planExport({ all: true }, { actor: reader, directory });
    if ("error" in plan) documents = plan.error === "too_big" ? "too big" : "not chosen";
    else {
      documents = "included";
      const listed: IndexItem[] = [];
      const missing = [...plan.missing];
      for (const entry of plan.entries) {
        const path = `documents/${entry.path}`;
        if (typeof entry.content === "string")
          yield* text(path, entry.content, "documents-readable");
        else {
          const source = await entry.content();
          if (!source) {
            if (entry.item)
              missing.push(
                `${entry.item.title} (${entry.item.circle}): its file couldn't be found`
              );
            continue;
          }
          yield* add(path, source, false, "documents-readable", typeOfPath(path));
        }
        if (entry.item) listed.push(entry.item);
      }
      yield* text(
        "documents/README.md",
        readmeMarkdown({
          heading: "CVC's documents",
          exportedBy: by,
          exportedAt: at,
          siteUrl: siteUrl(),
          items: listed,
          missing,
        }),
        "documents-readable"
      );
    }
  }

  // The site's code.
  const site = chosen.has("code") ? await fetchSiteZip() : null;
  if (site) yield* add("site/source.zip", site, false, "site", "application/zip");
  onSite?.(!!site);

  const source = siteSource();
  const datasets = Array.from(counts, ([dataset, entry]) => ({ dataset, ...entry })).sort((a, b) =>
    a.dataset.localeCompare(b.dataset)
  );
  yield* text(
    "manifest.json",
    JSON.stringify(
      {
        app: "Common Pastures — a Champlain Valley Cohousing development (CVC)",
        kind,
        parts,
        site: siteUrl(),
        madeAt: at,
        code: { included: !!site, ...source },
        layout: {
          "data/": "Every stored object at its storage key: JSON documents, and files as uploaded",
          "documents/":
            "The documents to read without the app: pages as Markdown (front matter, then the page), files by name, links and proposals as notes, photos in pages, and a README listing them by circle",
          "site/source.zip": "The app's code at the deployed commit, when included",
        },
        datasets,
        leftOut: [
          ...leftOutOf(kind),
          { prefix: "circles/finances/*/uploads/", why: "unfinished uploads" },
          ...Array.from(privateFinances, (id) => ({
            prefix: `circles/finances/${id}`,
            why: "finances only the circle's members and the Board see",
          })),
        ],
        files,
      },
      null,
      2
    ),
    "manifest"
  );
  yield* text(
    "README.md",
    backupReadme({
      at: todayInVermont(),
      kind,
      siteUrl: siteUrl(),
      files: objects.length,
      site: { included: !!site, repository: source.repository, commit: source.commit },
      datasets,
      parts,
      documents,
    }),
    "readme"
  );
  zip.end();
  while (ready.length) yield ready.shift()!;
  if (state.failure) throw state.failure;
}

/**
 * Make a backup now (`by`: "the weekly schedule", or an admin's name), keep
 * it, and timestamp it. `kind`: what every resident can see, or (admins
 * only) everything a restore needs.
 */
export async function makeBackup(
  by: string,
  kind: BackupKind = "community"
): Promise<BackupRecord> {
  const at = new Date().toISOString();
  const id = `${todayInVermont()}-${randomBytes(3).toString("hex")}`;
  const root = `cvc-${kind === "complete" ? "complete-backup" : "backup"}-${todayInVermont()}`;
  const hash = createHash("sha256");
  let files = 0;
  let site = false;
  const bytes = await writeBinaryStream(
    zipKey(id),
    hashing(
      backupZip({
        kind,
        root,
        at,
        by,
        parts: ALL_PARTS,
        onFiles: (count) => (files = count),
        onSite: (included) => (site = included),
      }),
      hash
    ),
    "application/zip"
  );
  const digest = hash.digest();
  const proof = await timestamp(new Uint8Array(digest));
  if (proof)
    await writeBinary(otsKey(id), {
      bytes: proof,
      contentType: "application/vnd.opentimestamps.v1",
    });
  const record: BackupRecord = {
    id,
    kind,
    at,
    by,
    bytes,
    sha256: digest.toString("hex"),
    files,
    site,
    timestamped: !!proof,
  };
  await recordBackup(record);
  return record;
}

/**
 * Export some of what every resident can see (`parts`), for `userId` to
 * download: the same zip as a backup's, of only those parts — not kept as a
 * backup, sent to nobody, timestamped by nobody; kept a day, then deleted.
 */
export async function makeExport(by: string, userId: string, parts: readonly ExportPart[]) {
  const day = todayInVermont();
  return keepExport(
    userId,
    `CVC export ${day}.zip`,
    backupZip({
      kind: "community",
      root: `cvc-export-${day}`,
      at: new Date().toISOString(),
      by,
      parts,
    })
  );
}
