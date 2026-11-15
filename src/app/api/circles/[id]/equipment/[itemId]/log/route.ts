import { NextRequest, NextResponse } from "next/server";
import { addEntry, entryInputSchema } from "@/lib/equipment/store";
import { equipmentContext, equipmentProblem } from "@/lib/equipment/http";
import { forbidden, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; itemId: string } };

/** Add to its log book: any resident (whoever used it, serviced it, or noticed something). */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "equipment-log");
  if (limited) return limited;
  const ctx = await equipmentContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canLog) return forbidden("Sign in as a resident to add to the log");
  const parsed = await readBody(request, entryInputSchema);
  if ("error" in parsed) return parsed.error;
  const result = await addEntry(ctx.circle, params.itemId, ctx.actor, parsed.data);
  if (!result.ok) return equipmentProblem(result.reason);
  return NextResponse.json({ entry: result.value }, { status: 201 });
}
