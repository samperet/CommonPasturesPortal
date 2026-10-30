"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, Handshake, Star } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import type { DocKind, DocRef, MyDocument } from "@/lib/me/shared";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

/**
 * Your starred and recently opened documents (`lib/me`): the query the
 * Documents menus and Star buttons share, the **Star** button itself, and
 * noting what you open. Nothing is noted while viewing the app as someone.
 */

export type MyDocumentsResponse = {
  starred: (MyDocument & { at: string })[];
  recent: (MyDocument & { at: string })[];
};

export const myDocumentsQuery = {
  queryKey: ["me-documents"],
  queryFn: () => apiFetch<MyDocumentsResponse>("/api/me/documents"),
  staleTime: 30_000,
};

export const useMyDocuments = () => useQuery(myDocumentsQuery);

export const DOC_ICONS: Record<DocKind, typeof BookOpen> = {
  page: BookOpen,
  file: FileText,
  proposal: Handshake,
};

/** Star a page, file or proposal to find it again from the Documents menu — or unstar it. */
export function StarButton({
  doc,
  title,
  className,
  compact = false,
}: {
  doc: DocRef;
  title: string;
  className?: string;
  /** Just the star (in a file's row of actions). */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { viewAs } = useSession();
  const { data } = useMyDocuments();
  const starred = !!data?.starred.some((entry) => entry.kind === doc.kind && entry.id === doc.id);
  const change = useMutation({
    mutationFn: (on: boolean) =>
      apiFetch("/api/me/documents/starred", {
        method: "PUT",
        body: JSON.stringify({ ...doc, starred: on }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me-documents"] }),
    onError: (err: Error) =>
      toast({
        title: "Could not change the star",
        description: err.message,
        variant: "destructive",
      }),
  });
  if (viewAs) return null;
  const on = change.isPending ? !!change.variables : starred;
  const label = on ? `Unstar “${title}”` : `Star “${title}”`;
  return (
    <button
      type="button"
      onClick={() => change.mutate(!on)}
      disabled={change.isPending || !data}
      aria-pressed={on}
      aria-label={label}
      title={on ? "Starred — click to unstar" : "Star it, to find it in the Documents menu"}
      data-star={on ? "on" : "off"}
      className={cn(
        compact
          ? "inline-flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-accent"
          : "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-sm font-medium transition hover:bg-accent",
        on ? "text-amber-600" : "text-muted hover:text-foreground",
        className
      )}
    >
      <Star className={cn("h-4 w-4", on && "fill-current")} aria-hidden />
      {compact ? null : on ? "Starred" : "Star"}
    </button>
  );
}

/** Note that a document was opened (when it's there to note, and not while viewing as someone). */
export function useNoteOpened(doc: DocRef | null) {
  const noteOpened = useOpenNoter();
  const kind = doc?.kind;
  const id = doc?.id;
  useEffect(() => {
    if (kind && id) noteOpened({ kind, id });
  }, [kind, id, noteOpened]);
}

/** A function noting that a document was opened — for a file, as its link is followed. */
export function useOpenNoter() {
  const queryClient = useQueryClient();
  const { user, viewAs } = useSession();
  const signedIn = !!user && !viewAs;
  return useCallback(
    (doc: DocRef) => {
      if (!signedIn) return;
      void fetch("/api/me/documents/recent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: doc.kind, id: doc.id }),
        keepalive: true,
      })
        .then((res) => {
          if (res.ok) void queryClient.invalidateQueries({ queryKey: ["me-documents"] });
        })
        .catch(() => undefined);
    },
    [signedIn, queryClient]
  );
}

const MENU_SIZE = 5;

/**
 * The menus' **Starred** and **Recent** groups (five of each; recent leaves
 * out what's starred), with a link to them all. `link` styles each entry;
 * `label` each group's heading.
 */
export function MyDocumentsLinks({
  linkClass,
  labelClass,
  onChoose,
  menu = false,
  listClass,
}: {
  linkClass: string;
  labelClass: string;
  onChoose: () => void;
  /** In a dropdown menu (entries are menu items). */
  menu?: boolean;
  /** Around each group's entries (the sidebar sets them on a white panel). */
  listClass?: string;
}) {
  const { data } = useMyDocuments();
  const noteOpened = useOpenNoter();
  if (!data || (!data.starred.length && !data.recent.length)) return null;
  const starred = data.starred.slice(0, MENU_SIZE);
  const unstarred = data.recent.filter(
    (entry) => !data.starred.some((star) => star.kind === entry.kind && star.id === entry.id)
  );
  const recent = unstarred.slice(0, MENU_SIZE);
  const entry = (doc: MyDocument) => {
    const Icon = DOC_ICONS[doc.kind];
    const content = (
      <>
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 truncate">{doc.title}</span>
      </>
    );
    const props = {
      role: menu ? "menuitem" : undefined,
      className: linkClass,
      title: doc.circleName ? `${doc.title} · ${doc.circleName}` : doc.title,
      "data-my-document": `${doc.kind}:${doc.id}`,
    };
    return doc.external ? (
      <a
        key={`${doc.kind}:${doc.id}`}
        href={doc.href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
        onClick={() => {
          noteOpened(doc);
          onChoose();
        }}
      >
        {content}
      </a>
    ) : (
      <Link key={`${doc.kind}:${doc.id}`} href={doc.href} {...props} onClick={onChoose}>
        {content}
      </Link>
    );
  };
  return (
    <div data-my-documents>
      {starred.length ? (
        <div data-my-starred>
          <p className={labelClass}>Starred</p>
          <div className={listClass}>{starred.map(entry)}</div>
        </div>
      ) : null}
      {recent.length ? (
        <div data-my-recent>
          <p className={labelClass}>Recent</p>
          <div className={listClass}>{recent.map(entry)}</div>
        </div>
      ) : null}
      {data.starred.length > MENU_SIZE || unstarred.length > MENU_SIZE ? (
        <Link
          href="/documents/mine"
          role={menu ? "menuitem" : undefined}
          className={cn(linkClass, "text-muted")}
          onClick={onChoose}
        >
          All starred and recent…
        </Link>
      ) : null}
    </div>
  );
}
