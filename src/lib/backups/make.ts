import { createHash, randomBytes } from "crypto";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { listKeys, openBinaryStream, writeBinary, writeBinaryStream } from "@/lib/storage";
import { readPages } from "@/lib/wiki/store";
import { visiblePages } from "@/lib/wiki/access";
import { readDirectory } from "@/lib/directory/store";
import { siteUrl } from "@/lib/site-url";
import { financeViewers } from "@/lib/circles/features";
import { todayInVermont } from "@/lib/time";
import { backupReadme, datasetOf, leftOut, leftOutOf, safeName } from "./contents";
import { fetchSiteZip, siteSource } from "./site";
import { timestamp } from "./timestamp";
import { otsKey, recordBackup, zipKey } from "./store";
import type { BackupKind, BackupRecord } from "./shared";

/**
 * Making a backup: every stored object but those left out (`contents.ts`:
 * for a community backup, what not every resident can see; for both kinds,
 * earlier backups and what's temporary), each with its type in the manifest,
 * under `data/`, each page as Markdown under `pages/`, the site's code
 * under `site/` (`site.ts`), and a `manifest.json` and README — streamed
 * into one zip in storage (`backups/<id>.zip`) without holding it whole, its
 * SHA-256 worked out as it goes and then timestamped (`timestamp.ts`). The
 * oldest beyond those kept goes (eight community backups, three complete).
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

async function* backupZip(
  kind: BackupKind,
  root: string,
  at: string,
  onFiles: (count: number) => void,
  onSite: (included: boolean) => void
) {
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

  // The data, key for key (in a community backup, not finances kept to a circle's members).
  const [pages, directory] = await Promise.all([
    readPages().then((all) => (kind === "community" ? visiblePages(all, null) : all)),
    readDirectory(),
  ]);
  const privateFinances = new Set(
    (directory?.circles ?? [])
      .filter((circle) => kind === "community" && financeViewers(circle) !== "everyone")
      .map((circle) => circle.id)
  );
  const objects = (await listKeys()).filter(
    (object) => !leftOut(object.key, privateFinances, kind)
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
  onFiles(objects.length);

  // Each page as Markdown, by circle.
  const circleName = (id: string) =>
    directory?.circles.find((circle) => circle.id === id)?.name ?? id;
  const used = new Set<string>();
  for (const page of pages) {
    let path = `pages/${safeName(circleName(page.keeper))}/${safeName(page.title)}.md`;
    for (let n = 2; used.has(path); n++)
      path = `pages/${safeName(circleName(page.keeper))}/${safeName(page.title)} (${n}).md`;
    used.add(path);
    yield* text(
      path,
      `---\ntitle: ${JSON.stringify(page.title)}\ncircle: ${JSON.stringify(
        circleName(page.keeper)
      )}\nupdated: ${page.updatedAt}\nby: ${JSON.stringify(page.updatedBy.name)}\n---\n\n${
        page.body
      }`,
      "pages-markdown"
    );
  }

  // The site's code.
  const site = await fetchSiteZip();
  if (site) yield* add("site/source.zip", site, false, "site", "application/zip");
  onSite(!!site);

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
        site: siteUrl(),
        madeAt: at,
        code: { included: !!site, ...source },
        layout: {
          "data/": "Every stored object at its storage key: JSON documents, and files as uploaded",
          "pages/":
            "Each written page as Markdown, by circle (front matter: title, circle, updated, by)",
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
      backupZip(
        kind,
        root,
        at,
        (count) => (files = count),
        (included) => (site = included)
      ),
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
