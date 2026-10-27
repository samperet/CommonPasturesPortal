"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { WikiPage } from "@/lib/wiki/store";
import { wikiPagesQuery } from "@/components/wiki/link-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { COMMUNITY_ID, isCommunity } from "@/lib/circles/ids";
import { Select } from "@/components/ui/select";
import { shortDate, todayInVermont } from "@/lib/time";
import { TemplatePicker } from "@/components/wiki/template-picker";

/** The wiki's pages (and the circles you can start pages for). */
export function useWikiPages() {
  return useQuery(wikiPagesQuery());
}

/**
 * Start a page: give it a title, then write it. Started from a link in
 * another page (`from`), it's kept by that page's circle; inside another
 * page (`parent`), by that page's circle, under it in the tree; otherwise
 * choose which of your circles keeps it (unless `lockKeeper`: from a
 * circle's page, that circle keeps it).
 */
export function NewPageForm({
  initialTitle = "",
  from,
  parent,
  keeper: preferred,
  lockKeeper = false,
  meeting = false,
  onCancel,
}: {
  initialTitle?: string;
  from?: string;
  /** The page it goes inside. */
  parent?: { id: string; title: string; keeper: string };
  keeper?: string;
  lockKeeper?: boolean;
  /** Notes for a meeting: its day is asked for, and the title starts as the circle's and the day's. */
  meeting?: boolean;
  onCancel: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const keepers = useWikiPages().data?.keepers ?? [];
  const [title, setTitle] = useState(initialTitle);
  const [chosen, setChosen] = useState(parent?.keeper ?? preferred ?? "");
  // A circle asked for (say, the list's filter) only if it's one you can start pages for.
  const usable =
    lockKeeper || parent || keepers.some((circle) => circle.id === chosen) ? chosen : "";
  const keeper =
    usable ||
    (keepers.some((circle) => isCommunity(circle.id)) ? COMMUNITY_ID : keepers[0]?.id) ||
    "";
  const today = todayInVermont();
  const [meetingDate, setMeetingDate] = useState(today);
  const keeperName = keepers.find((circle) => circle.id === keeper)?.name ?? "";
  // A meeting's notes are named for the circle and the day until a title is typed.
  const [typed, setTyped] = useState(false);
  // Meeting notes start from the meeting-notes template.
  const [template, setTemplate] = useState(meeting ? "meeting-notes" : "");
  const shownTitle =
    meeting && !typed && keeperName
      ? `${keeperName} meeting, ${shortDate(meetingDate, true)}`
      : title;
  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ page: WikiPage }>("/api/wiki/pages", {
        method: "POST",
        body: JSON.stringify({
          title: shownTitle,
          body: "",
          ...(parent ? { parentId: parent.id } : from && !chosen ? { from } : { keeper }),
          ...(meeting ? { meetingDate } : {}),
          ...(template ? { template } : {}),
        }),
      }),
    onSuccess: ({ page }) => {
      queryClient.invalidateQueries({ queryKey: ["wiki"] });
      router.push(`/wiki/${page.slug}?edit=1`);
    },
    onError: (error: Error) =>
      toast({
        title: "Could not add the page",
        description: error.message,
        variant: "destructive",
      }),
  });
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (shownTitle.trim()) create.mutate();
      }}
    >
      {meeting ? (
        <label className="flex flex-wrap items-center gap-2 text-sm text-foreground">
          The meeting is on
          <Input
            type="date"
            value={meetingDate}
            onChange={(event) => setMeetingDate(event.target.value || today)}
            className="h-9 w-auto bg-white"
            aria-label="The meeting's day"
          />
        </label>
      ) : null}
      <Input
        autoFocus
        placeholder="Page title, e.g. How we run meetings"
        value={shownTitle}
        maxLength={120}
        onChange={(e) => {
          setTyped(true);
          setTitle(e.target.value);
        }}
        className="bg-white"
        aria-label="Page title"
      />
      {parent ? (
        <p className="text-sm text-muted">
          Inside <span className="font-medium text-foreground">{parent.title}</span>
          {keeperName ? ` · ${keeperName}` : ""}
        </p>
      ) : null}
      {!from && !parent && !lockKeeper && keepers.length > 1 ? (
        <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
          Parent circle
          <Select
            value={keeper}
            onChange={(event) => setChosen(event.target.value)}
            className="h-9 rounded-md px-2"
          >
            {keepers.map((circle) => (
              <option key={circle.id} value={circle.id}>
                {circle.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <TemplatePicker value={template} onChange={setTemplate} />
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={!shownTitle.trim() || create.isPending || (!from && !parent && !keeper)}
        >
          {create.isPending ? "Adding…" : meeting ? "Start the notes" : "Add page"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
