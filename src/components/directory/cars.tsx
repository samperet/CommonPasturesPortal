"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car as CarIcon, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import type { Car } from "@/lib/cars/shared";
import { describeCar } from "@/lib/cars/shared";
import type { DirectoryDocument, Person } from "@/lib/directory/types";
import { unitsOf } from "@/lib/directory/households";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/pill";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/use-toast";

/**
 * The Directory's Cars tab: every registered car, by unit, searchable by
 * plate, make, model, colour, owner or unit — so a neighbour can tell whose
 * car is in the lane. Residents add and change their own unit's cars; the
 * Board Secretary and admins any. A person's page lists their unit's cars too.
 */

type CarsResponse = { cars: Car[]; units: number[]; canManageAll: boolean };
export const carsQuery = () => ({
  queryKey: ["cars"],
  queryFn: () => apiFetch<CarsResponse>("/api/cars"),
});

const matches = (car: Car, owner: string, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const plate = car.plate.replace(/[\s-]/g, "").toLowerCase();
  return (
    plate.includes(q.replace(/[\s-]/g, "")) ||
    describeCar(car).toLowerCase().includes(q) ||
    owner.toLowerCase().includes(q) ||
    `unit ${car.unit}` === q ||
    String(car.unit) === q
  );
};

type Draft = {
  unit: string;
  personId: string;
  ownerName: string;
  make: string;
  model: string;
  colour: string;
  year: string;
  plate: string;
  state: string;
  notes: string;
};
const draftOf = (car: Car | null, unit: number): Draft => ({
  unit: String(car?.unit ?? unit),
  personId: car?.personId ?? "",
  ownerName: car?.ownerName ?? "",
  make: car?.make ?? "",
  model: car?.model ?? "",
  colour: car?.colour ?? "",
  year: car?.year ?? "",
  plate: car?.plate ?? "",
  state: car?.state ?? "",
  notes: car?.notes ?? "",
});

function CarDialog({
  car,
  units,
  people,
  onClose,
}: {
  car: Car | null;
  /** The units this person may register cars to. */
  units: number[];
  people: Person[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(car, units[0]));
  const residents = people.filter((person) => unitsOf(person).includes(Number(draft.unit)));
  const set = (field: keyof Draft) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));
  const save = useMutation({
    mutationFn: () =>
      apiFetch<{ car: Car }>(car ? `/api/cars/${car.id}` : "/api/cars", {
        method: car ? "PATCH" : "POST",
        body: JSON.stringify({
          unit: Number(draft.unit),
          personId: draft.personId || null,
          ownerName: draft.personId ? null : draft.ownerName || null,
          make: draft.make,
          model: draft.model,
          colour: draft.colour,
          year: draft.year || null,
          plate: draft.plate,
          state: draft.state || null,
          notes: draft.notes || null,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cars"] });
      toast({ title: car ? "Car updated" : "Car registered" });
      onClose();
    },
    onError: (error: Error) =>
      toast({ title: "Couldn't save the car", description: error.message, variant: "destructive" }),
  });
  const field = "flex flex-col gap-1 text-sm font-medium text-foreground";
  return (
    <Dialog
      title={car ? "Change this car" : "Register a car"}
      icon={<CarIcon className="h-5 w-5 text-primary" aria-hidden />}
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-3"
        data-car-form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>
            Unit
            <Select value={draft.unit} onChange={(event) => set("unit")(event.target.value)}>
              {units.map((unit) => (
                <option key={unit} value={String(unit)}>
                  Unit {unit}
                </option>
              ))}
            </Select>
          </label>
          <label className={field}>
            Registered to
            <Select
              value={draft.personId}
              onChange={(event) => set("personId")(event.target.value)}
            >
              <option value="">Someone else, or not said</option>
              {residents.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </Select>
          </label>
          {!draft.personId ? (
            <label className={`${field} sm:col-span-2`}>
              Owner&apos;s name (optional)
              <Input
                value={draft.ownerName}
                maxLength={80}
                onChange={(event) => set("ownerName")(event.target.value)}
                className="bg-white"
              />
            </label>
          ) : null}
          <label className={field}>
            Plate
            <Input
              value={draft.plate}
              maxLength={12}
              required
              onChange={(event) => set("plate")(event.target.value)}
              placeholder="ABC 123"
              className="bg-white font-mono uppercase"
            />
          </label>
          <label className={field}>
            State
            <Input
              value={draft.state}
              maxLength={20}
              onChange={(event) => set("state")(event.target.value)}
              placeholder="VT"
              className="bg-white"
            />
          </label>
          <label className={field}>
            Make
            <Input
              value={draft.make}
              maxLength={40}
              onChange={(event) => set("make")(event.target.value)}
              placeholder="Subaru"
              className="bg-white"
            />
          </label>
          <label className={field}>
            Model
            <Input
              value={draft.model}
              maxLength={40}
              onChange={(event) => set("model")(event.target.value)}
              placeholder="Outback"
              className="bg-white"
            />
          </label>
          <label className={field}>
            Colour
            <Input
              value={draft.colour}
              maxLength={30}
              onChange={(event) => set("colour")(event.target.value)}
              placeholder="Blue"
              className="bg-white"
            />
          </label>
          <label className={field}>
            Year
            <Input
              value={draft.year}
              maxLength={4}
              inputMode="numeric"
              onChange={(event) => set("year")(event.target.value)}
              placeholder="2019"
              className="bg-white"
            />
          </label>
          <label className={`${field} sm:col-span-2`}>
            Notes
            <Input
              value={draft.notes}
              maxLength={200}
              onChange={(event) => set("notes")(event.target.value)}
              placeholder="Usually in shed 4; the dent is old"
              className="bg-white"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={save.isPending} data-car-save>
            {save.isPending ? "Saving…" : car ? "Save" : "Register"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** A registered car as a row: its plate, what it is, whose it is. */
export function CarRow({
  car,
  people,
  onEdit,
  onDelete,
}: {
  car: Car;
  people: Person[];
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const owner = car.personId ? people.find((person) => person.id === car.personId) : null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-car={car.plate}>
      <span className="rounded-md border border-border bg-white px-2 py-0.5 font-mono text-base font-semibold tracking-wide text-foreground">
        {car.plate}
      </span>
      {car.state ? (
        <Pill tone="outline" size="xs">
          {car.state}
        </Pill>
      ) : null}
      <span className="text-foreground">{describeCar(car) || "A car"}</span>
      <span className="text-foreground-light">
        {owner ? (
          <Link href={`/directory/${owner.id}`} className="hover:underline">
            {owner.displayName}
          </Link>
        ) : (
          car.ownerName
        )}
      </span>
      {car.notes ? <span className="text-xs text-muted">{car.notes}</span> : null}
      {onEdit || onDelete ? (
        <span className="ml-auto flex items-center gap-1">
          {onEdit ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={onEdit}
              aria-label={`Change ${car.plate}`}
            >
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted hover:text-destructive"
              onClick={onDelete}
              aria-label={`Remove ${car.plate}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

export function CarsTab({
  doc,
  initialQuery = "",
}: {
  doc: DirectoryDocument;
  initialQuery?: string;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(initialQuery);
  const [dialog, setDialog] = useState<{ kind: "add" } | { kind: "edit"; car: Car } | null>(null);
  const { data, isLoading } = useQuery(carsQuery());
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/cars/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["cars"] }),
    onError: (error: Error) =>
      toast({
        title: "Couldn't remove the car",
        description: error.message,
        variant: "destructive",
      }),
  });
  const people = doc.people;
  const ownerOf = (car: Car) =>
    (car.personId
      ? people.find((person) => person.id === car.personId)?.displayName
      : car.ownerName) ?? "";
  const cars = (data?.cars ?? []).filter((car) => matches(car, ownerOf(car), query));
  const units = Array.from(new Set(cars.map((car) => car.unit))).sort((a, b) => a - b);
  const allUnits = Array.from(new Set(people.flatMap(unitsOf))).sort((a, b) => a - b);
  const mayAddTo = data?.canManageAll ? allUnits : data?.units ?? [];
  const may = (car: Car) => !!data && (data.canManageAll || data.units.includes(car.unit));

  return (
    <div className="flex flex-col gap-4" data-cars>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-[16rem]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by plate, make, colour, owner, or unit"
            aria-label="Search cars"
            className="pl-9"
          />
        </div>
        {mayAddTo.length ? (
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => setDialog({ kind: "add" })}
            data-car-add
          >
            <Plus className="h-4 w-4" /> Register a car
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading the cars…</p>
      ) : !cars.length ? (
        <Card>
          <p className="text-sm text-muted">
            {query
              ? `No cars match “${query}”.`
              : "No cars registered yet. Register yours so neighbours know whose is whose."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {units.map((unit) => (
            <Card key={unit} className="flex flex-col gap-1 p-4" data-cars-unit={unit}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CarIcon className="h-4 w-4 text-primary" aria-hidden /> Unit {unit}
              </h2>
              <ul className="divide-y divide-border">
                {cars
                  .filter((car) => car.unit === unit)
                  .map((car) => (
                    <CarRow
                      key={car.id}
                      car={car}
                      people={people}
                      onEdit={may(car) ? () => setDialog({ kind: "edit", car }) : undefined}
                      onDelete={
                        may(car)
                          ? async () => {
                              if (
                                await confirm({
                                  title: `Remove ${car.plate}?`,
                                  body: "It will no longer be listed as a car at CVC.",
                                  confirmLabel: "Remove",
                                  destructive: true,
                                })
                              )
                                remove.mutate(car.id);
                            }
                          : undefined
                      }
                    />
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {dialog?.kind === "add" ? (
        <CarDialog car={null} units={mayAddTo} people={people} onClose={() => setDialog(null)} />
      ) : dialog?.kind === "edit" ? (
        <CarDialog
          car={dialog.car}
          units={
            data?.canManageAll
              ? allUnits
              : Array.from(new Set([dialog.car.unit, ...(data?.units ?? [])]))
          }
          people={people}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/** On a person's page: their unit's cars, with a way to the Cars tab. */
export function PersonCars({ person }: { person: Person }) {
  const { data } = useQuery(carsQuery());
  const units = unitsOf(person);
  const cars = (data?.cars ?? []).filter((car) => units.includes(car.unit));
  if (!cars.length) return null;
  return (
    <div className="flex flex-col gap-2" data-person-cars>
      <h2 className="text-sm font-semibold text-foreground">Cars</h2>
      <ul className="divide-y divide-border">
        {cars.map((car) => (
          <CarRow key={car.id} car={car} people={[person]} />
        ))}
      </ul>
      <Link
        href="/directory?tab=cars"
        className="w-fit text-sm text-secondary-foreground underline underline-offset-4"
      >
        All cars at CVC
      </Link>
    </div>
  );
}
