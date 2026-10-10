// =============================================================================
// send-nudge — one of you reminds the other to pray.
//
// POST { from, to, prayer, date }
//
// Called from the Today table when someone taps the bell beside the other
// person's empty circle. Checks that the prayer is still unlogged and that
// `from` has not nudged `to` about it in the last 15 minutes, records the
// nudge, then pushes "Khalid nudged you / Time to pray Isha 🤲" to every
// device `to` has turned reminders on for, and leaves a line in the Us tab's
// thread. Subscriptions the push service reports gone (404/410) are deleted.
//
// Answers 200 with { ok: true, sent, sent_at }, or { ok: false, reason, ... }
// where reason is 'logged', 'too_soon' (with last_at and retry_at),
// 'no_devices' or 'bad_request'.
//
// Uses the same secrets as send-reminders: VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY and optionally VAPID_SUBJECT (else SITE_URL).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// One self-contained file, so it can be pasted into the dashboard editor.
// The Web Push section is the same code as in send-reminders: keep the two
// in step.
// =============================================================================

const TZ = 'America/Los_Angeles';

const PRAYER_LABEL: Record<string, string> = {
  fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
};

/** One nudge per prayer, per person, this often. */
const NUDGE_GAP_MS = 15 * 60_000;

/** A nudge is about now: not worth delivering after 15 minutes. */
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
//
// Every notification is title-only: everything is in the title and the body
// is empty, so iOS shows one bold line with "from Kharwa" under it. Titles
// are kept short enough not to be cut off.
//
// Tags: a prayer's reminder and a nudge for it share one tag per day
// (kharwaPrayerTag), so a later one replaces the earlier instead of piling
// up, and logging the prayer can close it. `renotify` makes a replacement
// alert again.
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

/** The longest a title is let run before it is trimmed, on a word, with "…". */
const NOTIFY_TITLE_MAX = 90;

/** The first `n` characters, on a word boundary, with an ellipsis if cut. */
function notifyClip(text: string, n: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 15)).trim()}…`;
}

/** One tag per prayer per day, shared by its reminder and any nudge. */
function kharwaPrayerTag(day: string, prayer: string): string {
  return `kharwa-prayer-${day}-${prayer}`;
}

type NotifyPayload = { title: string; body: string; url: string; tag: string; renotify?: boolean; badge?: number };

type NotifyNote = {
  id?: number | null; type: string; body: string;
  ref?: { surah?: number; ayah?: number; ayah_to?: number; name?: string; book?: string; number?: number } | null;
  note?: string | null;
};

const Notify = {
  /** "Asr · 4:55 PM", or "Asr in 10 minutes · 4:55 PM". Opens Prayer. */
  reminder(label: string, time: Date, before: number, tag: string): NotifyPayload {
    const at = notifyClock.format(time);
    return {
      title: before ? `${label} in ${before} minutes · ${at}` : `${label} · ${at}`,
      body: '',
      url: '/#/prayer',
      tag,
      renotify: true,
    };
  },

  /** "Marwa nudged you to pray Isha". Opens Prayer. */
  nudge(sender: string, label: string, tag: string): NotifyPayload {
    return { title: `${sender} nudged you to pray ${label}`, body: '', url: '/#/prayer', tag, renotify: true };
  },

  /** A note in the Us tab, as one line. Opens Us, at the note when it has an id.
      "Marwa: I love you ❤️", "Marwa is feeling stressed",
      "Marwa: <note> (94:5–6)" or "Marwa shared an ayah (94:5–6)". */
  note(sender: string, m: NotifyNote, tag: string): NotifyPayload {
    const url = m.id ? `/#/us/${m.id}` : '/#/us';
    const line = (title: string) => ({ title: notifyClip(title, NOTIFY_TITLE_MAX), body: '', url, tag });

    if (m.type === 'text') return line(`${sender}: ${notifyClip(m.body, Math.max(30, NOTIFY_TITLE_MAX - sender.length - 2))}`);
    if (m.type === 'mood') {
      const word = (MOOD_TEXT[m.body] ?? '').replace(/^I’m /, '') || m.body;
      return line(`${sender} is feeling ${word}`);
    }
    const where = m.type === 'ayah'
      ? (m.ref?.ayah_to && m.ref.ayah_to !== m.ref.ayah
        ? `${m.ref?.surah}:${m.ref?.ayah}–${m.ref.ayah_to}`
        : `${m.ref?.surah}:${m.ref?.ayah}`)
      : `${m.ref?.name ?? 'Hadith'} ${m.ref?.number}`;
    const what = m.type === 'ayah' ? 'an ayah' : 'a hadith';
    if (!m.note) return line(`${sender} shared ${what} (${where})`);
    // the note is what gives way, so the reference always shows
    const room = Math.max(20, NOTIFY_TITLE_MAX - sender.length - where.length - 5);
    return line(`${sender}: ${notifyClip(m.note, room)} (${where})`);
  },
};
// <<< shared: notify

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

// ------------------------------------------------------------------ time ---

/** YYYY-MM-DD in Tracy at instant t. */
export function tracyDayKey(t: number): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// ----------------------------------------------------------------- nudge ---

type Nudge = { from: string; to: string; prayer: string; date: string };

async function nudge({ from, to, prayer, date }: Nudge) {
  // Today in Tracy only (yesterday too, for a phone a moment behind at midnight).
  const now = Date.now();
  const days = [tracyDayKey(now), tracyDayKey(now - 6 * 3600_000)];
  if (!PRAYER_LABEL[prayer] || !from || !to || from === to || !days.includes(date)) {
    return { ok: false, reason: 'bad_request' };
  }

  const people = await restJson<{ id: string; display_name: string }[]>(
    `people?select=id,display_name&id=in.(${encodeURIComponent(from)},${encodeURIComponent(to)})`);
  const sender = people.find((p) => p.id === from);
  if (!sender || !people.some((p) => p.id === to)) return { ok: false, reason: 'bad_request' };

  const logged = await restJson<unknown[]>(
    `prayer_logs?select=id&person=eq.${encodeURIComponent(to)}&log_date=eq.${date}`
    + `&prayer=eq.${prayer}&status=in.(on_time,late)`);
  if (logged.length) return { ok: false, reason: 'logged' };

  const since = new Date(now - NUDGE_GAP_MS).toISOString();
  const [recent] = await restJson<{ sent_at: string }[]>(
    `nudges?select=sent_at&from_person=eq.${encodeURIComponent(from)}&to_person=eq.${encodeURIComponent(to)}`
    + `&log_date=eq.${date}&prayer=eq.${prayer}&sent_at=gt.${encodeURIComponent(since)}`
    + '&order=sent_at.desc&limit=1');
  if (recent) {
    const last = Date.parse(recent.sent_at);
    return {
      ok: false, reason: 'too_soon',
      last_at: recent.sent_at, retry_at: new Date(last + NUDGE_GAP_MS).toISOString(),
    };
  }

  const subs = await restJson<Subscription[]>(`push_subscriptions?select=*&person=eq.${encodeURIComponent(to)}`);
  if (!subs.length) return { ok: false, reason: 'no_devices' };

  // Recorded before sending, so a double tap cannot send two.
  const res = await rest('nudges?select=id,sent_at', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ from_person: from, to_person: to, prayer, log_date: date }),
  });
  if (!res.ok) throw new Error(`nudges: ${res.status} ${await res.text()}`);
  const [row] = await res.json();

  const label = PRAYER_LABEL[prayer];
  const payload = Notify.nudge(sender.display_name || from, label, kharwaPrayerTag(date, prayer));

  let sent = 0;
  for (const sub of subs) {
    const status = await push(sub, payload);
    if (status === 404 || status === 410) await forget(sub);
    else if (status < 300) sent += 1;
  }

  if (!sent) {
    // nothing went out, so it does not count against the 15 minutes
    await rest(`nudges?id=eq.${row.id}`, { method: 'DELETE' });
    return { ok: false, reason: 'no_devices' };
  }

  // A quiet line in the Us tab: "Khalid nudged you to pray Isha". Without the
  // messages table (schema.sql not re-run yet) the nudge has still gone out.
  const line = await rest('messages', {
    method: 'POST',
    body: JSON.stringify({ from_person: from, to_person: to, type: 'nudge', body: label, ref: { prayer, date } }),
  });
  if (!line.ok) console.warn(`messages: ${line.status} ${await line.text()}`);

  return { ok: true, sent, sent_at: row.sent_at };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify({ fn: 'send-nudge', ...body }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    if (!vapidPublic() || !vapidPrivate()) {
      return json({ ok: false, error: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets are not set.' }, 500);
    }
    const body = await req.json().catch(() => ({}));
    return json(await nudge({
      from: String(body?.from || ''), to: String(body?.to || ''),
      prayer: String(body?.prayer || ''), date: String(body?.date || ''),
    }));
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
}

(globalThis as any).Deno?.serve(handle);
