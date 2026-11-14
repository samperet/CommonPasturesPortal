"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useCircles } from "@/components/directory/use-directory";
import { circleInitials } from "@/components/circles/circle-icon";
import { shareCardHtml } from "@/lib/documents/share-card";
import { cn } from "@/lib/utils";

/**
 * Share a document: its link — the whole address, on whichever of CVC's
 * addresses it's opened — copied to the clipboard, a toast saying so (and
 * showing the link), the button a tick for a moment. It's copied two ways
 * at once: as plain text, the link (for an address bar or a chat); and as
 * HTML, a small card (`lib/documents/share-card.ts`) — its circle's icon
 * (or initials), the title as a link, the circle and what it is — which
 * Gmail and other mail and editors keep when it's pasted. A page's link is its
 * page (`/wiki/<slug>`), a proposal's its page (`/proposals/<id>`), a file's
 * `/documents/<id>`, which opens the file (and a link document where it
 * points). Whoever opens one signs in first if they aren't, and comes back
 * to it. Where the browser won't let a page write the clipboard (an older
 * one, or not https), it's copied the old way, card and all; failing that,
 * the toast holds the link to copy by hand.
 */

/** The in-app path a document is shared by. */
export type SharePath = `/wiki/${string}` | `/proposals/${string}` | `/documents/${string}`;

/**
 * Copy the link as plain text and the card as HTML: the clipboard API; else
 * the old copy command, filling in both in its copy event; else the link alone.
 */
async function copyLink(text: string, html: string) {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write)
      throw new Error("no rich clipboard");
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    const fill = (event: ClipboardEvent) => {
      event.clipboardData?.setData("text/plain", text);
      event.clipboardData?.setData("text/html", html);
      event.preventDefault();
    };
    document.addEventListener("copy", fill);
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    document.removeEventListener("copy", fill);
    box.remove();
    if (copied) return true;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

export function ShareButton({
  path,
  title,
  circleId,
  label,
  compact = false,
  className,
}: {
  path: SharePath;
  title: string;
  /** The circle it belongs to, for the card's icon and name. */
  circleId?: string | null;
  /** What it is, on the card: "Page", "Proposal", "Google Doc", "Minutes"… */
  label?: string;
  /** Just the icon (in a row of actions). */
  compact?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const circle = useCircles()?.find((entry) => entry.id === circleId);
  const [copied, setCopied] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(reset.current), []);
  const share = async () => {
    const origin = window.location.origin;
    const link = `${origin}${path}`;
    const html = shareCardHtml({
      url: link,
      title,
      label,
      circle: circle
        ? {
            name: circle.name,
            iconUrl: circle.shareIconUrl ? `${origin}${circle.shareIconUrl}` : null,
            initials: circleInitials(circle.name),
          }
        : null,
    });
    if (await copyLink(link, html)) {
      setCopied(true);
      clearTimeout(reset.current);
      reset.current = setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Link copied",
        description: `${link} — pasted into an email, it shows as a card with its title and circle.`,
      });
    } else {
      toast({ title: `Copy the link to “${title}”`, description: link });
    }
  };
  const Icon = copied ? Check : Share2;
  return (
    <button
      type="button"
      onClick={() => void share()}
      aria-label={copied ? `Link to “${title}” copied` : `Share “${title}”: copy its link`}
      title={copied ? "Link copied" : "Copy a link to share"}
      data-share={path}
      className={cn(
        compact
          ? "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-accent hover:text-foreground"
          : "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-sm font-medium text-foreground transition hover:bg-accent",
        copied && "text-pine",
        className
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {compact ? null : copied ? "Copied" : "Share"}
    </button>
  );
}
