"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";
import { FilePlus2, LayoutList, Link2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { proseToMarkdown, type ProseNode } from "@/lib/wiki/prose";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/use-toast";

/**
 * Move the selected text to a page of its own (the right-click menu's "Move
 * to a new page…"): name the page — its first heading, if the text starts
 * with one (then left out of its text, as the title says it), else its
 * first words — and the page is made inside this one, kept by the same
 * circle, holding the text as it was (formatting, links, photos and all).
 * Only once it's made does the text here give way to a link to it — or, if
 * chosen, the page itself shown here (an embed). If the text changed
 * meanwhile (someone else's edit came in), nothing here is touched.
 */

/** Its first words, as a title: up to eight, and no trailing punctuation. */
export function titleFrom(words: string) {
  const first = words.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  return first.replace(/[\s.,;:!?…–—-]+$/, "").slice(0, 120);
}

const textOf = (node: ProseNode): string =>
  (node.text ?? "") + (node.content ?? []).map(textOf).join("");

export function MoveToPageDialog({
  editor,
  page,
  circleName,
  onClose,
}: {
  editor: Editor;
  /** The page being written, which the new one goes inside. */
  page: { id: string; title: string };
  circleName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // The selection as it was when the menu was used: what moves, and where it was.
  const [moving] = useState(() => {
    const { from, to } = editor.state.selection;
    const nodes = (editor.state.selection.content().content.toJSON() ?? []) as ProseNode[];
    const heading = nodes[0]?.type === "heading" ? textOf(nodes[0]).trim() : "";
    const words = editor.state.doc.textBetween(from, to, " ").trim();
    return { from, to, text: editor.state.doc.textBetween(from, to, "\n"), nodes, heading, words };
  });
  const [title, setTitle] = useState(() =>
    (moving.heading || titleFrom(moving.words)).slice(0, 120)
  );
  const [leave, setLeave] = useState<"link" | "embed">("link");
  const unchanged = () =>
    moving.to <= editor.state.doc.content.size &&
    editor.state.doc.textBetween(moving.from, moving.to, "\n") === moving.text;
  const wordCount = moving.words.split(/\s+/).filter(Boolean).length;

  const move = useMutation({
    mutationFn: async () => {
      if (!unchanged())
        throw new Error("The text changed while you were naming the page — select it again.");
      const named = title.trim();
      // A first heading that the title now says is left out of the page's text.
      const nodes =
        moving.heading && named.toLowerCase() === moving.heading.toLowerCase()
          ? moving.nodes.slice(1)
          : moving.nodes;
      const body = proseToMarkdown({ type: "doc", content: nodes });
      const { page: made } = await apiFetch<{ page: { slug: string; title: string } }>(
        "/api/wiki/pages",
        { method: "POST", body: JSON.stringify({ title: named, body, parentId: page.id }) }
      );
      return made;
    },
    onSuccess: (made) => {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      if (!unchanged()) {
        toast({
          title: `“${made.title}” is made`,
          description:
            "But the text here changed meanwhile, so it's still here: remove it yourself.",
        });
        onClose();
        return;
      }
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: moving.from, to: moving.to },
          leave === "link"
            ? { type: "wikiLink", attrs: { target: made.title, label: null } }
            : { type: "embed", attrs: { page: made.title } }
        )
        .run();
      toast({
        title: `Moved to “${made.title}”`,
        description:
          leave === "link"
            ? `A page inside “${page.title}”; a link to it is here now.`
            : `A page inside “${page.title}”, shown here.`,
      });
      onClose();
    },
  });

  return (
    <Dialog
      title="Move to a new page"
      icon={<FilePlus2 className="h-5 w-5 text-primary" />}
      onClose={() => (move.isPending ? undefined : onClose())}
    >
      <form
        className="flex flex-col gap-4"
        data-move-to-page
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) move.mutate();
        }}
      >
        <p className="text-sm text-foreground-light">
          {wordCount === 1 ? "The selected word moves" : `The ${wordCount} selected words move`} to
          a new page inside “{page.title}”, kept by {circleName}, with their formatting.
        </p>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          The new page&apos;s title
          <Input
            autoFocus
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            className="bg-white font-normal"
            data-move-title
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Here, in their place</span>
          <SegmentedControl
            label="Here, in their place"
            size="sm"
            value={leave}
            onChange={setLeave}
            options={[
              { value: "link", label: "A link to it", icon: Link2 },
              { value: "embed", label: "The page, shown here", icon: LayoutList },
            ]}
          />
        </div>
        {move.error ? (
          <p className="text-sm text-destructive" role="alert" data-move-error>
            {move.error.message}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={move.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim() || move.isPending}>
            {move.isPending ? "Moving…" : "Move to the new page"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
