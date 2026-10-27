"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import {
  BookOpen,
  ChevronRight,
  CornerDownRight,
  History as HistoryIcon,
  ListTree,
  MessageSquarePlus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { PagePerson, WikiPage } from "@/lib/wiki/store";
import { PresentDialog, PresentLine } from "@/components/wiki/present-dialog";
import { MeetingProposals } from "@/components/proposals/meeting-proposals";
import { ProposalHostContext } from "@/components/proposals/proposal-card";
import { meetingDateOf, type MeetingOption } from "@/lib/proposals/shared";
import { PageTranscript } from "@/components/wiki/transcript-section";
import type { Backlink } from "@/lib/wiki/backlinks";
import type { PageEditor } from "@/lib/wiki/presence";
import { shortDate, timeAgo } from "@/lib/time";
import { WikiMarkdown, tableOfContents } from "@/components/wiki/markdown";
import { todoItems, toggleTodo } from "@/lib/wiki/todos";
import {
  WikiComments,
  threadsOf,
  useComments,
  useQuoteHighlights,
} from "@/components/wiki/wiki-comments";
import { WikiEditor } from "@/components/wiki/wiki-editor";
import { RehomeDialog } from "@/components/wiki/rehome-dialog";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { wikiPageQuery, type PageResponse } from "@/components/wiki/link-data";
import { PageSettings } from "@/components/wiki/page-settings";
import { PageHistory } from "@/components/wiki/page-history";
import { PerspectivesBar } from "@/components/wiki/perspectives-bar";
import { labelledCircles } from "@/lib/circles/tiers";
import { Button } from "@/components/ui/button";
import { CircleIcon } from "@/components/circles/circle-icon";
import { EditedSinceProposed, StageControls, StagePill } from "@/components/wiki/page-consent";
import { ConsentRecord } from "@/components/circles/consent-record";
import { consentState } from "@/lib/wiki/consent";
import { useToast } from "@/components/ui/use-toast";
import { useCircles } from "@/components/directory/use-directory";
import { Pill } from "@/components/ui/pill";
import { Loading, NotFoundCard } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { Select } from "@/components/ui/select";
import { StarButton, useNoteOpened } from "@/components/documents/my-documents";
import { FollowButton } from "@/components/wiki/follow-button";
import { useDocsShell } from "@/components/documents/docs-context";
import { ancestorsOf, childrenOf } from "@/lib/wiki/tree";

const NO_THREADS: never[] = [];
const NO_IDS = new Set<string>();

/** A floating "Comment" button over selected text on the page. */
function useSelectionPrompt(article: React.RefObject<HTMLElement>, enabled: boolean) {
  const [prompt, setPrompt] = useState<{ text: string; top: number; left: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const selection = window.getSelection();
      const container = article.current;
      if (!selection || selection.isCollapsed || !container || !selection.rangeCount)
        return setPrompt(null);
      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return setPrompt(null);
      const text = selection.toString().replace(/\s+/g, " ").trim();
      if (!text) return setPrompt(null);
      const rect = range.getBoundingClientRect();
      // Above the selection — kept on screen when the selection is scrolled out of view.
      setPrompt({
        text,
        top: Math.min(window.innerHeight - 48, Math.max(8, rect.top - 44)),
        left: Math.min(window.innerWidth - 120, Math.max(8, rect.left + rect.width / 2 - 56)),
      });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update);
    };
  }, [article, enabled]);
  return [prompt, () => setPrompt(null)] as const;
}

/**
 * Which of the page's headings you're reading under: the last one scrolled up
 * past the top of the window (at the very bottom, the last one in view).
 */
function useActiveHeading(ids: string[], enabled: boolean) {
  const [active, setActive] = useState<string | null>(null);
  const key = enabled ? ids.join("\n") : "";
  useEffect(() => {
    const list = key ? key.split("\n") : [];
    if (!list.length) return setActive(null);
    let frame = 0;
    const update = () => {
      frame = 0;
      // Just below the sticky site header.
      const line = 112;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current: string | null = null;
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top === undefined) continue;
        if (top <= line || (atBottom && top < window.innerHeight)) current = id;
        else if (!atBottom) break;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key]);
  return active;
}

/**
 * One wiki page: read it (with "On this page" for longer pages, the section
 * you're in shown in bold), select words to leave a comment on them, look
 * back through its versions, star it (opening it notes it as recent), follow
 * it, and — for its editors — edit, restore a version, or delete it. Its
 * place in its circle's tree shows as a trail over the title (circle ›
 * parent › … ) and, at the end, the pages inside it. While reading, `e`
 * edits (if you may) and `s` stars.
 */
export function WikiPageClient({ slug }: { slug: string }) {
  const confirm = useConfirm();
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const circles = useCircles();
  const key = wikiPageQuery(slug).queryKey;
  const { data, isLoading, error, refetch } = useQuery(wikiPageQuery(slug));
  // The circle that keeps it.
  const circleId = data?.page.keeper ?? "";
  const circle = circles?.find((entry) => entry.id === circleId);
  const pageList = useWikiPages().data?.pages;
  const pages = useMemo(() => pageList ?? [], [pageList]);
  const commentData = useComments(circleId, slug).data;
  const threads = useMemo(() => threadsOf(commentData?.comments ?? []), [commentData]);
  const [mode, setMode] = useState<"read" | "edit">(params.get("edit") ? "edit" : "read");
  const [showHistory, setShowHistory] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const article = useRef<HTMLDivElement>(null);

  const page = data?.page;
  useNoteOpened(page ? { kind: "page", id: page.id } : null);
  const wikiOn = true;
  const canEdit = !!data?.canEdit;
  const canManage = !!data?.canManage;
  const canConsent = !!data?.canConsent;
  const history = data?.history ?? [];
  const reading = mode !== "edit";
  // Its place in the tree: the pages it's inside, and the pages inside it.
  const ancestors = useMemo(() => (page ? ancestorsOf(pages, page) : []), [pages, page]);
  const inside = useMemo(
    () => (page ? childrenOf(pages, page.id, page.keeper).filter((entry) => !entry.draft) : []),
    [pages, page]
  );
  const shell = useDocsShell();
  // While reading: e edits (if you may), s stars — unless you're typing or a dialog is open.
  useEffect(() => {
    if (!reading) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        !target ||
        target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        document.querySelector("[role=dialog]")
      )
        return;
      if (event.key === "e" && canEdit) {
        event.preventDefault();
        setMode("edit");
      } else if (event.key === "s") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>("[data-star]")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reading, canEdit]);
  const { ranges, found: foundIds } = useQuoteHighlights(
    article,
    reading ? threads : NO_THREADS,
    activeId,
    `${page?.body ?? ""}:${mode}`
  );
  const [prompt, dismissPrompt] = useSelectionPrompt(article, reading && wikiOn && !!user);
  const toc = useMemo(() => (page ? tableOfContents(page.body) : []), [page]);
  const tocIds = useMemo(() => toc.map((heading) => heading.id), [toc]);
  const readingAt = useActiveHeading(tocIds, reading && toc.length >= 3);
  // While reading: others' saves appear without reloading, and who's editing shows.
  const live = useQuery({
    queryKey: ["wiki-live", slug],
    queryFn: () =>
      apiFetch<{ updatedAt: string; editors: PageEditor[] }>(`/api/wiki/pages/${slug}/live`),
    enabled: !!page && mode !== "edit",
    refetchInterval: 10_000,
  }).data;
  useEffect(() => {
    if (live && page && live.updatedAt !== page.updatedAt)
      void queryClient.invalidateQueries({ queryKey: key, exact: true });
    // Only when the page's last save changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.updatedAt]);
  const othersEditing = (live?.editors ?? []).filter((editor) => editor.userId !== user?.id);

  const exitEdit = () => {
    setMode("read");
    router.replace(`/wiki/${slug}`);
  };
  const saved = (updated: WikiPage) => {
    queryClient.setQueryData<PageResponse>(key, (old) => (old ? { ...old, page: updated } : old));
    // The history, the page list, and pages that embed this one catch up.
    queryClient.invalidateQueries({ queryKey: key, exact: true });
    queryClient.invalidateQueries({ queryKey: ["wiki"], exact: true });
  };
  const restore = useMutation({
    mutationFn: (index: number) =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}/restore`, {
        method: "POST",
        body: JSON.stringify({ index }),
      }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      setShowHistory(false);
      // The editor takes the restored text in, as it does anyone's save.
      toast({
        title: "Earlier version restored",
        ...(mode === "edit" ? { description: "It's in the editor now." } : {}),
      });
    },
    onError: (err: Error) =>
      toast({ title: "Could not restore it", description: err.message, variant: "destructive" }),
  });
  // Ticking a to-do item off while reading: shown at once, then saved (the page's editors).
  const tick = useMutation({
    mutationFn: (todo: { index: number; checked: boolean; text: string }) =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}/todo`, {
        method: "POST",
        body: JSON.stringify(todo),
      }),
    onMutate: ({ index, checked, text }) =>
      queryClient.setQueryData<PageResponse>(key, (old) =>
        old
          ? {
              ...old,
              page: {
                ...old.page,
                body: toggleTodo(old.page.body, index, checked, text) ?? old.page.body,
              },
            }
          : old
      ),
    onSuccess: ({ page: updated }) =>
      queryClient.setQueryData<PageResponse>(key, (old) => (old ? { ...old, page: updated } : old)),
    onError: (err: Error) => {
      toast({ title: "Could not tick it", description: err.message, variant: "destructive" });
      void refetch();
    },
  });
  const toggleItem = (index: number, checked: boolean) => {
    const item = data && todoItems(data.page.body)[index];
    if (item) tick.mutate({ index, checked, text: item.text });
  };
  // Who was present (meeting notes), chosen from the editor's toolbar.
  const [choosingPresent, setChoosingPresent] = useState(false);
  const setPresent = useMutation({
    mutationFn: ({ present, meetingDate }: { present: PagePerson[]; meetingDate: string }) =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({ present, meetingDate }),
      }),
    onSuccess: ({ page: updated }) => {
      saved(updated);
      setChoosingPresent(false);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not save who's present",
        description: err.message,
        variant: "destructive",
      }),
  });
  // Moving the page to another circle: to one you're in, at once. Only a circle's members can
  // move pages to it, so for one you're not in a dialog offers to join it first (`rehoming`).
  const [rehoming, setRehoming] = useState<string | null>(null);
  const rehomeTo = rehoming ? circles?.find((entry) => entry.id === rehoming) : undefined;
  const circleName = (id: string) =>
    circles?.find((entry) => entry.id === id)?.name ?? "the circle";
  const rehome = useMutation({
    mutationFn: ({ keeper }: { keeper: string; joined?: boolean }) =>
      apiFetch<{ page: WikiPage }>(`/api/wiki/pages/${slug}`, {
        method: "PATCH",
        body: JSON.stringify({ keeper }),
      }),
    onSuccess: ({ page: updated }, { keeper, joined }) => {
      setRehoming(null);
      saved(updated);
      toast({
        title: joined
          ? `You've joined ${circleName(keeper)}, and the page is theirs now`
          : "Parent circle changed",
      });
    },
    onError: (err: Error) =>
      toast({
        title: "Could not change the parent circle",
        description: err.message,
        variant: "destructive",
      }),
  });
  // Where you can move it may have changed since the page was loaded (you've been let into a circle): asked again first.
  const moveTo = async (keeper: string) => {
    const allowed = (response?: PageResponse) => response?.canMoveTo?.includes(keeper) ?? true;
    if (allowed(data) || allowed((await refetch()).data)) rehome.mutate({ keeper });
    else setRehoming(keeper);
  };
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/wiki/pages/${slug}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      toast({
        title: "Moved to the trash",
        description: "Documents → Trash brings it back, for 30 days.",
      });
      router.replace("/documents");
    },
    onError: (err: Error) =>
      toast({
        title: "Could not delete the page",
        description: err.message,
        variant: "destructive",
      }),
  });

  const historyPanel = page ? (
    <PageHistory
      page={page}
      history={history}
      circleId={circleId}
      pages={pages}
      canRestore={canEdit}
      restoring={restore.isPending}
      onRestore={(index) => restore.mutate(index)}
      onClose={() => setShowHistory(false)}
    />
  ) : null;

  // Show a thread's passage on the page, or a passage's thread in the comments.
  const activate = (id: string) => {
    setActiveId(id);
    const range = ranges.current.get(id);
    if (range) {
      const rect = range.getBoundingClientRect();
      window.scrollTo({
        top: window.scrollY + rect.top - window.innerHeight / 3,
        behavior: "smooth",
      });
    }
  };
  const onArticleClick = (event: React.MouseEvent) => {
    const doc = document as Document & {
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const caret = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (!caret) return;
    for (const [id, range] of Array.from(ranges.current.entries())) {
      if (range.isPointInRange(caret.startContainer, caret.startOffset)) {
        setActiveId(id);
        document
          .getElementById(`comment-${id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return;
      }
    }
  };

  // Meeting notes: proposals to the circle can be consented here.
  const meetingDate = page ? meetingDateOf(page) : null;
  const meeting = useMemo<MeetingOption | null>(
    () =>
      page && meetingDate
        ? {
            kind: "page",
            id: page.id,
            title: page.title,
            date: meetingDate,
            present: page.present ?? [],
            href: `/wiki/${page.slug}`,
          }
        : null,
    [page, meetingDate]
  );
  const host = useMemo(
    () => (meeting && page ? { meeting, circleId: page.keeper } : null),
    [meeting, page]
  );
  const meetingPanel =
    meeting && page ? (
      <MeetingProposals
        meeting={meeting}
        circleId={page.keeper}
        circleName={circle?.name ?? "The circle"}
        canConsent={canConsent}
      />
    ) : null;

  const back = <BackLink href="/documents" label="Documents" />;
  if (isLoading) return <Loading />;
  if (error || !page) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {back}
        <NotFoundCard error={error} message="That page wasn't found." />
      </div>
    );
  }

  if (mode === "edit" && canEdit) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        {back}
        {showHistory ? historyPanel : null}
        <WikiEditor
          circleId={circleId}
          circleName={circle?.name ?? ""}
          circle={circle}
          page={page}
          pages={pages}
          onPresent={() => setChoosingPresent(true)}
          aside={
            <WikiComments
              circleId={circleId}
              slug={slug}
              threads={threads}
              canComment={!!user && wikiOn}
              canModerate={canEdit || !!user?.isAdmin}
              pendingQuote={null}
              onClearQuote={() => undefined}
              activeId={activeId}
              foundIds={NO_IDS}
              onActivate={setActiveId}
              locating={false}
            />
          }
          headerExtras={
            <>
              <PresentLine present={page.present} meetingDate={page.meetingDate} />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <StagePill page={page} />
                <EditedSinceProposed page={page} />
              </div>
              {canConsent || canEdit ? (
                <StageControls
                  page={page}
                  slug={slug}
                  circleName={circle?.name ?? "The circle"}
                  canEdit={canEdit}
                  canConsent={canConsent}
                  onSaved={saved}
                />
              ) : null}
              {meetingPanel}
            </>
          }
          tools={
            <>
              {canManage ? (
                <label className="flex items-center gap-2">
                  Parent circle
                  <Select
                    value={page.keeper}
                    onChange={(event) => void moveTo(event.target.value)}
                    disabled={rehome.isPending}
                    className="h-8 max-w-[12rem] rounded-md px-1.5 text-xs"
                  >
                    {labelledCircles(circles ?? []).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : (
                <span>Parent circle {circle?.name ?? "—"}</span>
              )}
              <span className="flex flex-wrap items-center gap-2">
                {canManage ? <PageSettings page={page} slug={slug} onSaved={saved} /> : null}
                {history.length ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setShowHistory(!showHistory)}
                    aria-expanded={showHistory}
                  >
                    {showHistory ? <X className="h-4 w-4" /> : <HistoryIcon className="h-4 w-4" />}{" "}
                    {showHistory ? "Close history" : `History (${history.length})`}
                  </Button>
                ) : null}
              </span>
            </>
          }
          onDone={(updated) => {
            // The editor's copy has the text; settings changed while editing (parent circle, who can edit it, consent) are newer here.
            saved({
              ...page,
              title: updated.title,
              body: updated.body,
              updatedAt: updated.updatedAt,
              updatedBy: updated.updatedBy,
              historyCount: updated.historyCount,
            });
            exitEdit();
          }}
        />
        {choosingPresent ? (
          <PresentDialog
            circleId={circleId}
            present={page.present ?? []}
            meetingDate={meetingDate}
            saving={setPresent.isPending}
            onSave={(present, date) => setPresent.mutate({ present, meetingDate: date })}
            onClose={() => setChoosingPresent(false)}
          />
        ) : null}
        {rehoming && rehomeTo ? (
          <RehomeDialog
            pageTitle={page.title}
            circle={rehomeTo}
            moving={rehome.isPending}
            onJoined={() => rehome.mutate({ keeper: rehoming, joined: true })}
            onAsked={() => {
              setRehoming(null);
              toast({
                title: `You've asked to join ${rehomeTo.name}`,
                description: `Once one of its members says yes, you can move “${page.title}” there.`,
              });
            }}
            onClose={() => setRehoming(null)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <div className="flex flex-wrap items-center gap-2">
          <StarButton doc={{ kind: "page", id: page.id }} title={page.title} />
          <FollowButton slug={slug} following={!!data?.following} />
          {history.length ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowHistory(!showHistory)}
              aria-expanded={showHistory}
            >
              <HistoryIcon className="h-4 w-4" /> History ({history.length})
            </Button>
          ) : null}
          {canEdit ? (
            <Button size="sm" className="gap-1.5" onClick={() => setMode("edit")}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          ) : null}
        </div>
      </div>
      {showHistory ? historyPanel : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="document-sheet flex min-w-0 flex-col" data-page-sheet>
          {/* The page's head: its circle, title, date, and where it stands with the circle. */}
          <header className="flex flex-col items-center gap-3 border-b border-border/70 px-6 pb-7 pt-9 text-center sm:px-14">
            {circle ? (
              <Link
                href={`/circles/${circle.id}`}
                title={circle.name}
                className="rounded-full ring-4 ring-white shadow-soft transition hover:scale-105"
              >
                <CircleIcon circle={circle} size={72} className="rounded-full" />
              </Link>
            ) : null}
            <h1 className="font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
              {page.title}
            </h1>
            <p
              className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-muted"
              data-page-trail
            >
              {circle ? (
                <Link href={`/circles/${circle.id}`} className="font-medium hover:underline">
                  {circle.name}
                </Link>
              ) : (
                "—"
              )}
              {ancestors.map((ancestor) => (
                <Fragment key={ancestor.id}>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <Link
                    href={`/wiki/${ancestor.slug}`}
                    className="max-w-[14rem] truncate font-medium hover:underline"
                  >
                    {ancestor.icon ? `${ancestor.icon} ` : ""}
                    {ancestor.title}
                  </Link>
                </Fragment>
              ))}
              <span aria-hidden>·</span>
              <time
                dateTime={page.updatedAt}
                title={`Last edited by ${page.updatedBy.name} · ${timeAgo(page.updatedAt)}`}
              >
                {shortDate(page.updatedAt, true)}
              </time>
            </p>
            <PresentLine present={page.present} meetingDate={page.meetingDate} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StagePill page={page} />
              <EditedSinceProposed page={page} />
              {othersEditing.length ? (
                <Pill tone="live" data-live-editors>
                  <Pencil className="h-3 w-3" aria-hidden />{" "}
                  {othersEditing.map((editor) => editor.name).join(", ")}{" "}
                  {othersEditing.length === 1 ? "is" : "are"} editing
                </Pill>
              ) : null}
            </div>
            {page.consent ? (
              <ConsentRecord
                consent={page.consent}
                what={
                  consentState(page) === "changed"
                    ? "An earlier version was consented"
                    : "Consented"
                }
                className="justify-center"
              />
            ) : null}
            {canConsent || canEdit ? (
              <StageControls
                page={page}
                slug={slug}
                circleName={circle?.name ?? "The circle"}
                canEdit={canEdit}
                canConsent={canConsent}
                onSaved={saved}
              />
            ) : null}
            {meetingPanel}
            <PerspectivesBar slug={slug} />
          </header>

          <div className="document-body w-full">
            {toc.length >= 3 ? (
              <nav
                className="mb-6 rounded-lg border border-border bg-accent/30 p-3 text-sm lg:hidden"
                aria-label="On this page"
              >
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <ListTree className="h-3.5 w-3.5" /> On this page
                </p>
                <TocList toc={toc} active={readingAt} />
              </nav>
            ) : null}

            <div ref={article} onClick={onArticleClick}>
              <ProposalHostContext.Provider value={host}>
                <WikiMarkdown
                  source={page.body}
                  circleId={circleId}
                  pages={pages}
                  pageId={page.id}
                  onToggleTodo={canEdit ? toggleItem : undefined}
                />
              </ProposalHostContext.Provider>
            </div>
          </div>
          {inside.length || (canManage && shell) ? (
            <section
              className="mx-auto w-full max-w-[46rem] px-5 pb-8 sm:px-14"
              aria-label="Pages inside"
              data-page-children
            >
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <ListTree className="h-3.5 w-3.5" aria-hidden /> Pages inside
              </p>
              <ul className="flex flex-col gap-0.5">
                {inside.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={`/wiki/${child.slug}`}
                      className="inline-flex items-center gap-2 rounded-md py-1 text-foreground-light hover:text-foreground hover:underline"
                    >
                      <span className="w-5 text-center text-base leading-none" aria-hidden>
                        {child.icon ?? <BookOpen className="mx-auto h-4 w-4 text-primary" />}
                      </span>
                      {child.title}
                    </Link>
                  </li>
                ))}
                {canManage && shell ? (
                  <li>
                    <button
                      type="button"
                      onClick={() =>
                        shell.newPage({ id: page.id, title: page.title, keeper: page.keeper })
                      }
                      className="inline-flex items-center gap-2 rounded-md py-1 text-sm text-muted hover:text-foreground hover:underline"
                      data-page-add-inside
                    >
                      <span className="flex w-5 justify-center" aria-hidden>
                        <Plus className="h-4 w-4" />
                      </span>
                      New page inside
                    </button>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
          <PageTranscript transcript={page.transcript} />

          {canManage ? (
            <footer className="flex justify-end border-t border-border/70 px-6 py-3 sm:px-14">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-destructive"
                disabled={remove.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Move “${page.title}” to the trash?`,
                      body: "It can be restored from the trash for 30 days, with its history and comments.",
                      confirmLabel: "Move to the trash",
                    })
                  )
                    remove.mutate();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete page
              </button>
            </footer>
          ) : null}
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:-mx-2 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:px-2 lg:pb-4 lg:pt-2">
          {toc.length >= 3 ? (
            <nav
              className="hidden rounded-lg border border-border bg-surface p-3 text-sm lg:block"
              aria-label="On this page"
            >
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <ListTree className="h-3.5 w-3.5" /> On this page
              </p>
              <TocList toc={toc} active={readingAt} />
            </nav>
          ) : null}
          <LinkedFrom circleId={circleId} slug={slug} />
          <WikiComments
            circleId={circleId}
            slug={slug}
            threads={threads}
            canComment={!!user && wikiOn}
            canModerate={canEdit || !!user?.isAdmin}
            pendingQuote={pendingQuote}
            onClearQuote={() => setPendingQuote(null)}
            activeId={activeId}
            foundIds={foundIds}
            onActivate={activate}
          />
        </aside>
      </div>

      {prompt ? (
        <button
          type="button"
          style={{ top: prompt.top, left: prompt.left }}
          className="fixed z-40 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-elev"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setPendingQuote(prompt.text);
            dismissPrompt();
            window.getSelection()?.removeAllRanges();
            document
              .getElementById("comments")
              ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }}
        >
          <MessageSquarePlus className="h-4 w-4" /> Comment
        </button>
      ) : null}
    </div>
  );
}

/** "Linked from": the pages that link to (or embed) this one. */
function LinkedFrom({ circleId, slug }: { circleId: string; slug: string }) {
  const { data } = useQuery({
    queryKey: ["wiki-backlinks", circleId, slug],
    queryFn: () => apiFetch<{ backlinks: Backlink[] }>(`/api/wiki/pages/${slug}/backlinks`),
  });
  if (!data?.backlinks.length) return null;
  return (
    <nav
      className="rounded-lg border border-border bg-surface p-3 text-sm"
      aria-label="Linked from"
    >
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <CornerDownRight className="h-3.5 w-3.5" /> Linked from
      </p>
      <ul className="flex flex-col gap-0.5">
        {data.backlinks.map((link) => (
          <li key={`${link.circleId}/${link.slug}`}>
            <Link
              href={`/wiki/${link.slug}`}
              className="text-foreground-light hover:text-foreground hover:underline"
            >
              {link.title}
            </Link>
            {link.circleId !== circleId ? (
              <span className="text-xs text-muted"> · {link.circleName}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** "On this page": the page's headings, the one you're reading under in bold. */
function TocList({
  toc,
  active,
}: {
  toc: { level: number; text: string; id: string }[];
  active: string | null;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {toc.map((heading, index) => (
        <li key={`${heading.id}-${index}`} style={{ paddingLeft: (heading.level - 1) * 12 }}>
          <a
            href={`#${heading.id}`}
            aria-current={heading.id === active ? "location" : undefined}
            className={
              heading.id === active
                ? "font-semibold text-foreground hover:underline"
                : "text-foreground-light hover:text-foreground hover:underline"
            }
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
}
