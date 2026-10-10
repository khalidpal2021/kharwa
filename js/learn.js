/* ===========================================================================
   learn.js — the Learn section: how to pray, step by step.

   The words come from learn-content.js, except the Qur'an, which is fetched
   from the same Al-Quran Cloud API the Quran tab uses (via Quran.loadEditions,
   so it shares that cache). Nothing of the Qur'an is written into the source.

   Depends on learn-content.js, learn-audio.js, quran.js, router.js and, at
   run time, app.js (el, esc) and times.js (PRAYERS).
   =========================================================================== */

const LEARN_SUNNAH_STORE = 'kharwa.learn.sunnah';
const LEARN_STEP_STORE = 'kharwa.learn.step';
const LEARN_SURAH_STORE = 'kharwa.learn.surah';
const LEARN_HIDE_STORE = 'kharwa.learn.hide';

function learnGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }   // private mode
}

function learnSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

const Learn = {
  panels: {},          // sub-tab id -> its element, built on first visit
  tab: null,
  includeSunnah: true, // Practice walks the sunnah rakʿahs too
  surahs: {},          // surah number -> { ar: [], tr: [], en: [], basmala }
  guide: null,         // { prayer, steps, at } while pray-along is open
  wakeLock: null,
  at: 0,               // the step shown on How to pray
  pick: 112,           // the surah chosen for the "short surah" step
  hideWords: false,    // How to pray blurs the words to test yourself

  /* ------------------------------------------------------------ qur'an --- */

  /**
   * Arabic, transliteration and English for one surah, from the Qur'an API.
   * The API prefixes the basmala to ayah 1 of every surah but Al-Fatihah, in
   * the Uthmani text only, so it is split off the same way the reader does.
   */
  async loadSurah(n) {
    if (this.surahs[n]) return this.surahs[n];

    const ids = [QURAN_ARABIC, QURAN_TRANSLIT, 'en.sahih'];
    const [texts, fatiha] = await Promise.all([
      Quran.loadEditions(n, ids),
      n === 1 ? null : Quran.loadEditions(1, [QURAN_ARABIC]),
    ]);

    // the API's Uthmani text can begin with a byte-order mark
    const ar = texts[QURAN_ARABIC].map((t) => t.replace(/^﻿/, ''));
    let basmala = null;
    if (fatiha) {
      const rest = splitBasmala(ar[0], fatiha[QURAN_ARABIC][0]);
      if (rest !== null) {
        basmala = fatiha[QURAN_ARABIC][0];
        ar[0] = rest.trim();
      }
    }

    this.surahs[n] = { ar, tr: texts[QURAN_TRANSLIT], en: texts['en.sahih'], basmala };
    return this.surahs[n];
  },

  /* ------------------------------------------------------------- audio --- */

  stopAudio() {
    LearnAudio.stop();
  },

  /* -------------------------------------------------------------- figures --- */

  /** A position's picture, from assets/learn/; wudu keeps its line drawings. */
  figure(fig) {
    const pic = LEARN_PICTURES[fig];
    if (pic) {
      return `<img class="ln-pic" src="${pic.src}" alt="${esc(pic.alt)}" width="${pic.w}" height="${pic.h}"
                   loading="lazy" decoding="async">`;
    }
    return LEARN_FIGURES[fig] || '';
  },

  /* ------------------------------------------------------- recitations --- */

  /** One recitation: Arabic, transliteration, meaning, how many times, and
      its voice. The Arabic and transliteration are cut into lines, so the
      line being recited can be lit. */
  reciteMarkup(key) {
    const r = LEARN_RECITATIONS[key];
    if (!r) return '';
    const v = LEARN_VOICES[key];
    const lines = learnLines(key, r);
    const spans = (list) => list.map((t, i) => `<span class="ln-line" data-line="${i}">${esc(t)}</span>`).join(' ');
    return `
      <div class="ln-recite" data-voice="${key}" data-times="${r.times}">
        <div class="ln-recite-head">
          <span class="ln-recite-label">${esc(r.label)}</span>
          ${r.times > 1 ? `<span class="ln-times">&times;${r.times}</span>` : ''}
        </div>
        ${LearnAudio.controls(v.kind, v.source, lines.ar.length)}
        <p class="ln-ar" lang="ar" dir="rtl">${spans(lines.ar)}</p>
        <p class="ln-tr">${lines.tr ? spans(lines.tr) : esc(r.tr)}</p>
        <p class="ln-en">${esc(r.en)}</p>
        ${r.note ? `<p class="ln-note">${esc(r.note)}</p>` : ''}
      </div>`;
  },

  /* -------------------------------------------------------------- tabs --- */

  /** The panel for a sub-tab, built the first time that tab is opened. */
  buildPanel(tab) {
    const panel = document.createElement('div');
    panel.className = 'ln-panel';
    panel.id = `learn-panel-${tab.id}`;
    panel.innerHTML = tab.render();
    LearnAudio.markVoices(panel);
    el('learn-panels').appendChild(panel);
    this.panels[tab.id] = panel;
    if (tab.id === 'how') this.renderStep();
    return panel;
  },

  renderTabs(activeId) {
    el('learn-tabs').innerHTML = LEARN_TABS.map((t) => `
      <a class="ln-tab" href="#/learn/${t.id}" data-tab="${t.id}"
         ${t.id === activeId ? 'aria-current="page"' : ''}>${esc(t.label)}</a>`).join('');
    this.updateTabFade();
  },

  /** The labels should fit at 390px; the fade is the fallback if they ever do not. */
  updateTabFade() {
    const bar = el('learn-tabs');
    const more = bar.scrollWidth - bar.scrollLeft - bar.clientWidth > 2;
    el('learn-tabs-wrap').classList.toggle('is-scrollable', more);
  },

  /** Show one sub-tab, building it if this is its first visit. */
  activate(id) {
    const tab = LEARN_TABS.find((t) => t.id === id) || LEARN_TABS[0];
    if (tab.id !== this.tab) this.stopAudio();

    if (!this.panels[tab.id]) this.buildPanel(tab);
    else if (tab.dynamic) {
      this.panels[tab.id].innerHTML = tab.render();
    }
    for (const [key, node] of Object.entries(this.panels)) node.hidden = key !== tab.id;

    this.renderTabs(tab.id);
    this.tab = tab.id;
    return tab;
  },

  /* ------------------------------------------------------- the panels --- */

  renderBasics() {
    return `

      ${this.card('before', 'Before you pray', `
        <ul class="ln-check">
          <li>You are in wudu. <a class="ln-link" href="#/learn/wudu">How to make wudu &rarr;</a></li>
          <li>Your body, your clothes and the place you pray are clean.</li>
          <li>You are covered: for men the navel to the knees at least, for women everything but the face and hands.</li>
          <li>You are facing the qibla.</li>
          <li>The time for the prayer has started.</li>
          <li>You intend the prayer. The intention is in the heart — it does not need to be said aloud.</li>
        </ul>`)}`;
  },

  renderWudu() {
    return this.card('wudu', 'Wudu', `
      <ol class="ln-steps">
        ${LEARN_WUDU.steps.map((s, i) => `
          <li class="ln-step">
            <span class="ln-step-fig">${this.figure(s.fig)}</span>
            <span class="ln-step-text">
              <span class="ln-step-title">
                <span class="ln-step-n">${i + 1}</span>${esc(s.title)}
                ${s.times > 1 ? `<span class="ln-times">&times;${s.times}</span>` : ''}
              </span>
              <span class="ln-step-body">${esc(s.body)}</span>
            </span>
          </li>`).join('')}
      </ol>
      <p class="ln-note">${esc(LEARN_WUDU.note)}</p>
      <h4 class="ln-sub">What breaks wudu</h4>
      <ul class="ln-bullets">${LEARN_WUDU.breaks.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`);
  },

  /* -------------------------------------------------------- how to pray --- */

  /** The frame: title, count and ⓘ, the dots, the step, Back and Next. The
      step itself is drawn by renderStep, and redrawn as you move. */
  renderHow() {
    const dots = LEARN_STEPS.map((st, i) => `
      <button class="ln-dot" type="button" data-step-to="${i}"
              aria-label="Step ${i + 1}: ${esc(st.name)}"></button>`).join('');
    return `
      <section class="card ln-how" aria-labelledby="ln-how-title">
        <div class="ln-how-head">
          <h2 id="ln-how-title" class="ln-how-title">How to pray</h2>
          <span id="ln-how-count" class="ln-how-count"></span>
          ${infoButton('ln-step')}
        </div>
        <div class="ln-dots">${dots}</div>
        <div id="ln-how-step" class="ln-how-step"></div>
        <div class="ln-how-nav">
          <button id="ln-how-back" class="btn btn--ghost ln-nav-btn" type="button">&lsaquo; Back</button>
          <button id="ln-how-next" class="btn btn--primary ln-nav-btn" type="button">Next &rsaquo;</button>
        </div>
      </section>`;
  },

  /** The surah a step recites: Al-Fātiḥah, or the one picked. */
  stepSurah(st) {
    if (!st.surah) return null;
    return st.surah === 'pick' ? this.pick : st.surah;
  },

  /** Whether a step has anything to play: a human recording, or the Qur'an. */
  stepVoiced(st) {
    return Boolean(st.surah) || (st.says || []).some((k) => LEARN_VOICES[k].kind === 'human');
  },

  /** The words of a step, phrase by phrase. Each line of Arabic carries a
      number counted across the whole step, so playback can light it. */
  wordsMarkup(st) {
    let line = 0;
    let arChars = 0;
    let html = '';
    const spans = (list, from) => list.map((t, i) =>
      `<span class="ln-line" data-line="${from + i}">${esc(t)}</span>`).join(' ');
    const phrase = (ar, tr, en, times = 1) => `
      <div class="ln-w">
        <p class="ln-w-ar" lang="ar" dir="rtl">${ar}</p>
        <p class="ln-w-tr">${tr}${times > 1 ? ` <span class="ln-times">&times;${times}</span>` : ''}</p>
        <p class="ln-w-en">${esc(en)}</p>
      </div>`;

    for (const key of st.says || []) {
      const r = LEARN_RECITATIONS[key];
      const lines = learnLines(key, r);
      html += phrase(spans(lines.ar, line), lines.tr ? spans(lines.tr, line) : esc(r.tr), r.en, r.times);
      line += lines.ar.length;
      arChars += r.ar.length;
    }

    const n = this.stepSurah(st);
    if (n) {
      const s = this.surahs[n];
      if (!s) {
        html += `<p class="ln-loading" data-wait="${n}">Loading…</p>`;
        arChars += 400;
      } else {
        if (s.basmala) {
          html += `
            <div class="ln-w ln-w--basmala">
              <p class="ln-w-ar" lang="ar" dir="rtl"><span class="ln-line" data-line="${line}">${esc(s.basmala)}</span></p>
            </div>`;
          line += 1;
        }
        s.ar.forEach((ar, i) => {
          html += phrase(
            `<span class="ln-line" data-line="${line}">${esc(ar)}</span><span class="ln-ayah-n">${i + 1}</span>`,
            esc(s.tr[i]), s.en[i]);
          line += 1;
          arChars += ar.length;
        });
      }
    }

    // The fewer the words, the larger they are set.
    const size = arChars <= 60 ? 'is-short' : arChars <= 160 ? 'is-mid' : 'is-long';
    return `<div class="ln-words ${size}${this.hideWords ? ' is-hidden' : ''}">${html}</div>`;
  },

  surahPickMarkup() {
    return `
      <div class="ln-pick" role="group" aria-label="Choose a surah">
        ${LEARN_SURAHS.filter((x) => x.n !== 1).map((x) => `
          <button class="ln-pick-btn" type="button" data-pick="${x.n}"
                  aria-pressed="${x.n === this.pick}">${esc(x.name)}</button>`).join('')}
      </div>`;
  },

  /** Draws the current step, and sets the count, dots and buttons around it. */
  renderStep() {
    const box = el('ln-how-step');
    if (!box) return;
    const st = LEARN_STEPS[this.at];
    const total = LEARN_STEPS.length;

    box.innerHTML = `
      <div class="ln-how-left">
        <div class="ln-how-fig">${this.figure(st.fig)}</div>
        <h3 class="ln-how-name">${esc(st.name)}</h3>
        <p class="ln-how-does">${esc(st.does)}</p>
      </div>
      <div class="ln-how-right" data-step="${st.id}">
        <div class="ln-how-words">
          ${st.surah === 'pick' ? this.surahPickMarkup() : ''}
          ${this.wordsMarkup(st)}
        </div>
        <div class="ln-how-controls">
          ${this.stepVoiced(st) ? `
            <div class="ln-player">
              <button class="ln-pbtn ln-pbtn--big" type="button" data-act="play"
                      data-label="Play" aria-label="Play" aria-pressed="false">
                ${PLAY_ICON}<span class="ln-pbtn-text sr-only">Play</span>
              </button>
            </div>` : ''}
          <button class="ln-hide" type="button" aria-pressed="${this.hideWords}">${
            this.hideWords ? 'Show words' : 'Hide words'}</button>
        </div>
      </div>`;

    el('ln-how-count').textContent = `Step ${this.at + 1} of ${total}`;
    for (const dot of document.querySelectorAll('.ln-dot')) {
      const i = Number(dot.dataset.stepTo);
      if (i === this.at) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    }
    el('ln-how-back').disabled = this.at === 0;
    el('ln-how-next').innerHTML = this.at === total - 1 ? 'Start again' : 'Next &rsaquo;';

    // The Qur'an is fetched the first time, and the step drawn again once it is here.
    const n = this.stepSurah(st);
    if (n && !this.surahs[n]) {
      const at = this.at;
      this.loadSurah(n).then(
        () => { if (this.at === at && this.stepSurah(LEARN_STEPS[at]) === n) this.renderStep(); },
        () => {
          const wait = box.querySelector(`[data-wait="${n}"]`);
          if (wait) wait.textContent = 'Could not load the text. It will try again next time.';
        });
    }
  },

  /** Moves to step i; past the last it goes round to the first. */
  goStep(i) {
    const total = LEARN_STEPS.length;
    const next = ((i % total) + total) % total;
    if (next === this.at) return;
    this.stopAudio();
    this.at = next;
    learnSet(LEARN_STEP_STORE, LEARN_STEPS[next].id);
    this.renderStep();
  },

  /** What the play button plays: each phrase that has a recording, as many
      times as it is said, then the surah ayah by ayah. Lines without a
      recording keep their number, so the lighting still lines up. */
  stepSegments(root) {
    const st = LEARN_STEPS.find((x) => x.id === root.dataset.step);
    const segs = [];
    let line = 0;
    const between = () => (segs.length ? 700 : 0);   // a breath between phrases

    for (const key of st.says || []) {
      const r = LEARN_RECITATIONS[key];
      const v = LEARN_VOICES[key];
      if (v.kind === 'human') {
        for (let rep = 0; rep < r.times; rep += 1) {
          const pause = rep ? 400 : between();
          v.lines.forEach(([start, end], i) =>
            segs.push({ src: v.src, start, end, line: line + i, pause: i ? 0 : pause }));
        }
      }
      line += learnLines(key, r).ar.length;
    }

    const n = this.stepSurah(st);
    if (n) {
      const first = LEARN_SURAH_FIRST_AYAH[n];
      const ayahs = LEARN_SURAHS.find((x) => x.n === n).ayahs;
      const ayah = (src) => segs.push({ src, start: 0, end: null, line: line++, pause: between() });
      if (n !== 1) ayah(`${QURAN_AYAH_AUDIO}1.mp3`);   // the basmala
      for (let i = 0; i < ayahs; i += 1) ayah(`${QURAN_AYAH_AUDIO}${first + i}.mp3`);
    }
    return segs;
  },

  setHideWords(on) {
    this.hideWords = on;
    learnSet(LEARN_HIDE_STORE, on ? '1' : '0');
    const box = el('ln-how-step');
    const words = box?.querySelector('.ln-words');
    if (words) {
      words.classList.toggle('is-hidden', on);
      for (const w of words.querySelectorAll('.ln-w.is-shown')) w.classList.remove('is-shown');
    }
    const btn = box?.querySelector('.ln-hide');
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Show words' : 'Hide words';
    }
  },

  setPick(n) {
    if (n === this.pick) return;
    this.stopAudio();
    this.pick = n;
    learnSet(LEARN_SURAH_STORE, String(n));
    this.renderStep();
  },

  /** The ⓘ for the current step: its detail and madhhab notes, the notes on
      its words, where the voice comes from, and the note to check with an imam. */
  stepInfo() {
    const st = LEARN_STEPS[this.at];
    const notes = [...(st.more || [])];
    const sources = new Set();
    const silent = [];
    for (const key of st.says || []) {
      const note = LEARN_RECITATIONS[key].note;
      if (note && !notes.includes(note)) notes.push(note);
      const v = LEARN_VOICES[key];
      if (v.kind === 'human') sources.add(v.source);
      else silent.push(LEARN_RECITATIONS[key].tr);
    }
    if (st.surah) sources.add('quran');
    return `
      <p><b>${esc(st.name)}</b></p>
      ${notes.map((x) => `<p>${esc(x)}</p>`).join('')}
      ${[...sources].map((src) => Info.content[`ln-voice-${src}`]()).join('')}
      ${silent.length ? `<p>No human recording of “${esc(silent.join('”, “'))}” has been
        found yet, so it has no voice here.</p>` : ''}
      <p>${esc(LEARN_DISCLAIMER)}</p>`;
  },

  renderPrayers() {
    return this.card('prayers', 'Each prayer', `
      ${PRAYERS.map((p) => this.prayerMarkup(p.key)).join('')}`);
  },

  /* ---------------------------------------------------------- practice --- */

  /** The units Practice will walk: fard always, Witr always, sunnah by choice. */
  unitsFor(key) {
    const units = LEARN_PRAYERS[key].units;
    return this.includeSunnah ? units : units.filter((u) => u.kind !== 'sunnah');
  },

  /** Small blocks showing the shape of a prayer, and the same thing in words. */
  shapeMarkup(key) {
    const units = this.unitsFor(key);
    const blocks = units.map((u) =>
      u.rakahs.map(() => `<i class="ln-blk ln-blk--${u.kind}"></i>`).join('')
    ).join('<i class="ln-blk-gap"></i>');
    const words = units.map((u) => esc(u.label)).join(' · ');
    return { blocks, words };
  },

  renderPractice() {
    const next = nextPrayerFrom(new Date()).key;
    const order = [next, ...PRAYERS.map((p) => p.key).filter((k) => k !== next)];

    const row = (key) => {
      const { blocks, words } = this.shapeMarkup(key);
      return `
        <button class="ln-row ln-guide-btn" type="button" data-prayer="${key}">
          <span class="ln-row-main">
            <span class="ln-row-top">
              <span class="ln-row-name">${esc(LEARN_PRAYERS[key].name)}</span>
              ${key === next ? '<span class="ln-next-tag">Next</span>' : ''}
            </span>
            <span class="ln-shape" aria-hidden="true">${blocks}</span>
            <span class="ln-row-sum">${words}</span>
          </span>
          <span class="ln-row-chev" aria-hidden="true">&rsaquo;</span>
        </button>`;
    };

    return `
      <section class="card ln-card">
        <label class="ln-toggle">
          <input id="ln-sunnah" type="checkbox" ${this.includeSunnah ? 'checked' : ''} />
          <span class="ln-toggle-box" aria-hidden="true"></span>
          <span class="ln-toggle-text">Include sunnah</span>
        </label>
        <div class="ln-rows">${order.map(row).join('')}</div>
      </section>`;
  },

  setSunnah(on) {
    this.includeSunnah = on;
    try { localStorage.setItem(LEARN_SUNNAH_STORE, on ? '1' : '0'); } catch { /* private mode */ }
    const panel = this.panels.practice;
    if (panel) {
      const tab = LEARN_TABS.find((t) => t.id === 'practice');
      panel.innerHTML = tab.render();
    }
  },

  card(id, title, inner) {
    return `
      <section class="card ln-card" id="learn-${id}" aria-labelledby="learn-${id}-label">
        <div class="cardhead">
          <span class="rule" aria-hidden="true"></span>
          <h2 id="learn-${id}-label" class="cardhead-text">${esc(title)}</h2>
          <span class="rule" aria-hidden="true"></span>
        </div>
        ${inner}
      </section>`;
  },

  prayerMarkup(key) {
    const p = LEARN_PRAYERS[key];
    if (!p) return '';

    const unit = (u) => `
      <div class="ln-unit">
        <div class="ln-unit-head">
          <span class="ln-unit-label ln-unit-label--${u.kind}">${esc(u.label)}</span>
          ${u.stress ? `<span class="ln-unit-note">${esc(u.stress)}</span>` : ''}
        </div>
        <div class="ln-rakahs">
          ${u.rakahs.map((r, i) => `
            <span class="ln-rak${r.aloud ? ' is-aloud' : ''}" title="Rakʿah ${i + 1}">
              <span class="ln-rak-n">${i + 1}</span>
              <span class="ln-rak-marks">
                ${r.surah ? '<span class="ln-rak-mark" title="Surah after Al-Fātiḥah">S</span>' : ''}
                ${r.qunut ? '<span class="ln-rak-mark is-qunut" title="Duʿā Qunūt">Q</span>' : ''}
                ${r.sit ? '<span class="ln-rak-mark is-sit" title="Sit for Tashahhud">&#9679;</span>' : ''}
              </span>
            </span>`).join('')}
        </div>
      </div>`;

    return `
      <div class="ln-prayer" id="learn-${key}">
        <div class="ln-prayer-head">
          <h3 class="ln-prayer-name">${esc(p.name)}</h3>
          <p class="ln-prayer-sum">${esc(p.summary)}</p>
        </div>
        ${p.units.map(unit).join('')}
        ${key === 'isha' ? `
          <p class="ln-note">Witr’s third rakʿah has an extra duʿā, Qunūt, after the
            surah and before rukūʿ. Raise the hands to the ears, say the takbīr, fold
            them again, and recite it.</p>
          ${this.reciteMarkup('qunut')}` : ''}
        <div class="ln-legend">
          <span><span class="ln-rak-mark">S</span> surah after Al-Fātiḥah</span>
          <span><span class="ln-rak-mark is-sit">&#9679;</span> sit for Tashahhud</span>
          <span><span class="ln-rak-swatch is-aloud"></span> aloud</span>
          <span><span class="ln-rak-swatch"></span> silent</span>
        </div>
        <button class="btn btn--primary ln-guide-btn" type="button" data-prayer="${key}">
          Pray along with ${esc(p.name)}
        </button>
      </div>`;
  },

  /* -------------------------------------------------------- pray along --- */

  /** One flat list of steps for a whole prayer, unit by unit, rakʿah by rakʿah. */
  buildSteps(key) {
    const p = LEARN_PRAYERS[key];
    const steps = [];
    const pos = Object.fromEntries(LEARN_POSITIONS.map((x) => [x.id, x]));

    for (const u of this.unitsFor(key)) {
      steps.push({ kind: 'unit', title: u.label, sub: `${p.name} · ${u.kind}` });

      u.rakahs.forEach((r, i) => {
        const where = `${u.label} · rakʿah ${i + 1}`;
        if (i === 0) steps.push({ ...pos.takbir, where });
        steps.push({
          ...pos.qiyam,
          where,
          says: i === 0 ? ['thana', 'taawwudh', 'tasmiyah'] : ['tasmiyah'],
          recite: r.surah
            ? 'Al-Fātiḥah, then a surah.'
            : 'Al-Fātiḥah only.',
          aloud: r.aloud,
        });
        if (r.qunut) steps.push({ ...pos.qiyam, name: 'Qunūt', sub: 'Duʿā in Witr', where, says: ['takbir', 'qunut'] });
        steps.push({ ...pos.ruku, where });
        steps.push({ ...pos.qawmah, where });
        steps.push({ ...pos.sujood, where });
        steps.push({ ...pos.jalsa, where });
        steps.push({ ...pos.sujood2, where });
        if (r.sit) {
          const last = i === u.rakahs.length - 1;
          steps.push({
            ...pos.tashahhud,
            where,
            says: last ? ['tashahhud', 'salawat', 'duaBeforeSalam'] : ['tashahhud'],
            sub: last ? 'Final sitting' : 'Middle sitting',
          });
          if (last) steps.push({ ...pos.salam, where });
        }
      });
    }
    return steps;
  },

  openGuide(key) {
    this.stopAudio();
    this.guide = { prayer: key, steps: this.buildSteps(key), at: 0 };
    el('learn-guide').hidden = false;
    document.body.classList.add('is-guiding');
    this.requestWake();
    this.renderGuide();
    el('ln-next').focus();
  },

  closeGuide() {
    this.stopAudio();
    this.guide = null;
    el('learn-guide').hidden = true;
    document.body.classList.remove('is-guiding');
    this.releaseWake();
  },

  moveGuide(by) {
    if (!this.guide) return;
    const next = this.guide.at + by;
    if (next < 0) return;
    if (next >= this.guide.steps.length) { this.closeGuide(); return; }
    this.stopAudio();
    this.guide.at = next;
    this.renderGuide();
  },

  renderGuide() {
    const { steps, at, prayer } = this.guide;
    const s = steps[at];
    const total = steps.length;

    el('ln-guide-where').textContent = s.where || LEARN_PRAYERS[prayer].name;
    el('ln-guide-count').textContent = `${at + 1} of ${total}`;
    el('ln-progress').style.width = `${((at + 1) / total) * 100}%`;

    const body = s.kind === 'unit'
      ? `<p class="ln-g-lead">${esc(s.sub)}</p>`
      : `
        <div class="ln-g-fig">${this.figure(s.fig)}</div>
        <ul class="ln-g-body">${(s.body || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        ${s.recite ? `<p class="ln-g-lead">${esc(s.recite)}${
            s.aloud ? ' <span class="ln-aloud">aloud</span>' : ' <span class="ln-silent">silently</span>'}</p>` : ''}
        ${(s.says || []).map((k) => this.reciteMarkup(k)).join('')}`;

    el('ln-guide-step').innerHTML = `
      <h2 class="ln-g-name">${esc(s.title || s.name)}</h2>
      ${s.sub && s.kind !== 'unit' ? `<p class="ln-g-sub">${esc(s.sub)}</p>` : ''}
      ${body}`;
    LearnAudio.markVoices(el('ln-guide-step'));

    el('ln-back').disabled = at === 0;
    el('ln-next').textContent = at === total - 1 ? 'Finish' : 'Next';
    el('ln-guide-step').scrollTop = 0;
  },

  /* The screen staying awake is a nicety: every failure is ignored. */
  async requestWake() {
    try {
      if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen');
    } catch { this.wakeLock = null; }
  },

  releaseWake() {
    try { this.wakeLock?.release(); } catch { /* already gone */ }
    this.wakeLock = null;
  },

  /* -------------------------------------------------------------- show --- */

  show(params) {
    this.stopAudio();

    let [target] = params;
    if (LEARN_ALIASES[target]) target = LEARN_ALIASES[target];

    // Old links pointed at a prayer or a position rather than a sub-tab.
    let scrollTo = null;
    if (target && !LEARN_TABS.some((t) => t.id === target)) {
      if (LEARN_PRAYERS[target]) { scrollTo = `learn-${target}`; target = 'prayers'; }
      else {
        const step = LEARN_STEPS.findIndex((x) => x.id === (LEARN_STEP_ALIASES[target] || target));
        if (step >= 0) { this.at = step; learnSet(LEARN_STEP_STORE, LEARN_STEPS[step].id); }
        target = step >= 0 ? 'how' : null;
      }
    }

    // Learn always opens on How to pray.
    if (!target) {
      target = LEARN_TABS[0].id;
      history.replaceState(null, '', `#/learn/${target}`);
    }

    this.activate(target);
    if (target === 'how') this.renderStep();

    if (scrollTo) {
      const node = document.getElementById(scrollTo);
      if (node) requestAnimationFrame(() => node.scrollIntoView({ block: 'start' }));
    } else {
      el('learn-tabs').scrollIntoView({ block: 'start' });
    }
  },
};

/* ----------------------------------------------------------------- tabs --- */

/* The sub-tabs, in order. Adding one means adding an entry here and a render
   method on Learn: the bar and the routing follow from it. The id is the
   second hash segment, e.g. #/learn/wudu. Learn opens on the first. */
const LEARN_TABS = [
  {
    id: 'how',
    label: 'How to pray',
    intro: 'One rakʿah, one step at a time, from the opening takbīr to the salām.',
    render: () => Learn.renderHow(),
  },
  {
    id: 'prayers',
    label: 'Prayers',
    intro: 'How many rakʿahs each prayer has. Fard is obligatory; sunnah is what '
      + 'the Prophet ﷺ kept to. Each block is one rakʿah.',
    render: () => Learn.renderPrayers(),
  },
  {
    id: 'practice',
    label: 'Practice',
    intro: 'Pick a prayer and follow along step by step.',
    render: () => Learn.renderPractice(),
    dynamic: true,            // the next prayer and the toggle change it
  },
  {
    id: 'wudu',
    label: 'Wudu',
    intro: 'The washing before prayer, step by step, and what undoes it.',
    render: () => Learn.renderWudu(),
  },
  {
    id: 'basics',
    label: 'Basics',
    intro: 'What needs to be in place before you begin.',
    render: () => Learn.renderBasics(),
  },
];

/* The ⓘ on the sub-tab bar: what this tab covers, and the imam note. */
Info.add('learn', () => {
  const tab = LEARN_TABS.find((t) => t.id === Learn.tab) || LEARN_TABS[0];
  return `<p>${esc(tab.intro)}</p><p>${esc(LEARN_DISCLAIMER)}</p>`;
});

/* The ⓘ beside "How to pray": everything about the step on screen. */
Info.add('ln-step', () => Learn.stepInfo());

/* Routes from before the tabs were renamed. */
const LEARN_ALIASES = { positions: 'how', steps: 'how', 'pray-along': 'practice' };

/* Old links to a position, by the step that now shows it. */
const LEARN_STEP_ALIASES = { qiyam: 'thana' };

/* --------------------------------------------------------------- events --- */

document.getElementById('section-learn').addEventListener('click', (event) => {
  const act = event.target.closest('.ln-player [data-act]');
  if (act) { LearnAudio.handle(act); return; }

  const guide = event.target.closest('.ln-guide-btn');
  if (guide) { Learn.openGuide(guide.dataset.prayer); return; }

  if (event.target.closest('#ln-how-next')) { Learn.goStep(Learn.at + 1); return; }
  if (event.target.closest('#ln-how-back')) { Learn.goStep(Learn.at - 1); return; }
  const dot = event.target.closest('[data-step-to]');
  if (dot) { Learn.goStep(Number(dot.dataset.stepTo)); return; }
  const pick = event.target.closest('[data-pick]');
  if (pick) { Learn.setPick(Number(pick.dataset.pick)); return; }
  if (event.target.closest('.ln-hide')) { Learn.setHideWords(!Learn.hideWords); return; }

  // With the words hidden, a tap on a phrase shows it, and a second hides it again.
  const word = event.target.closest('.ln-words.is-hidden .ln-w');
  if (word) word.classList.toggle('is-shown');
});

/* How to pray: swipe left for the next step, right for the one before. */
{
  let start = null;
  const area = document.getElementById('learn-panels');
  area.addEventListener('touchstart', (event) => {
    const t = event.touches[0];
    start = event.touches.length === 1 && event.target.closest('#ln-how-step')
      ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  area.addEventListener('touchend', (event) => {
    if (!start) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) Learn.goStep(Learn.at + (dx < 0 ? 1 : -1));
  }, { passive: true });
}

/* How to pray: the arrow keys step through, unless something else wants them. */
document.addEventListener('keydown', (event) => {
  if (Learn.guide || Learn.tab !== 'how' || el('section-learn').hidden) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); Learn.goStep(Learn.at + 1); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); Learn.goStep(Learn.at - 1); }
});

document.getElementById('learn-tabs').addEventListener('scroll', () => Learn.updateTabFade());
window.addEventListener('resize', () => Learn.updateTabFade());

document.getElementById('section-learn').addEventListener('change', (event) => {
  if (event.target.id === 'ln-sunnah') Learn.setSunnah(event.target.checked);
});

// Leaving Learn stops whatever is playing.
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#/learn')) Learn.stopAudio();
});

document.getElementById('ln-next').addEventListener('click', () => Learn.moveGuide(1));
document.getElementById('ln-back').addEventListener('click', () => Learn.moveGuide(-1));
document.getElementById('ln-close').addEventListener('click', () => Learn.closeGuide());

document.addEventListener('keydown', (event) => {
  if (!Learn.guide) return;
  if (event.key === 'Escape') { event.preventDefault(); Learn.closeGuide(); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); Learn.moveGuide(1); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); Learn.moveGuide(-1); }
});

// A screen lock is dropped when the tab is hidden; take it again on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Learn.guide) Learn.requestWake();
});

Learn.includeSunnah = learnGet(LEARN_SUNNAH_STORE) !== '0';
Learn.hideWords = learnGet(LEARN_HIDE_STORE) === '1';
{
  const step = LEARN_STEPS.findIndex((x) => x.id === learnGet(LEARN_STEP_STORE));
  if (step >= 0) Learn.at = step;
  const pick = Number(learnGet(LEARN_SURAH_STORE));
  if (LEARN_SURAHS.some((x) => x.n === pick && x.n !== 1)) Learn.pick = pick;
}

/* The nav entry is in lazy.js, which loaded this file on first visit. */
Sections.provide('learn', { show: (params) => Learn.show(params) });
