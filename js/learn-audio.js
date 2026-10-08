/* ===========================================================================
   learn-audio.js — a voice for every phrase in Learn.

   In order of preference:
   1. The Qur'an (Al-Fātiḥah, the short surahs, and the basmala) is Mishary
      Alafasy, ayah by ayah, from the same Al-Quran Cloud audio CDN the Quran
      tab uses.
   2. The prayer phrases are human recordings from Hisn al-Muslim
      (hisnmuslim.com), one file per duʿā. Each file opens with the chapter
      title and "yaqūl" and some close with "thalāth marrāt", so only the duʿā
      itself is played: `lines` holds [start, end] in seconds for each line of
      the text as it is split on the page. Every clip below was checked by
      transcribing it, and the line breaks were taken from the pauses in the
      recitation. The taʿawwudh is Alafasy, from EveryAyah.
   3. Where no recording of the exact wording was found, the browser's Arabic
      text-to-speech reads it, slowed, and the button says so.

   One <audio> element is shared and its source swapped, so iOS lets a
   sequence (ayah after ayah, or a clip repeated) keep playing after the
   first tap.

   Depends on info.js (infoButton, Info) and, at run time, app.js (esc).
   =========================================================================== */

const HISN = 'https://www.hisnmuslim.com/audio/ar/';
const QURAN_AYAH_AUDIO = 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/';

/* The first ayah of each Learn surah, numbered across the whole Qur'an, which
   is how the per-ayah audio is named. Ayah 1 is Al-Fātiḥah's basmala. */
const LEARN_SURAH_FIRST_AYAH = { 1: 1, 103: 6177, 108: 6205, 112: 6222, 113: 6226, 114: 6231 };

/* The prayer phrases, by LEARN_RECITATIONS key. `null` as an end plays to the
   end of the file. `arSplit` / `trSplit` override where the text breaks into
   lines, so each line on the page matches a pause in the recording. */
const LEARN_VOICES = {
  takbir:       { kind: 'tts' },
  thana:        { kind: 'human', source: 'hisn', src: `${HISN}28.mp3`,
                  lines: [[0.5, 3.9], [4.2, 6.6], [6.7, 9.4], [9.5, null]] },
  taawwudh:     { kind: 'human', source: 'everyayah', src: 'https://everyayah.com/data/Alafasy_128kbps/audhubillah.mp3',
                  lines: [[0.3, null]] },
  tasmiyah:     { kind: 'human', source: 'quran', src: `${QURAN_AYAH_AUDIO}1.mp3`,
                  lines: [[0, null]] },
  rukuTasbih:   { kind: 'human', source: 'hisn', src: `${HISN}33.mp3`, lines: [[5.25, 8.14]] },
  tasmi:        { kind: 'human', source: 'hisn', src: `${HISN}38.mp3`, lines: [[5.3, null]] },
  // Hisn al-Muslim has "Rabbanā wa laka-l-ḥamd, ḥamdan kathīran…": not this wording.
  tahmid:       { kind: 'tts' },
  sujoodTasbih: { kind: 'human', source: 'hisn', src: `${HISN}41.mp3`, lines: [[4.8, 7.9]] },
  // The recording says it twice; the first is played.
  jalsaDua:     { kind: 'human', source: 'hisn', src: `${HISN}48.mp3`, lines: [[7.0, 9.3]] },
  tashahhud:    { kind: 'human', source: 'hisn', src: `${HISN}52.mp3`,
                  lines: [[6.3, 12.7], [13.5, 18.8], [19.4, 24.6], [25.1, null]],
                  trSplit: /(?<=\.)\s+/ },
  salawat:      { kind: 'human', source: 'hisn', src: `${HISN}53.mp3`,
                  lines: [[9.2, 14.1], [14.6, 19.95], [19.95, 23.0], [23.8, 28.9], [29.3, 34.5], [34.6, null]] },
  duaBeforeSalam: { kind: 'human', source: 'hisn', src: `${HISN}57.mp3`,
                  lines: [[0.9, 4.9], [5.4, 9.0], [9.3, 12.7], [13.0, null]],
                  arSplit: /(?<=،)\s+(?!إِنَّكَ)|\s+(?=وَارْحَمْنِي)/,
                  trSplit: /(?<=,)\s+(?!innaka)|\s+(?=wa-rḥamnī)/ },
  salam:        { kind: 'tts' },
  // Hisn al-Muslim's Qunūt is "Allāhumma-hdinī fīman hadayt", not this one.
  qunut:        { kind: 'tts' },
};

const AR_SPLIT = /(?<=[،.])\s+/;
const TR_SPLIT = /(?<=[,.])\s+/;

/** A recitation's Arabic and transliteration, cut into matching lines. The
    transliteration is only lined up when it breaks into as many lines. */
function learnLines(key, r) {
  const v = LEARN_VOICES[key] || {};
  const ar = r.ar.split(v.arSplit || AR_SPLIT);
  const tr = r.tr.split(v.trSplit || TR_SPLIT);
  return { ar, tr: tr.length === ar.length ? tr : null };
}

/* The sources, credited in the ⓘ beside each play button. */
Info.add('ln-voice-hisn', () => `
  <p><b>Hisn al-Muslim</b></p>
  <p>A human recording from hisnmuslim.com, the collection of duʿās by Saʿīd
  al-Qaḥṭānī. Only the duʿā itself is played; the chapter title read before it
  is skipped.</p>`);
Info.add('ln-voice-quran', () => `
  <p><b>Mishary Alafasy</b></p>
  <p>Recited ayah by ayah, from the Al-Quran Cloud audio the Quran tab uses.</p>`);
Info.add('ln-voice-everyayah', () => `
  <p><b>Mishary Alafasy</b></p>
  <p>From EveryAyah.com.</p>`);
Info.add('ln-voice-tts', () => `
  <p><b>Computer voice</b></p>
  <p>No human recording of this exact wording was found, so your device's
  Arabic text-to-speech reads it, slowed down. It can get words wrong: check
  the pronunciation with someone who knows, or with your imam.</p>`);

const PLAY_ICON = `<svg class="ln-pbtn-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
  <path class="ln-play-icon" d="M8 5.5v13l11-6.5z"/>
  <rect class="ln-stop-icon" x="7" y="6" width="4" height="12" rx="1"/>
  <rect class="ln-stop-icon" x="13" y="6" width="4" height="12" rx="1"/>
</svg>`;

const LearnAudio = {
  el: null,          // the one <audio>
  cur: null,         // what is playing: { root, segs, i, rep, times, timer, raf }
  voice: undefined,  // the Arabic speech voice; null when the device has none

  /* ------------------------------------------------------------- markup --- */

  /** The play button, its source ⓘ, and Loop / 0.75× / Line by line. */
  controls(kind, source, lineCount) {
    const tts = kind === 'tts';
    const label = tts ? 'Computer voice, check pronunciation' : 'Play';
    return `
      <div class="ln-player">
        <button class="ln-pbtn${tts ? ' is-tts' : ''}" type="button" data-act="play" data-label="${label}" aria-pressed="false">
          ${PLAY_ICON}<span class="ln-pbtn-text">${label}</span>
        </button>
        ${infoButton(`ln-voice-${tts ? 'tts' : source}`)}
        <span class="ln-popts">
          <button class="ln-chip" type="button" data-act="loop" aria-pressed="false">Loop</button>
          <button class="ln-chip" type="button" data-act="slow" aria-pressed="false"
                  aria-label="Slow, 0.75 times">0.75×</button>
          ${lineCount > 1 ? `<button class="ln-chip" type="button" data-act="lines" aria-pressed="false">Line by line</button>` : ''}
        </span>
      </div>`;
  },

  /* ---------------------------------------------------------- segments --- */

  /** What to play for a recitation or a surah: one entry per line. */
  segments(root) {
    if (root.dataset.voice) {
      const key = root.dataset.voice;
      const v = LEARN_VOICES[key];
      const r = LEARN_RECITATIONS[key];
      if (v.kind === 'tts') return learnLines(key, r).ar.map((text) => ({ text }));
      return v.lines.map(([start, end]) => ({ src: v.src, start, end }));
    }
    const n = Number(root.dataset.surah);
    const first = LEARN_SURAH_FIRST_AYAH[n];
    const segs = [...root.querySelectorAll('.ln-ayah')].map((_, i) => (
      { src: `${QURAN_AYAH_AUDIO}${first + i}.mp3`, start: 0, end: null }));
    if (root.querySelector('.ln-basmala')) segs.unshift({ src: `${QURAN_AYAH_AUDIO}1.mp3`, start: 0, end: null });
    return segs;
  },

  /* ----------------------------------------------------------- playing --- */

  opt(root, act) {
    return root.querySelector(`.ln-chip[data-act="${act}"]`)?.getAttribute('aria-pressed') === 'true';
  },

  /** Taps on a player: play / stop, or flip an option. */
  handle(btn) {
    const root = btn.closest('[data-voice], [data-surah]');
    if (!root) return;
    const act = btn.dataset.act;
    if (act === 'play') {
      if (this.cur?.root === root) this.stop();
      else this.start(root);
      return;
    }
    btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true'));
    if (act === 'slow' && this.cur?.root === root && this.el) this.el.playbackRate = this.rate(root);
  },

  rate(root) {
    return this.opt(root, 'slow') ? 0.75 : 1;
  },

  start(root) {
    this.stop();
    const segs = this.segments(root);
    if (!segs.length) return;
    const play = root.querySelector('.ln-pbtn');
    play.querySelector('.ln-pbtn-text').textContent = 'Stop';
    play.setAttribute('aria-pressed', 'true');
    play.classList.add('is-playing');
    this.cur = { root, segs, i: 0, rep: 0, times: Number(root.dataset.times) || 1, timer: null, raf: null };
    this.playSeg();
  },

  stop() {
    const cur = this.cur;
    if (!cur) return;
    this.cur = null;
    clearTimeout(cur.timer);
    cancelAnimationFrame(cur.raf);
    if (this.el) {
      this.el.onended = null;
      this.el.onerror = null;
      this.el.pause();
    }
    if (window.speechSynthesis) speechSynthesis.cancel();
    this.highlight(cur.root, -1);
    const play = cur.root.querySelector('.ln-pbtn');
    play.querySelector('.ln-pbtn-text').textContent = play.dataset.label;
    play.setAttribute('aria-pressed', 'false');
    play.classList.remove('is-playing');
  },

  /** Lights the line being recited, in the Arabic and the transliteration. */
  highlight(root, i) {
    for (const node of root.querySelectorAll('[data-line]')) {
      node.classList.toggle('is-reciting', Number(node.dataset.line) === i);
    }
  },

  playSeg() {
    const cur = this.cur;
    const seg = cur.segs[cur.i];
    this.highlight(cur.root, cur.i);
    if (seg.text !== undefined) this.speak(seg.text);
    else this.playClip(seg);
  },

  playClip(seg) {
    const cur = this.cur;
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = 'auto';
    }
    const a = this.el;
    a.onended = null;
    a.onerror = () => { if (this.cur === cur) this.fail(cur.root); };
    const go = () => {
      if (this.cur !== cur) return;
      a.currentTime = seg.start;
      a.playbackRate = this.rate(cur.root);
      a.play().catch(() => { if (this.cur === cur) this.fail(cur.root); });
      a.onended = () => { if (this.cur === cur) this.segDone(); };
      if (seg.end !== null) {
        // checked every frame: timeupdate only fires about four times a second
        const watch = () => {
          if (this.cur !== cur) return;
          if (a.currentTime >= seg.end) {
            a.pause();
            this.segDone();
            return;
          }
          cur.raf = requestAnimationFrame(watch);
        };
        cur.raf = requestAnimationFrame(watch);
      }
    };
    if (a.src !== seg.src) {
      a.src = seg.src;
      a.addEventListener('loadedmetadata', go, { once: true });
      a.load();
    } else {
      go();
    }
  },

  speak(text) {
    const cur = this.cur;
    if (!this.voice) { this.fail(cur.root); return; }
    const u = new SpeechSynthesisUtterance(text);
    try { u.voice = this.voice; } catch { /* the language below still picks one */ }
    u.lang = this.voice.lang;
    u.rate = 0.8 * this.rate(cur.root);
    u.onend = () => { if (this.cur === cur) this.segDone(); };
    u.onerror = () => { if (this.cur === cur) this.fail(cur.root); };
    try {
      speechSynthesis.speak(u);
    } catch {
      this.fail(cur.root);
    }
  },

  /** After a line: in line-by-line mode, a pause as long as the line (at
      least 1.5s) to say it back; then the next line, the next repetition,
      or round again when looping. */
  segDone() {
    const cur = this.cur;
    cancelAnimationFrame(cur.raf);
    const seg = cur.segs[cur.i];
    const lineMode = this.opt(cur.root, 'lines');
    let gap = 0;
    if (lineMode) {
      const end = seg.text !== undefined ? null : (seg.end ?? this.el.duration);
      const secs = end ? end - seg.start : seg.text.length * 0.09;   // speech: a rough guess
      gap = Math.max(1500, (secs / this.rate(cur.root)) * 1000);
    }

    cur.i += 1;
    if (cur.i >= cur.segs.length) {
      cur.i = 0;
      cur.rep += 1;
      if (cur.rep >= cur.times) {
        if (!this.opt(cur.root, 'loop')) { this.stop(); return; }
        cur.rep = 0;
        gap = Math.max(gap, 1200);
      } else {
        gap = Math.max(gap, 400);
      }
    }
    if (gap) {
      cur.timer = setTimeout(() => { if (this.cur === cur) this.playSeg(); }, gap);
    } else {
      this.playSeg();
    }
  },

  fail(root) {
    this.stop();
    const text = root.querySelector('.ln-pbtn-text');
    if (text) text.textContent = 'Could not play';
  },

  /* ------------------------------------------------------------- voices --- */

  /** Finds an Arabic speech voice, once the browser has listed them. The
      computer-voice buttons say so when there is none. */
  findVoice() {
    if (!window.speechSynthesis) { this.voice = null; this.markVoices(); return; }
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      if (!voices.length) return false;
      this.voice = voices.find((v) => /^ar[-_]SA/i.test(v.lang))
        || voices.find((v) => /^ar\b/i.test(v.lang)) || null;
      this.markVoices();
      return true;
    };
    if (!pick()) {
      speechSynthesis.addEventListener('voiceschanged', pick, { once: true });
      // some browsers never fire it when there are no voices at all
      setTimeout(() => { if (this.voice === undefined) { this.voice = null; this.markVoices(); } }, 2500);
    }
  },

  markVoices(scope = document) {
    if (this.voice === undefined) return;
    for (const btn of scope.querySelectorAll('.ln-pbtn.is-tts')) {
      btn.disabled = !this.voice;
      btn.dataset.label = this.voice
        ? 'Computer voice, check pronunciation'
        : 'No Arabic computer voice on this device';
      btn.querySelector('.ln-pbtn-text').textContent = btn.dataset.label;
      btn.closest('.ln-player').querySelector('.ln-popts').hidden = !this.voice;
    }
  },
};

LearnAudio.findVoice();
