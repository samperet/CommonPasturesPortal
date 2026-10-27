import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_RENEW_AFTER_MS,
  SESSION_TTL_MS,
  VIEW_AS_COOKIE,
  authSecret,
  sessionCookieAttributes,
} from "@/lib/auth/secret";
import { isWikiHost } from "@/lib/site-url";

/**
 * Signed-out visitors see only the sign-in page. Every other page redirects
 * to /login, and every other API route answers 401. This checks the session
 * cookie's signature and expiry at the edge; routes holding sensitive data
 * (the directory) also confirm the account server-side.
 *
 * While an admin is viewing the app as another resident, every change is
 * refused here, so viewing as someone can never post or edit in their name.
 *
 * Each visit renews the session (once it's a day old) for another 400 days,
 * so residents stay signed in as long as they keep coming back — except on
 * the sign-in and sign-out routes, which set the cookie themselves.
 *
 * On the wiki's own address (`WIKI_HOST`), the front door is the documents,
 * and every page is told it's there (the `x-cvc-wiki-host` request header),
 * so the shell shows only the wiki.
 */
const WIKI_HOST_HEADER = "x-cvc-wiki-host";

/** Requests allowed to change things while viewing as someone: ending the view, and signing out. */
const VIEW_AS_WRITABLE = new Set(["/api/auth/view-as", "/api/auth/logout"]);
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const PUBLIC_PATHS = new Set([
  "/", // the public front page (residents see their dashboard there)
  "/welcome", // the public front page for anyone
  "/login",
  "/api/auth/link", // ask for a sign-in link
  "/api/auth/code", // sign in with the code from that email
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/people",
  "/api/health",
  "/api/live/echo", // a spike: it checks the session itself, and only echoes for residents
  "/api/email/unsubscribe", // an email's "Stop them" link: its own signed token
  "/api/backups/feed", // a resident's backup feed: its token is the key
  "/api/backups/feed/file", // a backup from that feed: the same token
  "/api/cron/backup", // the weekly backup: Vercel Cron's bearer CRON_SECRET
  "/api/mcp", // AI assistants: a resident's key is the credential
  "/api/admin/directory", // protected by its own bearer token
  "/api/admin/directory/people", // protected by its own bearer token
  "/api/admin/circles", // protected by its own bearer token
  "/api/admin/circles/icons", // protected by its own bearer token
  "/api/admin/photos", // protected by its own bearer token
  "/api/admin/schedules", // protected by its own bearer token
  "/api/admin/resources", // protected by its own bearer token
]);

const encoder = new TextEncoder();

async function hmacHex(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Session = { userId: string; expiresAt: number };

async function validSession(value: string | undefined): Promise<Session | null> {
  if (!value) return null;
  try {
    authSecret();
  } catch {
    console.error("[auth] middleware has no session signing key; set AUTH_SECRET");
    return null; // no signing key configured: nobody is signed in
  }
  const lastDot = value.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = value.slice(0, lastDot);
  const [userId, expiresAtRaw] = payload.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (!userId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return constantTimeEqual(value.slice(lastDot + 1), await hmacHex(payload))
    ? { userId, expiresAt }
    : null;
}

/** On to the page or route, told when it's on the wiki's address — with the session renewed, if it's a day old and this may. */
async function onward(request: NextRequest, session: Session | null) {
  const headers = new Headers(request.headers);
  // Set here, from the Host header alone: never taken from the request.
  if (isWikiHost(request.headers)) headers.set(WIKI_HOST_HEADER, "1");
  else headers.delete(WIKI_HOST_HEADER);
  const response = NextResponse.next({ request: { headers } });
  const { pathname } = request.nextUrl;
  const settingItself = pathname.startsWith("/api/auth/") || pathname.startsWith("/login");
  if (
    session &&
    !settingItself &&
    session.expiresAt - Date.now() < SESSION_TTL_MS - SESSION_RENEW_AFTER_MS
  ) {
    const payload = `${session.userId}.${Date.now() + SESSION_TTL_MS}`;
    response.cookies.set(
      SESSION_COOKIE,
      `${payload}.${await hmacHex(payload)}`,
      sessionCookieAttributes()
    );
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // The AI assistants page, typed in capitals (/MCP): the page is at /mcp.
  if (pathname !== "/mcp" && pathname.toLowerCase() === "/mcp")
    return NextResponse.redirect(new URL(`/mcp${search}`, request.url), 308);
  // The wiki's own address opens on the documents.
  if (pathname === "/" && isWikiHost(request.headers))
    return NextResponse.redirect(new URL("/documents", request.url));
  const session = await validSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (PUBLIC_PATHS.has(pathname)) return onward(request, session);
  // A sign-in link, and the page it opens (the token is the key; using it takes a POST).
  if (/^\/(api\/auth\/link|login)\/[A-Za-z0-9_-]{20,64}$/.test(pathname))
    return NextResponse.next();
  // Photos of homes for sale are on the public homepage.
  if (request.method === "GET" && /^\/api\/homes\/[0-9a-f-]{36}\/photo$/.test(pathname))
    return NextResponse.next();
  // A new member's welcome page, before they can sign in: its signed token is the key.
  if (/^\/(api\/)?join\/[\w.-]+(\/|$)/.test(pathname)) return NextResponse.next();
  if (session) {
    if (
      request.cookies.has(VIEW_AS_COOKIE) &&
      !READ_METHODS.has(request.method) &&
      !VIEW_AS_WRITABLE.has(pathname)
    ) {
      return NextResponse.json(
        {
          type: "about:blank",
          title: "Forbidden",
          status: 403,
          detail:
            "You're viewing the app as someone else, which is read-only. Exit the view to make changes.",
        },
        { status: 403 }
      );
    }
    return onward(request, session);
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { type: "about:blank", title: "Unauthorized", status: 401, detail: "Sign in to continue" },
      { status: 401 }
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except build assets and public files.
  // The manifest, service worker, and app icons are fetched without cookies, so they must stay public.
  // The front page's images (home/) are public too; the image optimizer fetches them without cookies.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|CVC.png|manifest.json|sw.js|icons/|home/|sections/|robots.txt).*)",
  ],
};
