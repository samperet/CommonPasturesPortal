"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Extension, type Editor } from "@tiptap/core";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import {
  BarChart3,
  FilePlus2,
  Handshake,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  LayoutList,
  List,
  ListChecks,
  ListOrdered,
  Megaphone,
  Minus,
  Quote,
  Table2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { suggestionPopup, type MenuHandle } from "@/components/wiki/suggestion-popup";

/**
 * Typing / at the start of a line (or after a space) in the wiki editor: a
 * menu of what to put there — headings, lists, a to-do list, a quote, a
 * callout, a table, a divider, a photo, a page (linked
 * or shown here) — and, in a page (not an alternative version), a poll, a
 * proposal, a file upload and who's present. Typing narrows it; Enter or a
 * click puts the thing in place of the "/…".
 */

type Icon = typeof List;

export interface SlashItem {
  key: string;
  label: string;
  hint: string;
  /** Other words it's found by. */
  words?: string;
  icon: Icon;
  run: (editor: Editor) => void;
}

/** What the page's editor opens for the items that need a box (a photo, a poll…). */
export interface SlashActions {
  onImage?: () => void;
  onPage?: () => void;
  onPoll?: () => void;
  onProposal?: () => void;
  onUpload?: () => void;
  onPresent?: () => void;
}

const chain = (editor: Editor) => editor.chain().focus();

export function slashItems(actions: SlashActions): SlashItem[] {
  const items: SlashItem[] = [
    {
      key: "h1",
      label: "Heading 1",
      hint: "A big heading",
      words: "title",
      icon: Heading1,
      run: (e) => chain(e).setHeading({ level: 1 }).run(),
    },
    {
      key: "h2",
      label: "Heading 2",
      hint: "A section heading",
      icon: Heading2,
      run: (e) => chain(e).setHeading({ level: 2 }).run(),
    },
    {
      key: "h3",
      label: "Heading 3",
      hint: "A smaller heading",
      icon: Heading3,
      run: (e) => chain(e).setHeading({ level: 3 }).run(),
    },
    {
      key: "bullets",
      label: "Bulleted list",
      hint: "A simple list",
      words: "ul points",
      icon: List,
      run: (e) => chain(e).toggleBulletList().run(),
    },
    {
      key: "numbers",
      label: "Numbered list",
      hint: "A list in order",
      words: "ol steps",
      icon: ListOrdered,
      run: (e) => chain(e).toggleOrderedList().run(),
    },
    {
      key: "checklist",
      label: "To-do list",
      hint: "Things to tick off",
      words: "checklist todo tasks check",
      icon: ListChecks,
      run: (e) => chain(e).toggleTaskList().run(),
    },
    {
      key: "quote",
      label: "Quote",
      hint: "Someone's words, set apart",
      icon: Quote,
      run: (e) => chain(e).setParagraph().wrapIn("blockquote").run(),
    },
    {
      key: "callout",
      label: "Callout",
      hint: "Words that stand out, in a dotted box",
      words: "note warning",
      icon: Megaphone,
      run: (e) => chain(e).wrapIn("callout").run(),
    },
    {
      key: "table",
      label: "Table",
      hint: "Rows and columns",
      icon: Table2,
      run: (e) => chain(e).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      key: "divider",
      label: "Divider",
      hint: "A line across",
      words: "rule hr line",
      icon: Minus,
      run: (e) => chain(e).setHorizontalRule().run(),
    },
  ];
  const extra: (SlashItem | null)[] = [
    actions.onImage
      ? {
          key: "photo",
          label: "Photo",
          hint: "From this device or the web",
          words: "image picture",
          icon: ImagePlus,
          run: () => actions.onImage!(),
        }
      : null,
    actions.onPage
      ? {
          key: "page",
          label: "Link a page",
          hint: "Link one, or show it here",
          words: "embed document",
          icon: LayoutList,
          run: () => actions.onPage!(),
        }
      : null,
    actions.onPoll
      ? {
          key: "poll",
          label: "Poll",
          hint: "Ask everyone to choose",
          words: "vote",
          icon: BarChart3,
          run: () => actions.onPoll!(),
        }
      : null,
    actions.onProposal
      ? {
          key: "proposal",
          label: "Proposal",
          hint: "Put something to the circle",
          words: "consent",
          icon: Handshake,
          run: () => actions.onProposal!(),
        }
      : null,
    actions.onUpload
      ? {
          key: "upload",
          label: "Upload a file",
          hint: "Into the circle's documents, linked here",
          words: "document attach",
          icon: FilePlus2,
          run: () => actions.onUpload!(),
        }
      : null,
    actions.onPresent
      ? {
          key: "present",
          label: "Who's present",
          hint: "The people at this meeting",
          words: "attendance meeting",
          icon: Users,
          run: () => actions.onPresent!(),
        }
      : null,
  ];
  return [...items, ...extra.filter((item): item is SlashItem => !!item)];
}

/** The items whose name or other words start with (or, failing that, contain) what's typed. */
export function matching(items: SlashItem[], query: string) {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return items;
  const words = (item: SlashItem) => `${item.label} ${item.words ?? ""}`.toLowerCase().split(/\s+/);
  const starts = items.filter((item) => words(item).some((word) => word.startsWith(wanted)));
  return starts.length
    ? starts
    : items.filter((item) => `${item.label} ${item.words ?? ""}`.toLowerCase().includes(wanted));
}

type MenuProps = SuggestionProps<SlashItem, SlashItem> & { items: SlashItem[] };

const SlashList = forwardRef<MenuHandle, MenuProps>(function SlashList(
  { query, command, items },
  ref
) {
  const shown = useMemo(() => matching(items, query), [items, query]);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [query]);
  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (!shown.length) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setIndex((current) => (current + step + shown.length) % shown.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        command(shown[Math.min(index, shown.length - 1)]);
        return true;
      }
      return false;
    },
  }));
  if (!shown.length) return null;
  return (
    <ul
      className="flex max-h-80 w-[min(20rem,calc(100vw-2rem))] flex-col overflow-y-auto rounded-lg border border-border bg-surface p-1 text-sm shadow-elev"
      role="listbox"
      aria-label="Insert"
      data-slash-menu
    >
      {shown.map((item, at) => (
        <li
          key={item.key}
          role="option"
          aria-selected={at === index}
          tabIndex={-1}
          onMouseEnter={() => setIndex(at)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => command(item)}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-foreground",
            at === index && "bg-accent"
          )}
        >
          <item.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{item.label}</span>
            <span className="block truncate text-xs text-muted">{item.hint}</span>
          </span>
        </li>
      ))}
    </ul>
  );
});

/** The / menu, as an editor extension. `getItems` gives what's on offer now. */
export const SlashMenu = (getItems: () => SlashItem[]) =>
  Extension.create({
    name: "slashMenu",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: new PluginKey("slashMenu"),
          char: "/",
          allowSpaces: false,
          // Not inside code, where a / is just a /.
          allow: ({ state, range }) =>
            !state.doc.resolve(range.from).parent.type.spec.code &&
            !state.doc
              .resolve(range.from)
              .marks()
              .some((mark) => mark.type.name === "code"),
          items: () => [],
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            props.run(editor);
          },
          render: suggestionPopup<SlashItem, { items: SlashItem[] }>(SlashList, () => ({
            items: getItems(),
          })),
        }),
      ];
    },
  });
