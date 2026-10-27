/**
 * Talking to the Outline server CVC imports from (`import.ts`): its JSON
 * API (`POST /api/<method>`) with an admin's API key, and its attachments.
 * Set by two env vars — `OUTLINE_URL` and `OUTLINE_API_TOKEN` — never
 * logged or sent anywhere else. Everything is read-only: CVC takes a copy;
 * it never writes to Outline. Only https is reached from Vercel (plain http
 * is for a local stand-in while testing).
 */

export interface OutlineUser {
  id: string;
  name: string;
  email?: string | null;
}

export interface OutlineCollection {
  id: string;
  urlId: string;
  name: string;
  description?: string | null;
  icon?: string | null;
}

/** A document as `documents.info`/`documents.list` give it (the fields the import uses). */
export interface OutlineDocument {
  id: string;
  urlId: string;
  url: string;
  title: string;
  /** Its text, as Outline's Markdown. */
  text: string;
  icon?: string | null;
  collectionId: string;
  parentDocumentId?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: OutlineUser | null;
  updatedBy?: OutlineUser | null;
  publishedAt?: string | null;
  archivedAt?: string | null;
  template?: boolean;
}

/** A node of a collection's ordered tree (`collections.documents`). */
export interface OutlineNode {
  id: string;
  title: string;
  url: string;
  children: OutlineNode[];
}

export interface OutlineComment {
  id: string;
  documentId: string;
  parentCommentId?: string | null;
  createdBy: OutlineUser;
  createdAt: string;
  /** ProseMirror JSON. */
  data: unknown;
}

export interface OutlineAttachment {
  bytes: Uint8Array;
  contentType: string;
  fileName: string | null;
}

export interface OutlineClient {
  host: string;
  call: <T>(method: string, body?: Record<string, unknown>) => Promise<T>;
  /** Every page of a listing method. */
  listAll: <T>(method: string, body?: Record<string, unknown>) => Promise<T[]>;
  attachment: (id: string) => Promise<OutlineAttachment | null>;
}

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;
const PAGE = 100;

export class OutlineError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "OutlineError";
  }
}

export const outlineHost = () => (process.env.OUTLINE_URL ?? "").trim().replace(/\/+$/, "");

/** Whether an Outline server is set up to import from. */
export const outlineConfigured = () => {
  const host = outlineHost();
  if (!host || !process.env.OUTLINE_API_TOKEN?.trim()) return false;
  return host.startsWith("https://") || (host.startsWith("http://") && !process.env.VERCEL);
};

/** A client for the configured server, or null when there isn't one. */
export function outlineClient(): OutlineClient | null {
  if (!outlineConfigured()) return null;
  const host = outlineHost();
  const token = process.env.OUTLINE_API_TOKEN!.trim();
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  const call = async <T>(method: string, body: Record<string, unknown> = {}): Promise<T> => {
    const response = await fetch(`${host}/api/${method}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "manual",
    });
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new OutlineError(`${method}: the answer is too large`, 502);
    let parsed: { ok?: boolean; data?: T; error?: string; message?: string } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (!response.ok || !parsed?.ok)
      throw new OutlineError(
        `${method}: ${parsed?.message ?? parsed?.error ?? `HTTP ${response.status}`}`,
        response.status
      );
    return parsed.data as T;
  };

  const listAll = async <T>(method: string, body: Record<string, unknown> = {}): Promise<T[]> => {
    const all: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await call<T[]>(method, { ...body, limit: PAGE, offset });
      all.push(...page);
      if (page.length < PAGE) return all;
      if (all.length > 20_000) throw new OutlineError(`${method}: too many to import`, 502);
    }
  };

  const attachment = async (id: string): Promise<OutlineAttachment | null> => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return null;
    const response = await fetch(`${host}/api/attachments.redirect?id=${encodeURIComponent(id)}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    }).catch(() => null);
    if (!response?.ok) return null;
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;
    const disposition = response.headers.get("content-disposition") ?? "";
    const fileName =
      /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1] ??
      /filename="?([^";]+)"?/i.exec(disposition)?.[1] ??
      null;
    return {
      bytes,
      contentType: (response.headers.get("content-type") ?? "application/octet-stream").split(
        ";"
      )[0],
      fileName: fileName ? decodeURIComponent(fileName) : null,
    };
  };

  return { host, call, listAll, attachment };
}
