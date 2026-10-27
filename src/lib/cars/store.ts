import { randomUUID } from "crypto";
import { z } from "zod";
import { mutateJson, readJson } from "@/lib/storage";
import type { Actor } from "@/lib/auth/actor";
import { normalizePlate, type Car, type ParsedRow } from "./shared";

/**
 * The cars (`cars/cars.json`): one list for all of CVC, each car with its
 * unit and, when known, the resident it's registered to. A plate is unique:
 * saving a car with a plate another car has is refused, and an import with
 * that plate updates that car. Who may change which is `access.ts`.
 */

const KEY = "cars/cars.json";
const MAX_CARS = 1000;

export const carInputSchema = z.object({
  unit: z.number().int().positive("Choose the unit"),
  personId: z.string().max(40).nullable().optional(),
  ownerName: z.string().trim().max(80).nullable().optional(),
  make: z.string().trim().max(40, "Keep the make to 40 characters").default(""),
  model: z.string().trim().max(40, "Keep the model to 40 characters").default(""),
  colour: z.string().trim().max(30, "Keep the colour to 30 characters").default(""),
  year: z
    .string()
    .trim()
    .regex(/^(\d{4})?$/, "A year has four digits")
    .nullable()
    .optional(),
  plate: z
    .string()
    .trim()
    .min(1, "Give the plate")
    .max(12, "Keep the plate to 12 characters")
    .transform(normalizePlate)
    .refine((plate) => plate.length > 0, "Give the plate"),
  state: z.string().trim().max(20).nullable().optional(),
  notes: z.string().trim().max(200, "Keep the notes to 200 characters").nullable().optional(),
});
export type CarInput = z.infer<typeof carInputSchema>;

export type Failure = "not_found" | "exists" | "full";
export type CarResult = { ok: true; car: Car } | { ok: false; reason: Failure };

const normalize = (raw: unknown): Car[] => {
  const cars = (raw as { cars?: unknown } | null)?.cars;
  return Array.isArray(cars) ? (cars as Car[]) : [];
};

/** Every car, by unit then plate. */
export async function listCars(): Promise<Car[]> {
  return normalize(await readJson(KEY)).sort(
    (a, b) => a.unit - b.unit || a.plate.localeCompare(b.plate)
  );
}

export async function getCar(id: string): Promise<Car | null> {
  return normalize(await readJson(KEY)).find((car) => car.id === id) ?? null;
}

const by = (actor: Pick<Actor, "userId" | "name">) => ({ userId: actor.userId, name: actor.name });
const fieldsOf = (input: CarInput) => ({
  unit: input.unit,
  personId: input.personId ?? null,
  ownerName: input.ownerName || null,
  make: input.make,
  model: input.model,
  colour: input.colour,
  year: input.year || null,
  plate: input.plate,
  state: input.state || null,
  notes: input.notes || null,
});

export function addCar(input: CarInput, actor: Pick<Actor, "userId" | "name">) {
  return mutateJson<CarResult>(KEY, (raw) => {
    const cars = normalize(raw);
    if (cars.length >= MAX_CARS) return { write: false, result: { ok: false, reason: "full" } };
    if (cars.some((car) => car.plate === input.plate))
      return { write: false, result: { ok: false, reason: "exists" } };
    const car: Car = {
      id: randomUUID(),
      ...fieldsOf(input),
      updatedAt: new Date().toISOString(),
      updatedBy: by(actor),
    };
    return { value: { cars: [...cars, car] }, result: { ok: true, car } };
  });
}

export function updateCar(id: string, input: CarInput, actor: Pick<Actor, "userId" | "name">) {
  return mutateJson<CarResult>(KEY, (raw) => {
    const cars = normalize(raw);
    const index = cars.findIndex((car) => car.id === id);
    if (index === -1) return { write: false, result: { ok: false, reason: "not_found" } };
    if (cars.some((car) => car.id !== id && car.plate === input.plate))
      return { write: false, result: { ok: false, reason: "exists" } };
    const car: Car = {
      ...cars[index],
      ...fieldsOf(input),
      updatedAt: new Date().toISOString(),
      updatedBy: by(actor),
    };
    const next = [...cars];
    next[index] = car;
    return { value: { cars: next }, result: { ok: true, car } };
  });
}

export function deleteCar(id: string) {
  return mutateJson<boolean>(KEY, (raw) => {
    const cars = normalize(raw);
    const rest = cars.filter((car) => car.id !== id);
    return rest.length === cars.length
      ? { write: false, result: false }
      : { value: { cars: rest }, result: true };
  });
}

export interface ImportTally {
  added: number;
  updated: number;
  skipped: string[];
}

/**
 * Cars from a pasted spreadsheet (`parseCarRows`): a plate already here
 * updates that car; a new one is added. `resolve` turns a row's unit and
 * owner into the unit and resident to keep (null unit: the row is skipped).
 */
export function importCars(
  rows: ParsedRow[],
  resolve: (
    row: ParsedRow
  ) => { unit: number; personId: string | null; ownerName: string | null } | null,
  actor: Pick<Actor, "userId" | "name">
) {
  return mutateJson<ImportTally>(KEY, (raw) => {
    const cars = [...normalize(raw)];
    const tally: ImportTally = { added: 0, updated: 0, skipped: [] };
    const now = new Date().toISOString();
    for (const row of rows) {
      const where = resolve(row);
      if (!where) {
        tally.skipped.push(`${row.plate}: no unit could be worked out`);
        continue;
      }
      const fields = {
        unit: where.unit,
        personId: where.personId,
        ownerName: where.ownerName,
        make: row.make,
        model: row.model,
        colour: row.colour,
        year: row.year,
        plate: row.plate,
        state: row.state,
        notes: row.notes,
      };
      const index = cars.findIndex((car) => car.plate === row.plate);
      if (index >= 0) {
        cars[index] = { ...cars[index], ...fields, updatedAt: now, updatedBy: by(actor) };
        tally.updated++;
      } else if (cars.length >= MAX_CARS) {
        tally.skipped.push(`${row.plate}: no room for more cars`);
      } else {
        cars.push({ id: randomUUID(), ...fields, updatedAt: now, updatedBy: by(actor) });
        tally.added++;
      }
    }
    return tally.added || tally.updated
      ? { value: { cars }, result: tally }
      : { write: false, result: tally };
  });
}
