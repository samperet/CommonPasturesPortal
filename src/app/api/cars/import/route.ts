import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { actorOf } from "@/lib/auth/actor";
import { readDirectory } from "@/lib/directory/store";
import { unitsOf } from "@/lib/directory/households";
import { canImportCars } from "@/lib/cars/access";
import { parseCarRows } from "@/lib/cars/shared";
import { importCars } from "@/lib/cars/store";
import { problem, readBody, throttled } from "@/lib/http";

export const dynamic = "force-dynamic";

const schema = z.object({ text: z.string().min(1).max(200_000) });

/**
 * Cars from a spreadsheet, pasted with its header row (the Board Secretary
 * and admins). Each row's owner is matched to a resident by name (and, if
 * the row names no unit, the unit is theirs); a plate already registered
 * updates that car. Answers with the tally and what was skipped.
 */
export async function POST(request: NextRequest) {
  const limited = throttled(request, "cars-import", "Too many imports — wait a minute", 10);
  if (limited) return limited;
  const user = await getSessionUser();
  if (!user) return problem("Sign in to continue", 401);
  const directory = await readDirectory();
  if (!directory) return problem("The directory hasn't been imported yet", 503);
  if (!canImportCars(user, directory))
    return problem("Only the Board Secretary and admins can import cars", 403);
  const parsed = await readBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const { rows, problems } = parseCarRows(parsed.data.text);
  if (!rows.length) return problem(problems.join("; ") || "No cars in what was pasted");
  const people = directory.people;
  const tally = await importCars(
    rows,
    (row) => {
      const owner = row.owner?.trim().toLowerCase() ?? "";
      const candidates = owner
        ? people.filter(
            (person) =>
              person.displayName.toLowerCase() === owner ||
              `${person.firstName} ${person.lastName}`.toLowerCase() === owner ||
              (row.unit !== null &&
                unitsOf(person).includes(row.unit) &&
                person.firstName.toLowerCase() === owner.split(/\s+/)[0])
          )
        : [];
      const person =
        candidates.find((entry) => row.unit === null || unitsOf(entry).includes(row.unit)) ?? null;
      const unit = row.unit ?? (person ? unitsOf(person)[0] : null);
      if (!unit) return null;
      return { unit, personId: person?.id ?? null, ownerName: person ? null : row.owner };
    },
    actorOf(user)
  );
  return NextResponse.json({ ...tally, skipped: [...problems, ...tally.skipped] });
}
