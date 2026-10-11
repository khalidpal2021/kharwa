/* ===========================================================================
   theme.js — light and dark.

   Settings → App → Appearance, saved per device:
   - auto:   dark from Maghrib until sunrise, by today's prayer times
   - light / dark
   - system: follow the phone (prefers-color-scheme)

   The inline script in index.html's <head> sets <html data-theme> before the
   first paint, from the saved choice and the sunrise/Maghrib times cached
   here. This module keeps it right while the app is open: it re-checks every
   minute, on return to the app and when the phone's scheme changes, and
   fades between the two.

   Depends on times.js (timesFor, dateKey, addDays).
   =========================================================================== */

const THEME_STORE = 'kharwa.theme';          // 'auto' | 'light' | 'dark' | 'system'
const THEME_SUN_STORE = 'kharwa.theme.sun';  // { 'YYYY-MM-DD': ['HH:MM' sunrise, 'HH:MM' maghrib] }
const THEME_SUN_DAYS = 14;                   // cached ahead, for a first paint days later
const THEME_CHOICES = ['auto', 'light', 'dark', 'system'];

const THEME_HINT = {
  auto:   'Dark from Maghrib until sunrise.',
  light:  'Always light.',
  dark:   'Always dark.',
  system: 'Follows your phone’s setting.',
};

const Theme = {
  phone: window.matchMedia('(prefers-color-scheme: dark)'),
  fadeTimer: null,

  choice() {
    let v = null;
    try { v = localStorage.getItem(THEME_STORE); } catch { /* private mode */ }
    return THEME_CHOICES.includes(v) ? v : 'auto';
  },

  /** Whether it is between Maghrib and sunrise now, by today's times. */
  isNight(now = new Date()) {
    const t = timesFor(dateKey(now)).times;
    return now < (t.sunrise || t.fajr) || now >= t.maghrib;
  },

  wanted(choice = this.choice()) {
    if (choice === 'dark') return 'dark';
    if (choice === 'light') return 'light';
    if (choice === 'system') return this.phone.matches ? 'dark' : 'light';
    return this.isNight() ? 'dark' : 'light';
  },

  /** Sets the theme on <html>, fading if it changed and `fade` is asked. */
  apply(fade) {
    const root = document.documentElement;
    const next = this.wanted();
    if (root.dataset.theme !== next) {
      if (fade && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        root.classList.add('theme-fade');
        clearTimeout(this.fadeTimer);
        this.fadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 700);
      }
      root.dataset.theme = next;
      document.dispatchEvent(new CustomEvent('kharwa:theme', { detail: next }));
    }
    this.paintStatusBar();
  },

  /** The phone's status bar takes the page's own background. */
  paintStatusBar() {
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
    if (meta && bg) meta.setAttribute('content', bg);
  },

  /** Keeps sunrise and Maghrib for the coming days, for the inline script. */
  cacheSun() {
    const out = {};
    const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    let key = dateKey(new Date());
    for (let i = 0; i < THEME_SUN_DAYS; i++) {
      const t = timesFor(key).times;
      out[key] = [hhmm(t.sunrise || t.fajr), hhmm(t.maghrib)];
      key = addDays(key, 1);
    }
    try { localStorage.setItem(THEME_SUN_STORE, JSON.stringify(out)); } catch { /* private mode */ }
  },

  /* ------------------------------------------------------------ settings --- */

  renderSetting() {
    const choice = this.choice();
    for (const btn of document.querySelectorAll('#set-theme [data-theme-choice]')) {
      const on = btn.dataset.themeChoice === choice;
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    }
    const hint = document.getElementById('set-theme-hint');
    if (hint) hint.textContent = THEME_HINT[choice];
  },

  choose(choice) {
    try { localStorage.setItem(THEME_STORE, choice); } catch { /* this session only */ }
    this.renderSetting();
    this.apply(true);
    flashSaved('theme');
  },

  bindSetting() {
    const group = document.getElementById('set-theme');
    if (!group) return;
    const buttons = [...group.querySelectorAll('[data-theme-choice]')];
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-theme-choice]');
      if (btn) this.choose(btn.dataset.themeChoice);
    });
    // A radio group: the arrow keys move the choice.
    group.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const i = buttons.indexOf(document.activeElement);
      const next = buttons[(i + step + buttons.length) % buttons.length];
      next.focus();
      this.choose(next.dataset.themeChoice);
    });
    this.renderSetting();
  },

  init() {
    this.cacheSun();
    this.apply(false);
    this.bindSetting();
    setInterval(() => this.apply(true), 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { this.cacheSun(); this.apply(true); }
    });
    this.phone.addEventListener('change', () => this.apply(true));
  },
};

Theme.init();
