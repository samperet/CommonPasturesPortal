import { OutlineImportClient } from "@/components/admin/outline-import-client";

export const metadata = { title: "Import from Outline · Common Pastures" };

/** Admins only: the API refuses everyone else. */
export default function OutlineImportPage() {
  return <OutlineImportClient />;
}
