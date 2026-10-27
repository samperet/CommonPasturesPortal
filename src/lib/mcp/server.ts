/**
 * An MCP server (Model Context Protocol, over plain HTTP) so an AI
 * assistant a resident uses can work with CVC's documents: the JSON-RPC
 * methods the protocol needs (`initialize`, `ping`, `tools/list`,
 * `tools/call`), read-only tools — search the site, list the circles, list
 * and read pages (as Markdown) and documents (their extracted text) — and,
 * for a key that can write (`store.ts`), tools that start, change, move and
 * delete pages and add, change and delete documents, all as the resident
 * whose key it is and only where they may (`writes.ts` enforces the app's
 * own rules). Pure: `handleMcp` takes a `Source` that reads the data (and
 * carries a `write`r when the key can write), so it can be tested without
 * storage; the route (`api/mcp`) wires the real ones.
 */

export const PROTOCOL_VERSION = "2025-06-18";

/** How a write ended: what to tell the assistant, or why it couldn't be done (in the app's own words). */
export type Done = { ok: true; said: string } | { ok: false; message: string };

/** What a key that can write may do; each checks the resident's rights first. */
export interface McpWriter {
  createPage: (input: {
    title: string;
    body: string;
    circle?: string;
    /** The page (slug or title) to start it inside; its circle keeps the new page. */
    parent?: string;
    /** Only its author and admins see it until it's published in CVC. */
    draft?: boolean;
  }) => Promise<Done>;
  /** A conflict (someone saved since `baseUpdatedAt`) hands back the page as it is now. */
  updatePage: (input: {
    page: string;
    title?: string;
    body?: string;
    baseUpdatedAt?: string;
  }) => Promise<Done | { conflict: { body: string; updatedAt: string; updatedBy: string } }>;
  /** To another circle (`circle`), inside another page (`parent`; "top": the circle's top level), or both. */
  movePage: (input: { page: string; circle?: string; parent?: string }) => Promise<Done>;
  deletePage: (input: { page: string }) => Promise<Done>;
  /** A circle's document types (null: no such circle). */
  documentTypes: (circle: string) => Promise<{ id: string; label: string }[] | null>;
  addLink: (input: {
    circle: string;
    url: string;
    title: string;
    type?: string;
    description?: string;
    meetingDate?: string;
  }) => Promise<Done>;
  addFile: (input: {
    circle?: string;
    fileName: string;
    contentBase64: string;
    title?: string;
    type?: string;
    description?: string;
    meetingDate?: string;
    replaces?: string;
  }) => Promise<Done>;
  updateDocument: (input: {
    id: string;
    title?: string;
    description?: string;
    type?: string;
    meetingDate?: string;
  }) => Promise<Done>;
  deleteDocument: (input: { id: string }) => Promise<Done>;
}

export interface McpSource {
  siteUrl: string;
  search: (query: string) => Promise<
    {
      kind: string;
      label: string;
      results: { title: string; href: string; meta: string | null; snippet: string | null }[];
    }[]
  >;
  circles: () => Promise<
    { id: string; name: string; description: string | null; parentId?: string }[]
  >;
  pages: () => Promise<
    {
      id: string;
      slug: string;
      title: string;
      circleId: string;
      updatedAt: string;
      excerpt: string;
    }[]
  >;
  page: (ref: string) => Promise<{
    title: string;
    slug: string;
    circleId: string;
    updatedAt: string;
    updatedBy: string;
    body: string;
  } | null>;
  documents: () => Promise<
    {
      id: string;
      title: string;
      circleId: string;
      type: string;
      date: string;
      kind: "file" | "link";
      fileName?: string;
      url?: string;
      hasText: boolean;
    }[]
  >;
  document: (
    id: string
  ) => Promise<{ title: string; circleId: string; text: string; url: string } | null>;
  /** Only with a key that can write. */
  write?: McpWriter;
}

type Json = Record<string, unknown>;
export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Json;
}
type Reply = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

const TOOLS = [
  {
    name: "search",
    description:
      "Search everything at CVC (Common Pastures): pages, documents, people, circles, the forum, tasks, resources, the loan library. Every word must match; results are grouped by kind with links.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Words to look for" } },
      required: ["query"],
    },
  },
  {
    name: "list_circles",
    description: "CVC's circles (working groups) and sub groups, with their ids and descriptions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_pages",
    description:
      "Written pages (the wiki): title, slug, the circle that keeps it, when it was last edited, and its opening lines. Optionally one circle's.",
    inputSchema: {
      type: "object",
      properties: {
        circle: { type: "string", description: "A circle's id, to list only its pages" },
      },
    },
  },
  {
    name: "read_page",
    description:
      "A page's full text as Markdown, by its slug or exact title — with its slug and updatedAt (pass that as baseUpdatedAt to update_page).",
    inputSchema: {
      type: "object",
      properties: { page: { type: "string", description: "The page's slug or title" } },
      required: ["page"],
    },
  },
  {
    name: "list_documents",
    description:
      "Uploaded documents (files and links): id, title, circle, type, date, and whether its text can be read. Optionally one circle's.",
    inputSchema: {
      type: "object",
      properties: {
        circle: { type: "string", description: "A circle's id, to list only its documents" },
      },
    },
  },
  {
    name: "read_document",
    description: "The text found in an uploaded document (its current version), by its id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The document's id, from list_documents" } },
      required: ["id"],
    },
  },
];

const circleProperty = (what: string) => ({
  type: "string",
  description: `The id of the circle ${what} (from list_circles)`,
});
const pageProperty = { type: "string", description: "The page's slug or exact title" };
const documentDetails = {
  type: {
    type: "string",
    description:
      "One of the circle's document types (list_document_types): its id or name. Left out: the circle's first type.",
  },
  description: { type: "string", description: "A line or two about it (optional)" },
  meetingDate: {
    type: "string",
    description: "If it's a meeting's: the day, as YYYY-MM-DD (optional)",
  },
};

/** The tools a key that can write gets as well. */
const WRITE_TOOLS = [
  {
    name: "create_page",
    description:
      "Start a written page, kept by a circle you're in (left out: Community, which is everyone). The body is Markdown; [[Page title]] links to another page. You follow the page from the start.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Its title (unique at CVC)" },
        body: { type: "string", description: "Its text, as Markdown" },
        circle: circleProperty("that keeps it"),
        parent: {
          type: "string",
          description:
            "The page (slug or exact title) to start it inside; that page's circle keeps the new one",
        },
        draft: {
          type: "boolean",
          description:
            "Start it as a draft: only the key's owner and admins see it until it's published in CVC",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_page",
    description:
      "Save a new version of a page: its text, its title, or both. Call read_page first and pass its updatedAt as baseUpdatedAt, so you can't undo an edit someone made meanwhile — if they did, you get the page as it is now to merge into. The body replaces the whole page, so send all of it.",
    inputSchema: {
      type: "object",
      properties: {
        page: pageProperty,
        body: { type: "string", description: "The whole page, as Markdown" },
        title: { type: "string", description: "A new title" },
        baseUpdatedAt: {
          type: "string",
          description: "The page's updatedAt as read_page gave it",
        },
      },
      required: ["page"],
    },
  },
  {
    name: "move_page",
    description:
      "Give a page to another circle (its keeper), or put it inside another page of its circle (or back at the circle's top level). Only those who keep the page may, and only to a circle they're in.",
    inputSchema: {
      type: "object",
      properties: {
        page: pageProperty,
        circle: circleProperty("to keep it from now on"),
        parent: {
          type: "string",
          description:
            'The page (slug or exact title) to put it inside, or "top" for the circle\'s top level',
        },
      },
      required: ["page"],
    },
  },
  {
    name: "delete_page",
    description:
      "Put a page in the trash, where it stays for 30 days and can be restored (only those who keep the page may).",
    inputSchema: { type: "object", properties: { page: pageProperty }, required: ["page"] },
  },
  {
    name: "list_document_types",
    description:
      "A circle's document types (each circle names its own), for add_link, add_file and update_document.",
    inputSchema: {
      type: "object",
      properties: { circle: circleProperty("whose types to list") },
      required: ["circle"],
    },
  },
  {
    name: "add_link",
    description:
      "Add a link — a Google Doc, Sheet, Slides deck or Form, a Drive file, or any web page — to a circle's documents. A shared Google file's text is read so search finds it.",
    inputSchema: {
      type: "object",
      properties: {
        circle: circleProperty("it belongs to"),
        url: { type: "string", description: "The link" },
        title: { type: "string", description: "What to call it" },
        ...documentDetails,
      },
      required: ["circle", "url", "title"],
    },
  },
  {
    name: "add_file",
    description:
      "Upload a file (PDF, Word, Excel, PowerPoint, text, CSV, Markdown or an image, up to 3 MB; bigger ones go through the app) as a new document of a circle — or, with replaces, as a new version of an existing document.",
    inputSchema: {
      type: "object",
      properties: {
        fileName: { type: "string", description: "Its name, with the extension (minutes.pdf)" },
        contentBase64: { type: "string", description: "The file's bytes, base64 encoded" },
        circle: circleProperty("it belongs to (not with replaces)"),
        title: { type: "string", description: "What to call it (not with replaces)" },
        ...documentDetails,
        replaces: {
          type: "string",
          description: "The id of the document this is a new version of",
        },
      },
      required: ["fileName", "contentBase64"],
    },
  },
  {
    name: "update_document",
    description:
      "Change a document's title, description, type or meeting date (an empty description or meetingDate clears it). Its circle's members, the Board, admins, and whoever added it may.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The document's id, from list_documents" },
        title: { type: "string", description: "A new title" },
        ...documentDetails,
      },
      required: ["id"],
    },
  },
  {
    name: "delete_document",
    description:
      "Delete a document and every version of its file. There is no trash for documents: this can't be undone.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The document's id, from list_documents" } },
      required: ["id"],
    },
  },
];
const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((tool) => tool.name));

const READ_ONLY =
  "This key can only read. On CVC's AI assistants page, make a key that can also write, and use that.";

const text = (value: string) => ({ content: [{ type: "text", text: value }] });
const failed = (message: string) => ({ content: [{ type: "text", text: message }], isError: true });
const str = (params: Json | undefined, key: string) =>
  typeof params?.[key] === "string" ? (params[key] as string).trim() : "";
/** An optional string argument: undefined when it wasn't given. */
const opt = (params: Json | undefined, key: string) =>
  typeof params?.[key] === "string" ? (params[key] as string) : undefined;
const done = (outcome: Done) => (outcome.ok ? text(outcome.said) : failed(outcome.message));

/** Run one of the write tools. */
async function callWriteTool(write: McpWriter, name: string, args: Json | undefined) {
  switch (name) {
    case "create_page": {
      const title = str(args, "title");
      if (!title) return failed("Give the page a title");
      return done(
        await write.createPage({
          title,
          body: opt(args, "body") ?? "",
          circle: str(args, "circle") || undefined,
          parent: str(args, "parent") || undefined,
          draft: args?.draft === true,
        })
      );
    }
    case "update_page": {
      const page = str(args, "page");
      if (!page) return failed("Say which page: its slug or title");
      const title = opt(args, "title");
      const body = opt(args, "body");
      if (title === undefined && body === undefined)
        return failed("Give the page's new body, a new title, or both");
      const outcome = await write.updatePage({
        page,
        title,
        body,
        baseUpdatedAt: str(args, "baseUpdatedAt") || undefined,
      });
      if ("conflict" in outcome)
        return failed(
          `${outcome.conflict.updatedBy} saved this page since you read it (updatedAt is now ${outcome.conflict.updatedAt}). Merge your change into the page as it is now, below, and call update_page again with baseUpdatedAt "${outcome.conflict.updatedAt}".\n\n${outcome.conflict.body}`
        );
      return done(outcome);
    }
    case "move_page": {
      const page = str(args, "page");
      const circle = str(args, "circle") || undefined;
      const parent = opt(args, "parent");
      if (!page || (!circle && parent === undefined))
        return failed(
          'Say which page, and the id of the circle to keep it or the page to put it inside ("top" for the circle\'s top level)'
        );
      return done(await write.movePage({ page, circle, parent }));
    }
    case "delete_page": {
      const page = str(args, "page");
      if (!page) return failed("Say which page: its slug or title");
      return done(await write.deletePage({ page }));
    }
    case "list_document_types": {
      const circle = str(args, "circle");
      if (!circle) return failed("Say which circle: its id from list_circles");
      const types = await write.documentTypes(circle);
      if (!types) return failed(`No circle with id ${circle}. list_circles gives the ids.`);
      return text(types.map((type) => `- ${type.label} (id: ${type.id})`).join("\n"));
    }
    case "add_link": {
      const circle = str(args, "circle");
      const url = str(args, "url");
      const title = str(args, "title");
      if (!circle || !url || !title) return failed("Give the circle's id, the link, and a title");
      return done(
        await write.addLink({
          circle,
          url,
          title,
          type: str(args, "type") || undefined,
          description: opt(args, "description"),
          meetingDate: str(args, "meetingDate") || undefined,
        })
      );
    }
    case "add_file": {
      const fileName = str(args, "fileName");
      const contentBase64 = str(args, "contentBase64");
      if (!fileName || !contentBase64)
        return failed("Give the file's name and its bytes as base64");
      return done(
        await write.addFile({
          fileName,
          contentBase64,
          circle: str(args, "circle") || undefined,
          title: str(args, "title") || undefined,
          type: str(args, "type") || undefined,
          description: opt(args, "description"),
          meetingDate: str(args, "meetingDate") || undefined,
          replaces: str(args, "replaces") || undefined,
        })
      );
    }
    case "update_document": {
      const id = str(args, "id");
      if (!id) return failed("Say which document: its id from list_documents");
      const update = {
        id,
        title: opt(args, "title"),
        description: opt(args, "description"),
        type: str(args, "type") || undefined,
        meetingDate: opt(args, "meetingDate"),
      };
      if (
        update.title === undefined &&
        update.description === undefined &&
        update.type === undefined &&
        update.meetingDate === undefined
      )
        return failed("Give what to change: title, description, type, or meetingDate");
      return done(await write.updateDocument(update));
    }
    case "delete_document": {
      const id = str(args, "id");
      if (!id) return failed("Say which document: its id from list_documents");
      return done(await write.deleteDocument({ id }));
    }
    default:
      return failed(`Unknown tool: ${name}`);
  }
}

/** Run one tool. */
export async function callTool(source: McpSource, name: string, args: Json | undefined) {
  if (WRITE_TOOL_NAMES.has(name)) {
    if (!source.write) return failed(READ_ONLY);
    return callWriteTool(source.write, name, args);
  }
  switch (name) {
    case "search": {
      const query = str(args, "query");
      if (!query) return failed("Give words to search for");
      const groups = await source.search(query);
      if (!groups.length) return text(`Nothing at CVC matches “${query}”.`);
      return text(
        groups
          .map(
            (group) =>
              `## ${group.label}\n` +
              group.results
                .map(
                  (hit) =>
                    `- ${hit.title}${hit.meta ? ` (${hit.meta})` : ""} — ${source.siteUrl}${
                      hit.href
                    }${hit.snippet ? `\n  ${hit.snippet}` : ""}`
                )
                .join("\n")
          )
          .join("\n\n")
      );
    }
    case "list_circles": {
      const circles = await source.circles();
      return text(
        circles
          .map(
            (circle) =>
              `- ${circle.name} (id: ${circle.id})${
                circle.parentId ? ` — sub group of ${circle.parentId}` : ""
              }${circle.description ? `: ${circle.description}` : ""}`
          )
          .join("\n") || "No circles yet."
      );
    }
    case "list_pages": {
      const circle = str(args, "circle");
      const pages = (await source.pages()).filter((page) => !circle || page.circleId === circle);
      return text(
        pages
          .map(
            (page) =>
              `- ${page.title} (slug: ${page.slug}, circle: ${
                page.circleId
              }, edited ${page.updatedAt.slice(0, 10)})${page.excerpt ? `\n  ${page.excerpt}` : ""}`
          )
          .join("\n") || "No pages there."
      );
    }
    case "read_page": {
      const ref = str(args, "page");
      if (!ref) return failed("Say which page: its slug or title");
      const page = await source.page(ref);
      if (!page)
        return failed(`No page called “${ref}”. Use list_pages or search to find its slug.`);
      return text(
        `# ${page.title}\n\nCircle: ${page.circleId} · Slug: ${
          page.slug
        } · Last edited ${page.updatedAt.slice(0, 10)} by ${page.updatedBy} · updatedAt: ${
          page.updatedAt
        } · ${source.siteUrl}/wiki/${page.slug}\n\n${page.body}`
      );
    }
    case "list_documents": {
      const circle = str(args, "circle");
      const docs = (await source.documents()).filter((doc) => !circle || doc.circleId === circle);
      return text(
        docs
          .map(
            (doc) =>
              `- ${doc.title} (id: ${doc.id}, circle: ${doc.circleId}, ${doc.type}, ${doc.date})${
                doc.kind === "link"
                  ? ` — link: ${doc.url}`
                  : doc.hasText
                    ? " — text readable"
                    : " — no text (a scan or image)"
              }`
          )
          .join("\n") || "No documents there."
      );
    }
    case "read_document": {
      const id = str(args, "id");
      if (!id) return failed("Say which document: its id from list_documents");
      const doc = await source.document(id);
      if (!doc) return failed(`No document with id ${id}.`);
      return text(
        `# ${doc.title}\n\nCircle: ${doc.circleId} · ${doc.url}\n\n${
          doc.text || "(No text was found in this document — it may be a scan or an image.)"
        }`
      );
    }
    default:
      return failed(`Unknown tool: ${name}`);
  }
}

const READ_INSTRUCTIONS =
  "Read-only access to CVC's pages, documents and directory, as the resident whose key this is. Start with search or list_pages; read_page gives a page's full Markdown.";
const WRITE_INSTRUCTIONS =
  "Access to CVC's pages, documents and directory as the resident whose key this is — reading, and writing where they may: create_page, update_page (read_page first, and pass its updatedAt as baseUpdatedAt), move_page, delete_page (to the trash), add_link, add_file, update_document, delete_document. Every change shows under their name. Start with search or list_pages; say what you changed, with the link.";

/**
 * Answer one JSON-RPC message. A notification (no id) gets `null`: nothing
 * to send back.
 */
export async function handleMcp(message: JsonRpcRequest, source: McpSource): Promise<Reply | null> {
  const id = message.id ?? null;
  const reply = (result: unknown): Reply => ({ jsonrpc: "2.0", id, result });
  const error = (code: number, text: string): Reply => ({
    jsonrpc: "2.0",
    id,
    error: { code, message: text },
  });
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string")
    return error(-32600, "Not a JSON-RPC 2.0 request");
  if (message.id === undefined) return null; // a notification, such as notifications/initialized
  switch (message.method) {
    case "initialize":
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "Common Pastures (CVC)", version: "1.1.0" },
        instructions: source.write ? WRITE_INSTRUCTIONS : READ_INSTRUCTIONS,
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: source.write ? [...TOOLS, ...WRITE_TOOLS] : TOOLS });
    case "tools/call": {
      const name = str(message.params, "name");
      const args = (message.params?.arguments as Json | undefined) ?? undefined;
      return reply(await callTool(source, name, args));
    }
    default:
      return error(-32601, `Method not found: ${message.method}`);
  }
}
