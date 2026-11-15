import type { NextResponse } from "next/server";
import { circleContext } from "@/lib/circles/access";
import { canUploadTo } from "@/lib/documents/access";
import { problem } from "@/lib/http";
import type { Failure } from "./store";

/**
 * Who may do what with a circle's equipment. Every signed-in resident sees
 * the list, each item and its log book, and adds to the log (whoever used
 * or fixed it); entries are changed or removed by whoever wrote them. The
 * circle's members, the Board and admins add, change and remove items, and
 * can change or remove any entry.
 */
export async function equipmentContext(circleId: string) {
  const ctx = await circleContext({ circleId });
  if ("error" in ctx) return { error: ctx.error as NextResponse };
  const circle = ctx.directory.circles.find((entry) => entry.id === circleId)!;
  const canManage = ctx.actor.admin || canUploadTo(ctx.user, ctx.directory, circleId);
  return { actor: ctx.actor, circle, canManage, canLog: !!ctx.user.personId };
}

export function equipmentProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That's no longer here", 404);
    case "forbidden":
      return problem("Only whoever wrote it — or the circle's members — can change it", 403);
    case "full":
      return problem("This list is full", 409);
    case "future":
      return problem("Log what's happened: choose today or a day before", 400);
  }
}
