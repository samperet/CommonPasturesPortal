import { NextRequest, NextResponse } from "next/server";
import { circleContext, circleProblem } from "@/lib/circles/access";
import { addMember, memberInputSchema } from "@/lib/circles/store";
import { problem, readBody } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Add a resident to a circle (its members or the Board). Only admins and the
 * Board Secretary may add someone to the Board as Secretary (403 otherwise).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await circleContext({ circleId: params.id, require: "member-or-board" });
  if ("error" in ctx) return ctx.error;

  const parsed = await readBody(request, memberInputSchema);
  if ("error" in parsed) return parsed.error;

  const person = ctx.directory.people.find((entry) => entry.id === parsed.data.personId);
  if (!person) return problem("That resident isn't in the directory", 404);

  const result = await addMember(
    ctx.imported,
    params.id,
    { ...parsed.data, name: person.displayName },
    ctx.actor
  );
  return result.ok
    ? NextResponse.json({ circle: result.value }, { status: 201 })
    : circleProblem(result.reason);
}
