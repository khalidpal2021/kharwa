/* ===========================================================================
   sw.js — the service worker that makes Kharwa installable and usable offline.

   - The app itself (the page, js/, styles.css, config.js, the manifest) is
     served from one complete snapshot, so a page always runs files of the
     same version, including the tabs' code it loads later (lazy.js). Each
     open checks behind the scenes whether any file has changed; if so, the
     whole new set is fetched into a second cache, the app offers "Updated,
     tap to refresh" (install.js), and the next page load switches to it.
     Files were once refreshed one by one, which could pair new code with an
     old stylesheet; this is why they are not.
   - A new sw.js takes over at once and reloads any open Kharwa page once,
     so no page goes on with the old worker's files beside the new worker's.
     (Waiting for a tap did not work: pages from before that change cannot
     show the tap, and stayed on the old worker, mixing files.) A first
     install, with no older version, reloads nothing.
   - Fonts, icons, the position pictures and the pinned CDN libraries are
     cache-first: they never change under the same URL.
   - Anything else — Supabase, the Qur'an, hadith and audio APIs — is left
     alone and goes straight to the network.
   - Offline, a page load gets the cached app, or failing that a short
     "You're offline" page.

   It also shows the prayer reminders pushed by the send-reminders Edge
   Function, and opens Kharwa on the Prayer tab when one is tapped.

   Bump VERSION to drop every cache when the strategy itself changes; a normal
   push does not need it, since every open checks for new app files. Every
   app file must be in APP_SHELL, which is what a snapshot holds.
   =========================================================================== */

const VERSION = 'v11';
const APP_CACHE = `kharwa-app-${VERSION}`;     // the snapshot pages are served from
const NEXT_CACHE = `kharwa-next-${VERSION}`;    // a newer one, used from the next page load
const NEXT_READY = '/__kharwa-next-complete';    // marks NEXT_CACHE as whole
const STATIC_CACHE = `kharwa-static-${VERSION}`;

/* Fetched on install, so the app opens offline after the first visit. */
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/config.js',
  '/manifest.webmanifest',
  '/js/timetable.js',
  '/js/times.js',
  '/js/data.js',
  '/js/ayat.js',
  '/js/store.js',
  '/js/info.js',
  '/js/router.js',
  '/js/lazy.js',
  '/js/month.js',
  '/js/quran.js',
  '/js/ayah-sheet.js',
  '/js/hadith.js',
  '/js/learn-content.js',
  '/js/learn-audio.js',
  '/js/learn.js',
  '/js/install.js',
  '/js/reminders.js',
  '/js/us-presets.js',
  '/js/us.js',
  '/js/app.js',
];

/* Hosts whose files never change under the same URL. */
const STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

const OFFLINE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FAFAF8"><title>Kharwa</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #FAFAF8;
         color: #1A1A1A; font: 15px/1.7 Georgia, serif; text-align: center; padding: 24px; }
  h1 { font-weight: 400; font-size: 30px; margin: 0 0 8px; }
  p { color: #6B6B6B; margin: 0 0 20px; }
  button { font: inherit; padding: 10px 22px; border: 0; border-radius: 6px; background: #B8860B; color: #fff; }
</style></head>
<body><div><h1>You&rsquo;re offline</h1><p>Kharwa will be back when you are connected.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // One at a time, so a single missing file does not stop the install.
    await Promise.all(APP_SHELL.map((url) =>
      fetch(url, { cache: 'no-cache' })
        .then((res) => (res.ok ? cache.put(url, res) : null))
        .catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([APP_CACHE, NEXT_CACHE, STATIC_CACHE]);
    let upgraded = false;
    for (const key of await caches.keys()) {
      if (key.startsWith('kharwa-') && !keep.has(key)) {
        if (key.startsWith('kharwa-app-')) upgraded = true;
        await caches.delete(key);
      }
    }
    await self.clients.claim();
    // An older version was here: its open pages may hold its files. Load them
    // again, once, so every page runs one matching set.
    if (upgraded) {
      for (const win of await self.clients.matchAll({ type: 'window' })) {
        win.navigate(win.url).catch(() => {});
      }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(page(event));
    } else if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(req));
    } else if (/\.(js|css|webmanifest|json)$/.test(url.pathname)) {
      event.respondWith(appFile(req));
    }
    return;
  }

  if (STATIC_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(req));
  // everything else: not ours to cache
});

/* --------------------------------------------------------- reminders --- */

/* A prayer reminder from the send-reminders Edge Function:
   { title, body, url, tag }. */
/* Title-only: everything is in the title and the body stays empty (no
   fallback text is added here), so iOS shows one bold line with "from
   Kharwa" under it. A tag replaces an earlier notification for the same
   prayer or note; `renotify` makes the replacement alert again. A note
   carries the unread count, shown on the app icon where that works. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: event.data?.text() }; }
  const tag = data.tag || 'kharwa';
  const shown = self.registration.showNotification(data.title || 'Kharwa', {
    body: '',
    tag,
    renotify: Boolean(data.renotify) && tag !== 'kharwa',
    icon: '/icons/icon-192.png?v=2',
    badge: '/icons/icon-192.png?v=2',
    data: { url: data.url || '/#/prayer' },
  });
  const badge = Number.isInteger(data.badge) && navigator.setAppBadge
    ? navigator.setAppBadge(data.badge).catch(() => {})
    : null;
  event.waitUntil(Promise.all([shown, badge]));
});

/* A tap opens Kharwa where the notification points: the Prayer tab for a
   reminder or a nudge, the Us tab at that message for a message. An open
   window is brought forward and told where to go (install.js), rather than
   reloaded. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/#/prayer', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const win of wins) {
      if (new URL(win.url).origin !== self.location.origin) continue;
      await win.focus();
      win.postMessage({ type: 'kharwa-open', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

/* ---------------------------------------------------------- strategies --- */

/** What identifies a version of a file: its ETag, else Last-Modified and
    length. Two responses with the same are the same file. */
function versionOf(res) {
  const h = res.headers;
  return h.get('etag') || `${h.get('last-modified') || ''}|${h.get('content-length') || ''}`;
}

/** A newer snapshot is ready: tell the open windows. */
async function announceUpdate() {
  for (const win of await self.clients.matchAll({ type: 'window' })) win.postMessage({ type: 'kharwa-updated' });
}

/** An app file, from the snapshot the page belongs to. Only a file the
    snapshot lacks comes from the network, and is added to it. */
async function appFile(req) {
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

let checking = null;
let checkedAt = 0;

/**
 * Whether any app file has changed since the snapshot. If one has, the whole
 * new set goes into NEXT_CACHE, marked complete only once every file is in,
 * and the open windows are told. Asks with no-cache, so an unchanged file
 * costs only a small 304. At most once a minute.
 */
function checkForUpdate() {
  if (checking || Date.now() - checkedAt < 60_000) return checking || Promise.resolve();
  checkedAt = Date.now();
  checking = (async () => {
    const current = await caches.open(APP_CACHE);
    const fresh = await Promise.all(APP_SHELL.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        return res.ok ? { url, res } : null;
      } catch { return null; }
    }));
    if (fresh.some((f) => !f)) return; // offline or a file missing: try another time
    let changed = false;
    for (const { url, res } of fresh) {
      const had = await current.match(url);
      if (!had || versionOf(had) !== versionOf(res)) { changed = true; break; }
    }
    if (!changed) return;
    await caches.delete(NEXT_CACHE);
    const next = await caches.open(NEXT_CACHE);
    for (const { url, res } of fresh) await next.put(url, res);
    await next.put(NEXT_READY, new Response('1'));
    announceUpdate();
  })().finally(() => { checking = null; });
  return checking;
}

/** A page load is where a waiting snapshot takes over, whole. */
async function promoteNext() {
  if (!(await caches.has(NEXT_CACHE))) return;
  const next = await caches.open(NEXT_CACHE);
  if (!(await next.match(NEXT_READY))) return;
  const current = await caches.open(APP_CACHE);
  for (const req of await next.keys()) {
    if (new URL(req.url).pathname === NEXT_READY) continue;
    await current.put(req, await next.match(req));
  }
  await caches.delete(NEXT_CACHE);
}

/** A page load: every route is the one page (routing is in the hash). A
    complete newer snapshot takes over first; the page then comes from the
    snapshot at once, and a check for changes runs behind it. With nothing
    cached, the network; offline as well, a short offline page. */
async function page(event) {
  await promoteNext();
  const cache = await caches.open(APP_CACHE);
  const cached = (await cache.match('/', { ignoreSearch: true })) || (await cache.match('/index.html'));
  if (cached) {
    event.waitUntil(checkForUpdate().catch(() => {}));
    return cached;
  }
  try {
    const res = await fetch(event.request, { cache: 'no-cache' });
    if (res.ok) cache.put('/', res.clone());
    return res;
  } catch {
    return new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

/** The cache if it has it; otherwise the network, kept for next time. */
async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // opaque responses (cross-origin without CORS) are kept too: fonts load that way
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
