/**
 * Tabs typed in a page (the editor's Tab key) shown as tabs when it's read.
 * HTML squeezes a tab into a single space, so each run of tabs in the text
 * becomes a `<span class="wiki-tab">` that keeps it (`white-space: pre`, in
 * `globals.css`), reaching to the next tab stop as it does in the editor.
 * Code is left alone: it keeps its own spacing.
 */

type Node = { type: string; value?: string; children?: Node[]; data?: Record<string, unknown> };

/** A text's tabs set apart from its words. */
export function splitTabs(value: string): Node[] {
  return value
    .split(/(\t+)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("\t")
        ? {
            type: "wikiTab",
            data: { hName: "span", hProperties: { className: ["wiki-tab"] } },
            children: [{ type: "text", value: part }],
          }
        : { type: "text", value: part }
    );
}

/** The reader's plugin. */
export function remarkTabs() {
  const visit = (node: Node) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type === "text" && child.value?.includes("\t")) return splitTabs(child.value);
      visit(child);
      return [child];
    });
  };
  return (tree: Node) => visit(tree);
}
