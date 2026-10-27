"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Play, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { ImportPlan, ImportState } from "@/lib/outline/import";
import { timeAgo } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SectionHeading } from "@/components/ui/section-heading";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useToast } from "@/components/ui/use-toast";

/**
 * Admin → Import from Outline: what the Outline server holds and where it
 * would land (each collection → a circle, made if missing), then the import
 * itself, batch by batch, with its tally, log and anything that went wrong.
 * Re-runnable until the wiki is retired (`lib/outline/import.ts`).
 */

type Shown = {
  configured: boolean;
  host: string | null;
  running: boolean;
  remaining: number;
  state: ImportState;
  plan?: ImportPlan;
};
const KEY = ["admin", "outline"];

export function OutlineImportClient() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const status = useQuery({ queryKey: KEY, queryFn: () => apiFetch<Shown>("/api/admin/outline") });
  const preview = useMutation({
    mutationFn: () => apiFetch<Shown>("/api/admin/outline?plan=1"),
    onSuccess: (shown) => setPlan(shown.plan ?? null),
    onError: (error: Error) =>
      toast({ title: "Couldn't read Outline", description: error.message, variant: "destructive" }),
  });
  const run = useMutation({
    mutationFn: async () => {
      let shown = await apiFetch<Shown>("/api/admin/outline", {
        method: "POST",
        body: JSON.stringify({ action: "start" }),
      });
      queryClient.setQueryData(KEY, shown);
      while (shown.remaining > 0 && !shown.state.finishedAt) {
        shown = await apiFetch<Shown>("/api/admin/outline", {
          method: "POST",
          body: JSON.stringify({ action: "continue" }),
        });
        queryClient.setQueryData(KEY, shown);
      }
      return shown;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["wiki"] }),
    onError: (error: Error) => {
      toast({ title: "The import stopped", description: error.message, variant: "destructive" });
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });

  if (status.isLoading) return <Loading />;
  if (status.error || !status.data)
    return <ErrorCard error={status.error} fallback="Couldn't load the import's state." />;
  const { configured, host, state, remaining } = status.data;
  const busy = run.isPending || status.data.running;
  const progress = state.total ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6" data-outline-import>
      <div className="flex flex-col gap-1">
        <Link
          href="/admin/settings"
          className="flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Admin settings
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Download className="h-6 w-6 text-primary" aria-hidden /> Import from Outline
        </h1>
        <p className="text-sm text-foreground-light">
          Brings every document in the Outline wiki into CVC: each collection becomes a circle (one
          with the same name, or a new one), each document a page in that circle, in the same order
          and nesting, with its icon, dates, authors, images, files and comments. You can run it
          again later: pages already brought over are updated, not doubled.
        </p>
      </div>

      {!configured ? (
        <Card className="text-sm text-foreground" data-outline-unset>
          <p>
            No Outline server is set up. In Vercel, set <code>OUTLINE_URL</code> (the wiki&apos;s
            address) and <code>OUTLINE_API_TOKEN</code> (an Outline admin&apos;s API key, from
            Outline&apos;s Settings → API), then come back here.
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <SectionHeading>What&apos;s there</SectionHeading>
            <p className="text-sm text-foreground-light">
              The server is <code>{host}</code>.
            </p>
            {plan ? (
              <table className="w-full text-sm" data-outline-plan>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-1 pr-3">Collection</th>
                    <th className="py-1 pr-3">Documents</th>
                    <th className="py-1">Becomes</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.collections.map((collection) => (
                    <tr key={collection.id} className="border-t border-border">
                      <td className="py-1.5 pr-3 font-medium text-foreground">{collection.name}</td>
                      <td className="py-1.5 pr-3">{collection.documents}</td>
                      <td className="py-1.5">
                        {collection.circle ? (
                          <>
                            the circle <strong>{collection.circle.name}</strong>
                          </>
                        ) : (
                          <Pill tone="amber" size="xs">
                            a new circle
                          </Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {plan ? (
              <p className="text-xs text-muted">
                {plan.alreadyHere} {plan.alreadyHere === 1 ? "page" : "pages"} already brought over
                before.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={preview.isPending || busy}
                onClick={() => preview.mutate()}
                data-outline-preview
              >
                <RefreshCw className="h-4 w-4" />{" "}
                {preview.isPending ? "Reading…" : plan ? "Read again" : "See what's there"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() => run.mutate()}
                data-outline-run
              >
                <Play className="h-4 w-4" />{" "}
                {busy ? "Importing…" : state.finishedAt ? "Run again" : "Run the import"}
              </Button>
            </div>
          </Card>

          {state.startedAt ? (
            <Card className="flex flex-col gap-3" data-outline-state>
              <SectionHeading>
                {state.finishedAt ? "Last run" : busy ? "Running" : "Stopped part way"}
              </SectionHeading>
              <p className="text-sm text-foreground-light">
                Started {timeAgo(state.startedAt)} by {state.by}
                {state.finishedAt
                  ? `, finished ${timeAgo(state.finishedAt)}`
                  : remaining
                    ? `, ${remaining} to go`
                    : ""}
                .
              </p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-accent" aria-hidden>
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <dl
                className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4"
                data-outline-tally
              >
                {[
                  ["Brought over", state.created],
                  ["Updated", state.updated],
                  ["Already here", state.unchanged],
                  ["Comments", state.comments],
                  ["Images", state.images],
                  ["Files", state.files],
                  ["Circles made", state.circlesMade.length],
                  ["Problems", state.errors.length],
                ].map(([label, value]) => (
                  <div
                    key={label as string}
                    className="flex justify-between gap-2 rounded-lg bg-accent/40 px-2 py-1"
                  >
                    <dt className="text-foreground-light">{label}</dt>
                    <dd className="font-semibold text-foreground">{value as number}</dd>
                  </div>
                ))}
              </dl>
              {!busy && !state.finishedAt && remaining ? (
                <Button
                  type="button"
                  size="sm"
                  className="self-start gap-1.5"
                  onClick={() => run.mutate()}
                >
                  <Play className="h-4 w-4" /> Carry on
                </Button>
              ) : null}
              {state.renamed.length ? (
                <div className="text-sm">
                  <p className="font-medium text-foreground">
                    Renamed, because another page had the title
                  </p>
                  <ul className="list-disc pl-5 text-foreground-light" data-outline-renamed>
                    {state.renamed.map((entry) => (
                      <li key={entry.outlineTitle + entry.title}>
                        “{entry.outlineTitle}” → “{entry.title}”
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {state.unmatchedAuthors.length ? (
                <p className="text-sm text-foreground-light" data-outline-unmatched>
                  Authors not matched to a resident (by email): {state.unmatchedAuthors.join(", ")}.
                  Their pages are credited under their Outline names.
                </p>
              ) : null}
              {state.errors.length ? (
                <div className="text-sm">
                  <p className="font-medium text-destructive">Problems</p>
                  <ul className="list-disc pl-5 text-foreground-light" data-outline-errors>
                    {state.errors.slice(-20).map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">Log</summary>
                <ol
                  className="mt-1 max-h-64 list-decimal overflow-auto pl-5 text-foreground-light"
                  data-outline-log
                >
                  {state.log.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ol>
              </details>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
