"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Download,
  MoreVertical,
  Share,
  Smartphone,
} from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { isIos, useInstall } from "@/components/notifications/pwa";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Saving CVC as an app, for community notifications — one set of steps for
 * this device, used everywhere it's offered: the popup on a phone that
 * isn't using the app yet (`InstallPrompt`), **Save as an app** in the menu
 * under your name, its own section on your profile, the phone menu
 * (`layout/install-help.tsx`) and the welcome tour. Where the browser offers
 * its own install, one **Save as an app** button. On an iPhone (Chrome or
 * Safari alike), the Share button → Add to Home Screen; on other phones,
 * the browser's ⋮ menu; on a computer, Chrome's or Edge's install, or
 * Safari's Add to Dock. In the popup, an arrow points at the screen's edge
 * where that button is: top right in Chrome and on Android, the bottom in
 * Safari.
 */

/** How long "Not now" keeps the popup away; "I've added it" keeps it away on this browser. */
const SNOOZE_DAYS = 14;
const SNOOZE_KEY = "cvc-install-prompt";
/** Visits to CVC on this browser, so the popup waits until someone keeps coming back. */
const VISITS_KEY = "cvc-visits";
/** Opening CVC again after this long away is a new visit. */
const VISIT_GAP_MS = 60 * 60_000;
/** The popup offers itself once someone has come back this many times. */
const RETURNS_BEFORE_ASKING = 3;
/** Pages the popup never covers: signing in, joining, printing. */
const QUIET = /^\/(join|login|welcome)(\/|$)|\/print$/;

/** Which phone (or not) this is, for the steps: where its Share or menu button sits. */
type Device = "iphone-top" | "iphone-bottom" | "android" | "computer";

function deviceOf(): Device {
  const agent = navigator.userAgent;
  // Chrome on an iPhone keeps Share at the top right; Safari at the bottom.
  if (isIos()) return /CriOS/.test(agent) ? "iphone-top" : "iphone-bottom";
  if (/Android/i.test(agent)) return "android";
  return "computer";
}

function useDevice(): Device | null {
  const [device, setDevice] = useState<Device | null>(null);
  useEffect(() => setDevice(deviceOf()), []);
  return device;
}

/** A browser button as it looks, to find it by: the Share box with its arrow, or ⋮. */
function ButtonPicture({ device }: { device: Device }) {
  const Icon = device === "android" ? MoreVertical : Share;
  return (
    <span
      className="mx-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-primary/40 bg-white align-middle text-primary shadow-soft"
      data-button-picture
    >
      <Icon className="h-5 w-5" aria-label={device === "android" ? "the ⋮ menu" : "Share"} />
    </span>
  );
}

/** The steps for this device. `large` for the phone menu's big print; `compact` for the tour. */
export function InstallSteps({ size = "normal" }: { size?: "compact" | "normal" | "large" }) {
  const install = useInstall();
  const device = useDevice();
  const text = size === "large" ? "text-base" : "text-sm";
  const list = cn(
    "flex list-decimal flex-col gap-2 pl-5 leading-relaxed",
    text,
    size === "large" && "gap-3 pl-6"
  );
  if (install.installed)
    return (
      <p className={cn("flex items-center gap-1.5 text-foreground-light", text)} data-install-done>
        <Check className="h-4 w-4 text-primary" aria-hidden /> You&apos;re using the app on this
        device.
      </p>
    );
  if (install.canPrompt)
    return (
      <Button
        size={size === "large" ? "lg" : "sm"}
        className={cn("gap-1.5", size === "large" ? "w-full text-base" : "w-fit")}
        onClick={() => void install.install()}
        data-install-button
      >
        <Download className="h-4 w-4" aria-hidden /> Save as an app
      </Button>
    );
  if (!device) return null;
  if (device === "computer")
    return (
      <ul className={cn(list, "list-disc")} data-install-computer>
        <li>
          <strong>Chrome or Edge:</strong> click the install button at the end of the address bar,
          or open the browser&apos;s menu and choose <strong>Install</strong>.
        </li>
        <li>
          <strong>Safari on a Mac:</strong> choose <strong>File → Add to Dock</strong>.
        </li>
        <li>
          <strong>On your phone:</strong> open CVC there and choose <strong>Save as an app</strong>{" "}
          in the menu under your name.
        </li>
      </ul>
    );
  if (device === "android")
    return (
      <ol className={list} data-install-android>
        <li>
          Tap the menu <ButtonPicture device={device} /> at the <strong>top right</strong> of the
          screen.
        </li>
        <li>
          Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.
        </li>
        <li>
          Tap <strong>Install</strong>. CVC&apos;s green icon appears with your other apps.
        </li>
      </ol>
    );
  return (
    <ol className={list} data-install-ios>
      <li>
        Tap the Share button <ButtonPicture device={device} />{" "}
        {device === "iphone-top" ? (
          <>
            at the <strong>top right</strong> of the screen.
          </>
        ) : (
          <>
            at the <strong>bottom</strong> of the screen (on the newest iPhones, tap{" "}
            <strong>⋯</strong> there first).
          </>
        )}
      </li>
      <li>
        Tap <strong>Add to Home Screen</strong>. Don&apos;t see it? Scroll down, or tap{" "}
        <strong>More</strong>.
      </li>
      <li>
        Tap <strong>Add</strong>. CVC&apos;s green icon appears with your other apps.
      </li>
    </ol>
  );
}

/**
 * While the popup is open on a phone: an arrow at the edge of the screen,
 * pointing at the browser's own Share (or ⋮) button beyond it.
 */
function ButtonPointer({ device }: { device: Device }) {
  const top = device === "iphone-top" || device === "android";
  const Arrow = top ? ArrowUpRight : ArrowDown;
  return createPortal(
    <div
      className={cn(
        "pointer-events-none fixed z-[60] flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-foreground shadow-elev motion-safe:animate-bounce",
        top ? "right-2 top-2" : "bottom-3 left-1/2 -translate-x-1/2"
      )}
      data-button-pointer={top ? "top-right" : "bottom"}
      aria-hidden
    >
      {top ? null : <Arrow className="h-5 w-5 text-primary" />}
      <ButtonPicture device={device} /> {device === "android" ? "Menu" : "Share"}
      {top ? <Arrow className="h-5 w-5 text-primary" /> : null}
    </div>,
    document.body
  );
}

/** The call to action. */
const TITLE = "Save as an app for community notifications";
const WHY = "CVC opens with one tap from your home screen, and lets you know when neighbors post.";

/** The steps in a popup: from the menu under your name, or offered on a phone (`auto`). */
export function AddAsAppDialog({ onClose, auto = false }: { onClose: () => void; auto?: boolean }) {
  const install = useInstall();
  const device = useDevice();
  const snooze = (days: number) => {
    try {
      localStorage.setItem(SNOOZE_KEY, new Date(Date.now() + days * 86_400_000).toISOString());
    } catch {
      // Private browsing: it may ask again next time.
    }
    onClose();
  };
  const pointing = !install.installed && !install.canPrompt && !!device && device !== "computer";
  return (
    <Dialog
      title={install.installed ? "Saved as an app" : TITLE}
      icon={<Smartphone className="h-5 w-5 shrink-0 text-primary" />}
      onClose={auto ? () => snooze(SNOOZE_DAYS) : onClose}
    >
      <div className="flex flex-col gap-4" data-add-as-app>
        {install.installed ? null : <p className="text-sm text-foreground-light">{WHY}</p>}
        <InstallSteps />
        {install.installed ? null : (
          <p className="text-xs text-muted">
            Then open CVC from its icon and turn notifications on under{" "}
            <strong>Notifications</strong>, in the menu under your name.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {auto ? (
            <>
              <Button size="sm" variant="outline" onClick={() => snooze(SNOOZE_DAYS)}>
                Not now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted"
                onClick={() => snooze(3650)}
                data-install-already
              >
                I&apos;ve saved it already
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
      {pointing && device ? <ButtonPointer device={device} /> : null}
    </Dialog>
  );
}

/** Count this visit (a page load after an hour away is a new one); how many times they've come back. */
function noteVisit(now = Date.now()): number {
  try {
    const saved = JSON.parse(localStorage.getItem(VISITS_KEY) ?? "null") as {
      count?: number;
      last?: number;
    } | null;
    const fresh = !saved?.last || now - saved.last > VISIT_GAP_MS;
    const count = (saved?.count ?? 0) + (fresh ? 1 : 0);
    localStorage.setItem(VISITS_KEY, JSON.stringify({ count, last: now }));
    return count - 1;
  } catch {
    return 0;
  }
}

/**
 * Offered once a page has settled, on a phone that isn't using the app —
 * only once someone has come back three times (opening CVC after an hour
 * or more away counts as coming back), never on the welcome tour's visit
 * (which shows the same steps) or while viewing as someone else, and not
 * again for two weeks after "Not now" (never on this browser after "I've
 * saved it already").
 */
export function InstallPrompt() {
  const { user, viewAs } = useSession();
  const install = useInstall();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const offered = useRef(false);
  // Decided when the page loads: how often they've come back, and never straight after the tour.
  const [returns, setReturns] = useState<number | null>(null);
  useEffect(() => setReturns(noteVisit()), []);
  const [afterTour] = useState(() => !!user?.tourSeen);
  useEffect(() => {
    if (offered.current || !user || viewAs || !afterTour) return;
    if (returns === null || returns < RETURNS_BEFORE_ASKING) return;
    if (!install.phone || install.installed || QUIET.test(pathname)) return;
    try {
      const until = localStorage.getItem(SNOOZE_KEY);
      if (until && Date.parse(until) > Date.now()) return;
    } catch {
      // Unreadable: offer it.
    }
    const timer = setTimeout(() => {
      offered.current = true;
      setOpen(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, [user, viewAs, afterTour, returns, install.phone, install.installed, pathname]);
  return open ? <AddAsAppDialog auto onClose={() => setOpen(false)} /> : null;
}

/** "Save CVC as an app" on your profile: its own section, above Notifications. */
export function AddAsAppSection() {
  // Arriving at /profile#install (a search result): bring this card into view once it has rendered.
  useEffect(() => {
    if (window.location.hash === "#install")
      document.getElementById("install")?.scrollIntoView({ behavior: "smooth" });
  }, []);
  return (
    <Card id="install" className="flex scroll-mt-24 flex-col gap-3" data-install-section>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Smartphone className="h-5 w-5 text-primary" aria-hidden /> Save CVC as an app
      </h2>
      <p className="-mt-1 text-sm text-foreground-light">For community notifications. {WHY}</p>
      <InstallSteps />
    </Card>
  );
}
