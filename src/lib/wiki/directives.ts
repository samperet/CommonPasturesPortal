/**
 * The wiki's own blocks, written with the Markdown directive syntax. Pages
 * once had collapsible sections —
 *
 *   :::details{title="Winter duty"}
 *   Hidden until the reader opens it.
 *   :::
 *
 * (or `:::details[Winter duty]`) — which are gone: this remark plugin shows
 * one as its title in bold, then what it held, always open. It turns a poll — `::poll{id="…"}`, on its own line — into
 * a placeholder the page fills with the poll, a proposal —
 * `::proposal{id="…"}` — into one it fills with the proposal, an embedded page —
 * `::embed{page="Circle:Title" section="Heading"}` — into one the page fills
 * with that page (or section), highlighted text —
 * `:mark[the text]{color="yellow"}` — into <mark> in that colour, a resident
 * mentioned — `:person[Ada Ash]{#<personId>}` — into an "@Ada Ash" link to
 * their directory entry, and a
 * callout — `:::callout` … `:::` — into a section set apart by a dotted
 * line. Anything else that happens to look like a directive —
 * "Contact:Lynn" — is put back as the text it was.
 */

import { highlightColor } from "./colors";

interface Node {
  type: string;
  name?: string;
  value?: string;
  attributes?: Record<string, string | null | undefined> | null;
  children?: Node[];
  data?: Record<string, unknown>;
  url?: string;
  title?: string;
}

const textOf = (node: Node): string =>
  (node.value ?? "") + (node.children ?? []).map(textOf).join("");

/** A details block's title: its `title` attribute, or its [label]. */
export function detailsTitle(node: Node) {
  const label = node.children?.find((child) => child.data?.directiveLabel);
  return (node.attributes?.title ?? (label ? textOf(label) : "")).trim() || "Details";
}

function transform(node: Node): Node[] {
  if (node.children) node.children = node.children.flatMap(transform);
  if (node.type === "containerDirective" && node.name === "details") {
    const title = detailsTitle(node);
    const body = (node.children ?? []).filter((child) => !child.data?.directiveLabel);
    return [
      {
        type: "paragraph",
        children: [{ type: "strong", children: [{ type: "text", value: title }] }],
      },
      ...body,
    ];
  }
  if (node.type === "containerDirective" && node.name === "callout") {
    return [
      {
        type: "wikiCallout",
        data: { hName: "aside", hProperties: { className: "wiki-callout" } },
        children: (node.children ?? []).filter((child) => !child.data?.directiveLabel),
      },
    ];
  }
  if (node.type === "textDirective" && node.name === "mark") {
    return [
      {
        type: "wikiMark",
        data: {
          hName: "mark",
          hProperties: { className: `wiki-mark hl-${highlightColor(node.attributes?.color)}` },
        },
        children: node.children ?? [],
      },
    ];
  }
  if (node.type === "textDirective" && node.name === "person" && node.attributes?.id) {
    // A link marked as a mention (the page draws it as an "@Name" chip; see `components/wiki/markdown.tsx`).
    return [
      {
        type: "link",
        url: `/directory/${node.attributes.id}`,
        title: "wiki:person",
        children: [{ type: "text", value: `@${(node.children ?? []).map(textOf).join("")}` }],
      },
    ];
  }
  if (node.type === "textDirective") {
    const label = node.children?.length ? `[${node.children.map(textOf).join("")}]` : "";
    return [{ type: "text", value: `:${node.name}${label}` }];
  }
  if (node.type === "leafDirective" && node.name === "poll" && node.attributes?.id) {
    return [
      { type: "wikiPoll", data: { hName: "div", hProperties: { dataPoll: node.attributes.id } } },
    ];
  }
  if (node.type === "leafDirective" && node.name === "proposal" && node.attributes?.id) {
    return [
      {
        type: "wikiProposal",
        data: { hName: "div", hProperties: { dataProposal: node.attributes.id } },
      },
    ];
  }
  if (node.type === "leafDirective" && node.name === "embed" && node.attributes?.page) {
    const section = node.attributes.section?.trim();
    return [
      {
        type: "wikiEmbed",
        data: {
          hName: "div",
          hProperties: {
            dataEmbed: node.attributes.page,
            ...(section ? { dataSection: section } : {}),
          },
        },
      },
    ];
  }
  if (node.type === "leafDirective") {
    const label = node.children?.length ? `[${node.children.map(textOf).join("")}]` : "";
    return [{ type: "paragraph", children: [{ type: "text", value: `::${node.name}${label}` }] }];
  }
  if (node.type === "containerDirective") {
    // An unknown block: keep what's inside it.
    return (node.children ?? []).filter((child) => !child.data?.directiveLabel);
  }
  return [node];
}

export function remarkWikiDirectives() {
  return (tree: Node) => {
    tree.children = (tree.children ?? []).flatMap(transform);
  };
}
