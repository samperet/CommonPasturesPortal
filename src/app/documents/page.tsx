import { DocumentsPage } from "@/components/documents/documents-page";

export const metadata = { title: "Documents · Common Pastures" };

/**
 * No Suspense boundary of its own (every route is rendered on request, so the
 * address is there to read): the page hydrates with the shell, before the
 * lists it shows have arrived — hydrated later, it would find them and not
 * match the server's HTML.
 */
export default function Page() {
  return <DocumentsPage />;
}
