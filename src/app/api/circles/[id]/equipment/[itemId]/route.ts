import { NextRequest, NextResponse } from "next/server";
import { itemUpdateSchema, readEquipment, removeItem, updateItem } from "@/lib/equipment/store";
import { equipmentContext, equipmentProblem } from "@/lib/equipment/http";
import { forbidden, notFound, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; itemId: string } };

/** One piece of equipment with its whole log book, and what you can do with it. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await equipmentContext(params.id);
  if ("error" in ctx) return ctx.error;
  const item = (await readEquipment(ctx.circle)).find((entry) => entry.id === params.itemId);
  if (!item) return notFound("Equipment");
  return NextResponse.json(
    {
      item,
      circle: { id: ctx.circle.id, name: ctx.circle.name },
      canManage: ctx.canManage,
      canLog: ctx.canLog,
      userId: ctx.actor.userId,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Change its details: the circle's members, the Board, admins. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "equipment");
  if (limited) return limited;
  const ctx = await equipmentContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canManage) return forbidden(`Only ${ctx.circle.name}'s members change equipment`);
  const parsed = await readBody(request, itemUpdateSchema);
  if ("error" in parsed) return parsed.error;
  const result = await updateItem(ctx.circle, params.itemId, parsed.data);
  if (!result.ok) return equipmentProblem(result.reason);
  return NextResponse.json({ item: result.value });
}

/** Remove it, log book and all: the circle's members, the Board, admins. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "equipment");
  if (limited) return limited;
  const ctx = await equipmentContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canManage) return forbidden(`Only ${ctx.circle.name}'s members remove equipment`);
  const result = await removeItem(ctx.circle, params.itemId);
  if (!result.ok) return equipmentProblem(result.reason);
  return NextResponse.json({ ok: true });
}
