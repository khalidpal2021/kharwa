# Kharwa

A small prayer tracker for two people — Khalid and Marwa. Five prayers a day,
two columns, live sync between our phones. No login, no build step.

Plain HTML, CSS, and JavaScript. [Supabase](https://supabase.com) for data and
realtime, [adhan.js](https://github.com/batoulapps/adhan-js) as a fallback for
prayer times, both from the jsDelivr CDN.

## Setup

### 1. Create the database

In your Supabase project, open the **SQL Editor**, paste in the whole of
[`supabase/schema.sql`](supabase/schema.sql), and run it. It creates the
`people` and `prayer_logs` tables, seeds both people, turns on RLS with open
policies for the `anon` role, and adds `prayer_logs` to the realtime
publication.

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
  screen updates without a refresh and shows a small toast.
- **Settings** holds the display name, stored per person in the `people` table
  so it follows you between devices.
- **Ayah of the Day** picks one reference a day from the curated list in
  `js/ayat.js`, the same for both of us, and fetches its Arabic and Sahih
  International text from the [Al-Quran Cloud API](https://alquran.cloud/api)
  (no key). The result is cached in `localStorage` for the day; if the API is
  unreachable and nothing is cached, the card is simply hidden.

### On a phone (under 900px)

Prayer cards in the sky colours, with Today and Week behind two tabs. Tap your
own square to cycle: on time, late, missed, clear.

### On a laptop (900px and up)

A sticky sidebar with the date, a large countdown and a vertical day timeline
with a "now" marker, beside a pane holding both Today and Week at once. Hover or
focus your own cell to get On time / Late / Missed / Clear buttons. Clicking a
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

There is no login, so the `anon` role has full read and write access to both
tables. Anyone with the site URL and the anon key — which is necessarily public
in a browser app — can read and change the logs. That is a deliberate
trade-off for a two-person app on an unlisted URL, not an oversight. Do not put
anything in here you would mind a stranger seeing.

## Layout

```
index.html          markup for both screens
styles.css          the sky-through-the-day palette, phone and desktop
config.js           Supabase URL and anon key (fill these in)
js/timetable.js     the ISOT timetable, by month
js/times.js         dates, Hijri formatting, prayer times
js/data.js          Supabase client, log cache, realtime
js/app.js           rendering and interaction, both layouts
supabase/schema.sql run this once in the SQL Editor
```
