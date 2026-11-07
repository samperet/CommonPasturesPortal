"use client";

import { createContext, useContext } from "react";

/**
 * What the documents shell (`docs-shell.tsx`) offers the pages inside it:
 * starting a page — inside another, or at a circle's top level — through
 * the one "Write a page" dialog; and the sidebars, which fold away and come
 * back together — the shell's on the left, a page's own column on the
 * right — with one button the page shows once it `claim`s them. Null
 * outside the shell.
 */

/** The page a new page goes inside. */
export type PageParent = { id: string; title: string; keeper: string };

/** Folding away ("out") or coming back ("in"), while it moves; null when still. */
export type SidebarMotion = "in" | "out" | null;

export interface Sidebars {
  open: boolean;
  moving: SidebarMotion;
  /** Fold both away (false), bring them back (true), or switch. */
  toggle: (next?: boolean) => void;
  /** A page shows the one button for both: the shell's own goes; call what it returns to give it back. */
  claim: () => () => void;
}

export const DocsShellContext = createContext<{
  newPage: (parent?: PageParent) => void;
  /** Whether you can start pages at all (you keep at least one circle). */
  canWrite: boolean;
  sidebars: Sidebars;
} | null>(null);

export const useDocsShell = () => useContext(DocsShellContext);
