import { NextRequest, NextResponse } from "next/server";
import { circleContext, circleProblem } from "@/lib/circles/access";
import { memberUpdateSchema, removeMember, updateMember } from "@/lib/circles/store";
import { readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; memberId: string } };

/**
 * Change a member's role or term (the circle's members or the Board). Making
 * a Board seat the Secretary, or the Secretary's seat something else, is for
 * admins and the Secretary: the store refuses others (403).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const ctx = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in ctx) return ctx.error;

  const parsed = await readBody(request, memberUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const result = await updateMember(
    ctx.imported,
    params.id,
    params.memberId,
    parsed.data,
    ctx.actor
  );
  return result.ok ? NextResponse.json({ circle: result.value }) : circleProblem(result.reason);
}

/** Remove a member (the circle's members or the Board); the Board keeps at least one. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in ctx) return ctx.error;

  const result = await removeMember(ctx.imported, params.id, params.memberId);
  return result.ok ? NextResponse.json({ circle: result.value }) : circleProblem(result.reason);
}
