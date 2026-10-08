/* ===========================================================================
   learn.js — the Learn section: how to pray, step by step.

   The words come from learn-content.js, except the Qur'an, which is fetched
   from the same Al-Quran Cloud API the Quran tab uses (via Quran.loadEditions,
   so it shares that cache). Nothing of the Qur'an is written into the source.

   Depends on learn-content.js, learn-audio.js, quran.js, router.js and, at
   run time, app.js (el, esc) and times.js (PRAYERS).
   =========================================================================== */

const LEARN_TAB_STORE = 'kharwa.learn.tab';
const LEARN_SUNNAH_STORE = 'kharwa.learn.sunnah';

const Learn = {
  panels: {},          // sub-tab id -> its element, built on first visit
  tab: null,
  includeSunnah: true, // Practice walks the sunnah rakʿahs too
  surahs: {},          // surah number -> { ar: [], tr: [], en: [], basmala }
  guide: null,         // { prayer, steps, at } while pray-along is open
  wakeLock: null,

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
    if (pic) return `<img class="ln-pic" src="${pic.src}" alt="${esc(pic.alt)}" loading="lazy" decoding="async">`;
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

  surahMarkup(s) {
    return `
      <div class="ln-surah" data-surah="${s.n}">
        <div class="ln-recite-head">
          <span class="ln-recite-label">${esc(s.name)}</span>
          <span class="ln-surah-meaning">${esc(s.meaning)}</span>
        </div>
        ${LearnAudio.controls('human', 'quran', 2)}
        ${s.note ? `<p class="ln-note">${esc(s.note)}</p>` : ''}
        <div class="ln-surah-body" data-body="${s.n}">
          <p class="ln-loading">Loading…</p>
        </div>
      </div>`;
  },

  /** Fills every surah body on the page, one request per surah, then cached. */
  async fillSurahs(root) {
    for (const node of root.querySelectorAll('[data-body]')) {
      const n = Number(node.dataset.body);
      try {
        const s = await this.loadSurah(n);
        const first = s.basmala ? 1 : 0;   // the basmala is line 0 when there is one
        node.innerHTML = s.ar.map((ar, i) => `
          <div class="ln-ayah" data-line="${i + first}">
            <p class="ln-ar" lang="ar" dir="rtl">${esc(ar)}${
              s.ar.length > 1 ? `<span class="ln-ayah-n">${i + 1}</span>` : ''}</p>
            <p class="ln-tr">${esc(s.tr[i])}</p>
            <p class="ln-en">${esc(s.en[i])}</p>
          </div>`).join('');
        if (s.basmala) {
          node.insertAdjacentHTML('afterbegin',
            `<p class="ln-ar ln-basmala" lang="ar" dir="rtl" data-line="0">${esc(s.basmala)}</p>`);
        }
      } catch {
        node.innerHTML = '<p class="ln-note">Could not load the text. It will try again next time.</p>';
      }
    }
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
    if (tab.id === 'steps') this.fillSurahs(panel);
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
    try { localStorage.setItem(LEARN_TAB_STORE, tab.id); } catch { /* private mode */ }
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

  renderPositions() {
    return this.card('positions', 'The positions', `
      <ol class="ln-positions">
        ${LEARN_POSITIONS.map((p, i) => `
          <li class="ln-pos" id="pos-${p.id}">
            <div class="ln-pos-head">
              <span class="ln-pos-n">${i + 1}</span>
              <span class="ln-pos-names">
                <span class="ln-pos-name">${esc(p.name)}</span>
                <span class="ln-pos-sub">${esc(p.sub)}</span>
              </span>
            </div>
            <div class="ln-pos-body">
              <div class="ln-pos-fig">${this.figure(p.fig)}</div>
              <div class="ln-pos-text">
                <ul class="ln-bullets">${p.body.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
                ${p.note ? `<p class="ln-note">${esc(p.note)}</p>` : ''}
              </div>
            </div>
            ${p.says.map((k) => this.reciteMarkup(k)).join('')}
            ${p.surah ? `
              <p class="ln-lead">Then Al-Fātiḥah, and in the first two rakʿahs a surah after it.</p>
              ${LEARN_SURAHS.map((s) => this.surahMarkup(s)).join('')}` : ''}
          </li>`).join('')}
      </ol>`);
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
      else if (LEARN_POSITIONS.some((p) => p.id === target)) { scrollTo = `pos-${target}`; target = 'positions'; }
      else target = null;
    }

    if (!target) {
      let remembered = null;
      try { remembered = localStorage.getItem(LEARN_TAB_STORE); } catch { /* private mode */ }
      target = LEARN_TABS.some((t) => t.id === remembered) ? remembered : LEARN_TABS[0].id;
      history.replaceState(null, '', `#/learn/${target}`);
    }

    this.activate(target);

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
   method on Learn: the bar, the routing and the remembered tab follow from it.
   The id is the second hash segment, e.g. #/learn/wudu. */
const LEARN_TABS = [
  {
    id: 'basics',
    label: 'Basics',
    intro: 'What needs to be in place before you begin.',
    render: () => Learn.renderBasics(),
  },
  {
    id: 'wudu',
    label: 'Wudu',
    intro: 'The washing before prayer, step by step, and what undoes it.',
    render: () => Learn.renderWudu(),
  },
  {
    id: 'steps',
    label: 'Steps',
    intro: 'One rakʿah, from the opening takbīr to the salām.',
    render: () => Learn.renderPositions(),
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
];

/* The ⓘ on the sub-tab bar: what this tab covers, and the imam note. */
Info.add('learn', () => {
  const tab = LEARN_TABS.find((t) => t.id === Learn.tab) || LEARN_TABS[0];
  return `<p>${esc(tab.intro)}</p><p>${esc(LEARN_DISCLAIMER)}</p>`;
});

/* Routes from before the tabs were renamed. */
const LEARN_ALIASES = { positions: 'steps', 'pray-along': 'practice' };

/* --------------------------------------------------------------- events --- */

document.getElementById('section-learn').addEventListener('click', (event) => {
  const act = event.target.closest('.ln-player [data-act]');
  if (act) { LearnAudio.handle(act); return; }

  const guide = event.target.closest('.ln-guide-btn');
  if (guide) Learn.openGuide(guide.dataset.prayer);
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

try {
  Learn.includeSunnah = localStorage.getItem(LEARN_SUNNAH_STORE) !== '0';
} catch { /* private mode: leave it on */ }

Sections.register({
  id: 'learn',
  label: 'Learn',
  order: 4,
  icon: `<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
    <path d="M12 4.2 2.6 9 12 13.8 21.4 9 12 4.2z" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M6.8 11.3v4.4c0 1.3 2.3 2.4 5.2 2.4s5.2-1.1 5.2-2.4v-4.4"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M21.4 9v4.6" fill="none" stroke="currentColor" stroke-width="1.6"
          stroke-linecap="round"/>
  </svg>`,
  root: document.getElementById('section-learn'),
  enabled: () => Data.showsLearn(State.me),
  show: (params) => Learn.show(params),
});
