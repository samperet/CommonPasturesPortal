"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

/**
 * Share a document: its link — the whole address, on whichever of CVC's
 * addresses it's opened — copied to the clipboard, a toast saying so (and
 * showing the link), the button a tick for a moment. A page's link is its
 * page (`/wiki/<slug>`), a proposal's its page (`/proposals/<id>`), a file's
 * `/documents/<id>`, which opens the file (and a link document where it
 * points). Whoever opens one signs in first if they aren't, and comes back
 * to it. Where the browser won't let a page write the clipboard (an older
 * one, or not https), it's copied the old way; failing that, the toast
 * holds the link to copy by hand.
 */

/** The in-app path a document is shared by. */
export type SharePath = `/wiki/${string}` | `/proposals/${string}` | `/documents/${string}`;

/** Copy text: the clipboard API, else a hidden text box and the old copy command. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    box.remove();
    return copied;
  }
}

export function ShareButton({
  path,
  title,
  compact = false,
  className,
}: {
  path: SharePath;
  title: string;
  /** Just the icon (in a row of actions). */
  compact?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(reset.current), []);
  const share = async () => {
    const link = `${window.location.origin}${path}`;
    if (await copyText(link)) {
      setCopied(true);
      clearTimeout(reset.current);
      reset.current = setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied", description: link });
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
