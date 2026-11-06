"use client";

import { Extension, Mark, Node, mergeAttributes, type AnyExtension } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Code from "@tiptap/extension-code";
import Image from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { FindReplace } from "@/components/wiki/editor-find";
import { highlightColor } from "@/lib/wiki/colors";
import { PersonMention, WikiLink } from "@/components/wiki/wiki-link-node";
import { MIN_COLUMN_PX, evenPixels } from "@/lib/wiki/tables";
import {
  CalloutView,
  EmbedView,
  PollView,
  ProposalView,
  RawBlockView,
  RawInlineView,
} from "@/components/wiki/editor-blocks";

/**
 * The visual editor's schema (TipTap): exactly what `lib/wiki/prose.ts`
 * reads pages into and writes back — the usual Markdown blocks and marks,
 * highlights, `[[link]]` tags, residents mentioned, callouts, polls,
 * proposals, embedded pages, and "raw" nodes for whatever else a page
 * holds. Attributes only Markdown needs (a loose list, a code block's
 * meta, a table's column alignment) are kept but never drawn.
 */

/** A highlight (`:mark[…]{color}`): the words, on their colour. */
export const Highlight = Mark.create({
  name: "highlight",
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-highlight"),
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "mark[data-highlight]" }];
  },
  renderHTML({ mark, HTMLAttributes }) {
    const color = highlightColor(mark.attrs.color);
    return [
      "mark",
      mergeAttributes(HTMLAttributes, { class: `wiki-mark hl-${color}`, "data-highlight": color }),
      0,
    ];
  },
});

const blockOf = (
  name: string,
  attributes: Record<string, { default: unknown }>,
  view: Parameters<typeof ReactNodeViewRenderer>[0],
  tag: string,
  content?: string
) =>
  Node.create({
    name,
    group: "block",
    ...(content ? { content, defining: true } : { atom: true, selectable: true, draggable: false }),
    addAttributes() {
      return Object.fromEntries(
        Object.entries(attributes).map(([key, value]) => [key, { ...value, rendered: false }])
      );
    },
    parseHTML() {
      return [{ tag: `${tag}[data-${name}]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return content
        ? [tag, mergeAttributes(HTMLAttributes, { [`data-${name}`]: "" }), 0]
        : [tag, mergeAttributes(HTMLAttributes, { [`data-${name}`]: "" })];
    },
    addNodeView() {
      return ReactNodeViewRenderer(view);
    },
  });

export const Callout = blockOf(
  "callout",
  { label: { default: null }, attributes: { default: null } },
  CalloutView,
  "aside",
  "block+"
);
export const Poll = blockOf(
  "poll",
  { id: { default: "" }, attributes: { default: null } },
  PollView,
  "div"
);
export const Proposal = blockOf(
  "proposal",
  { id: { default: "" }, attributes: { default: null } },
  ProposalView,
  "div"
);
export const Embed = blockOf(
  "embed",
  { page: { default: "" }, section: { default: null }, attributes: { default: null } },
  EmbedView,
  "div"
);
export const RawBlock = blockOf("rawBlock", { mdast: { default: null } }, RawBlockView, "div");

export const RawInline = Node.create({
  name: "rawInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { mdast: { default: null, rendered: false } };
  },
  parseHTML() {
    return [{ tag: "span[data-raw-inline]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-raw-inline": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RawInlineView);
  },
});

/** What Markdown needs to write things back as they were, kept on the nodes but never drawn. */
const MarkdownAttributes = Extension.create({
  name: "markdownAttributes",
  addGlobalAttributes() {
    const hidden = (value: unknown) => ({ default: value, rendered: false });
    return [
      {
        types: ["bulletList", "orderedList", "listItem", "taskItem"],
        attributes: { spread: hidden(false) },
      },
      {
        types: ["taskList"],
        attributes: { spread: hidden(false), ordered: hidden(false), start: hidden(null) },
      },
      { types: ["codeBlock"], attributes: { meta: hidden(null) } },
      { types: ["table"], attributes: { align: hidden(null) } },
    ];
  },
});

export interface WikiSchemaOptions {
  placeholder: string;
  /** Ctrl/⌘+K: the link box. */
  onLinkShortcut?: () => void;
  /** Photos pasted or dropped in: upload each and give its address. */
  uploadImage?: (file: File) => Promise<string>;
  /** Ctrl/⌘+F (find) or Ctrl+H (find and replace) in the text: open the find bar. */
  onFind?: (replace: boolean) => void;
}

/** Photos pasted or dropped into the text are uploaded, then put where they landed. */
const ImageDrop = (upload: (file: File) => Promise<string>) =>
  Extension.create({
    name: "imageDrop",
    addProseMirrorPlugins() {
      const editor = this.editor;
      const insert = (files: File[], at: number | null) => {
        for (const file of files)
          void upload(file)
            .then((src) => {
              const chain = editor.chain().focus();
              (at === null ? chain : chain.setTextSelection(at))
                .insertContent({
                  type: "image",
                  attrs: { src, alt: file.name.replace(/\.[^.]+$/, "") },
                })
                .run();
            })
            .catch(() => undefined);
      };
      const images = (list: FileList | null | undefined) =>
        Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
      return [
        new Plugin({
          props: {
            handlePaste: (_view, event) => {
              const files = images(event.clipboardData?.files);
              if (!files.length) return false;
              insert(files, null);
              return true;
            },
            handleDrop: (view, event) => {
              const files = images((event as DragEvent).dataTransfer?.files);
              if (!files.length) return false;
              const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
              insert(files, at);
              return true;
            },
          },
        }),
      ];
    },
  });

/** Ctrl/⌘+K opens the link box. */
const LinkShortcut = (open: () => void) =>
  Extension.create({
    name: "linkShortcut",
    addKeyboardShortcuts() {
      return {
        "Mod-k": () => {
          open();
          return true;
        },
      };
    },
  });

/** Keys that don't count as typing something else (held for a shortcut). */
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);
/** Editors whose last key was Escape: their next Tab leaves. */
const escaped = new WeakSet<object>();

/**
 * Tab types a tab, as in a word processor — unless a list or a table uses it
 * first (their own Tab, at the default priority: indenting an item, moving
 * to the next cell). Shift-Tab takes back a tab just before the cursor, or
 * else goes back out of the editor as usual. Escape and then Tab leaves the
 * editor, so keyboard users are never stuck in it. A tab at the start or
 * end of a line is written as `&#x9;` in the page's Markdown, so it stays.
 */
const TabKey = Extension.create({
  name: "tabKey",
  priority: 50,
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) =>
        editor.commands.command(({ tr }) => {
          tr.insertText("\t").scrollIntoView();
          return true;
        }),
      "Shift-Tab": ({ editor }) => {
        const { empty, $from } = editor.state.selection;
        if (!empty || !$from.nodeBefore?.text?.endsWith("\t")) return false;
        return editor.commands.command(({ tr }) => {
          tr.delete($from.pos - 1, $from.pos);
          return true;
        });
      },
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            // Before any shortcut sees the key: after Escape, Tab is the browser's again (to move on).
            keydown: (_view, event) => {
              const tab = event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey;
              if (tab && escaped.delete(editor)) return true;
              if (event.key === "Escape") escaped.add(editor);
              else if (!MODIFIERS.has(event.key)) escaped.delete(editor);
              return false;
            },
            focus: () => {
              escaped.delete(editor);
              return false;
            },
          },
        },
      }),
    ];
  },
});

/**
 * Every table cell has a width (`colwidth`, pixels): a table made here starts
 * with equal columns, so dragging one column leaves the others as they are,
 * and the widths can be written down with the page (`lib/wiki/tables.ts`).
 */
const TableColumnWidths = Extension.create({
  name: "tableColumnWidths",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "table") return;
            const columns = node.firstChild?.childCount ?? 0;
            const pixels = evenPixels(columns);
            node.descendants((cell, offset) => {
              if (cell.type.name !== "tableCell" && cell.type.name !== "tableHeader") return;
              if (cell.attrs.colwidth?.[0]) return false;
              const row = state.doc.resolve(pos + 1 + offset);
              const column = row.index(row.depth);
              tr.setNodeMarkup(pos + 1 + offset, undefined, {
                ...cell.attrs,
                colwidth: [pixels[column] ?? pixels[0]],
              });
              changed = true;
              return false;
            });
            return false;
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});

/** A table cell is one line of Markdown: paragraphs only. */
const cellContent = { content: "paragraph+" };

export function wikiExtensions({
  placeholder,
  onLinkShortcut,
  uploadImage,
  onFind,
}: WikiSchemaOptions): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      code: false,
      underline: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    // Code inside bold or a link is fine in Markdown.
    Code.extend({ excludes: "" }),
    Image.configure({ inline: true }),
    Table.configure({ resizable: true, cellMinWidth: MIN_COLUMN_PX, lastColumnResizable: true }),
    TableColumnWidths,
    TableRow,
    TableHeader.extend(cellContent),
    TableCell.extend(cellContent),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
    Highlight,
    WikiLink,
    PersonMention,
    Callout,
    RawBlock,
    RawInline,
    MarkdownAttributes,
    // Always known (a page's text can hold them), though only pages' toolbars add them.
    Poll,
    Proposal,
    Embed,
    // Find and replace (`editor-find.ts`; the bar is `find-bar.tsx`).
    FindReplace(onFind),
    TabKey,
    ...(onLinkShortcut ? [LinkShortcut(onLinkShortcut)] : []),
    ...(uploadImage ? [ImageDrop(uploadImage)] : []),
  ];
}
