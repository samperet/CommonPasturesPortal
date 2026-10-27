import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { actorOf } from "@/lib/auth/actor";
import { readDirectory } from "@/lib/directory/store";
import { canAddCarTo, canImportCars, unitsKept } from "@/lib/cars/access";
import { addCar, carInputSchema } from "@/lib/cars/store";
import { listCars } from "@/lib/cars/store";
import { carProblem, checkOwner } from "@/lib/cars/http";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Car registration (`lib/cars`): every resident sees every car (GET, with
 * the units they may add cars to and whether they may import a
 * spreadsheet); POST adds one to a unit of theirs (the Board Secretary and
 * admins: any unit).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return problem("Sign in to see the cars", 401);
  const directory = await readDirectory();
  if (!directory) return problem("The directory hasn't been imported yet", 503);
  return NextResponse.json(
    {
      cars: await listCars(),
      units: unitsKept(user, directory),
      canManageAll: canImportCars(user, directory),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const limited = throttled(request, "cars");
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  const directory = await readDirectory();
  if (!directory) return problem("The directory hasn't been imported yet", 503);
  const parsed = await readBody(request, carInputSchema);
  if ("error" in parsed) return parsed.error;
  if (!canAddCarTo(user, directory, parsed.data.unit))
    return problem("You can only add cars to your own unit", 403);
  const owner = checkOwner(directory, parsed.data);
  if (owner) return owner;
  const result = await addCar(parsed.data, actorOf(user));
  if (!result.ok) return carProblem(result.reason);
  return NextResponse.json({ car: result.car }, { status: 201 });
}
