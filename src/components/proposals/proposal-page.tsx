"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CornerDownRight } from "lucide-react";
import { PROPOSAL_DIRECTIVE } from "@/lib/proposals/shared";
import { BackLink } from "@/components/layout/back-link";
import { CircleIcon } from "@/components/circles/circle-icon";
import { useCircles } from "@/components/directory/use-directory";
import { Loading, NotFoundCard } from "@/components/ui/status";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { proposalQuery } from "./data";
import { ProposalConsentRecord, ProposalStatusPill, dayOf } from "./proposal-bits";
import { ProposalActions, ProposalDocuments } from "./proposal-card";
import { StarButton, useNoteOpened } from "@/components/documents/my-documents";
import { ShareButton } from "@/components/documents/share-button";

/**
 * A proposal's own page (`/proposals/<id>`): its circle, title, where it
 * stands, the proposal itself, the documents it's about, the record of
 * consent (the meeting, who was there, who recorded it), the pages that
 * hold it, and what you may do with it — and a **Star**, to find it again.
 */
export function ProposalPage({ id }: { id: string }) {
  const router = useRouter();
  const circles = useCircles();
  const pages = useWikiPages().data?.pages;
  const { data, isLoading, error } = useQuery(proposalQuery(id));
  const proposal = data?.proposal;
  useNoteOpened(proposal ? { kind: "proposal", id: proposal.id } : null);
  if (isLoading) return <Loading />;
  if (error || !proposal)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <BackLink href="/documents?kind=proposals" label="Proposals" />
        <NotFoundCard error={error} message="That proposal wasn't found." />
      </div>
    );
  const circle = circles?.find((entry) => entry.id === proposal.circleId);
  const body = proposal.body.replace(PROPOSAL_DIRECTIVE, "").trim();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href={`/circles/${proposal.circleId}`} label={proposal.circleName} />
        <div className="flex items-center gap-2">
          <StarButton doc={{ kind: "proposal", id: proposal.id }} title={proposal.title} />
          <ShareButton
            path={`/proposals/${proposal.id}`}
            title={proposal.title}
            circleId={proposal.circleId}
            label="Proposal"
          />
        </div>
      </div>
      <article className="document-sheet flex flex-col" data-proposal-page>
        <header className="flex flex-col items-center gap-3 border-b border-border/70 px-6 pb-7 pt-9 text-center sm:px-14">
          {circle ? (
            <Link
              href={`/circles/${circle.id}`}
              title={circle.name}
              className="rounded-full ring-4 ring-white shadow-soft transition hover:scale-105"
            >
              <CircleIcon circle={circle} size={64} className="rounded-full" />
            </Link>
          ) : null}
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Proposal to {proposal.circleName}
          </p>
          <h1 className="font-display text-3xl font-semibold leading-tight text-foreground">
            {proposal.title}
          </h1>
          <p className="text-sm text-muted">
            Proposed by {proposal.proposedBy.name} · {dayOf(proposal.createdAt)}
          </p>
          <ProposalStatusPill
            status={proposal.status}
            decideOn={proposal.decideOn}
            consentDate={proposal.consent?.meeting.date}
          />
          {proposal.consent ? (
            <ProposalConsentRecord
              consent={proposal.consent}
              circleName={proposal.circleName}
              className="items-center text-center"
            />
          ) : proposal.withdrawn ? (
            <p className="text-xs text-muted">
              Withdrawn by {proposal.withdrawn.by.name} · {dayOf(proposal.withdrawn.at)}
            </p>
          ) : null}
        </header>
        <div className="document-body flex w-full flex-col gap-6">
          {body ? (
            <WikiMarkdown source={body} circleId={proposal.circleId} pages={pages} />
          ) : (
            <p className="text-sm text-muted">
              The proposal is its title and the documents it&apos;s about.
            </p>
          )}
          <ProposalDocuments proposal={proposal} />
          {proposal.appearsIn.length ? (
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <CornerDownRight className="h-3.5 w-3.5" aria-hidden /> In
              </p>
              <ul className="flex flex-col gap-0.5 text-sm">
                {proposal.appearsIn.map((page) => (
                  <li key={page.slug}>
                    <Link href={`/wiki/${page.slug}`} className="text-foreground hover:underline">
                      {page.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <footer className="border-t border-border/70 px-6 py-4 sm:px-14">
          <ProposalActions
            proposal={proposal}
            onDeleted={() => router.replace(`/circles/${proposal.circleId}`)}
          />
        </footer>
      </article>
    </div>
  );
}
