import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { remarkTabs } from "./tabs";
import { markdownToProse, proseToMarkdown } from "./prose";

/** A page's Markdown as the reader shows it (react-markdown, as `components/wiki/markdown.tsx`). */
const html = (markdown: string) =>
  renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkTabs] }, markdown));

describe("tabs in pages", () => {
  it("keeps a tab typed anywhere in a line, the start and end included", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "\tName\tPhone\t" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "\tTitle" }] },
      ],
    };
    const markdown = proseToMarkdown(doc);
    expect(markdown).toBe("&#x9;Name\tPhone&#x9;\n\n## &#x9;Title\n");
    expect(markdownToProse(markdown).content?.[0].content?.[0].text).toBe("\tName\tPhone\t");
  });

  it("shows tabs as tabs when the page is read, but leaves code alone", () => {
    expect(html("Name\tPhone")).toBe('<p>Name<span class="wiki-tab">\t</span>Phone</p>');
    expect(html("&#x9;&#x9;Indented")).toBe('<p><span class="wiki-tab">\t\t</span>Indented</p>');
    expect(html("`a\tb`")).toBe("<p><code>a\tb</code></p>");
  });
});
