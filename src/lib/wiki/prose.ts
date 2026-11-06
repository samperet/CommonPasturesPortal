import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { normalizeWikiLinks, protectWikiLinks } from "./links";
import { evenPixels, evenShares, formatWidths, parseWidths, pixelsOf, sharesOf } from "./tables";

/**
 * Wiki pages' Markdown, to and from the visual editor's document
 * (ProseMirror JSON, as TipTap holds it) — pure, so it runs on the server
 * and in tests too. Pages stay Markdown: this is only the editor's view of
 * them, and Markdown → document → Markdown gives back what the Markdown
 * parser and writer alone would (the writer's settings are the old
 * editor's, so saved pages don't change their spelling).
 *
 * The editor knows paragraphs, headings, quotes, lists and checklists,
 * code, dividers, tables, photos, bold / italic / struck-through / code /
 * linked / highlighted words (`:mark[…]{color}`), `[[links]]` (as tags),
 * tables' column widths (`::columns{widths="…"}` before a table, `tables.ts`),
 * residents mentioned (`:person[Ada Ash]{#id}`),
 * callouts (`:::callout`), and polls, proposals and embedded pages
 * (`::poll`, `::proposal`, `::embed`). A collapsible section from before
 * they were taken out (`:::details{title}`) opens as its title in bold and
 * then what it held, and is saved that way.
 * Anything else — HTML, footnotes, reference links, other directives — is
 * carried through as it was (a "raw" node holding its Markdown tree), so
 * nothing is ever lost.
 */

// The document, as TipTap's JSON.
export interface ProseMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface ProseNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
  marks?: ProseMark[];
  text?: string;
}

// The Markdown tree (mdast), as loosely as this needs it.
interface Md {
  type: string;
  value?: string;
  children?: Md[];
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  spread?: boolean | null;
  checked?: boolean | null;
  lang?: string | null;
  meta?: string | null;
  url?: string;
  title?: string | null;
  alt?: string | null;
  align?: (string | null)[] | null;
  name?: string;
  attributes?: Record<string, string | null | undefined> | null;
  data?: Record<string, unknown>;
  position?: unknown;
}

// The writer's settings: the old editor's (MDXEditor's), so saved pages keep their spelling.
const STRINGIFY = { listItemIndent: "one" as const };

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);
const writer = unified().use(remarkStringify, STRINGIFY).use(remarkGfm).use(remarkDirective);

/** A node's Markdown tree, without where it came from (it's kept in the document). */
function bare(node: Md): Md {
  const { position: _position, ...rest } = node;
  return rest.children ? { ...rest, children: rest.children.map(bare) } : rest;
}

const isLabel = (node: Md) => !!node.data?.directiveLabel;
const textOf = (node: Md): string =>
  (node.value ?? "") + (node.children ?? []).map(textOf).join("");

// --- Markdown → document ---------------------------------------------------------------------

const WIKI_LINK = /\[\[([^\]|\n]{1,240})(?:\|([^\]\n]{1,120}))?\]\]/g;

function inline(nodes: Md[], marks: ProseMark[] = []): ProseNode[] {
  const out: ProseNode[] = [];
  const withMarks = <T extends ProseNode>(node: T): T =>
    marks.length ? { ...node, marks: [...marks] } : node;
  const text = (value: string, extra: ProseMark[] = []) => {
    if (!value) return;
    const all = [...marks, ...extra];
    out.push(
      all.length ? { type: "text", text: value, marks: all } : { type: "text", text: value }
    );
  };
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        const value = node.value ?? "";
        let last = 0;
        for (const match of Array.from(value.matchAll(WIKI_LINK))) {
          text(value.slice(last, match.index));
          out.push(
            withMarks({
              type: "wikiLink",
              attrs: { target: match[1].trim(), label: match[2]?.trim() || null },
            })
          );
          last = (match.index ?? 0) + match[0].length;
        }
        text(value.slice(last));
        break;
      }
      case "strong":
        out.push(...inline(node.children ?? [], [...marks, { type: "bold" }]));
        break;
      case "emphasis":
        out.push(...inline(node.children ?? [], [...marks, { type: "italic" }]));
        break;
      case "delete":
        out.push(...inline(node.children ?? [], [...marks, { type: "strike" }]));
        break;
      case "inlineCode":
        text(node.value ?? "", [{ type: "code" }]);
        break;
      case "link":
        out.push(
          ...inline(node.children ?? [], [
            ...marks,
            { type: "link", attrs: { href: node.url ?? "", title: node.title ?? null } },
          ])
        );
        break;
      case "break":
        out.push(withMarks({ type: "hardBreak" }));
        break;
      case "image":
        out.push(
          withMarks({
            type: "image",
            attrs: { src: node.url ?? "", alt: node.alt ?? null, title: node.title ?? null },
          })
        );
        break;
      case "textDirective":
        if (node.name === "person" && node.attributes?.id) {
          out.push(
            withMarks({
              type: "personMention",
              attrs: { id: node.attributes.id, name: textOf(node) },
            })
          );
          break;
        }
        if (node.name === "mark") {
          out.push(
            ...inline(node.children ?? [], [
              ...marks,
              { type: "highlight", attrs: { color: node.attributes?.color ?? null } },
            ])
          );
          break;
        }
      // Any other directive in the text (like "Contact:Lynn") is kept as it was.
      // falls through
      default:
        out.push(withMarks({ type: "rawInline", attrs: { mdast: bare(node) } }));
    }
  }
  return out;
}

/** At least one block (ProseMirror's containers can't be empty). */
const someBlocks = (content: ProseNode[]) =>
  content.length ? content : [{ type: "paragraph" } as ProseNode];

const paragraph = (content: ProseNode[]): ProseNode =>
  content.length ? { type: "paragraph", content } : { type: "paragraph" };

function blocks(nodes: Md[]): ProseNode[] {
  // A `::columns` line gives the table after it its widths (`tables.ts`).
  const out: ProseNode[] = [];
  nodes.forEach((node, index) => {
    const next = nodes[index + 1];
    if (node.type === "leafDirective" && node.name === "columns" && next?.type === "table") {
      next.data = { ...next.data, widths: node.attributes?.widths ?? null };
      return;
    }
    out.push(...block(node));
  });
  return out;
}

/** A list item's blocks: they start with a paragraph (ProseMirror's rule for list items). */
function itemBlocks(nodes: Md[]): ProseNode[] {
  const content = blocks(nodes);
  return content[0]?.type === "paragraph" ? content : [{ type: "paragraph" }, ...content];
}

function block(node: Md): ProseNode[] {
  switch (node.type) {
    case "paragraph":
      return [paragraph(inline(node.children ?? []))];
    case "heading": {
      const content = inline(node.children ?? []);
      return [
        {
          type: "heading",
          attrs: { level: node.depth ?? 1 },
          ...(content.length ? { content } : {}),
        },
      ];
    }
    case "blockquote":
      return [{ type: "blockquote", content: someBlocks(blocks(node.children ?? [])) }];
    case "list": {
      const items = node.children ?? [];
      const spread = !!node.spread;
      if (items.some((item) => typeof item.checked === "boolean")) {
        return [
          {
            type: "taskList",
            attrs: { ordered: !!node.ordered, start: node.start ?? null, spread },
            content: items.map((item) => ({
              type: "taskItem",
              attrs: { checked: !!item.checked, spread: !!item.spread },
              content: itemBlocks(item.children ?? []),
            })),
          },
        ];
      }
      const content = items.map((item) => ({
        type: "listItem",
        attrs: { spread: !!item.spread },
        content: itemBlocks(item.children ?? []),
      }));
      return node.ordered
        ? [{ type: "orderedList", attrs: { start: node.start ?? 1, spread }, content }]
        : [{ type: "bulletList", attrs: { spread }, content }];
    }
    case "code":
      return [
        {
          type: "codeBlock",
          attrs: { language: node.lang ?? null, meta: node.meta ?? null },
          ...(node.value ? { content: [{ type: "text", text: node.value }] } : {}),
        },
      ];
    case "thematicBreak":
      return [{ type: "horizontalRule" }];
    case "table": {
      const align = node.align ?? [];
      const columns = node.children?.[0]?.children?.length ?? 0;
      const shares = parseWidths(node.data?.widths as string | null | undefined, columns);
      const pixels = shares ? pixelsOf(shares) : evenPixels(columns);
      return [
        {
          type: "table",
          attrs: { align },
          content: (node.children ?? []).map((row, index) => ({
            type: "tableRow",
            content: (row.children ?? []).map((cell, column) => ({
              type: index === 0 ? "tableHeader" : "tableCell",
              attrs: { colwidth: [pixels[column] ?? pixels[0]] },
              content: [paragraph(inline(cell.children ?? []))],
            })),
          })),
        },
      ];
    }
    case "containerDirective":
      if (node.name === "callout") {
        const label = (node.children ?? []).find(isLabel);
        return [
          {
            type: "callout",
            attrs: { label: label ? bare(label) : null, attributes: node.attributes ?? null },
            content: someBlocks(blocks((node.children ?? []).filter((child) => !isLabel(child)))),
          },
        ];
      }
      if (node.name === "details") {
        const label = (node.children ?? []).find(isLabel);
        const title = (node.attributes?.title ?? (label ? textOf(label) : "")).trim();
        return [
          ...(title
            ? [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: title, marks: [{ type: "bold" }] }],
                },
              ]
            : []),
          ...blocks((node.children ?? []).filter((child) => !isLabel(child))),
        ];
      }
      break;
    case "leafDirective": {
      const attributes = node.attributes ?? {};
      if (node.name === "poll" && attributes.id && !node.children?.length)
        return [{ type: "poll", attrs: { id: attributes.id, attributes } }];
      if (node.name === "proposal" && attributes.id && !node.children?.length)
        return [{ type: "proposal", attrs: { id: attributes.id, attributes } }];
      if (node.name === "embed" && attributes.page && !node.children?.length)
        return [
          {
            type: "embed",
            attrs: { page: attributes.page, section: attributes.section ?? null, attributes },
          },
        ];
      break;
    }
  }
  return [{ type: "rawBlock", attrs: { mdast: bare(node) } }];
}

/** A page's Markdown as the editor's document. */
export function markdownToProse(markdown: string): ProseNode {
  const tree = parser.parse(protectWikiLinks(markdown)) as unknown as Md;
  return { type: "doc", content: someBlocks(blocks(tree.children ?? [])) };
}

// --- document → Markdown ---------------------------------------------------------------------

/** Outermost first, when marks begin together and end together (the old editor's order). */
const MARK_ORDER = ["link", "highlight", "italic", "bold", "strike"];

const sameMark = (a: ProseMark, b: ProseMark) =>
  a.type === b.type &&
  (a.type === "link"
    ? a.attrs?.href === b.attrs?.href && (a.attrs?.title ?? null) === (b.attrs?.title ?? null)
    : a.type === "highlight"
      ? (a.attrs?.color ?? null) === (b.attrs?.color ?? null)
      : true);

const has = (marks: ProseMark[] | undefined, mark: ProseMark) =>
  !!marks?.some((other) => sameMark(other, mark));

function markNode(mark: ProseMark): Md {
  switch (mark.type) {
    case "bold":
      return { type: "strong", children: [] };
    case "italic":
      return { type: "emphasis", children: [] };
    case "strike":
      return { type: "delete", children: [] };
    case "link":
      return {
        type: "link",
        url: String(mark.attrs?.href ?? ""),
        title: (mark.attrs?.title as string | null) ?? null,
        children: [],
      };
    default: {
      const color = mark.attrs?.color;
      return {
        type: "textDirective",
        name: "mark",
        attributes: color ? { color: String(color) } : {},
        children: [],
      };
    }
  }
}

function leaf(node: ProseNode): Md[] {
  const code = node.marks?.some((mark) => mark.type === "code");
  switch (node.type) {
    case "text":
      return [
        code
          ? { type: "inlineCode", value: node.text ?? "" }
          : { type: "text", value: node.text ?? "" },
      ];
    case "hardBreak":
      return [{ type: "break" }];
    case "image":
      return [
        {
          type: "image",
          url: String(node.attrs?.src ?? ""),
          alt: (node.attrs?.alt as string | null) ?? null,
          title: (node.attrs?.title as string | null) ?? null,
        },
      ];
    case "wikiLink": {
      const label = node.attrs?.label ? `|${node.attrs.label}` : "";
      return [{ type: "text", value: `[[${node.attrs?.target ?? ""}${label}]]` }];
    }
    case "personMention":
      return [
        {
          type: "textDirective",
          name: "person",
          attributes: { id: String(node.attrs?.id ?? "") },
          children: [{ type: "text", value: String(node.attrs?.name ?? "") }],
        },
      ];
    case "rawInline":
      return [node.attrs?.mdast as Md];
    default:
      return [];
  }
}

/**
 * The text's nodes as the Markdown tree's phrasing: runs that share a mark
 * are wrapped once, a mark already open stays open while the next words
 * have it too, and of marks that begin together, the one that runs longer
 * goes outside — so bold-then-italic comes out as it went in.
 */
function phrasing(nodes: ProseNode[]): Md[] {
  const root: Md[] = [];
  const stack: { mark: ProseMark; node: Md }[] = [];
  const children = () => (stack.length ? stack[stack.length - 1].node.children! : root);
  nodes.forEach((node, index) => {
    const marks = (node.marks ?? []).filter((mark) => mark.type !== "code");
    let keep = 0;
    while (keep < stack.length && has(marks, stack[keep].mark)) keep++;
    stack.length = keep;
    const open = marks.filter((mark) => !stack.some((entry) => sameMark(entry.mark, mark)));
    const runOf = (mark: ProseMark) => {
      let end = index;
      while (end + 1 < nodes.length && has(nodes[end + 1].marks, mark)) end++;
      return end - index;
    };
    open
      .map((mark) => ({ mark, run: runOf(mark), order: MARK_ORDER.indexOf(mark.type) }))
      .sort((a, b) => b.run - a.run || a.order - b.order)
      .forEach(({ mark }) => {
        const wrapper = markNode(mark);
        children().push(wrapper);
        stack.push({ mark, node: wrapper });
      });
    children().push(...leaf(node));
  });
  return tidy(root);
}

/**
 * Adjacent text joined (a `[[link]]` with the words around it), and spaces
 * at the edges of bold, italic, struck-through and highlighted words moved
 * outside them ("** word**" isn't bold in Markdown) — as the old editor did.
 */
function tidy(nodes: Md[]): Md[] {
  const out: Md[] = [];
  const push = (node: Md) => {
    const last = out[out.length - 1];
    if (node.type === "text" && last?.type === "text") last.value = (last.value ?? "") + node.value;
    else if (node.type !== "text" || node.value) out.push(node);
  };
  for (const node of nodes) {
    const wraps =
      ["strong", "emphasis", "delete"].includes(node.type) ||
      (node.type === "textDirective" && node.name === "mark");
    if (!node.children || !wraps) {
      push(node.children ? { ...node, children: tidy(node.children) } : node);
      continue;
    }
    const inner = tidy(node.children);
    const first = inner[0];
    const lastChild = inner[inner.length - 1];
    const before = first?.type === "text" ? /^\s*/.exec(first.value ?? "")![0] : "";
    if (before) first.value = first.value!.slice(before.length);
    const after = lastChild?.type === "text" ? /\s*$/.exec(lastChild.value ?? "")![0] : "";
    if (after) lastChild.value = lastChild.value!.slice(0, lastChild.value!.length - after.length);
    const kept = inner.filter((child) => child.type !== "text" || child.value);
    if (before) push({ type: "text", value: before });
    if (kept.length) push({ ...node, children: kept });
    if (after) push({ type: "text", value: after });
  }
  return out;
}

function toMd(node: ProseNode): Md[] {
  const content = node.content ?? [];
  const attrs = node.attrs ?? {};
  const flow = () => content.flatMap(toMd);
  switch (node.type) {
    case "paragraph":
      // An empty paragraph (the line left for typing below a table, say) is nothing in Markdown.
      return content.length ? [{ type: "paragraph", children: phrasing(content) }] : [];
    case "heading":
      return [{ type: "heading", depth: Number(attrs.level ?? 1), children: phrasing(content) }];
    case "blockquote":
      return [{ type: "blockquote", children: flow() }];
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const ordered = node.type === "orderedList" || (node.type === "taskList" && !!attrs.ordered);
      return [
        {
          type: "list",
          ordered,
          start: ordered ? Number(attrs.start ?? 1) : null,
          spread: !!attrs.spread,
          children: content.map((item) => ({
            type: "listItem",
            spread: !!item.attrs?.spread,
            checked: item.type === "taskItem" ? !!item.attrs?.checked : null,
            children: (item.content ?? []).flatMap(toMd),
          })),
        },
      ];
    }
    case "codeBlock":
      return [
        {
          type: "code",
          lang: (attrs.language as string | null) || null,
          meta: (attrs.meta as string | null) || null,
          value: content.map((child) => child.text ?? "").join(""),
        },
      ];
    case "horizontalRule":
      return [{ type: "thematicBreak" }];
    case "table": {
      // Columns dragged to a size: their shares on a `::columns` line before the table.
      const pixels = (content[0]?.content ?? []).map(
        (cell) => (cell.attrs?.colwidth as number[] | null | undefined)?.[0] ?? 0
      );
      const shares = pixels.every((px) => px > 0) ? sharesOf(pixels) : [];
      const widths =
        shares.length && !evenShares(shares)
          ? [
              {
                type: "leafDirective",
                name: "columns",
                attributes: { widths: formatWidths(shares) },
                children: [],
              },
            ]
          : [];
      return [
        ...widths,
        {
          type: "table",
          align: (attrs.align as (string | null)[] | null) ?? null,
          children: content.map((row) => ({
            type: "tableRow",
            children: (row.content ?? []).map((cell) => {
              // A cell is one line in Markdown: its paragraphs run together.
              const lines = (cell.content ?? []).filter((child) => child.type === "paragraph");
              const words = lines.flatMap((line, index) =>
                index ? [{ type: "text", text: " " }, ...(line.content ?? [])] : line.content ?? []
              );
              return { type: "tableCell", children: phrasing(words) };
            }),
          })),
        },
      ];
    }
    case "callout":
      return [
        {
          type: "containerDirective",
          name: "callout",
          attributes: (attrs.attributes as Md["attributes"]) ?? {},
          children: [...(attrs.label ? [attrs.label as Md] : []), ...flow()],
        },
      ];
    case "poll":
    case "proposal":
      return [
        {
          type: "leafDirective",
          name: node.type,
          attributes: { ...((attrs.attributes as object) ?? {}), id: String(attrs.id ?? "") },
          children: [],
        },
      ];
    case "embed": {
      const attributes: Record<string, string> = {
        ...((attrs.attributes as Record<string, string>) ?? {}),
        page: String(attrs.page ?? ""),
      };
      if (attrs.section) attributes.section = String(attrs.section);
      else delete attributes.section;
      return [{ type: "leafDirective", name: "embed", attributes, children: [] }];
    }
    case "rawBlock":
      return [attrs.mdast as Md];
    default:
      return [];
  }
}

/** The editor's document as the page's Markdown. */
export function proseToMarkdown(doc: ProseNode): string {
  const tree = { type: "root", children: (doc.content ?? []).flatMap(toMd) };
  return normalizeWikiLinks(writer.stringify(tree as never));
}

/** How a raw node (one the editor doesn't know) reads, as Markdown. */
export function rawMarkdown(mdast: unknown): string {
  const node = mdast as Md;
  const inlineNode =
    !/^(html|definition|footnoteDefinition|leafDirective|containerDirective)$/.test(node.type);
  const tree = {
    type: "root",
    children: [inlineNode ? { type: "paragraph", children: [node] } : node],
  };
  return normalizeWikiLinks(writer.stringify(tree as never)).trim();
}

/** What the Markdown writer alone makes of a page — the round trip the editor must equal. */
export function rewriteMarkdown(markdown: string): string {
  return normalizeWikiLinks(writer.stringify(parser.parse(protectWikiLinks(markdown))));
}
