import { occurrences, snippetFor } from "@/lib/search";
import {
  consentState,
  pageStage,
  type ConsentState,
  type PageConsent,
  type PageStage,
} from "./consent";
import { excerptOf } from "./excerpt";
import type { WikiPage } from "./store";

/**
 * A written page as the Documents list shows it, beside uploaded files:
 * its circle, dates, stage (draft, proposed, consented), and opening lines (or, in a search, the
 * passage that matched). Safe for the browser.
 */
export interface PageListing {
  kind: "page";
  id: string;
  slug: string;
  title: string;
  circleId: string;
  circleName: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  consent: ConsentState;
  /** The day the circle consented, while it stands. */
  consentDate: string | null;
  /** The consent recorded (to this version or an earlier one): when, who consented, who recorded it. */
  consentRecord:
    | (Pick<PageConsent, "date" | "consentedBy"> & { recordedBy: { name: string } })
    | null;
  stage: PageStage;
  /** While proposed: the day the circle means to decide, if set. */
  decideOn: string | null;
  excerpt: string;
  snippet?: string | null;
  /** Its emoji, if it has one. */
  icon: string | null;
  /** The page it sits inside, if any. */
  parentId: string | null;
  /** Not yet published (only its author and admins get to see it listed). */
  draft: boolean;
}

export function pageListing(
  page: WikiPage,
  circleName: string,
  snippet?: string | null
): PageListing {
  return {
    kind: "page",
    id: page.id,
    slug: page.slug,
    title: page.title,
    circleId: page.keeper,
    circleName,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    updatedBy: page.updatedBy.name,
    consent: consentState(page),
    consentDate: page.consent?.date ?? null,
    consentRecord: page.consent
      ? {
          date: page.consent.date,
          ...(page.consent.consentedBy ? { consentedBy: page.consent.consentedBy } : {}),
          recordedBy: { name: page.consent.recordedBy.name },
        }
      : null,
    stage: pageStage(page),
    decideOn: page.proposal?.decideOn ?? null,
    excerpt: excerptOf(page.body, 220),
    ...(snippet !== undefined ? { snippet } : {}),
    icon: page.icon ?? null,
    parentId: page.parentId ?? null,
    draft: !!page.draft,
  };
}

/** The day a page counts as dated, for sorting and the year filter: its meeting's, for meeting notes; otherwise the day it was started. */
export const pageDate = (page: Pick<WikiPage, "createdAt" | "meetingDate">) =>
  page.meetingDate ?? page.createdAt.slice(0, 10);

/**
 * Pages matching every term, in their title, their circle's name (and
 * "consented", "proposed", "page"), or their text — scored the way documents are, so the
 * two can be listed together, best first.
 */
export function searchPages(
  pages: WikiPage[],
  terms: string[],
  labels: (page: WikiPage) => string
): { page: WikiPage; score: number; snippet: string | null }[] {
  if (!terms.length) return [];
  const hits = [];
  for (const page of pages) {
    const title = page.title.toLowerCase();
    const details = labels(page).toLowerCase();
    const text = excerptOf(page.body, 50_000);
    const lowerText = text.toLowerCase();
    let score = 0;
    let all = true;
    for (const term of terms) {
      const inTitle = occurrences(title, term);
      const inDetails = occurrences(details, term);
      const inText = occurrences(lowerText, term);
      if (!inTitle && !inDetails && !inText) {
        all = false;
        break;
      }
      score += inTitle * 20 + inDetails * 5 + Math.min(inText, 20);
    }
    if (all) hits.push({ page, score, snippet: snippetFor(text, terms) });
  }
  return hits.sort((a, b) => b.score - a.score);
}
