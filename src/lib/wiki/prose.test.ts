import { describe, expect, it } from "vitest";
import {
  markdownToProse,
  proseToMarkdown,
  rawMarkdown,
  rewriteMarkdown,
  type ProseNode,
} from "./prose";

const roundTrip = (markdown: string) => proseToMarkdown(markdownToProse(markdown));

/** Every kind of thing a page holds, each the way the editor writes it. */
const SAMPLES: Record<string, string> = {
  headings: "# Mowing\n\n## The east field\n\n### Edges\n\n#### Small print\n",
  emphasis:
    "Mow **twice** a month, *gently*, ~~never~~ in `rain`.\n\n***Both*** and **bold *then italic***.\n\n*Italic **then bold***.\n",
  links:
    'See [the plan](https://example.org/plan "The plan") and <https://example.org>.\n\n[**A bold link**](https://example.org/b)\n',
  wikiLinks:
    "See [[Maintenance log]], [[doc:Stove manual]], [[O&M:Water]], [[doc:O&M:Pump manual|the manual]] and [[Pellet Stove|the stove]].\n\n**[[Bold page]]** and *[[Italic page]]*.\n",
  lists:
    "* One\n* Two\n  * Nested\n* Three\n\n1. First\n2. Second\n\nBetween.\n\n3. Starts at three\n4. Four\n",
  loose: "* Spread out\n\n* Items\n\n  With a second paragraph\n",
  checklist: "* [ ] Rake leaves\n* [x] Mow\n* [ ] Fix the gate\n",
  quote: "> A quote\n> over lines\n>\n> > Nested\n",
  code: "```js\nconst a = 1;\n```\n\n```\nplain\n```\n\nIndented use of `code` inline.\n",
  rule: "Above\n\n***\n\nBelow\n",
  table:
    "| Task | Who | When |\n| :--- | :-: | ---: |\n| Mow | **Ada** | [[Mowing]] |\n| Rake | Ben | Oct |\n",
  tableWidths:
    '::columns{widths="25,75"}\n\n| Task | Notes |\n| - | - |\n| Mow | The east field |\n',
  image: '![The barn](/api/wiki/images/x.jpg "Barn") and words after.\n',
  breaks: "Line one\\\nline two\n",
  highlight:
    'Some :mark[highlighted words]{color="green"} and :mark[**bold** in a highlight]{color="pink"}.\n',
  callout: ":::callout\nBring gloves.\n\n* And water\n:::\n",
  blocks:
    '::poll{#abc123}\n\n::proposal{#def456}\n\n::embed{page="Pellet Stove" section="Winter care"}\n\n::embed{page="Mowing"}\n',
  html: "<div>Some HTML</div>\n\nInline <b>tags</b> too.\n",
  footnotes: "A claim.[^1]\n\n[^1]: The source.\n",
  references: "See [the plan][plan].\n\n[plan]: https://example.org/plan\n",
  textDirective: "Contact:Lynn about it. Meet at 10:30.\n",
  mentions: "Ask :person[Ada Ash]{#000000000001} or **:person[Ben Birch]{#000000000002}**.\n",
  otherDirectives: '::video{src="x"}\n\n:::aside\nInside\n:::\n',
  escapes: "Not \\*emphasis\\*, a \\[bracket], 2 \\* 3, a\\_b.\n",
  empty: "",
  nested:
    "> * A list in a quote\n>   with **bold**\n\n:::callout\n> A quote in a callout\n:::\n\n* Item\n\n  ```\n  code in an item\n  ```\n",
};

describe("Markdown → document → Markdown", () => {
  for (const [name, markdown] of Object.entries(SAMPLES)) {
    it(`gives back what the Markdown writer alone makes: ${name}`, () => {
      expect(roundTrip(markdown)).toBe(rewriteMarkdown(markdown));
    });
  }

  it("keeps the old editor's spelling as it was", () => {
    for (const name of ["headings", "lists", "checklist", "callout", "blocks"])
      expect(roundTrip(SAMPLES[name])).toBe(SAMPLES[name]);
  });

  it("is stable: a second trip changes nothing", () => {
    for (const markdown of Object.values(SAMPLES)) {
      const once = roundTrip(markdown);
      expect(roundTrip(once)).toBe(once);
    }
  });

  it("writes ids the short way, as the old editor did (and pages are read either way)", () => {
    expect(roundTrip('::poll{id="abc123"}\n')).toBe("::poll{#abc123}\n");
  });

  it("keeps links with circles and labels as written", () => {
    expect(roundTrip(SAMPLES.wikiLinks)).toContain("[[O&M:Water]]");
    expect(roundTrip(SAMPLES.wikiLinks)).toContain("[[doc:O&M:Pump manual|the manual]]");
  });
});

describe("the document", () => {
  const doc = (markdown: string) => markdownToProse(markdown).content ?? [];
  const types = (nodes: ProseNode[] | undefined): string[] =>
    (nodes ?? []).flatMap((node) => [node.type, ...types(node.content)]);

  it("opens a collapsible section from before as its title in bold, then what it held", () => {
    for (const markdown of [
      ':::details{title="Winter care"}\nEmpty the ash pan.\n:::\n',
      ":::details[Winter care]\nEmpty the ash pan.\n:::\n",
    ])
      expect(roundTrip(markdown)).toBe("**Winter care**\n\nEmpty the ash pan.\n");
    expect(roundTrip(":::details\nJust this.\n:::\n")).toBe("Just this.\n");
  });

  it("has the editor's own blocks for callouts, polls, proposals and embeds", () => {
    expect(types(doc(SAMPLES.callout))).toContain("callout");
    expect(doc(SAMPLES.blocks).map((node) => node.type)).toEqual([
      "poll",
      "proposal",
      "embed",
      "embed",
    ]);
    expect(doc(SAMPLES.blocks)[2].attrs).toMatchObject({
      page: "Pellet Stove",
      section: "Winter care",
    });
  });

  it("makes links tags, keeping the bold around them", () => {
    const [, bold] = doc(SAMPLES.wikiLinks);
    const tag = bold.content?.find((node) => node.type === "wikiLink");
    expect(tag).toMatchObject({
      attrs: { target: "Bold page", label: null },
      marks: [{ type: "bold" }],
    });
    const [first] = doc(SAMPLES.wikiLinks);
    expect(first.content?.find((node) => node.attrs?.label === "the manual")?.attrs?.target).toBe(
      "doc:O&M:Pump manual"
    );
  });

  it("marks highlighted words with their colour", () => {
    const words = doc(SAMPLES.highlight)[0].content ?? [];
    expect(words.find((node) => node.text === "highlighted words")?.marks).toEqual([
      { type: "highlight", attrs: { color: "green" } },
    ]);
    expect(words.find((node) => node.text === "bold")?.marks).toEqual([
      { type: "highlight", attrs: { color: "pink" } },
      { type: "bold" },
    ]);
  });

  it("makes mentions their own nodes, with the person's id and name", () => {
    const words = doc(SAMPLES.mentions)[0].content ?? [];
    expect(words.find((node) => node.type === "personMention")?.attrs).toEqual({
      id: "000000000001",
      name: "Ada Ash",
    });
    expect(words.filter((node) => node.type === "personMention")[1].marks).toEqual([
      { type: "bold" },
    ]);
  });

  it("makes checklists task lists", () => {
    const [list] = doc(SAMPLES.checklist);
    expect(list.type).toBe("taskList");
    expect(list.content?.map((item) => item.attrs?.checked)).toEqual([false, true, false]);
  });

  it("carries what it doesn't know through as it was", () => {
    expect(types(doc(SAMPLES.html))).toContain("rawBlock");
    expect(types(doc(SAMPLES.footnotes))).toContain("rawBlock");
    expect(types(doc(SAMPLES.textDirective))).toContain("rawInline");
    const raw = doc(SAMPLES.otherDirectives)[0];
    expect(rawMarkdown(raw.attrs?.mdast)).toBe('::video{src="x"}');
  });

  it("starts empty pages with a paragraph", () => {
    expect(markdownToProse("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("writes new things the same way", () => {
    const made: ProseNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Mow ", marks: [{ type: "italic" }] },
            { type: "text", text: "now", marks: [{ type: "italic" }, { type: "bold" }] },
            { type: "text", text: " " },
            { type: "wikiLink", attrs: { target: "Mowing", label: null } },
            { type: "text", text: " ok", marks: [{ type: "highlight", attrs: { color: "blue" } }] },
          ],
        },
        {
          type: "callout",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
        },
      ],
    };
    expect(proseToMarkdown(made)).toBe(
      '*Mow **now*** [[Mowing]] :mark[ok]{color="blue"}\n\n:::callout\nHi\n:::\n'
    );
  });
});
