import { parentOf } from "@/lib/circles/tiers";
import type { DirectoryDocument } from "@/lib/directory/types";
import { featureEnabled } from "@/lib/circles/features";
import { listDocuments, searchDocuments } from "@/lib/documents/store";
import { readTypeMap, typeLabelFor } from "@/lib/documents/type-store";
import { consentState, shownWithPage, type DocumentRecord } from "@/lib/documents/types";
import { searchForum } from "@/lib/forum/search";
import { listLoanItems } from "@/lib/library/store";
import { listRecommendations } from "@/lib/resources/store";
import { categorySlug } from "@/lib/resources/slug";
import { listSkills } from "@/lib/skills/store";
import { listTasks } from "@/lib/tasks/store";
import { roleLabel, taskHolders } from "@/lib/tasks/roles";
import { readPages } from "@/lib/wiki/store";
import { visiblePages, type WikiViewer } from "@/lib/wiki/access";
import { occurrences, searchTerms, snippetFor } from "@/lib/search";
import { excerptOf } from "@/lib/wiki/excerpt";
import { unmark, unperson } from "@/lib/wiki/links";
import { listProposals } from "@/lib/proposals/store";
import { listCars } from "@/lib/cars/store";
import { describeCar } from "@/lib/cars/shared";
import { STATUS_LABELS } from "@/lib/proposals/shared";

/**
 * Search across the whole site — people (with their bios and skills),
 * circles, documents, proposals, the forum, wiki pages, tasks, resources,
 * the loan library, and the app's own places (its pages: the backups page,
 * the calendar, settings…; admins' pages for admins) — for residents. Every
 * term of the query must match somewhere in a result; a match in a title
 * counts most.
 */

export type SearchKind =
  | "places"
  | "people"
  | "circles"
  | "wiki"
  | "forum"
  | "documents"
  | "proposals"
  | "tasks"
  | "resources"
  | "library"
  | "cars";

export interface SearchResult {
  title: string;
  href: string;
  /** Where it is, or what it is: "Land Care Circle wiki", "Unit 12". */
  meta: string | null;
  snippet: string | null;
  /** Opens in a new tab (a document's file). */
  external?: boolean;
  score: number;
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  total: number;
  results: SearchResult[];
}

const LABELS: Record<SearchKind, string> = {
  places: "Places",
  people: "People",
  circles: "Circles",
  wiki: "Pages",
  forum: "Forum",
  documents: "Documents",
  proposals: "Proposals",
  tasks: "Tasks",
  resources: "Resources",
  library: "Loan library",
  cars: "Cars",
};

/** The app's own pages, found by their names and what they're for (`admin`: for admins only). */
export const PLACES: { href: string; title: string; about: string; admin?: boolean }[] = [
  { href: "/", title: "Dashboard", about: "home start today's events" },
  {
    href: "/directory",
    title: "Directory",
    about: "residents neighbors units phone email carsheds",
  },
  { href: "/circles", title: "Circles", about: "working groups committees sub groups board" },
  {
    href: "/documents",
    title: "Documents",
    about: "pages files minutes agendas proposals wiki map",
  },
  { href: "/library", title: "Loan Library", about: "borrow lend tools items" },
  { href: "/forum", title: "Forum", about: "discussions posts topics" },
  { href: "/calendar", title: "Calendar", about: "events meetings dates google calendar" },
  { href: "/photos", title: "Photos", about: "pictures gallery" },
  {
    href: "/resources",
    title: "Resources",
    about: "recommendations local services plumber electrician",
  },
  { href: "/skills", title: "Skills", about: "what neighbors can help with" },
  { href: "/messages", title: "Messages", about: "chat private direct messages who's online" },
  { href: "/appreciations", title: "Appreciations", about: "thank you notes gratitude" },
  { href: "/homes-for-sale", title: "Homes for sale", about: "listings real estate selling" },
  { href: "/proposals", title: "Proposals", about: "consent decisions meetings" },
  { href: "/profile", title: "Your profile", about: "edit my details photo bio about me" },
  {
    href: "/profile#app",
    title: "App & notifications",
    about: "install home screen push notifications email settings preferences",
  },
  {
    href: "/mcp",
    title: "AI assistants",
    about: "claude chatgpt mcp connector key assistant ask questions about documents",
  },
  {
    href: "/backups",
    title: "Backups",
    about: "export download data restore copy archive sign up feed storage fingerprint",
  },
  { href: "/welcome", title: "Welcome tour", about: "help getting started guide how to" },
  { href: "/secretary", title: "Secretary", about: "new members invitations welcome", admin: true },
  { href: "/admin/settings", title: "Admin settings", about: "admins manage", admin: true },
  { href: "/admin/sign-ins", title: "Sign-in log", about: "last seen who signed in", admin: true },
  {
    href: "/admin/feedback",
    title: "Bugs & requests",
    about: "feedback ladybug reports",
    admin: true,
  },
  {
    href: "/admin/email",
    title: "Email settings",
    about: "test mode allowed addresses log",
    admin: true,
  },
];

/**
 * Score a result from its fields, weighted, if every term appears in one of
 * them; null if some term appears nowhere.
 */
function score(terms: string[], fields: [text: string, weight: number][]): number | null {
  const lower = fields.map(([text, weight]) => [text.toLowerCase(), weight] as const);
  let total = 0;
  for (const term of terms) {
    let found = 0;
    for (const [text, weight] of lower) found += Math.min(occurrences(text, term), 10) * weight;
    if (!found) return null;
    total += found;
  }
  return total;
}

function collect<T>(
  items: T[],
  terms: string[],
  toResult: (item: T) => {
    fields: [string, number][];
    result: Omit<SearchResult, "score" | "snippet">;
    body?: string;
  } | null
) {
  const results: SearchResult[] = [];
  for (const item of items) {
    const entry = toResult(item);
    if (!entry) continue;
    const points = score(terms, entry.fields);
    if (points === null) continue;
    results.push({
      ...entry.result,
      snippet: entry.body ? snippetFor(entry.body, terms) : null,
      score: points,
    });
  }
  return results;
}

/** Search everything; each group lists its best `perGroup` results, and how many matched in all. */
export async function searchSite(
  query: string,
  directory: DirectoryDocument,
  perGroup = 5,
  { admin = false, viewer = null }: { admin?: boolean; viewer?: WikiViewer | null } = {}
): Promise<SearchGroup[]> {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const placeResults = collect(
    PLACES.filter((place) => admin || !place.admin),
    terms,
    (place) => ({
      fields: [
        [place.title, 20],
        [place.about, 4],
      ],
      result: { title: place.title, href: place.href, meta: "In the app" },
    })
  );
  const circles = directory.circles;
  const circleName = (id: string) => circles.find((circle) => circle.id === id)?.name ?? "";

  const [skills, documents, types, forum, recommendations, loans, wikis, proposals, tasks, cars] =
    await Promise.all([
      listSkills(),
      listDocuments(),
      readTypeMap(),
      searchForum(query),
      listRecommendations(),
      listLoanItems(),
      readPages().then((pages) => visiblePages(pages, viewer)),
      listProposals(),
      Promise.all(
        circles
          .filter((circle) => featureEnabled(circle, "tasks"))
          .map(async (circle) => ({ circle, tasks: await listTasks(circle.id) }))
      ),
      listCars(),
    ]);

  const skillsOf = new Map<string, string[]>();
  for (const skill of skills)
    skillsOf.set(skill.personId, [...(skillsOf.get(skill.personId) ?? []), skill.name]);

  const people = collect(directory.people, terms, (person) => {
    const personSkills = skillsOf.get(person.id) ?? [];
    return {
      fields: [
        [person.displayName, 20],
        [personSkills.join(" · "), 8],
        [person.bio ?? "", 3],
      ],
      result: {
        title: person.displayName,
        href: `/directory/${person.id}`,
        meta: [
          `Unit ${person.unit}`,
          personSkills.length ? `Skills: ${personSkills.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
      body: person.bio ?? undefined,
    };
  });

  const carResults = collect(cars, terms, (car) => {
    const owner =
      (car.personId
        ? directory.people.find((person) => person.id === car.personId)?.displayName
        : car.ownerName) ?? "";
    return {
      fields: [
        [car.plate, 20],
        [car.plate.replace(/[\s-]/g, ""), 20],
        [describeCar(car), 8],
        [owner, 5],
        [`unit ${car.unit}`, 3],
      ],
      result: {
        title: `${car.plate}${describeCar(car) ? ` — ${describeCar(car)}` : ""}`,
        href: `/directory?tab=cars&q=${encodeURIComponent(car.plate)}`,
        meta: [`Unit ${car.unit}`, owner].filter(Boolean).join(" · "),
      },
      body: car.notes ?? undefined,
    };
  });

  const circleResults = collect(circles, terms, (circle) => ({
    fields: [
      [circle.name, 20],
      [circle.description ?? "", 3],
    ],
    result: {
      title: circle.name,
      href: `/circles/${circle.id}`,
      meta: parentOf(circles, circle)
        ? `Sub group of ${parentOf(circles, circle)!.name}`
        : circle.kind === "club"
          ? "Social club"
          : "Circle",
    },
    body: circle.description ?? undefined,
  }));

  const wikiResults = collect(wikis, terms, (page) => ({
    fields: [
      [page.title, 20],
      // Highlights match by their words, not their colour.
      [unperson(unmark(page.body)), 1],
      [page.transcript ?? "", 1],
    ],
    result: {
      title: page.title,
      href: `/wiki/${page.slug}`,
      meta: `Page · ${circleName(page.keeper)}`,
    },
    // The page as plain text: links by their words; no photos, polls, or markup.
    body: excerptOf(page.body, 50_000),
  }));

  const proposalResults = collect(proposals, terms, (proposal) => ({
    fields: [
      [proposal.title, 20],
      [proposal.body, 1],
    ],
    result: {
      title: proposal.title,
      href: `/proposals/${proposal.id}`,
      meta: `Proposal · ${circleName(proposal.circleId)} · ${STATUS_LABELS[proposal.status]}`,
    },
    body: proposal.body || undefined,
  }));

  // Who has each task: its owner, or its role and whoever holds it (`lib/tasks/roles.ts`).
  const nameOf = (personId: string) =>
    directory.people.find((person) => person.id === personId)?.displayName ?? null;
  const ownerOf = (task: (typeof tasks)[number]["tasks"][number]) => {
    const holders = taskHolders(task, circles, nameOf)
      .map((holder) => holder.name)
      .join(", ");
    return task.ownerRole
      ? `${roleLabel(task.ownerRole, circles)}${holders ? ` (${holders})` : ""}`
      : holders;
  };
  const taskResults = tasks.flatMap(({ circle, tasks: list }) =>
    collect(list, terms, (task) => ({
      fields: [
        [task.title, 20],
        [task.description, 2],
        [ownerOf(task), 5],
      ],
      result: {
        title: task.title,
        href: `/circles/${circle.id}/tasks/${task.number}`,
        meta: [
          `${circle.name} task #${task.number}`,
          task.status === "done" ? "done" : ownerOf(task),
        ]
          .filter(Boolean)
          .join(" · "),
      },
      body: task.description || undefined,
    }))
  );

  const resourceResults = collect(recommendations, terms, (entry) => ({
    fields: [
      [entry.title, 20],
      [entry.category, 8],
      [entry.body, 2],
      [entry.comments.map((comment) => comment.body).join("\n"), 1],
    ],
    result: {
      title: entry.title,
      href: `/resources/${categorySlug(entry.category)}`,
      meta: `${entry.category} · recommended by ${entry.submittedBy.name}`,
    },
    body: entry.body,
  }));

  const libraryResults = collect(loans, terms, (item) => ({
    fields: [
      [item.title, 20],
      [item.category, 8],
      [item.description, 2],
      [item.ownerName, 3],
    ],
    result: {
      title: item.title,
      href: `/library?item=${item.id}`,
      meta: `${item.category} · lent by ${item.ownerName}${item.available ? "" : " · on loan"}`,
    },
    body: item.description || undefined,
  }));

  const consented = (doc: DocumentRecord) => consentState(doc) === "consented";
  // Files made into pages are found through their pages.
  const livePageIds = new Set(wikis.map((page) => page.id));
  const documentHits = await searchDocuments(
    documents.filter((doc) => !shownWithPage(doc, livePageIds)),
    query,
    (doc) =>
      `${circleName(doc.circleId)} ${typeLabelFor(doc, types)}${consented(doc) ? " consented" : ""}`
  );
  const documentResults: SearchResult[] = documentHits.map((hit) => ({
    title: hit.doc.title,
    href: `/api/documents/${hit.doc.id}/file`,
    external: true,
    meta: [
      circleName(hit.doc.circleId),
      typeLabelFor(hit.doc, types),
      consented(hit.doc) ? "Consented" : null,
      hit.doc.meetingDate,
    ]
      .filter(Boolean)
      .join(" · "),
    snippet: hit.snippet ?? hit.doc.description ?? null,
    score: hit.score,
  }));

  const forumResults: SearchResult[] = forum.map((hit) => ({
    title: hit.title,
    href: `/forum/${hit.id}${hit.replyId ? `#reply-${hit.replyId}` : ""}`,
    meta: hit.snippetBy ? `${hit.snippetBy} wrote` : `Started by ${hit.authorName}`,
    snippet: hit.snippet,
    score: hit.score,
  }));

  const groups: [SearchKind, SearchResult[]][] = [
    ["places", placeResults],
    ["people", people],
    ["circles", circleResults],
    ["wiki", wikiResults],
    ["forum", forumResults],
    ["documents", documentResults],
    ["proposals", proposalResults],
    ["tasks", taskResults],
    ["resources", resourceResults],
    ["library", libraryResults],
    ["cars", carResults],
  ];
  return groups
    .filter(([, results]) => results.length)
    .map(([kind, results]) => ({
      kind,
      label: LABELS[kind],
      total: results.length,
      results: [...results].sort((a, b) => b.score - a.score).slice(0, perGroup),
    }));
}
