import Image from "next/image";
import Link from "next/link";
import {
  ChevronRight,
  Layers,
  Share2,
  MessagesSquare,
  BookUser,
  Camera,
  Lightbulb,
} from "lucide-react";
import { NextEvent } from "@/components/calendar/next-event";
import { MyTasks } from "@/components/tasks/my-tasks";
import { YourProposals } from "@/components/wiki/your-proposals";
import { NotificationsNudge } from "@/components/notifications/notifications-nudge";
import { getUpcomingEvents } from "@/lib/calendar/events";
import { getSessionUser } from "@/lib/auth/session";
import { PublicHome } from "@/components/home/public-home";
import { publicHomes } from "@/lib/homes/store";
import { SectionArt, hasSectionArt } from "@/components/layout/section-art";
import { TIME_ZONE } from "@/lib/time";

export const dynamic = "force-dynamic";

const cards = [
  {
    href: "/directory",
    title: "Directory",
    description: "Neighbors' contact details, carsheds, and whose car is whose.",
    icon: BookUser,
  },
  {
    href: "/circles",
    title: "Circles",
    description: "Each circle, its purpose, and who serves on it.",
    icon: Layers,
  },
  {
    href: "/library",
    title: "Loan Library",
    description: "Tools, books, and gear neighbors are happy to lend.",
    icon: Share2,
  },
  {
    href: "/forum",
    title: "Forum",
    description: "Neighborhood discussions with threaded replies.",
    icon: MessagesSquare,
  },
  {
    href: "/photos",
    title: "Photos",
    description: "Snapshots of life in the neighborhood.",
    icon: Camera,
  },
  {
    href: "/resources",
    title: "Resources",
    description: "Local services neighbors recommend.",
    icon: Lightbulb,
  },
];

export const metadata = {
  title: "Common Pastures · A Champlain Valley Cohousing development (CVC)",
  description:
    "Do you seek community? Common Pastures, a Champlain Valley Cohousing development (CVC): energy-efficient homes clustered around a central green on 125 acres of farmland, woods, and ponds in Charlotte, Vermont.",
};

/** "Good morning", by the time of day in Vermont. */
function greeting(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: TIME_ZONE,
    }).format(now)
  );
  return hour < 5
    ? "Good evening"
    : hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : "Good evening";
}

/** The public front page for visitors; the dashboard for signed-in residents. */
export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) return <PublicHome homes={await publicHomes().catch(() => [])} />;
  const [nextEvent] = await getUpcomingEvents(1);
  const firstName = user.name.split(/\s+/)[0];
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date());
  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-2xl bg-forest px-6 py-7 text-white shadow-soft md:px-8 md:py-9">
        <Image
          src="/home/leaf.webp"
          alt=""
          aria-hidden
          width={591}
          height={1000}
          priority
          className="pointer-events-none absolute -right-8 -top-10 h-[190%] w-auto max-w-none select-none opacity-80"
        />
        <p className="relative text-sm font-medium text-sun">{today}</p>
        <h1 className="relative mt-1 text-3xl font-semibold md:text-4xl">
          {greeting()}, {firstName}
        </h1>
      </section>
      <NotificationsNudge />
      <NextEvent event={nextEvent ?? null} />
      <YourProposals />
      <MyTasks />
      <section className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex items-center gap-3 rounded-2xl border border-border bg-background p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-primary hover:bg-accent hover:shadow-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-0 active:shadow-soft motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            {hasSectionArt(card.href) ? (
              <SectionArt href={card.href} size={56} />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center">
                <card.icon className="h-8 w-8 text-primary" aria-hidden />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground">{card.title}</h2>
              <p className="text-sm text-foreground/70">{card.description}</p>
            </div>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
              aria-hidden
            />
          </Link>
        ))}
      </section>
    </div>
  );
}
