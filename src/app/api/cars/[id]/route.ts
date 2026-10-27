import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { actorOf } from "@/lib/auth/actor";
import { readDirectory } from "@/lib/directory/store";
import { canAddCarTo, canChangeCar } from "@/lib/cars/access";
import { carInputSchema, deleteCar, getCar, updateCar } from "@/lib/cars/store";
import { carProblem, checkOwner } from "@/lib/cars/http";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function context(id: string) {
  const user = await getSessionUser();
  if (!user) return { error: problem("Sign in to continue", 401) };
  const directory = await readDirectory();
  if (!directory) return { error: problem("The directory hasn't been imported yet", 503) };
  const car = /^[0-9a-f-]{36}$/.test(id) ? await getCar(id) : null;
  if (!car) return { error: problem("That car isn't registered", 404) };
  if (!canChangeCar(user, directory, car))
    return { error: problem("You can only change your own unit's cars", 403) };
  return { user, directory, car };
}

/** Change a car (its unit's residents, the Board Secretary, admins). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const limited = throttled(request, "cars");
  if (limited) return limited;
  const ctx = await context(params.id);
  if ("error" in ctx) return ctx.error;
  const parsed = await readBody(request, carInputSchema);
  if ("error" in parsed) return parsed.error;
  if (parsed.data.unit !== ctx.car.unit && !canAddCarTo(ctx.user, ctx.directory, parsed.data.unit))
    return problem("You can only move a car to your own unit", 403);
  const owner = checkOwner(ctx.directory, parsed.data);
  if (owner) return owner;
  const result = await updateCar(params.id, parsed.data, actorOf(ctx.user));
  if (!result.ok) return carProblem(result.reason);
  return NextResponse.json({ car: result.car });
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await context(params.id);
  if ("error" in ctx) return ctx.error;
  await deleteCar(params.id);
  return NextResponse.json({ ok: true });
}
