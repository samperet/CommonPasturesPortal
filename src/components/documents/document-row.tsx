"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  BookOpen,
  Download,
  Eye,
  History,
  Hourglass,
  Link2,
  Pencil,
  Sheet,
  Trash2,
  Upload,
} from "lucide-react";
import { LINK_LABELS, classifyLink } from "@/lib/documents/links";
import { spreadsheetKind } from "@/lib/documents/sheets";
import { LinkFacts, useLinkCheck } from "@/components/documents/link-dialog";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { FileIcon, checkFile, sendFile, useCircleTypes } from "@/components/documents/upload";
import {
  ACCEPTED_EXTENSIONS,
  DocumentListing,
  DocumentTypeOption,
  consentState,
  currentVersion,
  documentDate,
  formatBytes,
} from "@/lib/documents/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { ON_HOVER } from "@/components/ui/hover";
import { useConfirm } from "@/components/ui/confirm";
import { DetailsFields, type DetailsForm } from "@/components/documents/details-fields";
import { shortDate } from "@/lib/time";
import { ConsentRecord, consentSummary } from "@/components/circles/consent-record";
import { RowChoice, useChoosing } from "@/components/documents/export";
import { StarButton, useOpenNoter } from "@/components/documents/my-documents";
import { ConsentDialog } from "@/components/proposals/consent-dialog";
import { ProposalFormDialog } from "@/components/proposals/proposal-form";
import {
  changeProposal,
  createProposal,
  recordConsent,
  useProposalsChanged,
  withdrawConsent,
  type ConsentDraft,
  type ProposalDraft,
} from "@/components/proposals/data";

/**
 * One document in the list: its details, versions, consent record, and what
 * the reader may change. A link opens where it lives; a Google one can be
 * previewed in place, and its link changed (a new version); an Excel or CSV
 * file opens in CVC's spreadsheet editor (`/documents/<id>/sheet`). Its
 * **Star** keeps it in your starred list; opening it notes it as recent. On
 * the Documents page no icon leads the row (in a circle's module, its file
 * icon does), and no preview of its words — only, in a search, the passage
 * that matched.
 */

const fileUrl = (doc: DocumentListing, version?: number, download = false) =>
  `/api/documents/${doc.id}/file?${new URLSearchParams({
    ...(version ? { v: String(version) } : {}),
    ...(download ? { download: "1" } : {}),
  })}`;

function Progress({ sent, total, finishing }: { sent: number; total: number; finishing: boolean }) {
  const percent = total ? Math.round((sent / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1" role="status">
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-all",
            finishing && "animate-pulse"
          )}
          style={{ width: `${finishing ? 100 : percent}%` }}
        />
      </div>
      <p className="text-xs text-muted">
        {finishing
          ? "Processing — reading the document for search…"
          : `Uploading ${formatBytes(sent)} of ${formatBytes(total)}`}
      </p>
    </div>
  );
}

/** Wrap each search term in the text with <mark>. */
export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  return (
    <>
      {text.split(pattern).map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded bg-sun/30 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

/** "Proposed" while a proposal about it waits; "Consented" while the consented version is current; "Changed since consent" after a newer version. */
function ConsentBadge({ doc }: { doc: DocumentListing }) {
  const state = consentState(doc);
  if (doc.proposal && state !== "consented")
    return (
      <Link
        href={`/proposals/${doc.proposal.proposalId}`}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sun/30 px-2 py-0.5 font-semibold text-foreground hover:underline"
        title={`Proposed by ${doc.proposal.by.name}: ${doc.proposal.title}`}
        data-file-stage="proposed"
      >
        <Hourglass className="h-3.5 w-3.5" aria-hidden /> Proposed
      </Link>
    );
  if (!state || !doc.consent) return null;
  if (state === "consented") {
    return (
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pine/10 px-2 py-0.5 font-semibold text-pine"
        title={consentSummary(doc.consent)}
      >
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Consented
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sun/15 px-2 py-0.5 font-medium text-[#7a5200]"
      title={`${consentSummary(
        doc.consent,
        `Version ${doc.consent.version} consented`
      )}; the current version hasn't been`}
    >
      {/* Short on phones, where the row is narrow; the tooltip says the rest. */}
      <span className="sm:hidden">Changed</span>
      <span className="hidden sm:inline">Changed since consent</span>
    </span>
  );
}

export function DocumentRow({
  doc,
  terms,
  showCircle,
  compact = false,
}: {
  doc: DocumentListing;
  terms: string[];
  showCircle: boolean;
  /** Just the icon and title (and the actions, on hover): a circle's Documents module. */
  compact?: boolean;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const noteOpened = useOpenNoter();
  // Lines under the title line up with it after the icon (a circle's module) or the export tick box.
  const choosing = useChoosing();
  const indented = compact || choosing;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const replaceInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"view" | "edit" | "history">("view");
  const [form, setForm] = useState<DetailsForm>({
    title: doc.title,
    type: doc.type,
    meetingDate: doc.meetingDate ?? "",
    description: doc.description ?? "",
  });
  const [replacing, setReplacing] = useState<{
    file: File;
    sent: number;
    finishing: boolean;
  } | null>(null);
  const version = currentVersion(doc);
  const link = version.link ? classifyLink(version.link.url) : null;
  /** An Excel or CSV file opens in CVC's spreadsheet editor. */
  const sheetHref =
    !version.link && spreadsheetKind(version.fileName) ? `/documents/${doc.id}/sheet` : null;
  const [previewing, setPreviewing] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const newLinkCheck = useLinkCheck(newLink ?? "");
  const consent = consentState(doc);
  const [consenting, setConsenting] = useState(false);
  const [proposing, setProposing] = useState(false);
  const proposalsChanged = useProposalsChanged();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["documents"] });
  const circleTypes = useCircleTypes(doc.circleId).data?.types ?? [];
  const editTypes = circleTypes.some((type) => type.id === doc.type)
    ? circleTypes
    : [{ id: doc.type, label: doc.typeLabel }, ...circleTypes];

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          type: form.type,
          meetingDate: form.meetingDate || null,
          description: form.description || null,
        }),
      }),
    onSuccess: () => {
      setMode("view");
      refresh();
    },
    onError: (err: Error) =>
      toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  // Its text becomes a written page (the file stays as it is).
  const toPage = useMutation({
    mutationFn: () =>
      apiFetch<{ page: { slug: string } | null }>(`/api/documents/${doc.id}/page`, {
        method: "POST",
      }),
    onSuccess: ({ page }) => {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      refresh();
      if (page) router.push(`/wiki/${page.slug}`);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not make a page",
        description: err.message,
        variant: "destructive",
      }),
  });

  // Consent comes through a proposal, at a meeting: the open one about this document, or one made for it there and then.
  const markConsented = useMutation({
    mutationFn: (draft: ConsentDraft) =>
      doc.proposal
        ? recordConsent(doc.proposal.proposalId, draft)
        : createProposal({
            circleId: doc.circleId,
            title: doc.title,
            body: "",
            documents: [{ kind: "file", id: doc.id }],
            decideOn: null,
            consent: draft,
          }),
    onSuccess: () => {
      setConsenting(false);
      toast({ title: "Consent recorded" });
      proposalsChanged();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not record consent",
        description: err.message,
        variant: "destructive",
      }),
  });
  const propose = useMutation({
    mutationFn: (draft: ProposalDraft) => createProposal(draft),
    onSuccess: ({ proposal }) => {
      setProposing(false);
      toast({ title: `Proposed to ${proposal.circleName}` });
      proposalsChanged();
    },
    onError: (err: Error) =>
      toast({ title: "Could not propose it", description: err.message, variant: "destructive" }),
  });
  const withdrawProposal = useMutation({
    mutationFn: () => changeProposal(doc.proposal!.proposalId, { status: "withdrawn" }),
    onSuccess: () => {
      toast({ title: "Proposal withdrawn" });
      proposalsChanged();
    },
    onError: (err: Error) =>
      toast({ title: "Could not withdraw it", description: err.message, variant: "destructive" }),
  });
  // Consent from a proposal is withdrawn there; a record from before proposals, on the document.
  const withdraw = useMutation({
    mutationFn: () =>
      doc.consent?.proposalId
        ? withdrawConsent(doc.consent.proposalId)
        : apiFetch(`/api/documents/${doc.id}/consent`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Consent withdrawn" });
      proposalsChanged();
      refresh();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not withdraw consent",
        description: err.message,
        variant: "destructive",
      }),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Document deleted" });
      refresh();
    },
    onError: (err: Error) =>
      toast({ title: "Could not delete", description: err.message, variant: "destructive" }),
  });

  const replace = useMutation({
    mutationFn: async (file: File) => {
      setReplacing({ file, sent: 0, finishing: false });
      const token = await sendFile(file, { circleId: doc.circleId, replaces: doc.id }, (sent) =>
        setReplacing({ file, sent, finishing: false })
      );
      setReplacing({ file, sent: file.size, finishing: true });
      return apiFetch("/api/documents", { method: "POST", body: JSON.stringify({ token }) });
    },
    onSuccess: () => {
      toast({
        title: "New version uploaded",
        description: "Earlier versions are kept in the history.",
      });
      refresh();
    },
    onError: (err: Error) =>
      toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
    onSettled: () => setReplacing(null),
  });

  const changeLink = useMutation({
    mutationFn: (url: string) =>
      apiFetch("/api/documents/links", {
        method: "POST",
        body: JSON.stringify({ url, replaces: doc.id }),
      }),
    onSuccess: () => {
      setNewLink(null);
      toast({ title: "Link changed", description: "The earlier link is kept in the history." });
      refresh();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not change the link",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (mode === "edit") {
    return (
      <li className="flex flex-col gap-3 py-4">
        <DetailsFields form={form} onChange={setForm} types={editTypes} />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.title.trim()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("view")}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  const action =
    "inline-flex h-7 min-w-[1.75rem] items-center justify-center gap-0.5 rounded-md px-1 text-muted transition hover:bg-accent hover:text-foreground disabled:opacity-50";
  const actions = (
    <div
      className={cn(
        "ml-auto flex shrink-0 items-center",
        mode === "view" &&
          !replacing &&
          !consenting &&
          !proposing &&
          !previewing &&
          newLink === null &&
          ON_HOVER
      )}
    >
      <StarButton doc={{ kind: "file", id: doc.id }} title={doc.title} compact className={action} />
      {sheetHref ? (
        <Link
          href={sheetHref}
          className={action}
          aria-label={`Open ${doc.title} as a spreadsheet`}
          title="Open spreadsheet"
          data-open-sheet
        >
          <Sheet className="h-4 w-4" />
        </Link>
      ) : null}
      {link?.previewUrl ? (
        <button
          type="button"
          onClick={() => setPreviewing((open) => !open)}
          className={cn(action, previewing && "bg-accent text-foreground")}
          aria-label={`Preview ${doc.title}`}
          aria-expanded={previewing}
          title="Preview here"
        >
          <Eye className="h-4 w-4" />
        </button>
      ) : version.link ? null : (
        <a
          href={fileUrl(doc, undefined, true)}
          className={action}
          aria-label={`Download ${doc.title}`}
          title="Download"
        >
          <Download className="h-4 w-4" />
        </a>
      )}
      {doc.versions.length > 1 ? (
        <button
          type="button"
          onClick={() => setMode(mode === "history" ? "view" : "history")}
          className={cn(action, mode === "history" && "bg-accent text-foreground")}
          aria-label={`${doc.versions.length} versions`}
          aria-expanded={mode === "history"}
          title={`${doc.versions.length} versions`}
        >
          <History className="h-4 w-4" />
          <span className="text-xs tabular-nums">{doc.versions.length}</span>
        </button>
      ) : null}
      {doc.canConsent ? (
        consent === "consented" ? (
          <button
            type="button"
            onClick={async () => {
              if (
                await confirm({
                  title: `Withdraw the record that ${
                    doc.circleName || "the circle"
                  } consented to “${doc.title}”?`,
                  confirmLabel: "Withdraw",
                })
              )
                withdraw.mutate();
            }}
            disabled={withdraw.isPending}
            className={cn(action, "text-pine")}
            aria-label="Withdraw consent"
            title="Withdraw consent"
          >
            <BadgeCheck className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConsenting((open) => !open)}
            className={cn(action, consenting && "bg-accent text-foreground")}
            aria-label="Record consent"
            aria-expanded={consenting}
            title={consent === "changed" ? "Record consent to this version" : "Record consent"}
          >
            <BadgeCheck className="h-4 w-4" />
          </button>
        )
      ) : null}
      {doc.canWritePage && consent !== "consented" ? (
        doc.proposal ? (
          <button
            type="button"
            onClick={async () => {
              if (
                await confirm({
                  title: `Withdraw the proposal “${doc.proposal!.title}”?`,
                  body: "It's no longer waiting for consent. It can be proposed again later.",
                  confirmLabel: "Withdraw",
                })
              )
                withdrawProposal.mutate();
            }}
            disabled={withdrawProposal.isPending}
            className={cn(action, "text-[#7a5200]")}
            aria-label="Withdraw the proposal"
            title="Withdraw the proposal"
          >
            <Hourglass className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setProposing(true)}
            className={cn(action, proposing && "bg-accent text-foreground")}
            aria-label="Propose for consent"
            title="Propose for consent"
          >
            <Hourglass className="h-4 w-4" />
          </button>
        )
      ) : null}
      {doc.canWritePage &&
      version.textChars > 0 &&
      (!version.link || version.link.kind === "google-doc") ? (
        <button
          type="button"
          onClick={async () => {
            if (
              await confirm({
                title: `Turn “${doc.title}” into a page?`,
                body: `Its text becomes a page anyone in ${
                  doc.circleName || "the circle"
                } can keep improving. The ${
                  version.link
                    ? "Google Doc stays as it is, linked from the page."
                    : "file is kept as it is, as the page's original, linked from it."
                }`,
                confirmLabel: "Make the page",
              })
            )
              toPage.mutate();
          }}
          disabled={toPage.isPending}
          className={action}
          aria-label="Turn into a page"
          title="Turn into a page"
        >
          <BookOpen className="h-4 w-4" />
        </button>
      ) : null}
      {doc.canManage ? (
        <>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={action}
            aria-label="Edit details"
            title="Edit details"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <input
            ref={replaceInput}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const problem = checkFile(file);
              if (problem)
                toast({
                  title: "Can't upload that file",
                  description: problem,
                  variant: "destructive",
                });
              else replace.mutate(file);
            }}
          />
          {version.link ? (
            <button
              type="button"
              onClick={() => setNewLink((open) => (open === null ? version.link!.url : null))}
              className={cn(action, newLink !== null && "bg-accent text-foreground")}
              aria-label="Change the link"
              aria-expanded={newLink !== null}
              title="Change the link"
            >
              <Link2 className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => replaceInput.current?.click()}
              disabled={replace.isPending}
              className={action}
              aria-label="Upload a new version"
              title="Upload a new version"
            >
              <Upload className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              if (
                await confirm({
                  title: `Delete “${doc.title}” and all ${
                    doc.versions.length > 1 ? `${doc.versions.length} versions` : "of it"
                  }?`,
                  destructive: true,
                })
              )
                remove.mutate();
            }}
            disabled={remove.isPending}
            className={cn(action, "hover:bg-destructive/10 hover:text-destructive")}
            aria-label={`Delete ${doc.title}`}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      ) : null}
    </div>
  );
  return (
    <li className={cn("group/post flex flex-col gap-1", compact ? "py-2" : "py-2.5")}>
      {/* The title on its own line, never cut off; its details and actions on the line below
          (in a circle's module, just the title, with the actions beside it). */}
      <div className="flex items-start gap-3">
        <RowChoice
          item={{ kind: "file", id: doc.id }}
          title={doc.title}
          icon={
            // The Documents page's list goes without icons; a circle's module keeps them.
            compact ? (
              <FileIcon
                contentType={version.contentType}
                link={version.link?.kind}
                className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              />
            ) : null
          }
        />
        {sheetHref ? (
          <Link
            href={sheetHref}
            className="min-w-0 break-words font-medium text-foreground underline-offset-4 hover:underline"
          >
            <Highlighted text={doc.title} terms={terms} />
          </Link>
        ) : (
          <a
            href={version.link?.url ?? fileUrl(doc)}
            target={version.viewable ? "_blank" : undefined}
            rel="noopener noreferrer"
            onClick={() => noteOpened({ kind: "file", id: doc.id })}
            className="min-w-0 break-words font-medium text-foreground underline-offset-4 hover:underline"
          >
            <Highlighted text={doc.title} terms={terms} />
          </a>
        )}
        {compact ? actions : null}
      </div>
      {compact ? null : (
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", indented && "pl-8")}>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
              {doc.typeLabel}
            </span>
            {version.link ? (
              <span className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 font-medium">
                {LINK_LABELS[version.link.kind]}
              </span>
            ) : null}
            <ConsentBadge doc={doc} />
            {showCircle ? (
              <Link
                href={`/circles/${doc.circleId}#documents`}
                className="font-medium hover:text-foreground hover:underline"
              >
                {doc.circleName}
              </Link>
            ) : null}
            <span className="whitespace-nowrap">
              {doc.meetingDate
                ? `Meeting ${shortDate(doc.meetingDate, true)}`
                : shortDate(documentDate(doc), true)}
            </span>
            <span>by {version.uploadedBy.name}</span>
          </p>
          {actions}
        </div>
      )}

      {doc.consent && !compact ? (
        <ConsentRecord
          consent={doc.consent}
          what={consent === "changed" ? `Version ${doc.consent.version} consented` : "Consented"}
          className={cn(indented && "pl-8")}
        />
      ) : null}
      {consenting ? (
        <ConsentDialog
          proposalId={doc.proposal?.proposalId}
          circleId={doc.proposal?.circleId ?? doc.circleId}
          circleName={doc.circleName || "The circle"}
          title={doc.proposal?.title ?? doc.title}
          saving={markConsented.isPending}
          onSubmit={(draft) => markConsented.mutate(draft)}
          onClose={() => setConsenting(false)}
        />
      ) : null}
      {proposing ? (
        <ProposalFormDialog
          heading="Propose for consent"
          initial={{ circleId: doc.circleId, title: doc.title, body: "", decideOn: null }}
          initialDocuments={[{ kind: "file", id: doc.id, title: doc.title }]}
          circleName={doc.circleName || "The circle"}
          submitLabel="Propose"
          saving={propose.isPending}
          onSubmit={(draft) => propose.mutate(draft)}
          onClose={() => setProposing(false)}
        />
      ) : null}
      {doc.description && !compact ? (
        <p
          className={cn("truncate text-sm text-foreground-light", indented && "pl-8")}
          title={doc.description}
        >
          <Highlighted text={doc.description} terms={terms} />
        </p>
      ) : null}
      {doc.snippet && !compact ? (
        <p
          className={cn(
            "rounded-md bg-accent/60 px-2 py-1 text-sm text-foreground-light",
            indented && "ml-8"
          )}
        >
          <Highlighted text={doc.snippet} terms={terms} />
        </p>
      ) : null}

      {newLink !== null ? (
        <form
          className={cn(
            "flex flex-col gap-2 rounded-lg border border-border bg-white p-3",
            indented && "ml-8"
          )}
          onSubmit={(event) => {
            event.preventDefault();
            changeLink.mutate(newLink.trim());
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            New link
            <Input
              type="url"
              value={newLink}
              onChange={(event) => setNewLink(event.target.value)}
              className="bg-white"
              autoFocus
            />
          </label>
          {newLinkCheck.data ? <LinkFacts check={newLinkCheck.data} /> : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              type="submit"
              disabled={
                changeLink.isPending ||
                !classifyLink(newLink) ||
                newLink.trim() === version.link?.url
              }
            >
              {changeLink.isPending ? "Saving…" : "Save as a new version"}
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={() => setNewLink(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {previewing && link?.previewUrl ? (
        <div className={cn("flex flex-col gap-1", indented && "ml-8")}>
          <iframe
            src={link.previewUrl}
            title={`Preview of ${doc.title}`}
            className="h-[70vh] max-h-[640px] w-full rounded-lg border border-border bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            referrerPolicy="no-referrer"
          />
          <p className="text-xs text-muted">
            Blank or asking you to sign in? It isn&apos;t shared with anyone who has the link —{" "}
            <a
              href={version.link!.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              open it in Google
            </a>{" "}
            instead.
          </p>
        </div>
      ) : null}
      {replacing ? (
        <div className={cn(indented && "pl-8")}>
          <Progress
            sent={replacing.sent}
            total={replacing.file.size}
            finishing={replacing.finishing}
          />
        </div>
      ) : null}

      {mode === "history" ? (
        <ol
          className={cn(
            "flex flex-col divide-y divide-border rounded-lg border border-border text-xs",
            indented && "ml-8"
          )}
        >
          {[...doc.versions].reverse().map((entry) => (
            <li
              key={entry.number}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span className="text-foreground-light">
                <strong className="text-foreground">Version {entry.number}</strong>
                {entry.number === version.number ? " (current)" : ""} · {entry.fileName} ·{" "}
                {shortDate(entry.uploadedAt, true)}
                {doc.consent?.version === entry.number ? (
                  <span className="font-medium text-pine">
                    {" "}
                    · consented {shortDate(doc.consent.date, true)}
                  </span>
                ) : null}
              </span>
              {entry.link ? (
                <a
                  href={entry.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-accent hover:text-foreground"
                  aria-label={`Open version ${entry.number}`}
                  title="Open"
                >
                  <Link2 className="h-4 w-4" />
                </a>
              ) : (
                <a
                  href={fileUrl(doc, entry.number, true)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-accent hover:text-foreground"
                  aria-label={`Download version ${entry.number}`}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

/** A circle's own list of document types: rename, reorder, add, or remove. */
