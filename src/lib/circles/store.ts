import { randomUUID } from "crypto";
import { z } from "zod";
import {
  INFO_SORTS,
  INFO_VIEWS,
  MAX_CHOSEN_PAGES,
  MAX_MODULES,
  MODULE_TYPES,
  RECENT_LIMITS,
  MODULE_SIZES,
  TASK_ADDERS,
  LOG_POSTERS,
  FINANCE_VIEWERS,
  MAX_TEXT_MODULE,
  REPEATABLE_MODULES,
  TEXT_BACKGROUNDS,
  type CircleModule,
} from "./layout";
import { mutateJson, readJson, readOrSeedJson } from "@/lib/storage";
import { TASK_DUES, TASK_SHOWS, TASK_WHOSE } from "@/lib/tasks/shared";
import { BOARD_ID, COMMUNITY_ID, isCommunity } from "./ids";
import { canHaveSubgroups } from "./tiers";
import type { Circle, CircleApplication, CircleKind, CircleSeat } from "@/lib/circles/types";

/**
 * Circles are managed in the app. The store is seeded once from the imported
 * spreadsheet (members only — the sheet's empty placeholder seats are
 * dropped); after that it is the source of truth and re-imports don't touch it.
 * Every member is a directory resident.
 */

const KEY = "circles/circles.json";
export { BOARD_ID, COMMUNITY_ID, isCommunity };
/**
 * The Community circle: everyone who lives at CVC, without a member list.
 * It always exists, can't be deleted or joined, holds community documents
 * (any resident can add them), and has the Community Forum.
 */
const COMMUNITY: Circle = {
  id: COMMUNITY_ID,
  name: "Community",
  description: "Everyone who lives at CVC.",
  seats: [],
};

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`);

const kind = z.enum(["circle", "club"]);

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, "Not a valid id");
const infoFilter = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pages"),
    pageIds: z
      .array(id)
      .min(1, "Choose at least one page")
      .max(MAX_CHOSEN_PAGES, `Choose up to ${MAX_CHOSEN_PAGES} pages`),
  }),
  z.object({ kind: z.literal("circle"), circleId: id }),
  z.object({ kind: z.literal("proposed"), circleId: id }),
  z.object({
    kind: z.literal("recent"),
    limit: z.number().int().min(RECENT_LIMITS.min).max(RECENT_LIMITS.max),
    circleId: id.optional(),
  }),
]);
const moduleSchema = z
  .object({
    id,
    type: z.enum(MODULE_TYPES),
    size: z.enum(MODULE_SIZES),
    title: text(60, "A module's title")
      .optional()
      .transform((value) => value || undefined),
    info: z
      .object({ filter: infoFilter, view: z.enum(INFO_VIEWS), sort: z.enum(INFO_SORTS).optional() })
      .refine(
        (info) => info.sort !== "chosen" || info.filter.kind === "pages",
        "Only chosen pages keep their chosen order"
      )
      .optional(),
    tasks: z
      .object({
        add: z.enum(TASK_ADDERS),
        view: z
          .object({
            show: z.enum(TASK_SHOWS),
            whose: z.enum(TASK_WHOSE),
            personId: z.string().max(80).optional(),
            due: z.enum(TASK_DUES),
            high: z.boolean().optional(),
            repeating: z.boolean().optional(),
          })
          .refine(
            (view) => view.whose !== "person" || !!view.personId,
            "Choose whose tasks it shows"
          )
          .optional(),
      })
      .optional(),
    log: z.object({ post: z.enum(LOG_POSTERS) }).optional(),
    finances: z.object({ view: z.enum(FINANCE_VIEWERS) }).optional(),
    text: z
      .object({
        body: z
          .string()
          .max(
            MAX_TEXT_MODULE,
            `Keep custom text to ${MAX_TEXT_MODULE.toLocaleString()} characters`
          ),
        background: z.enum(TEXT_BACKGROUNDS).optional(),
      })
      .optional(),
    taskButton: z
      .object({
        label: z
          .string()
          .trim()
          .min(1, "Say what the button says")
          .max(60, "Keep the button's words to 60 characters"),
        title: z
          .string()
          .trim()
          .min(1, "Name the task it makes")
          .max(160, "Keep the task's title to 160 characters"),
        assignee: z.object({
          circleId: z.string().min(1).max(80),
          position: z.string().trim().min(1).max(40).nullable(),
        }),
      })
      .optional(),
  })
  .refine(
    (module) => (module.type === "information") === !!module.info,
    "Filtered Documents modules (only) choose which pages they show"
  )
  .refine(
    (module) => module.type === "tasks" || !module.tasks,
    "Only a Tasks module says who can add tasks"
  )
  .refine(
    (module) => module.type === "log" || !module.log,
    "Only a Log module says who can post to it"
  )
  .refine(
    (module) => module.type === "finances" || !module.finances,
    "Only a Finances module says who can see it"
  )
  .refine((module) => module.type === "text" || !module.text, "Only Custom Text modules hold text")
  .refine(
    (module) => (module.type === "taskbutton") === !!module.taskButton,
    "Set up each Task button: what it says, the task it makes, and who it's for"
  )
  .transform(
    ({ title, info, tasks, log, finances, text, taskButton, ...module }): CircleModule => ({
      ...module,
      ...(title ? { title } : {}),
      ...(info ? { info } : {}),
      ...(tasks ? { tasks } : {}),
      ...(log ? { log } : {}),
      ...(finances ? { finances } : {}),
      ...(text ? { text } : {}),
      ...(taskButton ? { taskButton } : {}),
    })
  );

/** The page's modules, in order: any number of Filtered Documents, Custom Text and Tasks modules, the others once each. */
export const modulesSchema = z
  .array(moduleSchema)
  .max(MAX_MODULES, `Up to ${MAX_MODULES} modules`)
  .refine(
    (modules) => new Set(modules.map((module) => module.id)).size === modules.length,
    "Each module once"
  )
  .refine((modules) => {
    const others = modules
      .filter((module) => !REPEATABLE_MODULES.includes(module.type))
      .map((module) => module.type);
    return new Set(others).size === others.length;
  }, "Members, the duty schedule, the forum, the log, finances, documents, sub groups, and the alert button can each appear once");

export const circleInputSchema = z.object({
  name: text(80, "Name").min(2, "Name the circle (at least 2 characters)"),
  description: text(1000, "Description")
    .optional()
    .transform((value) => value || null),
  kind: kind.default("club"),
  /** Start a sub group of this circle (its kind follows the circle's). */
  parentId: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
});

// A circle's parent is set when it's started and never moved, so an update can't name one.
export const circleUpdateSchema = circleInputSchema
  .omit({ kind: true, parentId: true })
  .extend({
    joinPolicy: z.enum(["open", "apply"]),
    kind,
    /** The page, as modules (see `src/lib/circles/layout.ts`). */
    modules: modulesSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const joinInputSchema = z
  .object({
    message: text(500, "Message")
      .optional()
      .transform((value) => value || null),
  })
  .default({});

export const decisionSchema = z.object({ approve: z.boolean() });

const MAX_APPLICATIONS = 100;

export const memberInputSchema = z.object({
  personId: z.string().regex(/^[a-f0-9]{12}$/, "Choose a resident"),
  position: text(40, "Role")
    .optional()
    .transform((value) => value || null),
  termEnds: text(30, "Term")
    .optional()
    .transform((value) => value || null),
});

export const memberUpdateSchema = z
  .object({
    position: text(40, "Role")
      .nullable()
      .optional()
      .transform((value) => value || null),
    termEnds: text(30, "Term")
      .nullable()
      .optional()
      .transform((value) => value || null),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

function normalize(raw: unknown): Circle[] | null {
  const circles = (raw as { circles?: unknown } | null)?.circles;
  if (!Array.isArray(circles)) return null;
  const list = circles as Circle[];
  return list.some((circle) => circle.id === COMMUNITY_ID) ? list : [COMMUNITY, ...list];
}

function seedFrom(imported: Circle[]): Circle[] {
  return imported.map((circle) => ({
    id: circle.id,
    code: circle.code,
    name: circle.name,
    description: null,
    seats: circle.seats
      .filter((seat) => seat.personId)
      .map((seat) => ({ ...seat, id: randomUUID() })),
  }));
}

/** The managed circles, seeding them from the import the first time. */
export async function readCircles(imported: Circle[]): Promise<Circle[]> {
  const stored = normalize(await readJson(KEY));
  if (stored) return stored;
  return readOrSeedJson(KEY, normalize, () => ({ circles: seedFrom(imported) }));
}

export type Failure =
  | "not_found"
  | "exists"
  | "duplicate_member"
  | "last_board_member"
  | "already_applied"
  | "not_member"
  | "full"
  | "everyone"
  | "bad_parent";
export type CircleResult<T = Circle> = { ok: true; value: T } | { ok: false; reason: Failure };

async function mutate<T>(
  imported: Circle[],
  change: (circles: Circle[]) => { circles: Circle[]; value: T } | Failure
): Promise<CircleResult<T>> {
  await readCircles(imported); // make sure the store exists before changing it
  return mutateJson<CircleResult<T>>(KEY, (raw) => {
    const result = change(normalize(raw) ?? []);
    if (typeof result === "string") return { write: false, result: { ok: false, reason: result } };
    return { value: { circles: result.circles }, result: { ok: true, value: result.value } };
  });
}

/** A new circle's address, from its name ("Chicken Tenders" → "chicken-tenders"). */
function slugFor(input: { name: string }, taken: Set<string>) {
  const base =
    input.name
      .toLowerCase()
      .replace(/&/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "circle";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/**
 * Start a circle, with its founder as its first member — or, with
 * `parentId`, a sub group of a top-level circle (not Community), of the same
 * kind as it.
 */
export function createCircle(
  imported: Circle[],
  input: { name: string; description: string | null; kind: CircleKind; parentId?: string },
  founder: { personId: string; name: string }
) {
  return mutate(imported, (circles) => {
    if (circles.some((circle) => circle.name.toLowerCase() === input.name.toLowerCase())) {
      return "exists";
    }
    const parent = input.parentId
      ? circles.find((circle) => circle.id === input.parentId)
      : undefined;
    if (input.parentId && (!parent || !canHaveSubgroups(circles, parent))) return "bad_parent";
    const club = parent ? parent.kind === "club" : input.kind === "club";
    const circle: Circle = {
      id: slugFor(input, new Set(circles.map((c) => c.id))),
      name: input.name,
      description: input.description,
      ...(club ? { kind: "club" as const } : {}),
      ...(parent ? { parentId: parent.id } : {}),
      seats: [
        {
          id: randomUUID(),
          personId: founder.personId,
          name: founder.name,
          position: "Member",
          termEnds: null,
        },
      ],
    };
    return { circles: [...circles, circle], value: circle };
  });
}

export function updateCircle(
  imported: Circle[],
  id: string,
  update: Partial<{
    name: string;
    description: string | null;
    joinPolicy: "open" | "apply";
    kind: CircleKind;
    modules: CircleModule[];
  }>
) {
  return mutate(imported, (circles) => {
    const index = circles.findIndex((circle) => circle.id === id);
    if (index === -1) return "not_found";
    const clash = circles.some(
      (circle) =>
        circle.id !== id && !!update.name && circle.name.toLowerCase() === update.name.toLowerCase()
    );
    if (clash) return "exists";
    const next = [...circles];
    next[index] = {
      ...next[index],
      ...update,
      // Tasks and documents are on exactly when their modules are on the page (which is what lets the circle use them).
      ...(update.modules
        ? {
            features: {
              ...next[index].features,
              tasks: update.modules.some((module) => module.type === "tasks"),
              documents: update.modules.some((module) => module.type === "documents"),
            },
          }
        : {}),
    };
    return { circles: next, value: next[index] };
  });
}

/** Delete a circle (the deleted one is the result); its sub groups become circles of their own. */
export function deleteCircle(imported: Circle[], id: string) {
  return mutate(imported, (circles) => {
    const circle = circles.find((entry) => entry.id === id);
    if (!circle) return "not_found";
    return {
      circles: circles
        .filter((entry) => entry.id !== id)
        .map((entry) => {
          if (entry.parentId !== id) return entry;
          const { parentId: _parent, ...rest } = entry;
          return rest;
        }),
      value: circle,
    };
  });
}

export function addMember(
  imported: Circle[],
  id: string,
  member: { personId: string; name: string; position: string | null; termEnds: string | null }
) {
  return mutate(imported, (circles) => {
    const index = circles.findIndex((circle) => circle.id === id);
    if (index === -1) return "not_found";
    if (isCommunity(id)) return "everyone";
    if (circles[index].seats.some((seat) => seat.personId === member.personId))
      return "duplicate_member";
    const seat: CircleSeat = { id: randomUUID(), ...member };
    const next = [...circles];
    next[index] = { ...next[index], seats: [...next[index].seats, seat] };
    return { circles: next, value: next[index] };
  });
}

export function updateMember(
  imported: Circle[],
  id: string,
  memberId: string,
  update: { position?: string | null; termEnds?: string | null }
) {
  return mutate(imported, (circles) => {
    const index = circles.findIndex((circle) => circle.id === id);
    if (index === -1 || !circles[index].seats.some((seat) => seat.id === memberId))
      return "not_found";
    const next = [...circles];
    next[index] = {
      ...next[index],
      seats: next[index].seats.map((seat) =>
        seat.id === memberId ? { ...seat, ...update } : seat
      ),
    };
    return { circles: next, value: next[index] };
  });
}

/** Take a resident out of every circle, and withdraw their applications (when they leave the directory). */
export function removePersonFromCircles(imported: Circle[], personId: string) {
  return mutate<number>(imported, (circles) => {
    let removed = 0;
    const next = circles.map((circle) => {
      const seats = circle.seats.filter((seat) => seat.personId !== personId);
      const applications = (circle.applications ?? []).filter(
        (application) => application.personId !== personId
      );
      removed += circle.seats.length - seats.length;
      return seats.length === circle.seats.length &&
        applications.length === (circle.applications ?? []).length
        ? circle
        : { ...circle, seats, applications };
    });
    return { circles: next, value: removed };
  });
}

export function removeMember(imported: Circle[], id: string, memberId: string) {
  return mutate(imported, (circles) => {
    const index = circles.findIndex((circle) => circle.id === id);
    if (index === -1 || !circles[index].seats.some((seat) => seat.id === memberId))
      return "not_found";
    const seats = circles[index].seats.filter((seat) => seat.id !== memberId);
    // The Board is who can manage every circle; never leave it empty.
    if (id === BOARD_ID && !seats.some((seat) => seat.personId)) return "last_board_member";
    const next = [...circles];
    next[index] = { ...next[index], seats };
    return { circles: next, value: next[index] };
  });
}

const memberSeat = (person: { personId: string; name: string }): CircleSeat => ({
  id: randomUUID(),
  personId: person.personId,
  name: person.name,
  position: "Member",
  termEnds: null,
});

/**
 * A resident asks to join: in a circle anyone can join they become a member
 * straight away; otherwise their application waits for the circle's members.
 */
export function requestToJoin(
  imported: Circle[],
  id: string,
  person: { personId: string; name: string },
  message: string | null
) {
  return mutate<{ circle: Circle; joined: boolean; application: CircleApplication | null }>(
    imported,
    (circles) => {
      const index = circles.findIndex((circle) => circle.id === id);
      if (index === -1) return "not_found";
      if (isCommunity(id)) return "everyone";
      const circle = circles[index];
      if (circle.seats.some((seat) => seat.personId === person.personId)) return "duplicate_member";
      const next = [...circles];
      if (circle.joinPolicy === "open") {
        next[index] = { ...circle, seats: [...circle.seats, memberSeat(person)] };
        return { circles: next, value: { circle: next[index], joined: true, application: null } };
      }
      const applications = circle.applications ?? [];
      if (applications.some((application) => application.personId === person.personId))
        return "already_applied";
      if (applications.length >= MAX_APPLICATIONS) return "full";
      const application: CircleApplication = {
        id: randomUUID(),
        ...person,
        message,
        createdAt: new Date().toISOString(),
      };
      next[index] = { ...circle, applications: [...applications, application] };
      return { circles: next, value: { circle: next[index], joined: false, application } };
    }
  );
}

/** A resident leaves a circle, or withdraws their application to it. */
export function leaveCircle(imported: Circle[], id: string, personId: string) {
  return mutate<{ left: boolean; withdrew: boolean }>(imported, (circles) => {
    const index = circles.findIndex((circle) => circle.id === id);
    if (index === -1) return "not_found";
    const circle = circles[index];
    const seats = circle.seats.filter((seat) => seat.personId !== personId);
    const applications = (circle.applications ?? []).filter(
      (application) => application.personId !== personId
    );
    const left = seats.length < circle.seats.length;
    const withdrew = applications.length < (circle.applications ?? []).length;
    if (!left && !withdrew) return "not_member";
    if (left && id === BOARD_ID && !seats.some((seat) => seat.personId)) return "last_board_member";
    const next = [...circles];
    next[index] = { ...circle, seats, applications };
    return { circles: next, value: { left, withdrew } };
  });
}

/** Approve (they join as a member) or decline an application. */
export function decideApplication(
  imported: Circle[],
  id: string,
  applicationId: string,
  approve: boolean
) {
  return mutate<{ circle: Circle; application: CircleApplication }>(imported, (circles) => {
    const index = circles.findIndex((circle) => circle.id === id);
    if (index === -1) return "not_found";
    const circle = circles[index];
    const application = (circle.applications ?? []).find((entry) => entry.id === applicationId);
    if (!application) return "not_found";
    const applications = (circle.applications ?? []).filter((entry) => entry.id !== applicationId);
    const alreadyMember = circle.seats.some((seat) => seat.personId === application.personId);
    const seats =
      approve && !alreadyMember ? [...circle.seats, memberSeat(application)] : circle.seats;
    const next = [...circles];
    next[index] = { ...circle, seats, applications };
    return { circles: next, value: { circle: next[index], application } };
  });
}
