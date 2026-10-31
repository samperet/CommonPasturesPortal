import { describe, expect, it } from "vitest";
import { backupReadme, datasetOf, leftOut, leftOutOf, safeName } from "./contents";

describe("backup contents", () => {
  it("leaves out private messages, secrets and what's temporary", () => {
    expect(leftOut("chat/conversations/a-b.json")).toBe("private messages between two residents");
    expect(leftOut("chat/people/000000000001.json")).not.toBeNull();
    expect(leftOut("auth/sign-in-links-2.json")).not.toBeNull();
    expect(leftOut("push/vapid.json")).not.toBeNull();
    expect(leftOut("notifications/log/2026-10-30.json")).not.toBeNull();
    expect(leftOut("notifications/changes.json")).not.toBeNull();
    expect(leftOut("backups/subscribers.json")).not.toBeNull();
    expect(leftOut("circles/finances/lcc/uploads/e1/u1/0")).toBe("unfinished uploads");
    expect(leftOut("documents/uploads/u1/0")).not.toBeNull();
  });

  it("leaves out what only admins see, and finances a circle keeps to its members", () => {
    for (const key of [
      "auth/sign-in-log.json",
      "auth/last-seen.json",
      "email/log.json",
      "email/settings.json",
      "feedback/reports.json",
      "onboarding/invitations.json",
    ])
      expect(leftOut(key)).not.toBeNull();
    const kept = new Set(["lcc"]);
    expect(leftOut("circles/finances/lcc.json", kept)).toMatch(/members/);
    expect(leftOut("circles/finances/lcc/receipts/e1", kept)).toMatch(/members/);
    expect(leftOut("circles/finances/lccx.json", kept)).toBeNull();
    expect(leftOut("circles/finances/board.json", kept)).toBeNull();
  });

  it("keeps everything else", () => {
    for (const key of [
      "directory/directory.json",
      "wiki/pages.json",
      "auth/users.json",
      "email/preferences.json",
      "push/preferences.json",
      "circles/finances/lcc.json",
      "circles/finances/lcc/receipts/e1",
      "documents/files/abc/v1",
    ])
      expect(leftOut(key)).toBeNull();
  });

  it("says which dataset each file belongs to", () => {
    expect(datasetOf("wiki/pages.json").dataset).toBe("pages");
    expect(datasetOf("wiki/history/p1.json").dataset).toBe("page-history");
    expect(datasetOf("wiki/follows.json").dataset).toBe("wiki");
    expect(datasetOf("documents/files/abc/v1").dataset).toBe("files");
    expect(datasetOf("documents/index.json").dataset).toBe("documents");
    expect(datasetOf("somewhere/new.json")).toEqual({
      dataset: "somewhere",
      about: "Other app data",
    });
  });

  it("makes safe names, and a README that says what's in it and left out", () => {
    expect(safeName('Mow: "the" edges/lane')).toBe("Mow the edges lane");
    const info = {
      at: "2026-10-12",
      siteUrl: "https://example.org",
      files: 3,
      site: { included: false, repository: "owner/repo", commit: null },
      datasets: [{ dataset: "pages", about: "Written pages", files: 1 }],
    };
    const readme = backupReadme({ ...info, kind: "community" });
    expect(readme).toContain("`chat/` — private messages");
    expect(readme).toContain("**pages** (1)");
    expect(readme).toContain("wasn't included (it's at owner/repo)");
    const complete = backupReadme({ ...info, kind: "complete" });
    expect(complete).toContain("complete backup of 2026-10-12");
    expect(complete).toContain("for CVC's admins only");
    expect(complete).not.toContain("`chat/`");
    expect(complete).toContain("private messages between residents");
  });

  it("a complete backup keeps everything a restore needs, but earlier backups and what's temporary", () => {
    const kept = new Set(["lcc"]);
    for (const key of [
      "chat/conversations/a-b.json",
      "push/vapid.json",
      "push/subscriptions.json",
      "auth/sign-in-log.json",
      "email/settings.json",
      "feedback/reports.json",
      "onboarding/invitations.json",
      "circles/finances/lcc.json",
      "circles/finances/lcc/receipts/e1",
    ])
      expect(leftOut(key, kept, "complete"), key).toBeNull();
    for (const key of [
      "backups/index.json",
      "exports/x.zip",
      "presence/online.json",
      "wiki/presence.json",
      "auth/sign-in-links-2.json",
      "documents/uploads/u1/0",
      "circles/finances/lcc/uploads/e1/u1/0",
    ])
      expect(leftOut(key, kept, "complete"), key).not.toBeNull();
    expect(leftOutOf("complete").length).toBeLessThan(leftOutOf("community").length);
  });
});
