"use client";

import { useQuery } from "@tanstack/react-query";
import { Bot, PenLine, Search, Wrench } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { AiKeys } from "@/components/ai/ai-keys";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

/**
 * The AI assistants page (`/mcp`; `/ai` and `/MCP` are sent there; in the
 * menu under your name, and in search): how to connect an
 * assistant — Claude on the web, phone or desktop, Claude Code,
 * ChatGPT, anything else that speaks MCP — step by step, and your keys
 * (`ai-keys.tsx`). The connector's address comes from the keys route.
 */

const TOOLS: [string, string][] = [
  ["search", "Find anything at CVC — pages, documents, people, circles, the forum, tasks."],
  ["list_circles", "The circles and sub groups."],
  ["list_pages", "The written pages, with who keeps each and when it changed."],
  ["read_page", "A page in full."],
  ["list_documents", "The uploaded documents and links, by circle."],
  ["read_document", "The text inside an uploaded document."],
];

/** What a key that can write adds. */
const WRITE_TOOLS: [string, string][] = [
  ["create_page", "Start a page, kept by one of your circles."],
  ["update_page", "Save a new version of a page you can edit (never over someone else's edit)."],
  ["move_page", "Give a page you keep to another of your circles."],
  ["delete_page", "Put a page you keep in the trash (30 days to restore it)."],
  ["list_document_types", "A circle's document types."],
  ["add_link", "Add a Google Doc, Sheet, Slides deck, or web link to a circle's documents."],
  ["add_file", "Upload a small file (up to 3 MB) as a document, or as a new version of one."],
  ["update_document", "Change a document's title, description, type or meeting date."],
  ["delete_document", "Delete a document you may change. No trash: it's gone for good."],
  ["add_image", "Add a picture to a page you can edit, then place it in the page's text."],
];

function ToolList({ tools }: { tools: [string, string][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
      {tools.map(([name, about]) => (
        <div key={name} className="contents">
          <dt>
            <code className="rounded bg-accent px-1.5 py-0.5 text-xs">{name}</code>
          </dt>
          <dd className="text-foreground-light">{about}</dd>
        </div>
      ))}
    </dl>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="flex list-decimal flex-col gap-1.5 pl-6 text-sm text-foreground">{children}</ol>
  );
}

export function AiPage() {
  const { data } = useQuery({
    queryKey: ["mcp-keys"],
    queryFn: () => apiFetch<{ url: string }>("/api/mcp/keys"),
  });
  const url = data?.url ?? "https://…/api/mcp";
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6" data-ai-page>
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Bot className="h-6 w-6 text-primary" aria-hidden /> AI assistants
        </h1>
        <p className="text-sm text-foreground-light">
          If you use an AI assistant — Claude, ChatGPT, or another — you can let it read CVC for
          you. Then you can ask it things like “What did Land Care decide about the pellet stove?”
          or “Summarise last month’s minutes”, and it answers from what’s written here.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <SectionHeading icon={Wrench}>Connecting an assistant</SectionHeading>
        <p className="text-sm text-foreground-light">
          Three steps, whichever assistant you use: make a key (below), give it to the assistant
          once, then ask away. Here&apos;s where the key goes in each.
        </p>

        <section className="flex flex-col gap-2" data-ai-how="claude">
          <h3 className="font-semibold text-foreground">Claude — on the web, phone or desktop</h3>
          <Steps>
            <li>
              Below, press <strong>Make a key</strong>. A box appears with an address for Claude —
              press <strong>Copy</strong> beside it.
            </li>
            <li>
              In Claude, open <strong>Settings</strong>, then <strong>Connectors</strong>.
            </li>
            <li>
              Press <strong>Add custom connector</strong>, name it “CVC”, and paste the address.
              Press <strong>Add</strong>.
            </li>
            <li>
              Start a new chat and ask something about CVC. The first time, Claude may ask whether
              it may use CVC — say yes.
            </li>
          </Steps>
          <p className="text-xs text-muted">
            Custom connectors need a paid Claude plan. If you don&apos;t see Connectors, that&apos;s
            why.
          </p>
        </section>

        <section className="flex flex-col gap-2" data-ai-how="chatgpt">
          <h3 className="font-semibold text-foreground">ChatGPT</h3>
          <Steps>
            <li>
              Below, press <strong>Make a key</strong> and copy the{" "}
              <strong>address for Claude</strong> — it works for ChatGPT too.
            </li>
            <li>
              In ChatGPT, open <strong>Settings</strong> → <strong>Connectors</strong> (or
              <strong> Apps &amp; connectors</strong>), then <strong>Create</strong> under advanced
              or developer settings.
            </li>
            <li>
              Name it “CVC”, paste the address as the server URL, choose{" "}
              <strong>No authentication</strong> (the key is already in the address), and save.
            </li>
            <li>In a new chat, turn CVC on under the tools (the + or paperclip) and ask.</li>
          </Steps>
          <p className="text-xs text-muted">
            ChatGPT only offers this on some plans, and moves the settings around; look for
            “connectors” or “MCP”.
          </p>
        </section>

        <section className="flex flex-col gap-2" data-ai-how="claude-code">
          <h3 className="font-semibold text-foreground">Claude Code (in a terminal)</h3>
          <Steps>
            <li>
              Below, make a key and copy the <strong>Claude Code</strong> command shown.
            </li>
            <li>Paste it into your terminal and press Enter.</li>
            <li>
              In Claude Code, type <code>/mcp</code> to see CVC listed, then ask it anything.
            </li>
          </Steps>
        </section>

        <section className="flex flex-col gap-2" data-ai-how="other">
          <h3 className="font-semibold text-foreground">Anything else that speaks MCP</h3>
          <p className="text-sm text-foreground">
            The server is <code className="break-all">{url}</code> — the Model Context Protocol over
            plain HTTP (JSON-RPC in a POST; no streaming). Send your key as{" "}
            <code>Authorization: Bearer …</code>, or add <code>?key=…</code> to the address if the
            client can&apos;t set headers. Cursor, Windsurf, Gemini CLI, Codex and most others take
            a server URL in their MCP settings.
          </p>
        </section>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionHeading icon={Search}>What it can look up</SectionHeading>
        <p className="text-sm text-foreground-light">
          These are the “tools” the assistant gets. You don&apos;t call them yourself — it picks
          what it needs from your question.
        </p>
        <ToolList tools={TOOLS} />
        <h3 className="mt-2 flex items-center gap-2 font-semibold text-foreground" data-ai-writes>
          <PenLine className="h-4 w-4 text-primary" aria-hidden /> And with a key that can write
        </h3>
        <ToolList tools={WRITE_TOOLS} />
      </Card>

      <AiKeys />
    </div>
  );
}
