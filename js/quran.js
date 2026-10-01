/* ===========================================================================
   quran.js — the Quran section: surah list, reader, reading progress and
   bookmarks.

   All Arabic and translation text comes from the Al-Quran Cloud API and is
   never written into this codebase. Each response is cached in IndexedDB, so a
   surah opens instantly, and without a connection, after its first load.

   Routes:  #/quran           the surah list
            #/quran/18        Al-Kahf, from the top
            #/quran/2/255     Al-Baqarah, scrolled to ayah 255

   Depends on router.js, data.js and, at run time, app.js (el, esc, name,
   toast, State).
   =========================================================================== */

const QURAN_API = 'https://api.alquran.cloud/v1/';
const QURAN_SETTINGS_STORE = 'kharwa.quran.settings';
const QURAN_POSITION_STORE = 'kharwa.quran.position.';   // + person
const QURAN_SIZES = ['s', 'm', 'l'];

/* ---------------------------------------------------------------- cache --- */

/** A tiny IndexedDB key-value store. Every failure degrades to "not cached". */
const QuranCache = {
  db: null,

  open() {
    if (!this.db) {
      this.db = new Promise((resolve, reject) => {
        const req = indexedDB.open('kharwa-quran', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }).catch(() => null);
    }
    return this.db;
  },

  async get(key) {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction('kv').objectStore('kv').get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  },

  async put(key, value) {
    const db = await this.open();
    if (!db) return;
    try {
      db.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
    } catch { /* full or blocked: just don't cache */ }
  },
};

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
 * The API starts ayah 1 of most surahs with the basmala. Split it off, using
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

/* ---------------------------------------------------------------- state --- */

const Quran = {
  ready: false,
  surahs: null,             // [{ number, name, englishName, meaning, ayahs, type }]
  surah: null,              // the surah open in the reader
  basmala: null,            // Al-Fatihah 1:1, shown above other surahs
  ayahs: [],                // the reader's ayahs, basmala split from the first
  progress: {},             // person -> { surah, ayah, updated_at }
  bookmarks: [],            // mine, newest first: [{ surah, ayah }]
  bookmarkSet: new Set(),   // "surah:ayah"
  remoteLoaded: false,
  settings: { size: 'm', translation: true, arabicOnly: false },
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

  async loadSurah(n) {
    const key = `surah:${n}`;
    let surah = await QuranCache.get(key);
    if (!surah) {
      const data = await quranFetch(`surah/${n}/editions/quran-uthmani,en.sahih`);
      const ar = data.find((e) => e.edition?.identifier === 'quran-uthmani');
      const en = data.find((e) => e.edition?.identifier === 'en.sahih');
      if (!ar?.ayahs?.length || ar.ayahs.length !== en?.ayahs?.length) {
        throw new Error('Surah response incomplete');
      }
      surah = {
        number: ar.number,
        name: ar.name,
        englishName: ar.englishName,
        meaning: ar.englishNameTranslation,
        type: ar.revelationType,
        ayahs: ar.ayahs.map((a, i) => ({ n: a.numberInSurah, ar: a.text, en: en.ayahs[i].text })),
      };
      QuranCache.put(key, surah);
    }
    return surah;
  },

  surahName(n) {
    return this.surahs?.[n - 1]?.englishName || `Surah ${n}`;
  },

  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(QURAN_SETTINGS_STORE)) || {};
      if (QURAN_SIZES.includes(saved.size)) this.settings.size = saved.size;
      if (typeof saved.translation === 'boolean') this.settings.translation = saved.translation;
      if (typeof saved.arabicOnly === 'boolean') this.settings.arabicOnly = saved.arabicOnly;
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
    this.refreshMarkers();
  },

  /* ---------------------------------------------------------- routing --- */

  show(params) {
    if (!this.ready) this.init();
    const n = Number(params[0]);
    if (params.length && Number.isInteger(n) && n >= 1 && n <= 114) {
      const ayah = Number(params[1]);
      this.openReader(n, Number.isInteger(ayah) && ayah >= 1 ? ayah : null);
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

    el('qr-text').addEventListener('click', (event) => {
      const num = event.target.closest('.qr-num');
      if (num) this.toggleBookmark(Number(num.dataset.ayah));
    });

    for (const chip of document.querySelectorAll('.qr-seg .qr-chip')) {
      chip.addEventListener('click', () => this.changeSettings({ size: chip.dataset.size }));
    }
    el('qr-opt-translation').addEventListener('click', () =>
      this.changeSettings({ translation: !this.settings.translation }));
    el('qr-opt-arabic').addEventListener('click', () =>
      this.changeSettings({ arabicOnly: !this.settings.arabicOnly }));

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
    this.renderBookmarks();

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

  renderBookmarks() {
    el('qr-bookmarks').hidden = !this.bookmarks.length;
    el('qr-bookmark-list').innerHTML = this.bookmarks.map((b) => `
      <li>
        <a class="qr-bookmark" href="#/quran/${b.surah}/${b.ayah}">
          <span class="qr-bookmark-name">${esc(this.surahName(b.surah))}</span>
          <span class="qr-bookmark-ref">${b.surah}:${b.ayah}</span>
        </a>
      </li>`).join('');
  },

  renderSurahList() {
    if (!this.surahs) return;
    const q = el('qr-search').value.trim();
    const digits = /^\d+$/.test(q);
    const folded = foldLatin(q);
    const arabic = arabicBase(q);

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
            <span class="qr-surah-en">${esc(s.englishName)}</span>
            <span class="qr-surah-meaning">${esc(s.meaning)}</span>
            <span class="qr-surah-meta">${esc(s.type)} · ${s.ayahs} ayat</span>
          </span>
          <span class="qr-surah-ar" lang="ar" dir="rtl">${esc(s.name)}</span>
        </a>
      </li>`).join('');

    const status = el('qr-list-status');
    status.hidden = rows.length > 0;
    if (!rows.length) status.textContent = 'No surah matches that search.';
  },

  /* ----------------------------------------------------------- reader --- */

  async openReader(n, ayah) {
    this.stopTracking();
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
      const [surah] = await Promise.all([this.loadSurah(n), this.loadSurahList().catch(() => null)]);
      const basmala = n !== 1 && n !== 9 ? (await this.loadSurah(1)).ayahs[0].ar : null;
      if (token !== this.openToken) return;
      this.surah = surah;
      this.basmala = basmala;
      status.hidden = true;
      this.renderReader();
    } catch {
      if (token !== this.openToken) return;
      status.textContent = 'This surah could not be loaded. Check your connection and try again.';
      status.hidden = false;
      return;
    }

    // Arabic metrics change once the font arrives; wait briefly before jumping.
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    if (token !== this.openToken) return;
    if (ayah) this.scrollToAyah(ayah, true);
    else window.scrollTo(0, 0);
    this.startTracking();
  },

  renderHead(s) {
    el('qr-kicker').textContent = `Surah ${s.number}`;
    el('qr-name-ar').textContent = s.name || '';
    el('qr-name-en').textContent = s.englishName || '';
    el('qr-meaning').textContent = s.meaning || '';
    el('qr-meta').textContent = s.type ? `${s.type} · ${s.ayahs.length ?? s.ayahs} ayat` : '';
  },

  renderReader() {
    const s = this.surah;
    this.renderHead(s);

    // Basmala as the header; ayah 1 without it. Al-Fatihah keeps it as ayah 1
    // and At-Tawbah has none. If it can't be found, ayah 1 stays as given.
    let first = s.ayahs[0].ar;
    let showBasmala = false;
    if (this.basmala) {
      const rest = splitBasmala(first, this.basmala);
      if (rest !== null) {
        first = rest;
        showBasmala = true;
      }
    }
    el('qr-basmala').textContent = showBasmala ? this.basmala : '';
    el('qr-basmala').hidden = !showBasmala;
    this.ayahs = s.ayahs.map((a, i) => (i === 0 ? { ...a, ar: first } : a));

    this.renderText();
    this.renderPager();
  },

  /** The ornamental ayah number, which is also the bookmark toggle. */
  marker(n) {
    const on = this.bookmarkSet.has(`${this.surah.number}:${n}`);
    return `<button class="qr-num${on ? ' is-bookmarked' : ''}${n > 99 ? ' qr-num--3' : ''}" type="button" data-ayah="${n}"
        aria-pressed="${on}" aria-label="Ayah ${n}, ${on ? 'bookmarked' : 'bookmark'}">
      <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <rect class="qr-num-star" x="9" y="9" width="22" height="22"/>
        <rect class="qr-num-star" x="9" y="9" width="22" height="22" transform="rotate(45 20 20)"/>
        <circle class="qr-num-ring" cx="20" cy="20" r="10.5"/>
      </svg>
      <span class="qr-num-text" lang="ar">${fmtArabicDigits.format(n)}</span>
    </button>`;
  },

  renderText() {
    const { size, translation, arabicOnly } = this.settings;
    const text = el('qr-text');
    text.className = `qr-text qr-size-${size}${arabicOnly ? ' is-flow' : ''}`;

    if (arabicOnly) {
      text.innerHTML = `<p class="qr-flow" lang="ar" dir="rtl">${this.ayahs.map((a) =>
        `<span class="qr-ayah" id="qr-ayah-${a.n}" data-ayah="${a.n}">${esc(a.ar)}</span>${this.marker(a.n)} `
      ).join('')}</p>`;
    } else {
      text.innerHTML = `<ol class="qr-ayat">${this.ayahs.map((a) => `
        <li class="qr-ayah" id="qr-ayah-${a.n}" data-ayah="${a.n}">
          <p class="qr-ar" lang="ar" dir="rtl">${esc(a.ar)} ${this.marker(a.n)}</p>
          ${translation ? `<p class="qr-en"><span class="qr-en-num">${a.n}</span>${esc(a.en)}</p>` : ''}
        </li>`).join('')}</ol>`;
    }

    for (const chip of document.querySelectorAll('.qr-seg .qr-chip')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.size === size));
    }
    el('qr-opt-translation').setAttribute('aria-pressed', String(translation && !arabicOnly));
    el('qr-opt-translation').disabled = arabicOnly;
    el('qr-opt-arabic').setAttribute('aria-pressed', String(arabicOnly));
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

  /** Re-render in place, keeping the ayah being read on screen. */
  changeSettings(patch) {
    Object.assign(this.settings, patch);
    this.saveSettings();
    if (!this.surah) return;
    const keep = this.reading?.surah === this.surah.number ? this.reading.ayah : null;
    this.stopTracking();
    this.renderText();
    if (keep) this.scrollToAyah(keep, false);
    this.startTracking();
  },

  scrollToAyah(n, highlight) {
    const node = document.getElementById(`qr-ayah-${n}`);
    if (!node) return;
    node.scrollIntoView({ block: 'start' });
    if (highlight) {
      node.classList.add('is-target');
      setTimeout(() => node.classList.remove('is-target'), 2600);
    }
  },

  refreshMarkers() {
    if (!this.surah) return;
    for (const btn of document.querySelectorAll('#qr-text .qr-num')) {
      const on = this.bookmarkSet.has(`${this.surah.number}:${btn.dataset.ayah}`);
      btn.classList.toggle('is-bookmarked', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', `Ayah ${btn.dataset.ayah}, ${on ? 'bookmarked' : 'bookmark'}`);
    }
  },

  /* -------------------------------------------------------- bookmarks --- */

  async toggleBookmark(ayah) {
    const surah = this.surah.number;
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
