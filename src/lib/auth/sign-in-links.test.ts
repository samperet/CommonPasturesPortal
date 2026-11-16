import { mkdtempSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSignInLink,
  linkOwner,
  LINK_TTL_MS,
  MAX_CODE_ATTEMPTS,
  MAX_LINKS_PER_HOUR,
  redeemSignInCode,
  redeemSignInLink,
  safeNext,
} from "./sign-in-links";
import { maskEmail } from "./sign-in";

const ADA = "000000000001";

describe("sign-in links", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cvc-links-"));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("signs in once with the link, and only within its time", async () => {
    const now = Date.now();
    const link = await createSignInLink(ADA, "/circles/lcc", now);
    if (link === "too-many") throw new Error("refused");
    expect(await redeemSignInLink(link.token, now)).toEqual({
      personId: ADA,
      next: "/circles/lcc",
    });
    expect(await redeemSignInLink(link.token, now)).toBe("used");
    const late = await createSignInLink(ADA, undefined, now);
    if (late === "too-many") throw new Error("refused");
    expect(await redeemSignInLink(late.token, now + LINK_TTL_MS + 1)).toBe("expired");
    expect(await redeemSignInLink("x".repeat(32), now)).toBe("unknown");
  });

  it("signs in with the code, and five wrong codes spoil it", async () => {
    const now = Date.now();
    const first = await createSignInLink(ADA, undefined, now);
    if (first === "too-many") throw new Error("refused");
    const wrong = first.code === "000000" ? "111111" : "000000";
    expect(await redeemSignInCode(ADA, wrong, now)).toBe("wrong");
    expect(await redeemSignInCode("000000000002", first.code, now)).toBe("none");
    expect(
      await redeemSignInCode(ADA, `${first.code.slice(0, 3)} ${first.code.slice(3)}`, now)
    ).toMatchObject({ personId: ADA });
    // Used: neither the code nor the link works again.
    expect(await redeemSignInLink(first.token, now)).toBe("used");

    const second = await createSignInLink(ADA, undefined, now);
    if (second === "too-many") throw new Error("refused");
    const bad = second.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++)
      expect(await redeemSignInCode(ADA, bad, now)).toBe("wrong");
    expect(await redeemSignInCode(ADA, second.code, now)).toBe("none");
  });

  it("limits how many links one person can ask for in an hour", async () => {
    const now = Date.now();
    for (let i = 0; i < MAX_LINKS_PER_HOUR; i++)
      expect(await createSignInLink(ADA, undefined, now)).not.toBe("too-many");
    expect(await createSignInLink(ADA, undefined, now)).toBe("too-many");
    expect(await createSignInLink(ADA, undefined, now + 3600_001)).not.toBe("too-many");
  });

  it("lets an admin make a link outside the hourly count, and knows whose a link is", async () => {
    const now = Date.now();
    for (let i = 0; i < MAX_LINKS_PER_HOUR; i++) await createSignInLink(ADA, undefined, now);
    expect(await createSignInLink(ADA, undefined, now)).toBe("too-many");
    const made = await createSignInLink(ADA, undefined, now, { unlimited: true });
    if (made === "too-many") throw new Error("refused");
    expect(made.expiresAt).toBe(new Date(now + LINK_TTL_MS).toISOString());
    expect(await linkOwner(made.token)).toBe(ADA);
    expect(await redeemSignInLink(made.token, now)).toMatchObject({ personId: ADA });
    // Used, it's still known whose it was (for the log of tries); a made-up one isn't.
    expect(await redeemSignInLink(made.token, now)).toBe("used");
    expect(await linkOwner(made.token)).toBe(ADA);
    expect(await linkOwner("x".repeat(32))).toBeNull();
  });

  it("keeps only same-site destinations, and half-hides addresses", () => {
    expect(safeNext("/tasks")).toBe("/tasks");
    expect(safeNext("//evil.example")).toBeUndefined();
    expect(safeNext("https://evil.example")).toBeUndefined();
    expect(safeNext("/login/abc")).toBeUndefined();
    expect(maskEmail("ada@example.org")).toBe("a•••@example.org");
  });
});

describe("signing in", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cvc-links-"));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("clears the person's other links, and their count for the hour", async () => {
    const now = Date.now();
    const links = [];
    for (let i = 0; i < MAX_LINKS_PER_HOUR; i++) {
      const link = await createSignInLink(ADA, undefined, now);
      if (link === "too-many") throw new Error("refused");
      links.push(link);
    }
    const ben = await createSignInLink("000000000002", undefined, now);
    expect(await createSignInLink(ADA, undefined, now)).toBe("too-many");
    expect(await redeemSignInLink(links[4].token, now)).toMatchObject({ personId: ADA });
    // The earlier links are gone, and Ada can ask again.
    expect(await redeemSignInLink(links[0].token, now)).toBe("unknown");
    expect(await createSignInLink(ADA, undefined, now)).not.toBe("too-many");
    // Someone else's link is untouched.
    if (ben === "too-many") throw new Error("refused");
    expect(await redeemSignInLink(ben.token, now)).toMatchObject({ personId: "000000000002" });
  });
});
