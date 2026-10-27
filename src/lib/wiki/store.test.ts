import { beforeEach, describe, expect, it, vi } from "vitest";

/** Pages in a tree: inside one another, in order, with drafts and a keeper that carries the branch along. */

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
}));
vi.mock("@/lib/directory/store", () => ({ readDirectory: async () => null }));

const store = await import("./store");

const cara = { userId: "u-cara", name: "Cara Cedar" };

async function made(
  title: string,
  extra: { parentId?: string | null; draft?: boolean; keeper?: string; icon?: string } = {}
) {
  const result = await store.createPage(cara, {
    title,
    body: `About ${title}.`,
    keeper: extra.keeper ?? "lcc",
    ...extra,
  });
  if (!result.ok || !result.page) throw new Error(`not made: ${!result.ok ? result.reason : ""}`);
  return result.page;
}

beforeEach(() => {
  docs.clear();
  docs.set("wiki/pages.json", { version: 1, pages: [] });
});

describe("pages in a tree", () => {
  it("starts a page inside another, last among its siblings, kept by the same circle", async () => {
    const mowing = await made("Mowing");
    const may = await made("May", { parentId: mowing.id });
    const june = await made("June", { parentId: mowing.id, icon: "🌱" });
    expect(may.parentId).toBe(mowing.id);
    expect(may.order! < june.order!).toBe(true);
    expect(june.icon).toBe("🌱");
    expect(june.keeper).toBe("lcc");
    const wrongCircle = await store.createPage(cara, {
      title: "Elsewhere",
      body: "",
      keeper: "board",
      parentId: mowing.id,
    });
    expect(wrongCircle).toEqual({ ok: false, reason: "bad_parent" });
    const missing = await store.createPage(cara, {
      title: "Lost",
      body: "",
      keeper: "lcc",
      parentId: "nope",
    });
    expect(missing).toEqual({ ok: false, reason: "bad_parent" });
  });

  it("moves a page to another place or parent, but never inside itself or its own pages", async () => {
    const mowing = await made("Mowing");
    const may = await made("May", { parentId: mowing.id });
    const june = await made("June", { parentId: mowing.id });
    const hedges = await made("Hedges");
    // June before May.
    const moved = await store.movePage(june.slug, { order: "5" });
    expect(moved.ok && moved.page?.order).toBe("5");
    const children = (await store.readPages()).filter((page) => page.parentId === mowing.id);
    expect(
      children.sort((a, b) => (a.order! < b.order! ? -1 : 1)).map((page) => page.title)
    ).toEqual(["June", "May"]);
    // Hedges inside May; May can't go inside Hedges (its own page), nor Mowing inside May.
    expect((await store.movePage(hedges.slug, { parentId: may.id })).ok).toBe(true);
    expect(await store.movePage(may.slug, { parentId: hedges.id })).toEqual({
      ok: false,
      reason: "bad_parent",
    });
    expect(await store.movePage(mowing.slug, { parentId: may.id })).toEqual({
      ok: false,
      reason: "bad_parent",
    });
    expect(await store.movePage(mowing.slug, { parentId: mowing.id })).toEqual({
      ok: false,
      reason: "bad_parent",
    });
    // Back to the top level.
    const top = await store.movePage(hedges.slug, { parentId: null });
    expect(top.ok && top.page?.parentId).toBeNull();
    expect(await store.movePage("nope", { parentId: null })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("moves a page right after a sibling, or first, keeping the others in order", async () => {
    const mowing = await made("Mowing");
    const may = await made("May", { parentId: mowing.id });
    const june = await made("June", { parentId: mowing.id });
    const july = await made("July", { parentId: mowing.id });
    const order = async () =>
      (await store.readPages())
        .filter((page) => page.parentId === mowing.id)
        .sort((a, b) => (a.order! < b.order! ? -1 : 1))
        .map((page) => page.title);
    expect((await store.movePage(july.slug, { after: null })).ok).toBe(true);
    expect(await order()).toEqual(["July", "May", "June"]);
    expect((await store.movePage(may.slug, { after: june.id })).ok).toBe(true);
    expect(await order()).toEqual(["July", "June", "May"]);
    // Into another page, after one of its pages.
    const hedges = await made("Hedges");
    const moved = await store.movePage(hedges.slug, { parentId: mowing.id, after: july.id });
    expect(moved.ok && moved.page?.parentId).toBe(mowing.id);
    expect(await order()).toEqual(["July", "Hedges", "June", "May"]);
  });

  it("takes the branch along when the keeper changes, lifting the page to the top", async () => {
    const mowing = await made("Mowing");
    const may = await made("May", { parentId: mowing.id });
    const deeper = await made("Week one", { parentId: may.id });
    await store.movePage(mowing.slug, { parentId: (await made("Plans")).id });
    const result = await store.updatePage(mowing.slug, cara, { keeper: "board" });
    expect(result.ok && result.page?.keeper).toBe("board");
    expect(result.ok && result.page?.parentId).toBeNull();
    const pages = await store.readPages();
    expect(pages.find((page) => page.id === may.id)?.keeper).toBe("board");
    expect(pages.find((page) => page.id === deeper.id)?.keeper).toBe("board");
    expect(pages.find((page) => page.id === may.id)?.parentId).toBe(mowing.id);
    expect(pages.find((page) => page.title === "Plans")?.keeper).toBe("lcc");
  });

  it("starts a draft for its author, and publishes it", async () => {
    const draft = await made("Thoughts", { draft: true });
    expect(draft.draft).toEqual({ by: "u-cara" });
    const published = await store.publishPage(draft.slug);
    expect(published.ok && published.page?.draft).toBeUndefined();
    expect(published.ok && (published.page?.updatedAt ?? "") >= draft.updatedAt).toBe(true);
    const again = await store.publishPage(draft.slug);
    expect(again.ok && again.page?.draft).toBeUndefined();
    expect(await store.publishPage("nope")).toEqual({ ok: false, reason: "not_found" });
  });

  it("keeps an icon and the width as settings, not versions", async () => {
    const page = await made("Mowing");
    const result = await store.updatePage(page.slug, cara, { icon: "🌿", fullWidth: true });
    expect(result.ok && result.page).toMatchObject({
      icon: "🌿",
      fullWidth: true,
      historyCount: 0,
    });
    const cleared = await store.updatePage(page.slug, cara, { icon: null });
    expect(cleared.ok && cleared.page?.icon).toBeNull();
    expect(store.pageSummary(result.ok ? result.page! : page)).toMatchObject({
      icon: "🌿",
      fullWidth: true,
    });
  });
});
