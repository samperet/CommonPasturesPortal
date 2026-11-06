import type { Editor } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

/**
 * Turning a page's link into the page shown here, and back, in the visual
 * editor — the toggle on a page link's menu (`wiki-link-node.tsx`) and on an
 * embedded page's card (`editor-blocks.tsx`). A link (`[[Title]]`) and an
 * embed (`::embed{page="Title"}`) name the page the same way, so nothing is
 * lost but a link's own words, or an embed's section (links go to the whole
 * page).
 */

/** Nothing but spaces and line breaks. */
const blank = (content: Fragment) => {
  let empty = true;
  content.forEach((node) => {
    if (!(node.isText && !node.text?.trim()) && node.type.name !== "hardBreak") empty = false;
  });
  return empty;
};

/** The words either side of the link, without the space that was next to it. */
function trimmed(content: Fragment, side: "start" | "end") {
  const edge = side === "start" ? content.firstChild : content.lastChild;
  if (!edge?.isText || !edge.text) return content;
  const text = side === "start" ? edge.text.replace(/^\s+/, "") : edge.text.replace(/\s+$/, "");
  if (text === edge.text) return content;
  const rest =
    side === "start" ? content.cut(edge.nodeSize) : content.cut(0, content.size - edge.nodeSize);
  if (!text) return rest;
  const kept = edge.type.schema.text(text, edge.marks);
  return side === "start" ? Fragment.from(kept).append(rest) : rest.addToEnd(kept);
}

/**
 * Show the linked page here: the link becomes the page, in its place — its
 * line split around it, so words before and after stay where they were.
 * Where a page can't go (inside a heading in a list, say), it goes after
 * the block the link was in.
 */
export function linkToEmbed(editor: Editor, pos: number) {
  const { state } = editor;
  const link = state.doc.nodeAt(pos);
  const embedType = state.schema.nodes.embed;
  if (!link || link.type.name !== "wikiLink" || !embedType) return false;
  const embed = embedType.create({ page: link.attrs.target });
  const $pos = state.doc.resolve(pos);
  const depth = $pos.depth;
  const line = $pos.parent;
  const before = trimmed(line.content.cut(0, $pos.parentOffset), "end");
  const after = trimmed(line.content.cut($pos.parentOffset + link.nodeSize), "start");
  const container = $pos.node(depth - 1);
  const index = $pos.index(depth - 1);
  const fits = (nodes: PMNode[]) => container.canReplace(index, index + 1, Fragment.from(nodes));
  const rest = blank(after) ? [] : [line.copy(after)];
  const tr = state.tr;
  let at: number;
  // Words before it stay a line of their own; a list item, say, must start with one.
  const choices = [[...(blank(before) ? [] : [line.copy(before)]), embed, ...rest]];
  choices.push([line.copy(before), embed, ...rest]);
  const nodes = choices.find(fits);
  if (nodes) {
    tr.replaceWith($pos.before(depth), $pos.after(depth), nodes);
    at = $pos.before(depth) + (nodes[0] === embed ? 0 : nodes[0].nodeSize);
  } else {
    at = $pos.after(1);
    tr.insert(at, embed).delete(pos, pos + link.nodeSize);
    at = tr.mapping.slice(1).map(at);
  }
  const placed = tr.doc.nodeAt(at);
  if (placed?.type === embedType) tr.setSelection(NodeSelection.create(tr.doc, at));
  editor.view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
  return true;
}

/** Just a link instead: the page shown here becomes a link to it, on a line of its own. */
export function embedToLink(editor: Editor, pos: number) {
  const { state } = editor;
  const embed = state.doc.nodeAt(pos);
  const { wikiLink, paragraph } = state.schema.nodes;
  if (!embed || embed.type.name !== "embed" || !wikiLink || !paragraph) return false;
  const line = paragraph.create(null, wikiLink.create({ target: embed.attrs.page }));
  const tr = state.tr.replaceWith(pos, pos + embed.nodeSize, line);
  tr.setSelection(NodeSelection.create(tr.doc, pos + 1));
  editor.view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
  return true;
}
