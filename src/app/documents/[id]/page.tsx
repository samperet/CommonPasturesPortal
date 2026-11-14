import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * A file's own address, as its Share button copies it: it opens the file
 * (its latest version; a link document goes where it points). Someone not
 * signed in is sent to sign in first and comes back here (the middleware).
 */
export default function DocumentLink({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id))
    notFound();
  redirect(`/api/documents/${params.id.toLowerCase()}/file`);
}
