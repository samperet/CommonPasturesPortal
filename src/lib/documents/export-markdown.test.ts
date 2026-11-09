import { describe, expect, it } from "vitest";
import type { Proposal } from "@/lib/proposals/shared";
import {
  withoutTitle,
  NameBook,
  convertBody,
  linkMarkdown,
  pageMarkdown,
  proposalMarkdown,
  readmeMarkdown,
  relativeLink,
  safeName,
  type ExportContext,
  type ExportPage,
} from "./export-markdown";

const SITE = "https://cvc.example";
const MOWING = "11111111-1111-4111-8111-111111111111";
const LOG = "22222222-2222-4222-8222-222222222222";
const SECRET = "33333333-3333-4333-8333-333333333333";
const MANUAL = "44444444-4444-4444-8444-444444444444";
const PROPOSAL = "55555555-5555-4555-8555-555555555555";
const POLL = "66666666-6666-4666-8666-666666666666";
const PHOTO = "77777777-7777-4777-8777-777777777777";

const page = (overrides: Partial<ExportPage>): ExportPage => ({
  id: MOWING,
  slug: "mowing",
  title: "Mowing",
  keeper: "lcc",
  body: "",
  createdAt: "2026-09-03T12:00:00.000Z",
  updatedAt: "2026-10-08T15:00:00.000Z",
  updatedBy: { name: "Cara Cedar" },
  ...overrides,
});

const pages = [
  page({ body: "Mow the east field.\n\n## Tools\n\nThe big mower.\n\n## After\n\nRake." }),
  page({
    id: LOG,
    slug: "maintenance-log",
    title: "Maintenance log",
    body: '**Sep 12**: cleaned.\n\n::embed{page="Mowing"}',
  }),
];

const proposal: Proposal = {
  id: PROPOSAL,
  circleId: "lcc",
  title: "Adopt the mowing plan",
  body: "We mow monthly. See [[Mowing]].",
  documents: [{ kind: "page", id: MOWING }],
  snapshots: [
    {
      kind: "page",
      id: MOWING,
      snapshotId: "88888888-8888-4888-8888-888888888888",
      version: "2026-10-01T12:00:00.000Z",
      title: "Mowing",
      takenAt: "2026-10-01T12:00:00.000Z",
      takenBy: { userId: "u", personId: null, name: "Cara Cedar" },
    },
  ],
  decideOn: null,
  status: "consented",
  proposedBy: { userId: "u", personId: null, name: "Cara Cedar" },
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedBy: { userId: "u", personId: null, name: "Cara Cedar" },
  updatedAt: "2026-10-08T20:00:00.000Z",
  consent: {
    meeting: {
      kind: "page",
      id: "99999999-9999-4999-8999-999999999999",
      title: "Land Care meeting, Oct 8",
      date: "2026-10-08",
      circleId: "lcc",
      href: "/wiki/land-care-meeting",
    },
    circleId: "lcc",
    present: [
      { personId: "000000000003", name: "Cara Cedar", member: true },
      { name: "Sam", member: false },
    ],
    note: "With thanks to the mowers.",
    submittedBy: { userId: "u", personId: null, name: "Dev Dogwood" },
    submittedAt: "2026-10-08T20:00:00.000Z",
    documents: [{ kind: "page", id: MOWING, version: "2026-10-01T12:00:00.000Z" }],
  },
  withdrawn: null,
};

/** Mowing and the stove manual are in the export; the log isn't. */
const ctx = (paths: Record<string, string> = {}): ExportContext => ({
  siteUrl: SITE,
  circles: [
    { id: "lcc", name: "Land Care Circle" },
    { id: "board", name: "Board" },
  ],
  pages,
  documents: [
    { id: MANUAL, title: "Stove manual", circleId: "lcc" },
    { id: SECRET, title: "Stove manual", circleId: "board" },
  ],
  proposals: new Map([[PROPOSAL, proposal]]),
  polls: new Map([
    [
      POLL,
      {
        question: "Which day?",
        details: null,
        poll: {
          options: [
            { id: "a", text: "Saturday" },
            { id: "b", text: "Sunday" },
          ],
          multiple: false,
          votes: [
            { userId: "1", name: "Ada", optionIds: ["a"] },
            { userId: "2", name: "Ben", optionIds: ["a"] },
            { userId: "3", name: "Cara", optionIds: ["b"] },
          ],
        },
      },
    ],
  ]),
  pathOf: (kind, id) => {
    const known: Record<string, string> = {
      [`page:${MOWING}`]: "Land Care Circle/Mowing.md",
      [`file:${MANUAL}`]: "Land Care Circle/Stove manual.pdf",
      ...paths,
    };
    return known[`${kind}:${id}`] ?? null;
  },
  imagePath: (circleId, imageId) => (imageId === PHOTO ? `images/${imageId}.jpg` : null),
});

const from = { path: "Land Care Circle/Notes.md", circleId: "lcc" };

describe("names in the export", () => {
  it("are safe everywhere, and never the same twice", () => {
    expect(safeName('Plan: "A/B" test?')).toBe("Plan- -A-B- test-");
    expect(safeName("  ..hidden. ")).toBe("hidden");
    expect(safeName("CON")).toBe("CON-");
    expect(safeName("")).toBe("Untitled");
    const book = new NameBook();
    expect(book.claim("Land Care Circle", "Minutes", ".pdf")).toBe("Land Care Circle/Minutes.pdf");
    expect(book.claim("Land Care Circle", "minutes", ".pdf")).toBe(
      "Land Care Circle/minutes (2).pdf"
    );
    expect(book.claim("Board", "Minutes", ".pdf")).toBe("Board/Minutes.pdf");
  });
  it("link to each other relatively", () => {
    expect(relativeLink("Land Care Circle/Mowing.md", "Land Care Circle/Log.md")).toBe("Log.md");
    expect(relativeLink("Land Care Circle/Mowing.md", "images/a.jpg")).toBe("../images/a.jpg");
    expect(relativeLink("README.md", "Land Care Circle/Plan (draft).md")).toBe(
      "Land%20Care%20Circle/Plan%20%28draft%29.md"
    );
    expect(relativeLink("Land Care Circle/Proposals/Adopt.md", "Land Care Circle/Mowing.md")).toBe(
      "../Mowing.md"
    );
  });
});

describe("a page's own syntax, made plain Markdown", () => {
  it("links to pages and files in the export, else to the app, else just the words", () => {
    const out = convertBody(
      "See [[Mowing]], [[Maintenance log|the log]], [[Nowhere]], [[doc:Stove manual]] and [[doc:Board:Stove manual]].",
      from,
      ctx()
    );
    expect(out).toBe(
      `See [Mowing](Mowing.md), [the log](${SITE}/wiki/maintenance-log), Nowhere, [Stove manual](Stove%20manual.pdf) and [Stove manual](${SITE}/api/documents/${SECRET}/file).`
    );
  });

  it("doesn't repeat a page's title when its text starts with it", () => {
    expect(withoutTitle("# Pond rules\n\nNo swimming.", "Pond rules")).toBe("\nNo swimming.");
    expect(withoutTitle("  # pond RULES #\nNo swimming.", "Pond rules")).toBe("No swimming.");
    expect(withoutTitle("# Boats\n\nCanoes.", "Pond rules")).toBe("# Boats\n\nCanoes.");
    expect(withoutTitle("## Pond rules\n", "Pond rules")).toBe("## Pond rules\n");
  });

  it("turns highlights, old collapsible sections and callouts into Markdown, as the app shows them", () => {
    const out = convertBody(
      [
        'Note :mark[this bit]{color="yellow"} well.',
        ':::details{title="Winter <care>"}',
        "Empty the ash pan.",
        ":::",
        ":::callout",
        "Ask [[Mowing]] first.",
        "",
        ":::details[More]",
        "Inside.",
        ":::",
        ":::",
        "After.",
      ].join("\n"),
      from,
      ctx()
    );
    expect(out).toBe(
      [
        "Note <mark>this bit</mark> well.",
        "**Winter \\<care>**",
        "",
        "Empty the ash pan.",
        "",
        "> Ask [Mowing](Mowing.md) first.",
        ">",
        "> **More**",
        ">",
        "> Inside.",
        ">",
        "",
        "After.",
      ].join("\n")
    );
  });

  it("leaves code as it is", () => {
    const out = convertBody(
      "Write `[[Mowing]]` for a link:\n\n```\n[[Mowing]]\n:::callout\n```",
      from,
      ctx()
    );
    expect(out).toBe("Write `[[Mowing]]` for a link:\n\n```\n[[Mowing]]\n:::callout\n```");
  });

  it("shows a poll's votes, and a proposal quoted with where it stands", () => {
    const out = convertBody(`::poll{id="${POLL}"}\n\n::proposal{#${PROPOSAL}}`, from, ctx());
    expect(out).toContain("**Poll: Which day?**\n\n- Saturday — 2 votes\n- Sunday — 1 vote");
    expect(out).toContain(
      `> **Proposal to Land Care Circle: [Adopt the mowing plan](${SITE}/proposals/${PROPOSAL})** — Consented Oct 8, 2026 at Land Care meeting, Oct 8`
    );
    expect(out).toContain("> We mow monthly. See [Mowing](Mowing.md).");
    expect(convertBody(`::poll{id="${SECRET}"}`, from, ctx())).toBe(
      "*(A poll that's no longer there.)*"
    );
  });

  it("quotes an embedded page or section, with a link — and its own embeds as links only", () => {
    const out = convertBody('::embed{page="Land Care Circle:Mowing" section="Tools"}', from, ctx());
    expect(out).toBe("> *From [Mowing › Tools](Mowing.md):*\n>\n> ## Tools\n>\n> The big mower.");
    const nested = convertBody('::embed{page="Maintenance log"}', from, ctx());
    expect(nested).toBe(
      `> *From [Maintenance log](${SITE}/wiki/maintenance-log):*\n>\n> **Sep 12**: cleaned.\n>\n> *From [Mowing](Mowing.md):*`
    );
    expect(convertBody('::embed{page="Secret plans"}', from, ctx())).toBe(
      "*(A page shown here that's gone.)*"
    );
  });

  it("brings photos along, and makes links into the app full addresses", () => {
    const out = convertBody(
      `![The field](/api/circles/lcc/wiki/images/${PHOTO}) ![Gone](/api/circles/lcc/wiki/images/${SECRET}) [The calendar](/calendar)`,
      from,
      ctx()
    );
    expect(out).toBe(
      `![The field](../images/${PHOTO}.jpg) ![Gone](${SITE}/api/circles/lcc/wiki/images/${SECRET}) [The calendar](${SITE}/calendar)`
    );
  });
});

describe("files in the export", () => {
  it("a page: its details, title, meeting and who was there, text, and transcript", () => {
    const out = pageMarkdown(
      page({
        title: "Land Care meeting",
        slug: "land-care-meeting",
        body: "We met.",
        meetingDate: "2026-10-08",
        present: [{ personId: "000000000003", name: "Cara Cedar" }, { name: "Sam" }],
        transcript: "Cara: hello.",
      }),
      "Land Care Circle/Land Care meeting.md",
      ctx()
    );
    expect(out).toBe(
      [
        "---",
        'title: "Land Care meeting"',
        'circle: "Land Care Circle"',
        'stage: "draft"',
        'meeting: "2026-10-08"',
        'present: ["Cara Cedar", "Sam"]',
        'created: "2026-09-03"',
        'updated: "2026-10-08"',
        'updated_by: "Cara Cedar"',
        `source: "${SITE}/wiki/land-care-meeting"`,
        "---",
        "",
        "# Land Care meeting",
        "",
        "*Meeting, Oct 8, 2026 · Present: Cara Cedar and Sam (guest)*",
        "",
        "We met.",
        "",
        "<details>",
        "<summary>Transcript</summary>",
        "",
        "Cara: hello.",
        "",
        "</details>",
        "",
      ].join("\n")
    );
  });

  it("a proposal: where it stands, its documents (and snapshots), and its consent", () => {
    const out = proposalMarkdown(
      proposal,
      "Land Care Circle/Proposals/Adopt the mowing plan.md",
      ctx(),
      (ref) => (ref.id === MOWING ? { title: "Mowing", appPath: "/wiki/mowing" } : null)
    );
    expect(out).toContain('status: "consented"');
    expect(out).toContain("# Adopt the mowing plan");
    expect(out).toContain(
      "*Proposal to Land Care Circle, by Cara Cedar, Oct 1, 2026 · Consented Oct 8, 2026 at Land Care meeting, Oct 8*"
    );
    expect(out).toContain("We mow monthly. See [Mowing](../Mowing.md).");
    expect(out).toContain(
      `- [Mowing](../Mowing.md) — as consented: [its snapshot from Oct 1, 2026](${SITE}/proposals/${PROPOSAL}/snapshots/88888888-8888-4888-8888-888888888888)`
    );
    expect(out).toContain(
      `Land Care Circle consented on Oct 8, 2026, at [Land Care meeting, Oct 8](${SITE}/wiki/land-care-meeting).`
    );
    expect(out).toContain("Present: Cara Cedar · also there: Sam (guest).");
    expect(out).toContain("Recorded by Dev Dogwood.");
    expect(out).toContain("> With thanks to the mowers.");
  });

  it("a link: where it goes, and its text fenced off", () => {
    const out = linkMarkdown(
      {
        title: "Mowing rota",
        circleId: "lcc",
        description: "Who mows when.",
        typeLabel: "Other",
        url: "https://docs.google.com/document/d/abc/edit",
        kindLabel: "Google Doc",
        addedAt: "2026-10-01T12:00:00.000Z",
        addedBy: "Cara Cedar",
      },
      "Week 1: Ada\n```\nWeek 2: Ben",
      ctx()
    );
    expect(out).toContain("A link to a Google Doc: <https://docs.google.com/document/d/abc/edit>");
    expect(out).toContain("Who mows when.");
    expect(out).toContain("````text\nWeek 1: Ada\n```\nWeek 2: Ben\n````");
  });

  it("the README: everything by circle, linked, and what's missing", () => {
    const out = readmeMarkdown({
      heading: "CVC documents 2026-10-10",
      exportedBy: "Cara Cedar",
      exportedAt: "2026-10-10T15:00:00.000Z",
      siteUrl: SITE,
      items: [
        {
          path: "Land Care Circle/Mowing.md",
          title: "Mowing",
          circle: "Land Care Circle",
          detail: "Page",
        },
        {
          path: "Board/Budget.pdf",
          title: "Budget",
          circle: "Board",
          detail: "Budget · PDF",
          description: "For 2027.",
        },
      ],
      missing: ["Stove manual (Land Care Circle): its file couldn't be found"],
    });
    expect(out).toContain("on Oct 10, 2026 by Cara Cedar: 2 documents.");
    expect(out.indexOf("## Board")).toBeLessThan(out.indexOf("## Land Care Circle"));
    expect(out).toContain("- [Budget](Board/Budget.pdf) — Budget · PDF\n  For 2027.");
    expect(out).toContain("- [Mowing](Land%20Care%20Circle/Mowing.md) — Page");
    expect(out).toContain(
      "## Not included\n\n- Stove manual (Land Care Circle): its file couldn't be found"
    );
  });
});
