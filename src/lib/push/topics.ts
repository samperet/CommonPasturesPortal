/**
 * What residents can be told about — by push notification and by email —
 * with the words their settings show, and what each is by app until they
 * choose (`DEFAULT_PREFERENCES`). Safe for the browser. A new topic also
 * needs its email default (`DEFAULT_EMAIL_PREFERENCES`, `lib/email/shared.ts`)
 * and its audience in words (`TOPIC_AUDIENCES`, `lib/notifications/shared.ts`).
 */

export const TOPICS = {
  discussions: "New forum discussions",
  replies: "Replies in discussions you started or joined",
  appreciations: "New appreciations",
  photos: "New photos",
  resources: "New recommendations, and comments on yours",
  library: "New things to borrow in the loan library",
  documents: "New and updated documents in circles",
  circles: "Requests to join your circles, and answers to yours",
  polls: "New polls",
  proposals: "Proposals to your circles, and when they're consented",
  wiki: "Comments on wiki pages you've written or commented on",
  mentions: "When someone mentions you in a page",
  following: "Changes to pages you follow",
  tasks: "Tasks given to you, and comments on tasks you're part of",
  groups: "New messages in your circles' forums",
  messages: "Messages sent to you",
  alerts: "Safety alerts, to a circle you're in or to everyone",
} as const;

export type Topic = keyof typeof TOPICS;
export type Preferences = Record<Topic, boolean>;

/** What residents are told about by app until they choose: everything. */
export const DEFAULT_PREFERENCES: Preferences = {
  discussions: true,
  replies: true,
  appreciations: true,
  photos: true,
  resources: true,
  library: true,
  documents: true,
  circles: true,
  polls: true,
  proposals: true,
  wiki: true,
  mentions: true,
  following: true,
  tasks: true,
  groups: true,
  messages: true,
  alerts: true,
};
