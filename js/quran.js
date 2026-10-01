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

function translationOf(id) {
  return QURAN_TRANSLATIONS.find((t) => t.id === id) || QURAN_TRANSLATIONS[0];
}

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

    for (const tab of document.querySelectorAll('.qr-tab')) {
      tab.addEventListener('click', () => this.showTab(tab.dataset.tab));
    }

    el('qr-bookmark-list').addEventListener('click', (event) => {
      const remove = event.target.closest('.qr-bm-remove');
      if (remove) this.toggleBookmark(Number(remove.dataset.surah), Number(remove.dataset.ayah));
    });

    el('qr-text').addEventListener('click', (event) => {
      const num = event.target.closest('.qr-num');
      if (num) this.toggleBookmark(this.surah.number, Number(num.dataset.ayah));
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

    const status = el('qr-list-status');
    status.hidden = rows.length > 0;
    if (!rows.length) status.textContent = 'No surah matches that search.';
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
        <a class="qr-bm-link" href="#/quran/${b.surah}/${b.ayah}">
          <span class="qr-bm-head">
            <span class="qr-bookmark-name">${esc(this.surahName(b.surah))}</span>
            <span class="qr-bookmark-ref">Ayah ${b.ayah}</span>
          </span>
          <span class="qr-bm-line${t.rtl ? ' is-rtl' : ''}" data-ref="${b.surah}:${b.ayah}"
                ${t.rtl ? `lang="${t.lang}" dir="rtl"` : ''}></span>
        </a>
        <button class="qr-bm-remove" type="button" data-surah="${b.surah}" data-ayah="${b.ayah}"
                aria-label="Remove bookmark: ${esc(this.surahName(b.surah))}, ayah ${b.ayah}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
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

  async openReader(n, ayah) {
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
    if (ayah) this.scrollToAyah(ayah, true);
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
        <li class="qr-ayah" id="qr-ayah-${n}" data-ayah="${n}">
          ${arabic ? `<p class="qr-ar" lang="ar" dir="rtl">${esc(i === 0 ? first : arText)} ${this.marker(n)}</p>` : ''}
          ${tr ? `<p class="qr-tr${lead ? ' qr-lead' : ''}">${lead}${esc(tr[i])}</p>` : ''}
          ${tx ? `<p class="qr-en${t.rtl ? ' is-rtl' : ''}${lead && !tr ? ' qr-lead' : ''}"${t.rtl ? ` lang="${t.lang}" dir="rtl"` : ''}>${
            lead && !tr ? lead : (arabic ? `<span class="qr-en-num">${n}</span>` : '')}${esc(tx[i])}</p>` : ''}
        </li>`;
    }).join('')}</ol>`;

    this.renderOptions();
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
