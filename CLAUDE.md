# Working on Common Pastures (the CVC Directory)

Notes for anyone — person or AI — picking this codebase up. The longer tour is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); the feature-by-feature reference is the README.

## What it is

A private web app for the residents of CVC (a cohousing community in Vermont): directory, circles
(sociocratic working groups), a wiki, documents (pages, including meeting notes, and files), tasks, forum, loan library,
calendar, photos. Next.js 14 (app router, TypeScript, Tailwind) on Vercel; **all data is JSON and
files in Cloudflare R2** — there is no database. Refer to the community as **CVC**; its public
name, on the front page, is **Common Pastures — a Champlain Valley Cohousing development (CVC)**.

## Commands

```
npm run dev          # local server (data in ./.data/ unless R2_* env vars are set)
npm run check        # lint + typecheck + unit tests — run before pushing
npm test             # vitest: src/**/*.test.ts (pure logic in src/lib)
npm run format       # prettier (printWidth 100); the whole of src/ is formatted
npm run build        # what Vercel runs
```

Locally, sign in needs `AUTH_SECRET` and a seeded `.data/directory/directory.json`; make yourself an
admin with `ADMIN_PERSON_IDS=<your person id>`. `.env.example` lists every variable.

## Where things live

| Path | What |
|---|---|
| `src/app/<section>/page.tsx` | A page: a thin server shell that renders a client component |
| `src/app/api/**/route.ts` | The API. Each handler: context/permission helper → `readBody` → store → JSON |
| `src/components/<feature>/` | Client components, grouped by feature; `ui/` holds the primitives |
| `src/lib/<feature>/shared.ts` | Types and pure helpers safe for the browser |
| `src/lib/<feature>/store.ts` | Reading and writing that feature's JSON (server only) |
| `src/lib/<feature>/access.ts` | Who may do what (pure predicates) |
| `src/lib/<feature>/http.ts` | Route helpers: the feature's context loader and failure → `problem()` |
| `src/lib/storage.ts` | R2 (or `.data/`): `readJson`, `writeJson`, `mutateJson`, binaries |
| `src/lib/http.ts` | `problem`, `readBody`, `throttled`, `notFound`/`forbidden`/`full` — every route uses these |
| `src/lib/auth/actor.ts` | `Actor` (`userId`, `personId`, `name`, `admin`) and `actorOf(user)`: who is acting, as stores see them |
| `src/lib/comments/` | The one comment system: `CommentRecord` (`shared.ts`) and the add/edit/delete rules (`store.ts`) every feature's comments follow |
| `src/components/comments/` | `CommentTree`, `CommentForm`, `CommentByline` — how comments are shown everywhere |
| `src/components/ui/` | The primitives: `Pill`, `SectionHeading`, `SegmentedControl`, `Loading`/`ErrorCard`/`NotFoundCard`, `Select`, `ActionLink`, `Dialog`, and `useConfirm()` |
| `src/lib/circles/types.ts` | `Circle`, `CircleSeat`, `CircleApplication`, `CircleKind`, `JoinPolicy` |
| `src/lib/text.ts` | `sentence`, `initials`, `listNames`, `likedByLabel` |
| `src/lib/circles/ids.ts` | `COMMUNITY_ID`, `BOARD_ID`, `isCommunity`, `sitsOnBoard` (importable anywhere) |
| `src/lib/time.ts` | `TIME_ZONE` (Vermont), `todayInVermont`, `timeAgo` |
| `src/lib/email/` | Sending (`deliver.ts`: Brevo, then Resend as backup), the free-plan quotas, the shared email layout, notification emails, test mode |
| `src/lib/groups/` | Circle forums: conversations and polls, with app notifications to the circle's members |
| `src/lib/wiki/tree.ts` | Pages inside pages (`parentId`), their order (`order`, a fractional index: `orderBetween`, `placeAfter` for "right after this sibling"), `buildTree`, `ancestorsOf`, `descendantsOf`, `canNest`; pure, used by the store, the sidebar and the trail over a page's title. Drafts: `visiblePages`/`canSeePage` in `access.ts` is the one gate wherever pages are listed or read for a person |
| `src/components/documents/docs-shell.tsx`, `sidebar.tsx` | The shell around `/documents*` and `/wiki/*` (the layouts there): the Outline-style sidebar — starred, recent, drafts, each circle's page tree — with drag to reorder or nest and a Move to… dialog, both `PATCH {parentId, after}`; a phone drawer; keys `[` `]` `n`. `docs-context.ts` lets pages start a page inside another through the shell |
| `src/lib/site-url.ts` | `siteUrl()` (the app's address for emails), and the wiki's own address (`WIKI_HOST`): `isWikiHost` (the middleware redirects `/` to `/documents` there and sets `x-cvc-wiki-host`, which the root layout passes to `AppShell` as `wikiHost`), `requestSite` (sign-in links lead back to the address they were asked on) |
| `src/lib/wiki/follows.ts`, `mentions.ts` | Following pages (told when they change, hourly at most) and @-mentions of residents (told once a page); topics `following` and `mentions` |
| `src/lib/wiki/prose.ts` | Pages' Markdown ↔ the visual editor's (TipTap) document; the editor itself is `components/wiki/rich-editor.tsx` with its schema in `editor-schema.ts` (find and replace: `editor-find.ts`, `find-bar.tsx`) |
| `src/lib/wiki/perspectives.ts` | Alternative versions of a page ("perspectives" in code): copies one resident changes, compared side by side (`compareRows` in `merge.ts`), brought up to date with `mergeText`, made the page by its editors |
| `src/lib/proposals/` | Proposals put to circles, about documents (and pages' alternative versions), consented at meetings; `snapshots.ts` keeps each document (and version) as it was attached; `mirror.ts` keeps pages' and files' stage in step; `giveConsent` in `http.ts` makes a chosen version the page, then records consent |
| `src/lib/chat/`, `src/lib/presence/` | Private messages between two residents (a conversation document, and each person's list with what's unread); who's online (each open tab checks in every minute) |
| `src/lib/me/` | Each account's starred and recently opened documents (pages, files, proposals by id); `StarButton`, `useNoteOpened` and the menus' lists are in `components/documents/my-documents.tsx` |
| `src/lib/documents/sheets.ts`, `components/documents/sheet-editor.tsx` | Spreadsheets opened in CVC (FortuneSheet): `.xlsx` through FortuneExcel (numbers put back with `restoreNumbers`), `.csv` read and written here; Save uploads a new version against the one opened (`baseVersion`) |
| `src/lib/alerts/` | A circle's Alert module (the Safety Crew's): any resident alerts its members or everyone, by push and email (topic `alerts`); only admins place the module; `components/alerts/send-alert.tsx` is the dialog, also in the menu under your name |
| `src/lib/backups/` | The weekly backup (`make.ts`: one zip of what every resident can see — `contents.ts` says what's left out — plus pages as Markdown, the code, a manifest with each file's type), admins' complete backups, its OpenTimestamps proof (`timestamp.ts`), sign-ups on the unlisted `/backups` page (email, a feed for agents, a copy in their own S3 storage: `deliver.ts`), and the restore test into an empty bucket (`restore.ts`, reading the zip by its index: `zip-index.ts`) |
| `src/lib/mcp/` | The MCP server for residents' AI assistants (`server.ts`: JSON-RPC methods, read-only tools over pages, documents and search, and write tools for keys that can write, pure with a `McpSource`; `writes.ts`: the `McpWriter` behind the write tools, the app's own stores, rules and side effects as the key's owner; `store.ts`: keys, hashed, with their `scope`, made on the AI assistants page `/mcp`); the route is `api/mcp` |
| `src/lib/outline/` | Importing an Outline wiki (admins, `/admin/outline`): `client.ts` (its API, `OUTLINE_URL`/`OUTLINE_API_TOKEN`), `markdown.ts` (Outline's Markdown → CVC's: highlights, notices, mentions, links, attachments), `import.ts` (collections → circles, documents → nested pages via `importPages`, comments via `importComments`, images and files kept here; batches, re-runnable, state in `outline/import.json`); `/doc/…` and `/collection/…` send old Outline links to the right page |
| `src/lib/cars/` | Car registration (the Directory's Cars tab, `components/directory/cars.tsx`): `shared.ts` (the `Car`, `parseCarRows` for a pasted spreadsheet), `store.ts` (`cars/cars.json`, plates unique), `access.ts` (your own unit's cars; the Board Secretary and admins any, and only they import, through `api/cars/import` — the tab has no import button) |
| `src/lib/finances/` | A circle's Finances module: expenses in whole cents (`parseMoney`/`formatMoney` in `shared.ts`), budgets, receipts, the CSV export; who can see it is the module's setting (`access.ts`) |

## Conventions that matter

- **Every write goes through `mutateJson(key, change)`** (an R2 conditional put with retries) so two
  Vercel instances can't overwrite each other. `change` is synchronous and may run more than once:
  no I/O inside it, and return `{ write: false }` when nothing changes. `enqueue` is only for deletes.
- **Who is acting is an `Actor`** (`actorOf(user)` or `ctx.actor`); stores take `Pick<Actor, …>` and
  never store it whole. Each store exports its `Failure` union; the feature's `<feature>Problem()`
  maps it to responses.
- **Comments** on anything use `lib/comments` and `components/comments`, never a new shape.
- **Confirmations** use `useConfirm()` from `components/ui/confirm.tsx`, never `window.confirm`;
  pages show `Loading`, `ErrorCard` and `NotFoundCard` from `components/ui/status.tsx`.
- **Permissions are decided on the server**, in the feature's `access.ts`/`http.ts`; the API tells
  the client what it may do (`canEdit`, `canAdd`, …) and components only hide or show controls.
- **Admins** are `ADMIN_PERSON_IDS` and those added on Admin settings (`isAdmin`); **the Board** can manage every circle
  (`canManageCircle`, `sitsOnBoard`), and a circle's members its **sub groups** (`managesCircle` in
  `lib/circles/tiers.ts`, safe for the browser); **Community** is everyone and has no members.
- **React Query**: one query per resource with a small factory (`directoryQuery`, `wikiPagesQuery`,
  `tasksQuery`…). Mutations invalidate by key prefix; `["directory"]` is the
  people-and-circles document most pages read — use `useDirectory()`/`useCircles()`.
- **Time** is Vermont time everywhere (`TIME_ZONE`); dates are `YYYY-MM-DD` strings.
- **Comments at the top of each file** say what it is for and the rules it enforces; keep them
  true when you change behaviour. Prose in the UI and comments is plain English.
- Circle pages are built from **modules** (`src/lib/circles/layout.ts`); wiki pages have a
  **keeper** in the code, called the **parent circle** in the UI.

## Adding things

- **A field or rule**: change the zod schema in `store.ts`, the store function, then the UI. Types
  flow from `shared.ts`/`types.ts`.
- **A route**: copy the shape of a neighbour — `export const dynamic = "force-dynamic"`, a context
  helper, `throttled` on writes, `readBody`, a store call, `NextResponse.json` or `problem`.
- **A circle module type**: `MODULE_TYPES`/`MODULE_NAMES` in `layout.ts`, `MODULE_ICONS`/hints and
  the offered list in `components/circles/module-dialogs.tsx`, a case in `sectionFor` in
  `circle-detail-client.tsx`.
- **A notification topic**: `TOPICS` in `src/lib/push/topics.ts`, `DEFAULT_PREFERENCES` in
  `src/lib/push/store.ts` and `DEFAULT_EMAIL_PREFERENCES` in `src/lib/email/shared.ts`; send with
  `notify()` (push, and email for those who chose it).
- **Comments on something new**: extend `CommentRecord` with the feature's fields, call
  `addComment`/`editComment`/`deleteComment` from the store's `mutate()`, map `normalizeComment` over
  what's read, and render with `CommentTree`.
- **A label, a heading, a choice of two or three**: `Pill`, `SectionHeading`, `SegmentedControl` —
  don't hand-roll the classes again.

## Rules

- **Never commit resident data.** `.data/`, `directory.json` exports and anything naming households
  are gitignored; test fixtures use the synthetic people (Ada Ash, Ben Birch, …).
- Never decrypt or print secrets; log shapes and lengths. Never disable TLS verification.
- Production data changes only when asked, with a backup taken first; one-off admin endpoints are
  removed again after use.
- Test with `npm run check`, then a real `next build` + `next start` against seeded `.data/` for
  API (curl) and browser (Playwright) checks — see `docs/ARCHITECTURE.md` → Testing.
