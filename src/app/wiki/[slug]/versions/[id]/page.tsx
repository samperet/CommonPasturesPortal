import { redirect } from "next/navigation";

/**
 * Pages' alternative versions are gone: an old link to one opens the page
 * itself.
 */
export default function VersionPage({ params }: { params: { slug: string } }) {
  redirect(`/wiki/${encodeURIComponent(params.slug)}`);
}
