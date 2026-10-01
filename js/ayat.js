/* ===========================================================================
   ayat.js — the Ayah of the Day.

   AYAT is a curated list of references only ("surah:ayah"). The text itself,
   Arabic (Uthmani) and the Sahih International translation, always comes from
   the Al-Quran Cloud API and is never written into this codebase.

   The day's ayah is picked from the local date, so both of us see the same one,
   and the API response is cached in localStorage under that date.

   The first ayah of a surah is left out (except Al-Fatiha's, which is the
   basmala itself): the API's Uthmani edition prefixes those with the basmala.
   =========================================================================== */

const AYAT = [
  // Prayer and remembrance
  '1:1', '2:45', '2:152', '2:153', '2:238', '4:103', '7:205', '11:114',
  '13:28', '17:78', '20:14', '20:132', '29:45', '33:41', '87:14',

  // Patience
  '2:155', '2:156', '2:214', '2:286', '3:200', '8:46', '11:115', '12:86',
  '16:127', '31:17', '39:10', '40:55', '52:48', '70:5', '94:5', '94:6',

  // Mercy and forgiveness
  '3:31', '3:135', '4:28', '4:110', '6:54', '7:156', '15:49', '21:107',
  '39:53', '40:60', '42:25', '55:60', '66:8', '85:14',

  // Gratitude
  '2:172', '14:7', '16:18', '16:53', '31:12', '39:66', '55:13', '93:11',

  // Trust in Allah
  '2:115', '2:255', '3:159', '3:173', '6:59', '8:2', '9:51', '9:129',
  '11:6', '13:11', '20:46', '24:35', '25:58', '33:3', '42:11', '50:16',
  '57:3', '57:4', '59:22', '64:11', '65:3',

  // Marriage and family
  '2:201', '7:189', '13:23', '14:41', '16:72', '17:23', '17:24', '25:74',
  '30:21', '31:14', '36:56', '43:70', '46:15', '52:21', '66:6',

  // Hope
  '2:186', '3:139', '3:185', '10:62', '12:87', '15:56', '16:97', '18:46',
  '29:69', '41:30', '89:27', '89:28', '93:3', '93:4', '93:5', '99:7',

  // Character
  '2:83', '2:261', '3:92', '3:134', '4:36', '16:90', '17:37', '25:63',
  '31:18', '31:19', '33:21', '41:34', '49:10', '49:13', '64:16', '68:4',

  // Supplications
  '3:8', '3:193', '6:162', '7:23', '14:40', '17:80', '18:10', '20:25',
  '20:114', '21:83', '21:87', '21:89', '23:118', '28:24', '59:10', '71:28',

  // Reflection
  '3:26', '3:190', '3:191', '30:22', '51:56', '55:27', '67:2',
];

const AYAH_STORE = 'kharwa.ayah.';
const AYAH_API = 'https://api.alquran.cloud/v1/ayah/';

/** Same reference for everyone on the same local date. */
function ayahRefFor(key) {
  const [y, m, d] = key.split('-').map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  return AYAT[day % AYAT.length];
}

function cachedAyah(key) {
  try {
    const hit = JSON.parse(localStorage.getItem(AYAH_STORE + key));
    return hit && hit.ref === ayahRefFor(key) ? hit : null;
  } catch {
    return null;
  }
}

/** Keep only today's entry. */
function storeAyah(key, ayah) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(AYAH_STORE) && k !== AYAH_STORE + key) localStorage.removeItem(k);
    }
    localStorage.setItem(AYAH_STORE + key, JSON.stringify(ayah));
  } catch { /* private mode or full: just don't cache */ }
}

/**
 * The ayah for a date: { ref, arabic, english, surah, number }.
 * From the cache when we have it, otherwise one API call. Throws on failure.
 */
async function loadAyah(key) {
  const hit = cachedAyah(key);
  if (hit) return hit;

  const ref = ayahRefFor(key);
  const res = await fetch(`${AYAH_API}${ref}/editions/quran-uthmani,en.sahih`);
  if (!res.ok) throw new Error(`Ayah request failed: ${res.status}`);
  const body = await res.json();

  const editions = Array.isArray(body.data) ? body.data : [];
  const arabic = editions.find((e) => e.edition?.identifier === 'quran-uthmani');
  const english = editions.find((e) => e.edition?.identifier === 'en.sahih');
  if (!arabic?.text || !english?.text) throw new Error('Ayah response incomplete');

  const ayah = {
    ref,
    arabic: arabic.text,
    english: english.text,
    surah: arabic.surah.englishName,
    number: `${arabic.surah.number}:${arabic.numberInSurah}`,
  };
  storeAyah(key, ayah);
  return ayah;
}
