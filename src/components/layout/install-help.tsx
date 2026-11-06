"use client";

import { useState } from "react";
import { ChevronDown, Smartphone } from "lucide-react";
import { useInstall } from "@/components/notifications/pwa";
import { InstallSteps } from "@/components/notifications/add-as-app";
import { cn } from "@/lib/utils";

/**
 * In the phone menu: how to save CVC as an app on the home screen — the
 * same steps as everywhere else (`InstallSteps`), in large print for the
 * phone in hand. Folded until pressed. Only on a phone (`isPhone`), and only
 * until CVC is installed there: laptops and installed phones don't see it.
 */
export function InstallHelp() {
  const install = useInstall();
  const [open, setOpen] = useState(false);
  if (!install.phone || install.installed) return null;
  return (
    <section className="mt-2 border-t border-border pt-2" data-install-help>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-base font-medium text-foreground hover:bg-accent"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          <Smartphone className="h-5 w-5 text-primary" aria-hidden />
        </span>
        <span className="flex-1">Save CVC as an app</span>
        <ChevronDown className={cn("h-5 w-5 transition", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="flex flex-col gap-3 px-3 pb-2 pt-1 text-base leading-relaxed text-foreground">
          <p className="text-foreground-light">
            For community notifications: CVC opens with one tap from your home screen, and lets you
            know when neighbors post. It takes about a minute and nothing is downloaded.
          </p>
          <InstallSteps size="large" />
          <p className="text-sm text-muted">
            Stuck? Ask a neighbour to sit with you for a minute — it&apos;s quicker shown than read.
          </p>
        </div>
      ) : null}
    </section>
  );
}
