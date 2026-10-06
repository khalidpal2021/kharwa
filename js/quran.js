/* ===========================================================================
   quran.js — the Quran section: surah list, juz list, bookmarks, the reader,
   reading progress.

   All Arabic, transliteration and translation text comes from the Al-Quran
   Cloud API and is never written into this codebase. Each edition of each
   surah is cached in IndexedDB on its own, so a surah opens instantly, and
   without a connection, after its first load, and switching translation
   fetches only the new one.

   Routes:  #/quran           the surah list (with Juz and Bookmarks tabs)
            #/quran/18        Al-Kahf, from the top
            #/quran/2/255     Al-Baqarah, scrolled to ayah 255

   Depends on store.js, router.js, data.js and, at run time, app.js (el, esc,
   name, toast, State).
   =========================================================================== */

const QURAN_API = 'https://api.alquran.cloud/v1/';
const QURAN_SETTINGS_STORE = 'kharwa.quran.settings';
const QURAN_POSITION_STORE = 'kharwa.quran.position.';   // + person
const QURAN_SIZES = ['s', 'm', 'l'];
const QURAN_ARABIC = 'quran-uthmani';
const QURAN_TRANSLIT = 'en.transliteration';

/* The translations on offer. Labels are ours; the text is the API's. */
const QURAN_TRANSLATIONS = [
  { id: 'en.sahih',     label: 'Sahih International' },
  { id: 'en.asad',      label: 'Muhammad Asad' },
  { id: 'en.pickthall', label: 'Pickthall' },
  { id: 'ur.jalandhry', label: 'Urdu - Jalandhry', lang: 'ur', rtl: true },
];

/* ---------------------------------------------------------------- cache --- */

/* Same database name as before, so surahs already cached stay cached. */
const QuranCache = new IdbStore('kharwa-quran');

async function quranFetch(path) {
  const res = await fetch(QURAN_API + path);
  if (!res.ok) throw new Error(`Quran request failed: ${res.status}`);
  const body = await res.json();
  if (body.code !== 200 || !body.data) throw new Error('Quran response incomplete');
  return body.data;
}

/* -------------------------------------------------------------- helpers --- */

/** Arabic letters only, so text can be compared regardless of diacritics. */
function arabicBase(text) {
  return text
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The API starts ayah 1 of most surahs with the basmala, in the Uthmani text
 * only (transliteration and translations don't). Split it off, using
 * Al-Fatihah's first ayah from the same API as the reference. Returns the rest
 * of the ayah, or null when the basmala is not there.
 */
function splitBasmala(text, basmala) {
  const words = basmala.trim().split(/\s+/).length;
  const head = text.match(new RegExp(`^\\s*(?:\\S+\\s+){${words}}`));
  if (!head || arabicBase(head[0]) !== arabicBase(basmala)) return null;
  return text.slice(head[0].length);
}

/** Transliterations vary (Al-Baqara / Al-Baqarah, Yaseen / Ya-Sin), so fold them. */
function foldLatin(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo|ou/g, 'u')
    .replace(/h$/, '');
}

const fmtArabicDigits = new Intl.NumberFormat('ar-EG', { useGrouping: false });

/* Leading articles dropped when matching surah names loosely: "Al-Kahf",
   "an-Nas", "ash-Shams". */
const QURAN_ARTICLES = ['al', 'an', 'ar', 'as', 'ash', 'at', 'ad', 'adh', 'az', 'ath'];

/** A surah name reduced for loose matching: no case, diacritics,
    apostrophes, hyphens or leading article, and transliteration folded. */
function surahKey(text) {
  const tokens = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/['\u2018\u2019`\u02BF\u02BE]/g, '')
    .split(/[\s\-_]+/).filter(Boolean);
  if (tokens.length > 1 && QURAN_ARTICLES.includes(tokens[0])) tokens.shift();
  return foldLatin(tokens.join(''));
}

/** Search results: the keyword's occurrences wrapped in <mark>, the rest escaped. */
function markKeyword(text, keyword) {
  const words = keyword.trim().split(/\s+/).filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return esc(text);
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? `<mark class="qr-mark">${esc(part)}</mark>` : esc(part))).join('');
}

function translationOf(id) {
  return QURAN_TRANSLATIONS.find((t) => t.id === id) || QURAN_TRANSLATIONS[0];
}

const QURAN_HINT_STORE = 'kharwa.quran.bookmarkHintDone';

/* The eight-pointed star (two squares) of the ayah marker. */
const QURAN_STAR_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
  <rect class="qr-num-star" x="9" y="9" width="22" height="22"/>
  <rect class="qr-num-star" x="9" y="9" width="22" height="22" transform="rotate(45 20 20)"/>
  <circle class="qr-num-ring" cx="20" cy="20" r="10.5"/>
</svg>`;

/* ---------------------------------------------------------------- state --- */

const Quran = {
  ready: false,
  surahs: null,             // [{ number, name, englishName, meaning, ayahs, type }]
  juzs: null,               // [{ surah, ayah }] where each of the 30 juz starts
  surah: null,              // the surah open in the reader (list entry shape)
  layers: {},               // edition id -> [text per ayah], for the open surah
  basmala: null,            // Al-Fatihah 1:1 in each loaded edition
  progress: {},             // person -> { surah, ayah, updated_at }
  bookmarks: [],            // mine, newest first: [{ surah, ayah }]
  bookmarkSet: new Set(),   // "surah:ayah"
  remoteLoaded: false,
  tab: 'surahs',
  find: null,               // what the search box resolves to (see parseQuery)
  search: null,             // { q, edition, status, count, matches } keyword results
  previewTimer: null,
  settings: { size: 'm', arabic: true, translit: false, translation: true, edition: 'en.sahih' },
  observer: null,
  reading: null,            // { surah, ayah } most recently in view
  saveTimer: null,
  openToken: 0,

  /* ------------------------------------------------------------- data --- */

  async loadSurahList() {
    if (this.surahs) return this.surahs;
    let list = await QuranCache.get('surahs');
    if (!list) {
      const data = await quranFetch('surah');
      list = data.map((s) => ({
        number: s.number,
        name: s.name,
        englishName: s.englishName,
        meaning: s.englishNameTranslation,
        ayahs: s.numberOfAyahs,
        type: s.revelationType,
      }));
      if (list.length !== 114) throw new Error('Surah list incomplete');
      QuranCache.put('surahs', list);
    }
    this.surahs = list;
    return list;
  },

  /** Where each juz starts, from the API's meta data. */
  async loadJuzs() {
    if (this.juzs) return this.juzs;
    let refs = await QuranCache.get('juzs');
    if (!refs) {
      const meta = await quranFetch('meta');
      refs = (meta.juzs?.references || []).map((r) => ({ surah: r.surah, ayah: r.ayah }));
      if (refs.length !== 30) throw new Error('Juz data incomplete');
      QuranCache.put('juzs', refs);
    }
    this.juzs = refs;
    return refs;
  },

  /**
   * The texts of some editions of one surah: { editionId: [text, ...] }.
   * Cached per edition. Missing ones come in a single request, and a surah
   * cached before editions were split (Uthmani + Sahih together) is reused.
   */
  async loadEditions(n, ids) {
    const out = {};
    let missing = [];
    for (const id of ids) {
      const texts = await QuranCache.get(`text:${id}:${n}`);
      if (texts) out[id] = texts;
      else missing.push(id);
    }

    if (missing.length) {
      const legacy = await QuranCache.get(`surah:${n}`);
      if (legacy?.ayahs?.length) {
        const from = { [QURAN_ARABIC]: legacy.ayahs.map((a) => a.ar), 'en.sahih': legacy.ayahs.map((a) => a.en) };
        for (const id of missing.filter((m) => from[m])) {
          out[id] = from[id];
          QuranCache.put(`text:${id}:${n}`, from[id]);
        }
        missing = missing.filter((m) => !from[m]);
      }
    }

    if (missing.length) {
      const data = await quranFetch(`surah/${n}/editions/${missing.join(',')}`);
      const editions = Array.isArray(data) ? data : [data];
      for (const id of missing) {
        const ed = editions.find((e) => e.edition?.identifier === id);
        if (!ed?.ayahs?.length) throw new Error(`Edition ${id} missing`);
        out[id] = ed.ayahs.map((a) => a.text);
        QuranCache.put(`text:${id}:${n}`, out[id]);
      }
    }
    return out;
  },

  /** The editions the current settings need. Arabic always loads: it carries
      the ayah count and the basmala check. */
  neededEditions() {
    const { translit, translation, edition } = this.settings;
    return [QURAN_ARABIC, ...(translit ? [QURAN_TRANSLIT] : []), ...(translation ? [edition] : [])];
  },

  surahName(n) {
    return this.surahs?.[n - 1]?.englishName || `Surah ${n}`;
  },

  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(QURAN_SETTINGS_STORE)) || {};
      const s = this.settings;
      if (QURAN_SIZES.includes(saved.size)) s.size = saved.size;
      if ('arabicOnly' in saved) {
        // The older two-button settings: carry them over.
        s.arabic = true;
        s.translation = saved.arabicOnly ? false : saved.translation !== false;
      } else {
        for (const k of ['arabic', 'translit', 'translation']) {
          if (typeof saved[k] === 'boolean') s[k] = saved[k];
        }
      }
      if (QURAN_TRANSLATIONS.some((t) => t.id === saved.edition)) s.edition = saved.edition;
      if (!s.arabic && !s.translit && !s.translation) s.arabic = true;
    } catch { /* defaults */ }
  },

  saveSettings() {
    try {
      localStorage.setItem(QURAN_SETTINGS_STORE, JSON.stringify(this.settings));
    } catch { /* per session only */ }
  },

  localPosition(person) {
    try {
      return JSON.parse(localStorage.getItem(QURAN_POSITION_STORE + person));
    } catch {
      return null;
    }
  },

  /** My position: whichever of this device's copy and Supabase's is newer. */
  myPosition() {
    const local = this.localPosition(State.me);
    const remote = this.progress[State.me];
    if (!local) return remote || null;
    if (!remote) return local;
    return new Date(local.updated_at) > new Date(remote.updated_at) ? local : remote;
  },

  /** Progress and bookmarks from Supabase. Missing tables or no connection:
      carry on with what this device knows. */
  async refreshRemote() {
    try {
      this.progress = await Data.loadQuranProgress();
    } catch { /* keep local */ }
    try {
      this.bookmarks = await Data.loadBookmarks(State.me);
      this.bookmarkSet = new Set(this.bookmarks.map((b) => `${b.surah}:${b.ayah}`));
    } catch { /* keep what we have */ }
    this.remoteLoaded = true;
    this.renderContinue();
    this.renderBookmarks();
    this.renderSurahList();
    this.refreshMarkers();
    this.renderHint();
  },

  /* ---------------------------------------------------------- routing --- */

  show(params) {
    if (!this.ready) this.init();
    const n = Number(params[0]);
    if (params.length && Number.isInteger(n) && n >= 1 && n <= 114) {
      // "255" or a range, "255-257"
      const [, a, b] = String(params[1] || '').match(/^(\d+)(?:-(\d+))?$/) || [];
      const from = Number(a) >= 1 ? Number(a) : null;
      const to = from && Number(b) > from ? Number(b) : null;
      this.openReader(n, from, to);
    } else {
      if (params.length) history.replaceState(null, '', '#/quran');
      this.openList();
    }
    if (!this.remoteLoaded) this.refreshRemote();
  },

  init() {
    this.ready = true;
    this.loadSettings();

    el('qr-search').addEventListener('input', () => this.renderSurahList());
    el('qr-search').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (this.find?.kind === 'ref' && !this.find.error) location.hash = this.find.href;
      else if (this.find?.kind === 'keyword') this.runSearch(this.find.q);
    });
    el('qr-find').addEventListener('click', (event) => {
      if (event.target.closest('.qr-find-search')) this.runSearch(this.find.q);
    });

    for (const tab of document.querySelectorAll('.qr-tab')) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
    }

    el('qr-bookmark-list').addEventListener('click', (event) => {
      const remove = event.target.closest('.qr-bm-remove');
      if (remove) this.toggleBookmark(Number(remove.dataset.surah), Number(remove.dataset.ayah));
    });

    // The star bookmarks; anywhere else on an ayah opens its context.
    el('qr-text').addEventListener('click', (event) => {
      const num = event.target.closest('.qr-num');
      if (num) {
        this.toggleBookmark(this.surah.number, Number(num.dataset.ayah));
        return;
      }
      const ayah = event.target.closest('.qr-ayah');
      if (!ayah || String(window.getSelection?.() || '').trim()) return; // selecting text, not tapping
      AyahSheet.openAt(this.surah.number, Number(ayah.dataset.ayah));
    });
    el('qr-text').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !event.target.matches('.qr-ayah')) return;
      event.preventDefault();
      AyahSheet.openAt(this.surah.number, Number(event.target.dataset.ayah));
    });

    // Reading options
    el('qr-edition').innerHTML = QURAN_TRANSLATIONS
      .map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
    for (const chip of document.querySelectorAll('.qr-size .qr-chip')) {
      chip.addEventListener('click', () => this.changeSettings({ size: chip.dataset.size }));
    }
    for (const chip of document.querySelectorAll('.qr-layers .qr-chip')) {
      chip.addEventListener('click', () => this.toggleLayer(chip.dataset.layer));
    }
    el('qr-edition').addEventListener('change', (event) =>
      this.changeSettings({ edition: event.target.value, translation: true }));

    // On a phone the options fold behind "Aa".
    el('qr-aa').addEventListener('click', () => this.toggleOptions());
    document.addEventListener('click', (event) => {
      if (!el('qr-bar').contains(event.target)) this.toggleOptions(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.toggleOptions(false);
    });

    // Leaving the tab is a good moment to save where we are.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushPosition();
    });
  },

  /* ------------------------------------------------------------- list --- */

  async openList() {
    this.stopTracking();
    el('qr-reader-view').hidden = true;
    el('qr-list-view').hidden = false;
    this.renderContinue();
    this.showTab(this.tab);

    const status = el('qr-list-status');
    try {
      await this.loadSurahList();
      status.hidden = true;
      this.renderSurahList();
      this.renderContinue();
      this.renderBookmarks();
    } catch {
      status.textContent = 'The surah list could not be loaded. Check your connection and try again.';
      status.hidden = false;
    }
  },

  showTab(tab) {
    this.tab = tab;
    for (const t of document.querySelectorAll('.qr-tab')) {
      const on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      el(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (tab === 'juz') this.renderJuzList();
    if (tab === 'bookmarks') this.renderBookmarks();
  },

  renderContinue() {
    const mine = this.myPosition();
    if (mine) {
      el('qr-continue-title').textContent = `${this.surahName(mine.surah)} · ayah ${mine.ayah}`;
      el('qr-continue-sub').textContent = 'Pick up where you left off';
      el('qr-continue-link').href = `#/quran/${mine.surah}/${mine.ayah}`;
    } else {
      el('qr-continue-title').textContent = this.surahName(1);
      el('qr-continue-sub').textContent = 'Begin at the opening';
      el('qr-continue-link').href = '#/quran/1';
    }

    const other = PEOPLE_IDS.find((p) => p !== State.me);
    const theirs = this.progress[other];
    el('qr-other').hidden = !theirs;
    if (theirs) {
      el('qr-other').textContent =
        `${name(other)} is reading ${this.surahName(theirs.surah)} · ayah ${theirs.ayah}`;
    }
  },

  renderSurahList() {
    if (!this.surahs) return;
    const q = el('qr-search').value.trim();
    const digits = /^\d+$/.test(q);
    const folded = foldLatin(q);
    const arabic = arabicBase(q);
    const readingSurah = this.myPosition()?.surah;

    const rows = this.surahs.filter((s) => {
      if (!q) return true;
      if (digits) return String(s.number).startsWith(q);
      return (folded && (foldLatin(s.englishName).includes(folded) || foldLatin(s.meaning).includes(folded)))
        || (arabic && /[\u0600-\u06FF]/.test(q) && arabicBase(s.name).includes(arabic));
    });

    el('qr-surah-list').innerHTML = rows.map((s) => `
      <li>
        <a class="qr-surah" href="#/quran/${s.number}">
          <span class="qr-surah-num" aria-hidden="true"><span>${s.number}</span></span>
          <span class="qr-surah-main">
            <span class="qr-surah-en">${esc(s.englishName)}${s.number === readingSurah
              ? ' <span class="qr-reading-tag">Reading</span>' : ''}</span>
            <span class="qr-surah-meaning">${esc(s.meaning)}</span>
            <span class="qr-surah-meta">${esc(s.type)} · ${s.ayahs} ayat</span>
          </span>
          <span class="qr-surah-ar" lang="ar" dir="rtl">${esc(s.name)}</span>
        </a>
      </li>`).join('');

    this.find = this.parseQuery(q, rows.length);
    this.renderFind();

    const status = el('qr-list-status');
    status.hidden = rows.length > 0 || !!this.find;
    if (!status.hidden) status.textContent = 'No surah matches that search.';
  },

  /* ------------------------------------------------------------ search --- */

  /** A surah from a loosely written name, or null if none or several match. */
  surahByName(name) {
    const key = surahKey(name);
    if (!key || !this.surahs) return null;
    const keyed = this.surahs.map((s) => ({ s, k: surahKey(s.englishName) }));
    for (const test of [(k) => k === key, (k) => k.startsWith(key), (k) => k.includes(key)]) {
      const hits = keyed.filter((x) => test(x.k));
      if (hits.length === 1) return hits[0].s;
      if (hits.length > 1) return null;
    }
    return null;
  },

  /**
   * What the search box holds, beyond surah names:
   *   { kind: 'ref', surah, from, to, href, error }  — "2:34", "2 34", "2.34",
   *     "2/34", "baqarah 34", "al-baqarah:34", "Baqara 2:34", "2:255-257"
   *   { kind: 'keyword', q }  — when nothing else matches
   *   null  — a plain surah filter, or too short to search for
   */
  parseQuery(q, surahRows) {
    if (!q || !this.surahs) return null;
    const range = '(\\d{1,3})(?:\\s*[-\\u2013]\\s*(\\d{1,3}))?';
    let surah = null;
    let from;
    let to;

    const numeric = q.match(new RegExp(`^(\\d{1,3})\\s*[:./\\s]\\s*${range}$`));
    const named = !numeric && q.match(new RegExp(`^(.*?\\p{L}.*?)\\s*[\\s:./]\\s*(?:(\\d{1,3})\\s*[:./\\s]\\s*)?${range}$`, 'u'));

    if (numeric) {
      surah = Number(numeric[1]);
      [from, to] = [numeric[2], numeric[3]];
      if (surah < 1 || surah > 114) return { kind: 'ref', error: 'There are 114 surahs.' };
    } else if (named) {
      const byName = this.surahByName(named[1]);
      const byNumber = named[2] ? Number(named[2]) : null;
      if (!byName || (byNumber && byNumber !== byName.number)) {
        return surahRows ? null : { kind: 'keyword', q };
      }
      surah = byName.number;
      [from, to] = [named[3], named[4]];
    } else {
      return surahRows || q.length < 2 || /^\d+$/.test(q) ? null : { kind: 'keyword', q };
    }

    const s = this.surahs[surah - 1];
    from = Number(from);
    to = to === undefined ? null : Number(to);
    if (from < 1 || (to !== null && to < from)) return { kind: 'ref', error: 'That ayah range doesn\'t look right.' };
    if (from > s.ayahs || (to !== null && to > s.ayahs)) {
      return { kind: 'ref', error: `${s.englishName} has ${s.ayahs} ayat` };
    }
    if (to === from) to = null;
    return {
      kind: 'ref',
      surah,
      from,
      to,
      label: `${surah}:${from}${to ? `-${to}` : ''}`,
      href: `#/quran/${surah}/${from}${to ? `-${to}` : ''}`,
      error: null,
    };
  },

  /** The area above the surah list: a Go to card, a hint, the offer to search
      the translation, or its results. */
  renderFind() {
    const box = el('qr-find');
    const f = this.find;
    clearTimeout(this.previewTimer);

    if (!f) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;

    if (f.kind === 'ref' && f.error) {
      box.innerHTML = `<p class="qr-find-msg">${esc(f.error)}</p>`;
      return;
    }

    if (f.kind === 'ref') {
      const t = translationOf(this.settings.edition);
      box.innerHTML = `
        <a class="qr-go" href="${f.href}">
          <span class="qr-go-kicker">Go to</span>
          <span class="qr-go-head">
            <span class="qr-go-name">${esc(this.surahName(f.surah))}</span>
            <span class="qr-go-ref">${f.label}</span>
          </span>
          <span id="qr-go-preview" class="qr-go-preview${t.rtl ? ' is-rtl' : ''}"${t.rtl ? ` lang="${t.lang}" dir="rtl"` : ''}>&nbsp;</span>
        </a>`;
      // The preview waits for typing to settle.
      this.previewTimer = setTimeout(() => this.fillPreview(f), 250);
      return;
    }

    // keyword
    const s = this.search;
    const edition = this.settings.edition;
    if (!s || s.q !== f.q || s.edition !== edition) {
      box.innerHTML = `<button class="qr-find-search" type="button">
          Search the translation for &lsquo;${esc(f.q)}&rsquo;
        </button>`;
      return;
    }
    if (s.status === 'loading') {
      box.innerHTML = `<p class="qr-find-msg" role="status">Searching&hellip;</p>`;
      return;
    }
    if (s.status === 'error') {
      box.innerHTML = `<p class="qr-find-msg" role="status">The search could not be completed. Check your connection and try again.</p>`;
      return;
    }
    if (!s.count) {
      box.innerHTML = `<p class="qr-find-msg" role="status">No ayat found for &lsquo;${esc(s.q)}&rsquo; in ${esc(translationOf(edition).label)}.</p>`;
      return;
    }
    const shown = s.matches.slice(0, 50);
    const t = translationOf(edition);
    box.innerHTML = `
      <p class="qr-find-count" role="status">${s.count} ${s.count === 1 ? 'ayah' : 'ayat'} mention &lsquo;${esc(s.q)}&rsquo;${s.count > 50 ? ' · showing the first 50' : ''}</p>
      <ol class="qr-results">${shown.map((m) => `
        <li>
          <a class="qr-result" href="#/quran/${m.surah}/${m.ayah}">
            <span class="qr-result-ref">${esc(this.surahName(m.surah))} · ${m.surah}:${m.ayah}</span>
            <span class="qr-result-text${t.rtl ? ' is-rtl' : ''}"${t.rtl ? ` lang="${t.lang}" dir="rtl"` : ''}>${markKeyword(m.text, s.q)}</span>
          </a>
        </li>`).join('')}</ol>`;
  },

  /** One line of the referenced ayah's translation, cached. Quiet on failure. */
  async fillPreview(f) {
    const edition = this.settings.edition;
    try {
      let text = (await QuranCache.get(`text:${edition}:${f.surah}`))?.[f.from - 1];
      if (!text) text = await QuranCache.get(`ayah:${edition}:${f.surah}:${f.from}`);
      if (!text) {
        text = (await quranFetch(`ayah/${f.surah}:${f.from}/${edition}`)).text;
        QuranCache.put(`ayah:${edition}:${f.surah}:${f.from}`, text);
      }
      const line = document.getElementById('qr-go-preview');
      if (line && this.find === f) line.textContent = text;
    } catch { /* the card works without it */ }
  },

  /** The API's translation search, in the chosen edition. */
  async runSearch(q) {
    const edition = this.settings.edition;
    this.search = { q, edition, status: 'loading', count: 0, matches: [] };
    this.renderFind();
    try {
      const res = await fetch(`${QURAN_API}search/${encodeURIComponent(q)}/all/${edition}`);
      const body = await res.json().catch(() => null);
      if (this.search?.q !== q) return;
      if (res.status === 404 || body?.code === 404) {
        // The API's way of saying "nothing found".
        this.search = { q, edition, status: 'done', count: 0, matches: [] };
      } else if (!res.ok || body?.code !== 200) {
        throw new Error('search failed');
      } else {
        this.search = {
          q,
          edition,
          status: 'done',
          count: body.data.count,
          matches: body.data.matches.map((m) => ({ surah: m.surah.number, ayah: m.numberInSurah, text: m.text })),
        };
      }
    } catch {
      if (this.search?.q === q) this.search = { q, edition, status: 'error', count: 0, matches: [] };
    }
    this.renderFind();
  },

  async renderJuzList() {
    const status = el('qr-juz-status');
    try {
      await Promise.all([this.loadJuzs(), this.loadSurahList()]);
    } catch {
      status.textContent = 'The juz list could not be loaded. Check your connection and try again.';
      status.hidden = false;
      return;
    }
    status.hidden = true;
    el('qr-juz-list').innerHTML = this.juzs.map((j, i) => `
      <li>
        <a class="qr-surah qr-juz" href="#/quran/${j.surah}${j.ayah > 1 ? `/${j.ayah}` : ''}">
          <span class="qr-surah-num" aria-hidden="true"><span>${i + 1}</span></span>
          <span class="qr-surah-main">
            <span class="qr-surah-en">Juz ${i + 1}</span>
            <span class="qr-surah-meaning">Starts at ${esc(this.surahName(j.surah))} · ayah ${j.ayah}</span>
          </span>
          <span class="qr-surah-meta">${j.surah}:${j.ayah}</span>
        </a>
      </li>`).join('');
  },

  renderBookmarks() {
    const list = el('qr-bookmark-list');
    el('qr-bookmark-empty').hidden = this.bookmarks.length > 0;
    const t = translationOf(this.settings.edition);
    list.innerHTML = this.bookmarks.map((b) => `
      <li class="qr-bm-row">
        <button class="qr-bm-remove" type="button" data-surah="${b.surah}" data-ayah="${b.ayah}"
                aria-label="Remove bookmark: ${esc(this.surahName(b.surah))} ${b.surah}:${b.ayah}">${QURAN_STAR_SVG}</button>
        <a class="qr-bm-link" href="#/quran/${b.surah}/${b.ayah}">
          <span class="qr-bm-head">
            <span class="qr-bookmark-name">${esc(this.surahName(b.surah))}</span>
            <span class="qr-bookmark-ref">Ayah ${b.ayah}</span>
          </span>
          <span class="qr-bm-line${t.rtl ? ' is-rtl' : ''}" data-ref="${b.surah}:${b.ayah}"
                ${t.rtl ? `lang="${t.lang}" dir="rtl"` : ''}></span>
        </a>
      </li>`).join('');
    if (this.tab === 'bookmarks') this.fillBookmarkLines();
  },

  /** The first line of each bookmarked ayah's translation, from the cache when
      possible, otherwise one small request per ayah. Fails quietly. */
  async fillBookmarkLines() {
    const edition = this.settings.edition;
    for (const line of el('qr-bookmark-list').querySelectorAll('.qr-bm-line')) {
      const [s, a] = line.dataset.ref.split(':').map(Number);
      try {
        let text = (await QuranCache.get(`text:${edition}:${s}`))?.[a - 1];
        if (!text) text = await QuranCache.get(`ayah:${edition}:${s}:${a}`);
        if (!text) {
          text = (await quranFetch(`ayah/${s}:${a}/${edition}`)).text;
          QuranCache.put(`ayah:${edition}:${s}:${a}`, text);
        }
        if (line.isConnected) line.textContent = text;
      } catch { /* leave the line empty */ }
    }
  },

  /* ----------------------------------------------------------- reader --- */

  async openReader(n, ayah, to = null) {
    this.stopTracking();
    this.toggleOptions(false);
    el('qr-list-view').hidden = true;
    el('qr-reader-view').hidden = false;

    const token = ++this.openToken;
    const status = el('qr-status');

    if (this.surah?.number !== n) {
      this.surah = null;
      el('qr-text').innerHTML = '';
      el('qr-basmala').hidden = true;
      this.renderHead(this.surahs?.[n - 1] || { number: n, englishName: `Surah ${n}`, name: '', meaning: '' });
      status.textContent = 'Loading…';
      status.hidden = false;
    }

    try {
      await this.loadSurahList().catch(() => null);
      await this.loadLayers(n);
      if (token !== this.openToken) return;
      this.surah = this.surahs?.[n - 1] || { number: n, englishName: `Surah ${n}`, name: '', meaning: '', ayahs: this.layers[QURAN_ARABIC].length };
      status.hidden = true;
      this.renderHead(this.surah);
      this.renderText();
      this.renderPager();
    } catch {
      if (token !== this.openToken) return;
      status.textContent = 'This surah could not be loaded. Check your connection and try again.';
      status.hidden = false;
      return;
    }

    // Arabic metrics change once the font arrives; wait briefly before jumping.
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    if (token !== this.openToken) return;
    if (ayah) this.scrollToAyah(ayah, true, to);
    else window.scrollTo(0, 0);
    this.startTracking();
  },

  /** The editions the settings need, for this surah and for the basmala. */
  async loadLayers(n) {
    const ids = this.neededEditions();
    const [layers, fatiha] = await Promise.all([
      this.loadEditions(n, ids),
      n !== 1 && n !== 9 ? this.loadEditions(1, ids) : null,
    ]);
    this.layersFor = n;
    this.layers = layers;
    this.basmala = fatiha && Object.fromEntries(ids.map((id) => [id, fatiha[id][0]]));
  },

  renderHead(s) {
    el('qr-kicker').textContent = `Surah ${s.number}`;
    el('qr-name-ar').textContent = s.name || '';
    el('qr-name-en').textContent = s.englishName || '';
    el('qr-bar-title').textContent = s.englishName || '';
    el('qr-meaning').textContent = s.meaning || '';
    el('qr-meta').textContent = s.type ? `${s.type} · ${s.ayahs} ayat` : '';
  },

  /** The ornamental ayah number, which is also the bookmark button: an
      outlined star when not saved, solid gold when saved. */
  marker(n) {
    const surah = this.surah.number;
    const on = this.bookmarkSet.has(`${surah}:${n}`);
    return `<button class="qr-num${on ? ' is-bookmarked' : ''}${n > 99 ? ' qr-num--3' : ''}" type="button" data-ayah="${n}"
        aria-pressed="${on}" aria-label="${on ? 'Remove bookmark' : `Bookmark ayah ${surah}:${n}`}">${QURAN_STAR_SVG}<span
        class="qr-num-text" lang="ar" aria-hidden="true">${fmtArabicDigits.format(n)}</span></button>`;
  },

  /** "Tap ✦ to bookmark", until the first bookmark is saved on this device
      (or there already are some). */
  renderHint() {
    let done = this.bookmarks.length > 0;
    try {
      done = done || localStorage.getItem(QURAN_HINT_STORE) === '1';
    } catch { /* show it */ }
    el('qr-hint').hidden = done;
  },

  renderText() {
    const { size, arabic, translit, translation, edition } = this.settings;
    const t = translationOf(edition);
    const ar = this.layers[QURAN_ARABIC];
    const tr = translit ? this.layers[QURAN_TRANSLIT] : null;
    const tx = translation ? this.layers[edition] : null;

    // Basmala: split from ayah 1 of the Uthmani text, then shown above in
    // every layer that is on. If it isn't found, ayah 1 stays as given.
    let first = ar[0];
    let basmala = false;
    if (this.basmala) {
      const rest = splitBasmala(first, this.basmala[QURAN_ARABIC]);
      if (rest !== null) {
        first = rest;
        basmala = true;
      }
    }
    el('qr-basmala').hidden = !basmala;
    if (basmala) {
      el('qr-basmala').innerHTML = [
        arabic ? `<p class="qr-basmala-ar" lang="ar" dir="rtl">${esc(this.basmala[QURAN_ARABIC])}</p>` : '',
        tr ? `<p class="qr-basmala-tr">${esc(this.basmala[QURAN_TRANSLIT])}</p>` : '',
        tx ? `<p class="qr-basmala-tx${t.rtl ? ' is-rtl' : ''}"${t.rtl ? ` lang="${t.lang}" dir="rtl"` : ''}>${esc(this.basmala[edition])}</p>` : '',
      ].join('');
    }

    const text = el('qr-text');
    text.className = `qr-text qr-size-${size}`;
    text.innerHTML = `<ol class="qr-ayat">${ar.map((arText, i) => {
      const n = i + 1;
      // With Arabic off, the number moves to the start of the first line shown.
      const lead = arabic ? '' : this.marker(n);
      return `
        <li class="qr-ayah" id="qr-ayah-${n}" data-ayah="${n}" tabindex="0">
          ${arabic ? `<p class="qr-ar" lang="ar" dir="rtl">${esc(i === 0 ? first : arText)} ${this.marker(n)}</p>` : ''}
          ${tr ? `<p class="qr-tr${lead ? ' qr-lead' : ''}">${lead}${esc(tr[i])}</p>` : ''}
          ${tx ? `<p class="qr-en${t.rtl ? ' is-rtl' : ''}${lead && !tr ? ' qr-lead' : ''}"${t.rtl ? ` lang="${t.lang}" dir="rtl"` : ''}>${
            lead && !tr ? lead : (arabic ? `<span class="qr-en-num">${n}</span>` : '')}${esc(tx[i])}</p>` : ''}
        </li>`;
    }).join('')}</ol>`;

    this.renderOptions();
    this.renderHint();
  },

  /** The bar's controls reflect the settings; the last layer on can't go off. */
  renderOptions() {
    const { size, arabic, translit, translation, edition } = this.settings;
    for (const chip of document.querySelectorAll('.qr-size .qr-chip')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.size === size));
    }
    const on = { arabic, translit, translation };
    const count = Object.values(on).filter(Boolean).length;
    for (const chip of document.querySelectorAll('.qr-layers .qr-chip')) {
      const isOn = on[chip.dataset.layer];
      chip.setAttribute('aria-pressed', String(isOn));
      const last = isOn && count === 1;
      chip.setAttribute('aria-disabled', String(last));
      chip.title = last ? 'At least one must stay on' : '';
    }
    el('qr-edition').value = edition;
  },

  renderPager() {
    const n = this.surah.number;
    const link = (node, target, label) => {
      node.hidden = !target;
      if (!target) return;
      node.href = `#/quran/${target}`;
      node.innerHTML = `<span class="qr-pager-label">${label}</span>
        <span class="qr-pager-name">${esc(this.surahName(target))}</span>`;
    };
    link(el('qr-prev'), n > 1 ? n - 1 : null, 'Previous');
    link(el('qr-next'), n < 114 ? n + 1 : null, 'Next');
  },

  toggleOptions(open) {
    const bar = el('qr-bar');
    const next = open ?? !bar.classList.contains('is-open');
    bar.classList.toggle('is-open', next);
    el('qr-aa').setAttribute('aria-expanded', String(next));
  },

  toggleLayer(layer) {
    const { arabic, translit, translation } = this.settings;
    const on = { arabic, translit, translation };
    if (on[layer] && Object.values(on).filter(Boolean).length === 1) return; // keep at least one
    this.changeSettings({ [layer]: !on[layer] });
  },

  /**
   * Apply new settings in place: load any edition they newly need (only that
   * one), re-render, and keep the ayah being read on screen. If the edition
   * can't be loaded, the old settings stay.
   */
  async changeSettings(patch) {
    const before = { ...this.settings };
    Object.assign(this.settings, patch);
    if (!this.surah) {
      this.saveSettings();
      this.renderOptions();
      return;
    }
    const keep = this.reading?.surah === this.surah.number ? this.reading.ayah : null;
    try {
      await this.loadLayers(this.surah.number);
    } catch {
      this.settings = before;
      this.renderOptions();
      toast('That could not be loaded. Check your connection and try again.', { error: true });
      return;
    }
    this.saveSettings();
    this.stopTracking();
    this.renderText();
    if (keep) this.scrollToAyah(keep, false);
    this.startTracking();
    if ('edition' in patch) this.renderBookmarks();
  },

  /** Scroll to an ayah. With highlight, it (or the whole range up to `to`)
      shows a soft gold background that then fades out over about 2s (CSS). */
  scrollToAyah(n, highlight, to = null) {
    const node = document.getElementById(`qr-ayah-${n}`);
    if (!node) return;
    node.scrollIntoView({ block: 'start' });
    if (!highlight) return;
    const nodes = [];
    for (let i = n; i <= (to || n); i += 1) {
      const li = document.getElementById(`qr-ayah-${i}`);
      if (li) nodes.push(li);
    }
    nodes.forEach((li) => li.classList.add('is-target'));
    setTimeout(() => nodes.forEach((li) => li.classList.remove('is-target')), 700);
  },

  refreshMarkers() {
    if (!this.surah) return;
    const surah = this.surah.number;
    for (const btn of document.querySelectorAll('#qr-text .qr-num')) {
      const on = this.bookmarkSet.has(`${surah}:${btn.dataset.ayah}`);
      btn.classList.toggle('is-bookmarked', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? 'Remove bookmark' : `Bookmark ayah ${surah}:${btn.dataset.ayah}`);
    }
  },

  /* -------------------------------------------------------- bookmarks --- */

  async toggleBookmark(surah, ayah) {
    const key = `${surah}:${ayah}`;
    const adding = !this.bookmarkSet.has(key);
    const before = [...this.bookmarks];

    // Optimistic, like the prayer marks.
    if (adding) {
      this.bookmarkSet.add(key);
      this.bookmarks.unshift({ surah, ayah });
    } else {
      this.bookmarkSet.delete(key);
      this.bookmarks = this.bookmarks.filter((b) => `${b.surah}:${b.ayah}` !== key);
    }
    this.refreshMarkers();
    this.renderBookmarks();
    toast(adding ? `Bookmarked ${esc(this.surahName(surah))} ${surah}:${ayah}` : 'Bookmark removed');
    if (adding) {
      try {
        localStorage.setItem(QURAN_HINT_STORE, '1');
      } catch { /* the hint just stays */ }
      this.renderHint();
    }

    try {
      if (adding) await Data.addBookmark(State.me, surah, ayah);
      else await Data.removeBookmark(State.me, surah, ayah);
    } catch (err) {
      this.bookmarks = before;
      this.bookmarkSet = new Set(before.map((b) => `${b.surah}:${b.ayah}`));
      this.refreshMarkers();
      this.renderBookmarks();
      toast(`Could not save the bookmark: ${esc(err.message || err)}`, { error: true });
    }
  },

  /* --------------------------------------------------- reading position --- */

  /** The topmost ayah inside a band across the upper part of the screen is the
      one being read. Saved after the reader settles, not on every scroll. */
  startTracking() {
    this.stopTracking();
    const visible = new Set();
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const n = Number(entry.target.dataset.ayah);
        if (entry.isIntersecting) visible.add(n);
        else visible.delete(n);
      }
      if (visible.size) this.noteReading(Math.min(...visible));
    }, { rootMargin: '-20% 0px -55% 0px' });
    for (const node of el('qr-text').querySelectorAll('.qr-ayah')) this.observer.observe(node);
  },

  stopTracking() {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
    this.flushPosition();
  },

  noteReading(ayah) {
    const surah = this.surah?.number;
    if (!surah || (this.reading?.surah === surah && this.reading.ayah === ayah)) return;
    this.reading = { surah, ayah };
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.savePosition(), 1500);
  },

  flushPosition() {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.savePosition();
  },

  async savePosition() {
    this.saveTimer = null;
    if (!this.reading || !State.me) return;
    const pos = { ...this.reading, updated_at: new Date().toISOString() };
    try {
      localStorage.setItem(QURAN_POSITION_STORE + State.me, JSON.stringify(pos));
    } catch { /* Supabase still has it */ }
    try {
      await Data.saveQuranProgress(State.me, pos.surah, pos.ayah);
      this.progress[State.me] = pos;
    } catch { /* this device's copy stands until the next save */ }
  },
};

Sections.register({
  id: 'quran',
  label: 'Quran',
  order: 2,
  icon: `<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
    <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12 6.5v13" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </svg>`,
  root: document.getElementById('section-quran'),
  show: (params) => Quran.show(params),
});
