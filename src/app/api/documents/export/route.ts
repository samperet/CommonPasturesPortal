import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { circleContext } from "@/lib/circles/access";
import { problem, readBody, throttled } from "@/lib/http";
import { MAX_EXPORT_BYTES, planExport, saveExport } from "@/lib/documents/export";
import { formatBytes } from "@/lib/documents/types";

export const dynamic = "force-dynamic";
// A big export takes a while: every file is read and written again, into the zip.
export const maxDuration = 300;

const item = z.object({
  kind: z.enum(["page", "file", "proposal"]),
  id: z.string().regex(/^[0-9a-f-]{36}$/i, "That isn't a document"),
});
const exportSchema = z.union([
  z.object({
    all: z.literal(true),
    circle: z.string().min(1).max(80).optional(),
    subs: z.boolean().optional(),
  }),
  z.object({
    items: z
      .array(item)
      .min(1, "Choose something to export")
      .max(6000, "Export at most 6,000 documents at a time"),
  }),
]);

/**
 * Export documents as a zip (`lib/documents/export.ts`): `items` (pages,
 * files and links, proposals) or `all` (with `circle`, all of a circle's;
 * with `subs` too, its sub groups' as well).
 * The zip is made into storage and kept a day;
 * download it from `href` (yours only).
 */
export async function POST(request: NextRequest) {
  // Per address — residents on the community's network share one — so not too few.
  const limited = throttled(
    request,
    "documents-export",
    "Too many exports at once — wait a minute",
    10
  );
  if (limited) return limited;
  const ctx = await circleContext();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, exportSchema);
  if ("error" in parsed) return parsed.error;
  const plan = await planExport(parsed.data, ctx);
  if ("error" in plan)
    return plan.error === "empty"
      ? problem("There's nothing to export — those documents are gone", 404)
      : problem(
          `That's more than ${formatBytes(MAX_EXPORT_BYTES)} of files — export fewer at a time`,
          413
        );
  try {
    const record = await saveExport(ctx.user.id, plan);
    return NextResponse.json({
      href: `/api/documents/export/${record.id}`,
      fileName: record.fileName,
      size: record.size,
      counts: plan.counts,
    });
  } catch (error) {
    console.error("[export] the zip couldn't be made", (error as Error)?.name);
    return problem("The zip couldn't be made just now — try again", 502);
  }
}
