import { describe, expect, it } from "vitest";
import { handleMcp, type McpSource, type McpWriter } from "./server";

const source: McpSource = {
  siteUrl: "https://cvc.example",
  search: async (query) =>
    query === "stove"
      ? [
          {
            kind: "wiki",
            label: "Pages",
            results: [
              {
                title: "Pellet Stove",
                href: "/wiki/pellet-stove",
                meta: "Page · Land Care",
                snippet: "the stove",
              },
            ],
          },
        ]
      : [],
  circles: async () => [
    { id: "lcc", name: "Land Care Circle", description: "Mowing and more" },
    { id: "crew", name: "Safety Crew", description: null, parentId: "lcc" },
  ],
  pages: async () => [
    {
      id: "1",
      slug: "pellet-stove",
      title: "Pellet Stove",
      circleId: "lcc",
      updatedAt: "2026-09-01T12:00:00Z",
      excerpt: "The stove.",
    },
    {
      id: "2",
      slug: "agenda",
      title: "Agenda",
      circleId: "board",
      updatedAt: "2026-09-02T12:00:00Z",
      excerpt: "",
    },
  ],
  page: async (ref) =>
    ref === "pellet-stove" || ref.toLowerCase() === "pellet stove"
      ? {
          title: "Pellet Stove",
          slug: "pellet-stove",
          circleId: "lcc",
          updatedAt: "2026-09-01T12:00:00Z",
          updatedBy: "Cara",
          body: "The stove in the common house.",
        }
      : null,
  documents: async () => [
    {
      id: "d1",
      title: "Stove manual",
      circleId: "lcc",
      type: "Other",
      date: "2026-09-01",
      kind: "file",
      fileName: "manual.pdf",
      hasText: true,
    },
    {
      id: "d2",
      title: "Budget sheet",
      circleId: "board",
      type: "Link",
      date: "2026-09-03",
      kind: "link",
      url: "https://docs.example/x",
      hasText: false,
    },
  ],
  document: async (id) =>
    id === "d1"
      ? {
          title: "Stove manual",
          circleId: "lcc",
          text: "Clean the ash pan weekly.",
          url: "https://cvc.example/documents/d1",
        }
      : null,
};

const READ_TOOLS = [
  "search",
  "list_circles",
  "list_pages",
  "read_page",
  "list_documents",
  "read_document",
];
const WRITE_TOOLS = [
  "create_page",
  "update_page",
  "move_page",
  "delete_page",
  "list_document_types",
  "add_link",
  "add_file",
  "update_document",
  "delete_document",
];

/** A writer that notes what it was asked, and answers like the real one would. */
const calls: { tool: string; input: unknown }[] = [];
const note = (tool: string, input: unknown, said: string) => {
  calls.push({ tool, input });
  return { ok: true as const, said };
};
const writer: McpWriter = {
  createPage: async (input) =>
    input.circle === "board"
      ? { ok: false, message: "You can only start pages kept by your own circles" }
      : note("create_page", input, `Started “${input.title}”`),
  updatePage: async (input) =>
    input.baseUpdatedAt && input.baseUpdatedAt !== "2026-09-01T12:00:00Z"
      ? {
          conflict: {
            body: "The stove, as Dev left it.",
            updatedAt: "2026-09-01T12:00:00Z",
            updatedBy: "Dev",
          },
        }
      : note("update_page", input, `Saved “${input.page}”`),
  movePage: async (input) => note("move_page", input, "Moved"),
  deletePage: async (input) => note("delete_page", input, "In the trash"),
  documentTypes: async (circle) =>
    circle === "lcc"
      ? [
          { id: "minutes", label: "Minutes" },
          { id: "other", label: "Other" },
        ]
      : null,
  addLink: async (input) => note("add_link", input, "Added the link"),
  addFile: async (input) => note("add_file", input, "Added the file"),
  updateDocument: async (input) => note("update_document", input, "Changed"),
  deleteDocument: async (input) => note("delete_document", input, "Deleted"),
};
const writing: McpSource = { ...source, write: writer };

const callWith = (
  src: McpSource,
  name: string,
  args: Record<string, unknown> = {},
  id: number = 1
) =>
  handleMcp({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, src);
const call = (name: string, args: Record<string, unknown> = {}) => callWith(source, name, args);
const write = (name: string, args: Record<string, unknown> = {}) => callWith(writing, name, args);
const textOf = (reply: Awaited<ReturnType<typeof handleMcp>>) =>
  (reply?.result as { content: { text: string }[] }).content[0].text;
const isError = (reply: Awaited<ReturnType<typeof handleMcp>>) =>
  (reply?.result as { isError?: boolean }).isError === true;
const toolNames = async (src: McpSource) =>
  (
    (await handleMcp({ jsonrpc: "2.0", id: 3, method: "tools/list" }, src))?.result as {
      tools: { name: string }[];
    }
  ).tools.map((tool) => tool.name);

describe("the MCP server", () => {
  it("initializes, answers pings, and lists its read-only tools", async () => {
    const init = await handleMcp(
      { jsonrpc: "2.0", id: 0, method: "initialize", params: {} },
      source
    );
    expect(init?.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
    });
    expect((init?.result as { instructions: string }).instructions).toContain("Read-only");
    expect(
      await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, source)
    ).toBeNull();
    expect((await handleMcp({ jsonrpc: "2.0", id: 2, method: "ping" }, source))?.result).toEqual(
      {}
    );
    expect(await toolNames(source)).toEqual(READ_TOOLS);
    expect((await handleMcp({ jsonrpc: "2.0", id: 4, method: "nope" }, source))?.error?.code).toBe(
      -32601
    );
    expect((await handleMcp({ id: 5, method: "ping" }, source))?.error?.code).toBe(-32600);
  });

  it("searches, lists and reads pages and documents with links back to the site", async () => {
    expect(textOf(await call("search", { query: "stove" }))).toContain(
      "https://cvc.example/wiki/pellet-stove"
    );
    expect(textOf(await call("search", { query: "nothing" }))).toContain("Nothing at CVC matches");
    expect(textOf(await call("list_circles"))).toContain(
      "Safety Crew (id: crew) — sub group of lcc"
    );
    expect(textOf(await call("list_pages", { circle: "lcc" }))).not.toContain("Agenda");
    const page = textOf(await call("read_page", { page: "Pellet Stove" }));
    expect(page).toContain("The stove in the common house.");
    expect(page).toContain("Slug: pellet-stove");
    expect(page).toContain("updatedAt: 2026-09-01T12:00:00Z");
    const missing = await call("read_page", { page: "Nope" });
    expect(isError(missing)).toBe(true);
    expect(textOf(await call("list_documents"))).toContain("link: https://docs.example/x");
    expect(textOf(await call("read_document", { id: "d1" }))).toContain(
      "Clean the ash pan weekly."
    );
    expect(isError(await call("whatever"))).toBe(true);
  });

  it("keeps the write tools from a key that only reads", async () => {
    const refused = await call("create_page", { title: "Plan", body: "x" });
    expect(isError(refused)).toBe(true);
    expect(textOf(refused)).toContain("This key can only read");
    expect(await toolNames(source)).not.toContain("create_page");
  });

  it("offers the write tools to a key that can write, and runs them through the writer", async () => {
    calls.length = 0;
    const init = await handleMcp(
      { jsonrpc: "2.0", id: 0, method: "initialize", params: {} },
      writing
    );
    expect((init?.result as { instructions: string }).instructions).toContain("create_page");
    expect(await toolNames(writing)).toEqual([...READ_TOOLS, ...WRITE_TOOLS]);

    expect(textOf(await write("create_page", { title: "Plan", body: "x", circle: "lcc" }))).toBe(
      "Started “Plan”"
    );
    expect(calls[0]).toEqual({
      tool: "create_page",
      input: { title: "Plan", body: "x", circle: "lcc", parent: undefined, draft: false },
    });
    expect(
      textOf(await write("create_page", { title: "Sub", parent: "Pellet Stove", draft: true }))
    ).toBe("Started “Sub”");
    expect(calls.at(-1)?.input).toMatchObject({ parent: "Pellet Stove", draft: true });
    expect(isError(await write("create_page", { body: "x" }))).toBe(true);
    const refused = await write("create_page", { title: "Plan", circle: "board" });
    expect(isError(refused)).toBe(true);
    expect(textOf(refused)).toContain("your own circles");

    expect(isError(await write("update_page", { page: "pellet-stove" }))).toBe(true);
    expect(
      textOf(
        await write("update_page", {
          page: "pellet-stove",
          body: "New text",
          baseUpdatedAt: "2026-09-01T12:00:00Z",
        })
      )
    ).toBe("Saved “pellet-stove”");
    const conflict = await write("update_page", {
      page: "pellet-stove",
      body: "New text",
      baseUpdatedAt: "2020-01-01T00:00:00Z",
    });
    expect(isError(conflict)).toBe(true);
    expect(textOf(conflict)).toContain("Dev saved this page since you read it");
    expect(textOf(conflict)).toContain("The stove, as Dev left it.");
    expect(textOf(conflict)).toContain('baseUpdatedAt "2026-09-01T12:00:00Z"');

    expect(isError(await write("move_page", { page: "pellet-stove" }))).toBe(true);
    expect(textOf(await write("move_page", { page: "pellet-stove", parent: "top" }))).toBe("Moved");
    expect(calls.at(-1)?.input).toEqual({ page: "pellet-stove", circle: undefined, parent: "top" });
    expect(textOf(await write("move_page", { page: "pellet-stove", circle: "crew" }))).toBe(
      "Moved"
    );
    expect(textOf(await write("delete_page", { page: "pellet-stove" }))).toBe("In the trash");

    expect(textOf(await write("list_document_types", { circle: "lcc" }))).toContain(
      "- Minutes (id: minutes)"
    );
    expect(isError(await write("list_document_types", { circle: "nope" }))).toBe(true);
    expect(
      textOf(
        await write("add_link", {
          circle: "lcc",
          url: "https://example.com",
          title: "Site",
          meetingDate: "",
        })
      )
    ).toBe("Added the link");
    expect(calls.at(-1)?.input).toEqual({
      circle: "lcc",
      url: "https://example.com",
      title: "Site",
      type: undefined,
      description: undefined,
      meetingDate: undefined,
    });
    expect(isError(await write("add_file", { fileName: "a.pdf" }))).toBe(true);
    expect(
      textOf(
        await write("add_file", { fileName: "a.pdf", contentBase64: "JVBERi0=", replaces: "d1" })
      )
    ).toBe("Added the file");
    expect(isError(await write("update_document", { id: "d1" }))).toBe(true);
    expect(textOf(await write("update_document", { id: "d1", description: "" }))).toBe("Changed");
    expect(calls.at(-1)?.input).toMatchObject({ id: "d1", description: "" });
    expect(textOf(await write("delete_document", { id: "d1" }))).toBe("Deleted");
    expect(isError(await write("delete_document", {}))).toBe(true);
  });
});
