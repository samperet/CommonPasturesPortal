"use client";

import { PersonCars } from "@/components/directory/cars";

import { sentence } from "@/lib/text";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BackLink } from "@/components/layout/back-link";
import {
  Cake,
  Eye,
  Home,
  LogOut,
  Mail,
  Merge,
  MessageCircle,
  Pencil,
  Phone,
  Split,
  Trash2,
} from "lucide-react";
import { PersonSkills } from "@/components/skills/person-skills";
import { apiFetch } from "@/lib/api-client";
import { useSession, useViewAs } from "@/lib/auth/client";
import { unitsOf } from "@/lib/directory/households";
import { CircleIcon } from "@/components/circles/circle-icon";
import { RoleTag, digits, membershipsByPerson } from "@/components/directory/directory-client";
import { Avatar } from "@/components/profile/avatar";
import { useOnline } from "@/components/chat/presence";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useDirectoryQuery } from "@/components/directory/use-directory";
import { Loading } from "@/components/ui/status";
import { useConfirm } from "@/components/ui/confirm";
import { Select } from "@/components/ui/select";

/** One resident's page: contact details, birthday, bio, and circles — and, for directory managers, editing and removal. */
export function PersonClient({ personId: requested }: { personId: string }) {
  const confirm = useConfirm();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, viewAs: viewing } = useSession();
  const viewAs = useViewAs();
  const isOnline = useOnline();
  const [combining, setCombining] = useState("");
  const { data, isLoading, error } = useDirectoryQuery();
  // An old link to an entry that's since been combined into one profile opens that profile.
  const personId = data?.aliases?.[requested] ?? requested;
  const person = data?.people.find((entry) => entry.id === personId);
  const memberships = useMemo(
    () => (data ? membershipsByPerson(data.circles).get(personId) ?? [] : []),
    [data, personId]
  );
  const units = person ? unitsOf(person) : [];
  const combinedFrom = data
    ? Object.values(data.aliases ?? {}).filter((to) => to === personId).length + 1
    : 1;
  const households =
    data && person
      ? units.map((unit) => ({
          unit,
          people: data.people.filter(
            (entry) => entry.id !== person.id && unitsOf(entry).includes(unit)
          ),
        }))
      : [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["directory"] });
  const split = useMutation({
    mutationFn: () => apiFetch(`/api/directory/people/${personId}/entries`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      toast({ title: "Split into separate entries" });
    },
    onError: (err: Error) =>
      toast({ title: "Could not split", description: err.message, variant: "destructive" }),
  });
  const combine = useMutation({
    mutationFn: (otherId: string) =>
      apiFetch(`/api/directory/people/${personId}/entries`, {
        method: "POST",
        body: JSON.stringify({ otherId }),
      }),
    onSuccess: () => {
      setCombining("");
      refresh();
      toast({ title: "Combined into one profile", description: "They're listed under each unit." });
    },
    onError: (err: Error) =>
      toast({ title: "Could not combine", description: err.message, variant: "destructive" }),
  });
  const leave = useMutation({
    mutationFn: (unit: number) =>
      apiFetch(`/api/directory/people/${personId}/units/${unit}`, { method: "DELETE" }),
    onSuccess: (_data, unit) => {
      refresh();
      toast({ title: `${person?.displayName ?? "They"} no longer listed in unit ${unit}` });
    },
    onError: (err: Error) =>
      toast({ title: "Could not update", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/directory/people/${personId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["directory"] });
      toast({ title: `${person?.displayName ?? "They"} removed from the directory` });
      router.replace("/directory");
    },
    onError: (err: Error) =>
      toast({ title: "Could not remove", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <Loading />;
  if (error || !person) {
    return (
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-foreground">
          {(error as Error | null)?.message ?? "That person isn't in the directory."}
        </p>
        <Link
          href="/directory"
          className="text-sm font-medium text-secondary-foreground underline underline-offset-4"
        >
          Back to the directory
        </Link>
      </Card>
    );
  }

  const isMe = person.id === user?.personId;
  const canManage = !!user?.canManageDirectory;
  const row = "flex items-center gap-2 text-foreground-light";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <BackLink href="/directory" label="Directory" />

      <Card className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
          <Avatar
            name={person.displayName}
            photoUrl={person.photoUrl}
            size={96}
            online={isOnline(person.id)}
          />
          <div className="flex flex-col items-center gap-1.5 sm:items-start">
            <h1 className="text-2xl font-semibold text-foreground">{person.displayName}</h1>
            <p className="text-sm text-muted">
              {units.length > 1
                ? `Units ${units.slice(0, -1).join(", ")} & ${units[units.length - 1]}`
                : `Unit ${person.unit}`}
            </p>
            <RoleTag person={person} />
            {!isMe && !viewing ? (
              <Button asChild size="sm" className="mt-1 gap-1.5">
                <Link href={`/messages/${person.id}`} data-message-person>
                  <MessageCircle className="h-4 w-4" /> Message
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {person.bio ? (
          <p className="whitespace-pre-wrap text-foreground-light">{person.bio}</p>
        ) : null}
        <PersonSkills personId={person.id} />

        <div className="flex flex-col gap-2 text-sm">
          {person.phone ? (
            <a href={`tel:${digits(person.phone)}`} className={`${row} w-fit hover:underline`}>
              <Phone className="h-4 w-4 text-muted" /> {person.phone}
            </a>
          ) : null}
          {person.landline ? (
            <a href={`tel:${digits(person.landline)}`} className={`${row} w-fit hover:underline`}>
              <Home className="h-4 w-4 text-muted" /> {person.landline}{" "}
              <span className="text-muted">(landline)</span>
            </a>
          ) : null}
          {person.email ? (
            <a href={`mailto:${person.email}`} className={`${row} w-fit break-all hover:underline`}>
              <Mail className="h-4 w-4 shrink-0 text-muted" /> {person.email}
            </a>
          ) : null}
          {person.birthday ? (
            <span className={row}>
              <Cake className="h-4 w-4 text-muted" /> Birthday: {person.birthday}
            </span>
          ) : null}
          {!person.phone && !person.landline && !person.email && !person.birthday ? (
            <p className="text-muted">No contact details yet.</p>
          ) : null}
        </div>

        <PersonCars person={person} />

        {memberships.length ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">Circles</h2>
            <ul className="flex flex-col gap-1.5">
              {memberships.map(({ circle, position }) => (
                <li key={circle.id}>
                  <Link
                    href={`/circles/${circle.id}`}
                    className="flex w-fit items-center gap-2 text-sm text-foreground-light hover:underline"
                  >
                    <CircleIcon circle={circle} size={24} /> {circle.name}
                    <span className="text-muted">· {sentence(position ?? "Member")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {households
          .filter(({ people }) => people.length)
          .map(({ unit, people }) => (
            <div key={unit} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-foreground">Also in unit {unit}</h2>
              <ul className="flex flex-wrap gap-x-4 gap-y-2">
                {people.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/directory/${entry.id}`}
                      className="flex items-center gap-2 text-sm text-foreground-light hover:underline"
                    >
                      <Avatar name={entry.displayName} photoUrl={entry.photoUrl} size={24} />{" "}
                      {entry.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

        {isMe || canManage || user?.isAdmin ? (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {isMe ? (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href="/profile">
                  <Pencil className="h-4 w-4" /> Edit your profile
                </Link>
              </Button>
            ) : canManage ? (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href={`/profile/${person.id}`}>
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
              </Button>
            ) : null}
            {user?.isAdmin && !isMe ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => viewAs.mutate(person.id)}
                disabled={viewAs.isPending}
              >
                <Eye className="h-4 w-4" /> {viewAs.isPending ? "Switching…" : "View as"}
              </Button>
            ) : null}
            {canManage && combinedFrom > 1 ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={split.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Split ${person.displayName} back into ${combinedFrom} separate entries?`,
                      body: "One per listing. Do this only if they're different people.",
                      confirmLabel: "Split",
                    })
                  )
                    split.mutate();
                }}
              >
                <Split className="h-4 w-4" /> Split entries
              </Button>
            ) : null}
            {canManage && units.length > 1
              ? units.map((unit) => (
                  <Button
                    key={unit}
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={leave.isPending}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Take ${person.displayName} out of unit ${unit}?`,
                          body: `They'll stay listed in the other${units.length > 2 ? "s" : ""}.`,
                          confirmLabel: "Take out",
                        })
                      )
                        leave.mutate(unit);
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Remove from unit {unit}
                  </Button>
                ))
              : null}
            {canManage && !isMe ? (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted hover:text-destructive"
                disabled={remove.isPending}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Remove ${person.displayName} from the directory?`,
                      body: "They'll leave their circles and won't be able to sign in. This can't be undone.",
                      confirmLabel: "Remove",
                      destructive: true,
                    })
                  )
                    remove.mutate();
                }}
              >
                <Trash2 className="h-4 w-4" />{" "}
                {remove.isPending ? "Removing…" : "Remove from directory"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {canManage && data ? (
          <form
            className="flex flex-col gap-2 rounded-lg border border-border bg-accent/40 p-3 sm:flex-row sm:items-center"
            onSubmit={async (event) => {
              event.preventDefault();
              const other = data.people.find((entry) => entry.id === combining);
              if (
                other &&
                (await confirm({
                  title: `Combine ${other.displayName} (unit ${unitsOf(other).join(" & ")}) into ${
                    person.displayName
                  }'s profile?`,
                  body: "They'll be listed under both units.",
                  confirmLabel: "Combine",
                }))
              )
                combine.mutate(combining);
            }}
          >
            <span className="flex items-center gap-1.5 text-sm text-foreground-light">
              <Merge className="h-4 w-4 text-muted" /> Same person listed elsewhere?
            </span>
            <Select
              value={combining}
              onChange={(event) => setCombining(event.target.value)}
              className="h-9 min-w-0 flex-1 px-2"
              aria-label="Entry to combine"
            >
              <option value="">Choose their other entry…</option>
              {data.people
                .filter((entry) => entry.id !== person.id)
                .sort((a, b) => a.displayName.localeCompare(b.displayName))
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.displayName} — unit {unitsOf(entry).join(" & ")}
                  </option>
                ))}
            </Select>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={!combining || combine.isPending}
            >
              Combine
            </Button>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
