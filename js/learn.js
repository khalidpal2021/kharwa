/* ===========================================================================
   learn.js — the Learn section: how to pray, step by step.

   The words come from learn-content.js, except the Qur'an, which is fetched
   from the same Al-Quran Cloud API the Quran tab uses (via Quran.loadEditions,
   so it shares that cache). Nothing of the Qur'an is written into the source.

   Depends on learn-content.js, quran.js, router.js and, at run time, app.js
   (el, esc) and times.js (PRAYERS).
   =========================================================================== */

const LEARN_AUDIO = 'https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/';

const Learn = {
  ready: false,
  surahs: {},          // surah number -> { ar: [], tr: [], en: [], basmala }
  audio: null,         // the one <audio> element in play
  playing: null,       // surah number currently playing
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
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    this.playing = null;
    for (const b of document.querySelectorAll('.ln-play')) b.classList.remove('is-playing');
  },

  /** Plays a whole surah. The button hides itself if the audio will not load. */
  toggleAudio(n, button) {
    if (this.playing === n) { this.stopAudio(); return; }
    this.stopAudio();

    const audio = new Audio(`${LEARN_AUDIO}${n}.mp3`);
    audio.addEventListener('ended', () => this.stopAudio());
    audio.addEventListener('error', () => {
      this.stopAudio();
      button.hidden = true;
    });
    audio.play().then(() => {
      this.audio = audio;
      this.playing = n;
      button.classList.add('is-playing');
    }).catch(() => { button.hidden = true; });
  },

  /* ------------------------------------------------------- recitations --- */

  /** One recitation: Arabic, transliteration, meaning, how many times. */
  reciteMarkup(key) {
    const r = LEARN_RECITATIONS[key];
    if (!r) return '';
    return `
      <div class="ln-recite">
        <div class="ln-recite-head">
          <span class="ln-recite-label">${esc(r.label)}</span>
          ${r.times > 1 ? `<span class="ln-times">&times;${r.times}</span>` : ''}
        </div>
        <p class="ln-ar" lang="ar" dir="rtl">${esc(r.ar)}</p>
        <p class="ln-tr">${esc(r.tr)}</p>
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
          <button class="ln-play" type="button" data-surah="${s.n}"
                  aria-label="Play ${esc(s.name)}">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
              <path class="ln-play-icon" d="M8 5.5v13l11-6.5z"/>
              <rect class="ln-stop-icon" x="7" y="6" width="4" height="12" rx="1"/>
              <rect class="ln-stop-icon" x="13" y="6" width="4" height="12" rx="1"/>
            </svg>
          </button>
        </div>
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
        node.innerHTML = s.ar.map((ar, i) => `
          <div class="ln-ayah">
            <p class="ln-ar" lang="ar" dir="rtl">${esc(ar)}${
              s.ar.length > 1 ? `<span class="ln-ayah-n">${i + 1}</span>` : ''}</p>
            <p class="ln-tr">${esc(s.tr[i])}</p>
            <p class="ln-en">${esc(s.en[i])}</p>
          </div>`).join('');
        if (s.basmala) {
          node.insertAdjacentHTML('afterbegin',
            `<p class="ln-ar ln-basmala" lang="ar" dir="rtl">${esc(s.basmala)}</p>`);
        }
      } catch {
        node.innerHTML = '<p class="ln-note">Could not load the text. It will try again next time.</p>';
      }
    }
  },

  /* ------------------------------------------------------------ render --- */

  render() {
    el('learn-body').innerHTML = `
      <p class="ln-disclaimer">${esc(LEARN_DISCLAIMER)}</p>

      ${this.card('before', 'Before you pray', `
        <ul class="ln-check">
          <li>You are in wudu. <a class="ln-link" href="#/learn/wudu">How to make wudu &rarr;</a></li>
          <li>Your body, your clothes and the place you pray are clean.</li>
          <li>You are covered: for men the navel to the knees at least, for women everything but the face and hands.</li>
          <li>You are facing the qibla.</li>
          <li>The time for the prayer has started.</li>
          <li>You intend the prayer. The intention is in the heart — it does not need to be said aloud.</li>
        </ul>`)}

      ${this.card('wudu', 'Wudu', `
        <ol class="ln-steps">
          ${LEARN_WUDU.steps.map((s, i) => `
            <li class="ln-step">
              <span class="ln-step-fig">${LEARN_FIGURES[s.fig] || ''}</span>
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
        <ul class="ln-bullets">${LEARN_WUDU.breaks.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`)}

      ${this.card('positions', 'The positions', `
        <p class="ln-lead">One rakʿah, in order. Every prayer is these positions repeated.</p>
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
                <div class="ln-pos-fig">${LEARN_FIGURES[p.fig] || ''}</div>
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
        </ol>`)}

      ${this.card('prayers', 'Each prayer', `
        <p class="ln-lead">Hanafi. Fard is obligatory; sunnah is what the Prophet
          &#xFDFA; kept to. Each block is one rakʿah.</p>
        ${PRAYERS.map((p) => this.prayerMarkup(p.key)).join('')}`)}
    `;

    this.fillSurahs(el('learn-body'));
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

    for (const u of p.units) {
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
        <div class="ln-g-fig">${LEARN_FIGURES[s.fig] || ''}</div>
        <ul class="ln-g-body">${(s.body || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        ${s.recite ? `<p class="ln-g-lead">${esc(s.recite)}${
            s.aloud ? ' <span class="ln-aloud">aloud</span>' : ' <span class="ln-silent">silently</span>'}</p>` : ''}
        ${(s.says || []).map((k) => this.reciteMarkup(k)).join('')}`;

    el('ln-guide-step').innerHTML = `
      <h2 class="ln-g-name">${esc(s.title || s.name)}</h2>
      ${s.sub && s.kind !== 'unit' ? `<p class="ln-g-sub">${esc(s.sub)}</p>` : ''}
      ${body}`;

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
    if (!this.ready) {
      this.render();
      this.ready = true;
    }
    this.stopAudio();

    // #/learn/asr opens that prayer; #/learn/wudu opens that card.
    const [target] = params;
    if (!target) return;
    const node = document.getElementById(`learn-${target}`)
      || document.getElementById(`pos-${target}`);
    if (node) requestAnimationFrame(() => node.scrollIntoView({ block: 'start' }));
  },
};

/* --------------------------------------------------------------- events --- */

document.getElementById('section-learn').addEventListener('click', (event) => {
  const play = event.target.closest('.ln-play');
  if (play) { Learn.toggleAudio(Number(play.dataset.surah), play); return; }

  const guide = event.target.closest('.ln-guide-btn');
  if (guide) Learn.openGuide(guide.dataset.prayer);
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

Sections.register({
  id: 'learn',
  label: 'Learn',
  order: 4,
  icon: `<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
    <path d="M12 7.5c-2-1.6-4.2-2-7-2v12c2.8 0 5 .4 7 2 2-1.6 4.2-2 7-2v-12c-2.8 0-5 .4-7 2z"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12 7.5v12" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </svg>`,
  root: document.getElementById('section-learn'),
  show: (params) => Learn.show(params),
});
