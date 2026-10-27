/**
 * The app's own address, for links that leave it (emails): `SITE_URL` if
 * set, else the production domain Vercel reports, else the default one. The
 * wiki can also be reached on an address of its own (`WIKI_HOST`, say
 * `wiki.commonpastures.org`), where the app shows only its documents; a
 * sign-in asked for there is emailed as a link back there.
 */
export function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "cvc-directory.vercel.app";
  return `https://${host}`;
}

/** The wiki's own host name, lower case, if one is configured. */
export const wikiHost = () => (process.env.WIKI_HOST ?? "").trim().toLowerCase() || null;

/** Whether a request's Host header names the wiki's own address. (Safe for the edge middleware.) */
export function isWikiHost(headers: { get(name: string): string | null }) {
  const host = wikiHost();
  return !!host && (headers.get("host") ?? "").toLowerCase().split(":")[0] === host;
}

/**
 * The address a request came to, for links sent back to the same place: the
 * wiki's own address when the request was made there, else the site's.
 * (Only the configured wiki host is trusted; any other Host header is ignored.)
 */
export function requestSite(request: { headers: { get(name: string): string | null } }): string {
  if (!isWikiHost(request.headers)) return siteUrl();
  const host = request.headers.get("host")!;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const forwarded = request.headers.get("x-forwarded-proto");
  const scheme =
    forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";
  return `${scheme}://${host}`;
}
