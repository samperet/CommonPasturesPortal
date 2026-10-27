/**
 * Car registration: the cars residents keep at CVC, so a neighbour can tell
 * whose car is in the lane, who to ask to move it, and which unit a plate
 * belongs to. Each car belongs to a unit, and to a resident when one is
 * named. Types and pure helpers, safe for the browser; the store is
 * `store.ts`, who may change what is `access.ts`.
 */

export interface Car {
  id: string;
  /** The household's unit. */
  unit: number;
  /** The resident it's registered to (one of the unit's), when known. */
  personId: string | null;
  /** The owner's name as given, when not a resident in the directory (or alongside). */
  ownerName: string | null;
  make: string;
  model: string;
  colour: string;
  year: string | null;
  /** The plate, uppercased, as read on the car. */
  plate: string;
  /** The plate's state or province, if noted. */
  state: string | null;
  notes: string | null;
  updatedAt: string;
  updatedBy: { userId: string; name: string };
}

/** A plate as kept: uppercase, one space at most between its parts. */
export const normalizePlate = (plate: string) =>
  plate
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** "Blue 2019 Subaru Outback". */
export function describeCar(car: Pick<Car, "colour" | "year" | "make" | "model">) {
  return [car.colour, car.year, car.make, car.model].filter(Boolean).join(" ").trim();
}

/** The column names a pasted spreadsheet may use, by what they mean. */
export const COLUMN_NAMES: Record<
  "unit" | "owner" | "make" | "model" | "colour" | "year" | "plate" | "state" | "notes",
  string[]
> = {
  unit: ["unit", "house", "household", "home", "unit #", "unit number"],
  owner: ["owner", "name", "resident", "driver", "who", "owner name", "registered to"],
  make: ["make", "manufacturer", "brand"],
  model: ["model", "car", "vehicle", "make/model", "make & model", "make and model"],
  colour: ["colour", "color"],
  year: ["year"],
  plate: [
    "plate",
    "license",
    "licence",
    "license plate",
    "licence plate",
    "registration",
    "reg",
    "tag",
    "plate #",
    "plate number",
  ],
  state: ["state", "province", "plate state"],
  notes: ["notes", "note", "comments", "comment", "other"],
};

export interface ParsedRow {
  unit: number | null;
  owner: string | null;
  make: string;
  model: string;
  colour: string;
  year: string | null;
  plate: string;
  state: string | null;
  notes: string | null;
}

/**
 * Rows pasted from a spreadsheet (tab- or comma-separated, the header row
 * first): each car as read, with what couldn't be read said in `problems`.
 * A "make/model" column is split at its first space ("Subaru Outback").
 */
export function parseCarRows(text: string): { rows: ParsedRow[]; problems: string[] } {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  if (!lines.length) return { rows: [], problems: ["Nothing to read"] };
  const separator = lines[0].includes("\t") ? "\t" : ",";
  const split = (line: string) =>
    separator === "\t" ? line.split("\t").map((cell) => cell.trim()) : splitCsv(line);
  const header = split(lines[0]).map((cell) => cell.toLowerCase().trim());
  const column = (key: keyof typeof COLUMN_NAMES) =>
    header.findIndex((cell) => COLUMN_NAMES[key].includes(cell));
  const at = {
    unit: column("unit"),
    owner: column("owner"),
    make: column("make"),
    model: column("model"),
    colour: column("colour"),
    year: column("year"),
    plate: column("plate"),
    state: column("state"),
    notes: column("notes"),
  };
  const problems: string[] = [];
  if (at.plate === -1) problems.push("No plate column (named plate, license, registration or tag)");
  if (at.make === -1 && at.model === -1) problems.push("No make or model column");
  if (problems.length) return { rows: [], problems };
  const rows: ParsedRow[] = [];
  lines.slice(1).forEach((line, index) => {
    const cells = split(line);
    const cell = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
    const plate = normalizePlate(cell(at.plate));
    if (!plate) {
      problems.push(`Row ${index + 2}: no plate`);
      return;
    }
    let make = cell(at.make);
    let model = cell(at.model);
    if (!make && model.includes(" "))
      [make, model] = [model.split(" ")[0], model.slice(model.indexOf(" ") + 1)];
    const unitText = cell(at.unit).replace(/[^0-9]/g, "");
    rows.push({
      unit: unitText ? Number(unitText) : null,
      owner: cell(at.owner) || null,
      make,
      model,
      colour: cell(at.colour),
      year: /^\d{4}$/.test(cell(at.year)) ? cell(at.year) : null,
      plate,
      state: cell(at.state) || null,
      notes: cell(at.notes) || null,
    });
  });
  return { rows, problems };
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}
