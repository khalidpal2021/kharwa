/* ===========================================================================
   times.js — dates, prayer times, Hijri formatting.
   Depends on the adhan UMD bundle (global `adhan`) and window.KHARWA_CONFIG.
   =========================================================================== */

const PRAYERS = [
  { key: 'fajr',    label: 'Fajr' },
  { key: 'dhuhr',   label: 'Dhuhr' },
  { key: 'asr',     label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha',    label: 'Isha' },
];

const PRAYER_LABEL = Object.fromEntries(PRAYERS.map((p) => [p.key, p.label]));

const STATUS_LABEL = {
  none:    'Not logged',
  on_time: 'On time',
  late:    'Late',
  missed:  'Missed',
};

/* ------------------------------------------------------- date key helpers -- */

/** Local-time YYYY-MM-DD. Deliberately not toISOString, which shifts to UTC. */
function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // noon, to dodge DST edges
}

function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

function todayKey() {
  return dateKey(new Date());
}

/* ----------------------------------------------------------- formatting ---- */

const fmtTime = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const fmtGregorian = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

const fmtDayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const fmtDateShort = new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' });

let fmtHijri;
try {
  fmtHijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
} catch {
  fmtHijri = null;
}

function hijriFor(date) {
  if (!fmtHijri) return '';
  // Some engines append "AH" already; normalise to a single trailing AH.
  const raw = fmtHijri.format(date).replace(/\s*AH\s*$/i, '');
  return `${raw} AH`;
}

function friendlyDay(key) {
  const today = todayKey();
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return fmtGregorian.format(parseKey(key));
}

/* --------------------------------------------------------------- location -- */

const COORDS_STORE = 'kharwa.coords';
const COORDS_TTL = 7 * 24 * 60 * 60 * 1000;

function cachedCoords() {
  try {
    const raw = localStorage.getItem(COORDS_STORE);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || Date.now() - saved.at > COORDS_TTL) return null;
    return saved;
  } catch {
    return null;
  }
}

/**
 * Resolve a location: cached device position, then a fresh one, then the
 * configured fallback. Always resolves — never rejects.
 */
function resolveLocation() {
  const fallback = {
    latitude: KHARWA_CONFIG.FALLBACK_LOCATION.latitude,
    longitude: KHARWA_CONFIG.FALLBACK_LOCATION.longitude,
    name: KHARWA_CONFIG.FALLBACK_LOCATION.name,
    exact: false,
  };

  const cached = cachedCoords();
  if (cached) {
    return Promise.resolve({
      latitude: cached.latitude,
      longitude: cached.longitude,
      name: 'your location',
      exact: true,
    });
  }

  if (!('geolocation' in navigator)) return Promise.resolve(fallback);

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const found = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          name: 'your location',
          exact: true,
        };
        try {
          localStorage.setItem(
            COORDS_STORE,
            JSON.stringify({ ...found, at: Date.now() })
          );
        } catch { /* private mode — fine, we just recompute next time */ }
        resolve(found);
      },
      () => resolve(fallback),
      { timeout: 8000, maximumAge: 60 * 60 * 1000 }
    );
  });
}

/* ---------------------------------------------------------- prayer times --- */

function calcParams(method, madhab) {
  const factory = adhan.CalculationMethod[method] || adhan.CalculationMethod.NorthAmerica;
  const params = factory();
  params.madhab = madhab === 'hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  return params;
}

/**
 * Times for one local day as { fajr: Date, dhuhr: Date, ... }.
 */
function prayerTimesFor(key, location, method, madhab) {
  const coords = new adhan.Coordinates(location.latitude, location.longitude);
  const times = new adhan.PrayerTimes(coords, parseKey(key), calcParams(method, madhab));
  const out = {};
  for (const p of PRAYERS) out[p.key] = times[p.key];
  return out;
}

/**
 * The next prayer from `now`, rolling over to tomorrow's Fajr after Isha.
 * Returns { key, label, time, tomorrow }.
 */
function nextPrayerFrom(now, location, method, madhab) {
  const today = prayerTimesFor(dateKey(now), location, method, madhab);
  for (const p of PRAYERS) {
    if (today[p.key] > now) {
      return { key: p.key, label: p.label, time: today[p.key], tomorrow: false };
    }
  }
  const tomorrow = prayerTimesFor(addDays(dateKey(now), 1), location, method, madhab);
  return { key: 'fajr', label: 'Fajr', time: tomorrow.fajr, tomorrow: true };
}

/** "2h 14m", "43m", "38s" */
function untilText(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `in ${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `in ${m}m`;
  return `in ${s}s`;
}
