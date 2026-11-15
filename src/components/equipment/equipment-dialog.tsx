"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import {
  DETAIL_FIELDS,
  EQUIPMENT_STATUSES,
  STATUS_LABELS,
  type EquipmentItem,
  type EquipmentStatus,
} from "@/lib/equipment/shared";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** A piece of equipment's details, as the dialog edits them. */
export type EquipmentForm = Pick<
  EquipmentItem,
  "name" | "status" | "notes" | (typeof DETAIL_FIELDS)[number][0]
>;

const EMPTY: EquipmentForm = {
  name: "",
  kind: "",
  makeModel: "",
  serial: "",
  location: "",
  acquired: "",
  owner: "",
  keeper: "",
  status: "in-service",
  notes: "",
};

const PLACEHOLDERS: Record<(typeof DETAIL_FIELDS)[number][0], string> = {
  kind: "A walk-behind brush mower, a snow blower…",
  makeModel: "Make and model",
  serial: "On its plate",
  location: "The barn, the tool shed…",
  acquired: "Bought in 2015, given by…",
  owner: "The HOA, a resident…",
  keeper: "Who to ask about it",
};

/** Adding a piece of equipment, or changing its details (the circle's members, the Board, admins). */
export function EquipmentDialog({
  title,
  initial,
  saving,
  onSave,
  onClose,
}: {
  title: string;
  initial?: EquipmentForm;
  saving: boolean;
  onSave: (form: EquipmentForm) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EquipmentForm>(() => ({ ...EMPTY, ...initial }));
  const set = <K extends keyof EquipmentForm>(key: K, value: EquipmentForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <Dialog title={title} icon={<Wrench className="h-5 w-5 text-primary" />} onClose={onClose} wide>
      <form
        className="flex flex-col gap-3"
        data-equipment-form
        onSubmit={(event) => {
          event.preventDefault();
          if (form.name.trim()) onSave(form);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Name
            <Input
              autoFocus
              required
              maxLength={120}
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="The DR mower"
              className="font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Status
            <Select
              value={form.status}
              onChange={(event) => set("status", event.target.value as EquipmentStatus)}
              className="font-normal"
            >
              {EQUIPMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {DETAIL_FIELDS.map(([key, label]) => (
            <label key={key} className="flex flex-col gap-1 text-sm font-medium text-foreground">
              {label}
              <Input
                maxLength={key === "serial" ? 120 : 400}
                value={form[key]}
                onChange={(event) => set(key, event.target.value)}
                placeholder={PLACEHOLDERS[key]}
                className="font-normal"
              />
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Notes
          <Textarea
            rows={6}
            maxLength={8000}
            value={form.notes}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="How to use it safely, what it's used for, its manual, what to watch for…"
            className="font-normal"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
