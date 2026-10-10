/* ===========================================================================
   month.js — a month of prayers, opened from "Month ›" on the Streaks card.

   A bottom sheet on a phone, a modal on desktop. The month in Playfair with
   its Hijri months under it, ‹ › to move (never past this month, never
   before the first log), and Khalid · Marwa · Together. Then a Sunday-first
   calendar, each day the same five pill bars as the week view (Fajr at the
   top): gold prayed, grey missed, an outline not yet due or no data. A
   complete day has a faint gold tint, today a thin gold ring; a future day,
   or one before the first log, is just its faint number. Tap a day to
   open it in the Today table. Under it: complete days, the longest run of
   them, and prayers on time out of those prayed; and, only when something
   was missed, a quiet line naming the prayer missed most.

   What counts as prayed, missed or complete is the week view's own
   (cellState, dayComplete in app.js); Together needs both. A month's logs
   are loaded the first time it is shown and kept with the cache; until they
   are here the bars stay neutral, never missed.

   Loaded on first use through lazy.js. Depends on data.js, times.js and, at
   run time, app.js (el, esc, name, State, cellState, dayComplete,
   shownStatus, goToDay, showSheet, hideSheet, swipeToClose).
   =========================================================================== */

const fmtMonthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

let fmtHijriParts;
try {
  fmtHijriParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' });
} catch {
  fmtHijriParts = null;
}

/** "Rabiʻ II – Jumada I 1448": the Hijri months a Gregorian month spans. */
function hijriSpan(first, last) {
  if (!fmtHijriParts) return '';
  const part = (d) => {
    const p = Object.fromEntries(fmtHijriParts.formatToParts(d).map((x) => [x.type, x.value]));
    return { month: p.month, year: String(p.year || '').replace(/\s*AH$/i, '') };
  };
  const a = part(first);
  const b = part(last);
  if (a.month === b.month && a.year === b.year) return `${a.month} ${a.year}`;
  if (a.year === b.year) return `${a.month} – ${b.month} ${b.year}`;
  return `${a.month} ${a.year} – ${b.month} ${b.year}`;
}

const monthOf = (key) => key.slice(0, 7);

function shiftMonth(ym, by) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MonthView = {
  shown: false,
  ym: null,
  who: null,              // a person id, or 'both'
  returnFocus: null,
  openedAt: 0,
  fetching: new Set(),    // months being loaded now
  fetched: new Set(),     // months loaded from the network this session

  /* ----------------------------------------------------------- open, close --- */

  open() {
    this.ym = monthOf(todayKey());
    this.who = State.me;
    if (!this.shown) {
      this.shown = true;
      this.openedAt = Date.now();
      this.returnFocus = document.activeElement;
      showSheet(el('month-pop'), el('month-panel'));
      el('month-panel').focus();
    }
    this.render();
    this.ensure();
  },

  close() {
    if (!this.shown) return;
    this.shown = false;
    hideSheet(el('month-pop'), el('month-panel'));
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
  },

  go(by) {
    const to = shiftMonth(this.ym, by);
    if (to < this.earliest() || to > monthOf(todayKey())) return;
    this.ym = to;
    this.render();
    this.ensure();
  },

  /** The first month with a log, for either of you. */
  earliest() {
    const firsts = PEOPLE_IDS.map((p) => Data.firstLog[p]).filter(Boolean).sort();
    return firsts.length ? monthOf(firsts[0]) : monthOf(todayKey());
  },

  /** The month's logs from the network, once per session; drawn when they come. */
  async ensure() {
    const ym = this.ym;
    if (this.fetched.has(ym) || this.fetching.has(ym) || !Data.configured) return;
    // Within the window the app already loaded this session: nothing to fetch.
    const [from, to] = Data.monthRange(ym);
    if (Data.loadedFrom && from >= Data.loadedFrom && to <= Data.loadedTo) { this.fetched.add(ym); return; }
    this.fetching.add(ym);
    try {
      await Data.loadMonth(ym);
      this.fetched.add(ym);
      Data.saveCache(State.me);
    } catch { /* stays as it is; tried again next time */ }
    this.fetching.delete(ym);
    if (this.shown && this.ym === ym) this.render();
  },

  /* ----------------------------------------------------------------- data --- */

  /** Where a person's tracking starts: their first log. Together: when both had. */
  startFor(who) {
    if (who === 'both') {
      const both = PEOPLE_IDS.map((p) => Data.firstLog[p]);
      return both.every(Boolean) ? both.sort()[1] : null;
    }
    return Data.firstLog[who] || null;
  },

  /** One prayer on one day: 'prayed', 'missed' or 'none'. */
  state(key, prayer) {
    if (this.who !== 'both') return cellState(this.who, key, prayer);
    const states = PEOPLE_IDS.map((p) => cellState(p, key, prayer));
    if (states.every((s) => s === 'prayed')) return 'prayed';
    return states.includes('missed') ? 'missed' : 'none';
  },

  complete(key) {
    return this.who === 'both' ? PEOPLE_IDS.every((p) => dayComplete(p, key)) : dayComplete(this.who, key);
  },

  /* ------------------------------------------------------------- drawing --- */

  render() {
    const ym = this.ym;
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m - 1, 1, 12);
    const days = new Date(y, m, 0).getDate();
    const today = todayKey();
    const known = Data.logsReady && Data.monthKnown(ym);
    const start = this.startFor(this.who);

    el('month-title').textContent = fmtMonthTitle.format(first);
    el('mv-hijri').textContent = hijriSpan(first, new Date(y, m - 1, days, 12));
    el('mv-prev').disabled = shiftMonth(ym, -1) < this.earliest();
    el('mv-next').disabled = ym >= monthOf(today);

    const people = [...PEOPLE_IDS.map((p) => ({ id: p, label: name(p) })), { id: 'both', label: 'Together' }];
    el('mv-who').innerHTML = people.map((x) => `
      <button class="mv-who-btn" type="button" data-who="${x.id}" aria-pressed="${x.id === this.who}">${esc(x.label)}</button>`).join('');

    const cells = [];
    for (let i = 0; i < first.getDay(); i += 1) cells.push('<span class="mv-day is-blank" aria-hidden="true"></span>');
    for (let d = 1; d <= days; d += 1) {
      const key = `${ym}-${String(d).padStart(2, '0')}`;
      const future = key > today;
      const before = !start || key < start;
      // Bars only for days that have happened (or today) since the first log.
      const bars = before || future ? '' : PRAYERS.map((p) => {
        const st = known ? this.state(key, p.key) : 'none';
        return `<i class="st-bar is-${st}"></i>`;
      }).join('');
      const done = known && !future && !before && this.complete(key);
      const label = `${fmtDayNav.format(parseKey(key))}${done ? ', complete' : ''}`;
      cells.push(`
        <button class="mv-day${done ? ' is-complete' : ''}${key === today ? ' is-today' : ''}${future ? ' is-future' : ''}${before ? ' is-before' : ''}"
                type="button" data-date="${key}" aria-label="${esc(label)}"${future ? ' disabled' : ''}>
          <span class="mv-n">${d}</span>
          ${bars ? `<span class="mv-bars">${bars}</span>` : ''}
        </button>`);
    }
    el('mv-grid').innerHTML = cells.join('');
    el('mv-grid').classList.toggle('is-loading', !known);
    el('mv-sum').innerHTML = this.summary(known, start, days);
  },

  /** Over the tracked days so far: complete days, the longest run of them,
      and how many of the prayers prayed were on time; then, only if
      something was missed, one quiet line naming the prayer missed most. */
  summary(known, start, days) {
    const stat = (n, small, label) => `
      <div class="mv-stat">
        <span class="mv-stat-n">${n}${small ? `<span class="mv-of"> ${small}</span>` : ''}</span>
        <span class="mv-stat-l">${esc(label)}</span>
      </div>`;
    const stats = (html, note = '') => `<div class="mv-stats">${html}</div>${note}`;
    if (!known) return stats(stat('–', '', 'Complete days') + stat('–', '', 'Longest streak') + stat('–', '', 'On time'));

    const now = new Date();
    const today = todayKey();
    const people = this.who === 'both' ? PEOPLE_IDS : [this.who];
    let closedDays = 0;
    let completeDays = 0;
    let run = 0;
    let longest = 0;
    let onTime = 0;
    let prayed = 0;
    const missed = Object.fromEntries(PRAYERS.map((p) => [p.key, 0]));

    for (let d = 1; d <= days; d += 1) {
      const key = `${this.ym}-${String(d).padStart(2, '0')}`;
      if (key > today || !start || key < start) continue;
      const complete = this.complete(key);

      // A day counts once all its prayers have passed, or sooner if complete.
      if (key < today || complete || now >= windowEnd(key, 'isha')) {
        closedDays += 1;
        if (complete) completeDays += 1;
      }
      // A run of complete days; today, still open, does not break one.
      if (complete) longest = Math.max(longest, (run += 1));
      else if (key < today) run = 0;

      for (const p of PRAYERS) {
        // On time out of prayed: for Together, both of you counted together.
        for (const person of people) {
          const s = Data.status(person, key, p.key);
          if (s === 'on_time' || s === 'late') prayed += 1;
          if (s === 'on_time') onTime += 1;
        }
        if (this.state(key, p.key) === 'missed') missed[p.key] += 1;
      }
    }

    const most = PRAYERS.reduce((best, p) => (missed[p.key] > (best ? missed[best.key] : 0) ? p : best), null);
    const note = most
      ? `<p class="mv-note">${most.label} missed most · ${missed[most.key]} ${missed[most.key] === 1 ? 'time' : 'times'}</p>`
      : '';
    return stats(
      stat(completeDays, `of ${closedDays}`, 'Complete days')
      + stat(longest, longest === 1 ? 'day' : 'days', 'Longest streak')
      + (prayed ? stat(onTime, `of ${prayed}`, 'On time') : stat('–', '', 'On time')),
      note,
    );
  },
};

/* --------------------------------------------------------------- events --- */

el('mv-prev').addEventListener('click', () => MonthView.go(-1));
el('mv-next').addEventListener('click', () => MonthView.go(1));
el('month-close').addEventListener('click', () => MonthView.close());
el('month-scrim').addEventListener('click', () => { if (Date.now() - MonthView.openedAt > 400) MonthView.close(); });

el('mv-who').addEventListener('click', (event) => {
  const btn = event.target.closest('[data-who]');
  if (!btn) return;
  MonthView.who = btn.dataset.who;
  MonthView.render();
});

/* A day: close, and open it in the Today table. */
el('mv-grid').addEventListener('click', (event) => {
  const day = event.target.closest('.mv-day[data-date]');
  if (!day || day.disabled) return;
  MonthView.close();
  goToDay(day.dataset.date);
  el('timetable').closest('.card')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});

// Esc closes it; arrows move the month while it is open.
window.addEventListener('keydown', (event) => {
  if (!MonthView.shown) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    MonthView.close();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    event.stopImmediatePropagation();
    MonthView.go(event.key === 'ArrowLeft' ? -1 : 1);
  }
}, true);

swipeToClose(el('month-panel'), () => el('mv-body'), () => MonthView.close());
