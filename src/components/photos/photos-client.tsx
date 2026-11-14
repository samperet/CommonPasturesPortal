"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ImagePlus, Pencil, Play, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { preparePhoto, uploadImage } from "@/lib/image-client";
import type { Photo } from "@/lib/photos/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { SectionArt } from "@/components/layout/section-art";
import { Loading, ErrorCard } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { Slideshow } from "@/components/photos/slideshow";

const photoUrl = (photo: Photo) => `/api/photos/${photo.id}`;

interface Pending {
  key: string;
  file: File;
  preview: string;
  caption: string;
}

/** Photos chosen for upload, each with a caption, before they're sent. */
function UploadPanel({ files, onDone }: { files: File[]; onDone: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending[]>(() =>
    files.map((file, index) => ({
      key: `${index}-${file.name}`,
      file,
      preview: URL.createObjectURL(file),
      caption: "",
    }))
  );
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => () => pending.forEach((item) => URL.revokeObjectURL(item.preview)), [pending]);

  const upload = useMutation({
    mutationFn: async () => {
      for (const [index, item] of pending.entries()) {
        setProgress(index + 1);
        const blob = await preparePhoto(item.file);
        await uploadImage(`/api/photos?caption=${encodeURIComponent(item.caption.trim())}`, blob);
      }
    },
    onSuccess: () => {
      toast({ title: pending.length === 1 ? "Photo added" : `${pending.length} photos added` });
      onDone();
    },
    onError: (err: Error) =>
      toast({ title: "Could not add photo", description: err.message, variant: "destructive" }),
    onSettled: () => {
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ["photos"] });
    },
  });

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">
        Add {pending.length === 1 ? "a photo" : `${pending.length} photos`}
      </h2>
      <ul className="flex flex-col gap-3">
        {pending.map((item) => (
          <li key={item.key} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
            <img src={item.preview} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            <Input
              placeholder="Caption (optional)"
              value={item.caption}
              maxLength={300}
              disabled={upload.isPending}
              onChange={(event) =>
                setPending((items) =>
                  items.map((entry) =>
                    entry.key === item.key ? { ...entry, caption: event.target.value } : entry
                  )
                )
              }
              className="bg-white"
              aria-label={`Caption for ${item.file.name}`}
            />
            {pending.length > 1 ? (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                disabled={upload.isPending}
                onClick={() =>
                  setPending((items) => items.filter((entry) => entry.key !== item.key))
                }
                aria-label={`Don't add ${item.file.name}`}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => upload.mutate()} disabled={upload.isPending || !pending.length}>
          {progress !== null
            ? pending.length > 1
              ? `Uploading ${progress} of ${pending.length}…`
              : "Uploading…"
            : pending.length === 1
              ? "Add photo"
              : `Add ${pending.length} photos`}
        </Button>
        <Button variant="outline" onClick={onDone} disabled={upload.isPending}>
          Cancel
        </Button>
        <span className="text-xs text-muted">Photos are visible only to signed-in residents.</span>
      </div>
    </Card>
  );
}

/** Full-screen view of one photo, with previous/next, a slideshow from here and, for its owner or an admin, caption editing and removal. */
function Viewer({
  photos,
  index,
  onIndex,
  onClose,
  onSlideshow,
}: {
  photos: Photo[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onSlideshow: () => void;
}) {
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const photo = photos[index];
  // Anyone can remove a photo; captions are for whoever added it, or an admin.
  const canEditCaption =
    !!user && (user.isAdmin || (photo.uploaderId !== null && photo.uploaderId === user.id));
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo.caption);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setEditing(false);
    setCaption(photo.caption);
  }, [photo.id, photo.caption]);

  const step = useCallback(
    (delta: number) => onIndex((index + delta + photos.length) % photos.length),
    [index, photos.length, onIndex]
  );

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (editing) return;
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose, step]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["photos"] });
  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/photos/${photo.id}`, { method: "PATCH", body: JSON.stringify({ caption }) }),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
    onError: (err: Error) =>
      toast({ title: "Could not save caption", description: err.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/photos/${photo.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Photo removed" });
      if (photos.length <= 1) onClose();
      else if (index === photos.length - 1) onIndex(index - 1);
      refresh();
    },
    onError: (err: Error) =>
      toast({ title: "Could not remove photo", description: err.message, variant: "destructive" }),
  });

  const added = new Date(photo.createdAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption || "Photo"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm tabular-nums text-white/70">
          {index + 1} / {photos.length}
        </span>
        {photos.length > 1 ? (
          <button
            onClick={onSlideshow}
            className="ml-auto mr-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/85 hover:bg-white/10 hover:text-white"
            data-viewer-slideshow
          >
            <Play className="h-4 w-4" aria-hidden /> Slideshow
          </button>
        ) : null}
        <button
          ref={closeRef}
          onClick={onClose}
          className="rounded-full p-2 hover:bg-white/10"
          aria-label="Close"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- served privately by the API, not through the image optimizer */}
        <img
          key={photo.id}
          src={photoUrl(photo)}
          alt={photo.caption || "Community photo"}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
        {photos.length > 1 ? (
          <>
            <button
              onClick={() => step(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60 md:left-4"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button
              onClick={() => step(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60 md:right-4"
              aria-label="Next photo"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-4">
        {editing ? (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Input
              autoFocus
              value={caption}
              maxLength={300}
              onChange={(event) => setCaption(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditing(false);
              }}
              className="bg-white text-foreground"
              aria-label="Caption"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            {photo.caption ? <p className="text-base">{photo.caption}</p> : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
              <span>
                {photo.uploaderName ? `Added by ${photo.uploaderName} · ` : ""}
                {added}
              </span>
              {canEditCaption ? (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />{" "}
                  {photo.caption ? "Edit caption" : "Add caption"}
                </button>
              ) : null}
              <button
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Remove this photo for everyone?",
                      confirmLabel: "Remove",
                      destructive: true,
                    })
                  )
                    remove.mutate();
                }}
                disabled={remove.isPending}
                className="inline-flex items-center gap-1 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" /> {remove.isPending ? "Removing…" : "Remove"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function PhotosClient() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  // The slideshow: from which photo, and whether it came from the viewer (which it returns to).
  const [show, setShow] = useState<{ startId: string | null; fromViewer: boolean } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["photos"],
    queryFn: () => apiFetch<{ photos: Photo[] }>("/api/photos"),
    // While the slideshow runs, photos added meanwhile come into it.
    refetchInterval: show ? 60_000 : false,
  });
  const photos = data?.photos ?? [];

  // `/photos?slideshow` starts the slideshow once the photos are in (say, on a screen in the common house).
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || photos.length < 2) return;
    asked.current = true;
    if (new URLSearchParams(window.location.search).has("slideshow"))
      setShow({ startId: null, fromViewer: false });
  }, [photos.length]);

  // Keep the viewer in range as photos come and go.
  useEffect(() => {
    if (open !== null && open >= photos.length) setOpen(photos.length ? photos.length - 1 : null);
  }, [open, photos.length]);

  const close = useCallback(() => setOpen(null), []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <SectionArt href="/photos" size={48} />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Photos</h1>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []).slice(0, 20);
            if (files.length) setChosen(files);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          {photos.length > 1 ? (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setShow({ startId: null, fromViewer: false })}
              data-photos-slideshow
            >
              <Play className="h-4 w-4" /> Slideshow
            </Button>
          ) : null}
          <Button
            className="gap-1.5"
            onClick={() => fileInput.current?.click()}
            disabled={chosen !== null}
          >
            <ImagePlus className="h-4 w-4" /> Add photos
          </Button>
        </div>
      </div>

      {chosen ? (
        <UploadPanel
          key={chosen.map((file) => file.name).join("|")}
          files={chosen}
          onDone={() => setChosen(null)}
        />
      ) : null}

      {isLoading ? (
        <Loading>Loading photos…</Loading>
      ) : error ? (
        <ErrorCard error={error} />
      ) : photos.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                onClick={() => setOpen(index)}
                className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border bg-accent shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={photo.caption ? `View photo: ${photo.caption}` : "View photo"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- served privately by the API, not through the image optimizer */}
                <img
                  src={photoUrl(photo)}
                  alt={photo.caption}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                {photo.caption ? (
                  <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-left text-xs text-white">
                    {photo.caption}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <p className="text-sm text-muted">No photos yet — add the first one.</p>
        </Card>
      )}

      {open !== null && photos[open] && !show ? (
        <Viewer
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={close}
          onSlideshow={() => {
            setShow({ startId: photos[open].id, fromViewer: true });
            setOpen(null);
          }}
        />
      ) : null}

      {show && photos.length ? (
        <Slideshow
          photos={photos}
          startId={show.startId}
          onClose={(lastId) => {
            // Back to the viewer it came from, on the photo it ended on.
            const at = photos.findIndex((photo) => photo.id === lastId);
            if (show.fromViewer && at >= 0) setOpen(at);
            setShow(null);
          }}
        />
      ) : null}
    </div>
  );
}
