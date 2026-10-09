// =============================================================================
// send-message — the Us tab: a message from one of you to the other.
//
// POST { from, to, type, body, ref?, note? }
//   type 'text'    body is the message, up to 500 characters
//   type 'ayah'    body is the translation; ref { surah, ayah, name, arabic }
//   type 'hadith'  body is the English; ref { book, number, name, arabic }
//   note           optional, up to 200 characters, sent with an ayah or hadith
//
// Saves the message, then pushes a short notification to every device `to`
// has turned reminders on for; subscriptions that answer 404/410 are
// deleted. The push carries only a title, a line and the message's link:
// the app loads the message itself. At most 30 messages an hour from one
// person, so a stuck button cannot flood the other phone.
//
// Answers 200 with { ok: true, message, devices, delivered }, or
// { ok: false, reason } where reason is 'bad_request' or 'rate_limited'.
//
// Uses the same secrets as send-reminders and send-nudge: VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY and optionally VAPID_SUBJECT (else SITE_URL).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// One self-contained file, so it can be pasted into the dashboard editor.
// The Web Push section is the same code as in send-reminders: keep them in
// step.
// =============================================================================

const TEXT_MAX = 500;
const SHARED_MAX = 6000;
const NOTE_MAX = 200;
const PER_HOUR = 30;

/** A message is worth delivering for a day; after that the app has it anyway. */
const PUSH_TTL_SECONDS = 24 * 3600;

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

// --------------------------------------------------------------- message ---

type Incoming = { from: string; to: string; type: string; body: string; ref: any; note: string };

/** The first `n` characters, on a word boundary, with an ellipsis if cut. */
export function clip(text: string, n: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 15)).trim()}…`;
}

/** What the notification says. Small on purpose: the app loads the rest. */
export function notification(sender: string, m: { id: number; type: string; body: string; ref: any; note: string | null }) {
  const url = `/#/us/${m.id}`;
  const tag = `kharwa-msg-${m.id}`;
  if (m.type === 'text') return { title: sender, body: clip(m.body, 140), url, tag };
  const what = m.type === 'ayah' ? 'an ayah' : 'a hadith';
  const where = m.type === 'ayah'
    ? `${m.ref?.name ?? 'Quran'} ${m.ref?.surah}:${m.ref?.ayah}`
    : `${m.ref?.name ?? 'Hadith'} ${m.ref?.number}`;
  return {
    title: m.note ? `${sender}: ${clip(m.note, 60)}` : `${sender} shared ${what}`,
    body: `${clip(m.body, 90)} (${where})`,
    url,
    tag,
  };
}

/** Checks and tidies what the app sent; null when it is not a message. */
export function validate(m: Incoming) {
  const body = String(m.body ?? '').trim();
  const note = String(m.note ?? '').trim();
  if (!m.from || !m.to || m.from === m.to) return null;
  if (m.type === 'text') {
    if (!body || body.length > TEXT_MAX) return null;
    return { type: 'text', body, ref: null, note: null };
  }
  if (note.length > NOTE_MAX) return null;
  if (m.type === 'ayah') {
    const surah = Number(m.ref?.surah), ayah = Number(m.ref?.ayah);
    if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > 286) return null;
    return {
      type: 'ayah', body: body.slice(0, SHARED_MAX), note: note || null,
      ref: { surah, ayah, name: String(m.ref?.name ?? '').slice(0, 80), arabic: String(m.ref?.arabic ?? '').slice(0, 3000) },
    };
  }
  if (m.type === 'hadith') {
    const book = String(m.ref?.book ?? ''), number = Number(m.ref?.number);
    if (!/^[a-z0-9]{1,32}$/.test(book) || !(number > 0)) return null;
    return {
      type: 'hadith', body: body.slice(0, SHARED_MAX), note: note || null,
      ref: { book, number, name: String(m.ref?.name ?? '').slice(0, 80), arabic: String(m.ref?.arabic ?? '').slice(0, 3000) },
    };
  }
  return null;
}

async function send(input: Incoming) {
  const clean = validate(input);
  if (!clean) return { ok: false, reason: 'bad_request' };
  const { from, to } = input;

  const people = await restJson<{ id: string; display_name: string }[]>(
    `people?select=id,display_name&id=in.(${encodeURIComponent(from)},${encodeURIComponent(to)})`);
  const sender = people.find((p) => p.id === from);
  if (!sender || !people.some((p) => p.id === to)) return { ok: false, reason: 'bad_request' };

  const since = new Date(Date.now() - 3600_000).toISOString();
  const recent = await restJson<unknown[]>(
    `messages?select=id&from_person=eq.${encodeURIComponent(from)}&type=neq.nudge`
    + `&created_at=gt.${encodeURIComponent(since)}&limit=${PER_HOUR}`);
  if (recent.length >= PER_HOUR) return { ok: false, reason: 'rate_limited' };

  const res = await rest('messages?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ from_person: from, to_person: to, ...clean }),
  });
  if (!res.ok) throw new Error(`messages: ${res.status} ${await res.text()}`);
  const [message] = await res.json();

  const subs = await restJson<Subscription[]>(`push_subscriptions?select=*&person=eq.${encodeURIComponent(to)}`);
  const payload = notification(sender.display_name || from, message);
  let delivered = 0;
  for (const sub of subs) {
    try {
      const status = await push(sub, payload);
      if (status === 404 || status === 410) await forget(sub);
      else if (status < 300) delivered += 1;
    } catch (err) {
      console.warn(`push failed for subscription ${sub.id}:`, String(err)); // saved all the same
    }
  }
  return { ok: true, message, devices: subs.length, delivered };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    if (!vapidPublic() || !vapidPrivate()) {
      return json({ ok: false, error: 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets are not set.' }, 500);
    }
    const b = await req.json().catch(() => ({}));
    return json(await send({
      from: String(b?.from || ''), to: String(b?.to || ''), type: String(b?.type || ''),
      body: b?.body, ref: b?.ref, note: b?.note,
    }));
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
}

(globalThis as any).Deno?.serve(handle);
