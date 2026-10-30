import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar/events";
import { formatWhen, relativeDay } from "@/lib/calendar/format";
import { TIME_ZONE } from "@/lib/time";

const month = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short" });
const day = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, day: "numeric" });

/**
 * The dashboard's green header: the next event on the community calendar —
 * its day, how soon, its title, when and where — over the leaf, with a link
 * to the full calendar.
 */
export function NextEvent({ event }: { event: CalendarEvent | null }) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-forest px-6 py-7 text-white shadow-soft md:px-8 md:py-9"
      aria-label="Next event"
      data-next-event
    >
      <Image
        src="/home/leaf.webp"
        alt=""
        aria-hidden
        width={591}
        height={1000}
        priority
        className="pointer-events-none absolute -right-8 -top-10 h-[190%] w-auto max-w-none select-none opacity-80"
      />
      {/* Kept clear of the leaf on the right. */}
      <div className="relative flex items-start gap-4 pr-16 sm:items-center sm:pr-36">
        {event ? (
          <>
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
              <span className="text-xs font-semibold uppercase text-sun">
                {month.format(new Date(event.start))}
              </span>
              <span className="text-2xl font-bold leading-none">
                {day.format(new Date(event.start))}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-sm font-medium text-sun">Next event · {relativeDay(event)}</p>
              <p className="text-2xl font-semibold leading-tight md:text-3xl" data-next-event-title>
                {event.title}
              </p>
              <p className="text-sm text-white/85">{formatWhen(event)}</p>
              {event.location ? (
                <p className="flex items-center gap-1 text-sm text-white/75">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{event.location}</span>
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-medium text-sun">Next event</p>
            <p className="text-2xl font-semibold leading-tight md:text-3xl">
              Nothing on the community calendar yet
            </p>
          </div>
        )}
      </div>
      <Link
        href="/calendar"
        className="relative mt-4 inline-flex items-center gap-1 text-sm font-medium text-white/90 underline-offset-4 hover:text-white hover:underline"
      >
        Full calendar <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
