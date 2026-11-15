"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import {
  Bold,
  BookOpen,
  ClipboardPaste,
  Code,
  Copy,
  Eraser,
  FilePlus2,
  Italic,
  Link2,
  RemoveFormatting,
  Scissors,
  Strikethrough,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_STYLES,
  highlightColor,
  type HighlightColor,
} from "@/lib/wiki/colors";
import { applyHighlight, removeHighlight } from "@/components/wiki/editor-toolbar";
import { cn } from "@/lib/utils";

/**
 * The wiki editor's right-click menu: cut, copy and paste; bold, italic,
 * strikethrough and code; highlight the selected words (or, inside a
 * highlight, change its colour or take it off); add a web link, or link the
 * selected words to a page (`link-words-dialog.tsx`); move the selected text
 * to a page of its own, linked from here (`move-to-page-dialog.tsx`); clear formatting.
 * Shift + right-click opens the browser's own menu instead (for spelling).
 * Choosing an item never moves the cursor out of the text, so the selection
 * it acts on stays put.
 */

type Open = {
  x: number;
  y: number;
  selected: boolean;
  /** The colour of the highlight right-clicked in, if it was one. */
  markColor: HighlightColor | null;
};

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function EditorContextMenu({
  editor,
  onLink,
  onLinkPage,
  onMoveToPage,
}: {
  editor: Editor;
  onLink: () => void;
  /** Link the selected words to a page (new or existing); only where pages can be linked. */
  onLinkPage?: () => void;
  /** Move the selected text to a new page inside this one, linked from here; only in a page. */
  onMoveToPage?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState<Open | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Open on right-click anywhere in the text (Shift: the browser's menu).
  useEffect(() => {
    const element = editor.view.dom;
    const onContextMenu = (event: MouseEvent) => {
      if (event.shiftKey) return;
      event.preventDefault();
      const mark = (event.target as Element | null)?.closest<HTMLElement>("mark[data-highlight]");
      // Right-clicking in a highlight (with nothing selected) puts the cursor there, to change it.
      if (mark && editor.state.selection.empty) {
        const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        if (pos !== undefined) editor.commands.setTextSelection(pos);
      }
      const { empty } = editor.state.selection;
      const text = empty
        ? ""
        : editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ");
      setAt(null);
      setOpen({
        x: event.clientX,
        y: event.clientY,
        selected: !!text.trim(),
        markColor: mark ? highlightColor(mark.dataset.highlight) : null,
      });
    };
    element.addEventListener("contextmenu", onContextMenu);
    return () => element.removeEventListener("contextmenu", onContextMenu);
  }, [editor]);

  // Keep it on screen.
  useLayoutEffect(() => {
    if (!open || !menu.current) return;
    const { width, height } = menu.current.getBoundingClientRect();
    setAt({
      left: Math.max(8, Math.min(open.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(open.y, window.innerHeight - height - 8)),
    });
  }, [open]);

  // Close on Escape, a click elsewhere, scrolling, or resizing.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onDown = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  const mod = isMac() ? "⌘" : "Ctrl+";
  const run = (action: () => void) => () => {
    setOpen(null);
    action();
  };
  const clipboard = (command: "cut" | "copy") =>
    run(() => {
      editor.commands.focus();
      if (!document.execCommand(command))
        toast({ title: `Press ${mod}${command === "cut" ? "X" : "C"} to ${command}` });
    });
  const paste = run(async () => {
    try {
      const text = await navigator.clipboard.readText();
      editor.chain().focus().insertContent(text).run();
    } catch {
      toast({ title: `Press ${mod}V to paste` });
    }
  });
  const highlight = (color: HighlightColor) =>
    run(() => {
      const problem = applyHighlight(editor, color);
      if (problem) toast({ title: problem });
    });
  // Keep the cursor (and selection) in the text while choosing.
  const keep = (event: React.MouseEvent) => event.preventDefault();

  const item = (
    label: string,
    Icon: typeof Bold,
    onClick: () => void,
    { shortcut, disabled = false }: { shortcut?: string; disabled?: boolean } = {}
  ) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onMouseDown={keep}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-4 w-4 text-foreground-light" aria-hidden />
      <span className="flex-1">{label}</span>
      {shortcut ? <span className="text-xs text-muted">{shortcut}</span> : null}
    </button>
  );
  const rule = <div className="my-1 h-px bg-border" role="separator" />;
  const { selected, markColor } = open;
  const inMark = !!markColor;

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label="Edit text"
      data-editor-dropdown
      data-wiki-context-menu
      onContextMenu={(event) => event.preventDefault()}
      style={{
        left: at?.left ?? open.x,
        top: at?.top ?? open.y,
        visibility: at ? "visible" : "hidden",
      }}
      className="fixed z-[60] w-60 rounded-lg border border-border bg-white p-1 shadow-elev"
    >
      {item("Cut", Scissors, clipboard("cut"), { shortcut: `${mod}X`, disabled: !selected })}
      {item("Copy", Copy, clipboard("copy"), { shortcut: `${mod}C`, disabled: !selected })}
      {item("Paste", ClipboardPaste, paste, { shortcut: `${mod}V` })}
      {rule}
      {item(
        "Bold",
        Bold,
        run(() => editor.chain().focus().toggleBold().run()),
        {
          shortcut: `${mod}B`,
          disabled: !selected,
        }
      )}
      {item(
        "Italic",
        Italic,
        run(() => editor.chain().focus().toggleItalic().run()),
        {
          shortcut: `${mod}I`,
          disabled: !selected,
        }
      )}
      {item(
        "Strikethrough",
        Strikethrough,
        run(() => editor.chain().focus().toggleStrike().run()),
        {
          disabled: !selected,
        }
      )}
      {item(
        "Code",
        Code,
        run(() => editor.chain().focus().toggleCode().run()),
        {
          disabled: !selected,
        }
      )}
      {rule}
      <div className="px-2.5 py-1.5" role="group" aria-label="Highlight">
        <p className="mb-1.5 text-xs font-medium text-muted">
          {inMark ? "Change highlight" : "Highlight"}
        </p>
        <div className="flex items-center gap-1.5">
          {HIGHLIGHT_COLORS.map((name) => (
            <button
              key={name}
              type="button"
              role="menuitemradio"
              title={HIGHLIGHT_STYLES[name].label}
              aria-label={`${HIGHLIGHT_STYLES[name].label} highlight`}
              aria-checked={inMark && name === markColor}
              disabled={!inMark && !selected}
              onMouseDown={keep}
              onClick={highlight(name)}
              className={cn(
                "h-6 w-6 rounded-full border border-black/10 transition hover:scale-110 disabled:pointer-events-none disabled:opacity-40",
                `hl-${name}`,
                inMark && name === markColor && "ring-2 ring-foreground/50 ring-offset-1"
              )}
            />
          ))}
          {inMark ? (
            <button
              type="button"
              role="menuitem"
              title="No highlight"
              aria-label="Remove highlight"
              onMouseDown={keep}
              onClick={run(() => removeHighlight(editor))}
              className="ml-auto grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-accent hover:text-foreground"
            >
              <Eraser className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {rule}
      {item("Link…", Link2, run(onLink), { shortcut: `${mod}K` })}
      {onLinkPage
        ? item("Link to a page…", BookOpen, run(onLinkPage), { disabled: !selected })
        : null}
      {onMoveToPage
        ? item("Move to a new page…", FilePlus2, run(onMoveToPage), { disabled: !selected })
        : null}
      {item(
        "Clear formatting",
        RemoveFormatting,
        run(() => editor.chain().focus().unsetAllMarks().run()),
        { disabled: !selected }
      )}
      <p className="px-2.5 pb-1 pt-1.5 text-[11px] leading-snug text-muted">
        Shift + right-click for the browser&rsquo;s menu (spelling).
      </p>
    </div>,
    document.body
  );
}
