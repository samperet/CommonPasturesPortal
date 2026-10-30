"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Network, X } from "lucide-react";
import { DocumentsPanel, type Place } from "@/components/documents/documents-panel";
import { useUploadCircles } from "@/components/documents/use-upload-circles";
import { Card } from "@/components/ui/card";
import { SectionArt } from "@/components/layout/section-art";
import { useWikiPages } from "@/components/wiki/wiki-client";
import { Button } from "@/components/ui/button";

// The map of how pages link (d3) loads in the browser only, when it's opened.
const WikiMap = dynamic(
  () => import("@/components/wiki/map-client").then((module) => module.WikiMapClient),
  {
    ssr: false,
    loading: () => <div className="h-[50vh] animate-pulse rounded-2xl bg-accent/40" />,
  }
);

/**
 * Every circle's documents in one place — the pages written here and the
 * files uploaded — searchable by title and contents. `?circle=` shows one
 * circle's (with its sub groups'), `?kind=` one kind (`pages`, `files`,
 * `proposals`, `drafts`): the filters change the address, and the
 * documents sidebar links to them; `?new=Title&from=<pageId>` opens "Write a page" (a link to a
 * page that doesn't exist yet, or the header's New document); `?upload=1`
 * opens the upload form; `?stage=proposed` (or `consented`) starts filtered
 * to that stage; the Map button (`?map=1`, with `focus` or
 * `circle`) shows how the pages link to each other.
 */
export function DocumentsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const keepers = useWikiPages().data?.keepers ?? [];
  const showMap = params.get("map") === "1";
  const requested = params.get("new");
  const toggleMap = () => {
    const next = new URLSearchParams(params.toString());
    if (showMap) {
      next.delete("map");
      next.delete("focus");
    } else next.set("map", "1");
    router.replace(next.toString() ? `/documents?${next}` : "/documents");
  };
  const place: Place = { circle: params.get("circle") ?? "", kind: params.get("kind") ?? "" };
  const changePlace = (change: Partial<Place>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(change))
      if (value) next.set(key, value);
      else next.delete(key);
    router.replace(next.toString() ? `/documents?${next}` : "/documents", { scroll: false });
  };
  const { circles, uploadCircles, typeCircles } = useUploadCircles();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <SectionArt href="/documents" size={48} />
        <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
        <Button
          variant="outline"
          className="ml-auto gap-1.5"
          onClick={toggleMap}
          aria-pressed={showMap}
          title="How the written pages link to each other"
        >
          {showMap ? <X className="h-4 w-4" /> : <Network className="h-4 w-4" />}{" "}
          {showMap ? "Close map" : "Map"}
        </Button>
      </div>
      <p className="-mt-3 text-sm text-muted">
        Pages written here and files uploaded, for every circle. Anything people will keep improving
        is best written as a page; a fixed record, or anything from outside, uploaded as a file.
      </p>
      {showMap ? (
        <Card className="flex flex-col gap-4">
          <Suspense fallback={<div className="h-[50vh] animate-pulse rounded-2xl bg-accent/40" />}>
            <WikiMap />
          </Suspense>
        </Card>
      ) : null}
      {/* Each document a white box on the panel's green. */}
      <Card className="bg-accent/70" data-documents-panel>
        <DocumentsPanel
          circles={circles}
          uploadCircles={uploadCircles}
          typeCircles={typeCircles}
          canWrite={keepers.length > 0}
          place={place}
          onPlace={changePlace}
          startUpload={params.get("upload") === "1"}
          initialStage={params.get("stage") ?? ""}
          newPage={
            requested !== null
              ? { title: requested, from: params.get("from") ?? undefined }
              : undefined
          }
        />
      </Card>
    </div>
  );
}
