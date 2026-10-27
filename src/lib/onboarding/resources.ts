import { listDocuments } from "@/lib/documents/store";
import { readPages, type WikiPage } from "@/lib/wiki/store";
import { visiblePages } from "@/lib/wiki/access";
import { readResources } from "./store";
import { defaultResources, showResources, type ShownResource } from "./shared";

/**
 * What the welcome page lists: the Secretary's choice (or, until they make
 * one, the Living in Community Guide), each with its current title. Every
 * resident sees every page, but a page that was once shown only to some
 * circles (before that) isn't offered to newcomers, or opened from a
 * welcome link.
 */

/** A page a welcome link may open: any but those once shown only to some circles. */
export const openToNewcomers = (page: Pick<WikiPage, "view">) =>
  !page.view || page.view.kind === "everyone";

/** The documents, and the pages newcomers may read: what the welcome page can offer. */
export async function resourceChoices() {
  const [documents, pages] = await Promise.all([listDocuments(), readPages()]);
  return { documents, pages: visiblePages(pages, null).filter(openToNewcomers) };
}

export async function welcomeResources(): Promise<ShownResource[]> {
  const [saved, { documents, pages }] = await Promise.all([readResources(), resourceChoices()]);
  return showResources(saved?.resources ?? defaultResources(documents, pages), documents, pages);
}
