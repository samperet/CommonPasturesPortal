import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminContext } from "@/lib/auth/admin-http";
import { readImportedDirectory } from "@/lib/directory/store";
import { outlineClient, outlineConfigured, outlineHost, OutlineError } from "@/lib/outline/client";
import {
  continueImport,
  isRunning,
  planImport,
  readImportState,
  startImport,
  type ImportPlan,
  type ImportState,
} from "@/lib/outline/import";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";
// A batch of documents, each fetched with its images, files and comments.
export const maxDuration = 300;

/**
 * Importing an Outline wiki (admins; `lib/outline/import.ts`). GET: whether a
 * server is set up, the state of the last run, and — with `?plan=1` — what's
 * there and where it would land. POST `{ action: "start" }` begins a run
 * (making circles, queueing every document) and brings over the first
 * batch; `{ action: "continue" }` the next; the page keeps asking until it's
 * finished.
 */

type Shown = {
  configured: boolean;
  host: string | null;
  running: boolean;
  state: ImportState;
  plan?: ImportPlan;
};

function shown(state: ImportState, plan?: ImportPlan): Shown {
  const { attachments: _attachments, pages: _pages, titles: _titles, queue, ...rest } = state;
  return {
    configured: outlineConfigured(),
    host: outlineConfigured() ? outlineHost() : null,
    running: isRunning(state),
    state: {
      ...rest,
      queue: [],
      attachments: {},
      pages: {},
      titles: {},
      total: state.total,
      done: state.done,
      pendingLinks: [],
    } as ImportState,
    ...(plan ? { plan } : {}),
    remaining: queue.length,
  } as Shown & { remaining: number };
}

const outlineProblem = (error: unknown) =>
  error instanceof OutlineError
    ? problem(`Outline didn't answer as expected — ${error.message}`, 502)
    : problem(`Outline couldn't be reached (${(error as Error).name})`, 502);

export async function GET(request: NextRequest) {
  const ctx = await adminContext();
  if ("error" in ctx) return ctx.error;
  const state = await readImportState();
  const wantPlan = request.nextUrl.searchParams.get("plan") === "1";
  const client = wantPlan ? outlineClient() : null;
  if (wantPlan && !client)
    return problem("Set OUTLINE_URL and OUTLINE_API_TOKEN in Vercel first", 503);
  try {
    const plan = client ? await planImport(client, ctx.directory) : undefined;
    return NextResponse.json(shown(state, plan), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return outlineProblem(error);
  }
}

const schema = z.object({ action: z.enum(["start", "continue"]) });

export async function POST(request: NextRequest) {
  const ctx = await adminContext();
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const client = outlineClient();
  if (!client) return problem("Set OUTLINE_URL and OUTLINE_API_TOKEN in Vercel first", 503);
  const imported = await readImportedDirectory();
  if (!imported) return problem("The directory hasn't been imported yet", 503);
  const state = await readImportState();
  if (parsed.data.action === "start" && isRunning(state))
    return problem("An import is already running — let it finish", 409);
  try {
    const context = { directory: ctx.directory, imported: imported.circles, actor: ctx.actor };
    const next =
      parsed.data.action === "start"
        ? await startImport(client, context)
        : await continueImport(client, context);
    return NextResponse.json(shown(next), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return outlineProblem(error);
  }
}
