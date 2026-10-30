# Architecture

How Common Pastures (the CVC community app) is put together, for someone reading the code for the first time. The README
describes each feature as a user sees it; this describes the shape underneath.

## In one paragraph

A Next.js 14 app (app router) deployed on Vercel. Every page is a thin server shell around a client
component that fetches from the app's own API with React Query. The API routes under `src/app/api`
check who's asking, validate the body with zod, and call a **store** that reads and writes **JSON
documents in Cloudflare R2** (or `./.data/` locally). There is no database, no ORM, and no cron:
anything time-based (a poll closing) is worked out when the data is
read. Residents sign in with a link or code emailed to their directory address and get a signed
cookie; the middleware
keeps everything else private — except a new member's welcome page (`/join/<token>`), whose
signed token is its key (`lib/onboarding/token.ts`).

## Request flow

```
browser component ──apiFetch──▶ /api/... route ──▶ lib/<feature>/http.ts (context, permissions)
   ▲  React Query                    │ readBody(zod)      │
   └── invalidate(["key"]) ◀── JSON ◀┴── lib/<feature>/store.ts ──mutateJson──▶ R2 (or .data/)
```

- `src/lib/api-client.ts` `apiFetch` throws the route's `detail` as an `Error`, so a mutation's
  `onError` can show it in a toast as it is; `statusOf(error)` gives its HTTP status (a query
  that's answered 403 or 404 needn't be retried).
- `src/lib/http.ts`: `problem(detail, status)` (RFC 9457 body), `readBody(request, schema)`,
  `throttled(request, key)`, and the wording helpers `notFound(what)`, `forbidden(detail)`,
  `full(detail)`.
- Each feature's `http.ts` has a context loader (`circleContext`, `tasksContext`,
  `wikiSession`/`pageContext`, …) returning either `{ error: NextResponse }` or what the route needs
  (user, `actor`, directory, the thing, and what the user may do), plus a `<feature>Problem(reason)`
  that maps the store's exported `Failure` union to responses. Routes without a context helper
  build the actor with `actorOf(user)`.
- Image uploads (profile and home photos, circle icons, wiki and gallery photos) are the raw
  request body, read with `readImageUpload(request, { maxBytes, label })` in `lib/images.ts`.

## Storage

`src/lib/storage.ts` is the only module that talks to R2. It falls back to `./.data/` (or
`/tmp/.data` on Vercel) when the `R2_*` variables are missing, so the app runs locally with no setup.

- `readJson(key)` / `writeJson(key, value)` / `deleteJson(key)`; `readBinary`/`writeBinary` for
  files and images; `presignedDownloadUrl` for document downloads; `copyBinary` (within R2) for
  proposals' snapshots of files; `readBinaryStream`/`writeBinaryStream` for big files never held
  whole — the latter a multipart upload in equal 8 MiB parts, as R2 requires (document exports).
- **`mutateJson(key, change)`** reads with an ETag and writes only if unchanged, retrying a few
  times — safe across several server instances. **Every store writes through it.** `change` is
  synchronous and may run more than once, so it does no I/O; a no-write result is `{ write: false }`.
  `readOrSeedJson(key, parse, seed)` writes a first version only if none exists (the circles seed).
  **`enqueue(key, fn)`** only queues within one instance and remains around deletes and the VAPID
  keys. A binary beside an index (a photo, a wiki image, a document's file) is written first and
  taken back if the index refuses it.
- A store keeps one key pattern, a `normalize(raw)` that tolerates old shapes, an exported
  `Failure` union, and a `mutate()` wrapper that returns `{ ok: true, … } | { ok: false, reason }`.

Main documents (see each store's `KEY`):

| Key | What | Store |
|---|---|---|
| `directory/directory.json`, `directory/people.json` | The imported residents, and edits made in the app | `lib/directory` |
| `circles/circles.json`, `circles/icons.json`, `circles/schedules/<id>.json` | Circles, seats, page modules; icons; duty rotations | `lib/circles`, `lib/schedules` |
| `circles/eggs/<circleId>.json` + `circles/eggs/<circleId>/photos/<id>.jpg` | A duty schedule's daily counts (the eggs: per day, who and how), and the photos of the printed calendar sent to be read | `lib/schedules` (`egg-store.ts`) |
| `wiki/pages.json`, `wiki/history/<pageId>.json`, `wiki/trash.json`, `wiki/comments/<pageId>.json`, `wiki/perspectives/<pageId>.json`, `wiki/polls.json`, `wiki/presence.json`, `wiki-images/<circleId>.json` | The one wiki (`presence.json` also says who has a spreadsheet open to edit, as `file:<id>`) | `lib/wiki`, `lib/polls` |
| `wiki/follows.json`, `wiki/mentions.json` | Who follows each page (and when its followers were last told, for the hourly limit); whom each page's mentions have told | `lib/wiki/follows.ts`, `mentions.ts` |
| `documents/index.json`, `documents/text.json`, `documents/types.json` + binaries | Documents, their extracted text, per-circle types | `lib/documents` |
| `proposals/proposals.json` | Proposals: what's put to which circle, about which documents (with their snapshots' details), and its consent at a meeting | `lib/proposals` |
| `proposals/snapshots/<snapshotId>.json`, `proposals/snapshots/<snapshotId>` | Snapshots' copies: a page's title and text, or a link's text; a file itself. Written once, never changed | `lib/proposals` (`snapshots.ts`) |
| `exports/index.json`, `exports/<id>.zip` | Documents exported as a zip (written in parts by `writeBinaryStream`), kept a day for whoever made them; older ones deleted when the next is made | `lib/documents` (`export.ts`) |
| `tasks/<circleId>.json`, `task-comments/<circleId>.json` | Tasks | `lib/tasks` |
| `logs/<circleId>.json` | Circle logs: short updates and replies, never notified | `lib/log` |
| `alerts/<circleId>.json` | A circle's alerts (its Alert module's): the last 50, each with who sent it, to whom, and how many people that was | `lib/alerts` |
| `circles/finances/<circleId>.json`, `circles/finances/<circleId>/receipts/<expenseId>` | A circle's Finances: expenses (whole cents) and a budget per year; each expense's receipt (photo or PDF) | `lib/finances` |
| `feedback/reports.json` | Bug reports and feature requests from the ladybug | `lib/feedback` |
| `onboarding/invitations.json`, `onboarding/resources.json` | The Secretary's new member invitations (and their answers), and what welcome pages list | `lib/onboarding` |
| `forum/index.json`, `forum/threads/<id>.json`, `forum/topics.json` | Forum | `lib/forum` |
| `photos/index.json`, `homes/listings.json`, `resources/recommendations.json`, `library/items.json`, `skills/index.json`, `appreciations/index.json`, `profiles/index.json` | The rest | one store each |
| `push/subscriptions.json`, `push/preferences.json`, `auth/*` | Devices, notification choices, accounts, sign-in links (hashed), sign-in log, when each resident was last seen (`auth/last-seen.json`, written at most every ten minutes from presence check-ins) | `lib/push`, `lib/auth` |
| `email/settings.json`, `email/preferences.json`, `email/log.json`, `email/quota.json` | Test mode and allowed addresses, each person's email choices, recent sends, the free-plan counts (per sender: Brevo, Resend) | `lib/email` |
| `groups/<circleId>/index.json`, `groups/<circleId>/threads/<id>.json`, `groups/<circleId>/polls/<id>.json` | Circle forums: conversations, their messages, polls | `lib/groups` |
| `presence/online.json` | Who's online: each person's last check-in (gone three minutes after it) | `lib/presence` |
| `chat/conversations/<a>-<b>.json`, `chat/people/<personId>.json` | Private messages between two people (their last 500); each person's list of conversations and what they've read | `lib/chat` |
| `backups/index.json`, `backups/<id>.zip`, `backups/<id>.ots`, `backups/subscribers.json`, `backups/restores.json` | The newest eight community backups and three complete ones (each zip and its OpenTimestamps proof); who signed up for them: email, a feed (its token's hash), their own storage (its key sealed); the restore tests run (never a key). Never in a backup itself | `lib/backups` |
| `mcp/keys.json` | Residents' keys for AI assistants (hashed), with whose each is, whether it can write (`scope`), and when it was last used | `lib/mcp` |
| `me/documents/<userId>.json` | Each account's starred documents (up to 50) and the last 20 opened: pages, files and proposals by id, resolved when read | `lib/me` |

## Who's who

- **Resident**: anyone signed in; has a `personId` from the directory. `getSessionUser()`.
- **Circle member**: holds a seat on the circle (`circle.seats[].personId`); a seat's `position`
  ("Secretary", "Op leader", …) is free text, matched with `holdsSeat(…, SECRETARY_ROLE)`. The
  pattern must be anchored to match the whole role: `SECRETARY_ROLE` (`lib/circles/secretary.ts`)
  is "Secretary" in any case, spaces around it ignored — not "Assistant secretary".
- **The Board Secretary**: whoever holds the Board seat whose role is `SECRETARY_ROLE`; manages the
  directory (`canManageDirectory`) and new member intake. Only admins and the Secretary give a
  Board seat that role or take it away (`maySetSecretary`, checked inside the circle store's
  `addMember` and `updateMember`; anyone else gets a 403), so a Board member can't make
  themselves Secretary.
- **Sub group**: a circle with a `parentId` (`lib/circles/tiers.ts`), one level deep; its
  parent's members manage it as the Board does (`managesCircle`, which `canManageCircle` uses).
- **The Board** (`BOARD_ID`): its members can manage every circle (`canManageCircle`,
  `sitsOnBoard`). **Community** (`COMMUNITY_ID`) is everyone — no seats, can't be joined or deleted.
- **Admin**: built in, listed in `ADMIN_PERSON_IDS`, or added on Admin settings (`auth/admins.json`,
  read into memory as the session is: `loadAdmins`) — `isAdmin`; passes every check and can "view
  as" someone.
- `canUploadTo(user, directory, circleId)` is the common "may change this circle's things" test:
  its members, the Board, admins — and any resident for Community.

Access logic lives in `lib/<feature>/access.ts` (pure, testable) and is applied in `http.ts`. The
API's responses carry `canEdit`/`canAdd`/`canReview`-style flags so the UI matches the server.

Who is acting reaches a store as an **`Actor`** (`lib/auth/actor.ts`: `userId`, `personId`,
`name`, `admin`), built once by `actorOf(user)` or a context helper; a store takes the fields it
needs (`Pick<Actor, "userId" | "admin">`), so ownership checks read the same everywhere, and what it
writes down about who did something (`createdBy`, `uploadedBy`, `proposer`) is picked out field by
field — `admin` is never stored. The circle types (`Circle`, `CircleSeat`, …) are in
`lib/circles/types.ts`; the rest of the directory's in `lib/directory/types.ts`.

## Comments

Tasks, wiki pages, forum discussions (their replies) and recommendations all use one
comment system. `lib/comments/shared.ts` has the record (`CommentRecord`: `parentId`,
`authorId`/`authorPersonId`/`authorName`, `body`, `editedAt`, `deletedAt`) and the grouping
helpers; `lib/comments/store.ts` has the rules as pure list operations — `addComment` (nesting
"none", "one" or "any", a limit, and `among` when one document holds several things' comments),
`editComment` and `deleteComment` (the author or a moderator; a comment with replies becomes a
placeholder, pruned once nothing hangs off it). Each feature's store applies them to its own
document and adds its own fields (a wiki comment's quote, a reply's
likes); `normalizeComment` fills in what older records lack as they are read.
`components/comments` shows them: `CommentTree` (replies, folding, edit and delete with the Confirm
dialog, `#comment-<id>` links), `CommentForm`, `CommentByline`; features pass what differs
(`renderBody`, `renderExtras`, `renderActions`).

## Circles and their pages

A circle's page is a list of **modules** (`src/lib/circles/layout.ts`): Filtered Documents (type
`information`: wiki pages by a filter, any number of them), Members, a duty schedule, Tasks (with a "who can add"
setting), Log, Finances (with a "who can see" setting that its API reads from the saved circle —
`hasFinances`/`financeViewers` in `lib/circles/features.ts`), Documents (the circle's pages and
files). `modulesFor(circle, …)` returns the saved `circle.modules`, or derives a page
from the older `layout`/`features`/`infoView` fields for circles that never saved one. Saving
modules also sets `features.tasks`/`features.documents`, which gate those APIs
(`lib/circles/features.ts`). Rendering: `components/circles/circle-modules.tsx` (`CircleModules`
for reading, `ModuleEditor` in the circle's Edit mode, which also edits its details), `circle-detail-client.tsx` `sectionFor()` maps a module
to its component.

## The wiki

One wiki for the whole community (`lib/wiki/store.ts`). Each page has a **keeper** — the field name
in code and storage; the UI calls it the **parent circle** — and its own edit setting
(`lib/wiki/access.ts`; everyone sees every page). Titles are unique; links are `[[Title]]`, embeds `::embed{page="…"}`
(`lib/wiki/links.ts`, `sections.ts`). Edits autosave and merge paragraph by paragraph
(`lib/wiki/merge.ts`, `mergeText(base, mine, theirs)`), with presence via `wiki/presence.json`.
Highlighted words are `:mark[…]{color="…"}` (palette in `lib/wiki/colors.ts`, drawn as `<mark>` by
`lib/wiki/directives.ts`, and a `highlight` mark in the editor); the map (`components/wiki/map-*.tsx`) is built by
`lib/wiki/graph.ts` from the pages the viewer can see. A page is shown as a document
(`components/wiki/wiki-page.tsx`: the keeper's icon, title, date and consent in a centred header
over a `.document-sheet` with `.document-body` margins); the editor (`wiki-editor.tsx`) has a
sticky title bar with the save state and the page's settings, and the toolbar sticks under it.
The visual editor is TipTap (`rich-editor.tsx`; the schema in `editor-schema.ts`, the blocks'
views in `editor-blocks.tsx`, the toolbar in `editor-toolbar.tsx`, `[[link]]` tags in
`wiki-link-node.tsx`, the @ and / menus in `mention-menu.tsx` and `slash-menu.tsx` (sharing
`suggestion-popup.ts`), the right-click menu in
`editor-context-menu.tsx`, find and replace in `editor-find.ts` — a plugin whose matches are
decorations, recomputed as the text changes — and `find-bar.tsx`); pages stay Markdown, converted both ways by `lib/wiki/prose.ts`
(Markdown → document → Markdown equals the Markdown writer's own round trip — `prose.test.ts`),
and anything it doesn't model is carried through in `rawBlock`/`rawInline` nodes. Others' saves
are merged in with `replace()`, which keeps the cursor in its paragraph (`editor-cursor.ts`); the
editor reports a change only when the Markdown actually differs, so opening a page saves nothing.
**Proposals** are their own records (`lib/proposals`: `shared.ts` types and the
`::proposal{id="…"}` directive, `store.ts`, `access.ts`, `http.ts`; `/api/proposals`), put to a
circle and about documents (pages or files). A circle consents to one **at a meeting** — notes (a
page with `meetingDate`, or older notes with `present`) or minutes (a file with a meeting date), or
new notes started for the day — recording the meeting, who was there (each marked as a member or
not), the circle, who recorded it, and the documents' versions (a page's `updatedAt`, a file's
version number). Each document is **snapshotted** when it's attached (`snapshots.ts`: the copy is
kept on its own, its details in the proposal's `snapshots`), and consent is to the snapshots'
versions — what was proposed — unless the recorder chooses the documents as they are now
(`current`, which snapshots them again first). `ensureSnapshots()` takes any missing after every
create, change, and consent (so proposals from before snapshots get theirs); `retakeSnapshots()`
replaces them ("use the current version"); copies no proposal holds are discarded, and a consented
proposal's are never changed. A proposal can also put a page's **alternative versions** forward
(`Proposal.versions`, each copied by `takeVersionSnapshot`: its text caught up with the page,
and that page text as `base`); consent then names the one chosen for each such page
(`ProposalConsent.chosen`, checked by `checkChosen`), and `giveConsent()` (`http.ts`) makes the
chosen one the page *before* recording consent — `mergeText(base, copy, page now)`, saved with
`updatePage`, a no-op on a retry — so the consent's version for that page is the page's new
`updatedAt`; then it marks each version adopted or set aside (`setOutcome`, with the
`proposalId`). Pages and files keep a copy of where their proposals stand — `page.proposal` /
`page.consent` (`lib/wiki/consent.ts`), `doc.proposal` / `doc.consent` — each with a `proposalId`,
computed by `lib/proposals/mirror.ts` and written by `syncDocuments()` after every change, so
`consentState()` ("changed" once a page is edited again) and `pageStage()` (draft, proposed,
consented) still read the document alone. Records without a `proposalId` are from before
proposals (consent recorded directly, without a meeting): they show until a proposal takes their
place and can only be withdrawn. Who records consent is the same for every circle:
`canRecordConsent` (`lib/circles/consent.ts`) — anyone in the circle, the Board for any circle,
admins. In meeting notes, `MeetingProposals` (a **Consent** button per proposal waiting for the
circle) and `ProposalHostContext` (proposal cards in the notes offer **Consent at this meeting**)
record against that meeting.

Deleting a page moves it to `wiki/trash.json` (`lib/wiki/trash.ts`) for 30 days, out of
`wiki/pages.json` — so nothing that reads pages needs to skip it — with the pages inside it
(`withPage`: they aren't listed on their own, and come back with it) and its history, comments
and versions left in their own documents; `reinsertPage` (`store.ts`) puts it back, retitled or
re-addressed if need be. Pages past their days are purged lazily, whenever the trash is read or
changed. Drafts stay in `wiki/pages.json` with `draft: { by }`; everything that lists or reads
pages for a person goes through `visiblePages` (`lib/wiki/access.ts`), which leaves other
people's drafts out (admins see them all).

**Alternative versions** of a page (`lib/wiki/perspectives.ts`, types in `perspectives-shared.ts`;
"perspectives" in code and storage) are copies of a page that one resident changes, kept per page in
`wiki/perspectives/<pageId>.json`. Each keeps its `base` — the page's text and `updatedAt` it
started from — so it can be compared with the page now: `caughtUp()` is `mergeText(base, version,
page)`, the version with the page's later changes brought in (and the clashes), which is what's
shown, what **Bring in the page's changes** saves, and what **Make this the page**
(`POST …/perspectives/<id>/adopt`, the page's editors) saves to the page with `updatePage`
(non-autosave, against the page's `updatedAt`, so the replaced text goes to the history). Saves
are checked against the version's own `updatedAt` (409 otherwise). A version is live while
`status` is "open" and it has no `outcome` (adopted, or — for proposals — set aside).
`compareRows()` (`merge.ts`) lines two texts up for `SideBySide` (`components/wiki/comparison.tsx`),
pairing a run of paragraphs taken out with the run put in by likeness of words.

Pages and uploaded files share one **Documents** section (`/documents`; `/wiki` redirects there).
`GET /api/documents?pages=1` returns them, and proposals, as `items` (`kind` "page" | "file" |
"proposal"; pages listed by `lib/wiki/listing.ts`, searched and sorted like files), shown by
`DocumentsPanel` with `PageListingRow`, `DocumentRow` and `ProposalListingRow`, and its **New** menu
(`documents/new-menu.tsx`) writes a page or meeting notes, makes a proposal, uploads a file, or makes a spreadsheet. Storage, links and history stay separate. **Turn into a page**
(`POST /api/documents/<id>/page`) converts a file's text with `lib/documents/to-markdown.ts`;
uploads do it straight away unless "as they are" is chosen (`BulkUpload`, `AddDocumentDialog`).
The file is marked `madeInto: {pageId}` and, while that page exists, left out of the combined
listing (`?pages=1`) and site search (`shownWithPage`); `GET /api/documents` without `pages=1`
still returns it, so `[[doc:…]]` links to it resolve.

**Spreadsheets** — an `.xlsx` or `.csv` file opens in CVC (`/documents/<id>/sheet`, from its row's
**Open spreadsheet** or its title) in FortuneSheet (`components/documents/sheet-editor.tsx`, loaded
in the browser only). Excel files are read and written by FortuneExcel (`@corbe30/fortune-excel`,
on ExcelJS); it reads a number in an unstyled cell as text, so the editor reads the same file with
ExcelJS and puts those back (`restoreNumbers` in `lib/documents/sheets.ts`) — or saving would
write them as text, which Excel's sums skip. CSV is read and written by `sheets.ts` itself
(quoting kept). **Save** is an ordinary upload of a new version (`sendFile` with `replaces`, then
`POST /api/documents` with `baseVersion`: 409 if someone saved a version since), so history,
proposals' snapshots, consent and exports treat it like any file. While it's open to edit it
checks in every five seconds (`POST /api/documents/<id>/live`, presence in `wiki/presence.json`
as `file:<id>`): it shows who else is editing and says at once when a newer version is saved.
**New → Spreadsheet** (`new-sheet-dialog.tsx`) uploads a blank workbook made with ExcelJS and
opens it. Edit rights are the circle's files' (`canManage`); everyone else can look and download.

## Notifications

Web push (`lib/push`). Topics are declared once in `push/store.ts` (`TOPICS`,
`DEFAULT_PREFERENCES`) and the settings page lists them from there. `notify({ topic, title, body,
url, onlyUserIds, onlyPersonIds, exceptUserId })` never throws and gives up after ~6 s.
`userIdsForPeople()` turns seats into accounts; `onlyPersonIds` narrows to residents instead, so
those who have never signed in are still emailed (alerts use it for a circle's members).

## Time

Everything is Vermont time: `TIME_ZONE` and `todayInVermont()` in `lib/time.ts`. Dates are
`YYYY-MM-DD` strings; timestamps are ISO. Browser-side "today" should use the server's view (an API
field) or `todayInVermont()` too, not the device's zone.

## The client

- React Query everywhere; keys: `["directory"]`, `["wiki"]`, `["wiki-page", slug]`, `["tasks", circleId]`,
  `["task", circleId, number]`, `["documents", …]`, `["forum", …]`, `["finances", circleId, year]`,
  `["auth", "me"]`. Invalidate by prefix after a mutation (circle changes refresh `["finances"]`
  too: who can see and change them follows the circle).
- `components/directory/use-directory.ts`: `useDirectory()`, `useCircles()` — the shared directory
  query most pages need.
- `components/layout/back-link.tsx`: "← …" links go back to the page you came from (a trail in
  session storage), falling back to a fixed place.
- `components/layout/app-shell.tsx`: navigation; `src/app/page.tsx`: the dashboard cards.
- `components/ui` holds the primitives every page is built from: `Button`, `Card`, `Input`,
  `Textarea`, `Select`, `Dialog`, `Pill` (status and count labels), `SectionHeading` (icon, title,
  count, a module's fold toggle), `SegmentedControl` (a radio group or tab list of pills),
  `Loading`/`ErrorCard`/`NotFoundCard` (the three page states), `ActionLink`, and the **Confirm
  dialog**: `useConfirm()` returns `confirm({ title, body?, destructive? }) => Promise<boolean>` —
  nothing uses `window.confirm`.
- Small text helpers live once: `lib/text.ts` (`sentence`, `initials`, `listNames`,
  `likedByLabel`), `lib/time.ts` (`timeAgo`, `shortDate`).
- A page's component stays about its layout and data; its pieces live beside it in their own
  files (`documents/document-row.tsx`, `circles/members-module.tsx`, `wiki/markdown-pane.tsx`,
  `forum/opening-post.tsx`, `resources/recommendation-card.tsx`, …).

## Testing

- `npm test` runs vitest over `src/**/*.test.ts` — pure logic (merge, review clock, modules, route
  helpers, the comment rules). Add a test beside anything with rules in it.
- End-to-end checks run against a real build: seed synthetic data into `.data/`, start with
  `AUTH_SECRET=local-test ADMIN_PERSON_IDS=<id> EMAIL_TEST_SINK=1 next start`, sign in with
  `POST /api/auth/link {personId}` and the link it writes to `.data/email-sink.json`
  (`POST /api/auth/link/<token>`), then curl the API and drive the UI with Playwright
  (Chromium at `/opt/pw-browsers/chromium` in the cloud dev container). Keep fixtures synthetic:
  no real residents in the repo, ever.

## Glossary

| In the code | In the UI | Meaning |
|---|---|---|
| keeper | parent circle | The circle a wiki page belongs to |
| perspective | alternative version ("Eve's version") | Someone's own copy of a page, compared with it and perhaps made the page (a page's *versions*, unqualified, are its history) |
| module (formerly section) | module | One block of a circle's page |
| `information` module | Filtered Documents | A module showing the pages that match its filter (called Information until October 2026) |
| `HIGHLIGHT_COLORS` / `:mark[…]` | highlight | Coloured words in a wiki page (pages themselves no longer have colours) |
| `COMMUNITY_ID` / `BOARD_ID` | Community / the Board | The two built-in circles |
