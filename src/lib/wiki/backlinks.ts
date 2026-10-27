import type { DirectoryDocument } from "@/lib/directory/types";
import { wikiLinksIn } from "./links";
import { embeddedPages } from "./sections";
import { readPages, type WikiPage } from "./store";

export interface Backlink {
  /** The circle that keeps the linking page. */
  circleId: string;
  circleName: string;
  slug: string;
  title: string;
}

/**
 * The pages whose links point to — or that embed — `page`. Links name pages
 * by title, so this follows every page's links.
 */
export async function backlinksTo(
  page: Pick<WikiPage, "id" | "title">,
  directory: DirectoryDocument
): Promise<Backlink[]> {
  const wanted = page.title.toLowerCase();
  const circles = directory.circles;
  return (await readPages())
    .filter((entry) => entry.id !== page.id && !entry.draft)
    .filter((entry) =>
      [...wikiLinksIn(entry.body, circles), ...embeddedPages(entry.body, circles)].some(
        (link) => link.kind === "page" && link.title.toLowerCase() === wanted
      )
    )
    .map((entry) => ({
      circleId: entry.keeper,
      circleName: circles.find((circle) => circle.id === entry.keeper)?.name ?? "",
      slug: entry.slug,
      title: entry.title,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
