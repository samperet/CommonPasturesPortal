"use client";

import { Fragment } from "react";
import {
  Car,
  Compass,
  BookOpen,
  BookUser,
  ExternalLink,
  FileText,
  Handshake,
  Layers,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  Search,
  Share2,
} from "lucide-react";
import type { SearchKind, SearchResult } from "@/lib/site-search";

/**
 * How search results look, shared by the search page and the header's search
 * bar: each kind's icon, the typed words marked, and a result's title, where
 * it is, and the passage that matched.
 */

export const SEARCH_ICONS: Record<SearchKind, typeof Search> = {
  places: Compass,
  cars: Car,
  people: BookUser,
  circles: Layers,
  wiki: BookOpen,
  forum: MessagesSquare,
  documents: FileText,
  proposals: Handshake,
  tasks: ListChecks,
  resources: Lightbulb,
  library: Share2,
};

/** The words to mark in results: the query's terms (quoted phrases kept whole). */
export function termsOf(query: string) {
  return Array.from(query.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g), (match) =>
    (match[1] ?? match[2]).trim()
  ).filter(Boolean);
}

/** `text` with each of `terms` marked. */
export function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  return (
    <>
      {text.split(pattern).map((part, index) =>
        index % 2 ? (
          <mark key={index} className="rounded bg-sun/25 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  );
}

/** A result's title (and a new-tab mark for a file), where it is, and its matching passage. */
export function ResultBody({
  result,
  terms,
  snippetLines = 2,
}: {
  result: SearchResult;
  terms: string[];
  snippetLines?: 1 | 2;
}) {
  return (
    <>
      <span className="flex items-center gap-1.5 font-medium text-foreground group-hover:underline">
        {/* One flex item, so the spaces around marked words stay. */}
        <span className="min-w-0">
          <Marked text={result.title} terms={terms} />
        </span>
        {result.external ? (
          <ExternalLink
            className="h-3.5 w-3.5 shrink-0 text-muted"
            aria-label="(opens in a new tab)"
          />
        ) : null}
      </span>
      {result.meta ? (
        <span className="text-xs text-muted">
          <Marked text={result.meta} terms={terms} />
        </span>
      ) : null}
      {result.snippet ? (
        <span
          className={
            snippetLines === 1
              ? "line-clamp-1 text-sm text-foreground-light"
              : "line-clamp-2 text-sm text-foreground-light"
          }
        >
          <Marked text={result.snippet} terms={terms} />
        </span>
      ) : null}
    </>
  );
}
