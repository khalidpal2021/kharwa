/* ===========================================================================
   sw.js — the service worker that makes Kharwa installable and usable offline.

   - The app itself (the page, js/, styles.css, config.js, the manifest) is
     network-first: a new push shows up on the next open, and the cached copy
     is only used when the network is not there.
   - Fonts, icons, the position pictures and the pinned CDN libraries are
     cache-first: they never change under the same URL.
   - Anything else — Supabase, the Qur'an, hadith and audio APIs — is left
     alone and goes straight to the network.
   - Offline, a page load gets the cached app, or failing that a short
     "You're offline" page.

   It also shows the prayer reminders pushed by the send-reminders Edge
   Function, and opens Kharwa on the Prayer tab when one is tapped.

   Bump VERSION to drop every cache when the strategy itself changes; a normal
   push does not need it, since the app files are network-first.
   =========================================================================== */

const VERSION = 'v6';
const APP_CACHE = `kharwa-app-${VERSION}`;
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
    const keep = new Set([APP_CACHE, STATIC_CACHE]);
    for (const key of await caches.keys()) {
      if (key.startsWith('kharwa-') && !keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(page(req));
    } else if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(req));
    } else if (/\.(js|css|webmanifest|json)$/.test(url.pathname)) {
      event.respondWith(networkFirst(req));
    }
    return;
  }

  if (STATIC_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(req));
  // everything else: not ours to cache
});

/* --------------------------------------------------------- reminders --- */

/* A prayer reminder from the send-reminders Edge Function:
   { title, body, url, tag }. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Kharwa', {
    body: data.body || '',
    tag: data.tag || 'kharwa',
    icon: '/icons/icon-192.png?v=2',
    badge: '/icons/icon-192.png?v=2',
    data: { url: data.url || '/#/prayer' },
  }));
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

/** The network, revalidated past the browser cache; the cached copy offline. */
async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

/** A page load: the network first, then the cached app, then the offline page.
    Every route is the one page, since routing is in the hash. */
async function page(req) {
  try {
    return await networkFirst(req);
  } catch {
    const cache = await caches.open(APP_CACHE);
    return (await cache.match('/index.html')) || (await cache.match('/'))
      || new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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
