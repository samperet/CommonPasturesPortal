import { DocsShell } from "@/components/documents/docs-shell";

/** Documents and pages share a shell: the sidebar (all documents, starred, drafts, every circle) beside the content. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
