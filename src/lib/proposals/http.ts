import { tellFollowers } from "@/lib/wiki/follows";
import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { problem } from "@/lib/http";
import { occurrences } from "@/lib/search";
import type { Actor } from "@/lib/auth/actor";
import type { CommunityUser } from "@/lib/auth/users";
import { userIdsForPeople } from "@/lib/auth/users";
import { notify, excerpt } from "@/lib/push/notify";
import { isCommunity } from "@/lib/circles/ids";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { NamedPerson } from "@/lib/people";
import {
  createPage,
  readPages,
  setPageDecisions,
  updatePage,
  type WikiPage,
} from "@/lib/wiki/store";
import { canEditPage } from "@/lib/wiki/access";
import { wikiProblem } from "@/lib/wiki/http";
import { mergeText } from "@/lib/wiki/merge";
import { listPerspectives, setOutcome } from "@/lib/wiki/perspectives";
import { isLive, versionOf, type Perspective } from "@/lib/wiki/perspectives-shared";
import { listDocuments, setDocumentDecisions } from "@/lib/documents/store";
import { currentVersion, type DocumentRecord } from "@/lib/documents/types";
import { shortDate, todayInVermont } from "@/lib/time";
import { canConsentProposal, canEditProposal } from "./access";
import { fileMirror, pageMirror } from "./mirror";
import {
  addSnapshots,
  consentToProposal,
  listProposals,
  replaceSnapshots,
  replaceVersions,
  type Failure,
  type VersionRef,
} from "./store";
import {
  discardSnapshots,
  discardVersionSnapshots,
  readSnapshotContent,
  takeSnapshots,
  takeVersionSnapshot,
} from "./snapshots";
import {
  chosenFor,
  markMembers,
  meetingDateOf,
  proposalIdsIn,
  sameDocument,
  snapshotOf,
  type DocumentRef,
  type DocumentSnapshot,
  type MeetingOption,
  type MeetingRef,
  type Proposal,
  type ProposalDocument,
  type ProposalListing,
  type ProposalVersion,
  type ProposalVersionShown,
  type ProposalView,
  type VersionChoice,
} from "./shared";

/**
 * The proposals routes' helpers: who's asking, what a proposal looks like
 * to them (its documents named, with their snapshots and the versions put
 * forward; the pages that hold it; what they may do), taking its documents'
 * snapshots and copying its versions, the meetings it could be consented
 * at, recording consent (a chosen version made the page first), keeping
 * the documents it's about up to date with where it stands, and telling
 * people about it.
 */

export type ProposalSession = { user: CommunityUser; actor: Actor; directory: DirectoryDocument };

export async function proposalSession(): Promise<{ error: NextResponse } | ProposalSession> {
  const ctx = await circleContext();
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  return { user: ctx.user, actor: ctx.actor, directory: ctx.directory };
}

/** How well a proposal matches search terms (every term in its title or text): 0 if it doesn't. */
export function proposalScore(proposal: Proposal, terms: string[]) {
  const title = proposal.title.toLowerCase();
  const body = proposal.body.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const inTitle = occurrences(title, term);
    const inBody = occurrences(body, term);
    if (!inTitle && !inBody) return 0;
    score += inTitle * 20 + Math.min(inBody, 20);
  }
  return score;
}

export function proposalProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That proposal no longer exists", 404);
    case "full":
      return problem("There are as many proposals as can be kept", 409);
    case "not_open":
      return problem("That proposal isn't waiting for consent", 409);
    case "consented":
      return problem("A consented proposal can't be changed — make a new proposal instead", 409);
    case "not_attached":
      return problem("That document isn't one the proposal is about", 409);
  }
}

export const circleNameOf = (directory: DirectoryDocument, circleId: string) =>
  directory.circles.find((circle) => circle.id === circleId)?.name ?? "A circle";

/** The residents in a circle's seats (everyone, for Community). */
export function memberIdsOf(
  directory: DirectoryDocument,
  circleId: string
): Set<string> | "everyone" {
  if (isCommunity(circleId)) return "everyone";
  return new Set(
    directory.circles
      .find((circle) => circle.id === circleId)
      ?.seats.map((seat) => seat.personId)
      .filter((id): id is string => !!id) ?? []
  );
}

/** The version of a document now (a page's last save, a file's version number); null if it's gone. */
function versionNow(ref: DocumentRef, pages: WikiPage[], documents: DocumentRecord[]) {
  if (ref.kind === "page") return pages.find((page) => page.id === ref.id)?.updatedAt ?? null;
  const doc = documents.find((entry) => entry.id === ref.id);
  return doc ? String(currentVersion(doc).number) : null;
}

/** Whether a document has changed since the proposal's snapshot of it was taken (false without one, or once it's gone). */
export function changedSinceSnapshot(
  proposal: Proposal,
  ref: DocumentRef,
  pages: WikiPage[],
  documents: DocumentRecord[]
) {
  const snapshot = snapshotOf(proposal, ref);
  const now = versionNow(ref, pages, documents);
  return !!snapshot && now !== null && now !== snapshot.version;
}

/** Where a snapshot opens: a page's or a link's on its own page, a file's as the file. */
export const snapshotHref = (proposalId: string, snapshot: DocumentSnapshot) =>
  snapshot.kind === "file" && !snapshot.file?.link
    ? `/api/proposals/${proposalId}/snapshots/${snapshot.snapshotId}/file`
    : `/proposals/${proposalId}/snapshots/${snapshot.snapshotId}`;

/**
 * Whether a document has changed since what the proposal holds of it: the
 * version consented to, once it's consented (a page a chosen version was
 * made); otherwise its snapshot.
 */
function changedSinceProposal(
  proposal: Proposal,
  ref: DocumentRef,
  pages: WikiPage[],
  documents: DocumentRecord[]
) {
  const consented = proposal.consent?.documents.find((entry) => sameDocument(entry, ref));
  if (!consented || !snapshotOf(proposal, ref))
    return changedSinceSnapshot(proposal, ref, pages, documents);
  const now = versionNow(ref, pages, documents);
  return now !== null && now !== consented.version;
}

/** One of a proposal's documents as the reader sees it: as it is now, and its snapshot. */
export function documentShown(
  proposal: Proposal,
  ref: DocumentRef,
  ctx: ProposalSession,
  pages: WikiPage[],
  documents: DocumentRecord[]
): ProposalDocument {
  const { directory } = ctx;
  const kept = snapshotOf(proposal, ref);
  const snapshot = kept
    ? {
        snapshotId: kept.snapshotId,
        title: kept.title,
        takenAt: kept.takenAt,
        href: snapshotHref(proposal.id, kept),
      }
    : null;
  const changed = changedSinceProposal(proposal, ref, pages, documents);
  const { kind, id } = ref;
  if (kind === "page") {
    const page = pages.find((entry) => entry.id === id);
    if (page)
      return {
        kind,
        id,
        title: page.title,
        href: `/wiki/${page.slug}`,
        circleName: circleNameOf(directory, page.keeper),
        missing: false,
        snapshot,
        changed,
      };
    // A page that's gone is still there, as it was, in its snapshot.
    return snapshot
      ? {
          kind,
          id,
          title: kept!.title,
          href: null,
          circleName: "",
          missing: true,
          snapshot,
          changed,
        }
      : {
          kind,
          id,
          title: "A page that's gone",
          href: null,
          circleName: "",
          missing: true,
          snapshot: null,
          changed: false,
        };
  }
  const doc = documents.find((entry) => entry.id === id);
  if (doc)
    return {
      kind,
      id,
      title: doc.title,
      href: `/api/documents/${doc.id}/file`,
      circleName: circleNameOf(directory, doc.circleId),
      missing: false,
      snapshot,
      changed,
    };
  return {
    kind,
    id,
    title: snapshot ? kept!.title : "A document that's gone",
    href: null,
    circleName: "",
    missing: true,
    snapshot,
    changed,
  };
}

/** The alternative versions of the pages a proposal puts versions forward for, by page. */
export async function perspectivesOf(proposal: Pick<Proposal, "versions">) {
  const pageIds = Array.from(new Set((proposal.versions ?? []).map((version) => version.pageId)));
  const lists = await Promise.all(pageIds.map((pageId) => listPerspectives(pageId)));
  return new Map(pageIds.map((pageId, index) => [pageId, lists[index]]));
}

/** A version put forward as it's shown: where to see it (as put forward, and now), and what became of it. */
export function versionShown(
  proposal: Proposal,
  version: ProposalVersion,
  _pages: WikiPage[],
  perspectives: Map<string, Perspective[]>
): ProposalVersionShown {
  const live = perspectives
    .get(version.pageId)
    ?.find((perspective) => perspective.id === version.perspectiveId);
  const chosen = proposal.status === "consented" ? chosenFor(proposal, version.pageId) : undefined;
  return {
    ...version,
    href: `/proposals/${proposal.id}/snapshots/${version.snapshotId}`,
    // Versions can't be opened any more (the feature is gone); their snapshots still can.
    liveHref: null,
    changed: !!live && live.updatedAt !== version.version,
    chosen: chosen === version.perspectiveId,
    setAside: chosen !== undefined && chosen !== version.perspectiveId,
  };
}

/** A proposal as the reader sees it: its documents as they are now, and what they may do with it. */
export function viewOf(
  proposal: Proposal,
  ctx: ProposalSession,
  pages: WikiPage[],
  documents: DocumentRecord[],
  perspectives: Map<string, Perspective[]> = new Map()
): ProposalView {
  const { user, directory } = ctx;
  return {
    ...proposal,
    circleName: circleNameOf(directory, proposal.circleId),
    documentsShown: proposal.documents.map((ref) =>
      documentShown(proposal, ref, ctx, pages, documents)
    ),
    versionsShown: (proposal.versions ?? []).map((version) =>
      versionShown(proposal, version, pages, perspectives)
    ),
    appearsIn: pages
      .filter((page) => proposalIdsIn(page.body).includes(proposal.id))
      .map((page) => ({ slug: page.slug, title: page.title })),
    canEdit: canEditProposal(user, directory, proposal),
    canConsent: canConsentProposal(user, directory, proposal),
  };
}

/** A proposal as the reader sees it, with everything it shows read afresh. */
export async function shownProposal(proposal: Proposal, ctx: ProposalSession) {
  const [pages, documents, perspectives] = await Promise.all([
    readPages(),
    listDocuments(),
    perspectivesOf(proposal),
  ]);
  return viewOf(proposal, ctx, pages, documents, perspectives);
}

/** A proposal in a list. */
export function listingOf(
  proposal: Proposal,
  directory: DirectoryDocument,
  snippet?: string | null
): ProposalListing {
  const flat = proposal.body
    .replace(/::proposal\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    kind: "proposal",
    id: proposal.id,
    circleId: proposal.circleId,
    circleName: circleNameOf(directory, proposal.circleId),
    title: proposal.title,
    status: proposal.status,
    decideOn: proposal.decideOn,
    proposedBy: proposal.proposedBy.name,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    consent: proposal.consent
      ? { date: proposal.consent.meeting.date, meeting: proposal.consent.meeting }
      : null,
    documentCount: proposal.documents.length,
    excerpt: flat.length > 220 ? `${flat.slice(0, 219)}…` : flat,
    ...(snippet !== undefined ? { snippet } : {}),
  };
}

/** Bring the pages and files these refer to up to date with where their proposals stand. */
export async function syncDocuments(refs: DocumentRef[]) {
  if (!refs.length) return;
  const proposals = await listProposals();
  const pageIds = refs.filter((ref) => ref.kind === "page").map((ref) => ref.id);
  const fileIds = refs.filter((ref) => ref.kind === "file").map((ref) => ref.id);
  if (pageIds.length) await setPageDecisions(pageIds, (page) => pageMirror(page, proposals));
  if (fileIds.length) await setDocumentDecisions(fileIds, (doc) => fileMirror(doc, proposals));
}

/** The meetings of a circle a proposal could be consented at: its notes and minutes with a date, the latest first. */
export function meetingsOf(
  circleId: string,
  ctx: ProposalSession,
  pages: WikiPage[],
  documents: DocumentRecord[]
): MeetingOption[] {
  const today = todayInVermont();
  const fromPages: MeetingOption[] = pages
    .filter((page) => page.keeper === circleId)
    .flatMap((page) => {
      const date = meetingDateOf(page);
      return date && date <= today
        ? [
            {
              kind: "page" as const,
              id: page.id,
              title: page.title,
              date,
              present: page.present ?? [],
              href: `/wiki/${page.slug}`,
            },
          ]
        : [];
    });
  const fromFiles: MeetingOption[] = documents
    .filter((doc) => doc.circleId === circleId && doc.meetingDate && doc.meetingDate <= today)
    .map((doc) => ({
      kind: "file" as const,
      id: doc.id,
      title: doc.title,
      date: doc.meetingDate!,
      present: [],
      href: `/api/documents/${doc.id}/file`,
    }));
  return [...fromPages, ...fromFiles]
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
    .slice(0, 40);
}

export type MeetingChoice = { kind: "page" | "file"; id: string } | { kind: "new"; date: string };

/**
 * The meeting a consent names: notes or minutes kept by the proposal's
 * circle, dated today or before — or, for a meeting with no notes yet, new
 * notes started for it (named for the circle and the day, with who was
 * there). Who was there comes from the notes when they say; otherwise from
 * `present`, which is then saved to the notes too (when the recorder can
 * edit them).
 */
export async function resolveMeeting(
  choice: MeetingChoice,
  circleId: string,
  present: NamedPerson[] | undefined,
  ctx: ProposalSession
): Promise<{ meeting: MeetingRef; present: NamedPerson[]; notes?: WikiPage } | { error: string }> {
  const today = todayInVermont();
  const circleName = circleNameOf(ctx.directory, circleId);
  if (choice.kind === "new") {
    if (choice.date > today) return { error: "The meeting can't be in the future" };
    if (!present?.length) return { error: "Say who was at the meeting" };
    const title = `${circleName} meeting, ${shortDate(choice.date, true)}`;
    const existing = (await readPages()).find(
      (page) => page.title.toLowerCase() === title.toLowerCase()
    );
    const page = existing
      ? existing
      : await createPage(
          { userId: ctx.actor.userId, name: ctx.actor.name },
          { title, body: "", keeper: circleId, meetingDate: choice.date, present }
        ).then((result) => (result.ok ? result.page : null));
    if (!page) return { error: "The meeting's notes couldn't be started" };
    if (page.keeper !== circleId)
      return { error: `“${title}” isn't ${circleName}'s — choose its notes instead` };
    return {
      meeting: {
        kind: "page",
        id: page.id,
        title: page.title,
        date: meetingDateOf(page) ?? choice.date,
        circleId: page.keeper,
        href: `/wiki/${page.slug}`,
      },
      present: page.present?.length ? page.present : present,
      notes: page,
    };
  }
  if (choice.kind === "page") {
    const page = (await readPages()).find((entry) => entry.id === choice.id);
    if (!page) return { error: "Those meeting notes no longer exist" };
    if (page.keeper !== circleId)
      return { error: `Choose a meeting of ${circleName} — the circle the proposal is to` };
    const date = meetingDateOf(page);
    if (!date) return { error: "Those notes aren't a meeting's — give them a meeting date first" };
    if (date > today) return { error: "That meeting hasn't happened yet" };
    const people = page.present?.length ? page.present : present;
    if (!people?.length) return { error: "Say who was at the meeting" };
    return {
      meeting: {
        kind: "page",
        id: page.id,
        title: page.title,
        date,
        circleId: page.keeper,
        href: `/wiki/${page.slug}`,
      },
      present: people,
      notes: page,
    };
  }
  const doc = (await listDocuments()).find((entry) => entry.id === choice.id);
  if (!doc) return { error: "Those minutes no longer exist" };
  if (doc.circleId !== circleId)
    return { error: `Choose a meeting of ${circleName} — the circle the proposal is to` };
  if (!doc.meetingDate) return { error: "Those minutes don't say when the meeting was" };
  if (doc.meetingDate > today) return { error: "That meeting hasn't happened yet" };
  if (!present?.length) return { error: "Say who was at the meeting" };
  return {
    meeting: {
      kind: "file",
      id: doc.id,
      title: doc.title,
      date: doc.meetingDate,
      circleId: doc.circleId,
      href: `/api/documents/${doc.id}/file`,
    },
    present,
  };
}

/** Who was at the meeting, saved to its notes when they didn't say (and the recorder can edit them). */
export async function savePresent(
  meeting: { present: NamedPerson[]; notes?: WikiPage },
  ctx: ProposalSession
) {
  const notes = meeting.notes;
  if (!notes || notes.present?.length || !meeting.present.length) return;
  if (!canEditPage(ctx.user, ctx.directory, notes)) return;
  await updatePage(notes.slug, ctx.actor, { present: meeting.present });
}

/** Check the documents a proposal is about exist. */
export async function checkDocuments(refs: DocumentRef[], ctx: ProposalSession) {
  if (!refs.length) return null;
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  const missing = refs.some((ref) =>
    ref.kind === "page"
      ? !pages.some((page) => page.id === ref.id)
      : !documents.some((doc) => doc.id === ref.id)
  );
  return missing ? problem("One of those documents no longer exists", 404) : null;
}

/**
 * The versions of its documents a proposal is consented at: each one's
 * snapshot's — what was proposed — or, for one that has none (it couldn't
 * be copied), its version now; for a page a chosen version was made, that
 * save (`made`, by page).
 */
export function consentedVersions(
  proposal: Proposal,
  pages: WikiPage[],
  documents: DocumentRecord[],
  made: Map<string, string> = new Map()
): (DocumentRef & { version: string })[] {
  return proposal.documents.flatMap(({ kind, id }) => {
    const version =
      (kind === "page" ? made.get(id) : undefined) ??
      snapshotOf(proposal, { kind, id })?.version ??
      versionNow({ kind, id }, pages, documents);
    return version ? [{ kind, id, version }] : [];
  });
}

/**
 * Copy the alternative versions to put forward with a proposal (those it
 * already holds keep their copies): each must still be being worked on.
 * The copies just taken come back too, to discard if the proposal isn't
 * saved.
 */
export async function prepareVersions(
  refs: VersionRef[],
  held: ProposalVersion[],
  actor: Actor
): Promise<{ versions: ProposalVersion[]; taken: ProposalVersion[] } | { error: NextResponse }> {
  const wanted = refs.filter(
    (ref, index) =>
      refs.findIndex(
        (other) => other.perspectiveId.toLowerCase() === ref.perspectiveId.toLowerCase()
      ) === index
  );
  const pages = await readPages();
  const versions: ProposalVersion[] = [];
  const taken: ProposalVersion[] = [];
  const fail = async (response: NextResponse) => {
    await discardVersionSnapshots(taken);
    return { error: response };
  };
  for (const ref of wanted) {
    const pageId = ref.pageId.toLowerCase();
    const perspectiveId = ref.perspectiveId.toLowerCase();
    const kept = held.find(
      (version) => version.perspectiveId === perspectiveId && version.pageId === pageId
    );
    if (kept) {
      versions.push(kept);
      continue;
    }
    const page = pages.find((entry) => entry.id === pageId);
    if (!page) return fail(problem("One of those pages no longer exists", 404));
    const perspective = (await listPerspectives(page.id)).find(
      (entry) => entry.id === perspectiveId
    );
    if (!perspective) return fail(problem("One of those versions no longer exists", 404));
    if (!isLive(perspective))
      return fail(
        problem(
          `${versionOf(perspective.createdBy)} of “${page.title}” is no longer being worked on`,
          409
        )
      );
    const copy = await takeVersionSnapshot(perspective, page, actor);
    taken.push(copy);
    versions.push(copy);
  }
  return { versions, taken };
}

/** Copy versions put forward again from their current text ("use the current version"). */
export async function retakeVersions(
  proposal: Proposal,
  actor: Actor,
  perspectiveIds: string[]
): Promise<{ ok: true; proposal: Proposal } | { ok: false; reason: Failure }> {
  const pages = await readPages();
  const perspectives = await perspectivesOf(proposal);
  const taken: ProposalVersion[] = [];
  for (const version of proposal.versions ?? []) {
    if (!perspectiveIds.includes(version.perspectiveId)) continue;
    const page = pages.find((entry) => entry.id === version.pageId);
    const perspective = perspectives
      .get(version.pageId)
      ?.find((entry) => entry.id === version.perspectiveId);
    if (page && perspective && isLive(perspective))
      taken.push(await takeVersionSnapshot(perspective, page, actor));
  }
  if (!taken.length) return { ok: true, proposal };
  const result = await replaceVersions(proposal.id, actor, taken);
  if (!result.ok) {
    await discardVersionSnapshots(taken);
    return result;
  }
  await discardVersionSnapshots(result.replaced);
  return { ok: true, proposal: result.proposal };
}

/** The versions put forward that have been changed since they were copied (and are still being worked on). */
export function changedVersions(proposal: Proposal, perspectives: Map<string, Perspective[]>) {
  return (proposal.versions ?? []).filter((version) => {
    const live = perspectives
      .get(version.pageId)
      ?.find((perspective) => perspective.id === version.perspectiveId);
    return !!live && isLive(live) && live.updatedAt !== version.version;
  });
}

/**
 * Make the versions a meeting chose their pages, before its consent is
 * recorded (so it's to the pages as they then are): each version's copy as
 * put forward, with the page's changes since brought in (where both changed
 * the same passage, the version's words), saved as a new version of the
 * page — unless it already reads so (a retry). Only those who can edit a
 * page can make a version of it the page. The pages' saves, by page.
 */
async function makeChosen(
  proposal: Proposal,
  chosen: VersionChoice[],
  ctx: ProposalSession
): Promise<{ made: Map<string, string> } | { error: NextResponse }> {
  const made = new Map<string, string>();
  for (const choice of chosen) {
    const version = (proposal.versions ?? []).find(
      (entry) => entry.pageId === choice.pageId && entry.perspectiveId === choice.perspectiveId
    );
    if (!choice.perspectiveId || !version) continue;
    const copy = await readSnapshotContent(version.snapshotId);
    if (copy?.body === undefined)
      return { error: problem("That version's copy couldn't be read — try again", 500) };
    for (let attempt = 0; attempt < 3 && !made.has(choice.pageId); attempt++) {
      const page = (await readPages()).find((entry) => entry.id === choice.pageId);
      if (!page)
        return { error: problem("A page the meeting chose a version of no longer exists", 404) };
      if (!canEditPage(ctx.user, ctx.directory, page))
        return {
          error: problem(
            `Only those who can edit “${page.title}” can make a version of it the page`,
            403
          ),
        };
      const text =
        !copy.base || copy.base.updatedAt === page.updatedAt
          ? copy.body
          : mergeText(copy.base.body, copy.body, page.body).text;
      if (text === page.body) {
        made.set(page.id, page.updatedAt);
        break;
      }
      const result = await updatePage(page.slug, ctx.actor, {
        body: text,
        baseUpdatedAt: page.updatedAt,
      });
      if (result.ok) {
        made.set(page.id, (result.page ?? page).updatedAt);
        await tellFollowers(
          result.page ?? page,
          ctx.actor,
          "made the version a meeting chose the page"
        );
      } else if (result.reason !== "conflict") return { error: wikiProblem(result.reason) };
    }
    if (!made.has(choice.pageId))
      return { error: problem("The page was being saved at the same moment — try again", 409) };
  }
  return { made };
}

/**
 * Record a circle's consent to a proposal, at a meeting already resolved:
 * documents without snapshots get them; with `current`, those changed since
 * (and versions changed since they were put forward) are copied again; the
 * versions chosen are made their pages; the consent is recorded, to the
 * pages as they then are; each version put forward is marked adopted or
 * set aside (and its author told); who was there is saved to the notes; the
 * documents show their stage; and the circle hears.
 */
export async function giveConsent(
  found: Proposal,
  input: { note: string | null; current?: boolean; chosen?: VersionChoice[] },
  meeting: { meeting: MeetingRef; present: NamedPerson[]; notes?: WikiPage },
  ctx: ProposalSession
): Promise<{ proposal: Proposal } | { error: NextResponse }> {
  let proposal = await ensureSnapshots(found, ctx.actor);
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  if (input.current) {
    const stale = changedDocuments(proposal, pages, documents);
    if (stale.length) {
      const retaken = await retakeSnapshots(proposal, ctx.actor, stale);
      if (!retaken.ok) return { error: proposalProblem(retaken.reason) };
      proposal = retaken.proposal;
    }
    const restale = changedVersions(proposal, await perspectivesOf(proposal));
    if (restale.length) {
      const retaken = await retakeVersions(
        proposal,
        ctx.actor,
        restale.map((version) => version.perspectiveId)
      );
      if (!retaken.ok) return { error: proposalProblem(retaken.reason) };
      proposal = retaken.proposal;
    }
  }
  const chosen = (proposal.versions ?? []).length ? input.chosen ?? [] : [];
  const made = await makeChosen(proposal, chosen, ctx);
  if ("error" in made) return made;
  const result = await consentToProposal(proposal.id, {
    meeting: meeting.meeting,
    present: markMembers(meeting.present, memberIdsOf(ctx.directory, proposal.circleId)),
    note: input.note,
    submittedBy: ctx.actor,
    documents: consentedVersions(proposal, await readPages(), documents, made.made),
    chosen,
  });
  if (!result.ok) return { error: proposalProblem(result.reason) };
  const told = await markVersions(result.proposal, made.made, ctx);
  await savePresent(meeting, ctx);
  await syncDocuments(result.proposal.documents);
  // The versions' authors have heard already, in their own words.
  await announceConsent(result.proposal, ctx, told);
  return { proposal: result.proposal };
}

/** Each version put forward: adopted (the one chosen) or set aside, and its author told (who's returned). */
async function markVersions(
  proposal: Proposal,
  made: Map<string, string>,
  ctx: ProposalSession
): Promise<Set<string>> {
  const told = new Set<string>();
  if (!proposal.versions?.length || !proposal.consent) return told;
  const at = new Date().toISOString();
  const perspectives = await perspectivesOf(proposal);
  const pages = await readPages();
  const circleName = circleNameOf(ctx.directory, proposal.circleId);
  for (const version of proposal.versions) {
    const adopted = chosenFor(proposal, version.pageId) === version.perspectiveId;
    await setOutcome(version.pageId, version.perspectiveId, {
      kind: adopted ? "adopted" : "set-aside",
      at,
      by: { name: ctx.user.name },
      proposalId: proposal.id,
      ...(adopted && made.has(version.pageId) ? { pageVersion: made.get(version.pageId) } : {}),
    });
    const author = perspectives
      .get(version.pageId)
      ?.find((entry) => entry.id === version.perspectiveId)?.createdBy.userId;
    const page = pages.find((entry) => entry.id === version.pageId);
    if (!author || !page || author === ctx.user.id) continue;
    told.add(author);
    await notify({
      topic: "proposals",
      title: adopted
        ? `${circleName} consented to your version of “${page.title}”`
        : `${circleName} consented to “${proposal.title}”`,
      body: adopted
        ? `“${version.name}” is the page now (${proposal.consent.meeting.title}).`
        : `Your version, “${version.name}”, was set aside (${proposal.consent.meeting.title}).`,
      url: adopted ? `/wiki/${page.slug}` : `/proposals/${proposal.id}`,
      tag: `perspective-${version.perspectiveId}`,
      exceptUserId: ctx.user.id,
      onlyUserIds: [author],
    });
  }
  return told;
}

/** Consent withdrawn: the versions it adopted or set aside are open again (a page made from one keeps its text). */
export async function unmarkVersions(proposal: Proposal) {
  const perspectives = await perspectivesOf(proposal);
  for (const version of proposal.versions ?? []) {
    const live = perspectives
      .get(version.pageId)
      ?.find((entry) => entry.id === version.perspectiveId);
    if (live?.outcome?.proposalId === proposal.id)
      await setOutcome(version.pageId, version.perspectiveId, null);
  }
}

/**
 * Snapshots of the documents a proposal is about that have none — just
 * attached, or attached before snapshots were kept — taken now (unless it's
 * consented). The proposal as it is then.
 */
export async function ensureSnapshots(proposal: Proposal, actor: Actor): Promise<Proposal> {
  if (proposal.status === "consented") return proposal;
  const missing = proposal.documents.filter((ref) => !snapshotOf(proposal, ref));
  if (!missing.length) return proposal;
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  const taken = await takeSnapshots(missing, actor, { pages, documents });
  if (!taken.length) return proposal;
  const result = await addSnapshots(proposal.id, taken);
  const held = result.ok ? result.proposal : proposal;
  // Another request may have taken some first: theirs stay.
  await discardSnapshots(
    taken.filter(
      (snapshot) => !held.snapshots?.some((kept) => kept.snapshotId === snapshot.snapshotId)
    )
  );
  return held;
}

/** Take these documents' snapshots again, from their current versions ("use the current version"). */
export async function retakeSnapshots(
  proposal: Proposal,
  actor: Actor,
  refs: DocumentRef[]
): Promise<{ ok: true; proposal: Proposal } | { ok: false; reason: Failure }> {
  const [pages, documents] = await Promise.all([readPages(), listDocuments()]);
  const taken = await takeSnapshots(refs, actor, { pages, documents });
  if (!taken.length) return { ok: true, proposal };
  const result = await replaceSnapshots(proposal.id, actor, taken);
  if (!result.ok) {
    await discardSnapshots(taken);
    return result;
  }
  await discardSnapshots(result.replaced);
  return { ok: true, proposal: result.proposal };
}

/** The documents a proposal is about that have changed since their snapshots were taken. */
export const changedDocuments = (
  proposal: Proposal,
  pages: WikiPage[],
  documents: DocumentRecord[]
) => proposal.documents.filter((ref) => changedSinceSnapshot(proposal, ref, pages, documents));

/** Who hears about a circle's proposals: its members (everyone, for Community). */
async function audienceOf(directory: DirectoryDocument, circleId: string) {
  if (isCommunity(circleId)) return undefined;
  const members = memberIdsOf(directory, circleId);
  return userIdsForPeople(members === "everyone" ? [] : Array.from(members));
}

/** A new proposal: the circle's members hear (everyone, for Community's). */
export async function announceProposal(proposal: Proposal, ctx: ProposalSession) {
  const circleName = circleNameOf(ctx.directory, proposal.circleId);
  const only = await audienceOf(ctx.directory, proposal.circleId);
  await notify({
    topic: "proposals",
    title: `Proposed to ${circleName}: ${proposal.title}`,
    body: `${proposal.proposedBy.name}${
      proposal.decideOn ? ` · to decide ${shortDate(proposal.decideOn, true)}` : ""
    }${proposal.body ? ` — ${excerpt(proposal.body)}` : ""}`,
    url: `/proposals/${proposal.id}`,
    tag: `proposal-${proposal.id}`,
    exceptUserId: ctx.user.id,
    ...(only ? { onlyUserIds: only } : {}),
  });
}

/**
 * Consent recorded: whoever proposed it and the circle's members hear
 * (everyone, for Community's) — but those in `told`, who've heard already.
 */
export async function announceConsent(
  proposal: Proposal,
  ctx: ProposalSession,
  told: Set<string> = new Set()
) {
  if (!proposal.consent) return;
  const circleName = circleNameOf(ctx.directory, proposal.circleId);
  const only = await audienceOf(ctx.directory, proposal.circleId);
  await notify({
    topic: "proposals",
    title: `${circleName} consented: ${proposal.title}`,
    body: `At ${proposal.consent.meeting.title} (${shortDate(
      proposal.consent.meeting.date,
      true
    )})`,
    url: `/proposals/${proposal.id}`,
    tag: `proposal-${proposal.id}`,
    exceptUserId: ctx.user.id,
    ...(only
      ? {
          onlyUserIds: Array.from(new Set([...only, proposal.proposedBy.userId])).filter(
            (id) => !told.has(id)
          ),
        }
      : {}),
  });
}
