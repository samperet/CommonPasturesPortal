/**
 * Shared by the Node session code and the edge middleware, so it must not
 * import any Node-only modules.
 */
export const SESSION_COOKIE = "cvc_session";
/** Set while an admin is viewing the app as another resident (read-only). */
export const VIEW_AS_COOKIE = "cvc_view_as";

/**
 * How long a session lasts: 400 days, the longest a browser keeps a cookie.
 * Each visit renews it (at most once a day, in the middleware), so residents
 * stay signed in for as long as they keep coming back.
 */
export const SESSION_TTL_MS = 400 * 24 * 60 * 60 * 1000;
/** A session is renewed on a visit once it's this old. */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * The session cookie's attributes (the sign-in routes and the middleware set
 * it alike). With `SESSION_COOKIE_DOMAIN` (say `.commonpastures.org`) the
 * cookie is shared by every host under it, so one sign-in serves the app
 * and the wiki's own address (`WIKI_HOST`) alike.
 */
export function sessionCookieAttributes() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    ...(process.env.SESSION_COOKIE_DOMAIN ? { domain: process.env.SESSION_COOKIE_DOMAIN } : {}),
  };
}

const DEV_SECRET = "cvc-directory-insecure-dev-secret";

/**
 * The key that signs session cookies. AUTH_SECRET is preferred. Without it,
 * production derives a key from the R2 secret access key — already private to
 * the deployment — so the public development default can never be used to
 * forge sessions. With neither, production throws and callers fail closed.
 */
export function authSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.R2_SECRET_ACCESS_KEY) return `cvc-session-v1:${process.env.R2_SECRET_ACCESS_KEY}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is not configured");
  }
  return DEV_SECRET;
}
