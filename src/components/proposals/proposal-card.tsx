"use client";

import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BadgeCheck, BookOpen, Camera, FileText, GitBranch, Handshake } from "lucide-react";
import type {
  MeetingOption,
  ProposalDocument,
  ProposalVersionShown,
  ProposalView,
} from "@/lib/proposals/shared";
import { PROPOSAL_DIRECTIVE } from "@/lib/proposals/shared";
import { versionOf } from "@/lib/wiki/perspectives-shared";
import { ActionLink } from "@/components/ui/action-link";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { WikiMarkdown } from "@/components/wiki/markdown";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { ConsentDialog } from "./consent-dialog";
import { ProposalFormDialog } from "./proposal-form";
import { ProposalConsentRecord, ProposalStatusPill, dayOf } from "./proposal-bits";
import {
  changeProposal,
  deleteProposal,
  proposalQuery,
  recordConsent,
  retakeSnapshot,
  useProposalsChanged,
  withdrawConsent,
  type ConsentDraft,
  type ProposalDraft,
} from "./data";

/**
 * A proposal as a card — held in a document (`::proposal{id="…"}`) or on
 * its own page — and what can be done with it: in the notes of one of its
 * circle's meetings, **Consent at this meeting** (who was there comes from
 * the notes); elsewhere, **Record consent** at a meeting chosen then; and
 * change, withdraw, propose again, withdraw consent, or delete, for those
 * who may. Each document it's about shows its snapshot — the document as
 * proposed — and whether it has changed since; a page, the alternative
 * versions put forward with it, and which the meeting consented to.
 */

/** The meeting whose notes are being shown, if they're a meeting's: proposals in them can be consented there. */
export const ProposalHostContext = createContext<{
  meeting: MeetingOption;
  circleId: string;
} | null>(null);

/** The actions a reader may take on a proposal. */
export function ProposalActions({
  proposal,
  onDeleted,
}: {
  proposal: ProposalView;
  onDeleted?: () => void;
}) {
  const host = useContext(ProposalHostContext);
  const confirm = useConfirm();
  const { toast } = useToast();
  const changed = useProposalsChanged();
  const [dialog, setDialog] = useState<"consent" | "edit" | null>(null);
  const atMeeting = host && host.circleId === proposal.circleId ? host.meeting : undefined;
  const fail = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });

  const consent = useMutation({
    mutationFn: (draft: ConsentDraft) => recordConsent(proposal.id, draft),
    onSuccess: () => {
      setDialog(null);
      toast({ title: `Consent recorded for ${proposal.circleName}` });
      changed();
    },
    onError: fail("Could not record consent"),
  });
  const edit = useMutation({
    mutationFn: (draft: ProposalDraft) => changeProposal(proposal.id, draft),
    onSuccess: () => {
      setDialog(null);
      toast({ title: "Proposal saved" });
      changed();
    },
    onError: fail("Could not save the proposal"),
  });
  const status = useMutation({
    mutationFn: (next: "proposed" | "withdrawn") => changeProposal(proposal.id, { status: next }),
    onSuccess: (_result, next) => {
      toast({
        title: next === "withdrawn" ? "Proposal withdrawn" : `Proposed to ${proposal.circleName}`,
      });
      changed();
    },
    onError: fail("Could not change that"),
  });
  const unconsent = useMutation({
    mutationFn: () => withdrawConsent(proposal.id),
    onSuccess: () => {
      toast({ title: "Consent withdrawn" });
      changed();
    },
    onError: fail("Could not withdraw consent"),
  });
  const remove = useMutation({
    mutationFn: () => deleteProposal(proposal.id),
    onSuccess: () => {
      toast({ title: "Proposal deleted" });
      changed();
      onDeleted?.();
    },
    onError: fail("Could not delete it"),
  });

  const open = proposal.status === "proposed";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" data-proposal-actions>
      {open && proposal.canConsent ? (
        atMeeting ? (
          <Button size="sm" className="gap-1.5" onClick={() => setDialog("consent")}>
            <BadgeCheck className="h-4 w-4" /> Consent at this meeting
          </Button>
        ) : (
          <ActionLink onClick={() => setDialog("consent")}>Record consent</ActionLink>
        )
      ) : null}
      {proposal.status !== "consented" && proposal.canEdit ? (
        <ActionLink onClick={() => setDialog("edit")}>Edit</ActionLink>
      ) : null}
      {open && proposal.canEdit ? (
        <ActionLink
          danger
          disabled={status.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: `Withdraw “${proposal.title}”?`,
                body: "It's no longer waiting for consent. It can be proposed again later.",
                confirmLabel: "Withdraw",
              })
            )
              status.mutate("withdrawn");
          }}
        >
          Withdraw
        </ActionLink>
      ) : null}
      {proposal.status === "withdrawn" && proposal.canEdit ? (
        <ActionLink disabled={status.isPending} onClick={() => status.mutate("proposed")}>
          Propose again
        </ActionLink>
      ) : null}
      {proposal.status === "consented" && proposal.canConsent ? (
        <ActionLink
          danger
          disabled={unconsent.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: `Withdraw the record that ${proposal.circleName} consented to “${proposal.title}”?`,
                body: "For a record made by mistake: the proposal waits for consent again.",
                confirmLabel: "Withdraw consent",
              })
            )
              unconsent.mutate();
          }}
        >
          Withdraw consent
        </ActionLink>
      ) : null}
      {proposal.status !== "consented" && proposal.canEdit ? (
        <ActionLink
          danger
          disabled={remove.isPending}
          onClick={async () => {
            if (
              await confirm({
                title: `Delete “${proposal.title}”?`,
                body: "Pages that hold it show it's gone. This can't be undone.",
                destructive: true,
              })
            )
              remove.mutate();
          }}
        >
          Delete
        </ActionLink>
      ) : null}
      {dialog === "consent" ? (
        <ConsentDialog
          proposalId={proposal.id}
          circleId={proposal.circleId}
          circleName={proposal.circleName}
          title={proposal.title}
          meeting={atMeeting}
          saving={consent.isPending}
          onSubmit={(draft) => consent.mutate(draft)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "edit" ? (
        <ProposalFormDialog
          heading="Change the proposal"
          initial={{
            circleId: proposal.circleId,
            title: proposal.title,
            body: proposal.body,
            decideOn: proposal.decideOn,
          }}
          initialDocuments={proposal.documentsShown.map(({ kind, id, title }) => ({
            kind,
            id,
            title,
          }))}
          circleName={proposal.circleName}
          submitLabel="Save"
          saving={edit.isPending}
          onSubmit={(draft) => edit.mutate(draft)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * The alternative versions of a page put forward with a proposal: each
 * opening its copy as put forward (compared with the page), which the
 * meeting consented to or set aside, and — when one has been changed since
 * — **Use the current version**.
 */
function VersionsPut({
  proposal,
  pageId,
  canRetake,
}: {
  proposal: ProposalView;
  pageId: string;
  canRetake: boolean;
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const changed = useProposalsChanged();
  const retake = useMutation({
    mutationFn: (version: ProposalVersionShown) =>
      retakeSnapshot(proposal.id, { kind: "version", id: version.perspectiveId }),
    onSuccess: (_result, version) => {
      toast({ title: `The proposal now has ${versionOf(version.author)} as it is now` });
      changed();
    },
    onError: (err: Error) =>
      toast({ title: "Could not copy it again", description: err.message, variant: "destructive" }),
  });
  const versions = proposal.versionsShown.filter((version) => version.pageId === pageId);
  if (!versions.length) return null;
  const pageChosen =
    proposal.status === "consented" &&
    proposal.consent?.chosen?.some(
      (choice) => choice.pageId === pageId && choice.perspectiveId === null
    );
  return (
    <div className="flex flex-col gap-0.5 pl-[22px] text-xs text-muted" data-versions-put>
      <span>
        {pageChosen
          ? "Consented as proposed. Versions put forward with it:"
          : "Versions put forward with it:"}
      </span>
      <ul className="flex flex-col gap-0.5">
        {versions.map((version) => (
          <li
            key={version.perspectiveId}
            className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5"
            data-version-put={version.perspectiveId}
          >
            <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <Link
              href={version.href}
              className="min-w-0 break-words font-medium text-secondary-foreground underline-offset-2 hover:underline"
            >
              {versionOf(version.author)} · {version.name}
            </Link>
            {version.chosen ? (
              <Pill tone="pine" size="xs" data-version-chosen>
                <BadgeCheck className="h-3 w-3" aria-hidden /> Consented
              </Pill>
            ) : version.setAside ? (
              <span data-version-set-aside>· set aside</span>
            ) : null}
            {version.changed && proposal.status !== "consented" ? (
              <span
                className="text-[#7a5200]"
                title="Its author has changed it since it was put forward — what's proposed is the copy"
                data-changed
              >
                · changed since
              </span>
            ) : null}
            {version.changed && canRetake ? (
              <ActionLink
                disabled={retake.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Use ${versionOf(version.author)} as it is now?`,
                      body: `The copy put forward ${dayOf(
                        version.takenAt
                      )} is replaced by one of the version as it is now.`,
                      confirmLabel: "Use the current version",
                    })
                  )
                    retake.mutate(version);
                }}
              >
                Use the current version
              </ActionLink>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The documents a proposal is about: each as it is now (linked), its
 * snapshot — the document as proposed, which is what's consented — and,
 * when it has changed since, **Use the current version** for those who may
 * change the proposal while it waits for consent; a page, the versions put
 * forward with it.
 */
export function ProposalDocuments({ proposal }: { proposal: ProposalView }) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const changed = useProposalsChanged();
  const retake = useMutation({
    mutationFn: (doc: ProposalDocument) =>
      retakeSnapshot(proposal.id, { kind: doc.kind, id: doc.id }),
    onSuccess: (_result, doc) => {
      toast({ title: `The proposal now has “${doc.title}” as it is now` });
      changed();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not take a new snapshot",
        description: err.message,
        variant: "destructive",
      }),
  });
  if (!proposal.documentsShown.length) return null;
  const canRetake = proposal.status !== "consented" && proposal.canEdit;
  return (
    <div className="flex flex-col gap-1" data-proposal-documents>
      <p className="text-xs font-semibold text-muted">About</p>
      <ul className="flex flex-col gap-1.5">
        {proposal.documentsShown.map((doc) => (
          <li
            key={`${doc.kind}:${doc.id}`}
            className="flex flex-col gap-0.5"
            data-proposal-document={doc.id}
          >
            <span className="flex items-center gap-1.5 text-sm">
              {doc.kind === "page" ? (
                <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              )}
              {doc.href ? (
                <Link
                  href={doc.href}
                  className="min-w-0 break-words font-medium text-foreground hover:underline"
                  {...(doc.kind === "file" ? { target: "_blank", rel: "noopener" } : {})}
                >
                  {doc.title}
                </Link>
              ) : (
                <span className="min-w-0 break-words text-muted">{doc.title}</span>
              )}
              {doc.missing && doc.snapshot ? (
                <span className="text-xs text-muted">· no longer in Documents</span>
              ) : doc.circleName && doc.circleName !== proposal.circleName ? (
                <span className="text-xs text-muted">· {doc.circleName}</span>
              ) : null}
            </span>
            {doc.snapshot ? (
              <span
                className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[22px] text-xs text-muted"
                data-snapshot={doc.snapshot.snapshotId}
              >
                <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <Link
                  href={doc.snapshot.href}
                  className="font-medium text-secondary-foreground underline-offset-2 hover:underline"
                  {...(doc.snapshot.href.startsWith("/api/")
                    ? { target: "_blank", rel: "noopener" }
                    : {})}
                >
                  Snapshot from {dayOf(doc.snapshot.takenAt)}
                </Link>
                {doc.changed ? (
                  <span
                    className="text-[#7a5200]"
                    title={`${
                      doc.kind === "page"
                        ? "The page has been saved"
                        : "A newer version has been added"
                    } since the snapshot was taken — ${
                      proposal.status === "consented" ? "what was consented" : "what's proposed"
                    } is the snapshot`}
                    data-changed
                  >
                    · changed since
                  </span>
                ) : null}
                {doc.changed && canRetake ? (
                  <ActionLink
                    disabled={retake.isPending}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Use “${doc.title}” as it is now?`,
                          body: `The proposal's snapshot from ${dayOf(
                            doc.snapshot!.takenAt
                          )} is replaced by a new one of the ${
                            doc.kind === "page" ? "page" : "document"
                          } as it is now.`,
                          confirmLabel: "Use the current version",
                        })
                      )
                        retake.mutate(doc);
                    }}
                  >
                    Use the current version
                  </ActionLink>
                ) : null}
              </span>
            ) : null}
            {doc.kind === "page" ? (
              <VersionsPut proposal={proposal} pageId={doc.id} canRetake={canRetake} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Who proposed it, when, and to which circle. */
export function ProposalByline({ proposal }: { proposal: ProposalView }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
      <Handshake className="h-3.5 w-3.5 text-primary" aria-hidden />
      <span>
        Proposal to <span className="font-medium text-foreground">{proposal.circleName}</span>
      </span>
      <span aria-hidden>·</span>
      <span>
        by {proposal.proposedBy.name}, {dayOf(proposal.createdAt)}
      </span>
    </p>
  );
}

/** A proposal held in a document. */
export function ProposalBlock({ proposalId }: { proposalId: string }) {
  const { data, isLoading, error } = useQuery(proposalQuery(proposalId));
  const pages = useWikiPages().data?.pages;
  if (isLoading)
    return <div className="my-2 h-28 animate-pulse rounded-xl bg-accent/40" aria-hidden />;
  const proposal = data?.proposal;
  if (error || !proposal)
    return (
      <p className="my-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted">
        This proposal is no longer available.
      </p>
    );
  const body = proposal.body.replace(PROPOSAL_DIRECTIVE, "").trim();
  return (
    <section
      className="not-prose my-2 flex flex-col gap-3 rounded-xl border border-border border-l-4 border-l-primary bg-white/80 p-4"
      data-proposal-block={proposal.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProposalByline proposal={proposal} />
        <ProposalStatusPill
          status={proposal.status}
          decideOn={proposal.decideOn}
          consentDate={proposal.consent?.meeting.date}
        />
      </div>
      <Link
        href={`/proposals/${proposal.id}`}
        className="font-display text-lg font-semibold leading-snug text-foreground hover:underline"
      >
        {proposal.title}
      </Link>
      {body ? (
        <div className="text-sm">
          <WikiMarkdown source={body} circleId={proposal.circleId} pages={pages} />
        </div>
      ) : null}
      <ProposalDocuments proposal={proposal} />
      {proposal.consent ? (
        <ProposalConsentRecord consent={proposal.consent} circleName={proposal.circleName} />
      ) : null}
      <ProposalActions proposal={proposal} />
    </section>
  );
}
