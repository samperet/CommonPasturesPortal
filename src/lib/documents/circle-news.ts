import type { Actor } from "@/lib/auth/actor";
import { listUsers } from "@/lib/auth/users";
import { isCommunity } from "@/lib/circles/ids";
import type { DirectoryDocument } from "@/lib/directory/types";
import { excerpt, notify } from "@/lib/push/notify";
import type { WikiPage } from "@/lib/wiki/store";

/**
 * Telling a circle's members about its own documents — the `circleDocuments`
 * topic, on by default by app and by email: a new page once it's published
 * (`announcePage`), a new file or link or a new version of one
 * (`announceDocument` in `announce.ts`), and a comment on one of its pages
 * (`tellCircleOfComment`). Only the circle that keeps it: never Community's
 * (everyone, with no members), and nothing passes down from a parent
 * circle. Whoever did it never hears of it, nor a draft's circle (only its
 * author and admins can see a draft).
 */

/** The residents in a circle's seats; none for Community. */
export function circleMemberIds(directory: DirectoryDocument, circleId: string): string[] {
  if (isCommunity(circleId)) return [];
  const circle = directory.circles.find((entry) => entry.id === circleId);
  return Array.from(
    new Set(circle?.seats.map((seat) => seat.personId).filter((id): id is string => !!id) ?? [])
  );
}

interface News {
  circleId: string;
  directory: DirectoryDocument;
  title: string;
  body: string;
  url: string;
  tag: string;
  /** Whoever did it. */
  by: Pick<Actor, "userId">;
  /** Members already told about it another way. */
  told?: Iterable<string>;
}

/** Tell the circle's members (but `told`, and whoever did it). */
export async function tellCircle(news: News) {
  const told = new Set(news.told ?? []);
  const members = circleMemberIds(news.directory, news.circleId).filter((id) => !told.has(id));
  if (!members.length) return;
  await notify({
    topic: "circleDocuments",
    title: news.title,
    body: news.body,
    url: news.url,
    tag: news.tag,
    exceptUserId: news.by.userId,
    onlyPersonIds: members,
  });
}

/** A page just published (started, or a draft published): its circle's members hear. */
export async function announcePage(
  page: Pick<WikiPage, "id" | "slug" | "title" | "keeper" | "draft" | "createdBy">,
  by: Pick<Actor, "userId" | "name">,
  directory: DirectoryDocument
) {
  if (page.draft) return;
  const circle = directory.circles.find((entry) => entry.id === page.keeper);
  if (!circle) return;
  await tellCircle({
    circleId: circle.id,
    directory,
    title: `New page in ${circle.name}: ${page.title}`,
    body: `${page.createdBy.name} started it`,
    url: `/wiki/${page.slug}`,
    tag: `page-${page.id}`,
    by,
  });
}

/**
 * A comment on one of a circle's pages: its members hear, but those told
 * already (the page's writers and the thread, by the `wiki` topic — given
 * as accounts).
 */
export async function tellCircleOfComment(
  page: Pick<WikiPage, "id" | "slug" | "title" | "keeper" | "draft">,
  by: Pick<Actor, "userId" | "name">,
  text: string,
  directory: DirectoryDocument,
  toldAccounts: string[]
) {
  if (page.draft) return;
  const accounts = new Set(toldAccounts);
  const told = (await listUsers())
    .filter((user) => accounts.has(user.id) && user.personId)
    .map((user) => user.personId as string);
  await tellCircle({
    circleId: page.keeper,
    directory,
    title: `${by.name} commented on “${page.title}”`,
    body: excerpt(text),
    url: `/wiki/${page.slug}#comments`,
    tag: `wiki-comments-${page.id}`,
    by,
    told,
  });
}
