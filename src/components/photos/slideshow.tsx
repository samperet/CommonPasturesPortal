"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Pause,
  Play,
  Shuffle,
  X,
} from "lucide-react";
import type { Photo } from "@/lib/photos/store";
import { cn } from "@/lib/utils";

/**
 * The photos as a slideshow, full screen where the browser allows it: each
 * photo fades into the next and drifts slowly closer while it's shown, its
 * caption and who added it beneath. It moves on by itself (every 3, 5, 8
 * or 12 seconds, a bar along the bottom counting down) once the photo has
 * loaded, the next one loaded ahead; in order or shuffled — both remembered
 * in this browser. Space pauses, the arrows (or a swipe) step, F switches
 * full screen, Escape leaves. The controls and the pointer tuck away after
 * a few seconds of stillness while it plays. The screen is kept awake, it
 * waits while the tab is hidden, and photos added while it runs come up
 * next (the gallery is fetched every minute meanwhile). For those who'd
 * rather less motion: no drift, a quicker fade.
 */

const SPEEDS = [3, 5, 8, 12] as const;
const PREFS_KEY = "cvc-slideshow";
const IDLE_MS = 3000;
/** Where each photo drifts towards, in turn. */
const ORIGINS = ["50% 50%", "30% 35%", "70% 65%", "65% 30%", "35% 70%"];

type Prefs = { seconds: number; shuffle: boolean };
type Layer = { id: string; seq: number; ready: boolean };

const photoUrl = (photo: Photo) => `/api/photos/${photo.id}`;

function readPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
    return {
      seconds: SPEEDS.find((speed) => speed === saved?.seconds) ?? 5,
      shuffle: !!saved?.shuffle,
    };
  } catch {
    return { seconds: 5, shuffle: false };
  }
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** The order to show them in: the gallery's, or shuffled — starting from `first` either way. */
const orderOf = (photos: Photo[], first: string, shuffle: boolean) => {
  const ids = photos.map((photo) => photo.id);
  return shuffle ? [first, ...shuffled(ids.filter((id) => id !== first))] : ids;
};

export function Slideshow({
  photos,
  startId,
  onClose,
}: {
  photos: Photo[];
  /** The photo to start from (the first, if none). */
  startId?: string | null;
  /** Leaving, with the photo last shown. */
  onClose: (lastId: string | null) => void;
}) {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const first = startId && photos.some((photo) => photo.id === startId) ? startId : photos[0]?.id;
  const [currentId, setCurrentId] = useState<string | undefined>(first);
  const [order, setOrder] = useState<string[]>(() =>
    first ? orderOf(photos, first, prefs.shuffle) : []
  );
  const [playing, setPlaying] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [chrome, setChrome] = useState(true);
  const [full, setFull] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout>>();
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const still = useMemo(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const fadeMs = still ? 200 : 900;
  const canFull = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const byId = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);

  const latest = useRef({ currentId, onClose });
  latest.current = { currentId, onClose };
  const close = useCallback(() => latest.current.onClose(latest.current.currentId ?? null), []);

  const remember = (next: Prefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // Not remembered, then.
    }
  };

  // The gallery changes as it runs: photos gone are skipped, new ones come up next.
  useEffect(() => {
    if (!photos.length) return close();
    setOrder((current) => {
      const ids = new Set(photos.map((photo) => photo.id));
      const kept = current.filter((id) => ids.has(id));
      const fresh = photos.map((photo) => photo.id).filter((id) => !current.includes(id));
      if (!fresh.length && kept.length === current.length) return current;
      const at = kept.indexOf(latest.current.currentId ?? "") + 1;
      return [...kept.slice(0, at), ...fresh, ...kept.slice(at)];
    });
  }, [photos, close]);
  useEffect(() => {
    if (currentId && byId.has(currentId)) return;
    // The one showing was removed: on to the next still here.
    const at = order.indexOf(currentId ?? "");
    const next = order.slice(at + 1).find((id) => byId.has(id)) ?? photos[0]?.id;
    if (next) setCurrentId(next);
  }, [currentId, byId, order, photos]);

  const count = order.length;
  const position = Math.max(0, order.indexOf(currentId ?? ""));
  const step = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setCurrentId(order[(position + delta + count) % count]);
    },
    [order, position, count]
  );

  // Each photo shown is a layer that fades in over the one before, which then goes.
  useEffect(() => {
    if (!currentId) return;
    setLayers((current) =>
      current.at(-1)?.id === currentId
        ? current
        : [...current.slice(-1), { id: currentId, seq: ++seq.current, ready: false }]
    );
  }, [currentId]);
  const top = layers.at(-1);
  const ready = !!top && top.id === currentId && top.ready;
  useEffect(() => {
    if (!ready || layers.length < 2) return;
    const timer = setTimeout(() => setLayers((current) => current.slice(-1)), fadeMs);
    return () => clearTimeout(timer);
  }, [ready, layers.length, fadeMs]);
  const loaded = (layerSeq: number) =>
    setLayers((current) =>
      current.map((layer) => (layer.seq === layerSeq ? { ...layer, ready: true } : layer))
    );

  // On to the next once this one has loaded and had its time — not while paused or hidden.
  useEffect(() => {
    if (!playing || !ready || hidden || count < 2) return;
    const timer = setTimeout(() => step(1), prefs.seconds * 1000);
    return () => clearTimeout(timer);
  }, [playing, ready, hidden, count, step, prefs.seconds, currentId]);

  // The next one, loaded ahead.
  useEffect(() => {
    const next = byId.get(order[(position + 1) % Math.max(count, 1)] ?? "");
    if (next && next.id !== currentId) new Image().src = photoUrl(next);
  }, [order, position, count, byId, currentId]);

  // The controls tuck away after a few still seconds.
  const wake = useCallback(() => {
    setChrome(true);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setChrome(false), IDLE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => clearTimeout(idle.current);
  }, [wake]);
  const showChrome = chrome || !playing;

  // Full screen when it starts (where the browser allows it), and left when it ends.
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void root.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    const onChange = () => setFull(!!root.current && document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", onChange);
    if (document.fullscreenEnabled) void root.current?.requestFullscreen?.().catch(() => undefined);
    root.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      document.body.style.overflow = overflow;
    };
  }, []);

  // The screen kept awake, and waiting while the tab is hidden.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let ended = false;
    const keepAwake = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
        if (ended) void lock?.release();
      } catch {
        // Not offered here (or refused): the screen may sleep.
      }
    };
    void keepAwake();
    const onVisibility = () => {
      setHidden(document.hidden);
      if (!document.hidden) void keepAwake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      ended = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // Keys: Space (or K) pauses, the arrows step, F switches full screen, Escape leaves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      wake();
      if (event.key === "Escape") {
        if (document.fullscreenElement) toggleFull();
        else close();
      } else if (event.key === " " || event.key === "k") {
        event.preventDefault();
        setPlaying((current) => !current);
      } else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
      else if (event.key === "f" || event.key === "F") toggleFull();
      else return;
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [wake, step, toggleFull, close]);

  const photo = currentId ? byId.get(currentId) : undefined;
  const added = photo
    ? new Date(photo.createdAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const control =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm text-white/85 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
  const big =
    "pointer-events-auto inline-flex items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

  return (
    <div
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Slideshow"
      className={cn(
        "fixed inset-0 z-[60] touch-none select-none overflow-hidden bg-black text-white outline-none",
        !showChrome && "cursor-none"
      )}
      onPointerMove={wake}
      onPointerDown={(event) => {
        wake();
        swipe.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const from = swipe.current;
        swipe.current = null;
        if (!from) return;
        const dx = event.clientX - from.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(event.clientY - from.y))
          step(dx < 0 ? 1 : -1);
      }}
      data-slideshow={playing ? "playing" : "paused"}
    >
      {/* The photos: the one before fading out under the one coming in. */}
      {layers.map((layer) => {
        const shown = byId.get(layer.id);
        if (!shown) return null;
        const drifting = layer.ready && !still;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- served privately by the API, not through the image optimizer
          <img
            key={layer.seq}
            src={photoUrl(shown)}
            alt={shown.caption || "Community photo"}
            draggable={false}
            onLoad={() => loaded(layer.seq)}
            onError={() => loaded(layer.seq)}
            className={cn(
              "absolute inset-0 h-full w-full object-contain transition-opacity ease-in-out",
              layer.ready ? "opacity-100" : "opacity-0"
            )}
            style={{
              transitionDuration: `${fadeMs}ms`,
              transformOrigin: ORIGINS[layer.seq % ORIGINS.length],
              animation: drifting
                ? `cvc-slide-drift ${prefs.seconds + fadeMs / 1000}s ease-out forwards`
                : undefined,
              animationPlayState: playing ? "running" : "paused",
            }}
            data-slide={layer.id}
          />
        );
      })}

      {/* Along the top: where it's at, how fast, shuffle, full screen, and leaving. */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-10 pt-3 transition-opacity duration-300 sm:px-5",
          showChrome ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <span className="px-1 text-sm tabular-nums text-white/80" data-slideshow-count>
          {position + 1} / {count}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <div
            role="radiogroup"
            aria-label="Seconds for each photo"
            className="mr-1 flex items-center rounded-full bg-white/10 p-0.5"
          >
            {SPEEDS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={prefs.seconds === seconds}
                onClick={() => remember({ ...prefs, seconds })}
                className={cn(
                  "h-8 min-w-[2.25rem] rounded-full px-2 text-xs font-medium tabular-nums transition",
                  prefs.seconds === seconds
                    ? "bg-white text-black"
                    : "text-white/80 hover:bg-white/15 hover:text-white"
                )}
                title={`${seconds} seconds for each photo`}
                data-slideshow-speed={seconds}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={prefs.shuffle}
            onClick={() => {
              const shuffle = !prefs.shuffle;
              remember({ ...prefs, shuffle });
              if (currentId) setOrder(orderOf(photos, currentId, shuffle));
            }}
            className={cn(control, prefs.shuffle && "bg-white/20 text-white")}
            title={prefs.shuffle ? "Shuffled — show them in order" : "Shuffle them"}
            data-slideshow-shuffle
          >
            <Shuffle className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Shuffle</span>
          </button>
          {canFull ? (
            <button
              type="button"
              onClick={toggleFull}
              className={control}
              aria-label={full ? "Leave full screen" : "Full screen"}
              title={full ? "Leave full screen (F)" : "Full screen (F)"}
            >
              {full ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={close}
            className={control}
            aria-label="Close the slideshow"
            title="Close (Esc)"
            data-slideshow-close
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Previous, play or pause, next. */}
      {count > 1 ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-between px-2 transition-opacity duration-300 sm:px-6",
            showChrome ? "opacity-100" : "opacity-0"
          )}
        >
          <button
            type="button"
            onClick={() => step(-1)}
            className={cn(big, "h-12 w-12", !showChrome && "pointer-events-none")}
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((current) => !current)}
            className={cn(big, "h-16 w-16", !showChrome && "pointer-events-none")}
            aria-label={playing ? "Pause" : "Play"}
            title={playing ? "Pause (Space)" : "Play (Space)"}
            data-slideshow-play
          >
            {playing ? <Pause className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className={cn(big, "h-12 w-12", !showChrome && "pointer-events-none")}
            aria-label="Next photo"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </div>
      ) : null}

      {/* Beneath: its caption, and who added it when (with the controls). */}
      {photo ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-6 pt-20 sm:px-10"
          aria-live={playing ? "off" : "polite"}
        >
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-1 text-center">
            {photo.caption ? (
              <p
                className="text-lg font-medium leading-snug drop-shadow sm:text-xl"
                data-slide-caption
              >
                {photo.caption}
              </p>
            ) : null}
            <p
              className={cn(
                "text-sm text-white/70 transition-opacity duration-300",
                showChrome ? "opacity-100" : "opacity-0"
              )}
            >
              {photo.uploaderName ? `Added by ${photo.uploaderName} · ` : ""}
              {added}
            </p>
          </div>
        </div>
      ) : null}

      {/* How long until the next, along the bottom edge. */}
      {playing && ready && count > 1 && !hidden ? (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10" aria-hidden>
          <div
            key={`${top?.seq}-${prefs.seconds}`}
            className="h-full origin-left bg-white/70"
            style={{ animation: `cvc-slide-progress ${prefs.seconds}s linear forwards` }}
            data-slideshow-progress
          />
        </div>
      ) : null}
    </div>
  );
}
