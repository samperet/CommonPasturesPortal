"use client";

import Link from "next/link";
import { BadgeCheck, BookOpen, Hourglass } from "lucide-react";
import type { PageListing } from "@/lib/wiki/listing";
import { shortDate, timeAgo } from "@/lib/time";
import { Highlighted } from "@/components/documents/document-row";
import { ConsentRecord, consentSummary } from "@/components/circles/consent-record";
import { RowChoice } from "@/components/documents/export";
import { Pill } from "@/components/ui/pill";

/**
 * A written page in the Documents list, beside uploaded files: a book
 * instead of a file icon and a "Page" label instead of a file type, its
 * stage (proposed or consented; drafts aren't labelled — but a page not yet
 * published is, as a Draft), circle, and when
 * it was last edited, then its opening lines — or, in a search, the passage
 * that matched. Its title opens the page. In a circle's Documents module
 * (`compact`), just the book and the title. While documents are being
 * chosen for an export, the book is a box to tick.
 */
export function PageListingRow({
  page,
  terms,
  showCircle,
  compact = false,
}: {
  page: PageListing;
  terms: string[];
  showCircle: boolean;
  compact?: boolean;
}) {
  const text = page.snippet ?? page.excerpt;
  return (
    <li className={compact ? "flex flex-col py-2" : "flex flex-col gap-1 py-4"} data-listing="page">
      <div className="flex items-start gap-3">
        <RowChoice
          item={{ kind: "page", id: page.id }}
          title={page.title}
          icon={<BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />}
        />
        <Link
          href={`/wiki/${page.slug}`}
          className="min-w-0 break-words font-medium text-foreground underline-offset-4 hover:underline"
        >
          <Highlighted text={page.title} terms={terms} />
        </Link>
      </div>
      {compact ? null : (
        <>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pl-8 text-xs text-muted">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-pine">
              Page
            </span>
            {page.draft ? (
              <Pill tone="outline" title="Not published yet: only its author (and admins) see it">
                Draft
              </Pill>
            ) : null}
            {page.stage === "consented" ? (
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pine/10 px-2 py-0.5 font-semibold text-pine"
                title={page.consentRecord ? consentSummary(page.consentRecord) : undefined}
              >
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Consented
              </span>
            ) : page.stage === "proposed" ? (
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sun/30 px-2 py-0.5 font-semibold text-foreground"
                title={
                  page.decideOn
                    ? `Waiting for consent · to decide ${shortDate(page.decideOn, true)}`
                    : "Waiting for consent"
                }
              >
                <Hourglass className="h-3.5 w-3.5" aria-hidden />{" "}
                {page.consent === "changed" ? "Proposed change" : "Proposed"}
                {page.decideOn ? (
                  <span className="hidden font-normal sm:inline">
                    · {shortDate(page.decideOn, true)}
                  </span>
                ) : null}
              </span>
            ) : page.consent === "changed" ? (
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sun/15 px-2 py-0.5 font-medium text-[#7a5200]"
                title="A draft: edited since the circle consented"
              >
                <span className="sm:hidden">Changed</span>
                <span className="hidden sm:inline">Changed since consent</span>
              </span>
            ) : null}
            {showCircle ? (
              <Link
                href={`/circles/${page.circleId}#documents`}
                className="font-medium hover:text-foreground hover:underline"
              >
                {page.circleName}
              </Link>
            ) : null}
            <span className="whitespace-nowrap" title={shortDate(page.updatedAt, true)}>
              edited {timeAgo(page.updatedAt)} by {page.updatedBy}
            </span>
          </p>
          {page.consentRecord && page.consent ? (
            <ConsentRecord
              consent={page.consentRecord}
              what={page.consent === "changed" ? "An earlier version was consented" : "Consented"}
              className="pl-8"
            />
          ) : null}
          {text ? (
            <p
              className={
                page.snippet
                  ? "ml-8 rounded-md bg-accent/60 px-2 py-1 text-sm text-foreground-light"
                  : "ml-8 line-clamp-2 text-sm text-foreground-light"
              }
            >
              <Highlighted text={text} terms={terms} />
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}
