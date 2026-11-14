import type { CircleModule, InfoView, SectionLayout } from "./layout";

/**
 * A circle as stored in the directory document (`directory.circles`): its
 * seats, how residents join it, and how its page is laid out. Circles are
 * read with the rest of the directory (`DirectoryDocument` in
 * `lib/directory/types.ts`) and changed through `lib/circles/store.ts`.
 */

export interface CircleSeat {
  /** Present once circles are managed in the app; the import has no seat ids. */
  id?: string;
  position: string | null;
  termEnds: string | null;
  personId: string | null;
  name: string | null;
}

/** A resident asking to join a circle that approves its members. */
export interface CircleApplication {
  id: string;
  personId: string;
  name: string;
  message: string | null;
  createdAt: string;
}

/** An official sociocratic circle, or a social club (e.g. the Chicken Tenders). */
export type CircleKind = "circle" | "club";

/** Who can join a circle: anyone, with a Join button, or by applying for its members to approve. */
export type JoinPolicy = "open" | "apply";

export interface Circle {
  id: string;
  /** The spreadsheet's short code, kept from the import; no longer shown or asked for. */
  code?: string;
  name: string;
  description?: string | null;
  seats: CircleSeat[];
  /** Uploaded by the circle; not part of the import. */
  iconUrl?: string | null;
  /** The icon's signed address, for a shared document's card in an email (`lib/circles/icon-link.ts`). */
  shareIconUrl?: string | null;
  /** Unset means "apply": members approve who joins (as before joining existed). */
  joinPolicy?: JoinPolicy;
  /** "club" for a social club; unset for an official, sociocratically formed circle. */
  kind?: CircleKind;
  /** For a sub group: the circle it's within (see `tiers.ts`). Set when it's started, never moved. */
  parentId?: string;
  /** Which of its pages' sections the circle uses; each is on unless set to false. */
  features?: { documents?: boolean; wiki?: boolean; tasks?: boolean };
  /** How its page is laid out (see `src/lib/circles/layout.ts`); unset is the default. */
  layout?: SectionLayout[];
  /** How its Filtered Documents module shows pages; unset is "summary". */
  infoView?: InfoView;
  /** Its page, as modules (see `modulesFor`); unset means as `layout`, `features`, and `infoView` describe. */
  modules?: CircleModule[];
  /** Wiki pages (their addresses) once pinned to the circle's page, from before pinning was removed; no longer used. */
  pinnedWiki?: string[];
  /** Pending applications; only the circle's members, the Board, and admins see them. */
  applications?: CircleApplication[];
}
