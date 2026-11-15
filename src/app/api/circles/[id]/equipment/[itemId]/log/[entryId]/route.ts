import { NextRequest, NextResponse } from "next/server";
import { changeEntry, entryUpdateSchema } from "@/lib/equipment/store";
import { equipmentContext, equipmentProblem } from "@/lib/equipment/http";
import { readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; itemId: string; entryId: string } };

/** Change a log entry: whoever wrote it, or the circle's members, the Board, admins. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "equipment-log");
  if (limited) return limited;
  const ctx = await equipmentContext(params.id);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, entryUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const result = await changeEntry(
    ctx.circle,
    params.itemId,
    params.entryId,
    ctx.actor,
    ctx.canManage,
    parsed.data
  );
  if (!result.ok) return equipmentProblem(result.reason);
  return NextResponse.json({ entry: result.value });
}

/** Remove a log entry: whoever wrote it, or the circle's members, the Board, admins. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "equipment-log");
  if (limited) return limited;
  const ctx = await equipmentContext(params.id);
  if ("error" in ctx) return ctx.error;
  const result = await changeEntry(
    ctx.circle,
    params.itemId,
    params.entryId,
    ctx.actor,
    ctx.canManage,
    null
  );
  if (!result.ok) return equipmentProblem(result.reason);
  return NextResponse.json({ ok: true });
}
