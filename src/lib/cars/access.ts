import { canManageDirectory } from "@/lib/directory/access";
import { unitsOf } from "@/lib/directory/households";
import type { DirectoryDocument } from "@/lib/directory/types";
import type { Car } from "./shared";

/**
 * Every signed-in resident sees every car. A resident adds and changes the
 * cars of their own unit (every unit they're listed in); the Board
 * Secretary and admins (`canManageDirectory`) any car, and they alone
 * import a spreadsheet of them.
 */

type Viewer = { personId?: string | null };

/** The units whose cars this resident may keep. */
export function unitsKept(user: Viewer, directory: DirectoryDocument): number[] {
  const person = directory.people.find((entry) => entry.id === user.personId);
  return person ? unitsOf(person) : [];
}

export const canAddCarTo = (user: Viewer, directory: DirectoryDocument, unit: number) =>
  canManageDirectory(user, directory) || unitsKept(user, directory).includes(unit);

export const canChangeCar = (user: Viewer, directory: DirectoryDocument, car: Pick<Car, "unit">) =>
  canAddCarTo(user, directory, car.unit);

export const canImportCars = (user: Viewer, directory: DirectoryDocument) =>
  canManageDirectory(user, directory);
