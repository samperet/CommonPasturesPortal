import { unitsOf } from "@/lib/directory/households";
import type { DirectoryDocument } from "@/lib/directory/types";
import { problem } from "@/lib/http";
import type { CarInput } from "./store";
import type { Failure } from "./store";

/** The car routes' refusals, in the app's words. */
export function carProblem(reason: Failure) {
  switch (reason) {
    case "not_found":
      return problem("That car isn't registered", 404);
    case "exists":
      return problem("A car with that plate is already registered", 409);
    case "full":
      return problem("There's no room for more cars", 409);
  }
}

/** A car registered to a resident must be to one of its unit's. */
export function checkOwner(directory: DirectoryDocument, input: CarInput) {
  if (!input.personId) return null;
  const person = directory.people.find((entry) => entry.id === input.personId);
  if (!person || !unitsOf(person).includes(input.unit))
    return problem("Choose someone who lives in that unit", 400);
  return null;
}
