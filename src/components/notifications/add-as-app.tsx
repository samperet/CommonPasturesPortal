"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Download, Share, Smartphone } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { useInstall } from "@/components/notifications/pwa";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Adding CVC as an app — one set of steps for this device, used everywhere
 * it's offered: the popup on a phone that isn't using the app yet
 * (`InstallPrompt`), **Add as an app** in the menu under your name, its own
 * section on your profile, the phone menu (`layout/install-help.tsx`) and
 * the welcome tour. Where the browser offers its own install, an Install
 * button; on an iPhone, Safari's Share → Add to Home Screen; on other
 * phones, the browser's menu; on a computer, Chrome's or Edge's install, or
 * Safari's Add to Dock.
 */

/** How long "Not now" keeps the popup away; "I've added it" keeps it away on this browser. */
const SNOOZE_DAYS = 14;
const SNOOZE_KEY = "cvc-install-prompt";
/** Pages the popup never covers: signing in, joining, printing. */
const QUIET = /^\/(join|login|welcome)(\/|$)|\/print$/;

/** The steps for this device. `large` for the phone menu's big print; `compact` for the tour. */
export function InstallSteps({ size = "normal" }: { size?: "compact" | "normal" | "large" }) {
  const install = useInstall();
  const [android, setAndroid] = useState(false);
  useEffect(() => setAndroid(/Android/i.test(navigator.userAgent)), []);
  const text = size === "large" ? "text-base" : "text-sm";
  const list = cn(
    "flex list-decimal flex-col gap-1.5 pl-5",
    text,
    size === "large" && "gap-2 pl-6"
  );
  if (install.installed)
    return (
      <p className={cn("flex items-center gap-1.5 text-foreground-light", text)} data-install-done>
        <Check className="h-4 w-4 text-primary" aria-hidden /> You&apos;re using the app on this
        device.
      </p>
    );
  return (
    <div className={cn("flex flex-col gap-2 text-foreground", text)} data-install-steps>
      {install.canPrompt ? (
        <Button
          size={size === "large" ? "lg" : "sm"}
          className={cn("gap-1.5", size === "large" ? "w-full text-base" : "w-fit")}
          onClick={() => void install.install()}
          data-install-button
        >
          <Download className="h-4 w-4" aria-hidden /> Install CVC now
        </Button>
      ) : install.ios ? (
        <ol className={list} data-install-ios>
          <li>
            Open CVC in <strong>Safari</strong> (the compass icon), if you aren&apos;t already.
          </li>
          <li>
            Tap <strong>Share</strong>{" "}
            <Share className="inline h-4 w-4 align-text-bottom text-primary" aria-hidden /> — the
            box with an arrow pointing up. On the newest iPhones, tap <strong>⋯</strong> at the
            bottom first.
          </li>
          <li>
            Tap <strong>Add to Home Screen</strong>. Don&apos;t see it? Scroll down, or tap{" "}
            <strong>More</strong>.
          </li>
          <li>
            Tap <strong>Add</strong>. Look for the green CVC icon with your other apps.
          </li>
        </ol>
      ) : install.phone || android ? (
        <ol className={list} data-install-android>
          <li>
            Tap your browser&apos;s menu — usually <strong>⋮</strong> in a corner.
          </li>
          <li>
            Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.
          </li>
          <li>
            Tap <strong>Install</strong> or <strong>Add</strong>. Look for the green CVC icon with
            your other apps.
          </li>
        </ol>
      ) : (
        <ul className={cn(list, "list-disc")} data-install-computer>
          <li>
            <strong>Chrome or Edge:</strong> click the install button at the end of the address bar,
            or open the browser&apos;s menu and choose <strong>Install</strong>.
          </li>
          <li>
            <strong>Safari on a Mac:</strong> choose <strong>File → Add to Dock</strong>.
          </li>
          <li>
            <strong>On your phone:</strong> open CVC there and choose <strong>Add as an app</strong>{" "}
            in the menu under your name.
          </li>
        </ul>
      )}
    </div>
  );
}

/** Why it's worth it, in a line. */
const WHY =
  "CVC opens with one tap, like any other app, and can send you notifications. Nothing to download — it takes a minute.";

/** The steps in a popup: from the menu under your name, or offered on a phone (`auto`). */
export function AddAsAppDialog({ onClose, auto = false }: { onClose: () => void; auto?: boolean }) {
  const install = useInstall();
  const snooze = (days: number) => {
    try {
      localStorage.setItem(SNOOZE_KEY, new Date(Date.now() + days * 86_400_000).toISOString());
    } catch {
      // Private browsing: it may ask again next time.
    }
    onClose();
  };
  return (
    <Dialog
      title={install.phone ? "Put CVC on your home screen" : "Add CVC as an app"}
      icon={<Smartphone className="h-5 w-5 text-primary" />}
      onClose={auto ? () => snooze(SNOOZE_DAYS) : onClose}
    >
      <div className="flex flex-col gap-4" data-add-as-app>
        {install.installed ? null : <p className="text-sm text-foreground-light">{WHY}</p>}
        <InstallSteps />
        {install.installed ? null : (
          <p className="text-xs text-muted">
            Then open CVC from its icon and turn on notifications under{" "}
            <strong>Notifications</strong> in the menu under your name.
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
                I&apos;ve added it already
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Offered once a page has settled, on a phone that isn't using the app —
 * after the welcome tour (which shows the same steps), never while viewing
 * as someone else, and not again for two weeks after "Not now" (never on
 * this browser after "I've added it already").
 */
export function InstallPrompt() {
  const { user, viewAs } = useSession();
  const install = useInstall();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const offered = useRef(false);
  // Decided when the page loads: never straight after the tour.
  const [afterTour] = useState(() => !!user?.tourSeen);
  useEffect(() => {
    if (offered.current || !user || viewAs || !afterTour) return;
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
  }, [user, viewAs, afterTour, install.phone, install.installed, pathname]);
  return open ? <AddAsAppDialog auto onClose={() => setOpen(false)} /> : null;
}

/** "Add CVC as an app" on your profile: its own section, above Notifications. */
export function AddAsAppSection() {
  // Arriving at /profile#install (a search result): bring this card into view once it has rendered.
  useEffect(() => {
    if (window.location.hash === "#install")
      document.getElementById("install")?.scrollIntoView({ behavior: "smooth" });
  }, []);
  return (
    <Card id="install" className="flex scroll-mt-24 flex-col gap-3" data-install-section>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Smartphone className="h-5 w-5 text-primary" aria-hidden /> Add CVC as an app
      </h2>
      <p className="-mt-1 text-sm text-foreground-light">{WHY}</p>
      <InstallSteps />
    </Card>
  );
}
