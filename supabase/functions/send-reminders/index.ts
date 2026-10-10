// =============================================================================
// send-reminders — Kharwa's prayer-time push notifications.
//
// Called every minute by pg_cron (see supabase/cron.sql). For each saved push
// subscription it works out whether one of that person's chosen prayers is
// due now (at the start time, or 5/10/15 minutes before), and if it is, and
// they have not logged that prayer yet, sends a Web Push.
//
// POST {}                          the minute's run (from cron)
// POST { test: true, endpoint, kind?, delay? }
//                                  a test notification, to the devices of the
//                                  person `endpoint` belongs to, and no one else.
//                                  `kind` picks what it imitates (see TEST_KINDS);
//                                  `delay` (0–30 s) holds it back, so the phone
//                                  can be locked first. Tests read only: they
//                                  write nothing and never count toward a limit.
//
// Prayer times are worked out the way the app does it: the Islamic Society of
// Tracy's published month (js/timetable.js, read from the live site) when it
// is on file, otherwise adhan with ISOT's settings, in America/Los_Angeles.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY   the same public key as in config.js
//   VAPID_PRIVATE_KEY  its private half — only ever here, never in the repo
//   SITE_URL           where Kharwa is hosted, e.g. https://kharwa.vercel.app
//   VAPID_SUBJECT      optional contact for the push services; defaults to SITE_URL
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// One self-contained file, so it can be pasted into the dashboard editor. The
// Web Push encryption (RFC 8291) and VAPID signing (RFC 8292) use WebCrypto.
// =============================================================================

import { CalculationMethod, Coordinates, Madhab, PrayerTimes, Rounding } from 'npm:adhan@4.4.3';

const TZ = 'America/Los_Angeles';
const ISOT = { latitude: 37.7646866, longitude: -121.4525833 };

const PRAYERS = [
  { key: 'fajr', label: 'Fajr' },
  { key: 'dhuhr', label: 'Dhuhr' },
  { key: 'asr', label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha', label: 'Isha' },
] as const;

type PrayerKey = typeof PRAYERS[number]['key'];

/** A run that comes a little late (cron is busy, a cold start) still sends. */
const GRACE_MS = 3 * 60_000;

/** A reminder nobody sees within 15 minutes is not worth delivering. */
const PUSH_TTL_SECONDS = 15 * 60;

const env = (name: string) => (globalThis as any).Deno?.env.get(name) ?? '';

/**
 * A VAPID key as pasted into the secrets, made safe to use: surrounding
 * spaces, quotes or line breaks dropped, and standard base64 (+ / =) turned
 * into the URL-safe base64 that Web Push and JWK expect.
 */
export function cleanKey(raw: string): string {
  return raw.trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\s+/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const vapidPublic = () => cleanKey(env('VAPID_PUBLIC_KEY'));
const vapidPrivate = () => cleanKey(env('VAPID_PRIVATE_KEY'));

// >>> shared: notify
// -----------------------------------------------------------------------------
// What every Kharwa notification says, in one place: prayer reminders,
// nudges and notes, real or test. This block is the same in send-reminders,
// send-nudge and send-message. Edit it in supabase/functions/_shared/notify.ts
// only, then run `node supabase/functions/sync-shared.mjs` to copy it into the
// three functions (`--check` fails if a copy has drifted). Each function stays
// one file, so it can still be pasted into the dashboard editor.
// -----------------------------------------------------------------------------

const NOTIFY_TZ = 'America/Los_Angeles';
const notifyClock = new Intl.DateTimeFormat('en-US', { timeZone: NOTIFY_TZ, hour: 'numeric', minute: '2-digit' });

/** "How I'm feeling": a mood note carries one of these ids. */
const MOOD_TEXT: Record<string, string> = {
  stressed: 'I’m stressed',
  sad: 'I’m sad',
  tired: 'I’m tired',
  happy: 'I’m happy',
  grateful: 'I’m grateful',
};

/** The first `n` characters, on a word boundary, with an ellipsis if cut. */
function notifyClip(text: string, n: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 15)).trim()}…`;
}

type NotifyPayload = { title: string; body: string; url: string; tag: string };

type NotifyNote = {
  id?: number | null; type: string; body: string;
  ref?: { surah?: number; ayah?: number; ayah_to?: number; name?: string; book?: string; number?: number } | null;
  note?: string | null;
};

const Notify = {
  /** "Asr · 4:55 PM" / "Time for Asr." (or "Asr in 10 minutes."). Opens Prayer. */
  reminder(label: string, time: Date, before: number, tag: string): NotifyPayload {
    return {
      title: `${label} · ${notifyClock.format(time)}`,
      body: before ? `${label} in ${before} minutes.` : `Time for ${label}.`,
      url: '/#/prayer',
      tag,
    };
  },

  /** "Khalid nudged you" / "Time to pray Isha 🤲". Opens Prayer. */
  nudge(sender: string, label: string, tag: string): NotifyPayload {
    return { title: `${sender} nudged you`, body: `Time to pray ${label} 🤲`, url: '/#/prayer', tag };
  },

  /** A note in the Us tab. Opens Us, at the note when it has an id. Small on
      purpose: the app loads the rest. */
  note(sender: string, m: NotifyNote, tag: string): NotifyPayload {
    const url = m.id ? `/#/us/${m.id}` : '/#/us';
    if (m.type === 'text') return { title: sender, body: notifyClip(m.body, 140), url, tag };
    if (m.type === 'mood') return { title: sender, body: MOOD_TEXT[m.body] ?? m.body, url, tag };
    const what = m.type === 'ayah' ? 'an ayah' : 'a hadith';
    const range = m.ref?.ayah_to && m.ref.ayah_to !== m.ref.ayah ? `${m.ref.ayah}–${m.ref.ayah_to}` : `${m.ref?.ayah}`;
    const where = m.type === 'ayah'
      ? `${m.ref?.name ?? 'Quran'} ${m.ref?.surah}:${range}`
      : `${m.ref?.name ?? 'Hadith'} ${m.ref?.number}`;
    return {
      title: m.note ? `${sender}: ${notifyClip(m.note, 60)}` : `${sender} shared ${what}`,
      body: `${notifyClip(m.body, 90)} (${where})`,
      url,
      tag,
    };
  },
};
// <<< shared: notify

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ------------------------------------------------------------------ time ---

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function zoned(t: number) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** YYYY-MM-DD in Tracy at instant t. */
export function tracyDayKey(t: number): string {
  const z = zoned(t);
  return `${z.y}-${String(z.m).padStart(2, '0')}-${String(z.d).padStart(2, '0')}`;
}

/** How far Tracy's clock is ahead of UTC at instant t (negative: behind). */
function offsetMs(t: number): number {
  const z = zoned(t);
  return Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, z.s) - Math.floor(t / 1000) * 1000;
}

/** "HH:MM" on a Tracy date, as an instant. */
export function tracyTime(key: string, hhmm: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  let t = wall - offsetMs(wall);
  t = wall - offsetMs(t); // once more, in case the first guess crossed a DST change
  return new Date(t);
}

const clockFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

// ------------------------------------------------------------- timetable ---

type Row = Partial<Record<PrayerKey | 'sunrise', string>>;
type Timetable = Record<string, Record<number, Row>>;

/** js/timetable.js is a plain object literal, one day per line; read it as text. */
export function parseTimetable(src: string): Timetable {
  const out: Timetable = {};
  let month: string | null = null;
  for (const line of src.split('\n')) {
    const head = line.match(/^\s*'(\d{4}-\d{2})'\s*:\s*\{/);
    if (head) { month = head[1]; out[month] = {}; continue; }
    const day = month && line.match(/^\s*(\d{1,2})\s*:\s*\{([^}]*)\}/);
    if (day) {
      const row: Row = {};
      for (const [, k, v] of day[2].matchAll(/(\w+)\s*:\s*'(\d{2}:\d{2})'/g)) row[k as PrayerKey] = v;
      out[month!][Number(day[1])] = row;
    }
  }
  return out;
}

let timetable: { at: number; data: Timetable } | null = null;

/** The published timetable, fetched from the site at most every 10 minutes. */
async function loadTimetable(): Promise<Timetable> {
  if (timetable && Date.now() - timetable.at < 10 * 60_000) return timetable.data;
  const site = env('SITE_URL').replace(/\/+$/, '');
  if (!site) return {};
  try {
    const res = await fetch(`${site}/js/timetable.js`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    timetable = { at: Date.now(), data: parseTimetable(await res.text()) };
  } catch (err) {
    console.warn('timetable: falling back to calculated times:', String(err));
    if (!timetable) return {};
  }
  return timetable!.data;
}

/** ISOT's own method: ISNA angles, Hanafi Asr, Maghrib +3, nearest minute. */
function calculatedTimes(key: string): Record<PrayerKey, Date> {
  const [y, m, d] = key.split('-').map(Number);
  const params = CalculationMethod.NorthAmerica();
  params.madhab = Madhab.Hanafi;
  params.adjustments.maghrib = 3;
  params.rounding = Rounding.Nearest;
  // adhan reads the calendar date from the Date's local fields; noon is safe in any zone
  const times = new PrayerTimes(new Coordinates(ISOT.latitude, ISOT.longitude), new Date(y, m - 1, d, 12), params);
  return Object.fromEntries(PRAYERS.map((p) => [p.key, times[p.key]])) as Record<PrayerKey, Date>;
}

export function timesFor(key: string, table: Timetable): Record<PrayerKey, Date> {
  const [y, m, d] = key.split('-').map(Number);
  const row = table[`${y}-${String(m).padStart(2, '0')}`]?.[d];
  if (row && PRAYERS.every((p) => row[p.key])) {
    return Object.fromEntries(PRAYERS.map((p) => [p.key, tracyTime(key, row[p.key]!)])) as Record<PrayerKey, Date>;
  }
  return calculatedTimes(key);
}

// -------------------------------------------------------------- database ---

function rest(path: string, init: RequestInit = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });
}

async function restJson<T>(path: string): Promise<T> {
  const res = await rest(path);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

type Subscription = {
  id: number;
  person: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  settings: { prayers?: string[]; minutes_before?: number };
  last_sent: string | null;
};

// -------------------------------------------------------------- web push ---

const enc = new TextEncoder();

/** Bytes backed by a plain ArrayBuffer, which is what fetch and WebCrypto take. */
type Bytes = Uint8Array<ArrayBuffer>;

const utf8 = (s: string): Bytes => new Uint8Array(enc.encode(s));

export function b64urlDecode(s: string): Bytes {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/** An uncompressed P-256 point (65 bytes) and its private scalar, as a JWK. */
function ecJwk(publicRaw: Uint8Array, d?: string): JsonWebKey {
  return {
    kty: 'EC', crv: 'P-256', ext: true,
    x: b64urlEncode(publicRaw.slice(1, 33)),
    y: b64urlEncode(publicRaw.slice(33, 65)),
    ...(d ? { d } : {}),
  };
}

/**
 * The aes128gcm body for one push (RFC 8291). `fixed` pins the sender's key
 * and the salt, for checking against the RFC's worked example.
 */
export async function encryptPayload(
  plaintext: Bytes, p256dh: string, authSecret: string,
  fixed?: { senderPrivate: string; senderPublic: string; salt: string },
): Promise<Bytes> {
  const uaPublic = b64urlDecode(p256dh);
  const auth = b64urlDecode(authSecret);
  const uaKey = await crypto.subtle.importKey('jwk', ecJwk(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  let asPrivate: CryptoKey;
  let asPublic: Bytes;
  if (fixed) {
    asPublic = b64urlDecode(fixed.senderPublic);
    asPrivate = await crypto.subtle.importKey('jwk', ecJwk(asPublic, fixed.senderPrivate),
      { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  }
  const salt = fixed ? b64urlDecode(fixed.salt) : crypto.getRandomValues(new Uint8Array(16));

  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPrivate, 256));

  // HKDF, one block at a time: extract with the auth secret, then with the salt
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, concat(utf8('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(utf8('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(utf8('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const padded = concat(plaintext, new Uint8Array([2])); // 2: the last (and only) record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, padded));

  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** The VAPID Authorization header for a push service's origin (RFC 8292). */
export async function vapidAuth(audience: string): Promise<string> {
  const publicKey = vapidPublic();
  const subject = env('VAPID_SUBJECT').trim() || env('SITE_URL').trim();
  const key = await crypto.subtle.importKey('jwk', ecJwk(b64urlDecode(publicKey), vapidPrivate()),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(utf8(JSON.stringify({
    aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject,
  })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key,
    utf8(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${publicKey}`;
}

/** Sends one notification; resolves to the push service's status code. */
export async function push(sub: Subscription, payload: object): Promise<number> {
  const body = await encryptPayload(utf8(JSON.stringify(payload)), sub.keys.p256dh, sub.keys.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(new URL(sub.endpoint).origin),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(PUSH_TTL_SECONDS),
      Urgency: 'high',
    },
    body,
  });
  if (!res.ok) console.warn(`push ${res.status} for subscription ${sub.id}: ${await res.text()}`);
  return res.status;
}

/** Gone for good: the browser unsubscribed, or the app was removed. */
async function forget(sub: Subscription) {
  await rest(`push_subscriptions?id=eq.${sub.id}`, { method: 'DELETE' });
}

// ------------------------------------------------------------------ runs ---

/** Which of a subscription's prayers is due at `now`, if any. */
export function duePrayer(
  sub: Pick<Subscription, 'settings' | 'last_sent'>, times: Record<PrayerKey, Date>, dayKey: string, now: number,
) {
  const before = [0, 5, 10, 15].includes(Number(sub.settings?.minutes_before)) ? Number(sub.settings.minutes_before) : 0;
  const chosen = new Set(sub.settings?.prayers ?? PRAYERS.map((p) => p.key));
  let due = null;
  for (const p of PRAYERS) {
    if (!chosen.has(p.key)) continue;
    const at = times[p.key].getTime() - before * 60_000;
    const tag = `${dayKey}:${p.key}`;
    if (now >= at && now - at < GRACE_MS && sub.last_sent !== tag) due = { ...p, time: times[p.key], before, tag };
  }
  return due;
}

/** The reminder's title and body: the shared template, as tests use too. */
export function message(p: { label: string; time: Date; before: number }) {
  const { title, body } = Notify.reminder(p.label, p.time, p.before, '');
  return { title, body };
}

async function runMinute() {
  const now = Date.now();
  const dayKey = tracyDayKey(now);
  const times = timesFor(dayKey, await loadTimetable());

  const subs = await restJson<Subscription[]>('push_subscriptions?select=*');
  const logged = new Set(
    (await restJson<{ person: string; prayer: string }[]>(
      `prayer_logs?select=person,prayer&log_date=eq.${dayKey}&status=in.(on_time,late)`))
      .map((r) => `${r.person}|${r.prayer}`),
  );

  let sent = 0;
  for (const sub of subs) {
    const p = duePrayer(sub, times, dayKey, now);
    if (!p || logged.has(`${sub.person}|${p.key}`)) continue;
    // marked first, so an overlapping run cannot send it twice
    await rest(`push_subscriptions?id=eq.${sub.id}`, { method: 'PATCH', body: JSON.stringify({ last_sent: p.tag }) });
    const status = await push(sub, Notify.reminder(p.label, p.time, p.before, `kharwa-${p.tag}`));
    if (status === 404 || status === 410) await forget(sub);
    else if (status < 300) sent += 1;
  }
  return { day: dayKey, subscriptions: subs.length, sent };
}

// ------------------------------------------------------------------ tests ---

/* What the test menu in Settings can send. Each is built with the same shared
   template as the real thing, so the preview is exactly what arrives. */
export const TEST_KINDS = [
  'prayer:fajr', 'prayer:dhuhr', 'prayer:asr', 'prayer:maghrib', 'prayer:isha', 'prayer:asr:10',
  'prayers', 'nudge', 'note:love', 'note:ayah', 'note:dua', 'note:feeling',
] as const;

const TEST_GAP_MS = 4000;            // "Send all prayer reminders": a few seconds apart
const TEST_DELAY_MAX_S = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The translation of an ayah range, from the Quran API (never written here). */
async function sampleAyah(s: number, from: number, to: number) {
  const parts: string[] = [];
  let name = '';
  for (let a = from; a <= to; a += 1) {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${s}:${a}/en.sahih`);
    if (!res.ok) throw new Error(`The Quran API answered ${res.status}.`);
    const data = (await res.json())?.data;
    parts.push(data?.text ?? '');
    name = data?.surah?.englishName ?? name;
  }
  return { body: parts.join(' '), name };
}

/** The payloads one test kind sends, in order. `other` is the other person's
    name, as the real nudges and notes carry it. */
export async function testPayloads(kind: string, other: string, times: Record<PrayerKey, Date>) {
  const tag = `kharwa-test-${kind}`;
  const reminder = (key: PrayerKey, before = 0) => {
    const p = PRAYERS.find((x) => x.key === key)!;
    return Notify.reminder(p.label, times[key], before, `kharwa-test-prayer-${key}${before ? `-${before}` : ''}`);
  };
  if (kind === 'prayers') return PRAYERS.map((p) => reminder(p.key));
  const prayer = kind.match(/^prayer:(fajr|dhuhr|asr|maghrib|isha)(?::(\d+))?$/);
  if (prayer) return [reminder(prayer[1] as PrayerKey, Number(prayer[2] || 0))];
  if (kind === 'nudge') return [Notify.nudge(other, 'Isha', tag)];
  if (kind === 'note:love') return [Notify.note(other, { type: 'text', body: 'I love you ❤️' }, tag)];
  if (kind === 'note:dua') return [Notify.note(other, { type: 'text', body: 'Make dua for me 🤲' }, tag)];
  if (kind === 'note:feeling') return [Notify.note(other, { type: 'mood', body: 'stressed' }, tag)];
  if (kind === 'note:ayah') {
    const ayah = await sampleAyah(94, 5, 6);
    return [Notify.note(other, {
      type: 'ayah', body: ayah.body, note: 'For when it feels like too much 🤍',
      ref: { surah: 94, ayah: 5, ayah_to: 6, name: ayah.name || 'Ash-Sharh' },
    }, tag)];
  }
  return null;
}

/**
 * A test from the Settings menu. Only to the devices of the person that
 * `endpoint` belongs to; nothing is written (an expired device is reported,
 * not deleted). Every failure says why, in words Settings shows as they are.
 * With a delay, the answer comes at once and the push follows in the
 * background, so locking the phone does not cut it off.
 */
async function runTest(endpoint: string, kind = 'basic', delaySeconds = 0) {
  const notSignedUp = { ok: false, reason: 'not_subscribed', error: 'No device signed up. Turn reminders off and on.' };
  if (!endpoint) return notSignedUp;
  const [mine] = await restJson<Subscription[]>(
    `push_subscriptions?select=person&endpoint=eq.${encodeURIComponent(endpoint)}`);
  if (!mine) return notSignedUp;

  const person = mine.person;
  const subs = await restJson<Subscription[]>(`push_subscriptions?select=*&person=eq.${encodeURIComponent(person)}`);
  const people = await restJson<{ id: string; display_name: string }[]>('people?select=id,display_name');
  const otherRow = people.find((p) => p.id !== person);
  const other = otherRow?.display_name || otherRow?.id || 'Your partner';

  let payloads: NotifyPayload[] | null;
  if (kind === 'basic') {
    payloads = [{ title: `Kharwa · ${clockFmt.format(new Date())}`, body: 'Test notification: prayer reminders are working.', url: '/#/prayer', tag: 'kharwa-test' }];
  } else {
    if (!(TEST_KINDS as readonly string[]).includes(kind)) return { ok: false, reason: 'bad_request', error: `Unknown test: ${kind}.` };
    try {
      payloads = await testPayloads(kind, other, timesFor(tracyDayKey(Date.now()), await loadTimetable()));
    } catch (err) {
      return { ok: false, reason: 'sample_failed', error: String((err as Error)?.message || err) };
    }
  }
  if (!payloads?.length) return { ok: false, reason: 'bad_request', error: `Unknown test: ${kind}.` };

  const deliver = async () => {
    const results: { status: number }[] = [];
    for (const [i, payload] of payloads!.entries()) {
      if (i) await sleep(TEST_GAP_MS);
      for (const sub of subs) {
        try { results.push({ status: await push(sub, payload) }); } catch { results.push({ status: 0 }); }
      }
    }
    return results;
  };

  const delay = Math.min(Math.max(Number(delaySeconds) || 0, 0), TEST_DELAY_MAX_S);
  const preview = payloads.map(({ title, body, url }) => ({ title, body, url }));
  if (delay > 0 || payloads.length > 1) {
    const later = (async () => { await sleep(delay * 1000); await deliver(); })();
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(later); else await later;
    return { ok: true, scheduled: true, delay, devices: subs.length, preview };
  }

  const results = await deliver();
  const delivered = results.filter((r) => r.status >= 200 && r.status < 300).length;
  if (delivered) return { ok: true, devices: subs.length, delivered, preview };
  const statuses = results.map((r) => r.status);
  if (statuses.every((x) => x === 404 || x === 410)) {
    return { ok: false, reason: 'expired', error: 'Push service rejected the subscription: it has expired. Turn reminders off and on.' };
  }
  const denied = statuses.find((x) => x === 401 || x === 403);
  if (denied) {
    return { ok: false, reason: 'push_rejected', error: `Push service rejected the subscription (${denied}): the VAPID keys in the secrets don’t match the key in config.js.` };
  }
  return { ok: false, reason: 'push_rejected', error: `Push service rejected the subscription (${statuses.join(', ')}).` };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify({ fn: 'send-reminders', ...body }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    if (!vapidPublic() || !vapidPrivate()) {
      return json({ ok: false, error: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets are not set.' }, 500);
    }
    const body = await req.json().catch(() => ({}));
    if (body?.test) return json(await runTest(String(body.endpoint || ''), String(body.kind || 'basic'), Number(body.delay) || 0));
    return json({ ok: true, ...(await runMinute()) });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
}

(globalThis as any).Deno?.serve(handle);
