import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutlineClient } from "./client";

/** The import, against a fake Outline: circles made, pages placed in the tree, titles kept apart, re-runs idempotent. */

const docs = new Map<string, unknown>();
vi.mock("@/lib/storage", () => ({
  readJson: async (key: string) => structuredClone(docs.get(key) ?? null),
  mutateJson: async (
    key: string,
    change: (current: unknown) => { value?: unknown; result: unknown; write?: boolean }
  ) => {
    const next = change(structuredClone(docs.get(key) ?? null));
    if ("value" in next) docs.set(key, next.value);
    return next.result;
  },
  deleteJson: async (key: string) => void docs.delete(key),
  writeBinary: async () => undefined,
  deleteBinary: async () => undefined,
  readOrSeedJson: async (
    key: string,
    normalize: (raw: unknown) => unknown,
    seed: () => unknown
  ) => {
    if (!docs.has(key)) docs.set(key, seed());
    return normalize(structuredClone(docs.get(key)));
  },
}));
vi.mock("@/lib/directory/store", () => ({
  readDirectory: async () => null,
  readImportedDirectory: async () => null,
}));
vi.mock("@/lib/auth/users", () => ({
  listUsers: async () => [
    { id: "u-cara", personId: "000000000003", name: "Cara Cedar", createdAt: "" },
  ],
}));
vi.mock("@/lib/wiki/images", () => ({
  saveWikiImage: async () => "img-1",
  wikiImageUrl: (circleId: string, id: string) => `/api/circles/${circleId}/wiki/images/${id}`,
}));

const store = await import("@/lib/wiki/store");
const comments = await import("@/lib/wiki/comments");
const { startImport, continueImport, planImport, readImportState } = await import("./import");

const cara = { id: "u-cara", name: "Cara Cedar", email: "cara@example.org" };
const stranger = { id: "u-x", name: "Xavier Yew", email: "x@example.net" };
const collection = {
  id: "c-board",
  urlId: "z0eYn0zG77",
  name: "CVC Board",
  description: "Board business",
};
const lcc = { id: "c-lcc", urlId: "LcC00000aa", name: "Land Care Circle", description: null };
const outlineDocs: Record<string, object> = {
  "d-charter": {
    id: "d-charter",
    urlId: "AbCdEf1234",
    url: "/doc/board-charter-AbCdEf1234",
    title: "Board charter",
    icon: "📜",
    text: "The Board ==keeps the books==.\n\nSee [the bylaws](/doc/bylaws-GhIjKl5678).\n\n![barn](/api/attachments.redirect?id=att-1)",
    collectionId: "c-board",
    parentDocumentId: null,
    createdAt: "2026-01-05T10:00:00.000Z",
    updatedAt: "2026-02-01T09:30:00.000Z",
    createdBy: cara,
    updatedBy: stranger,
  },
  "d-bylaws": {
    id: "d-bylaws",
    urlId: "GhIjKl5678",
    url: "/doc/bylaws-GhIjKl5678",
    title: "Bylaws",
    icon: null,
    text: "Rules. Back to [the charter](/doc/board-charter-AbCdEf1234).",
    collectionId: "c-board",
    parentDocumentId: "d-charter",
    createdAt: "2026-01-06T10:00:00.000Z",
    updatedAt: "2026-01-20T09:30:00.000Z",
    createdBy: stranger,
    updatedBy: stranger,
  },
  "d-mowing": {
    id: "d-mowing",
    urlId: "StUvWx3456",
    url: "/doc/mowing-StUvWx3456",
    title: "Mowing",
    icon: null,
    text: "Clashes with CVC's Mowing.",
    collectionId: "c-lcc",
    parentDocumentId: null,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-02T10:00:00.000Z",
    createdBy: cara,
    updatedBy: cara,
  },
};
const trees: Record<string, unknown> = {
  "c-board": [
    {
      id: "d-charter",
      title: "Board charter",
      url: "",
      children: [{ id: "d-bylaws", title: "Bylaws", url: "", children: [] }],
    },
  ],
  "c-lcc": [{ id: "d-mowing", title: "Mowing", url: "", children: [] }],
};
const calls: string[] = [];
const client: OutlineClient = {
  host: "https://wiki.example",
  call: async (method, body) => {
    calls.push(method);
    if (method === "collections.documents") return trees[(body as { id: string }).id] as never;
    if (method === "documents.info") return outlineDocs[(body as { id: string }).id] as never;
    throw new Error(`unexpected ${method}`);
  },
  listAll: async (method, body) => {
    calls.push(method);
    if (method === "collections.list") return [collection, lcc] as never;
    if (method === "documents.list") {
      if ((body as { template?: boolean }).template) return [] as never;
      return Object.values(outlineDocs).filter(
        (doc) =>
          (doc as { collectionId: string }).collectionId ===
          (body as { collectionId: string }).collectionId
      ) as never;
    }
    if (method === "comments.list")
      return (
        (body as { documentId: string }).documentId === "d-charter"
          ? [
              {
                id: "cm-1",
                documentId: "d-charter",
                parentCommentId: null,
                createdBy: stranger,
                createdAt: "2026-01-10T10:00:00.000Z",
                data: {
                  type: "doc",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Monthly?" }] }],
                },
              },
              {
                id: "cm-2",
                documentId: "d-charter",
                parentCommentId: "cm-1",
                createdBy: cara,
                createdAt: "2026-01-11T10:00:00.000Z",
                data: {
                  type: "doc",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Yes." }] }],
                },
              },
            ]
          : []
      ) as never;
    throw new Error(`unexpected ${method}`);
  },
  attachment: async (id) =>
    id === "att-1"
      ? {
          bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]),
          contentType: "image/png",
          fileName: "barn.png",
        }
      : null,
};
const directory = {
  people: [{ id: "000000000003", displayName: "Cara Cedar", email: "cara@example.org" }],
  households: [],
  circles: [
    { id: "community", name: "Community", seats: [] },
    { id: "lcc", name: "Land Care Circle", seats: [{ personId: "000000000003" }] },
  ],
} as never;
const ctx = {
  directory,
  imported: [],
  actor: { userId: "u-cara", personId: "000000000003", name: "Cara Cedar", admin: true },
};

beforeEach(() => {
  docs.clear();
  calls.length = 0;
  docs.set("wiki/pages.json", { version: 1, pages: [] });
  // The circles as managed here (seeded from the directory in the app).
  docs.set("circles/circles.json", {
    circles: [
      { id: "community", name: "Community", description: null, seats: [] },
      { id: "lcc", name: "Land Care Circle", description: null, seats: [] },
    ],
  });
});

describe("importing an Outline wiki", () => {
  it("plans: each collection with its count and the circle it becomes", async () => {
    const plan = await planImport(client, directory);
    expect(plan.collections).toEqual([
      { id: "c-board", name: "CVC Board", documents: 2, circle: null },
      {
        id: "c-lcc",
        name: "Land Care Circle",
        documents: 1,
        circle: { id: "lcc", name: "Land Care Circle" },
      },
    ]);
  });

  it("brings documents over as nested pages, keeps titles apart, settles links, keeps comments and images", async () => {
    await store.createPage(ctx.actor, { title: "Mowing", body: "CVC's own.", keeper: "lcc" });
    const state = await startImport(client, ctx);
    expect(state.errors).toEqual([]);
    expect(state.finishedAt).toBeTruthy();
    expect(state.created).toBe(3);
    const pages = await store.readPages();
    const charter = pages.find((page) => page.title === "Board charter")!;
    const bylaws = pages.find((page) => page.title === "Bylaws")!;
    expect(charter.keeper).toBe(bylaws.keeper);
    expect(charter.keeper).not.toBe("lcc");
    expect(state.circlesMade).toEqual(["CVC Board"]);
    expect(bylaws.parentId).toBe(charter.id);
    expect(charter.icon).toBe("📜");
    expect(charter.createdBy).toEqual({ userId: "u-cara", name: "Cara Cedar" });
    expect(charter.updatedBy).toEqual({ userId: "outline:u-x", name: "Xavier Yew" });
    expect(charter.updatedAt).toBe("2026-02-01T09:30:00.000Z");
    expect(charter.body).toContain(':mark[keeps the books]{color="yellow"}');
    expect(charter.body).toContain("![barn](/api/circles/");
    // The charter linked to the bylaws before the bylaws existed: settled at the end.
    expect(charter.body).toContain("[[Bylaws|the bylaws]]");
    expect(bylaws.body).toContain("[[Board charter|the charter]]");
    expect(state.pendingLinks).toEqual([]);
    const mowing = pages.filter((page) => page.title.startsWith("Mowing"));
    expect(mowing.map((page) => page.title).sort()).toEqual(["Mowing", "Mowing (from the wiki)"]);
    expect(state.renamed).toEqual([{ outlineTitle: "Mowing", title: "Mowing (from the wiki)" }]);
    expect(state.unmatchedAuthors).toEqual(["Xavier Yew"]);
    expect(state.images).toBe(1);
    const thread = await comments.listComments(charter.id);
    expect(thread.map((comment) => [comment.body, comment.parentId, comment.authorName])).toEqual([
      ["Monthly?", null, "Xavier Yew"],
      ["Yes.", "outline:cm-1", "Cara Cedar"],
    ]);
    expect(state.comments).toBe(2);

    // Again: nothing doubled, nothing re-uploaded.
    const before = calls.filter((call) => call === "documents.info").length;
    const again = await startImport(client, ctx);
    expect(again.created).toBe(0);
    expect(again.unchanged + again.updated).toBe(3);
    expect((await store.readPages()).length).toBe(4);
    expect((await comments.listComments(charter.id)).length).toBe(2);
    expect(calls.filter((call) => call === "documents.info").length).toBeGreaterThan(before);
    expect((await readImportState()).images).toBe(0); // counted per run; the image wasn't fetched again
    expect(Object.keys((await readImportState()).attachments)).toEqual(["att-1"]);
  });

  it("goes in batches and can be carried on", async () => {
    const state = await (async () => {
      const first = await startImport(client, ctx);
      return first;
    })();
    expect(state.finishedAt).toBeTruthy();
    const resumed = await continueImport(client, ctx, undefined, 1);
    expect(resumed.finishedAt).toBeTruthy();
  });
});
