"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import type { Person } from "@/lib/directory/types";
import type { Circle } from "@/lib/circles/types";
import { CircleIcon } from "@/components/circles/circle-icon";
import { NewCircleForm } from "@/components/circles/new-circle-form";
import { EmailCircleButton } from "@/components/circles/email-circle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isCommunity, sitsOnBoard } from "@/lib/circles/ids";
import { subgroupsOf, topLevel } from "@/lib/circles/tiers";
import { useDirectoryQuery } from "@/components/directory/use-directory";
import { Loading, ErrorCard } from "@/components/ui/status";
import { cn } from "@/lib/utils";

const memberCount = (circle: Circle) => {
  const count = circle.seats.filter((seat) => seat.personId || seat.name).length;
  return `${count} ${count === 1 ? "member" : "members"}`;
};

/**
 * A circle's card: the whole card opens the circle; the email button sits on
 * top of it, and so does its sub groups' list, which opens out when asked.
 */
function CircleCard({
  circle,
  circles,
  people,
}: {
  circle: Circle;
  circles: Circle[];
  people: Map<string, Person>;
}) {
  const [open, setOpen] = useState(false);
  const subgroups = subgroupsOf(circles, circle.id).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Card
      className="relative flex h-full items-start gap-4 p-5 transition focus-within:ring-2 focus-within:ring-primary hover:ring-2 hover:ring-primary"
      data-circle-card={circle.id}
    >
      <CircleIcon circle={circle} size={56} />
      <div className="min-w-0 flex-1 pr-8">
        <Link
          href={`/circles/${circle.id}`}
          className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none"
        >
          <h2 className="text-lg font-semibold text-foreground">{circle.name}</h2>
        </Link>
        <p className="text-xs text-muted">{memberCount(circle)}</p>
        {circle.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-foreground-light">{circle.description}</p>
        ) : null}
        {subgroups.length ? (
          <div className="relative z-10 mt-2">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-pine hover:underline"
              data-subgroups-toggle
            >
              <ChevronRight
                className={cn("h-3.5 w-3.5 transition", open && "rotate-90")}
                aria-hidden
              />
              {subgroups.length} {subgroups.length === 1 ? "sub group" : "sub groups"}
            </button>
            {open ? (
              <ul className="mt-1.5 flex flex-col gap-0.5" data-subgroups>
                {subgroups.map((sub) => (
                  <li key={sub.id}>
                    <Link
                      href={`/circles/${sub.id}`}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-foreground hover:bg-accent"
                    >
                      <CircleIcon circle={sub} size={24} className="shrink-0 rounded-full" />
                      <span className="min-w-0 truncate font-medium">{sub.name}</span>
                      <span className="shrink-0 text-xs text-muted">· {memberCount(sub)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      <EmailCircleButton circle={circle} people={people} className="absolute right-3 top-3 z-10" />
    </Card>
  );
}

/** The Community circle — everyone at CVC, so every circle is within it — across the top of the page. */
function CommunityCard({ circle, count }: { circle: Circle; count: number }) {
  return (
    <Link
      href={`/circles/${circle.id}`}
      className="block rounded-2xl transition hover:ring-2 hover:ring-primary md:col-span-2"
    >
      <Card className="flex h-full items-center gap-5 border-primary/40 bg-accent/60 p-6">
        <CircleIcon circle={circle} size={88} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-foreground">{circle.name}</h2>
          <p className="text-xs font-medium text-muted">
            Everyone at CVC · the {count} circles and clubs below are all within it
          </p>
          {circle.description ? (
            <p className="mt-1 text-sm text-foreground-light">{circle.description}</p>
          ) : null}
        </div>
      </Card>
    </Link>
  );
}

function CircleGrid({
  shown,
  circles,
  people,
}: {
  shown: Circle[];
  circles: Circle[];
  people: Map<string, Person>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {shown.map((circle) => (
        <CircleCard key={circle.id} circle={circle} circles={circles} people={people} />
      ))}
    </div>
  );
}

/** The circles and clubs, under the page's heading (`header`) — with the button to start one on the right of it. */
export function CirclesClient({ header }: { header: React.ReactNode }) {
  const { user } = useSession();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useDirectoryQuery();

  const top = (button?: React.ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {header}
      {button}
    </div>
  );
  if (isLoading) {
    return (
      <>
        {top()}
        <Loading>Loading circles…</Loading>
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        {top()}
        <ErrorCard error={error} fallback="Circles are unavailable." />
      </>
    );
  }

  const people = new Map(data.people.map((person) => [person.id, person]));
  const community = data.circles.find((circle) => isCommunity(circle.id));
  // Sub groups are shown within their circles.
  const others = topLevel(data.circles).filter((circle) => !isCommunity(circle.id));
  const circles = others.filter((circle) => circle.kind !== "club");
  const clubs = others.filter((circle) => circle.kind === "club");
  // Official circles are formed by the Board (and admins); anyone can start a social club.
  const onBoard = sitsOnBoard(data.circles, user?.personId);
  const canFormCircles = onBoard || !!user?.isAdmin;
  return (
    <>
      {top(
        creating ? null : (
          <Button className="gap-1" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />{" "}
            {canFormCircles ? "Start a circle or club" : "Start a social club"}
          </Button>
        )
      )}
      <div className="flex flex-col gap-4">
        {creating ? (
          <NewCircleForm canFormCircles={canFormCircles} onCancel={() => setCreating(false)} />
        ) : null}
        {community ? (
          <div className="grid gap-4 md:grid-cols-2">
            <CommunityCard circle={community} count={others.length} />
          </div>
        ) : null}
        {/* Every circle and club is within Community: shown set in beneath it. */}
        <div
          className={cn(
            "flex flex-col gap-4",
            community && "ml-3 border-l-2 border-primary/30 pl-4 md:ml-6 md:pl-6"
          )}
          data-within-community
        >
          <section className="mt-2 flex flex-col gap-3" aria-labelledby="circles-heading">
            <div>
              <h2 id="circles-heading" className="text-lg font-semibold text-foreground">
                Circles
              </h2>
            </div>
            <CircleGrid shown={circles} circles={data.circles} people={people} />
          </section>
          {clubs.length ? (
            <section className="mt-2 flex flex-col gap-3" aria-labelledby="clubs-heading">
              <div>
                <h2 id="clubs-heading" className="text-lg font-semibold text-foreground">
                  Social Clubs
                </h2>
              </div>
              <CircleGrid shown={clubs} circles={data.circles} people={people} />
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
