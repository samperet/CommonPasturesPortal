import { NextRequest, NextResponse } from "next/server";
import { addItem, itemInputSchema, readEquipment } from "@/lib/equipment/store";
import { equipmentContext, equipmentProblem } from "@/lib/equipment/http";
import { summaryOf } from "@/lib/equipment/shared";
import { forbidden, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** A circle's equipment, each with its latest log entry, and whether you can add and change items. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await equipmentContext(params.id);
  if ("error" in ctx) return ctx.error;
  const items = await readEquipment(ctx.circle);
  return NextResponse.json(
    { items: items.map(summaryOf), canManage: ctx.canManage },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/** Add a piece of equipment: the circle's members, the Board, admins. */
export async function POST(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "equipment");
  if (limited) return limited;
  const ctx = await equipmentContext(params.id);
  if ("error" in ctx) return ctx.error;
  if (!ctx.canManage) return forbidden(`Only ${ctx.circle.name}'s members add equipment`);
  const parsed = await readBody(request, itemInputSchema);
  if ("error" in parsed) return parsed.error;
  const result = await addItem(ctx.circle, ctx.actor, parsed.data);
  if (!result.ok) return equipmentProblem(result.reason);
  return NextResponse.json({ item: result.value }, { status: 201 });
}
