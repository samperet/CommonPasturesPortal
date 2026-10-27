"use client";

import { createContext, useContext } from "react";

/**
 * What the documents shell (`docs-shell.tsx`) offers the pages inside it:
 * starting a page — inside another, or at a circle's top level — through
 * the one "Write a page" dialog. Null outside the shell.
 */

/** The page a new page goes inside. */
export type PageParent = { id: string; title: string; keeper: string };

export const DocsShellContext = createContext<{
  newPage: (parent?: PageParent) => void;
  /** Whether you can start pages at all (you keep at least one circle). */
  canWrite: boolean;
} | null>(null);

export const useDocsShell = () => useContext(DocsShellContext);
