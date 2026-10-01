# Kharwa

A small prayer tracker for two people — Khalid and Marwa. Five prayers a day,
two columns, live sync between our phones. No login, no build step.

Plain HTML, CSS, and JavaScript. [Supabase](https://supabase.com) for data and
realtime, [adhan.js](https://github.com/batoulapps/adhan-js) for prayer times,
both from the jsDelivr CDN.

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

`FALLBACK_LOCATION` is used when the browser will not share a location. It
defaults to Tracy, CA.

### 3. Run it locally

```sh
npx live-server
```

Then open the address it prints. Any static server works; it needs to be served
over `http://` rather than opened as a `file://` path, because geolocation and
the Supabase client both require a secure context.

## Deploying

It is a static site with no build step. On Vercel, import the repo and accept
the defaults — no framework, no build command, output directory is the repo
root.

## How it works

- **Who's this?** On first visit you pick Khalid or Marwa. The choice lives in
  `localStorage`, and *Switch person* in settings clears it. You can only tap
  your own column; the other person's is read-only.
- **Statuses** cycle on tap: not logged → on time → late → missed → not logged.
- **Day navigation** on the Today screen goes back as far as you like, to
  backfill a day you forgot, and forward as far as tomorrow.
- **Week** shows the last seven days for both of us, plus each person's streak:
  consecutive days where all five prayers are logged on time or late. An
  unfinished today is skipped rather than counted as a break, so the streak
  does not read as broken before the day is over.
- **Live sync** uses Supabase Realtime. When one of us logs a prayer the other
  screen updates without a refresh and shows a small toast.
- **Settings** (display name, calculation method, Hanafi/standard Asr) are
  stored per person in the `people` table, so they follow you between devices.

## A note on security

There is no login, so the `anon` role has full read and write access to both
tables. Anyone with the site URL and the anon key — which is necessarily public
in a browser app — can read and change the logs. That is a deliberate
trade-off for a two-person app on an unlisted URL, not an oversight. Do not put
anything in here you would mind a stranger seeing.

## Layout

```
index.html          markup for both screens
styles.css          the sky-through-the-day palette
config.js           Supabase URL and anon key (fill these in)
js/times.js         dates, Hijri formatting, prayer times, location
js/data.js          Supabase client, log cache, realtime
js/app.js           rendering and interaction
supabase/schema.sql run this once in the SQL Editor
```
