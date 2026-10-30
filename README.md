# Common Pastures

A mobile-first community directory for residents, sociocratic circles, shared skills, and the loan library. Built with Next.js 14 App Router and Tailwind CSS, with data stored as JSON documents in Cloudflare R2.

## Features

- 🔐 **Resident sign-in** – Pick your name and get a sign-in link (and code) by email; signed-out visitors see only the sign-in page.
- 📇 **Directory** – Residents by unit with contact details, circles with open seats, and carshed allocations.
- 👋 **New member welcome** – The Board Secretary emails each new member a welcome form (a short bio, including what drew them to cohousing, and how they'll sign in), with sign-in instructions and resources like the Living in Community Guide, then adds them to the directory in a click.
- 🛠️ **Loan Library** – Items residents lend, each with a photo if they like (taken right from a phone's camera), lent-out tracking, and an "Ask to borrow" button.
- 🌱 **Skills** – What neighbors can help with, each skill listed by the resident who offers it.
- 💬 **Forum** – Neighborhood discussions grouped by topic, with replies nested to any depth.
- 🏡 **Homes for sale** – Admins and the Board list homes for sale, shown with contact details on the public front page.
- 💚 **Appreciations** – Short thank-you notes that rotate through the footer of every page, all listed on their own page.
- 🙂 **Profiles** – Residents edit their own details and add a photo.
- 📅 **Calendar** – The next community event on the dashboard, and the full Google Calendar on its own page.
- 📱 **Installable app & notifications** – Add CVC to your home screen, and get push notifications when neighbors post.
- 💡 **Resources** – Local services neighbors recommend, by category, with who recommended each, likes, and comments.
- 📷 **Photos** – A shared gallery of community photos with captions and a full-screen viewer.
- 📄 **Documents** – One place for every circle's documents: **pages written here** (a visual editor, editing together, embeds, history, sticky-note comments on passages, and **alternative versions** any resident can write and compare side by side) and **files uploaded** (minutes, agendas, plans, scans, with versions). One list and one search cover both, contents included, and the forum too; one **New** button writes a page, uploads a file, or adds a link (Google Docs, Sheets and Slides recognised); a file or Google Doc can be turned into a page. **Proposals** are their own records — put to a circle, about pages and files (each kept as a **snapshot** of how it was when attached), held in documents — and a circle consents to one **at a meeting**: the meeting's notes record who was there, and its **Consent** button records the circle, the meeting, who was there, and who recorded it. Pages and files show where their proposals stand: **Draft**, **Proposed**, **Consented**.
- 🐞 **Bugs & ideas** – A ladybug in the corner of every page sends the admins a bug report or a feature request, with the page it came from.
- 🗄️ **Backups** – Every Monday, everything residents can see in the app (and the site's code) in one zip, readable by people and by agents, fingerprinted and timestamped in Bitcoin; residents sign up on an unlisted page for an email, a feed, or a copy in their own storage.
- 🌀 **Circles** – Each circle has its own page, with its members in a side panel; residents join with a button or apply, as the circle chooses. Its members and the Board manage members, details, and an icon; icons show as badges in the directory.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- A Cloudflare R2 bucket for durable storage (optional for local development)

### Environment Variables

Create a `.env.local` file using the template below:

```bash
cp .env.example .env.local
```

Storage (all app data — falls back to local `.data/` files when unset, which is ephemeral on Vercel):

- `R2_ACCOUNT_ID` – Cloudflare account ID.
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` – R2 API token credentials (Object Read & Write on the bucket).
- `R2_BUCKET` – R2 bucket holding the app's documents and images.

Accounts and admin:

- `AUTH_SECRET` – Signs session cookies. Set it in production (see Signing In below).
- `ADMIN_TOKEN` – Enables the admin API (directory import, photo seeding); leave unset to disable it.
- `ADMIN_PERSON_IDS` – Optional comma-separated directory person ids of extra app admins, beyond those added on Admin settings (see Admins).

Email (optional; see App & Notifications):

- `BREVO_KEY` – Brevo API key: email is sent through Brevo first (free: 300 a day).
- `RESEND_KEY` – Resend API key: the backup sender. With neither key nothing is emailed.
- `EMAIL_FROM` – Sender, default `Common Pastures <notifications@commonpasturesvt.org>` (the
  domain must be verified in both Brevo and Resend).
- `SITE_URL` – The app's address for links in emails (default: Vercel's production domain).
- `WIKI_HOST` – A second address for the wiki alone (`wiki.commonpastures.org`), pointed at this
  app: documents only there, with a link back to the full site (see *The wiki on an address of its
  own*). `SESSION_COOKIE_DOMAIN` (`.commonpastures.org`) shares the session cookie across every host
  under one domain, once both addresses sit under it.
- `BREVO_DAILY_LIMIT` / `BREVO_MONTHLY_LIMIT` – Brevo's allowance (default 300 a day, 9,000 a
  month); `EMAIL_DAILY_LIMIT` / `EMAIL_MONTHLY_LIMIT` – Resend's (default: its free 100 a day,
  3,000 a month).
- `CRON_SECRET` – Starts the weekly backup (Vercel Cron sends it; see Backups). Without it,
  backups are made only when an admin exports one.
- `GITHUB_BACKUP_TOKEN` – A GitHub token with read-only access to this repository's contents, so
  each backup includes the site's code (`BACKUP_REPOSITORY`, `owner/name`, if not Vercel's own).
- `OPENAI_KEY` – Draws new circles' icons (see Circles; `OPENAI_IMAGE_MODEL` picks the model,
  default `gpt-image-2.5-flare`) and reads photos of the printed duty calendar for the egg log (see
  Duty schedules; `OPENAI_VISION_MODEL`, default `gpt-5.6-sol`). Without it, new circles start
  without an icon and egg counts are typed in. Locally, `ICON_TEST_FAKE=1` and
  `EGG_READER_TEST=1` (both ignored on Vercel) stand in for OpenAI.

### Installation

```bash
npm install
npm run seed   # sample residents and wiki pages in ./.data/ (no R2 needed)
AUTH_SECRET=local-test ADMIN_PERSON_IDS=000000000006 npm run dev
```

Sign in as any of the people the seed prints (Finn Fir is an admin). With no `R2_*` variables, all
data lives in `./.data/`, which is gitignored.

### Development

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.

### Linting

```bash
npm run lint
```

## Public Front Page

Signed-out visitors to `/` see a public page about CVC — the community, its
land, how it governs itself, and homes for sale — with **Resident sign-in** buttons, and no email
address of the community's (homes for sale show their sellers' contacts); signed-in
residents see their dashboard at `/` instead (`src/components/home/public-home.tsx`). It contains
no resident information. Its hero photo lives in `public/home/`, which (like the manifest and icons)
is served without sign-in; every other page and API still requires it.

## Signing In

Residents sign in at `/login` by choosing their name from a searchable dropdown and tapping
**Email me a sign-in link**. The names come from the imported community directory — only
residents with an email address on file can sign in — and the dropdown exposes names only, never
contact details or unit numbers.

- The email (`POST /api/auth/link`) goes to the resident's address **in the directory**, never one
  typed in; the page shows it half-hidden (`c•••@example.org`). It holds a **link** and a
  **six-digit code**. Either signs in, once, within a day: the link on whatever device opens
  it (`/login/<token>`), the code typed on the device that asked (`POST /api/auth/code`) — for an
  app added to a phone's home screen, which doesn't share the browser's sign-in.
- Opening a link signs in straight away and goes on to the dashboard (or wherever the link was
  asked for): the page posts the token once it has loaded, so a mail scanner that only fetches the
  page can't use it up. Using the link or the code spends both.
- Only keyed hashes of links and codes are stored (`auth/sign-in-links-2.json`,
  `lib/auth/sign-in-links.ts`). Five links an hour per person, until they sign in (which clears
  their other links); five wrong codes spoil the open
  links. Sign-in emails go out even in email test mode and are logged without the address.
- While the sign-in page waits, it notices a link opened in another tab of the same browser and
  continues; it never signs in a device just because someone else clicked a link.
- An account is created on a resident's first sign-in and linked to their directory entry.
- **Welcome tour** – the first time someone is signed in (on any device), a small window offers a
  short tour: the portal as a digital common house; circles keeping their own ways of working; each
  circle's page, forum, documents and links; the community's tools (Loan Library,
  Photos); the ladybug for bugs and ideas (lifted out and ringed in its corner while it's
  described); adding the app to the home screen (this device's way — iPhone, Android, or both on a
  computer — and left out if it's already added); and thanks. **No thanks**, closing it, or finishing
  it is remembered on the account (`tourSeenAt`, `POST /api/auth/tour`), so it opens by itself only
  once; **Take the tour** in the account menu runs it again (`components/tour/welcome-tour.tsx`). It
  never opens by itself while an admin views the app as someone, or on pages opened from an email.
- Signed-out visitors see only the public front page and the sign-in page: middleware redirects every other page to `/login`
  (returning afterwards to the page they asked for) and answers 401 for every other API route.
- **Homes for sale** – admins and Board members list homes for sale at `/homes-for-sale` (linked
  from the account menu): title, unit, price, details, description, an optional photo, a listing
  link, and the buyer contact (name plus email and/or phone), with a status of _For sale_, _Sale
  pending_, or _Sold_ (hidden). For-sale and pending homes appear, with their contact details, in a
  **Homes for sale** section on the public front page (and its navigation). Stored in
  `homes/listings.json`, photos in `homes/photos/<id>`; a listed home's photo is served publicly
  (`GET /api/homes/<id>/photo`), a sold one's isn't.
- While the app is being proposed to the Board and community, visitors see only an opaque
  **under construction** notice with a **Sign in as a resident to view** button, at `/` and
  `/welcome`; residents previewing `/welcome` still see the page. Turn it off with
  `UNDER_CONSTRUCTION` in `components/home/public-home.tsx`.
- The public front page is also at `/welcome`, for anyone: residents open it from **Public homepage** in
  the account menu to see what visitors see, with a bar leading back to the app. It leads with the
  name — **Common Pastures**, _A Champlain Valley Cohousing development (CVC)_ — in its header, its
  opening band, the under-construction notice and the footer. It opens on a
  forest-green band with a white oak leaf on the right (`public/home/leaf.webp`) and the aerial photo
  of the neighborhood (`public/home/aerial.jpg`, shown whole so the lake and mountains stay in view)
  framed over its lower edge. **Where we are** has a street map (OpenStreetMap) and **Our land** a
  satellite view (Esri World Imagery), both pinned on CVC at the end of Common Way (Leaflet,
  `src/components/home/land-map.tsx`; they ignore the scroll wheel and, on phones, one-finger drags,
  so the page scrolls past them); **Living sustainably** shows the solar roofs (`public/home/solar.jpg`). Headings across the site
  use the Fraunces serif (`font-display`), and the signed-in dashboard greets residents by first name
  on the same green band.

Session cookies last 400 days — the longest a browser keeps one — and each visit renews them (once
they're a day old, in the middleware), so residents stay signed in for as long as they keep coming
back; signing out ends it. They're signed with `AUTH_SECRET`; when it's unset, production derives a key from `R2_SECRET_ACCESS_KEY`
(never the public development default), and with neither it refuses to create sessions. Setting
`AUTH_SECRET` explicitly is still recommended.

## Importing an Outline wiki

Admins can bring a whole [Outline](https://www.getoutline.com) wiki into CVC from **Admin
settings → Import from Outline** (`/admin/outline`; `lib/outline`). Set `OUTLINE_URL` (the wiki's
address) and `OUTLINE_API_TOKEN` (an Outline admin's API key) in Vercel first; CVC only reads from
Outline. **See what's there** lists the collections, their document counts and the circle each
becomes — one with the same name, or a new circle (made with the importing admin as its first
member). **Run the import** then brings every published document over as a page of that circle,
in Outline's order and nesting, with its emoji, dates and authors (matched to residents by email;
others are credited under their Outline name), its images (kept as the circle's wiki images), its
files (kept as the circle's documents and linked `[[doc:…]]`) and its comments (as the page's
comments, threads kept). Outline's Markdown becomes CVC's (`lib/outline/markdown.ts`):
`==highlights==` → `:mark`, `:::info|warning|tip` → callouts of that kind, mentions → resident
mentions, links between documents → `[[Page]]` links (settled once every page exists), anything
that would read as a CVC directive escaped. A title another page already has gets "(from the
wiki)". Archived documents and other people's unpublished drafts stay behind. The import runs in
batches and can be run again: a page is found by the document it came from (`source` on the
page), so re-running updates pages (replacing their text, without a history entry) and never
doubles them; images and files are fetched once (`outline/import.json` keeps the tally, the log,
and what each attachment became). Old Outline addresses keep working once the wiki's domain
points at CVC: `/doc/<title>-<urlId>` opens the page that document became, and
`/collection/<name>-<urlId>` its circle.

## The wiki on an address of its own

The app can also answer on a second address that shows only the wiki — `wiki.commonpastures.org`,
say — so the documents have a home of their own, as the Outline server had. Set `WIKI_HOST` to that
host name, add the domain to the Vercel project and point its DNS at Vercel. On that address the
front door is Documents (`/` redirects there); the header shows the logo with a **Wiki** label,
search, and your account, with a **Full site** link to the app's own address (`SITE_URL`), and no
section links or footer; the sidebar and every page work as they do on the main address, and so
does every other page, if typed. A sign-in link asked for there leads back there
(`requestSite()` in `lib/site-url.ts`; only the configured host is trusted, never an arbitrary
Host header). Sessions are cookies, which browsers keep per host: while the app and the wiki are
on different domains (as `cvc-directory.vercel.app` and `wiki.commonpastures.org` are) a resident
signs in on each once; once both sit under one domain, set `SESSION_COOKIE_DOMAIN` to it
(`.commonpastures.org`) and one sign-in serves both. The middleware decides from the Host header
(`isWikiHost`) and tells the shell with the `x-cvc-wiki-host` request header.

## Admins

Admins can do anything a resident can, on anyone's content. Sam Peret is built in
(`src/lib/auth/admins.ts`); the rest are managed on **Admin settings** (`/admin/settings`, in the
user menu): any admin makes a resident an admin, or removes one added there — never the last
admin. Those set with `ADMIN_PERSON_IDS` in Vercel (directory person ids) are listed there too,
but changed in Vercel. The added ones are kept in `auth/admins.json` (`lib/auth/admin-store.ts`;
`GET`/`POST /api/admin/admins`, `DELETE /api/admin/admins/<personId>`) and read as each request's
session is, so admin status is checked server-side on every request; the user menu shows an
"Admin" label. The settings page also links the other admin pages.

- **Circles** – edit, manage members of, and delete any circle, as the Board can.
- **Forum** – edit or delete any post, including a whole discussion after others have replied.
- **Skills & Loan Library** – remove anyone's skills; mark anyone's items lent out or returned, or
  remove them.
- **Profiles** – edit any resident's entry and photo from the "Edit" link beside them in the
  directory (`/profile/<personId>`), including the email address their sign-in links go to.
- **View as a resident** – "View as resident…" in the user menu, or "View as" beside anyone in the
  directory, shows the app exactly as that resident sees it: their name, their permissions, their
  own posts. It's read-only — while it's on, the middleware refuses every change, so an admin can
  never post or edit in someone's name — lasts at most an hour, and shows a banner with a way
  back. The view is a separate signed cookie tied to the admin's own session (useless to anyone
  else). Views don't appear in the sign-in log.
- **Bugs & requests** – residents send a bug report or a feature request from the ladybug in the
  bottom-right corner of every page (a short description; the page they were on and their browser
  come with it). Admins get a push notification for each (whatever their settings) and read them
  under "Bugs & requests" in the user menu (`/admin/feedback`): open ones first, with who sent
  each, from which page, and **Mark done** / **Open again** / **Delete**. Stored in
  `feedback/reports.json` (`POST /api/feedback` for anyone signed in; `GET`, and
  `PATCH`/`DELETE /api/feedback/<id>`, for admins); when it's full (1,000), the oldest done
  reports make room.
- **Sign-in log** – "Sign-in log" in the user menu (`/admin/sign-ins`) lists every successful
  sign-in, newest first, by day or by resident. **By resident** lists every resident with when they
  were **last seen** in the app (noted from signing in and from each open tab's check-in, to within
  ten minutes; "Never" if not since this began — `auth/last-seen.json`, `lib/auth/last-seen.ts`,
  forgotten when someone leaves), their sign-in count and last sign-in, sorted by last seen or by
  name; the heading counts who's been seen this week. Sessions last a long time, so sign-ins are
  rare and last seen is the better sign of who uses the app. It records only who and when — no
  phone numbers or devices — keeps the latest 2,000 sign-ins in `auth/sign-in-log.json`, and is
  served only to admins.

## Backups

**Backups** (`/backups`, unlisted — no menu links to it) keep CVC's data somewhere besides its
own storage. Every Monday morning (Vercel Cron, `vercel.json`, calling `/api/cron/backup` with
`CRON_SECRET`) — or when an admin presses **Export now** on that page — `lib/backups/make.ts` makes
one zip, streamed into storage at `backups/<id>.zip`; the newest eight are kept
(`backups/index.json`). Inside, under `cvc-backup-<date>/`:

- `data/` — every stored object at its storage key (JSON documents, files as uploaded): what the
  app reads, so it can be restored key for key, and what an agent or script reads.
- `pages/<circle>/<title>.md` — each written page as Markdown with front matter.
- `site/source.zip` — the app's code at the deployed commit, from GitHub (with
  `GITHUB_BACKUP_TOKEN`).
- `manifest.json` (every file's path, size, SHA-256 and dataset; what each dataset holds; what's
  left out) and `README.md`.

A backup holds only what every resident can see in the app (`lib/backups/contents.ts`): private
messages, what only admins see (the sign-in log and last seen, the email log, quota and settings,
feedback reports), invitations' links, circles' finances kept to their members, sign-in links, the
app's keys, push addresses, earlier backups and their sign-ups, and anything temporary are left
out. The zip's SHA-256 (its **fingerprint**) is timestamped with OpenTimestamps
(`lib/backups/timestamp.ts`: three public calendars, anchored in Bitcoin within hours); the proof is
kept beside it (`backups/<id>.ots`) — `ots verify` shows the backup existed, unchanged, that day.

Any resident signs up there (`backups/subscribers.json`, by person id):

- **Email** — told when each is ready, with a link back to download it (`PATCH
/api/backups/subscription`; respects email test mode).
- **A feed** — a private address (`/api/backups/feed?token=…`, no sign-in: the token is the key,
  shown once, only its hash kept) listing the backups as JSON with links to each zip and proof
  (`/api/backups/feed/file`), for an agent or a script. **New address** replaces it; **Stop**
  ends it.
- **Their own storage** — any S3-compatible bucket (Backblaze B2, AWS S3, Wasabi, Cloudflare R2,
  Filebase on IPFS): each new backup and its proof are copied there in 8 MiB parts
  (`lib/backups/deliver.ts`). CVC writes a small note there before keeping the settings; the
  address must be `https://` and on the internet (not this machine or a private network); the
  secret key is sealed with AES-256-GCM from `AUTH_SECRET` and never shown again (changing
  `AUTH_SECRET` means setting it up again). The page shows how the last copy went.

Signed-in residents download any kept backup (`GET /api/backups/<id>`, `?file=ots` for the proof;
a ten-minute link straight from R2). Locally, `BACKUP_STORAGE_ALLOW_HTTP=1` lets tests copy to a
stand-in bucket over plain http.

**Complete backups** (admins only): **Complete backup** on the page makes one with everything a
restore needs — private messages, the push key and devices, admins' logs, invitations, every
circle's finances — leaving out only earlier backups and what's temporary (`contents.ts`,
`leftOut(key, …, "complete")`). The newest three are kept; only admins see or download them, and
they're never emailed, put in a feed, or copied to residents' storage. Every manifest records each
file's type, so a restore serves photos and files as before.

**Restore test** (admins, on the same page): choose a backup, give a new, empty bucket's S3
address (R2: `https://<account id>.r2.cloudflarestorage.com`), its name and a key that can only
reach it, and **Restore into this bucket** (`POST /api/backups/<id>/restore`,
`lib/backups/restore.ts`). It refuses CVC's own bucket and any bucket with something in it, reads
the zip's index first (`zip-index.ts`: files are cut out at the places the zip's central directory
gives, never by searching the data, which a stored .xlsx — itself a zip — would confuse), writes each
file under `data/` at its storage key with its type, then checks: the zip's fingerprint, each
file's SHA-256 against the manifest, the new bucket's listing, a few files' types, and that the
directory, circles and pages read back (counted beside CVC's now). The key is used for that request
only — never stored or logged; each try is noted in `backups/restores.json` (where, by whom, how it
went). Delete the test bucket and its key afterwards: it holds everything in the backup.

## Forum & Appreciations

- **Forum topics** – the forum's front page (`/forum`) lists its topics, each with its discussion
  count and latest discussion; each topic's page (`/forum/topics/<id>`) lists its discussions and
  is where new ones start. Admins add, rename, and remove topics (removing one moves its
  discussions to **General**, which always exists and holds every discussion from before topics,
  or whose topic is gone).
  A discussion's author or an admin can move it to another topic when editing it. Topics live in
  `forum/topics.json`; each discussion records its `topicId`.
- **Forum** – signed-in members start discussions and reply to any post; replies nest
  to any depth (indentation stops at five levels so long chains stay readable on phones) and any
  branch can be collapsed. Authors can edit and delete their own posts; deleting a reply that
  others answered leaves a placeholder so the conversation below survives, and a discussion can be
  deleted by its author only while no one else has replied. Anyone can like the opening post or any reply (the heart
  fills straight away; hovering shows who liked it). A post's actions — like, reply, edit, delete —
  appear beside its byline when it's hovered (always, under the text, on touch screens); a post's
  like count stays in view once it has likes. The opening post shows when it was started, not who
  by, and reply counts aren't shown. Each thread is one JSON document (`forum/threads/<id>.json`) with
  replies stored flat by `parentId`, plus an index (`forum/index.json`) for the list page.
- **Appreciations** – signed-in members share short public thank-you notes, optionally addressed
  to someone. One at a time rotates through the footer of every page, large and centered (pausing
  while you hover, and not auto-advancing for visitors who prefer reduced motion); clicking it
  opens `/appreciations`, which lists them all. Anyone signed in can remove one. Stored in
  `appreciations/index.json`, newest 500 kept.

Authors always come from the signed-in session, never from the request body.

## Messages & who's online

- **Who's online** – a green dot on residents' pictures (the directory, their page, circles'
  Members, Messages) while they have the app open. Each signed-in tab checks in every minute while
  it's being looked at, and once more as it closes, which takes you off at once; anyone not heard
  from for three minutes is offline. Everyone is shown (there's no hiding). One document,
  `presence/online.json`; a check-in soon after the last isn't written again
  (`lib/presence/store.ts`; `POST /api/presence` answers who's online and your unread count, `GET`
  only who's online — what an admin viewing as someone gets).
- **Messages** (`/messages`, the speech bubble in the header, with how many conversations are
  unread) – private messages between two residents: **Online now**, **New message** to anyone in
  the directory, and your conversations; `/messages/<personId>` is a conversation (beside the list
  on wide screens), and a resident's page has **Message**. Enter sends (Shift+Enter for a new
  line); you can delete your own messages (for both of you). While it's open the page asks every
  few seconds whether anything's new and reads a conversation again only when it has changed; a
  conversation you're looking at is marked read. Each conversation keeps its last 500 messages
  (`chat/conversations/<a>-<b>.json`, the two person ids sorted), and each person has a list of
  theirs (`chat/people/<personId>.json`: who with, the last message, when they read it) — gone
  when they leave the directory. The other person gets a push notification (topic **Messages**,
  never emailed), which opens the conversation. Messages are private: an admin viewing the app as
  someone can't read theirs (`lib/chat`; `GET /api/chat`, `GET`/`POST
/api/chat/with/<personId>`, `DELETE …/<messageId>`).

## Directory & Skills

- **Directory** (`/directory`) – a list of units, each with its residents stacked beneath (and
  their circle badges), plus carshed allocations. People listed as not living on site are hidden
  unless "Show non-residents" is on. Each name opens the resident's page (`/directory/<id>`) with
  their phone numbers, email, birthday, bio, circles, and household. Served by `GET /api/directory`
  to signed-in residents only (the route confirms the account server-side).
- **Managing the directory** – the Board Secretary (whoever holds that seat on the Board) and
  admins can add people ("Add a person"), edit anyone's entry including unit, owner/renter, and
  whether they live on site (and reset phone numbers), and remove people. Removing someone takes them out of their circles,
  closes their account (ending any session, so they can't sign in), and deletes their profile,
  photo, and notifications; what they posted stays under their name. Additions and removals live
  in `directory/people.json`, layered over the import, so a re-import doesn't undo them.
- **The Secretary page** (`/secretary`, **Secretary** in the account menu) – for the Board
  Secretary and admins, to welcome new members. **Invite a new member** takes their email (and
  name, if known) and emails them a link to their own **welcome form** (`/join/<token>`, no
  account needed): a short bio, including what drew them to cohousing, and the name, mobile
  number, and unit they'll be listed with. The same page explains how to sign in (by name, with a
  link emailed to them; adding the app to a phone's home screen) and lists the
  **welcome resources**. Their answers come back to the Secretary page, where **Add to directory**
  opens "Add a person" filled in from them (or, if they're already listed, **Already listed as …**
  marks them added); once they're in, their bio goes on their profile (if it has none), they're
  emailed that they can sign in, and their welcome page says so. Each invitation shows whether
  it's waiting, answered, or done, with **Copy link**, **Open**, **Send again**, and **Remove**.
  Links are the invitation's id signed with the app's secret, and work for 60 days from when they
  were last sent; answers can be changed until the person is added. An address has one open
  invitation at a time.
- **Asking to join** – someone not in the sign-in list chooses **I'm new here — ask to join** on
  the sign-in page and gives their name and email (`POST /api/join/request`). They're emailed the
  same welcome form (so the address is proved theirs), and the request shows on the Secretary page
  as "Asked to join from the sign-in page". The answer is the same whatever the address: one
  already in the directory is emailed how to sign in instead, so the form can't be used to find out
  who lives here. Asking again within ten minutes doesn't email again; five asks a minute from one
  place, and 40 open requests, at most. When anyone sends their welcome form (invited or asking),
  the Board Secretary and the admins are notified (the "circles" notifications) with a link to the
  Secretary page.
- **Welcome resources** – what every welcome page lists, chosen on the Secretary page in order:
  documents, pages (any but those once set to be seen only by some circles), and links, each
  with an optional note. Until the
  Secretary saves a list, it's any document or page titled "Living in Community Guide". New
  members open the documents and pages from their welcome link before they can sign in (pages
  read-only, with links into the app as plain text) — only what's on the list, and only while
  the link works. Invitations in `onboarding/invitations.json`, the list in
  `onboarding/resources.json` (`lib/onboarding`; `GET`/`POST /api/secretary/invitations`,
  `PATCH`/`DELETE …/<id>`, `POST …/<id>/send`, `GET`/`PUT /api/secretary/resources`; the public
  `GET`/`POST /api/join/<token>` and `GET …/resources/<id>`).
- **One profile, several households** – someone listed in more than one unit (e.g. a child whose
  parents live apart) has a single profile listed under each unit. Entries with the same name are
  combined automatically; directory managers can split a combined profile back into separate
  entries ("Split entries", for different people who share a name) or combine entries whose names
  differ ("Same person listed elsewhere?"). "Remove from unit N" takes someone out of one of their
  households and keeps them in the others. Links to a combined entry open the one profile.
- **Search** – the header's magnifying glass, "/" or "c" anywhere, or Ctrl+K (⌘K) opens a large search bar
  in the middle of the screen; results appear as you type (from two letters, grouped by kind), ↑/↓
  and Enter open one, and **See all results** goes to the full page (`/search`) – one search across
  the site for residents: the app's own places (its pages, by name and what they're for — so
  "backup" finds the backups page; admins' pages for admins), people (by name, bio, and skills),
  circles, wiki pages, forum discussions, documents (their details and text), tasks, resources,
  and the loan library. Every word must match
  somewhere in a result; titles count most. Results come in groups, best first, with the matching
  passage quoted and the words marked, and **See all** for a group (`GET /api/search?q=…&kind=…`).
  The query stays in the address, so a search can be shared.
- **Header menus** – **Documents** and **Circles** in the header have menus (pointing at them, or
  their arrow): Documents offers **All documents**, **New document** (`/documents?new=`), and
  **Upload a file** (`/documents?upload=1`); Circles lists **Your circles**, then the others, each
  with its icon. Their labels still go to the page. On phones they show under those links.
- **Skills on profiles** – residents list their skills on their profile (**Your skills**); they
  show as chips on their directory page (each searching for everyone with that skill) and are
  searchable. They're the same skills as the Skills page, which still lists them all.
- The dashboard's cards and the header's sections: Directory, Circles, Loan Library, Forum, Photos,
  and Resources (and Calendar, in the header). Documents and Skills aren't linked from either:
  documents live on each circle's page and in search; skills on profiles and in search. Their pages
  (`/documents`, `/skills`) still work.
- **Skills** (`/skills`) – every skill belongs to the resident who lists it, taken from their
  signed-in account. Residents add and remove only their own; the catalog groups skills by
  category and shows who offers each one. Stored in `skills/index.json`.
- **Loan Library** (`/library`) – things residents are happy to lend, as a grid of small cards:
  each just its photo, name, **Available** / **Lent out**, and whose it is. Clicking one opens the
  rest — category, details, the owner's unit, who has it — with an **Ask to borrow** button that
  emails (or calls) the owner using their directory contact details (`/library?item=<id>` opens
  one; site search links there). Every item belongs to the resident who lists it; they (and admins)
  get **Edit** and **Delete** on its card when they point at it (always shown on phones), and in
  its details: **Edit** changes its name, category, details and photo, and whether it's lent out
  (optionally noting who has it). Stored in `library/items.json`.
  An item can have a **photo**: **Lend something** opens with a photo tile — on a phone, **Take a
  photo** (straight to the camera) or **Choose from library**; on a computer, **Add a photo** — and
  owners can change or take it off in **Edit**. Photos are shrunk to 1600px and
  re-encoded as JPEG in the browser before they're sent (quick on a phone connection, and the
  camera's location data is dropped), stored as binaries (`library/photos/<id>`, removed with the
  item), and served to signed-in residents (`/api/loan-items/<id>/photo`).
- **Phones** – form fields are 16px on small screens, so iPhones don't zoom in when one is tapped.

## Cars

The Directory's **Cars** tab (`/directory?tab=cars`; `lib/cars`, `components/directory/cars.tsx`)
lists every car registered at CVC, by unit — plate, make, model, colour, year, whose it is — and
searches by any of those, so a neighbour can tell whose car is in the lane. Residents **Register
a car** for their own unit (every unit they're listed in), naming the resident it's registered to
(one of the unit's) or anyone else by name, and change or remove their unit's cars; the Board
Secretary and admins any car. A plate is registered once. Site search finds a car by its plate
(with or without its spaces), its description or its owner, and opens the Cars tab searched for
it. A person's page lists their unit's cars. The tab has no import button; the Secretary and
admins can still load a spreadsheet's rows through the API (`POST /api/cars/import` with `{text}`:
the rows with their header row, tab- or comma-separated; columns read by their names — unit,
owner, make, model, colour, year, plate, state, notes — owners matched to residents by name, a
plate already registered updated rather than doubled). `GET`/`POST /api/cars`,
`PATCH`/`DELETE /api/cars/<id>`; stored in `cars/cars.json`.

## Storage

JSON documents are stored in Cloudflare R2 via the S3-compatible API. Without R2 credentials — or
if R2 is unreachable — the app falls back to `.data/` on disk: fine for local development,
ephemeral on Vercel. `GET /api/health` reports `{ storage: { configured, durable } }` (booleans
only) and returns 503 unless writes are actually reaching R2.

To provision R2: create a bucket in the Cloudflare dashboard, generate an R2 API token with
Object Read & Write scoped to that bucket, and set the four `R2_*` variables in Vercel.

## Documents

- **One section for pages and files** (`/documents`, **Documents** in the menu). Its list and search
  cover both written pages (a book icon and a **Page** label) and uploaded files (a file icon and
  their type), filtered and sorted together (`GET /api/documents?pages=1` returns them as `items`,
  each `kind` "page", "file" or "proposal"; the **Type** filter can keep to **Written pages**, **All
  files**, **Proposals** (`/proposals` opens it), or one type of file). The one **New** button offers
  **Write a page** (a title and its circle, then the editor), **Meeting notes** (a page for one of a
  circle's meetings: its day, then the editor; named "Land Care Circle meeting, Oct 8, 2026" until
  given another title), **A proposal**, **Upload a file**, **Spreadsheet** (a blank one, opened to
  fill in), or **Add a link**. A new page can
  **Start from** a template (`lib/wiki/templates.ts`): **Meeting agenda**, **Meeting notes** (what
  meeting notes start from), **Policy**, **How-to**, or any page whose circle ticked **Use as a
  template** in its **Settings** (`page.template`) — a copy of its text with `{{date}}` and
  `{{circle}}` filled in and its polls and proposals left out (`POST /api/wiki/pages` with
  `template`: a built-in key or a page's id). A circle's Filtered Documents **Add a page** offers the
  same. The **Map** button shows how pages link. `/wiki` (and
  `/wiki?keeper=…`, `?new=…`) now lead here; pages keep their `/wiki/<slug>` addresses. A rule of
  thumb: anything people will keep improving is best written as a page; a fixed record, or anything
  from outside, uploaded as a file.
- **Export** – the **Export** button (on the Documents page and in a circle's Documents section)
  turns each row's icon into a box to tick: tick some, or the box for **all those listed**, and
  **Download zip** — or **Export all documents** (all of a circle's, on its page or with the circle
  filter). The zip has a folder per circle: written pages as Markdown files (details first, as
  front matter; `[[links]]` to pages and files in the zip made relative, others to the app;
  collapsible sections as `<details>`, callouts and embedded pages quoted, highlights as `<mark>`,
  polls with their votes, proposals in a page quoted with where they stand, photos in `images/`,
  a meeting's transcript at the end), files as their latest version, links as a note of where they
  go (with a Google file's text), and proposals (in `Proposals/`) as Markdown with their documents
  and consent; a README lists everything by circle, and anything that couldn't be included. The
  zip is made into storage — each file streamed through, in
  8 MiB parts — and downloads from there, so neither size nor connection speed is limited by how
  long a request may last (`POST /api/documents/export` with `{items}` or `{all, circle?}`, then
  `GET /api/documents/export/<id>`; `lib/documents/export.ts`, `export-markdown.ts`). Up to 2 GB
  of files at a time; an export is kept a day, for whoever made it.
- **Starred and recent** – a **Star** on a page (beside History), a proposal's page, and a file's
  row of actions keeps it in your **Starred** list; pages, proposals and files you open go into
  your **Recent** list. The Documents menu (and the phone menu, under Documents, once its chevron
  is pressed) shows five of
  each, newest first (Recent leaves out what's starred), and `/documents/mine` shows them all, with
  stars to change. Each account has its own (`me/documents/<userId>.json`, `lib/me`; up to 50
  starred and the last 20 opened); what's since deleted or in the trash is left out, and nothing is
  noted or starred while viewing the app as someone (`GET /api/me/documents`,
  `PUT /api/me/documents/starred`, `POST /api/me/documents/recent`). The lists go when someone
  leaves the directory.
- **The sidebar and the page tree** – beside Documents and every page, a sidebar (as in Outline)
  lists your **Starred** and **Recent** documents, your **Drafts**, and every circle that has pages,
  each folding out to its tree: pages inside pages (`parentId`), in their order, the page you're
  reading marked with its parents unfolded, each circle's sub groups nested inside it; the documents
  sit on white panels, the circles' headings around them. On a wide screen it stays in view and **[** hides it,
  **]** brings it back (remembered in the browser); on a phone a **Pages** button slides it in.
  Over a page's title a trail reads circle › parent › …, and at the end of the page **Pages
  inside** lists the pages under it. For the circles whose pages you keep (the Board and admins,
  every circle's), a row's **+** starts a page inside it (the Write-a-page dialog, with the parent
  shown; `POST /api/wiki/pages` with `parentId`), **Move to…** chooses which page it goes inside
  and after which of that page's pages, and a row can be dragged: onto another's top or bottom
  edge to go before or after it, onto its middle to go inside it, onto the circle's name to go to
  its top level. A move is one `PATCH /api/wiki/pages/<slug>` with `{parentId, after}` (`after`: a
  sibling's id, null for first); the store (`movePage`, `placeAfter` in `lib/wiki/tree.ts`) gives
  the page an order key between its neighbours', renumbering the siblings only when a page never
  moved before has none yet. Past fifty siblings, **Show more**. Keyboard, while reading a page:
  **e** edits (if you may), **s** stars, **n** starts a page; **⌘K** opens the search except in the
  editor, where it's the link box.
- **Spreadsheets** – an Excel (`.xlsx`) or CSV file opens in CVC: **Open spreadsheet** among its
  row's actions, or its title (`/documents/<id>/sheet`). It's a spreadsheet editor (FortuneSheet):
  formulas, formatting, several sheets, a phone too. **Save** makes a new version of the same file
  — still an Excel or CSV file anyone can download, with its history, proposals and consent as
  for any file — unless someone saved a newer one meanwhile: then it says who, and offers to load
  theirs (your changes there aren't saved; `POST /api/documents` with `baseVersion`, 409). While
  you have one open to edit, it shows who else does, and says as soon as anyone saves. **New →
  Spreadsheet** makes a blank one in one of your circles and opens it. Those who can change a
  circle's files can edit its spreadsheets; everyone else can look and download.
- **Turn into a page** – a file with text (Word, PDF, slides, text) has a book icon among its
  actions, for anyone who can start pages in its circle: its text becomes a page with the file's
  title, kept by the file's circle and opening with a link back to the file. The file is kept,
  unchanged, as the page's original (`madeInto`): while the page is there, Documents lists and
  search show the page, not the file (`shownWithPage`); if the page goes to the trash, the file is
  listed again.
  A Word file keeps its headings, bold and italic words, and lists; other files come in paragraph by
  paragraph; the words are never changed (`POST /api/documents/<id>/page`,
  `lib/documents/to-markdown.ts`). A shared Google Doc can be turned into a page the same way
  (through Google's Word export).
- **Links** – **Add a link** keeps a Google Doc, Sheet, Slides deck, Form or Drive file — or any
  web page — with a circle's documents, titled, typed, dated and open to consent like a file
  (`POST /api/documents/links`; each version is a file or a link, `version.link`). Google links
  are recognised by their address (`lib/documents/links.ts`): the dialog fills in the title from
  Google, says whether it's shared with **Anyone with the link** (and how to share it if not), and a
  shared one's text is read through Google's export so search finds what's in it
  (`lib/documents/link-fetch.ts` fetches only Google's fixed export addresses, built from the
  file's id). In the list a link opens where it lives; a Google one has **Preview here** (shown in
  the page) and its kind (**Google Doc**…); **Change the link** saves a new version, keeping the old
  link in the history.
- Each circle's page has a **Documents** section, listing its pages and files by icon and title only
  (their type, dates, authors and opening lines are on the Documents page); documents for everyone
  belong to the Community circle.
  Each document shows its full title, then a line with its type, badges (Consented), circle where
  the list spans circles, date, and who uploaded the current version; Download, versions, and — for
  its managers — Edit, New version, and Delete are icons at the end of that line that appear on
  hover (always, on touch screens). A description shows below.
- **Proposals** (`lib/proposals`, `/proposals/<id>`) – something put to a circle for its consent:
  a title, the proposal itself (Markdown), the **documents it's about** (pages or files, found by
  title — "adopt this policy"), and the day it's to be decided, if known. Whoever can start a
  circle's documents can put a proposal to it (any resident, for Community); everyone at CVC can
  see proposals. It's **Proposed** until the circle consents — or until it's **Withdrawn** (and
  perhaps **proposed again**); whoever proposed it, the circle's members, the Board, and admins
  change, withdraw, or delete it (a consented one can't be changed: a new proposal changes it).
  Proposals are made from the Documents **New** menu, a page's or file's **Propose for consent**,
  or the editor's **Add a proposal** (the handshake), which puts it in the page — a new one (about
  that page, unless it's meeting notes) or one already waiting — as `::proposal{id="…"}` on a line
  of its own: a card with the proposal, the documents it's about, where it stands, and what you can
  do. Its own page also lists the pages that hold it. The circle's members hear of a new proposal,
  and of its consent (topic "Proposals to your circles…"; everyone, for Community's).
- **Alternative versions at a meeting** – a proposal about a page can put some of its alternative
  versions to the circle with it (the proposal form offers a page's open versions as ticks;
  `Proposal.versions`). Each is copied as it's put forward — its text with the page's changes up
  to then brought in, beside that text of the page — and opens from the proposal (**Versions put
  forward with it**) side by side with the page as it was then. When its author changes it, the
  proposal says **changed since**, with **Use the current version**. While the proposal waits, the
  version can't be made the page directly, and the page lists it as "(put to a meeting)".
  Recording consent then asks **Which version of “…” did the meeting consent to?** — the page as
  proposed, or one of the versions (the API refuses consent without an answer; `consent.chosen`).
  The chosen version becomes the page first (with any changes to the page since brought in, its
  words winning where both changed a passage; the page's history keeps the text before), and
  consent is to the page as it then is, so it reads **Consented**; the others are set aside, and
  each author is told what became of theirs. Withdrawing the consent opens the versions again (the
  page keeps its text). Exports list the versions put forward and which was consented.
- **Snapshots** (`lib/proposals/snapshots.ts`) – each document a proposal is about is copied when
  it's attached, so what's proposed — and then consented — is the document as it was then,
  whatever happens to it after: a page's title and text, a file itself (copied within storage), a
  link's text (a shared Google file's, read then). Under each document a proposal shows **Snapshot
  from Oct 8, 2026** — a page's or link's opens at `/proposals/<id>/snapshots/<snapshotId>`, a
  file's as the file — and **changed since** once the page is saved again or the file has a newer
  version. The snapshot's page says whether the document has changed since; for a page,
  **Show what's changed** compares them block by block (what's been taken out, struck through, and
  put in). While the proposal waits for consent, whoever may change it can **Use the current
  version** (a new snapshot replaces the old); a page edited since it was proposed says so under its
  title ("Edited since it was proposed"), with **Propose this version** for the circle's members.
  A document taken off a proposal takes its snapshot with it, and deleting a proposal deletes its
  snapshots; a consented proposal's are kept for good — even once the documents are deleted (the
  proposal still lists them, "no longer in Documents", with their snapshots). Everyone can see
  every snapshot, as with the documents. Proposals from before snapshots get
  them when they're next changed or consented.
- **Consent is given at a meeting** (`canRecordConsent` in `lib/circles/consent.ts`: anyone in the
  circle, anyone on the Board — for any circle — and admins; the Board records Community's).
  - **In a meeting's notes** (a page with a meeting day — set with **Who's present** — kept by
    the circle): a **Proposals** box under the title lists those consented at this meeting and
    those still waiting for the circle's consent, each with **Consent**; a proposal card in the
    notes has **Consent at this meeting**. Consenting there records the meeting, who was there
    (from the notes; asked for first if they don't say yet, and saved to them), the circle, and
    who recorded it, with an optional note ("with the amendment that…").
  - **Anywhere else** — a proposal's page or card, a page's or file's **Record consent** — asks
    **at which meeting**: the circle's notes and minutes with a date (files with a meeting date
    count, and then who was there is asked for), the latest first, or **a meeting with no notes
    here yet** (its day and who was there; notes named for the circle and the day are started for
    it). A page or file with no open proposal gets one made for it there and then.
  - Each person present is recorded as a member of the circle or not (guests and other residents),
    shown as "Present: Cara Cedar and Dev Dogwood · also there: Sam (guest)". The documents a
    proposal is about are consented **as proposed** — at their snapshots' versions. When one has
    changed since its snapshot, the consent dialog says so and asks whether the circle consented to
    it **as proposed** or **as it is now** (a new snapshot is taken first; a page's **Consent to this
    version** starts at that). A page edited (or a file given a new version) after the version
    consented shows **Changed since consent** until a new proposal is consented. **Withdraw
    consent** (for a record made by mistake) puts the proposal back to waiting.
  - Pages and files show their stage — a pill under a page's title (**Draft**, **Proposed** — the
    day to decide — or **Consented**, with a link to the proposal), a badge on a file — and the
    record: "Consented Oct 8, 2026 at Land Care Circle meeting, Oct 8, 2026 by Cara Cedar and Dev
    Dogwood · recorded by Dev Dogwood". They keep a copy of where their proposals stand (`proposal`
    and `consent`, each with its `proposalId`), so lists and filters read the document alone.
    Records from before proposals (consent recorded on a page or file with a date and who
    consented, without a meeting) still show and can be withdrawn; new ones can't be made that way
    (`PUT /api/documents/<id>/consent` answers 410).
  - The Documents list's stage filter (**Proposed**, **Consented**) covers pages, files, and
    proposals; search finds proposals by their words (and site search lists them); an
    Filtered Documents module on a circle page can show **Proposals waiting for consent**; the
    dashboard's **Waiting for consent** card lists the open proposals of the circles you're in —
    and Community's — when there are any ("And N more" opens `/documents?stage=proposed`).
  - API: `GET`/`POST /api/proposals` (list — `circle`, `status`, `q` — or put one to a circle; with
    `consent`, consented at once), `GET`/`PATCH`/`DELETE /api/proposals/<id>` (`status`:
    "withdrawn" or "proposed"), `POST`/`DELETE /api/proposals/<id>/consent` (`meeting`: `{kind:
"page"|"file", id}` or `{kind: "new", date}`; `present` when the notes don't say; `note`;
    `current: true` to consent to the documents as they are now), `POST
/api/proposals/<id>/snapshots` (`{kind, id}`: use the current version), `GET
/api/proposals/<id>/snapshots/<snapshotId>` (the snapshot, its copy, and the document now) and
    `…/file` (a file's copy), `GET /api/proposals/meetings?circle=`. Stored in
    `proposals/proposals.json`, the snapshots' copies as `proposals/snapshots/<snapshotId>.json` (a
    page's or link's) and `proposals/snapshots/<snapshotId>` (a file's); when a circle is deleted
    its proposals not yet consented go to the Board.
- **Written pages** (the wiki) – one wiki for all of CVC, its pages listed in Documents. Every
  resident can see every published page. Every page has a **parent circle**, and its own setting
  for **who can edit it** (nothing is inherited) — its parent circle (the default; anyone, for
  Community's pages) or any resident. Pages can sit **inside one another**, as in Outline: a
  page's `parentId` names a page of the same circle, and `order` its place among its siblings (a
  fractional index from `lib/wiki/tree.ts`, so one move rewrites one page; a page never moved yet
  sorts after the ordered ones, by title). A page goes only inside a page its own circle keeps,
  never inside itself or one of its own pages (`movePage`, `PATCH …/pages/<slug>` with
  `parentId`/`order`: whoever looks after the page); a new keeper takes the pages inside along and
  lifts the page to the new circle's top level; the trash takes a page's branch along and brings
  it back with it (`withPage` in `wiki/trash.json`). A page can have an **emoji** (`icon`) and be
  shown **full width** (`fullWidth`), both settings rather than versions. A page started as a
  **draft** (`draft: { by }`) is seen only by its author and admins — in lists, search, the map,
  the documents list, exports, assistants' tools and the residents' backup alike
  (`visiblePages`/`canSeePage` in `lib/wiki/access.ts` is the one gate) — until it's published
  (`POST …/pages/<slug>/publish`: its author, or whoever looks after it; those it mentions are told
  then). The parent circle's members (and the Board and admins, who can always
  edit everything) change the parent circle and that setting, and can delete the page — which
  moves it to the **trash** (`/documents/trash`, linked from Documents and its menu;
  `wiki/trash.json`, `lib/wiki/trash.ts`) for 30 days, its history, comments and alternative
  versions kept with it: whoever could delete it can **Restore** it (as "Title (restored)" at a
  new address if another page took its title meanwhile; to the Board if its circle is gone), and
  admins can **Delete forever**. Pages past their 30 days are forgotten, with their history,
  comments and versions, whenever the trash is next read or changed (there's no scheduled job). A page
  moves only to a circle you're in (the Board and admins: any), and the server holds to that
  (`canMoveTo` in `GET /api/wiki/pages/<slug>`; a 403 otherwise). Choosing one you're not in
  says you need to join it first and offers the best way in: **Join and move it** (a circle anyone
  can join), **Ask to join** (one whose members approve, with a note to them; the page stays put
  until one says yes), or that your request is already waiting. (Pages once set to be seen only
  by some circles, before every page was open to all, are seen by everyone now; that old setting
  only keeps them out of welcome links.) A page reads clean: its **Edit** button opens the editor,
  where the page's tools live — **Parent circle**, **Who can edit**, and **History**. **History**
  (also beside Edit while reading, for everyone) lists the edits that made the page, newest
  first, who made each and when; each shows **What changed** (taken out, put in), the page
  **Before** it, or that **Compared with now**, side by side, and its editors can **Restore** the
  page as it was before any edit (`components/wiki/page-history.tsx`). Pages don't nest: they connect by **links** and **embeds** (each page lists what's
  **Linked from** it). Documents lists every page, with a search and a filter by
  circle (`/documents?circle=<circleId>`); **New → Write a page** asks which of your circles keeps it. A circle's
  Filtered Documents module's **Add a page** starts a page with that circle as its parent (so it
  shows in the module); **@ new
  page** (and a link to a page that doesn't exist yet) starts a page kept by the same circle as the
  page it was started from. **Typing /** at the start of a line (or after a space) offers what to put
  there — headings, lists, a to-do list, a quote, a callout, a collapsible section, a table, a
  divider, a photo, a page, and (in a page, not a version) a poll, a proposal, a file and who's
  present — narrowed as you type (`components/wiki/slash-menu.tsx`). Pages are Markdown, edited in a **visual editor**
  ([TipTap](https://tiptap.dev), on ProseMirror) with a simple toolbar: headings, quotes and
  callouts, bold/italic, highlights, lists and **to-do lists** (items with boxes, `- [ ]`; ticked
  off right on the page while reading by anyone who can edit it — saved to the page's text, a run
  of ticks one version, and checked to be the same item first: `POST /api/wiki/pages/<slug>/todo`,
  `lib/wiki/todos.ts`; others see the boxes but can't tick them, nor those of an embedded page),
  links, photos, tables (with their own
  add/delete tools while the cursor is in one, and **columns dragged to a width** by the edge
  between them — kept with the page as a `::columns{widths="30,70"}` line before the table, each
  column's share in percent, and drawn so when reading; `lib/wiki/tables.ts`), collapsible
  sections, embedded pages, and
  **polls**; Markdown shortcuts work as you type, Ctrl/⌘+K adds a link, and photos can be pasted or
  dropped in. `lib/wiki/prose.ts` turns a page's Markdown into the editor's document and back with
  the same Markdown writer and settings as before, so saved pages keep their spelling; what the
  editor can't show (HTML, footnotes, other directives) is kept as written, in a dashed box. **Typing @** offers residents whose names match first — **mentioning** one puts
  an "@Ada Ash" chip in the page (written `:person[Ada Ash]{#<personId>}`, linking to their
  directory entry; plain "@Ada Ash" in excerpts, headings and search), and they're told once per
  page (`lib/wiki/mentions.ts`, `wiki/mentions.json`; the **mentions** topic, by push and email) —
  then pages and documents, linking the one you pick — or, for a new title, a new page
  (`GET /api/wiki/link-search`). **Follow** on a page (whoever starts one follows it) tells you
  when it changes: when someone finishes editing it, restores an earlier version, or makes a
  version the page — at most once an hour a page, never about your own change
  (`lib/wiki/follows.ts`, `wiki/follows.json`; the **following** topic: push, and email only if
  chosen). Your profile's **App & notifications** lists **Pages you follow**, each with
  **Unfollow** (`GET /api/me/follows`, `PUT /api/wiki/pages/<slug>/follow`). The toolbar's one
  **Link** menu offers **Web address…** (a link on the selected words), **A page or document…**
  (find a page or an uploaded file; a page can be linked or shown here, a file is linked), and
  **Upload a file…** (into the parent circle's documents, then linked). **Links**
  show as **tags**; they're written `[[Page title]]` (titles are unique across the wiki; an older
  `[[O&M:Page title]]` still works) and `[[doc:Document title]]` (`[[doc:O&M:Document title]]` for
  one circle's); any of them takes `|shown text`. **Renaming a page updates the links and embeds
  that point to it.** **Embeds** (`::embed{page="Title" section="Heading"}`) show another page, or
  one section of it, inline and always current, labelled with the circle that keeps it; the
  toolbar's **Link** menu (**A page or document…**) adds one, or just a link to the page. Changes
  **save as you type**, and several people can edit at once (others' saves merge in paragraph by
  paragraph). Each page keeps its last 25 versions (`wiki/history/<pageId>.json`), and its address
  when renamed. Pages are stored together in `wiki/pages.json` (`/api/wiki/pages`,
  `/api/wiki/pages/<slug>`). Until October 2026 each circle had its own wiki
  (`wiki/<circleId>.json`); the first read brought them together (keeping each page's old address,
  `/circles/<id>/wiki/<slug>`, as a redirect) and left the old documents untouched.
- **Alternative versions** (`lib/wiki/perspectives.ts`; "perspectives" in the code) – any
  resident can write their own version of a page: **Write your own version** under its title makes
  a copy of the page that only they (and admins) change, in the same visual editor (without polls,
  proposals, or the meeting tools), saved as they type. Under the page's title its versions are
  listed by name ("Eve's version · Mow twice a month in June", "(draft)" until shared), and those
  no longer worked on behind "N earlier ones". A version's page (`/wiki/<slug>/versions/<id>`)
  compares it with the page **side by side** (paragraphs lined up; each changed paragraph beside
  the one most like it), as one column of **Changes**, or on its own, and **Compare with** sets it
  against another version. Its author **Shares** it with the page's circle (its members and the
  page's writers are told, once — the "proposals" setting) or **Withdraws** it. If the page is
  edited meanwhile, the version shows what it would change on the page as it is now (the page's
  changes merged in, paragraph by paragraph), and where both changed the same passage it says so;
  its author can **Bring in the page's changes** for good. The page's editors can **Make this the
  page** (unless it clashes with the page's changes, or a meeting is to decide): the page becomes
  that text as a new version, its history keeps what it replaced, and the author is told.
  **Put to a meeting** (for whoever can put proposals to the page's circle) starts a proposal about
  the page with that version — and the page's other versions can be ticked too; see Proposals.
  Versions are kept for the record (consented, made the page, set aside, withdrawn), up to 20 open
  per page and 60 in all; a meeting's notes can't have them, and deleting a page deletes them. Photos added while writing one are kept with the page's
  circle's photos. Stored per page in `wiki/perspectives/<pageId>.json`
  (`/api/wiki/pages/<slug>/perspectives`).
- **Polls** live in wiki pages: the editor's poll button asks a question with 2–10 options, one
  choice or several, an optional closing date, optionally letting voters add their own options, and
  — outside Community — optionally for the page's parent circle's members only (everyone sees the results). It's
  placed in the page as `::poll{id="…"}`. Residents vote, change or take back their vote while it's
  open; results show once you've voted, when it's closed, or on "See results". Its author, admins,
  and (outside Community) its circle's members close and reopen it. A poll is announced when the page
  holding it is first saved (the "polls" notification setting; just the members, for a
  members-only poll). Stored together in `wiki/polls.json` (`/api/wiki/polls`), each with its
  circle. Circles no longer have a separate Polls section, and the forum no longer has polls.
- **Tasks** – each circle can also track tasks (`/circles/<id>/tasks`), another section it can turn
  on or off (by adding or removing its Tasks modules under **Edit**). A circle can have **several
  Tasks modules, each its own view**: its **Settings** give it a title and say which tasks it
  shows — _Open_, _Done_ or _All_; everyone's, each reader's own, nobody's yet, or one member's;
  due any time, overdue, or within 7 or 30 days (overdue included); high priority only; repeating
  only — say an
  "Overdue" list beside the usual one, or "Done lately". They also say **who can add tasks** (for
  all the circle's task lists): the circle's members (and the Board and admins; the
  default) or **any resident** — who can then also change and delete the tasks they added. A task has a title, Markdown details
  (wiki and document links work), a status (_To do_, _In progress_, _Blocked_, _Done_), an owner
  — anyone in the directory (the circle's members listed first), **a role**, or **a whole group**
  — a due date, a priority, a
  checklist whose progress shows as a bar, and whether it **repeats** — weekly, monthly, every 3
  months or yearly. When a repeating task is done, the next one is made at once (once): the same
  title, details, owner and priority, not started, its checklist unticked, due a period after this
  one was due (the first such date not already past; a month on from the 31st is the month's last
  day), and the done task says which is next (`nextOccurrence` in `lib/tasks/shared.ts`). The board has a column per status (stacked on phones):
  drag a card to move it, or use its status menu; filter to _Mine_ or _Unassigned_, or find one by
  title or number. Each task has its own page (`/circles/<id>/tasks/<number>`) with a log of what's
  happened to it and **nested comments** — reply to any comment, fold a conversation away, link to
  one comment; a deleted comment with replies stays as "deleted" so the replies still make sense.
  The circle's members, the Board, and admins (anyone, for Community) add and change tasks; a task's
  owner moves it along (status and checklist) or hands it back; anyone can take on an unowned task
  (**I'll take it**) and comment. Push
  notifications (topic _tasks_): a task given to you (or to a role or group you're in), a task you
  added being done, and comments on tasks you own, added, or are replying in. Stored as
  `tasks/<circleId>.json` and `task-comments/<circleId>.json`.
  - **Roles and groups** – a task can be given to a **role** — a seat position in a circle, such
    as Land Care's _Trash Master_ (given on the circle's Members, **Edit role**) — or to a whole
    **group**: everyone in a circle or sub group (not Community, which has no members). The owner
    list offers this circle's roles first (each with who holds it now), its members, every group,
    then roles in other circles and everyone else. Whoever holds the role now has the task: it's
    in their **Mine** lists and on their dashboard ("as Trash Master"), they can move it along,
    and they're told when it's given; nobody can take on a role's task with **I'll take it**, and
    it's never "unassigned". When a role's task is done it keeps who held the role then (the one
    who marked it done, if they hold it), and a repeating one's next occurrence is the role's
    again — so a yearly _Refuse education_ given to the Trash Master is next year's Trash
    Master's, while this year's stays credited to this year's (`lib/tasks/roles.ts`: `taskHolders`,
    `holderAtCompletion`; stored as `ownerRole: {circleId, position}`, `position: null` for a
    group; the API serves each task with `holders`). A role is matched by name, whatever its case;
    if nobody holds it any more the task says so and waits for the next holder.
  - **The Tasks page** (`/tasks`, **Tasks** in the header) – every circle's tasks in one place:
    everyone's, **Mine** (yours and your roles' and groups') or **Unassigned**; _Open_, _Done_ or
    _All_; **Repeating only**; one circle **with its sub groups** (or without), Community covering
    them all; and a search across titles, circles and people. Tasks are listed by circle in the
    circles' tree order, sub groups under theirs ("Land Care Circle › Hedge Team"), most urgent
    first. The choices are in the address (`?whose=mine&show=done&repeating=1&circle=lcc&subs=0`),
    so a view can be shared; the dashboard's **Your tasks** links to `?whose=mine`, and each board
    to its circle's (`GET /api/tasks`).
  - **Task button** (a module, as many as a circle likes) – one press makes a task for a role or a
    group: its **Settings** say what the button says ("Report a trash problem"), the task it makes
    ("Trash problem") and who it's for. Any resident presses it and can add a note, which becomes
    the task's description; the task goes on the board of the role's or group's circle (which
    needs its tasks on), and its holders are told (`POST /api/circles/<id>/task-button`, which
    reads the button's saved settings, never the press's). A button only makes tasks for circles
    its editor looks after (admins, any).
- **Wiki photos** – a wiki's editors add photos to its pages: the visual editor's picture button,
  pasting or dropping a photo into either editor, or **Insert photo** in Markdown mode. Photos are
  downscaled in the browser (longest side 2000px, re-encoded as JPEG, which drops location data;
  a small PNG such as a screenshot goes as it is), up to 3 MB, and stored privately
  (`wiki-images/<circleId>/<id>`, served to signed-in residents at
  `/api/circles/<id>/wiki/images/<id>`). Pages show them inline, opening full size when clicked;
  images from other websites show only as their description.
- **Highlights** – select words in the editor and choose a colour from the highlighter in the
  toolbar or the right-click menu (yellow, green, blue, pink, or orange); while the cursor is in
  highlighted words, their colours and an eraser show just above them. They're drawn like a
  highlighter pen and kept in the page as `:mark[the words]{color="green"}`. (Pages used to have a
  colour of their own, and to be **pinned** to circles, the dashboard, people, tasks, documents, and
  discussions; pinning has been removed. The old `pins.json` is left in storage, unused.)
- **Styles** – the editor's **Style** menu turns the block the cursor is in (or the selected
  blocks) into a Paragraph, a **Quote** (shown between two curved strokes, like parentheses), a
  **Callout** (set apart by a light green dotted line with rounded corners; written
  `:::callout` … `:::`, keeping bold and italic), or a heading.
- **AI assistants (MCP)** – its own page, `/mcp` (`/ai` and `/MCP` redirect there; **AI assistants** in
  the menu under your name, and a search result): what an assistant can and can't do, step-by-step
  instructions for Claude (web, phone, desktop), ChatGPT, Claude Code and anything else that
  speaks MCP, the tools it gets, and your keys (`components/ai/ai-page.tsx`, `ai-keys.tsx`).
  There, make a **key** for an AI assistant you use — Claude, ChatGPT, Claude Code, anything that
  speaks the Model Context Protocol — and it can search CVC and read its pages (as Markdown) and
  documents (their extracted text) as you: only what any resident sees. The server is
  `POST /api/mcp` (MCP over plain HTTP, JSON-RPC, no streaming; `lib/mcp/server.ts`) with the key
  as `Authorization: Bearer …` or `?key=…` (for Claude.ai's custom connectors, which take an
  address); tools: `search`, `list_circles`, `list_pages`, `read_page`, `list_documents`,
  `read_document`. A key only reads unless **Let it also write** is ticked when it's made: a key
  that can write (marked **Can write** in the list; `scope` in `mcp/keys.json`) also gets
  `create_page` (optionally `parent`, a page to start it inside, and `draft`), `update_page` (with `baseUpdatedAt` from `read_page`, so an edit made meanwhile
  is handed back to merge rather than overwritten), `move_page`, `delete_page` (to the trash),
  `list_document_types`, `add_link`, `add_file` (base64, up to 3 MB; a new version with
  `replaces`), `update_document`, `delete_document` and `add_image` (a picture for a page you can
  edit, base64, up to 3 MB, kept with its circle's photos; it answers with the `![…](…)` to put in
  the page with `update_page`) — each run as the resident's own account
  through the app's stores and rules (`lib/mcp/writes.ts`: the same permission checks, refusals
  and side effects as the routes — following, mentions, followers told, documents announced), so
  the assistant can do only what they could, and every change shows under their name. A key is
  shown once (with the address for Claude.ai and ChatGPT and the `claude mcp add` command for
  Claude Code); only its hash is kept (`mcp/keys.json`, up to five a resident, with when each was
  last used); **Take away** shuts that assistant out at once.
- **Put CVC on your home screen** – the bottom of the phone menu (☰) folds out plain, large-print
  steps for adding CVC to the home screen as an app (`components/layout/install-help.tsx`): an
  **Install CVC now** button where the browser offers one, Safari's Share → **Add to Home Screen**
  on an iPhone, or the browser's menu → **Add to Home screen** elsewhere. Only phones see it
  (`isPhone` in `components/notifications/pwa.ts`: a phone's browser, or a touch screen as narrow
  as one), and only until CVC is installed there; laptops and tablets never do.
- **Right-click menu** – in the editor, right-clicking offers cut, copy, paste, bold, italic,
  strikethrough, code, highlight (or, inside a highlight, change its colour or remove it), link,
  **Link to a page…** (the selected words become a link to a page you pick — this circle's first —
  or to a new page named after what you type, started when the page is saved and kept by its
  circle; written `[[Title|words]]`), and clear formatting. Shift + right-click opens the browser's
  own menu, for spelling suggestions.
- **Find and replace** – in the editor (pages, alternative versions, Custom Text modules), the
  toolbar's magnifier, Ctrl/⌘+F, or Ctrl+H (⌘⇧H) opens a find bar under the toolbar. Every match
  is marked as you type, the current one more strongly, with "2 of 5", ↑ ↓ (or Enter and
  Shift+Enter) to move between them, and **Match case**; words in bold or a link are found like
  any others. **Replace…** adds **Replace with**: **Replace** changes the current match (keeping
  its formatting) and moves to the next, **Replace all** changes every one in a single step that
  one Undo takes back. Words selected in the text are what it looks for; Esc closes it, leaving
  the cursor on the match you were at (`components/wiki/editor-find.ts`, `find-bar.tsx`;
  `lib/wiki/find.ts`). Spreadsheets have their own search, in their toolbar.
- **Wiki map** (the **Map** button at the top of `/wiki`, for everyone — each sees only the pages they can) –
  **Islands**: each circle is a soft island (in its own colour) holding the pages it keeps; a sub
  group is a smaller, dashed island inside its parent's, in the parent's colour (and indented
  under it in the Circles list); documents aren't shown. Links arc between them. Hovering shows just a name; clicking anything opens a **panel** (docked on the
  right; a sheet along the bottom on phones) with its opening lines, who last edited it, what it
  links to and from — each clickable — plus **Open**, **Zoom to**, and
  **Show connections** (fading everything else). Clicking a circle also zooms in. **Find** zooms to
  anything. Built from `GET /api/wiki/graph` (`/documents?map=1`;
  `/admin/wiki-map` redirects there).
- **Wiki comments** – every page has a **Comments** section beside it — while reading it and
  while editing it (below the page on phones) — whose **Add a comment on this page…** box takes a
  comment on the page as a whole. While reading, anyone signed in can also select words on the page
  (any amount, a word to the whole page) and comment on them. Comments show as square yellow sticky
  notes (writers by their initials, their name on hover; reply, edit and delete appear when the
  pointer is over a note); a passage's is highlighted on the page (clicking either jumps to the
  other) and, while editing, quoted on its note. While reading, "On this page" shows the section you're in in bold.
  Threads take replies and can be resolved and reopened by whoever started them, the page's editors,
  or an admin; authors edit and delete their own (admins any). The page's writers and the thread's
  participants are notified (the "wiki" notification setting). Stored page by page in
  `wiki/comments/<pageId>.json`; a page's comments go with it.
- **A circle's page** – is built from **modules**: **Filtered Documents** and **Custom Text** (as many of
  each as the circle likes),
  **Members** (not on Community, which is everyone), the **duty schedule** where
  there is one, **Tasks** (as many as the circle likes, each its own view), **Task button** (as many
  as it likes), **Forum** (see Circle forums), **Documents**, and **Sub groups** (each of those once). **Log** and **Finances** modules
  aren't offered any more; a circle that already has one keeps it until it's removed. The
  **Alert** is the Safety Crew's — any circle with "safety" in its name — and is always on its page
  (`isSafetyCrew` in `lib/circles/ids.ts`, `modulesFor`), so nobody adds or removes it. One **Edit** button (the
  circle's members, the Board, and admins) edits the whole circle at once: its name and description
  in place (and, for the Board, whether it's a social club), its icon (**Upload icon** / **Change
  icon**, saved as soon as it's chosen), **Delete circle** (the Board), and its page — it adds
  modules (**Add module**), removes them, drags them into order — or moves them
  with arrows, on phones — and sizes each to a third, half, two thirds, or the full width of wider
  screens, in rows (the last module of a row widens to fill it, so there are no holes); phones
  stack them. **Members** always has its own column on the right (after the rest, on phones), so
  a long list of members never pushes the other modules apart. **Save** sends the details and the page together in one request
  (only what changed); **Cancel** drops it all. Everyone sees the circle's page as it was saved
  (stored on the circle as `modules`). Each reader can fold any module away with the arrow by its title,
  remembered on their device.
  - A **Custom Text module** holds the circle's own words, written in its **Settings** with the
    wiki's visual editor (headings, quotes and callouts, bold, italic and highlights, lists and
    checklists, links, tables, collapsible sections, dividers) under a heading of its choosing, on
    a background it picks (white unless it chooses mint, yellow, peach, pink, lavender or blue), and
    shown formatted as on the wiki. It's saved with the page (`module.text.body`, Markdown, up to
    20,000 characters; `module.text.background`); for anything longer, write a page and show it with a Filtered Documents module.
  - A **Filtered Documents module** (called Information until October 2026; its type is still
    `information`) shows documents that match certain criteria. It has a title ("Filtered
    Documents" unless given one) and **Settings**: which pages it shows — **Specific pages** (up
    to 12, searched by title, shown in the order chosen), **All pages of a circle** (any circle, by
    title), **Proposals waiting for consent**, or **Recently edited** (3–12, from one circle or
    the whole wiki, newest first) — in what order (**Sort by**: by title, last edited first, by
    meeting date latest first, or — for chosen pages — in the order chosen; each filter has its
    own default, kept unset; `lib/circles/info-sort.ts`) — and how: **Full**, **Summary** (cards
    with their opening lines; the first six, then **+N more**), or **Titles only**. A module listing this circle's
    own pages has **Add a page** for whoever can start pages for the circle.
  - Removing **Tasks** or **Documents** turns them off for the circle (its existing tasks and
    documents are kept, and return when the module is added back). With Documents off, no new
    documents can be added; its existing ones stay searchable. Removing **Finances** keeps the
    circle's expenses, budgets, and receipts, out of reach (its API answers 404); as the module is
    no longer offered, they stay out of reach.
  - A circle that hasn't saved its page yet shows what it had before: a Filtered Documents module with
    all of its own pages, Members, its duty schedule, and Tasks and Documents unless they
    were turned off (from the older `layout`, `features`, and `infoView`).
- **Bulk upload** – on `/documents`, **Upload documents** takes up to 50 files at once for one circle,
  chosen from a dropdown of the circles you can add to (your own; every circle for the Board and
  admins). On a circle's own page, **Add documents** does the same for that circle (no dropdown);
  a single file works the same way, and a description can be added afterwards with Edit.
  **Add them as** offers **Wiki pages (recommended)**, the default — each Word file, PDF, slide
  deck or text file is uploaded and then turned into a page (as **Turn into a page** does), shown
  as "now a page" — or **Files as they are**. Spreadsheets, images, files with no text, and any
  whose title another page already has stay files, saying why. The editor's **Link → Upload a
  file…** offers the same choice for one file (**A wiki page** / **The file as it is**) and links
  the page or the file.
- **Filtering and sorting** – document lists filter by circle (on `/documents`), type, year (on
  `/documents`), and stage (Proposed or Consented), and sort by newest (the default), oldest, title, or recently
  updated (best match while searching); **Clear** resets them (`GET /api/documents?sort=…&year=…`). Each file gets an editable title (from its name), type, and meeting date (filled in
  when the name has one, like `2024-03-12`); they upload one after another, and failures can be retried.
  The circle's members, the Board, and admins add documents (PDF, Word, Excel, PowerPoint, text,
  or images, up to 50 MB) with a title, one of the circle's document types, an optional meeting date,
  and a description. Each circle edits its own list of types (**Edit types** on the Documents page,
  for the circle the list is filtered to — or, for the Board and admins, any circle chosen there:
  rename, reorder, add, remove), starting from Minutes, Agenda, Policy, Budget, Report, and Other; renaming a type
  relabels its documents, and removing one leaves existing documents with their old type. Stored in
  `documents/types.json`. Every signed-in resident can see and download every
  document. Whoever uploaded one, the circle, the Board, and admins can edit its details, upload a
  new version (earlier versions are kept and downloadable), or delete it. If a circle is deleted,
  its documents move to the Board.
- **Search** (`/documents`, and on each circle's page) matches every word of the query — or a
  "quoted phrase" — in titles, descriptions, and the documents' own text, best matches first, with
  the matching passage shown, and can be narrowed by circle and type. Text is read on upload from PDFs, Word, Excel, and PowerPoint files
  and text files; scanned PDFs, images, and older .doc/.xls/.ppt files are found by their details.
  On `/documents` (with no circle or type chosen) the search also covers the forum — discussion
  titles, posts, and replies — listing matching discussions below the documents with the post that
  matched; each opens at that reply (`GET /api/forum/search?q=`).
- **Storage** – files live in R2 (`documents/files/<id>/v<n>`), details in `documents/index.json`,
  and the searchable text of each current version in `documents/text.json`. Uploads travel in 4 MB
  pieces (under Vercel's request limit) and are reassembled and checked by their contents on the
  server; downloads use five-minute signed R2 links, so size isn't limited. Nothing is public.

## Circles

Circles are managed in the app (`circles/circles.json`). The store is seeded once from the imported
sheet — members only, dropping the sheet's empty placeholder seats — and is the source of truth
from then on, so re-importing the directory never overwrites circle changes.

- **Community circle** – a built-in circle (`community`) for everyone at CVC, shown across the top
  of `/circles` at double width. It has no member list and can't be joined, left, or deleted; any
  resident can add its documents and information (and polls in it). The Board and admins edit the
  circle's details and icon.
- `/circles` lists the Community circle, then **Circles** (the official, sociocratically formed
  ones), then **Social Clubs** (e.g. the Chicken Tenders), each with name, member count, and
  description. Any resident can start a social club and becomes its first member; the Board and
  admins can also form official circles, and switch a circle between the two when editing its
  details (`kind: "club"`; unset means an official circle).
- **Sub groups** – smaller groups within a circle (a hedge team within Land Care), each a circle
  of its own: its own members (anyone can join, or its members approve), page, modules, and icon.
  A circle's **Sub groups** module lists them, and its members (and the Board) start one with
  **New sub group** — of the circle's kind, its founder its first member. They're one level deep
  (a sub group has none of its own; nor can the Board be one). Every circle is also shown
  **within Community**, the root: `/circles` sets the circles and clubs in beneath Community's
  card, Community's page lists them (a built-in **Circles within Community** module), each
  circle's page starts its breadcrumb at Community ("Community › Land Care Circle › sub group"),
  the Circles menus list Community first, and the documents sidebar and the Tasks page nest sub
  groups in their circles (`circleTree`, `circlePath`, `circlesWithin` in `lib/circles/tiers.ts`).
  That's only how they're shown: nothing is stored as Community's, and since Community has no
  members it gives nobody rights over the circles within it. The circle's
  members manage its sub groups as the Board manages every circle — editing, members, documents,
  consent (`managesCircle` in `lib/circles/tiers.ts`, behind `canManageCircle`) — and can delete
  one, whose documents, pages, and open proposals then go to the circle rather than the Board;
  deleting a circle makes its sub groups circles of their own. On `/circles` a circle's card
  opens out to its sub groups (they have no cards of their own); in the header's **Circles** menu,
  pointing at a circle (or its arrow, or →) shows them in a tier beside it; the phone menu (☰)
  keeps Circles' and Documents' own links folded behind a chevron on their rows until it's
  pressed, and sub groups folded under their circle behind a button saying how many (so the menu
  opens short); and
  a sub group's page says whose it is, and goes back there. Lists of
  circles to choose from name them "Land Care Circle › Hedge Team". Stored as `parentId` on the
  circle (`POST /api/circles` with `parentId`), set when it's started and never moved (an update
  can't name a parent).
- **Emailing a circle** – the envelope on each circle's card (and in its members panel) asks
  whether to email the whole circle or only certain roles (op leader, secretary, …), then opens
  your mail app with their directory addresses (leaving you out), or copies them. Members with no
  email on file are named so they can be reached another way.
- **Joining** – each circle chooses who can join: anyone (a **Join circle** button) or by
  application (**Apply to join**, with an optional note), which its members, the Board, or an admin
  approve or decline. Circles default to applications. Members are notified of new applications
  and applicants of the answer (the "circles" notification setting). Applications are visible only
  to the circle's members, the Board, and admins (`GET /api/circles/<id>/applications`), and not
  in `/api/directory`. Anyone can leave a circle or withdraw an application
  (`POST`/`DELETE /api/circles/<id>/join`).
- `/circles/<id>` is each circle's page, with its members in a side panel on the right (below the
  header on phones). Its members and the Board can edit its name, description, and who can join, add residents, change a member's role or term, remove members, and upload an
  icon. Only the Board can delete a circle, the Board itself can't be deleted, and the Board always
  keeps at least one member.
- **Duty schedules** – a circle can have a rotation (e.g. the Chicken Tenders' chicken and compost
  duty), shown on its page as a month calendar that continues indefinitely: today's and
  tomorrow's duty, your household's next turns, households with members' phone numbers (from
  the directory), and the duty instructions for the current season. Each weekday belongs to one
  household, or to several that alternate week by week. Households on the rotation, the circle's
  members, the Board, and admins can record a swap or cover for any day (or flag that it needs
  cover); the circle's members, the Board, and admins adjust it via "Edit rotation". Schedules are
  specific to the circles that need one — today only the Chicken Tenders — so there's no button to
  add one elsewhere; a new one is set up with `PUT /api/admin/schedules` (with `ADMIN_TOKEN`).
  Stored in `circles/schedules/<id>.json`.
  - **Printing** – **Print calendar** (anyone can) offers the twelve months from this one (in
    Vermont), the three after this month chosen to start with, and opens
    `/circles/<id>/schedule/print?months=2026-11,2026-12,2027-01` (up to twelve) in a new tab,
    which prints by itself: one month to a US Letter page, landscape, black and grey only, with
    who's on duty each day (swaps and cover included, nothing before the schedule starts). It's
    made to be photographed: a black square near each corner, the month in large type and a code
    such as `EGGS 2026-11`, and on every day a box the same size in the same place for that day's
    count. The app's header, footer and the page's toolbar aren't printed.
  - **The egg log** – what a schedule counts each day (`dailyCount`: "Eggs" unless **Edit
    rotation** names something else; left empty, there are no boxes, log, or photo reading). Each
    day's count shows in the calendar, with this month's total and average a day, last month's,
    the last twelve months, and **Download CSV** (`date,count,recorded by`). Anyone signed in sees
    them; whoever may change days records them — in a day's editor, or with **Record eggs**: a
    month typed in, or read from a photo. Counts are whole numbers from 0 to 500, for today and
    days gone by (`GET`/`PUT /api/circles/<id>/eggs` with `{ counts: { "2026-11-05": 12 }, photoId? }`
    — null clears a day; `?format=csv` for the CSV).
  - **Reading a photo** – **Take a photo of the calendar** (or choose one) resizes it to 2576 px
    on its long side and sends it to `POST /api/circles/<id>/eggs/read`, which keeps it and asks
    OpenAI (`gpt-5.6-sol` through the Responses API: the photo at full size, structured output,
    nothing kept by OpenAI) for the month and the number in each day's box
    (`lib/schedules/egg-reader.ts`, which describes the printed page). What was read comes back
    to be checked, never saved by itself: the month's boxes filled in under the photo, those it
    wasn't sure of marked, a count that differs from the one recorded saying what it was; **Save
    counts** sends the days that changed. Needs `OPENAI_KEY` — without it, counts are typed in.
    Locally, `EGG_READER_TEST=1` answers from `.data/egg-reader-fixture.json` instead of the API.
  - Stored in `circles/eggs/<circleId>.json` (each day's count, who recorded it, when, and
    whether from a photo; the newest 4000 days and the last 100 photos), the photos as
    `circles/eggs/<circleId>/photos/<id>.jpg`, shown to anyone signed in at
    `/api/circles/<id>/eggs/photos/<id>`.
- **Meeting notes** are written as pages in Documents (**New → Meeting notes**; there's no separate
  Meetings module; `/circles/<id>/meetings/…` leads to the circle and `…/proposals/<id>` to the
  proposal). Proposals to the circle are consented in them (see Documents → Consent is given at a
  meeting). In the page editor's toolbar:
  - **Who's present** (the people icon) – the meeting's day (which makes the page a meeting's
    notes), and the page's circle's members as chips to tick (**All members present**), plus **Add
    someone** for any other resident, or a guest by name. Saved as the page's `meetingDate` and
    `present`, shown under its title ("Meeting Oct 8, 2026 · Present: …"); it isn't a new version.
    Notes from before pages had a meeting day count as dated the day they were started.
  - **Add a proposal** (the handshake) – a new proposal, or one already waiting, put in the notes.
  - **Transcript** – only on a page someone adds it to: the toolbar's microphone is a toggle
    that adds it at the end of the page and starts recording (and, toggled off, removes it, asking
    first if it has words). There it's folded away like this: "Transcript · N words". While
    editing, its line has **Record** and **Pause**: what's said is written down by the browser's
    own speech recognition (Chrome, Edge, Safari — not Firefox; no account or key, no speaker
    labels; Chrome and Edge send the audio to Google or Microsoft to be recognised) while you keep
    taking notes in the page, and saved with the page as it comes (the page's `transcript`, not a
    new version, and searchable). Opened, it shows the whole transcript, with **Copy** and
    **Remove** while editing. Readers see the same folded line and can open it.
- **Log** – a circle module (no longer offered to add; circles that have one keep it) for short
  updates, each with replies: a small forum of the circle's
  own, kept apart from the Forum because it **never notifies or emails anyone**. Its **Settings**
  say who can post updates (the circle's members and the Board, or any resident); anyone signed in
  can reply. Updates show newest first, ten at a time (**Show older updates**). An update can
  name the people it involved — **Add people** picks residents, or takes anyone else's name — shown
  under it as **Involved:** (residents link to their entry); its author can **Add people** or
  **Edit people** later, and nobody named is notified. Authors edit and
  delete their own; the circle's members, the Board, and admins can delete any. Posting needs a
  Log module on the circle's page (`GET`/`POST /api/circles/<id>/log`,
  `PATCH`/`DELETE …/log/<entryId>`, with `people` alongside `body`; stored in
  `logs/<circleId>.json`, using the shared comment rules; deleted with the circle).
- **Alert** – the Safety Crew's module for raising the alarm (built in: any circle with "safety"
  in its name has it on its page, at the end, with no way to remove it, and it isn't offered to other
  circles; a circle an admin placed one on before keeps it): a red **Send an
  alert** button, and the alerts sent, newest first, each with who sent it and to whom. Any resident
  can send one: a short message ("what's happening, where, and what people should do"), to the
  circle's members (the default) or to **Everyone at CVC**. A confirmation says how many people it
  will reach before anything is sent. Each gets a push notification and an email (topic **Safety
  alerts**, on for both by default, which anyone can turn off under **App & notifications**) —
  members are emailed even if they've never signed in; the sender isn't. **Send an alert** is also
  at the bottom of the menu under your name, set apart by a line, on every page. Each person can send one alert a minute
  (`GET`/`POST /api/circles/<id>/alerts`; `lib/alerts`; the last 50 kept in
  `alerts/<circleId>.json`, deleted with the circle). Text messages aren't sent: CVC has no SMS
  provider (`lib/alerts/send.ts` is where one would go).
- **Finances** – a circle module (no longer offered to add; circles that have one keep it) that tracks the circle's spending
  against a budget for each year, with receipts. Its members, the Board, and admins (on Community,
  which has no members, just the Board and admins) **Add expense**, edit and delete them, **Set a
  budget**, and record who's been paid back. Its **Settings** say who can see it — **Everyone at
  CVC** (the default) or **The circle's members and the Board** (admins always can); the server
  reads that setting, so anyone else gets a 403 and the module just says who can see it. The
  Settings also set the budget for a year (an amount and an optional note; clearing the amount
  removes it), saved straight away rather than with the page.
  - The module shows a year at a time (the years with expenses or a budget, and this one):
    "Spent $1,234.56 of $2,000.00 for 2026" over a bar that turns amber past 90% and red over the
    budget (or "Spent $1,234.56 in 2026" and **Set a budget**), the year's totals by category, and
    **Owed** — what each person who paid out of their own pocket hasn't had back yet, from any
    year. Then the year's expenses, newest first: date, description, category, payee, who paid
    ("Owed to Ada Ash" until they're paid back, then "Reimbursed Oct 8"; or "Circle funds" —
    nobody to pay back), the amount (a refund or credit is negative, shown with its minus in
    green), and the receipt. Each row's parts sit in columns when the module is wide and stack into
    lines when it's narrow or on a phone (by the module's own width, so any module size works).
    **Download CSV** saves the year's expenses (`land-care-circle-expenses-2026.csv`: date,
    description, category, payee, paid by, amount, reimbursed on, receipt yes/no; oldest first,
    quoted where needed, text that could run as a spreadsheet formula defused).
  - An expense has a date (today in Vermont to start with; up to a year ahead), an amount typed
    as people do ("12", "12.5", "$1,234.56", "-3.00"; stored as whole cents, never $0, within
    $100,000 either way), a description, a category (suggesting the circle's own), a payee, who
    paid (the person adding it to start with, any resident or anyone by name, or the circle's
    funds), whether they've been reimbursed and when, and a receipt: **Take a photo** (on phones)
    or **Choose a file** — a photo, shrunk to JPEG in the browser, or a PDF up to 10 MB (one over
    4 MB is sent in pieces, as a request can't carry more). Receipts are served only to those who
    can see the module. Up to 5,000 expenses per circle. Nothing here notifies anyone or appears in
    search.
  - `GET /api/circles/<id>/finances?year=` (the year's budget, expenses, totals, categories, the
    years, `canEdit`, `view`), `POST …/finances/expenses`, `PATCH`/`DELETE …/expenses/<expenseId>`,
    `PUT`/`GET`/`DELETE …/expenses/<expenseId>/receipt` (the raw file as the body),
    `PUT …/finances/budget` (`{ year, amount | null, note }`), `GET …/finances/export?year=` —
    404 without a Finances module on the circle's page. Stored in `circles/finances/<circleId>.json`
    with receipts at `circles/finances/<circleId>/receipts/<expenseId>`; removing the module keeps
    them, and so does deleting the circle (money records aren't thrown away: a circle started again
    under the same name finds them).
- Icons are stored as binary objects (`circles/icons/<id>`, metadata in `circles/icons.json`) and
  served only to signed-in residents. In the directory, residents show the icons of their circles
  as badges linking to each circle's page.
- **New circles get an icon drawn for them** – right after a circle or club is created, the page
  asks `POST /api/circles/<id>/icon/generate`, which sends OpenAI's image model (`OPENAI_KEY`,
  `OPENAI_IMAGE_MODEL`, default `gpt-image-2.5-flare`) up to six of the other circles' icons as
  references with a prompt naming the new circle and its description, asking for a matching icon
  with no text — a round badge on a transparent background (`background: transparent`, PNG;
  `lib/circles/icon-generator.ts`). What comes back is then made round for certain: trimmed to the
  circle that fills it, everything outside transparent with a soft edge, and saved as a 256px PNG
  (`roundImage` in `lib/png.ts`, a small PNG reader and writer on Node's zlib). It takes about a
  minute: the circle's page shows **Drawing…** over its icon, and the icon appears when it's
  ready. Only a circle
  without an icon gets one, so an uploaded icon is never replaced; its members can change it as
  before. Without `OPENAI_KEY` nothing happens. Locally, `ICON_TEST_FAKE=1` skips OpenAI (it
  reuses a reference and records the prompt in `.data/icon-fake.json`).

## App & Notifications

- **Installable (PWA)** – `public/manifest.json`, icons in `public/icons/`, and a service worker
  (`public/sw.js`) make CVC installable: Chrome/Edge/Android offer "Install", and on iPhone it's
  Safari → Share → Add to Home Screen. The service worker caches nothing (every page needs a fresh,
  signed-in response); it exists for installing and for notifications. The manifest, service
  worker, and icons are served without sign-in, since browsers fetch them without cookies.
- **Push notifications** – residents turn them on per device under **App & notifications** on
  their profile (or from a one-time prompt on the dashboard, shown only in the installed app), and choose what to hear about: new
  discussions, replies in discussions they started or joined, appreciations, photos, new
  recommendations and comments on theirs, new loan-library items, and safety alerts. Nobody is notified about
  their own posts. On iPhone/iPad (iOS 16.4+), notifications work once CVC is on the home screen.
- Delivery uses standard Web Push (`web-push`). The VAPID key pair comes from `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` if set, otherwise it's generated once and kept in R2 (`push/vapid.json`) —
  don't delete it, or every device must turn notifications on again. `VAPID_SUBJECT` optionally
  sets the contact URL/mailto. Subscriptions live in `push/subscriptions.json` (expired ones are
  dropped automatically) and choices in `push/preferences.json`. Sending never blocks or breaks
  a post: it's capped at a few seconds and failures are only logged.
- **Email** – everything that sends a notification can also be emailed (`notify()` does both;
  `lib/email/`), through Brevo (or Resend when Brevo can't) from `EMAIL_FROM`, to the address in each resident's directory
  entry — including residents who have never signed in. Each resident picks what to be emailed
  about under **Email me about** on their profile; until they do, they get discussions, replies,
  circle requests, tasks, polls, and comments on their pages (not photos, appreciations,
  recommendations, the loan library, or documents). Nobody is emailed about their own posts, and
  a circle's Log never emails; circle forum messages and private messages are app notifications
  only (`PUSH_ONLY_TOPICS`), whatever was once saved. Every email links to the thing itself and has a **Stop them** link
  (and a one-click `List-Unsubscribe` header) that turns that topic off without signing in — a
  token signed with the app's secret. Choices live in `email/preferences.json`, by person id.
- **Test mode** – admins open **Email** in the account menu (`/admin/email`). Test mode starts
  **on**: only the addresses on its allowed list are emailed (subjects start "[Test]") and everyone
  else is counted as skipped. Admins add and remove allowed addresses, send a test email to one,
  and see recent sends (counts only; addresses only in test mode). Turning test mode off asks
  first; from then on new emails go to everyone who chose them — nothing earlier is re-sent.
  New member welcome emails from the Secretary page aren't held back by test mode — each goes to
  one address the Secretary typed, to someone not yet a resident — and are logged as "New member
  welcome", without the address.
  Settings in `email/settings.json`, the log (last 200) in `email/log.json`. Locally,
  `EMAIL_TEST_SINK=1` writes emails to `.data/email-sink.json` instead of sending them.
- **Two free senders**: every email goes through **Brevo** (300 a day free) while it has room and
  works, and otherwise through **Resend** (100 a day and 3,000 a month). An outage, a refused key
  or a used-up day at Brevo falls over to Resend (`sendEmails` in `lib/email/deliver.ts`). The app
  keeps count for each (`email/quota.json`; `BREVO_*_LIMIT` and `EMAIL_*_LIMIT` change the limits):
  sign-in links and welcomes come first; notification emails stop at 70% of the day. The admin
  page shows each sender's use today and this month, and which sender took each sending.
- **When a sender refuses**, its status, error code and message are kept with the sending in the
  admin **Recent sends** log (and the server log), and a failed sign-in email shows the status
  codes, e.g. `(brevo 401, resend 403)`. Common causes: Brevo **401** — the key is an SMTP key
  rather than an **API key** (`xkeysib-…`), or Brevo's **Authorised IPs** blocks Vercel's changing
  addresses (Security → Authorised IPs → turn the blocking off); Brevo **400** — the sender
  (`notifications@commonpasturesvt.org`) or its domain isn't verified there; Resend **403** — the
  domain isn't verified, or the key can't send.
- **Unsubscribe links** ask first (GET shows a button; POST — the button or a mail app's one-click
  — acts), so link scanners can't unsubscribe anyone.

## Circle forums

A circle's **Forum** module (`src/lib/groups/`, `src/components/groups/`) holds its conversations;
circles keep using Google Groups or whatever email they like for mail.

- The module lists the circle's conversations; its members, the Board, and admins **Start a
  conversation** (optionally **with a poll** — the title is the question) and reply on the
  conversation's page (`/circles/<id>/forum/<thread>`). Everyone at CVC can read it; members
  delete any message and authors edit their own.
- **Every new message** sends an app notification to the circle's current members (topic
  "groups", push only — never emailed), except its author.
- Poll answers are kept by person; members answer on the page.
- Messages and conversations marked with an envelope came by the group email the app had briefly
  in October 2026; they're kept as they were.
- Stored as `groups/<circleId>/index.json` (conversations), `groups/<circleId>/threads/<id>.json`
  (messages) and `groups/<circleId>/polls/<id>.json`. Deleting a circle forgets its index.

## Resources

- `/resources` lists the categories (plumbers, dentists, realtors…) with how many recommendations
  each has; `/resources/<category>` shows that category's recommendations, each with who
  recommended it. Searching on the main page shows matching recommendations from every category.
  Residents recommend someone themselves (the category page prefills its category), like
  recommendations, and comment on them. Phone numbers, emails, and web addresses become links.
- Whoever made a recommendation (matched by directory person) or an admin can edit or remove it;
  comment authors or admins can edit or delete comments. Stored in
  `resources/recommendations.json`.
- `POST /api/admin/resources` (with `ADMIN_TOKEN`) adds recommendations on a resident's behalf:
  `{ submittedByPersonId, recommendations: [{ category, title, body }] }`. They're credited to, and
  editable by, that resident.

## Photos

- `/photos` is a shared gallery. Any resident can add photos (several at once, each with an
  optional caption); they're downscaled to at most 2400 px and re-encoded as JPEG in the browser,
  which also strips embedded metadata such as GPS location, then verified server-side by their
  bytes (up to 4 MB). Any resident can remove a photo; whoever added it — or an admin — can edit
  its caption.
- Images are stored in R2 (`photos/files/<id>`, details in `photos/index.json`) and served only to
  signed-in residents; photos are never committed to the (public) repository.
- `POST /api/admin/photos?caption=…` seeds the gallery with the image as the raw body, using
  `Authorization: Bearer $ADMIN_TOKEN`. Seeded photos have no uploader, so only admins manage them.

## Profiles & Calendar

- **Profiles** (`/profile`) – residents edit their own name, email, phone numbers, birthday, and a
  short bio, and upload a photo. Edits live in `profiles/index.json`, separate from the imported
  sheet, and are layered over it wherever resident data is read, so a re-import never wipes them.
  Unit and owner/renter stay as imported. The email address is where sign-in links go, so a
  resident can change theirs but not remove it (admins can). Photos are center-cropped and
  downscaled in the browser, verified server-side by their bytes (JPEG, PNG, or WebP, up to 1 MB),
  stored in `profiles/photos/`, and served only to signed-in residents.
- **Community calendar** – the dashboard's green header (with the leaf) shows the next event —
  its day, how soon, title, time and place, and a link to the full calendar — read server-side from the calendar's
  public iCal feed (cached 15 minutes) with recurring events expanded — honouring cancelled dates
  and one-off changes — and all-day dates anchored to Eastern time. `/calendar` embeds the full
  Google Calendar (month view on wide screens, agenda on phones) with a link to add it.

## Community Directory Import

`PUT /api/admin/directory` imports residents, circles, and carshed allocations into R2 as one
document. It requires `Authorization: Bearer $ADMIN_TOKEN` (disabled when `ADMIN_TOKEN` is unset),
writes to R2 only — never to the ephemeral fallback — and responds with counts only. The directory
holds residents' contact details, so exports are gitignored and only signed-in residents can read it.

`/api/admin/circles` (same bearer token) lists circles (`GET`: id, name, kind, member count) and sets
the kind of circles by name (`POST {"kind": "club" | "circle", "names": [...]}`).

`/api/admin/circles/icons` (same bearer token) lists which circles have icons (`GET`), copies one
circle's icon to another (`POST {"from", "to"}`), or sets one from an image body (`PUT ?circle=<id>`).

`POST /api/admin/directory/people` (same bearer token) makes the directory managers' changes in
bulk: `{"residents": [{"personId", "resident"}], "leaveUnit": [{"personId", "unit"}], "remove":
[personId]}`, applied in that order. It responds with names and outcomes only.

## Deployment

- The project is configured for Vercel serverless deployment.
- Configure the `R2_*` variables and `AUTH_SECRET` in Vercel project settings (see above).
- Environment variables apply to new deployments, so redeploy after changing them.

## Project Structure

```
src/
  app/              # Pages (thin server shells) and the API (app/api/**/route.ts)
  components/       # Client components by feature; ui/ holds the primitives, comments/ the shared comment tree
  lib/<feature>/    # shared.ts (types, pure helpers) · store.ts (R2 JSON) · access.ts (who may) · http.ts (route helpers)
  lib/auth/actor.ts # Who is acting (account, resident, name, admin), as every store sees them
  lib/comments/     # The one comment system: the record and the add/edit/delete rules
  lib/storage.ts    # The only module that talks to R2 (or ./.data/ locally)
  lib/http.ts       # problem(), readBody(), throttled() — used by every route
  middleware.ts     # Sends signed-out visitors to the sign-in page
scripts/seed-local.mjs   # Sample data for local work
docs/ARCHITECTURE.md     # How it fits together; CLAUDE.md has the conventions for people and AIs working on it
```

## Testing

- `npm run check` runs lint, the type-check, and the unit tests (`npm test`: vitest over
  `src/**/*.test.ts`, kept beside the code — the paragraph merge, circle
  modules, the route helpers, the comment rules).
- End to end: `npm run seed`, then either `npm run dev` or `npm run build && npm start` with
  `AUTH_SECRET`, `ADMIN_PERSON_IDS` and `EMAIL_TEST_SINK=1` set; sign in through the UI, or
  `POST /api/auth/link {personId}`, read the link from `.data/email-sink.json` and `POST` it to
  `/api/auth/link/<token>`, and exercise the API with curl and the pages with Playwright. Fixtures are
  synthetic: never put real residents in the repository.
- API errors are JSON problem details (`{type, title, status, detail}`); rate limiting is in-memory
  per server instance.

## License

MIT
