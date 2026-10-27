import { DocsShell } from "@/components/documents/docs-shell";

/** Documents and pages share a shell: the sidebar with every circle's page tree beside the content. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
