# Kharwa

A small Islamic app for two people — Khalid and Marwa. A prayer tracker (five
prayers a day, two columns, live sync between our phones) and a Quran reader,
with room for more sections. No login, no build step.

Plain HTML, CSS, and JavaScript. [Supabase](https://supabase.com) for data and
realtime, [adhan.js](https://github.com/batoulapps/adhan-js) as a fallback for
prayer times, both from the jsDelivr CDN.

## Setup

### 1. Create the database

In your Supabase project, open the **SQL Editor**, paste in the whole of
[`supabase/schema.sql`](supabase/schema.sql), and run it. It creates the
`people`, `prayer_logs`, `quran_progress`, `quran_bookmarks`, `hadith_progress`,
`hadith_bookmarks` and `qada_backlog` tables, seeds both people, turns on RLS with open policies for the `anon` role, and adds
`prayer_logs` to the realtime publication.

The file is idempotent — running it again is safe and will not drop any data.

### 2. Fill in `config.js`

From **Project Settings → API**, copy the project URL and the `anon` public key
into `config.js`:

```js
window.KHARWA_CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  ...
};
```

Until those are filled in the app still runs and shows prayer times, but
nothing is saved and a banner says so.

### 3. Run it locally

```sh
npx live-server
```

Then open the address it prints. Any static server works; it needs to be served
over `http://` rather than opened as a `file://` path, because the Supabase
client requires a secure context.

## Deploying

It is a static site with no build step. On Vercel, import the repo and accept
the defaults — no framework, no build command, output directory is the repo
root.

### Home-screen app

Kharwa installs as an app (`manifest.webmanifest`, icons in `icons/`). On
Android and desktop Chrome, *Settings → App → Install Kharwa* opens the
browser's install prompt; on iPhone it explains Share → Add to Home Screen.

`sw.js` is the service worker. The page, `js/`, `styles.css` and
`config.js` are served from one cached snapshot, so a page never mixes files
from two versions (the tabs' code loaded later included). Each open checks
behind the scenes for changed files; when there are some, the whole new set
is downloaded alongside, the app shows "Updated, tap to refresh", and the next
load switches to it. A new `sw.js` likewise waits for that tap. Fonts, icons, pictures and the pinned CDN
libraries are cache-first. Supabase and the Qur'an, hadith and audio APIs are
never cached. A new file under `js/` should be added to `APP_SHELL` in `sw.js`
so it is there offline; bump `VERSION` only when the caching itself changes,
which clears the old caches.

### Startup

Only the Prayer tab's code runs at startup. The Quran, Hadith, Us and Learn
tabs load their scripts (and the Arabic fonts only they use) the first time
they are opened: `js/lazy.js` lists each tab's scripts, and a new script for
one of them goes there. The last good prayer logs, qada and streak inputs are
kept in `localStorage` and drawn at once, then refreshed from Supabase: the
last 60 days first, all queries in parallel, then the older logs. Nothing is
shown as missed, and the qada popup does not open, until real logs are in.

### Prayer reminders

Push notifications at each prayer time, even with Kharwa closed. Each person
turns them on per device in *Settings → App → Prayer reminders*, picks which
prayers, and whether to be told at the start time or 5, 10 or 15 minutes
before. A prayer already logged is skipped. On an iPhone, Kharwa has to be on
the Home Screen first (Apple only allows Web Push for installed apps).

How it fits together:

- The browser subscribes with the **VAPID public key** in `config.js` and the
  subscription is saved in `push_subscriptions` (`supabase/schema.sql`).
- The **Edge Function** `supabase/functions/send-reminders/index.ts` works out
  Tracy's prayer times the same way the app does (the ISOT month from
  `js/timetable.js`, read from the live site, otherwise adhan with ISOT's
  settings), and sends whatever is due. Subscriptions the push service reports
  as gone (404/410) are deleted.
- **pg_cron** calls the function every minute (`supabase/cron.sql`).
- `sw.js` shows the notification and opens the Prayer tab when it is tapped.

The **VAPID private key** is only ever a Supabase secret. It is not in this
repo and must never be committed.

One-time setup:

1. **Run the schema.** Supabase → SQL Editor → paste all of
   `supabase/schema.sql` → Run. (Safe to re-run; it adds `push_subscriptions`.)
2. **Add the secrets.** Supabase → Edge Functions → Secrets → add:
   - `VAPID_PUBLIC_KEY`: the same value as in `config.js`
   - `VAPID_PRIVATE_KEY`: the private key (kept outside the repo)
   - `SITE_URL`: where Kharwa is hosted, e.g. `https://your-app.vercel.app`
     (no trailing slash)
   - `VAPID_SUBJECT` (optional): a contact for the push services, such as
     `mailto:you@example.com`; defaults to `SITE_URL`
3. **Deploy the function**, either way:
   - Dashboard: Edge Functions → Deploy a new function → Via Editor → name it
     `send-reminders` → paste `supabase/functions/send-reminders/index.ts` →
     Deploy. Leave *Verify JWT* on.
   - Or from this folder: `npx supabase login`, then
     `npx supabase functions deploy send-reminders --project-ref knnxeivkcazzowhorokt`
4. **Start the every-minute job.** SQL Editor → paste `supabase/cron.sql` →
   Run. To stop it: `select cron.unschedule('kharwa-send-reminders');`
5. **Try it.** Settings → App → turn on Prayer reminders → *Send test
   notification*.

**Testing.** *Send test notification* opens a menu of every kind of
notification (each prayer reminder, "10 minutes before", a nudge, and the
notes), sent through send-reminders' test mode to your own devices only. Tests
write nothing and never count toward a limit; "Delay 10 seconds" leaves time to
lock the phone.

**One template.** What every notification says lives in
`supabase/functions/_shared/notify.ts`. Each function keeps a copy between
`// >>> shared: notify` and `// <<< shared: notify` so it stays one pasteable
file: after editing the shared file, run `node supabase/functions/sync-shared.mjs`
(add `--check` to just verify), then redeploy the functions.

To replace the keys: generate a new pair (`npx web-push generate-vapid-keys`),
put the public key in `config.js` and both in the secrets. Every device then
has to turn reminders off and on again.

### Nudges

On Today, beside the other person's empty circle, a small bell appears while
a prayer is in its time and they have not logged it. Tapping it pushes
"Khalid nudged you / Time to pray Isha 🤲" to all of their devices. One nudge
per prayer every 15 minutes; the bell then shows "nudged 3m ago". It only
shows if they have turned on Prayer reminders on at least one device (an ⓘ
says so otherwise), and never on past days.

The bell calls the `send-nudge` Edge Function
(`supabase/functions/send-nudge/index.ts`), which checks the prayer is still
unlogged and the 15 minutes, records the nudge in the `nudges` table, and
sends with the same VAPID secrets as the reminders. Setup: re-run
`supabase/schema.sql` (for `nudges`), then deploy `send-nudge` the same way
as `send-reminders` (dashboard editor, or
`npx supabase functions deploy send-nudge --project-ref knnxeivkcazzowhorokt`).
No cron job is needed.

### Us

Notes passed between the two of you, like postcards rather than a chat. At
the top, "From Marwa": the last note the other person sent, as one card
(a line of text, an ayah or hadith with their note, or how they are feeling
with "Send her an ayah for this"). "Earlier notes" lists the rest, sent and
received, newest first; delete one of yours there. Below, "Send something":
six tiles — An ayah for… (Ayahs for the moment), I love you, Make dua for
me (with an optional "for…"), How I'm feeling, Thinking of you, and Write a
note. Shares from the Quran and Hadith tabs arrive as notes too. Opening the
tab marks what you received as read and clears the gold dot on the nav.

Every note goes through the `send-message` Edge Function
(`supabase/functions/send-message/index.ts`), which saves it and pushes a
short notification to the other person's devices (tap it to open the Us tab
at that message). At most 30 messages an hour each. If they have no device
signed up, the message is still saved and waits in Kharwa. Messages delete
themselves after 30 days, by a nightly pg_cron job.

Setup, once:

1. Re-run `supabase/schema.sql` (adds `messages`, `people.quick_sends`, and
   puts `messages` in the realtime publication).
2. Deploy `send-message` like the others: dashboard → Edge Functions → Deploy
   a new function → Via Editor, name `send-message`, paste the file, keep
   *Verify JWT* on. It uses the VAPID secrets already set.
3. Redeploy `send-nudge` from the repo, so nudges also appear in the thread.
4. Run `supabase/messages-cron.sql` for the 30-day cleanup.

#### Ayahs for the moment

The "An ayah for…" tile opens ayahs grouped by feeling: Stressed, Sad,
Tired, Afraid, Patience, Forgiveness, Decision, Grateful, Love. Each card has
a one-line theme, the translation and the reference; tap it for the Arabic,
or Send. Sending fills the note with a gentle line for that mood, which can
be changed or cleared. "Surprise me" picks one, preferring ayahs not sent to
them in the last 30 days (those carry a small check). A range such as
94:5–6 goes as one card.

The references, themes and notes are in `js/us-presets.js`; the Arabic and
translation are always loaded from the Quran API. "How I'm feeling" sends
Stressed, Sad, Tired, Happy or Grateful, which the other person can answer
with an ayah. From the ayah popup on the Quran tab, the heart with a plus
adds that ayah to a mood for both of you (`us_presets`).

Setup: re-run `supabase/schema.sql` (adds `us_presets` and the `mood`
message type) and redeploy `send-message` from the repo.

## How it works

- **Who's this?** On first visit you pick Khalid or Marwa. The choice lives in
  `localStorage`, and *Switch person* in settings clears it. You can only set
  your own column; the other person's is read-only.
- **Day navigation** goes back as far as you like, to backfill a day you forgot,
  and forward as far as tomorrow.
- **Streaks** count consecutive days where all five prayers are logged on time
  or late. An unfinished today is skipped rather than counted as a break, so the
  streak does not read as broken before the day is over.
- **Live sync** uses Supabase Realtime. When one of us logs a prayer the other
  screen updates without a refresh and shows a small toast: "Marwa prayed Asr",
  or "Marwa prayed Asr (late)". Clearing a prayer is silent.
- **Settings** holds the display name, stored per person in the `people` table
  so it follows you between devices.
- **Ayah of the Day** picks one reference a day from the curated list in
  `js/ayat.js`, the same for both of us, and fetches its Arabic and Sahih
  International text from the [Al-Quran Cloud API](https://alquran.cloud/api)
  (no key). The result is cached in `localStorage` for the day; if the API is
  unreachable and nothing is cached, the card is simply hidden.

### On a phone (under 900px)

Prayer cards in the sky colours, with Today and Week behind two tabs. Tap your
own mark to cycle: on time, late, clear. Missed is never chosen: an empty
prayer turns to missed by itself once the next prayer's time arrives (Isha at
the next day's Fajr), and can still be logged afterwards.

### On a laptop (900px and up)

A sticky sidebar with the date, a large countdown and a vertical day timeline
with a "now" marker, beside a pane holding both Today and Week at once. Hover or
focus your own cell to get On time / Late / Clear buttons. Clicking a
day in the week grid moves the Today table to it. Arrow keys change the day and
`T` jumps back to today.

## Prayer times

Times come from the Islamic Society of Tracy's published timetable, in
`js/timetable.js`, keyed by month:

```js
const TIMETABLE = {
  '2026-10': {
    1: { fajr: '05:50', sunrise: '07:02', dhuhr: '12:56',
         asr: '17:05', maghrib: '18:52', isha: '20:00' },
    ...
  },
};
```

Times are 24-hour, local to America/Los_Angeles. **To add a month**, paste in
the new block and nothing else needs to change.

For a month that is not on file, times are calculated with adhan.js for the
ISOT masjid (37.7646866, -121.4525833) using ISOT's method — ISNA angles
(Fajr 15 degrees, Isha 15 degrees), Hanafi Asr, Maghrib three minutes after
sunset, rounded to the nearest minute — and the app shows an *Estimated* chip
next to the source line. On the published October 2026 days this calculation
lands within a minute of the printed timetable.

The device location is not used and the browser never asks for it.

## A note on security

There is no login, so the `anon` role has full read and write access to every
table. Anyone with the site URL and the anon key — which is necessarily public
in a browser app — can read and change the logs. That is a deliberate
trade-off for a two-person app on an unlisted URL, not an oversight. Do not put
anything in here you would mind a stranger seeing.

## Sections

The app is split into sections behind simple hash routes: `#/prayer` (the
default), `#/quran` and `#/hadith`. A phone gets a bottom tab bar; a laptop gets tabs in
the masthead. Both are drawn from one registry in `js/router.js`, so adding a
section (say `#/dhikr`) means one new module that calls `Sections.register()`,
plus its markup.

### Quran

- `#/quran` has a *Continue reading* card (and where the other person is
  reading), then three tabs: **Surahs** (all 114, searchable by name or
  number, with a gold *Reading* tag on the surah you're in), **Juz** (the 30
  juz and the ayah each starts at), and **Bookmarks** (newest first, with the
  first line of each ayah's translation and a remove button).
- `#/quran/18` opens Al-Kahf; `#/quran/2/255` jumps to that ayah, and
  `#/quran/2/255-257` to a range, highlighting it briefly. Back, forward and
  shared links all work, from any section.
- The search box ("Search surah, 2:255, or a word") filters surahs by
  name or number as before. It also understands ayah references: `2:34`,
  `2 34`, `2.34`, `2/34`, `baqarah 34`, `al-baqarah:34`, `Baqara 2:34`, or a
  range like `2:255-257`. These show a *Go to* card with a one-line preview,
  and Enter or a tap opens it. Anything else offers a search of the current
  translation through the API, listing up to 50 matching ayat with the word
  highlighted.
- The reader shows any mix of three layers: Arabic (Uthmani), transliteration,
  and a translation: Sahih International, Muhammad Asad, Pickthall, or Urdu
  (Jalandhry, right to left in Noto Nastaliq Urdu). At least one layer stays
  on. S / M / L sizes the text. The options sit in a sticky bar, folded
  behind an "Aa" button on a phone, and are saved per device for every surah.
- All text comes from the [Al-Quran Cloud API](https://alquran.cloud/api);
  none is written into the code. Each edition of each surah is cached in
  IndexedDB on its own, so a surah reopens instantly and without a
  connection, and switching translation fetches only the new one.
- The reading position (the ayah in view, saved a moment after you stop) and
  bookmarks (tap an ayah's star number) are stored per person in Supabase, with the
  position also kept on the device.

### Hadith

- `#/hadith` lists the collections the API has in both English and Arabic:
  Sahih al-Bukhari, Sahih Muslim, Sunan Abu Dawud, Jami at-Tirmidhi, Sunan
  an-Nasa'i, Sunan Ibn Majah, Muwatta Malik, 40 Hadith Nawawi and 40 Hadith
  Qudsi, with a *Continue reading* card and your bookmarks.
- `#/hadith/bukhari` lists a collection's chapters, searchable;
  `#/hadith/bukhari/8` opens a chapter; `#/hadith/bukhari/n/412` opens the
  chapter holding hadith 412 and jumps to it (decimal numbers such as
  `402.2` work too). A number that doesn't exist quietly lands on the chapter
  list.
- All hadith text and grades come from
  [fawazahmed0/hadith-api](https://github.com/fawazahmed0/hadith-api) (no key);
  none is written into the code. Each request tries the jsDelivr CDN
  (`.min.json`, then `.json`) and then GitHub. The chapter list is slimmed
  from the API's large `info.json` once, and every chapter is cached in
  IndexedDB after its first load, so it reopens instantly and offline.
- Grades are shown exactly as the API gives them, with each grader's name.
  Bukhari and Muslim, which the API leaves ungraded, show "Sahih".
- The reading position (per collection) and bookmarks are stored per person
  in Supabase, the position also on the device; the Arabic on/off setting is
  per device.

## Layout

```
index.html          markup for every section
styles.css          the sky-through-the-day palette, phone and desktop
config.js           Supabase URL and anon key (fill these in)
js/timetable.js     the ISOT timetable, by month
js/times.js         dates, Hijri formatting, prayer times
js/data.js          Supabase client, log cache, realtime, reading progress
js/ayat.js          Ayah of the Day references
js/store.js         a small IndexedDB cache, shared by the sections
js/router.js        sections and hash routing
js/quran.js         the Quran section: list, reader, cache, progress
js/hadith.js        the Hadith section: collections, chapters, reader, progress
js/app.js           the Prayer section, settings, boot
supabase/schema.sql run this once in the SQL Editor
```
