"use client";

import Link from "next/link";
import { Handshake } from "lucide-react";
import type { ProposalListing } from "@/lib/proposals/shared";
import { Highlighted } from "@/components/documents/document-row";
import { RowChoice, useChoosing } from "@/components/documents/export";
import { cn } from "@/lib/utils";
import { ProposalStatusPill, dayOf } from "./proposal-bits";

/**
 * Proposals in lists: a row in the Documents list (beside pages and files —
 * where it stands, its circle, who proposed it, and in a search the passage
 * that matched; no icon or preview there, a handshake in a circle's module),
 * and cards for a circle's page (a Filtered Documents module's "proposals
 * waiting for consent").
 */

export function ProposalListingRow({
  proposal,
  terms,
  showCircle,
  compact = false,
}: {
  proposal: ProposalListing;
  terms: string[];
  showCircle: boolean;
  compact?: boolean;
}) {
  // In a search, the passage that matched; otherwise no preview of its words.
  const text = proposal.snippet;
  const choosing = useChoosing();
  const indented = compact || choosing;
  return (
    <li
      className={compact ? "flex flex-col py-2" : "flex flex-col gap-1 py-4"}
      data-listing="proposal"
    >
      <div className="flex items-start gap-3">
        <RowChoice
          item={{ kind: "proposal", id: proposal.id }}
          title={proposal.title}
          icon={
            compact ? (
              <Handshake className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            ) : null
          }
        />
        <Link
          href={`/proposals/${proposal.id}`}
          className="min-w-0 break-words font-medium text-foreground underline-offset-4 hover:underline"
        >
          <Highlighted text={proposal.title} terms={terms} />
        </Link>
      </div>
      {compact ? null : (
        <>
          <p
            className={cn(
              "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted",
              indented && "pl-8"
            )}
          >
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-pine">
              Proposal
            </span>
            <ProposalStatusPill
              size="xs"
              status={proposal.status}
              decideOn={proposal.decideOn}
              consentDate={proposal.consent?.date}
            />
            {showCircle ? <span className="font-medium">{proposal.circleName}</span> : null}
            <span>by {proposal.proposedBy}</span>
            <span className="whitespace-nowrap">{dayOf(proposal.createdAt)}</span>
          </p>
          {text ? (
            <p className={cn("line-clamp-2 text-sm text-foreground-light", indented && "pl-8")}>
              <Highlighted text={text} terms={terms} />
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}

/** A circle's proposals as small cards. */
export function ProposalCards({ proposals }: { proposals: ProposalListing[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-proposal-cards>
      {proposals.map((proposal) => (
        <li
          key={proposal.id}
          className="flex flex-col gap-1.5 rounded-xl border border-border border-l-4 border-l-primary bg-white/80 p-3"
        >
          <Link
            href={`/proposals/${proposal.id}`}
            className="break-words font-medium text-foreground hover:underline"
          >
            {proposal.title}
          </Link>
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <ProposalStatusPill
              size="xs"
              status={proposal.status}
              decideOn={proposal.decideOn}
              consentDate={proposal.consent?.date}
            />
            by {proposal.proposedBy}
          </span>
          {proposal.excerpt ? (
            <p className="line-clamp-3 text-sm text-foreground-light">{proposal.excerpt}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
