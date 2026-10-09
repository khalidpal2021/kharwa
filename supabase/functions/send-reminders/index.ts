// =============================================================================
// send-reminders — Kharwa's prayer-time push notifications.
//
// Called every minute by pg_cron (see supabase/cron.sql). For each saved push
// subscription it works out whether one of that person's chosen prayers is
// due now (at the start time, or 5/10/15 minutes before), and if it is, and
// they have not logged that prayer yet, sends a Web Push.
//
// POST {}                          the minute's run (from cron)
// POST { test: true, endpoint }    a test notification to one subscription
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
  const publicKey = env('VAPID_PUBLIC_KEY');
  const subject = env('VAPID_SUBJECT') || env('SITE_URL');
  const key = await crypto.subtle.importKey('jwk', ecJwk(b64urlDecode(publicKey), env('VAPID_PRIVATE_KEY')),
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

export function message(p: { label: string; time: Date; before: number }) {
  return {
    title: `${p.label} · ${clockFmt.format(p.time)}`,
    body: p.before ? `${p.label} in ${p.before} minutes.` : `Time for ${p.label}.`,
  };
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
    const status = await push(sub, { ...message(p), url: '/#/prayer', tag: `kharwa-${p.tag}` });
    if (status === 404 || status === 410) await forget(sub);
    else if (status < 300) sent += 1;
  }
  return { day: dayKey, subscriptions: subs.length, sent };
}

async function runTest(endpoint: string) {
  const [sub] = await restJson<Subscription[]>(
    `push_subscriptions?select=*&endpoint=eq.${encodeURIComponent(endpoint)}`);
  if (!sub) return { ok: false, error: 'This device is not subscribed.' };
  const now = new Date();
  const status = await push(sub, {
    title: `Kharwa · ${clockFmt.format(now)}`,
    body: 'Test notification: prayer reminders are working.',
    url: '/#/prayer',
    tag: 'kharwa-test',
  });
  if (status === 404 || status === 410) {
    await forget(sub);
    return { ok: false, error: 'This subscription has expired. Turn reminders off and on again.' };
  }
  return status < 300 ? { ok: true } : { ok: false, error: `The push service answered ${status}.` };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) {
      return json({ ok: false, error: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets are not set.' }, 500);
    }
    const body = await req.json().catch(() => ({}));
    if (body?.test) return json(await runTest(String(body.endpoint || '')));
    return json({ ok: true, ...(await runMinute()) });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
}

(globalThis as any).Deno?.serve(handle);
