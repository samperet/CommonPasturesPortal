import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { listBackups, listRestores, listSubscribers, subscriptionOf } from "@/lib/backups/store";
import { backupContext } from "@/lib/backups/http";
import { makeBackup, makeExport } from "@/lib/backups/make";
import { ALL_PARTS, isEverything, type ExportPart } from "@/lib/backups/contents";
import { sendBackup } from "@/lib/backups/send";
import { forbidden, problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";
// Every stored object is read and written again, into the zip.
export const maxDuration = 300;

/**
 * GET: the backups kept, your sign-up, and (for admins) the complete backups
 * too, how many are signed up, whether the weekly one is scheduled, and the
 * restore tests run. POST (admins): make one now — `community` (the default:
 * kept with the others and sent to everyone signed up, as the weekly one is)
 * or `complete` (kept for admins only, sent to nobody). With `parts` that
 * aren't all of them, it's an export of those parts instead: kept a day for
 * the admin who made it, sent to nobody (`{ export }`, downloaded from `href`).
 */
const makeSchema = z.object({
  kind: z.enum(["community", "complete"]).default("community"),
  parts: z
    .array(z.enum(ALL_PARTS as [ExportPart, ...ExportPart[]]))
    .min(1, "Choose something to export")
    .optional(),
});

export async function GET() {
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  const admin = ctx.actor.admin;
  const [backups, subscription, subscribers, restores] = await Promise.all([
    listBackups({ admin }),
    subscriptionOf(ctx.actor.personId),
    admin ? listSubscribers() : Promise.resolve([]),
    admin ? listRestores() : Promise.resolve([]),
  ]);
  return NextResponse.json(
    {
      backups,
      subscription,
      isAdmin: ctx.actor.admin,
      ...(admin
        ? { signedUp: subscribers.length, scheduled: !!process.env.CRON_SECRET, restores }
        : {}),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const limited = throttled(request, "backups-make", "Too many backups at once — wait a minute", 3);
  if (limited) return limited;
  const ctx = await backupContext();
  if ("error" in ctx) return ctx.error;
  if (!ctx.actor.admin) return forbidden("Only admins can make a backup now");
  const parsed = await readBody(request, makeSchema, {});
  if ("error" in parsed) return parsed.error;
  const { kind, parts } = parsed.data;
  if (kind === "community" && parts && !isEverything(parts)) {
    try {
      // In the order they're offered, whatever order they came in.
      const chosen = ALL_PARTS.filter((part) => parts.includes(part));
      const made = await makeExport(ctx.actor.name, ctx.actor.userId, chosen);
      return NextResponse.json({
        export: {
          href: `/api/documents/export/${made.id}`,
          fileName: made.fileName,
          size: made.size,
          parts: chosen,
        },
      });
    } catch (error) {
      console.error("[backups] couldn't export", error instanceof Error ? error.name : "error");
      return problem("The export couldn't be made — try again in a while", 500);
    }
  }
  try {
    const backup = await makeBackup(ctx.actor.name, parsed.data.kind);
    if (parsed.data.kind === "community") waitUntil(sendBackup(backup));
    return NextResponse.json({ backup });
  } catch (error) {
    console.error("[backups] couldn't make one", error instanceof Error ? error.name : "error");
    return problem("The backup couldn't be made — try again in a while", 500);
  }
}
