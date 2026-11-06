import type { CommunityUser } from "@/lib/auth/users";
import type { DirectoryDocument } from "@/lib/directory/types";
import { notify } from "@/lib/push/notify";
import { circleMemberIds, tellCircle } from "./circle-news";
import { readTypeMap, typeLabelFor } from "./type-store";
import type { DocumentRecord } from "./types";

/**
 * Tell residents about a new document, or a new version of one: the members
 * of its circle by their own topic (`circleDocuments`, on by default), and
 * everyone else by the "documents" topic.
 */
export async function announceDocument(
  doc: DocumentRecord,
  user: Pick<CommunityUser, "id" | "name">,
  directory: DirectoryDocument,
  replaced: boolean
) {
  const circleName =
    directory.circles.find((entry) => entry.id === doc.circleId)?.name ?? "the Board";
  const typeName = typeLabelFor(doc, await readTypeMap());
  const kind = doc.type === "other" ? "document" : typeName.toLowerCase();
  const message = {
    title: replaced
      ? `Updated in ${circleName}: ${doc.title}`
      : `New ${kind} in ${circleName}: ${doc.title}`,
    body: `${user.name} ${replaced ? "added a new version" : "added it"}${
      doc.meetingDate ? ` · meeting ${doc.meetingDate}` : ""
    }`,
    url: `/circles/${doc.circleId}#documents`,
    tag: `document-${doc.id}`,
  };
  const members = circleMemberIds(directory, doc.circleId);
  await tellCircle({ ...message, circleId: doc.circleId, directory, by: { userId: user.id } });
  await notify({
    topic: "documents",
    ...message,
    exceptUserId: user.id,
    ...(members.length ? { exceptPersonIds: members } : {}),
  });
}
