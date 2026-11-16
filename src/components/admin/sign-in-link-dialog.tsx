"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * An admin makes a sign-in link for a resident (`api/admin/sign-ins/link`),
 * to send them some other way when their sign-in email isn't arriving:
 * first what it means — whoever opens it signs in as them, once, within a
 * day, and it's kept in the log — then the link to copy, and the code.
 */

type Made = { name: string; link: string; code: string; expiresAt: string };

export function SignInLinkDialog({
  person,
  onClose,
}: {
  person: { personId: string; name: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const box = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const make = useMutation({
    mutationFn: () =>
      apiFetch<Made>("/api/admin/sign-ins/link", {
        method: "POST",
        body: JSON.stringify({ personId: person.personId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "sign-ins"] }),
  });
  const made = make.data;
  const first = person.name.split(/\s+/)[0];

  const copy = async () => {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.link);
      setCopied(true);
    } catch {
      box.current?.select();
    }
  };

  return (
    <Dialog
      title={`A sign-in link for ${person.name}`}
      icon={<KeyRound className="h-5 w-5 text-primary" />}
      onClose={onClose}
    >
      {made ? (
        <div className="flex flex-col gap-4" data-made-link>
          <p className="text-sm text-foreground-light">
            Send this to {first} another way than email — a text, say. Opening it signs them in,
            once, until{" "}
            {new Date(made.expiresAt).toLocaleString(undefined, {
              weekday: "long",
              hour: "numeric",
              minute: "2-digit",
            })}
            .
          </p>
          <div className="flex gap-2">
            <Input
              ref={box}
              readOnly
              value={made.link}
              onFocus={(event) => event.target.select()}
              className="bg-white font-mono text-xs"
              aria-label="The sign-in link"
              data-link
            />
            <Button type="button" onClick={() => void copy()} className="shrink-0 gap-1.5">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-sm text-muted">
            Or the code{" "}
            <strong className="font-semibold tabular-nums tracking-wider text-foreground" data-code>
              {made.code.slice(0, 3)} {made.code.slice(3)}
            </strong>
            : on the sign-in page they choose their name, press Send, and type it where it asks for
            the code from the email.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground-light">
            For when {first}&apos;s sign-in email isn&apos;t arriving. Whoever opens the link signs
            in as {first}, so send it only to them. It works once, for a day, and the sign-in log
            keeps that you made it.
          </p>
          {make.error ? (
            <p className="text-sm text-destructive" role="alert">
              {make.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={make.isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => make.mutate()}
              disabled={make.isPending}
              data-make-link
            >
              {make.isPending ? "Making…" : "Make the link"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
