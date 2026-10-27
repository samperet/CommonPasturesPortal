"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bug,
  Download,
  History,
  Mail,
  NotebookPen,
  ShieldCheck,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { usePeople } from "@/lib/auth/client";
import type { AdminView } from "@/lib/auth/admin-http";
import { shortDate } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SectionHeading } from "@/components/ui/section-heading";
import { ErrorCard, Loading } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";
import { NameCombobox, type NameOption } from "@/components/auth/name-combobox";

/**
 * Admin settings: who the admins are. Any admin can make a resident an
 * admin, or remove one added here (never the last); those built in or set
 * in Vercel (ADMIN_PERSON_IDS) are listed but changed there. Below, the
 * other admin pages.
 */

const KEY = ["admin", "admins"];
type Admins = { admins: AdminView[] };

function how(admin: AdminView) {
  if (admin.source === "built-in") return "Built in";
  if (admin.source === "environment") return "Set in Vercel";
  return `Added by ${admin.addedBy?.name ?? "an admin"}${
    admin.addedAt ? ` · ${shortDate(admin.addedAt)}` : ""
  }`;
}

const OTHER_PAGES = [
  { href: "/admin/sign-ins", label: "Sign-in log", icon: History },
  { href: "/admin/feedback", label: "Bugs & requests", icon: Bug },
  { href: "/admin/email", label: "Email", icon: Mail },
  { href: "/admin/outline", label: "Import from Outline", icon: Download },
  { href: "/secretary", label: "Secretary: new members", icon: NotebookPen },
];

export function AdminSettingsClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { people, isLoading: peopleLoading } = usePeople();
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<Admins>("/api/admin/admins"),
  });
  const [chosen, setChosen] = useState<NameOption | null>(null);
  const admins = data?.admins ?? [];
  const isOne = new Set(admins.map((admin) => admin.personId));

  const saved = (next: Admins) => {
    queryClient.setQueryData(KEY, next);
    void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  };
  const failed = (title: string) => (err: Error) =>
    toast({ title, description: err.message, variant: "destructive" });
  const add = useMutation({
    mutationFn: (person: NameOption) =>
      apiFetch<Admins>("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({ personId: person.id }),
      }),
    onSuccess: (next, person) => {
      saved(next);
      setChosen(null);
      toast({ title: `${person.name} is an admin now` });
    },
    onError: failed("Could not add the admin"),
  });
  const remove = useMutation({
    mutationFn: (admin: AdminView) =>
      apiFetch<Admins>(`/api/admin/admins/${encodeURIComponent(admin.personId)}`, {
        method: "DELETE",
      }),
    onSuccess: (next, admin) => {
      if (admin.you) {
        // Not an admin any more, so this page is closed to them.
        void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
        toast({ title: "You're no longer an admin" });
        router.replace("/");
        return;
      }
      saved(next);
      toast({ title: `${admin.name} is no longer an admin` });
    },
    onError: failed("Could not remove the admin"),
  });
  const askToRemove = async (admin: AdminView) => {
    if (
      await confirm({
        title: admin.you ? "Stop being an admin?" : `Remove ${admin.name} as an admin?`,
        body: admin.you
          ? "You'll be a resident like any other, and this page will be closed to you."
          : "They stay a resident, with their account as it is.",
        confirmLabel: "Remove",
        destructive: true,
      })
    )
      remove.mutate(admin);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Admin settings</h1>
        <p className="text-sm text-muted">
          Admins can do anything a resident can, on anyone&apos;s content: manage any circle, edit
          or delete any post, edit any profile, and see the app as someone else.
        </p>
      </div>

      <section className="flex flex-col gap-3" data-admins>
        <SectionHeading icon={ShieldCheck} count={data ? admins.length : null}>
          Admins
        </SectionHeading>
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorCard error={error} />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {admins.map((admin) => (
                <li
                  key={admin.personId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm"
                  data-admin={admin.personId}
                >
                  <span className="min-w-0 flex-1 font-medium text-foreground">
                    {admin.inDirectory ? (
                      <Link href={`/directory/${admin.personId}`} className="hover:underline">
                        {admin.name}
                      </Link>
                    ) : (
                      admin.name
                    )}
                    {admin.you ? <span className="font-normal text-muted"> (you)</span> : null}
                  </span>
                  <Pill tone={admin.source === "added" ? "accent" : "outline"}>{how(admin)}</Pill>
                  {admin.source === "added" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-muted hover:text-destructive"
                      onClick={() => void askToRemove(admin)}
                      disabled={remove.isPending}
                    >
                      <UserMinus className="h-4 w-4" /> Remove
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="text-xs text-muted">
          Admins built in, or set in Vercel (ADMIN_PERSON_IDS), are changed there.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading icon={UserPlus}>Add an admin</SectionHeading>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <NameCombobox
              users={people.filter((person) => !isOne.has(person.id))}
              value={chosen}
              loading={peopleLoading}
              disabled={add.isPending}
              placeholder="Choose a resident…"
              onChange={setChosen}
            />
          </div>
          <Button
            onClick={() => chosen && add.mutate(chosen)}
            disabled={!chosen || add.isPending}
            className="gap-1.5"
          >
            <ShieldCheck className="h-4 w-4" /> {add.isPending ? "Adding…" : "Make admin"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Other admin pages</SectionHeading>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OTHER_PAGES.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-sm font-medium text-foreground hover:bg-accent"
            >
              <Icon className="h-4 w-4 text-primary" aria-hidden /> {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
