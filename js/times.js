/* ===========================================================================
   times.js — dates, Hijri formatting, and prayer times.

   Times come from the Islamic Society of Tracy's published timetable
   (timetable.js). For a month we do not have on file, they are calculated
   with adhan.js using ISOT's own method, and flagged as estimated.

   Depends on the adhan UMD bundle (global `adhan`) and timetable.js.
   =========================================================================== */

const PRAYERS = [
  { key: 'fajr',    label: 'Fajr' },
  { key: 'dhuhr',   label: 'Dhuhr' },
  { key: 'asr',     label: 'Asr' },
  { key: 'maghrib', label: 'Maghrib' },
  { key: 'isha',    label: 'Isha' },
];

const PRAYER_LABEL = Object.fromEntries(PRAYERS.map((p) => [p.key, p.label]));

/* Only 'on_time' and 'late' are ever stored, and a late prayer is still a
   prayer prayed: it counts as positive everywhere. 'missed' is never stored;
   it is shown when a prayer is still empty after its window has closed. */
const STATUS_LABEL = {
  none:    'Not logged',
  on_time: 'On time',
  late:    'Late',
  missed:  'Missed',
};

const TIMES_SOURCE = 'Times from Islamic Society of Tracy';

/** The ISOT masjid. Times are always for here, never the device location. */
const ISOT = {
  name: 'Islamic Society of Tracy',
  latitude: 37.7646866,
  longitude: -121.4525833,
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

/* The long form does not fit beside the Hijri date on a phone. */
const fmtGregorianShort = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const fmtDayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

/* The tracker's header: "Friday, Oct 2". */
const fmtDayNav = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});
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

/* ---------------------------------------------------- published timetable -- */

/** "HH:MM" on the given local date, as a Date. */
function atLocalTime(key, hhmm) {
  const [y, m, d] = key.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}

/** The published row for a date, or null when that month is not on file. */
function timetableRow(key) {
  const [y, m, d] = key.split('-').map(Number);
  const month = TIMETABLE[`${y}-${String(m).padStart(2, '0')}`];
  return (month && month[d]) || null;
}

/* ---------------------------------------------------- calculated fallback -- */

/**
 * ISOT's published method: ISNA angles (Fajr 15, Isha 15), Hanafi Asr,
 * Maghrib nudged three minutes after sunset, rounded to the nearest minute.
 */
function isotParams() {
  const params = adhan.CalculationMethod.NorthAmerica();
  params.madhab = adhan.Madhab.Hanafi;
  params.adjustments.maghrib = 3;
  params.rounding = adhan.Rounding.Nearest;
  return params;
}

function calculatedTimes(key) {
  const coords = new adhan.Coordinates(ISOT.latitude, ISOT.longitude);
  const times = new adhan.PrayerTimes(coords, parseKey(key), isotParams());
  const out = {};
  for (const p of PRAYERS) out[p.key] = times[p.key];
  out.sunrise = times.sunrise;
  return out;
}

/* ------------------------------------------------------------- the times -- */

/**
 * Times for one local day.
 * Returns { times: { fajr: Date, ... }, estimated: boolean }.
 * `estimated` is true when the month is not in the published timetable.
 */
function timesFor(key) {
  const row = timetableRow(key);
  if (row) {
    const times = {};
    for (const p of PRAYERS) times[p.key] = atLocalTime(key, row[p.key]);
    if (row.sunrise) times.sunrise = atLocalTime(key, row.sunrise);
    return { times, estimated: false };
  }
  return { times: calculatedTimes(key), estimated: true };
}

/**
 * The next prayer from `now`, rolling over to tomorrow's Fajr after Isha.
 * Returns { key, label, time, tomorrow }.
 */
function nextPrayerFrom(now) {
  const today = timesFor(dateKey(now)).times;
  for (const p of PRAYERS) {
    if (today[p.key] > now) {
      return { key: p.key, label: p.label, time: today[p.key], tomorrow: false };
    }
  }
  const tomorrow = timesFor(addDays(dateKey(now), 1)).times;
  return { key: 'fajr', label: 'Fajr', time: tomorrow.fajr, tomorrow: true };
}

/**
 * When a prayer's window closes: the next prayer's time, or for Isha the next
 * day's Fajr. An empty prayer past this point shows as missed.
 */
function windowEnd(key, prayer) {
  const i = PRAYERS.findIndex((p) => p.key === prayer);
  return i < PRAYERS.length - 1
    ? timesFor(key).times[PRAYERS[i + 1].key]
    : timesFor(addDays(key, 1)).times.fajr;
}

/** The prayer currently in progress, or null before Fajr. */
function currentPrayerAt(now) {
  const today = timesFor(dateKey(now)).times;
  let current = null;
  for (const p of PRAYERS) if (today[p.key] <= now) current = p.key;
  return current;
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

/** Split countdown for the big desktop block. */
function untilParts(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}
