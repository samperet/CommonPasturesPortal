import type { DirectoryDocument } from "@/lib/directory/types";
import { wikiLinksIn } from "@/lib/wiki/links";
import { embeddedPages } from "@/lib/wiki/sections";
import { readPages, type WikiPage } from "@/lib/wiki/store";
import { visiblePages, type WikiViewer } from "./access";
import { excerptOf } from "@/lib/wiki/excerpt";
import { parentOf } from "@/lib/circles/tiers";

/**
 * The map of how the wiki connects: every page, the circle it belongs to,
 * the pages it links to (or embeds). A sub group is listed with its
 * `parentId`, and its parent is listed too (even with no pages of its own),
 * so the map can draw it inside its parent's island.
 */

export type GraphNodeKind = "page" | "circle";
export type GraphEdgeKind = "link" | "belongs";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  href: string;
  /** A page's parent circle. */
  circleId?: string;
  /** A page's opening lines, for the map's hover card. */
  excerpt?: string;
  /** Who last edited a page, and when. */
  edited?: { by: string; at: string };
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface GraphCircle {
  id: string;
  name: string;
  /** Set on a sub group: the circle whose island it sits in. */
  parentId?: string;
}

export interface WikiGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  circles: GraphCircle[];
}

const pageNode = (pageId: string) => `page:${pageId}`;

/**
 * The circles on the map (pure): those keeping a page, each sub group with
 * its parent — and the parent itself, whether or not it keeps pages — in
 * the directory's order.
 */
export function graphCircles<T extends { id: string; name: string; parentId?: string }>(
  circles: T[],
  keepers: ReadonlySet<string>
): GraphCircle[] {
  const shown = new Set<string>();
  for (const circle of circles) {
    if (!keepers.has(circle.id)) continue;
    shown.add(circle.id);
    const parent = parentOf(circles, circle);
    if (parent) shown.add(parent.id);
  }
  return circles
    .filter((circle) => shown.has(circle.id))
    .map((circle) => {
      const parent = parentOf(circles, circle);
      return { id: circle.id, name: circle.name, ...(parent ? { parentId: parent.id } : {}) };
    });
}

/** The map: every page, and the links between them. */
export async function buildWikiGraph(
  directory: DirectoryDocument,
  viewer: WikiViewer | null = null
): Promise<WikiGraph> {
  const circles = directory.circles;
  const pages = visiblePages(await readPages(), viewer);

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (source: string, target: string, kind: GraphEdgeKind) => {
    const key = `${source}|${target}|${kind}`;
    if (source === target || seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, kind });
  };
  const addCircle = (circleId: string) => {
    const circle = circles.find((entry) => entry.id === circleId);
    if (circle && !nodes.has(`circle:${circle.id}`))
      nodes.set(`circle:${circle.id}`, {
        id: `circle:${circle.id}`,
        kind: "circle",
        label: circle.name,
        href: `/circles/${circle.id}`,
        circleId: circle.id,
      });
  };

  // Pages, each with the circle that keeps it.
  const byTitle = new Map<string, WikiPage>();
  for (const page of pages) {
    addCircle(page.keeper);
    nodes.set(pageNode(page.id), {
      id: pageNode(page.id),
      kind: "page",
      label: page.title,
      href: `/wiki/${page.slug}`,
      circleId: page.keeper,
      excerpt: excerptOf(page.body, 220),
      edited: { by: page.updatedBy.name, at: page.updatedAt },
    });
    byTitle.set(page.title.toLowerCase(), page);
  }
  // Each page belongs to its keeper.
  for (const page of pages) addEdge(pageNode(page.id), `circle:${page.keeper}`, "belongs");

  // Links between pages (embeds count). Documents aren't on the map.
  for (const page of pages) {
    for (const link of [...wikiLinksIn(page.body, circles), ...embeddedPages(page.body, circles)]) {
      if (link.kind !== "page") continue;
      const target = byTitle.get(link.title.toLowerCase());
      if (target) addEdge(pageNode(page.id), pageNode(target.id), "link");
    }
  }

  const keepers = new Set(pages.map((page) => page.keeper));
  const listed = graphCircles(circles, keepers);
  for (const circle of listed) addCircle(circle.id);
  return { nodes: Array.from(nodes.values()), edges, circles: listed };
}
