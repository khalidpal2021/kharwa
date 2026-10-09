/* ===========================================================================
   ayah-sheet.js — tap an ayah for its context.

   A bottom sheet on a phone, a modal on desktop (the same sheet as the qada
   popup). A tab bar across the top, with the × at its end: Ayah, Tafsir,
   Revelation (only when there is an entry) and Words. A slim bar of actions
   along the bottom: previous, play, bookmark, copy, send (to the Us
   thread, us.js), next.

   Every word of explanation comes from a published work, fetched as is:
   - tafsir and Al-Wahidi's Asbab al-Nuzul from the spa5k/tafsir_api static
     files on jsDelivr (one JSON file per ayah, 404 when a work has no entry);
   - word by word from the Quran.com API (v4, no key);
   - the ayah, its translation and the surah list from Al-Quran Cloud, through
     the Quran reader's own cache; recitation from cdn.islamic.network, the
     same reciter (Mishary Alafasy) as the Learn tab.
   Nothing here is written, summarised or paraphrased. Where a source has no
   entry the sheet says so.

   Depends on quran.js (Quran, QURAN_ARABIC, splitBasmala) and, at run time,
   app.js (showSheet, hideSheet, swipeToClose, toast, esc, State).
   =========================================================================== */

const TAFSIR_API = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/';
const WORDS_API = 'https://api.quran.com/api/v4/verses/by_key/';
const AYAH_AUDIO = 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/';
const TAFSIR_STORE = 'kharwa.tafsir.';   // + person

/* The tafsirs to choose from in Settings. The first is the default: Hanafi,
   like ISOT. Slugs are spa5k's own spellings ("tafisr" included). */
const AYAH_TAFSIRS = [
  { id: 'en-tafsir-maarif-ul-quran', label: 'Ma’arif al-Qur’an', credit: 'Ma’arif al-Qur’an · Mufti Muhammad Shafi' },
  { id: 'en-tafisr-ibn-kathir', label: 'Tafsir Ibn Kathir (abridged)', credit: 'Tafsir Ibn Kathir (abridged) · Hafiz Ibn Kathir' },
  { id: 'en-al-jalalayn', label: 'Tafsir al-Jalalayn', credit: 'Tafsir al-Jalalayn · al-Mahalli and al-Suyuti' },
  { id: 'en-tafsir-al-mukhtasar', label: 'Al-Mukhtasar', credit: 'Al-Mukhtasar fi Tafsir al-Qur’an · Tafsir Center for Quranic Studies' },
];
const ASBAB = { id: 'en-asbab-al-nuzul-by-al-wahidi', credit: 'Asbab al-Nuzul · Al-Wahidi' };

const AYAH_TABS = ['ayah', 'tafsir', 'revelation', 'words'];

/* The sources, credited in an ⓘ on each tab. */
const sourceNote = (credit, via) => `
  <p><b>${esc(credit)}</b></p>
  <p>The published text, shown unchanged, from ${via}.</p>`;
Info.add('ay-tafsir', () => sourceNote(AyahSheet.tafsir().credit, 'spa5k/tafsir_api') +
  '<p>A tafsir often explains a group of ayat together, so neighbouring ayat can share it.</p>');
Info.add('ay-asbab', () => sourceNote(ASBAB.credit, 'spa5k/tafsir_api'));
Info.add('ay-words', () => sourceNote('Word by word · Quran.com', 'the Quran.com API'));

/** Paragraphs of tafsir shown before "Read more". */
const TAFSIR_LEAD = 3;

const AYAH_ICONS = {
  play: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><rect x="8.5" y="8.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path class="ay-star" d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};

const AyahSheet = {
  ready: false,
  open: false,
  want: 'ayah',        // the tab asked for; kept while moving between ayat
  tab: 'ayah',         // the tab showing (Ayah when Revelation has no entry)
  surah: null,
  ayah: null,
  token: 0,            // the ayah on screen, so a late response for another is dropped
  cache: new Map(),    // url -> promise of its JSON, for this session
  audio: null,
  returnFocus: null,

  /* ------------------------------------------------------------ fetching --- */

  /** A JSON file, fetched once per session. A 404 resolves to null: "no entry". */
  fetchJson(url) {
    if (!this.cache.has(url)) {
      const p = fetch(url).then((res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      });
      // A failure is not cached, so the next open tries again.
      p.catch(() => this.cache.delete(url));
      this.cache.set(url, p);
    }
    return this.cache.get(url);
  },

  async source(slug, s, a) {
    const data = await this.fetchJson(`${TAFSIR_API}${slug}/${s}/${a}.json`);
    // Some entries had their quotation marks lost upstream, stored as U+FFFD
    // (e.g. Al-Wahidi on 3:135). They stand where quotes belong, so they are
    // shown as plain " marks; no words are changed.
    const text = typeof data?.text === 'string' ? data.text.replace(/�/g, '"').trim() : '';
    return text || null;
  },

  async words(s, a) {
    const data = await this.fetchJson(`${WORDS_API}${s}:${a}?words=true&word_fields=text_uthmani&language=en`);
    return (data?.verse?.words || []).filter((w) => w.char_type_name === 'word');
  },

  /** The person's tafsir, or the default. */
  tafsir() {
    let id = null;
    try { id = localStorage.getItem(TAFSIR_STORE + State.me); } catch { /* default */ }
    return AYAH_TAFSIRS.find((t) => t.id === id) || AYAH_TAFSIRS[0];
  },

  setTafsir(id) {
    if (!AYAH_TAFSIRS.some((t) => t.id === id)) return;
    try { localStorage.setItem(TAFSIR_STORE + State.me, id); } catch { /* this session only */ }
  },

  /** The ayah's Arabic and translation, from the reader's cache; ayah 1 loses
      its basmala as it does in the reader. */
  async ayahText(s, a) {
    const edition = Quran.settings.edition;
    const texts = await Quran.loadEditions(s, [QURAN_ARABIC, edition]);
    let arabic = texts[QURAN_ARABIC][a - 1].replace(/^﻿/, ''); // the API starts 1:1 with a BOM
    if (a === 1 && s !== 1 && s !== 9) {
      const fatiha = await Quran.loadEditions(1, [QURAN_ARABIC]);
      arabic = splitBasmala(arabic, fatiha[QURAN_ARABIC][0]) ?? arabic;
    }
    return { arabic, translation: texts[edition][a - 1], edition };
  },

  /* ---------------------------------------------------------- navigation --- */

  /** The ayah before or after, across surahs: 2:1 comes after 1:7. */
  neighbour(s, a, step) {
    const count = (n) => Quran.surahs[n - 1].ayahs;
    if (step < 0) {
      if (a > 1) return { s, a: a - 1 };
      return s > 1 ? { s: s - 1, a: count(s - 1) } : null;
    }
    if (a < count(s)) return { s, a: a + 1 };
    return s < 114 ? { s: s + 1, a: 1 } : null;
  },

  /** Its number in the whole Quran (1–6236), which the per-ayah audio uses. */
  globalNumber(s, a) {
    let n = a;
    for (let i = 0; i < s - 1; i += 1) n += Quran.surahs[i].ayahs;
    return n;
  },

  /* ------------------------------------------------------------- opening --- */

  init() {
    this.ready = true;
    if (!Quran.ready) Quran.loadSettings();   // the reader's translation choice

    el('ayah-close').addEventListener('click', () => this.close());
    el('ayah-scrim').addEventListener('click', () => this.close());

    el('ay-tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab) return;
      this.want = tab.dataset.tab;
      this.showTab();
    });

    // Arrow keys move between the tabs that are showing.
    el('ay-tabs').addEventListener('keydown', (event) => {
      const tabs = AYAH_TABS.filter((t) => !el(`ay-tab-${t}`).hidden);
      const i = tabs.indexOf(this.tab);
      const next = {
        ArrowRight: (i + 1) % tabs.length,
        ArrowLeft: (i + tabs.length - 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      this.want = tabs[next];
      this.showTab();
      el(`ay-tab-${this.tab}`).focus();
    });

    el('ayah-body').addEventListener('click', (event) => {
      const more = event.target.closest('.ay-more');
      if (!more) return;
      const rest = el('ayah-body').querySelector(`#${more.getAttribute('aria-controls')}`);
      const open = more.getAttribute('aria-expanded') !== 'true';
      rest.hidden = !open;
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show less' : 'Read more';
    });

    el('ayah-actions').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-act]');
      if (!btn || btn.disabled) return;
      const act = btn.dataset.act;
      if (act === 'play') this.togglePlay();
      else if (act === 'prev' || act === 'next') {
        const to = this.neighbour(this.surah, this.ayah, act === 'prev' ? -1 : 1);
        if (to) this.show(to.s, to.a);
      } else if (act === 'copy') this.copy();
      else if (act === 'bookmark') this.toggleBookmark();
      else if (act === 'send') ShareSheet.openAyah(this.surah, this.ayah);
    });

    // Esc closes it, and Tab stays inside it (and on any toast above it).
    document.addEventListener('keydown', (event) => {
      if (!this.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...el('ayah-panel').querySelectorAll('button:not(:disabled):not([tabindex="-1"])'),
        ...el('toasts').querySelectorAll('button'),
      ].filter((node) => node.getClientRects().length);
      if (!focusable.length) return;
      const i = focusable.indexOf(document.activeElement);
      const next = event.shiftKey
        ? focusable[(i <= 0 ? focusable.length : i) - 1]
        : focusable[(i + 1) % focusable.length];
      event.preventDefault();
      next.focus();
    });

    swipeToClose(el('ayah-panel'), () => el('ayah-body'), () => this.close());
  },

  /** From the reader or the Ayah of the Day: always opens on the Ayah tab. */
  async openAt(s, a) {
    if (!this.ready) this.init();
    if (!this.open) {
      this.open = true;
      this.want = 'ayah';
      this.returnFocus = document.activeElement;
      showSheet(el('ayah-pop'), el('ayah-panel'));
      el('ayah-panel').focus();
    }
    // The bookmark button needs this person's bookmarks, even before the
    // Quran tab has been opened.
    if (!Quran.remoteLoaded && !this.bookmarksAsked) {
      this.bookmarksAsked = true;
      Data.loadBookmarks(State.me).then((list) => {
        if (Quran.remoteLoaded) return;
        Quran.bookmarks = list;
        Quran.bookmarkSet = new Set(list.map((b) => `${b.surah}:${b.ayah}`));
        this.renderActions();
      }).catch(() => { this.bookmarksAsked = false; });
    }
    await this.show(s, a);
  },

  close() {
    if (!this.open) return;
    this.open = false;
    this.stopAudio();
    Info.close();
    hideSheet(el('ayah-pop'), el('ayah-panel'));
    if (this.returnFocus && this.returnFocus.isConnected) this.returnFocus.focus();
  },

  /* ---------------------------------------------------------------- tabs --- */

  /**
   * Shows the tab asked for, or the Ayah tab when that one is not there for
   * this ayah (Revelation, with no entry). The ask is kept, so moving on to an
   * ayah that has an entry goes back to it.
   */
  showTab() {
    const tab = el(`ay-tab-${this.want}`)?.hidden === false ? this.want : 'ayah';
    const changed = tab !== this.tab;
    this.tab = tab;
    for (const t of AYAH_TABS) {
      const on = t === tab;
      el(`ay-tab-${t}`).setAttribute('aria-selected', String(on));
      el(`ay-tab-${t}`).tabIndex = on ? 0 : -1;
      el(`ay-pane-${t}`).hidden = !on;
    }
    el('ayah-body').setAttribute('aria-labelledby', `ay-tab-${tab}`);
    if (changed) el('ayah-body').scrollTop = 0;
    if (tab === 'words') this.renderWords();
  },

  /* ----------------------------------------------------------- rendering --- */

  /** "Aal-i-Imraan · 3:135", with Meccan / Medinan on the Ayah tab and an ⓘ
      for the source on the others. */
  refLine(info, tag = false) {
    const meta = Quran.surahs[this.surah - 1];
    return `
      <p class="ay-ref">
        <span>${esc(meta.englishName)} · ${this.surah}:${this.ayah}</span>
        ${tag ? `<span class="ay-tag">${esc(meta.type)}</span>` : ''}
        ${info ? infoButton(info) : ''}
      </p>`;
  },

  /** Shows one ayah, replacing whatever was in the sheet, on the same tab. */
  async show(s, a) {
    const token = ++this.token;
    this.stopAudio();
    Info.close();
    this.surah = s;
    this.ayah = a;
    this.text = null;   // so Copy never copies the last ayah while this one loads
    el('ayah-body').scrollTop = 0;

    try {
      await Quran.loadSurahList();
    } catch {
      el('ay-pane-ayah').innerHTML = '<p class="ay-quiet">This ayah could not be loaded. Check your connection and try again.</p>';
      return;
    }
    if (token !== this.token) return;

    const meta = Quran.surahs[s - 1];
    el('ayah-panel').setAttribute('aria-label', `${meta.englishName} ${s}:${a}`);
    this.renderActions();

    // Each pane starts with its own quiet loading line.
    el('ay-pane-ayah').innerHTML = `
      <div class="ay-verse">
        ${this.refLine(null, true)}
        <p id="ay-arabic" class="ay-arabic" lang="ar" dir="rtl"></p>
        <p id="ay-translation" class="ay-translation"><span class="ay-quiet">Loading…</span></p>
      </div>`;
    el('ay-pane-tafsir').innerHTML = `${this.refLine('ay-tafsir')}
      <div id="ay-tafsir"><p class="ay-quiet">Loading tafsir…</p></div>`;
    el('ay-pane-revelation').innerHTML = `${this.refLine('ay-asbab')}
      <div id="ay-asbab"><p class="ay-quiet">Loading…</p></div>`;
    el('ay-pane-words').innerHTML = `${this.refLine('ay-words')}
      <div id="ay-words" class="ay-words-wrap"><p class="ay-quiet">Loading…</p></div>`;
    this.showTab();

    this.ayahText(s, a).then((here) => {
      if (token !== this.token) return;
      this.text = here;
      el('ay-arabic').textContent = here.arabic;
      el('ay-translation').textContent = here.translation;
    }).catch(() => {
      if (token !== this.token) return;
      el('ay-translation').innerHTML = '<span class="ay-quiet">The text could not be loaded. Check your connection.</span>';
    });

    this.renderTafsir(token);
    this.renderAsbab(token);
  },

  /** Published text as paragraphs: the first few, then "Read more". Each
      paragraph takes its own direction, so quoted Arabic reads right to left. */
  prose(text, restId) {
    const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    const p = (t) => `<p dir="auto">${esc(t)}</p>`;
    const rest = paras.slice(TAFSIR_LEAD);
    return `
      <div class="ay-prose">${paras.slice(0, TAFSIR_LEAD).map(p).join('')}</div>
      ${rest.length ? `
        <div id="${restId}" class="ay-prose" hidden>${rest.map(p).join('')}</div>
        <button class="ay-more" type="button" aria-expanded="false" aria-controls="${restId}">Read more</button>` : ''}`;
  },

  async renderTafsir(token) {
    const t = this.tafsir();
    const { surah: s, ayah: a } = this;
    let html;
    try {
      const text = await this.source(t.id, s, a);
      if (token !== this.token) return;
      html = text
        ? this.prose(text, 'ay-tafsir-rest')
        : '<p class="ay-quiet">No tafsir available for this ayah.</p>';
    } catch {
      if (token !== this.token) return;
      html = '<p class="ay-quiet">The tafsir could not be loaded. Check your connection and try again.</p>';
    }
    el('ay-tafsir').innerHTML = html;
  },

  /** The Revelation tab is only there when Al-Wahidi has an entry. Until that
      is known it keeps however it was for the last ayah, so the bar holds still. */
  async renderAsbab(token) {
    const { surah: s, ayah: a } = this;
    let text = null;
    let failed = false;
    try {
      text = await this.source(ASBAB.id, s, a);
    } catch {
      failed = true;
    }
    if (token !== this.token) return;
    if (failed) {
      el('ay-asbab').innerHTML = '<p class="ay-quiet">This could not be loaded. Check your connection and try again.</p>';
      return;
    }
    el('ay-tab-revelation').hidden = !text;
    if (text) el('ay-asbab').innerHTML = this.prose(text, 'ay-asbab-rest');
    this.showTab();
  },

  /** Right to left, as the ayah reads: each word, its transliteration and meaning. */
  async renderWords() {
    const token = this.token;
    const box = el('ay-words');
    const key = `${this.surah}:${this.ayah}`;
    if (!box || box.dataset.for === key) return;
    box.dataset.for = key;
    try {
      const words = await this.words(this.surah, this.ayah);
      if (token !== this.token) return;
      box.innerHTML = words.length ? `
        <ol class="ay-words" dir="rtl">${words.map((w) => `
          <li class="ay-word">
            <span class="ay-word-ar" lang="ar">${esc(w.text_uthmani || '')}</span>
            <span class="ay-word-tr" dir="ltr">${esc(w.transliteration?.text || '')}</span>
            <span class="ay-word-en" dir="ltr">${esc(w.translation?.text || '')}</span>
          </li>`).join('')}
        </ol>`
        : '<p class="ay-quiet">No word-by-word text for this ayah.</p>';
    } catch {
      if (token !== this.token) return;
      delete box.dataset.for;
      box.innerHTML = '<p class="ay-quiet">Word by word could not be loaded. Check your connection and try again.</p>';
    }
  },

  /** ‹ previous, play, bookmark, copy, send, next › */
  renderActions() {
    if (this.surah === null) return;
    const { surah: s, ayah: a } = this;
    const on = Quran.bookmarkSet.has(`${s}:${a}`);
    const playing = !!this.audio;
    const btn = (act, icon, label, extra = '') => `
      <button class="ay-act" type="button" data-act="${act}" aria-label="${label}" title="${label}"${extra}>${icon}</button>`;
    el('ayah-actions').innerHTML = [
      btn('prev', AYAH_ICONS.prev, 'Previous ayah', this.neighbour(s, a, -1) ? '' : ' disabled'),
      btn('play', playing ? AYAH_ICONS.pause : AYAH_ICONS.play, playing ? 'Pause recitation' : 'Play recitation',
        ` aria-pressed="${playing}"`),
      btn('bookmark', AYAH_ICONS.star, on ? 'Remove bookmark' : 'Bookmark ayah', ` aria-pressed="${on}"`),
      btn('copy', AYAH_ICONS.copy, 'Copy ayah'),
      btn('send', US_ICONS.send, `Send to ${esc(name(Us.other()))}`),
      btn('next', AYAH_ICONS.next, 'Next ayah', this.neighbour(s, a, 1) ? '' : ' disabled'),
    ].join('');
  },

  /* ------------------------------------------------------------- actions --- */

  togglePlay() {
    if (this.audio) {
      this.stopAudio();
      return;
    }
    const audio = new Audio(`${AYAH_AUDIO}${this.globalNumber(this.surah, this.ayah)}.mp3`);
    audio.addEventListener('ended', () => this.stopAudio());
    audio.addEventListener('error', () => {
      this.stopAudio();
      toast('The recitation could not be played.', { error: true });
    });
    this.audio = audio;
    this.renderActions();
    audio.play().catch(() => this.stopAudio());
  },

  stopAudio() {
    if (!this.audio) return;
    this.audio.pause();
    this.audio = null;
    this.renderActions();
  },

  async copy() {
    if (!this.text) return;
    const meta = Quran.surahs[this.surah - 1];
    const body = `${this.text.arabic}\n\n${this.text.translation}\n\n${meta.englishName} ${this.surah}:${this.ayah}`;
    try {
      await navigator.clipboard.writeText(body);
      toast('Copied');
    } catch {
      toast('Could not copy on this device.', { error: true });
    }
  },

  async toggleBookmark() {
    await Quran.toggleBookmark(this.surah, this.ayah);
    this.renderActions();
  },
};
