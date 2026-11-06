"use client";

import Link from "next/link";
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  type ChangeEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { remarkWikiDirectives } from "@/lib/wiki/directives";
import { remarkTodoIndex } from "@/lib/wiki/todos";
import { remarkTableWidths } from "@/lib/wiki/tables";
import { remarkTabs } from "@/lib/wiki/tabs";
import { headingSlug } from "@/lib/wiki/sections";
import type { WikiPageSummary } from "@/lib/wiki/store";
import {
  WIKI_LINK,
  normalizeWikiLinks,
  parseWikiLink,
  wikiLinksIn,
  type CircleRef,
} from "@/lib/wiki/links";
import {
  docFileUrl,
  findDoc,
  pageTitled,
  useDocTitles,
  type DocRef,
} from "@/components/wiki/link-data";
import { WikiCircleContext, WikiPollBlock } from "@/components/wiki/poll-block";
import { PersonTag, WikiTag } from "@/components/wiki/wiki-tag";
import { EmbedBlock, EmbedChain } from "@/components/wiki/embed-block";
import { ProposalBlock } from "@/components/proposals/proposal-card";
import { cn } from "@/lib/utils";
import { useCircles } from "@/components/directory/use-directory";

export { headingSlug, tableOfContents } from "@/lib/wiki/sections";

type LinkData = {
  /** The circle that keeps the page being shown (its documents come first for `[[doc:…]]`). */
  circleId: string;
  /** The page they're on: a page started from a link to a missing one is kept by the same circle. */
  pageId?: string;
  /** Undefined until the directory loads. */
  circles: CircleRef[] | undefined;
  /** The wiki's pages, once loaded. */
  pages: WikiPageSummary[] | undefined;
  /** Undefined until loaded (or when the page has no document links). */
  docs: DocRef[] | undefined;
};

// Links carry what they are in their Markdown title, for the renderer below.
const MARK = "wiki:";
const mdTitle = (value: string) => ` "${MARK}${value.replace(/["\\]/g, "")}"`;

/**
 * `[[Page title]]` and `[[doc:Document title]]` (each optionally `|shown
 * text`) as ordinary Markdown links: to the page (or, if there's no such page
 * yet, to starting it), or to the document's file.
 */
function linkWikiPages(source: string, { circleId, pageId, circles, pages, docs }: LinkData) {
  return source.replace(WIKI_LINK, (_match, target: string, label?: string) => {
    const clean = (text: string) => text.trim().replace(/[[\]]/g, "");
    if (!circles) return `[${clean(label ?? target)}](#${mdTitle("pending")})`;
    const link = parseWikiLink(target, circles);
    const text = clean(label ?? link.title);
    if (link.kind === "doc") {
      if (!docs) return `[${text}](#${mdTitle("pending")})`;
      const doc = findDoc(docs, link.title, link.circleId, circleId);
      return doc
        ? `[${text}](${docFileUrl(doc.id)}${mdTitle(`doc:${doc.circleName}`)})`
        : `[${text}](#${mdTitle("doc-missing")})`;
    }
    if (!pages) return `[${text}](#${mdTitle("pending")})`;
    const page = pageTitled(pages, link.title);
    if (!page)
      return `[${text}](/documents?new=${encodeURIComponent(link.title)}${
        pageId ? `&from=${pageId}` : ""
      }${mdTitle("missing")})`;
    return `[${text}](/wiki/${page.slug}${mdTitle("page:")})`;
  });
}

function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement(child)
          ? textOf(child.props.children)
          : ""
    )
    .join("");
}

const heading = (Tag: "h2" | "h3" | "h4", className: string): Components["h1"] =>
  function Heading({ node: _node, children, ...props }) {
    return (
      <Tag id={headingSlug(textOf(children))} className={cn("scroll-mt-24", className)} {...props}>
        {children}
      </Tag>
    );
  };

const components: Components = {
  h1: heading("h2", "mt-6 text-xl font-semibold text-foreground first:mt-0"),
  h2: heading("h3", "mt-5 text-lg font-semibold text-foreground first:mt-0"),
  h3: heading("h4", "mt-4 font-semibold text-foreground first:mt-0"),
  p: ({ node: _node, ...props }) => <p className="leading-relaxed" {...props} />,
  // A to-do list (checklist) has boxes, not bullets.
  ul: ({ node: _node, className, ...props }) => (
    <ul
      className={cn(
        "space-y-1",
        className?.includes("contains-task-list") ? "pl-1 [li>&]:pl-6" : "list-disc pl-6",
        className
      )}
      {...props}
    />
  ),
  li: ({ node: _node, ...props }) => <ListItem {...props} />,
  input: ({ node: _node, ...props }) => <TodoBox {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="list-decimal space-y-1 pl-6" {...props} />,
  blockquote: ({ node: _node, ...props }) => <blockquote className="wiki-quote" {...props} />,
  code: ({ node: _node, className, ...props }) => (
    <code className={cn("rounded bg-accent px-1 py-0.5 text-[0.9em]", className)} {...props} />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="overflow-x-auto rounded-lg bg-accent p-3 text-sm [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  hr: () => <hr className="border-border" />,
  mark: ({ node: _node, className, ...props }) => <mark className={className} {...props} />,
  // A poll the page holds (`::poll{id="…"}`), a proposal (`::proposal{id="…"}`), or another page shown in it (`::embed{page="…"}`).
  div: ({ node: _node, ...props }) => {
    const data = props as Record<string, unknown>;
    if (typeof data["data-poll"] === "string") return <WikiPollBlock pollId={data["data-poll"]} />;
    if (typeof data["data-proposal"] === "string")
      return <ProposalBlock proposalId={data["data-proposal"]} />;
    if (typeof data["data-embed"] === "string")
      return (
        <EmbedBlock
          target={data["data-embed"]}
          section={typeof data["data-section"] === "string" ? data["data-section"] : undefined}
        />
      );
    return <div {...props} />;
  },
  table: ({ node: _node, ...props }) => <Table {...props} />,
  th: ({ node: _node, ...props }) => (
    <th
      className="border border-border bg-accent/60 px-2 py-1 text-left font-semibold"
      {...props}
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border border-border px-2 py-1 align-top" {...props} />
  ),
  // Wiki links are tags (see WikiTag); other links stay underlined text.
  a: ({ node: _node, href = "", title, children }) => {
    const mark = title?.startsWith(MARK) ? title.slice(MARK.length) : null;
    if (mark === "pending") return <WikiTag kind="pending" label={children} />;
    if (mark === "person") return <PersonTag label={children} href={href} />;
    if (mark === "doc-missing") return <WikiTag kind="doc-missing" label={children} />;
    if (mark?.startsWith("doc:"))
      return <WikiTag kind="doc" label={children} href={href} circleName={mark.slice(4)} />;
    if (mark === "missing") return <WikiTag kind="missing" label={children} href={href} />;
    if (mark?.startsWith("page:"))
      return (
        <WikiTag kind="page" label={children} href={href} circleName={mark.slice(5) || null} />
      );
    const className = "font-medium text-secondary-foreground underline underline-offset-4";
    if (href.startsWith("/")) {
      return (
        <Link href={href} className={className}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
  // Photos added to a wiki show on the page (opening full size); images from elsewhere show as their description.
  img: ({ node: _node, src = "", alt }) =>
    WIKI_IMAGE.test(src) ? (
      <span className="my-1 block">
        <a href={src} target="_blank" rel="noopener" className="block w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, already-sized photos */}
          <img
            src={src}
            alt={alt ?? ""}
            loading="lazy"
            className="max-h-[32rem] w-auto max-w-full rounded-lg border border-border bg-accent/40"
          />
        </a>
        {alt ? <span className="mt-1 block text-xs text-muted">{alt}</span> : null}
      </span>
    ) : (
      <span className="text-muted">[{alt || "image"}]</span>
    ),
};

/**
 * Ticking a page's own to-do items while reading (its editors): given the
 * item's number in the page (`remarkTodoIndex`). Pages embedded in it, and
 * anyone who can't edit, get null — their boxes can't be ticked.
 */
const TodoContext = createContext<((index: number, checked: boolean) => void) | null>(null);

/** A list item; a to-do item ticks off here (the change comes up from its box). */
/** A table; with `data-widths` (from a `::columns` line, `lib/wiki/tables.ts`), its columns at those shares. */
function Table({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const widths = (props as Record<string, unknown>)["data-widths"];
  const shares = typeof widths === "string" ? widths.split(",").map(Number) : [];
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-sm"
        style={shares.length ? { tableLayout: "fixed" } : undefined}
        {...props}
      >
        {shares.length ? (
          <colgroup>
            {shares.map((share, index) => (
              <col key={index} style={{ width: `${share}%` }} />
            ))}
          </colgroup>
        ) : null}
        {children}
      </table>
    </div>
  );
}

function ListItem({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) {
  const toggle = useContext(TodoContext);
  const index = (props as Record<string, unknown>)["data-todo"];
  if (index === undefined) return <li className={className} {...props} />;
  const onChange = (event: ChangeEvent<HTMLLIElement>) => {
    const box = event.target as unknown as HTMLInputElement;
    // Only this item's own box (not one in a list inside it).
    if (box.type !== "checkbox" || box.closest("li") !== event.currentTarget) return;
    event.stopPropagation();
    toggle?.(Number(index), box.checked);
  };
  return <li className={cn("list-none", className)} onChange={onChange} {...props} />;
}

/** A to-do item's box: ticked by the page's editors while reading (`TodoContext`). */
function TodoBox(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const toggle = useContext(TodoContext);
  if (props.type !== "checkbox") return <input {...props} />;
  return (
    <input
      type="checkbox"
      checked={!!props.checked}
      disabled={!toggle}
      // The list item takes the change (it knows which item this is).
      onChange={() => undefined}
      aria-label={props.checked ? "Done" : "To do"}
      className="mr-2 h-4 w-4 translate-y-[2px] accent-primary disabled:cursor-default enabled:cursor-pointer"
    />
  );
}

/** What a page's links need: the circles, the wiki's pages, and (if it links any) the documents. */
function useLinkData(
  source: string,
  circleId: string,
  pages: WikiPageSummary[] | undefined,
  pageId?: string
): LinkData {
  const circles = useCircles();
  const links = useMemo(() => (circles ? wikiLinksIn(source, circles) : []), [source, circles]);
  const docs = useDocTitles(links.some((link) => link.kind === "doc")).data;
  return { circleId, pageId, circles, pages, docs };
}

/** A photo uploaded to one of the circles' wikis. */
const WIKI_IMAGE = /^\/api\/circles\/[a-z0-9-]+\/wiki\/images\/[0-9a-f-]{36}$/;

/** A wiki page's Markdown, as formatted text. Raw HTML isn't rendered; photos added to a wiki show, other images as their description. */
export function WikiMarkdown({
  source,
  circleId,
  pages,
  pageId,
  onToggleTodo,
}: {
  source: string;
  circleId: string;
  pages: WikiPageSummary[] | undefined;
  pageId?: string;
  /** Tick a to-do item off (or not) while reading: for the page's editors. */
  onToggleTodo?: (index: number, checked: boolean) => void;
}) {
  const linkData = useLinkData(source, circleId, pages, pageId);
  const circleName = linkData.circles?.find((circle) => circle.id === circleId)?.name;
  const wiki = useMemo(() => ({ circleId, circleName }), [circleId, circleName]);
  // Pages embedded in this one know it's already open (so it never shows inside itself).
  const outer = useContext(EmbedChain);
  const self = pageId ?? null;
  const chain = useMemo(
    () => (self && outer[outer.length - 1] !== self ? [...outer, self] : outer),
    [outer, self]
  );
  if (!source.trim()) return <p className="text-sm text-muted">This page is empty.</p>;
  return (
    <WikiCircleContext.Provider value={wiki}>
      <EmbedChain.Provider value={chain}>
        <TodoContext.Provider value={onToggleTodo ?? null}>
          <div className="flex flex-col gap-3 break-words text-foreground">
            <ReactMarkdown
              remarkPlugins={[
                remarkGfm,
                remarkDirective,
                remarkTableWidths,
                remarkWikiDirectives,
                remarkTodoIndex,
                remarkTabs,
              ]}
              components={components}
            >
              {linkWikiPages(normalizeWikiLinks(source), linkData)}
            </ReactMarkdown>
          </div>
        </TodoContext.Provider>
      </EmbedChain.Provider>
    </WikiCircleContext.Provider>
  );
}

const plainComponents: Components = {
  ...components,
  // Polls, proposals, and embedded pages need an account: left out.
  div: ({ node: _node, ...props }) => {
    const data = props as Record<string, unknown>;
    if (
      typeof data["data-poll"] === "string" ||
      typeof data["data-proposal"] === "string" ||
      typeof data["data-embed"] === "string"
    )
      return null;
    return <div {...props} />;
  },
  // Photos are private to residents: their description stands in.
  img: ({ node: _node, alt }) => <span className="text-muted">[{alt || "photo"}]</span>,
  // Links into the app need an account: their text stays, unlinked.
  a: ({ node: _node, href = "", children }) =>
    href.startsWith("/") || href.startsWith("#") ? (
      <span className="font-medium">{children}</span>
    ) : (
      <a
        href={href}
        className="font-medium text-secondary-foreground underline underline-offset-4"
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        {children}
      </a>
    ),
};

/**
 * A page's Markdown for someone who can't sign in yet (a new member, from
 * their welcome link): formatted as on the wiki, but `[[links]]` to other
 * pages and documents are their plain text, links into the app aren't
 * links, and polls, embedded pages, and photos are left out.
 */
export function PlainWikiMarkdown({ source }: { source: string }) {
  const text = normalizeWikiLinks(source).replace(
    WIKI_LINK,
    (_match, target: string, label?: string) =>
      (label ?? target.replace(/^\s*doc\s*:/i, "")).trim().replace(/[[\]]/g, "")
  );
  if (!text.trim()) return <p className="text-sm text-muted">This page is empty.</p>;
  return (
    <div className="flex flex-col gap-3 break-words text-foreground">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkDirective,
          remarkTableWidths,
          remarkWikiDirectives,
          remarkTabs,
        ]}
        components={plainComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
