"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, Home, PartyPopper, Puzzle, Smartphone, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { LadybugIcon } from "@/components/feedback/ladybug-icon";
import { SectionArt } from "@/components/layout/section-art";
import { useInstall } from "@/components/notifications/pwa";
import { InstallSteps } from "@/components/notifications/add-as-app";
import { cn } from "@/lib/utils";

/**
 * The welcome tour: a small window of a few steps about what the portal is
 * for, shown once to each account — the first time they're signed in, on
 * whichever device — and any time after from the account menu ("Take the
 * tour"). Finishing or skipping it is remembered on the account
 * (`POST /api/auth/tour`, and this device, in case that can't be saved).
 * It never opens by itself while an admin is viewing the app as someone, or
 * on the sign-in page, a new member's form, or a page made for printing. While it talks about the ladybug, the
 * ladybug is lifted above the tour's shade and ringed; the home-screen tip
 * gives this device's way of adding the app, and is left out when it's
 * already added.
 */

const TourContext = createContext<{ start: () => void }>({ start: () => undefined });

/** Open the welcome tour (the account menu's "Take the tour"). */
export const useTour = () => useContext(TourContext);

const seenKey = (userId: string) => `cvc-tour-seen:${userId}`;
const seenHere = (userId: string) => {
  try {
    return localStorage.getItem(seenKey(userId)) === "1";
  } catch {
    return false;
  }
};

/** Pages where the tour doesn't open by itself: signing in, a new member's form, and printing. */
const QUIET = /^\/(join|login)\/|\/print$/;

export function TourProvider({ children }: { children: ReactNode }) {
  const { user, viewAs } = useSession();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  // Opened by itself at most once per visit, so closing it never brings it back.
  const offered = useRef(false);

  useEffect(() => {
    if (offered.current || !user || viewAs || user.tourSeen || QUIET.test(pathname)) return;
    if (seenHere(user.id)) return;
    offered.current = true;
    // A moment after signing in, once the page (and its welcome) has settled.
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [user, viewAs, pathname]);

  const finish = useCallback(
    (skipped: boolean) => {
      setOpen(false);
      if (!user || viewAs) return;
      try {
        localStorage.setItem(seenKey(user.id), "1");
      } catch {
        // Private browsing: the account remembers it anyway.
      }
      if (!user.tourSeen) {
        queryClient.setQueryData(["auth", "me"], (current: { user: typeof user } | undefined) =>
          current?.user ? { ...current, user: { ...current.user, tourSeen: true } } : current
        );
        void apiFetch("/api/auth/tour", { method: "POST" }).catch(() => undefined);
      }
      if (skipped)
        toast({
          title: "Take the tour any time",
          description: "It's in the menu under your name, at the top right.",
        });
    },
    [user, viewAs, queryClient, toast]
  );

  const value = useMemo(() => ({ start: () => setOpen(true) }), []);
  return (
    <TourContext.Provider value={value}>
      {children}
      {open && user ? (
        <WelcomeTour newAccount={!!user.newAccount && !user.tourSeen} onFinish={finish} />
      ) : null}
    </TourContext.Provider>
  );
}

interface Step {
  key: string;
  art: ReactNode;
  title: string;
  body: ReactNode;
  /** Something on the page to point at while this step is showing. */
  spotlight?: "ladybug";
}

const badge = (icon: ReactNode) => (
  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-primary">
    {icon}
  </span>
);

/** How to add the app to this device's home screen: the same steps as everywhere else. */
function HomeScreenHow() {
  return (
    <span className="mt-3 flex flex-col gap-2 rounded-xl bg-accent/60 px-3 py-2.5">
      <InstallSteps size="compact" />
    </span>
  );
}

function WelcomeTour({
  newAccount,
  onFinish,
}: {
  newAccount: boolean;
  onFinish: (skipped: boolean) => void;
}) {
  const { installed } = useInstall();
  const [index, setIndex] = useState(0);
  const primary = useRef<HTMLButtonElement>(null);

  const steps: Step[] = useMemo(
    () => [
      {
        key: "welcome",
        art: <Image src="/CVC.png" alt="" width={60} height={66} className="h-16 w-auto" />,
        title: "Welcome to Common Pastures",
        body: newAccount
          ? "Looks like you're signing in for the first time. Here's a quick tour — it takes a minute."
          : "Here's a quick tour of what's here — it takes a minute.",
      },
      {
        key: "common-house",
        art: badge(<Home className="h-7 w-7" aria-hidden />),
        title: "A digital common house",
        body: "The Common Pastures portal serves as a digital common house: a place for circles to manage membership, communicate how to get involved, and organize documents.",
      },
      {
        key: "your-way",
        art: badge(<Puzzle className="h-7 w-7" aria-hidden />),
        title: "Circles keep their own ways",
        body: "Circles can still use whatever systems they like, be it email, Google Docs, or good old pen and paper. The portal is designed to let people know how to engage.",
      },
      {
        key: "circle-pages",
        art: <SectionArt href="/circles" size={64} />,
        title: "Every circle has its own page",
        body: "Circles can edit their own page to fit their needs. Each circle can have its own forum for conversations and polls, and can host documents and links.",
      },
      {
        key: "community-tools",
        art: (
          <span className="flex items-center gap-2">
            <SectionArt href="/library" size={56} />
            <SectionArt href="/photos" size={56} />
          </span>
        ),
        title: "Tools for the community",
        body: "We also have some tools for the community, like a Loan Library and a Photos section. These are just for the community, and not public facing.",
      },
      {
        key: "ladybug",
        art: badge(<LadybugIcon className="h-9 w-9" />),
        title: "Found a bug? Have an idea?",
        body: (
          <>
            Click the ladybug in the corner. This portal is custom designed by our community, and
            your feedback is essential.
            <span className="mt-2 flex items-center justify-end gap-1 text-sm font-semibold text-pine">
              It&apos;s down here <ArrowDownRight className="h-4 w-4" aria-hidden />
            </span>
          </>
        ),
        spotlight: "ladybug",
      },
      ...(installed
        ? []
        : [
            {
              key: "home-screen",
              art: badge(<Smartphone className="h-7 w-7" aria-hidden />),
              title: "Pro tip: add it to your home screen",
              body: (
                <>
                  This website can be added to your home screen and work like an app, for easy
                  access.
                  <HomeScreenHow />
                </>
              ),
            },
          ]),
      {
        key: "thanks",
        art: badge(<PartyPopper className="h-7 w-7" aria-hidden />),
        title: "Thanks for taking the tour!",
        body: "You can take it again any time from the menu under your name, at the top right.",
      },
    ],
    [newAccount, installed]
  );

  const step = steps[Math.min(index, steps.length - 1)];
  const first = index === 0;
  const last = index === steps.length - 1;
  const next = useCallback(
    () => (last ? onFinish(false) : setIndex((value) => value + 1)),
    [last, onFinish]
  );
  const back = useCallback(() => setIndex((value) => Math.max(0, value - 1)), []);

  // The keyboard: Escape closes, the arrows move between steps.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFinish(!last);
      else if (event.key === "ArrowRight" && !first) next();
      else if (event.key === "ArrowLeft" && index > 1) back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [first, last, index, next, back, onFinish]);

  // Each step starts with its main button ready, so Enter moves on.
  useEffect(() => primary.current?.focus(), [index]);

  // Point at the ladybug while its step is showing.
  useEffect(() => {
    if (step.spotlight !== "ladybug") return;
    const ladybug = document.querySelector<HTMLElement>("[data-ladybug]");
    ladybug?.classList.add("tour-spotlight");
    return () => ladybug?.classList.remove("tour-spotlight");
  }, [step.spotlight]);

  // Content steps are counted without the welcome.
  const count = steps.length - 1;
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/30 p-4 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-card border border-border bg-surface p-6 shadow-elev animate-in fade-in zoom-in-95"
        data-tour={step.key}
      >
        <button
          type="button"
          onClick={() => onFinish(!last)}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-accent hover:text-foreground"
          aria-label="Close the tour"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex justify-center pt-1">{step.art}</div>
        <div className="flex flex-col gap-2 text-center">
          <h2 id="tour-title" className="font-display text-xl font-semibold text-foreground">
            {step.title}
          </h2>
          <div id="tour-body" className="text-[15px] leading-relaxed text-foreground-light">
            {step.body}
          </div>
        </div>
        {first ? (
          <div className="flex flex-col items-center gap-2 pt-1">
            <Button ref={primary} className="w-full" onClick={next}>
              Start the tour
            </Button>
            <button
              type="button"
              onClick={() => onFinish(true)}
              className="text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline"
            >
              No thanks
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 pt-1">
            <Button variant="ghost" size="sm" onClick={back} disabled={index <= 1}>
              Back
            </Button>
            <div className="flex items-center gap-1.5" aria-hidden>
              {steps.slice(1).map((entry, position) => (
                <span
                  key={entry.key}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    position + 1 === index ? "w-4 bg-primary" : "w-1.5 bg-border"
                  )}
                />
              ))}
            </div>
            <span className="sr-only">
              Step {index} of {count}
            </span>
            <Button ref={primary} size="sm" onClick={next}>
              {last ? "Done" : "Next"}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
