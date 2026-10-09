/* ===========================================================================
   hadith.js — the Hadith section: collections, chapters, reader, reading
   progress and bookmarks.

   All hadith text and grades come from fawazahmed0/hadith-api and are never
   written into this codebase. Every request tries the jsDelivr CDN (.min.json,
   then .json) and then the same paths on raw.githubusercontent.com. Chapters
   are cached in IndexedDB, so they open instantly, and offline, after their
   first load.

   Routes:  #/hadith                    the collections
            #/hadith/bukhari            a collection's chapters
            #/hadith/bukhari/8          a chapter
            #/hadith/bukhari/n/412      one hadith, in its chapter

   Depends on store.js, router.js, data.js and, at run time, app.js (el, esc,
   name, toast, State).
   =========================================================================== */

const HADITH_SOURCES = [
  'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/',
  'https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/',
];
const HADITH_SETTINGS_STORE = 'kharwa.hadith.settings';
const HADITH_POSITION_STORE = 'kharwa.hadith.position.';   // + person

/* The collections we offer, in order. Names and compilers are ours; whether a
   collection is shown depends on the API having it in English and Arabic. */
const HADITH_BOOKS = [
  { id: 'bukhari',  name: 'Sahih al-Bukhari', compiler: 'Imam Muhammad al-Bukhari' },
  { id: 'muslim',   name: 'Sahih Muslim',     compiler: 'Imam Muslim ibn al-Hajjaj' },
  { id: 'abudawud', name: 'Sunan Abu Dawud',  compiler: 'Imam Abu Dawud as-Sijistani' },
  { id: 'tirmidhi', name: 'Jami at-Tirmidhi', compiler: 'Imam Abu Isa at-Tirmidhi' },
  { id: 'nasai',    name: "Sunan an-Nasa'i",  compiler: "Imam Ahmad an-Nasa'i" },
  { id: 'ibnmajah', name: 'Sunan Ibn Majah',  compiler: 'Imam Ibn Majah al-Qazwini' },
  { id: 'malik',    name: 'Muwatta Malik',    compiler: 'Imam Malik ibn Anas' },
  { id: 'nawawi',   name: '40 Hadith Nawawi', compiler: 'Imam Yahya an-Nawawi' },
  { id: 'qudsi',    name: '40 Hadith Qudsi',  compiler: 'Ezzeddin Ibrahim & Denys Johnson-Davies' },
];

/* The two collections whose every hadith is sahih by their compilers' own
   standard; the API carries no grades for them. */
const HADITH_ALL_SAHIH = ['bukhari', 'muslim'];

const HadithCache = new IdbStore('kharwa-hadith');

/** CDN .min.json, CDN .json, then GitHub raw. Throws only if all four fail. */
async function hadithFetch(path) {
  for (const base of HADITH_SOURCES) {
    for (const ext of ['.min.json', '.json']) {
      try {
        const res = await fetch(base + path + ext);
        if (res.ok) return await res.json();
      } catch { /* try the next one */ }
    }
  }
  throw new Error(`Hadith request failed: ${path}`);
}

const fmtCount = new Intl.NumberFormat();

/* ---------------------------------------------------------------- state --- */

const Hadith = {
  ready: false,
  books: null,              // HADITH_BOOKS entries the API has, with sections and count
  chapter: null,            // { book, section, title, items: [{ n, ar, en, grades }] }
  progress: [],             // every hadith_progress row, newest first
  bookmarks: [],            // mine, newest first: [{ book, hadith_number }]
  bookmarkSet: new Set(),   // "book:number"
  remoteLoaded: false,
  settings: { arabic: true },
  observer: null,
  reading: null,            // { book, section, number } most recently in view
  saveTimer: null,
  openToken: 0,

  /* ------------------------------------------------------------- data --- */

  /**
   * The collections, each with its chapters ({ n, title, first, last }) and
   * hadith count. info.json is large (about 350KB compressed), so it is slimmed
   * to just this once and cached.
   */
  async loadBooks() {
    if (this.books) return this.books;
    let slim = await HadithCache.get('books:v1');
    if (!slim) {
      const [editions, info] = await Promise.all([hadithFetch('editions'), hadithFetch('info')]);
      slim = HADITH_BOOKS.filter((b) => {
        const names = (editions[b.id]?.collection || []).map((e) => e.name);
        return names.includes(`eng-${b.id}`) && names.includes(`ara-${b.id}`) && info[b.id];
      }).map((b) => {
        const meta = info[b.id].metadata;
        const sections = Object.entries(meta.sections)
          .map(([n, title]) => ({ n: Number(n), title, ...meta.section_details[n] }))
          .filter((s) => s.hadithnumber_last > 0)
          .map((s) => ({ n: s.n, title: s.title, first: s.hadithnumber_first, last: s.hadithnumber_last }));
        return { id: b.id, count: info[b.id].hadiths.length, sections };
      });
      if (!slim.length) throw new Error('No hadith collections available');
      HadithCache.put('books:v1', slim);
    }
    this.books = slim.map((s) => ({ ...HADITH_BOOKS.find((b) => b.id === s.id), ...s }));
    return this.books;
  },

  book(id) {
    return this.books?.find((b) => b.id === id) || null;
  },

  bookName(id) {
    return HADITH_BOOKS.find((b) => b.id === id)?.name || id;
  },

  /**
   * One chapter, English and Arabic merged by hadith number. A hadith missing
   * from one edition keeps the other's text; one missing from both is skipped.
   * Cached only when both editions loaded.
   */
  async loadChapter(bookId, n) {
    const key = `chapter:${bookId}:${n}`;
    const cached = await HadithCache.get(key);
    if (cached) return cached;

    const [en, ar] = await Promise.all([
      hadithFetch(`editions/eng-${bookId}/sections/${n}`).catch(() => null),
      hadithFetch(`editions/ara-${bookId}/sections/${n}`).catch(() => null),
    ]);
    if (!en && !ar) throw new Error('Chapter unavailable');

    const byNumber = new Map();
    const take = (edition, field) => {
      for (const h of edition?.hadiths || []) {
        const item = byNumber.get(h.hadithnumber) || { n: h.hadithnumber, ar: '', en: '', grades: [] };
        item[field] = (h.text || '').trim();
        if (h.grades?.length && !item.grades.length) item.grades = h.grades;
        byNumber.set(h.hadithnumber, item);
      }
    };
    take(en, 'en');
    take(ar, 'ar');

    const meta = (en || ar).metadata;
    const chapter = {
      book: bookId,
      section: n,
      title: meta.section?.[n] || '',
      items: [...byNumber.values()].filter((h) => h.en || h.ar).sort((a, b) => a.n - b.n),
    };
    if (en && ar) HadithCache.put(key, chapter);
    return chapter;
  },

  /** Which chapter holds a hadith: by range when that is unambiguous, else ask
      the API's single-hadith file. Null if it can't be found. */
  async chapterOf(bookId, number) {
    const book = this.book(bookId);
    if (!book) return null;
    const hits = book.sections.filter((s) => number >= s.first && number <= s.last);
    if (hits.length === 1) return hits[0].n;
    try {
      const one = await hadithFetch(`editions/eng-${bookId}/${number}`);
      const n = Number(Object.keys(one.metadata?.section || {})[0]);
      if (book.sections.some((s) => s.n === n)) return n;
    } catch { /* fall back to the ranges */ }
    return hits.length ? hits[0].n : null;
  },

  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(HADITH_SETTINGS_STORE)) || {};
      if (typeof saved.arabic === 'boolean') this.settings.arabic = saved.arabic;
    } catch { /* defaults */ }
  },

  saveSettings() {
    try {
      localStorage.setItem(HADITH_SETTINGS_STORE, JSON.stringify(this.settings));
    } catch { /* per session only */ }
  },

  localPosition(person) {
    try {
      return JSON.parse(localStorage.getItem(HADITH_POSITION_STORE + person));
    } catch {
      return null;
    }
  },

  /** A person's most recent position in any collection. For me, whichever of
      this device's copy and Supabase's is newer. */
  latestPosition(person) {
    const remote = this.progress.find((r) => r.person === person);
    const fromRemote = remote && {
      book: remote.book, section: remote.section, number: Number(remote.hadith_number), updated_at: remote.updated_at,
    };
    if (person !== State.me) return fromRemote || null;
    const local = this.localPosition(person);
    if (!local) return fromRemote || null;
    if (!fromRemote) return local;
    return new Date(local.updated_at) > new Date(fromRemote.updated_at) ? local : fromRemote;
  },

  async refreshRemote() {
    try {
      this.progress = await Data.loadHadithProgress();
    } catch { /* tables missing or offline: keep local */ }
    try {
      this.bookmarks = (await Data.loadHadithBookmarks(State.me))
        .map((b) => ({ book: b.book, hadith_number: Number(b.hadith_number) }));
      this.bookmarkSet = new Set(this.bookmarks.map((b) => `${b.book}:${b.hadith_number}`));
    } catch { /* keep what we have */ }
    this.remoteLoaded = true;
    this.renderContinue();
    this.renderBookmarks();
    this.refreshBookmarkButtons();
  },

  /* ---------------------------------------------------------- routing --- */

  show(params) {
    if (!this.ready) this.init();
    const [bookId, second, third] = params;
    if (!bookId) this.openCollections();
    else if (second === 'n' && third !== undefined) this.openNumber(bookId, Number(third));
    else if (second !== undefined) this.openChapter(bookId, Number(second), null);
    else this.openBook(bookId);
    if (!this.remoteLoaded) this.refreshRemote();
  },

  init() {
    this.ready = true;
    this.loadSettings();

    el('hd-search').addEventListener('input', () => this.renderChapterList());

    el('hd-text').addEventListener('click', (event) => {
      const send = event.target.closest('.hd-send');
      if (send) { ShareSheet.openHadith(this.chapter.book, Number(send.dataset.number)); return; }
      const btn = event.target.closest('.hd-bm');
      if (btn) this.toggleBookmark(Number(btn.dataset.number));
    });

    el('hd-opt-arabic').addEventListener('click', () => {
      this.settings.arabic = !this.settings.arabic;
      this.saveSettings();
      if (!this.chapter) return;
      const keep = this.reading?.number;
      this.stopTracking();
      this.renderText();
      if (keep !== undefined) this.scrollToHadith(keep, false);
      this.startTracking();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushPosition();
    });
  },

  showView(id) {
    for (const view of ['hd-collections-view', 'hd-book-view', 'hd-reader-view']) {
      el(view).hidden = view !== id;
    }
  },

  /** Unknown collection or chapter: back to the collections, quietly. */
  fallBack(path = '#/hadith') {
    history.replaceState(null, '', path);
    Sections.route();
  },

  /* ------------------------------------------------------ collections --- */

  async openCollections() {
    this.stopTracking();
    this.showView('hd-collections-view');
    this.renderContinue();
    this.renderBookmarks();

    const status = el('hd-collections-status');
    try {
      await this.loadBooks();
      status.hidden = true;
      el('hd-collection-list').innerHTML = this.books.map((b) => `
        <li>
          <a class="hd-collection" href="${this.bookHref(b)}">
            <span class="hd-collection-main">
              <span class="hd-collection-name">${esc(b.name)}</span>
              <span class="hd-collection-compiler">${esc(b.compiler)}</span>
            </span>
            <span class="hd-collection-count">${fmtCount.format(b.count)} hadith</span>
          </a>
        </li>`).join('');
      this.renderContinue();
      this.renderBookmarks();
    } catch {
      status.textContent = 'The collections could not be loaded. Check your connection and try again.';
      status.hidden = false;
    }
  },

  /** A one-chapter collection (the forties) opens straight to its hadith. */
  bookHref(b) {
    return b.sections.length === 1 ? `#/hadith/${b.id}/${b.sections[0].n}` : `#/hadith/${b.id}`;
  },

  renderContinue() {
    const mine = this.latestPosition(State.me);
    if (mine) {
      el('hd-continue-title').textContent = `${this.bookName(mine.book)} · hadith ${mine.number}`;
      el('hd-continue-sub').textContent = 'Pick up where you left off';
      el('hd-continue-link').href = `#/hadith/${mine.book}/n/${mine.number}`;
    } else {
      el('hd-continue-title').textContent = '40 Hadith Nawawi';
      el('hd-continue-sub').textContent = 'A gentle place to begin';
      el('hd-continue-link').href = '#/hadith/nawawi/1';
    }

    const other = PEOPLE_IDS.find((p) => p !== State.me);
    const theirs = this.latestPosition(other);
    el('hd-other').hidden = !theirs;
    if (theirs) {
      el('hd-other').textContent =
        `${name(other)} is reading ${this.bookName(theirs.book)} · hadith ${theirs.number}`;
    }
  },

  renderBookmarks() {
    el('hd-bookmarks').hidden = !this.bookmarks.length;
    el('hd-bookmark-list').innerHTML = this.bookmarks.map((b) => `
      <li>
        <a class="qr-bookmark" href="#/hadith/${b.book}/n/${b.hadith_number}">
          <span class="qr-bookmark-name">${esc(this.bookName(b.book))}</span>
          <span class="qr-bookmark-ref">Hadith ${b.hadith_number}</span>
        </a>
      </li>`).join('');
  },

  /* ---------------------------------------------------------- chapters --- */

  async openBook(bookId) {
    this.stopTracking();
    this.showView('hd-book-view');
    try {
      await this.loadBooks();
    } catch {
      this.fallBack();
      return;
    }
    const book = this.book(bookId);
    if (!book) {
      this.fallBack();
      return;
    }
    if (this.currentBook !== bookId) el('hd-search').value = '';
    this.currentBook = bookId;
    el('hd-book-name').textContent = book.name;
    el('hd-book-compiler').textContent = book.compiler;
    el('hd-book-meta').textContent = `${fmtCount.format(book.count)} hadith · ${book.sections.length} chapters`;
    this.renderChapterList();
  },

  renderChapterList() {
    const book = this.book(this.currentBook);
    if (!book) return;
    const q = el('hd-search').value.trim().toLowerCase();
    const rows = book.sections.filter((s) => !q
      || s.title.toLowerCase().includes(q)
      || String(s.n) === q);

    el('hd-chapter-list').innerHTML = rows.map((s) => `
      <li>
        <a class="hd-chapter" href="#/hadith/${book.id}/${s.n}">
          <span class="qr-surah-num" aria-hidden="true"><span>${s.n}</span></span>
          <span class="hd-chapter-title">${esc(s.title || `Chapter ${s.n}`)}</span>
          <span class="hd-chapter-range">${s.first === s.last ? s.first : `${s.first}–${s.last}`}</span>
        </a>
      </li>`).join('');

    const status = el('hd-chapter-status');
    status.hidden = rows.length > 0;
    if (!rows.length) status.textContent = 'No chapter matches that search.';
  },

  /* ------------------------------------------------------------ reader --- */

  async openNumber(bookId, number) {
    try {
      await this.loadBooks();
    } catch {
      this.fallBack();
      return;
    }
    if (!this.book(bookId) || !Number.isFinite(number)) {
      this.fallBack();
      return;
    }
    const n = await this.chapterOf(bookId, number);
    if (n === null) this.fallBack(`#/hadith/${bookId}`);
    else this.openChapter(bookId, n, number);
  },

  async openChapter(bookId, n, number) {
    this.stopTracking();
    this.showView('hd-reader-view');
    const token = ++this.openToken;
    const status = el('hd-status');

    try {
      await this.loadBooks();
    } catch { /* the chapter may still be cached */ }
    const book = this.book(bookId);
    const section = book?.sections.find((s) => s.n === n);
    if (this.books && (!book || !section)) {
      this.fallBack(book ? `#/hadith/${bookId}` : '#/hadith');
      return;
    }

    if (this.chapter?.book !== bookId || this.chapter?.section !== n) {
      this.chapter = null;
      el('hd-text').innerHTML = '';
      this.renderHead(bookId, section);
      status.textContent = 'Loading…';
      status.hidden = false;
    }

    try {
      const chapter = await this.loadChapter(bookId, n);
      if (token !== this.openToken) return;
      this.chapter = chapter;
      status.hidden = true;
      this.renderHead(bookId, section, chapter);
      this.renderText();
      this.renderPager(book, n);
    } catch {
      if (token !== this.openToken) return;
      status.textContent = 'This chapter could not be loaded. Check your connection and try again.';
      status.hidden = false;
      return;
    }

    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
    if (token !== this.openToken) return;
    if (number !== null && this.chapter.items.some((h) => h.n === number)) this.scrollToHadith(number, true);
    else window.scrollTo(0, 0);
    this.startTracking();
  },

  renderHead(bookId, section, chapter) {
    const book = this.book(bookId);
    const many = book && book.sections.length > 1;
    el('hd-back').href = many ? `#/hadith/${bookId}` : '#/hadith';
    el('hd-back').textContent = many ? `‹ ${book.name}` : '‹ All collections';
    el('hd-kicker').textContent = book && book.sections.length > 1
      ? `${book.name} · Chapter ${section?.n ?? ''}`
      : (book?.compiler || '');
    el('hd-title').textContent = book && book.sections.length === 1
      ? book.name
      : (chapter?.title || section?.title || '');
    const count = chapter ? chapter.items.length : null;
    el('hd-meta').textContent = section
      ? `Hadith ${section.first === section.last ? section.first : `${section.first}–${section.last}`}` +
        (count !== null ? ` · ${fmtCount.format(count)} hadith` : '')
      : '';
  },

  /** Grades exactly as the API gives them; Bukhari and Muslim are all sahih. */
  gradesFor(item) {
    if (item.grades.length) {
      return item.grades.map((g) => `${g.grade} · ${g.name}`);
    }
    return HADITH_ALL_SAHIH.includes(this.chapter.book) ? ['Sahih'] : [];
  },

  renderText() {
    const { arabic } = this.settings;
    const items = this.chapter.items.filter((h) => h.en || arabic);
    el('hd-text').innerHTML = items.map((h) => {
      const on = this.bookmarkSet.has(`${this.chapter.book}:${h.n}`);
      const grades = this.gradesFor(h);
      return `
      <article class="hd-item" id="hd-${h.n}" data-number="${h.n}">
        <header class="hd-item-head">
          <span class="hd-num">Hadith ${h.n}</span>
          <span class="hd-acts">
            ${h.en ? `<button class="hd-send" type="button" data-number="${h.n}"
                    aria-label="Send hadith ${h.n} to ${esc(name(Us.other()))}">${US_ICONS.send}</button>` : ''}
            <button class="hd-bm${on ? ' is-bookmarked' : ''}" type="button" data-number="${h.n}"
                    aria-pressed="${on}" aria-label="Hadith ${h.n}, ${on ? 'bookmarked' : 'bookmark'}">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                <path d="M7 3.5h10a1 1 0 0 1 1 1v16l-6-4-6 4v-16a1 1 0 0 1 1-1z"/>
              </svg>
            </button>
          </span>
        </header>
        ${arabic && h.ar ? `<p class="hd-ar" lang="ar" dir="rtl">${esc(h.ar)}</p>` : ''}
        ${h.en ? `<p class="hd-en">${esc(h.en)}</p>` : ''}
        ${grades.length ? `<p class="hd-grades">${grades.map((g) => `<span class="hd-grade">${esc(g)}</span>`).join('')}</p>` : ''}
      </article>`;
    }).join('');

    el('hd-opt-arabic').setAttribute('aria-pressed', String(arabic));
  },

  renderPager(book, n) {
    if (!book) {
      el('hd-prev').hidden = true;
      el('hd-next').hidden = true;
      return;
    }
    const i = book.sections.findIndex((s) => s.n === n);
    const link = (node, section, label) => {
      node.hidden = !section;
      if (!section) return;
      node.href = `#/hadith/${book.id}/${section.n}`;
      node.innerHTML = `<span class="qr-pager-label">${label}</span>
        <span class="qr-pager-name">${esc(section.title || `Chapter ${section.n}`)}</span>`;
    };
    link(el('hd-prev'), book.sections[i - 1], 'Previous chapter');
    link(el('hd-next'), book.sections[i + 1], 'Next chapter');
  },

  scrollToHadith(number, highlight) {
    const node = document.getElementById(`hd-${number}`);
    if (!node) return;
    node.scrollIntoView({ block: 'start' });
    if (highlight) {
      node.classList.add('is-target');
      setTimeout(() => node.classList.remove('is-target'), 2600);
    }
  },

  refreshBookmarkButtons() {
    if (!this.chapter) return;
    for (const btn of document.querySelectorAll('#hd-text .hd-bm')) {
      const on = this.bookmarkSet.has(`${this.chapter.book}:${btn.dataset.number}`);
      btn.classList.toggle('is-bookmarked', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', `Hadith ${btn.dataset.number}, ${on ? 'bookmarked' : 'bookmark'}`);
    }
  },

  /* -------------------------------------------------------- bookmarks --- */

  async toggleBookmark(number) {
    const book = this.chapter.book;
    const key = `${book}:${number}`;
    const adding = !this.bookmarkSet.has(key);
    const before = [...this.bookmarks];

    if (adding) {
      this.bookmarkSet.add(key);
      this.bookmarks.unshift({ book, hadith_number: number });
    } else {
      this.bookmarkSet.delete(key);
      this.bookmarks = this.bookmarks.filter((b) => `${b.book}:${b.hadith_number}` !== key);
    }
    this.refreshBookmarkButtons();
    this.renderBookmarks();

    try {
      if (adding) await Data.addHadithBookmark(State.me, book, number);
      else await Data.removeHadithBookmark(State.me, book, number);
    } catch (err) {
      this.bookmarks = before;
      this.bookmarkSet = new Set(before.map((b) => `${b.book}:${b.hadith_number}`));
      this.refreshBookmarkButtons();
      this.renderBookmarks();
      toast(`Could not save the bookmark: ${esc(err.message || err)}`, { error: true });
    }
  },

  /* --------------------------------------------------- reading position --- */

  startTracking() {
    this.stopTracking();
    const visible = new Set();
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const n = Number(entry.target.dataset.number);
        if (entry.isIntersecting) visible.add(n);
        else visible.delete(n);
      }
      if (visible.size) this.noteReading(Math.min(...visible));
    }, { rootMargin: '-20% 0px -55% 0px' });
    for (const node of el('hd-text').querySelectorAll('.hd-item')) this.observer.observe(node);
  },

  stopTracking() {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
    this.flushPosition();
  },

  noteReading(number) {
    if (!this.chapter) return;
    const { book, section } = this.chapter;
    if (this.reading?.book === book && this.reading.number === number) return;
    this.reading = { book, section, number };
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
      localStorage.setItem(HADITH_POSITION_STORE + State.me, JSON.stringify(pos));
    } catch { /* Supabase still has it */ }
    try {
      await Data.saveHadithProgress(State.me, pos.book, pos.section, pos.number);
      this.progress = [
        { person: State.me, book: pos.book, section: pos.section, hadith_number: pos.number, updated_at: pos.updated_at },
        ...this.progress.filter((r) => !(r.person === State.me && r.book === pos.book)),
      ];
    } catch { /* this device's copy stands until the next save */ }
  },
};

Info.add('hadith', () => '<p>Tap the bookmark beside a hadith to save it.</p>');

Sections.register({
  id: 'hadith',
  label: 'Hadith',
  order: 3,
  icon: `<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
    <path d="M6.5 3.5h11v17h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M8.5 8h6M8.5 11.5h6M8.5 15h4" fill="none" stroke="currentColor" stroke-width="1.6"
          stroke-linecap="round"/>
  </svg>`,
  root: document.getElementById('section-hadith'),
  show: (params) => Hadith.show(params),
});
