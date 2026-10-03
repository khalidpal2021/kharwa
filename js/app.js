/* ===========================================================================
   app.js — the Prayer section, settings, and boot.

   One set of markup for both widths; CSS reflows it at 900px. The only
   behavioural difference is the hover menu, which is a pointer affordance and
   so is revealed by CSS on desktop only.
   =========================================================================== */

const PERSON_STORE = 'kharwa.person';
/* Tapping your own mark cycles through what can be stored. Missed is never
   stored or chosen: see shownStatus(). */
const CYCLE = ['none', 'on_time', 'late'];

const el = (id) => document.getElementById(id);

/** Display names come from the database, so never drop them into HTML raw. */
function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Very high latitudes can leave adhan without a valid time for a prayer. */
function timeText(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? fmtTime.format(date)
    : '—';
}

const State = {
  me: null,            // 'khalid' | 'marwa'
  viewDate: todayKey(),
  tick: null,
  ayahFor: null,       // date key of the ayah on screen
  ayahLoading: null,   // date key being fetched
};

/* ============================================================== helpers === */

function name(person) {
  return Data.people[person]?.display_name || person;
}

/**
 * What a mark shows: the logged status, or 'missed' once an empty prayer's
 * window has closed. That covers every empty prayer on a past day, except last
 * night's Isha until this morning's Fajr.
 */
function shownStatus(person, date, prayer, now = new Date()) {
  const stored = Data.status(person, date, prayer);
  if (stored !== 'none') return stored;
  const end = windowEnd(date, prayer);
  const closed = end instanceof Date && !Number.isNaN(end.getTime())
    ? now >= end
    : date < todayKey();
  return closed ? 'missed' : 'none';
}

function toast(message, { error = false } = {}) {
  const node = document.createElement('div');
  node.className = `toast${error ? ' is-error' : ''}`;
  node.innerHTML = message;
  el('toasts').appendChild(node);
  setTimeout(() => {
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 240);
  }, 4200);
}

function showBanner(text) {
  const b = el('banner');
  b.textContent = text;
  b.hidden = false;
}

/* ================================================================= gate === */

function storedPerson() {
  try {
    const v = localStorage.getItem(PERSON_STORE);
    return PEOPLE_IDS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

function showGate() {
  el('gate').hidden = false;
  el('app').hidden = true;
}

for (const btn of document.querySelectorAll('.gate-btn')) {
  btn.addEventListener('click', () => {
    try {
      localStorage.setItem(PERSON_STORE, btn.dataset.person);
    } catch { /* ignore, they will be asked again next visit */ }
    State.me = btn.dataset.person;
    el('gate').hidden = true;
    el('app').hidden = false;
    start();
  });
}

/* =============================================================== chrome === */

function renderHeader() {
  const now = new Date();
  el('gregorian').innerHTML =
    `<span class="greg-long">${esc(fmtGregorian.format(now))}</span>` +
    `<span class="greg-short">${esc(fmtGregorianShort.format(now))}</span>`;
  el('hijri').textContent = hijriFor(now);
}

function renderNextUp() {
  const now = new Date();
  const next = nextPrayerFrom(now);

  el('next-name').textContent = next.label;
  el('next-until').textContent = untilText(next.time - now);
  el('next-time').textContent = timeText(next.time) + (next.tomorrow ? ' tomorrow' : '');
  return next;
}

/**
 * The date label is as wide as the widest date it can show, so the arrows
 * never shift. In a proportional font that depends on the weekday and month
 * ("Wed, May 30" can outgrow "Wed, Sep 30"), so every combination is stacked,
 * hidden, in the label's grid cell, in this browser's own locale.
 */
function fillDaySizer() {
  const sizer = el('day-sizer');
  if (sizer.childElementCount) return;
  const spans = [];
  for (let month = 0; month < 12; month += 1) {
    for (let day = 24; day <= 30; day += 1) { // seven days covers every weekday
      const span = document.createElement('span');
      span.textContent = fmtDayNav.format(new Date(2026, month, day));
      spans.push(span);
    }
  }
  sizer.replaceChildren(...spans);
}

/** "Back to today" when it fits on the row, otherwise just "Today". Measured,
    not guessed, since the date label's width depends on the locale. */
function fitBackLink() {
  const link = el('day-today');
  const row = link.parentElement;
  link.textContent = 'Back to today';
  if (row.scrollWidth > row.clientWidth) link.textContent = 'Today';
}

window.addEventListener('resize', () => fitBackLink());
document.fonts.ready.then(() => fitBackLink());

function renderDayNav() {
  const today = todayKey();
  fillDaySizer();
  fitBackLink();
  el('day-label').textContent = fmtDayNav.format(parseKey(State.viewDate));

  // Hidden by visibility, not display, so nothing around it moves.
  el('day-today').classList.toggle('is-invisible', State.viewDate === today);
  el('day-next').disabled = State.viewDate >= addDays(today, 1);
}

/* ============================================================= timeline === */

/**
 * The five prayers evenly spaced along a rule, with the marker interpolated
 * inside whichever segment the clock currently sits in — so even spacing and a
 * truthful marker do not contradict each other.
 *
 * Part of the Next Prayer card, so always the real today: the day chosen in the
 * tracker never changes it.
 */
function renderTimeline() {
  const now = new Date();
  const { times } = timesFor(dateKey(now));
  const step = 100 / (PRAYERS.length - 1);
  const current = currentPrayerAt(now);

  let html = PRAYERS.map((p, i) => {
    const t = times[p.key];
    const past = t <= now;
    return `
      <div class="tl-point${past ? ' is-past' : ''}${current === p.key ? ' is-current' : ''}"
           data-prayer="${p.key}" style="left: ${(i * step).toFixed(2)}%">
        <i class="tl-tick"></i>
        <span class="tl-name">${p.label}</span>
        <span class="tl-time">${timeText(t)}</span>
      </div>`;
  }).join('');

  const n = now.getTime();
  let pos = null;
  if (n >= times.fajr.getTime() && n <= times.isha.getTime()) {
    for (let i = 0; i < PRAYERS.length - 1; i += 1) {
      const a = times[PRAYERS[i].key].getTime();
      const b = times[PRAYERS[i + 1].key].getTime();
      if (n >= a && n <= b) {
        pos = (i + (b > a ? (n - a) / (b - a) : 0)) * step;
        break;
      }
    }
  }
  if (pos !== null) {
    html += `<div class="tl-marker" style="left: ${pos.toFixed(2)}%" aria-hidden="true"></div>`;
  }

  el('timeline').innerHTML = html;
}

/* ================================================================ marks === */

/** The four states, told apart by shape as well as colour. */
function markSvg(status) {
  const open = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" focusable="false">';
  if (status === 'on_time') {
    return `${open}
      <circle class="mark-fill" cx="12" cy="12" r="11"/>
      <path class="mark-check" d="M7.2 12.4l3.1 3.1 6.4-6.8" fill="none"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  if (status === 'late') {
    return `${open}
      <path class="mark-half" d="M12 1.75a10.25 10.25 0 0 0 0 20.5z"/>
      <circle class="mark-ring mark-ring--gold" cx="12" cy="12" r="10.25" fill="none" stroke-width="1.5"/>
    </svg>`;
  }
  if (status === 'missed') {
    return `${open}
      <circle class="mark-ring mark-ring--missed" cx="12" cy="12" r="10.25" fill="none" stroke-width="1.5"/>
      <path class="mark-strike" d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8" fill="none" stroke-width="1.75" stroke-linecap="round"/>
    </svg>`;
  }
  return `${open}
    <circle class="mark-ring mark-ring--empty" cx="12" cy="12" r="10.25" fill="none" stroke-width="1.5"/>
  </svg>`;
}

function markMarkup(person, prayer) {
  const stored = Data.status(person, State.viewDate, prayer);
  const status = shownStatus(person, State.viewDate, prayer);
  const mine = person === State.me;
  const who = esc(name(person));
  const label = `${who}, ${PRAYER_LABEL[prayer]}: ${STATUS_LABEL[status].toLowerCase()}`;

  if (!mine) {
    return `<div class="markwrap">
      <span class="mark" role="img" aria-label="${label}">${markSvg(status)}</span>
    </div>`;
  }

  const item = (value, text) => `
    <button class="markmenu-btn${stored === value ? ' is-active' : ''}" type="button"
            data-set="${value}" data-person="${person}" data-prayer="${prayer}"
            aria-label="${PRAYER_LABEL[prayer]}: ${text}">${text}</button>`;

  return `<div class="markwrap is-mine">
    <button class="mark" type="button" data-person="${person}" data-prayer="${prayer}"
            aria-label="${label}. Activate to change.">${markSvg(status)}</button>
    <div class="markmenu">
      ${item('on_time', 'On time')}${item('late', 'Late')}${item('none', 'Clear')}
    </div>
  </div>`;
}

/** ✓ on time · ◐ late · ✕ missed, drawn with the marks themselves. */
function renderLegend() {
  el('tt-legend').innerHTML = ['on_time', 'late', 'missed']
    .map((s) => `<span class="tt-legend-item">${markSvg(s)}${STATUS_LABEL[s].toLowerCase()}</span>`)
    .join('<span class="tt-legend-sep" aria-hidden="true">·</span>');
}

/* ============================================================ timetable === */

function renderTimetable() {
  const { times } = timesFor(State.viewDate);
  const isToday = State.viewDate === todayKey();
  const next = isToday ? nextPrayerFrom(new Date()) : null;

  el('head-khalid').textContent = name('khalid');
  el('head-marwa').textContent = name('marwa');

  el('timetable').innerHTML = PRAYERS.map((p) => {
    const isNext = next && !next.tomorrow && next.key === p.key;
    return `
      <li class="tt-row${isNext ? ' is-next' : ''}" data-prayer="${p.key}">
        <div class="tt-names"><span class="tt-en">${p.label}</span></div>
        <div class="tt-time">${timeText(times[p.key])}</div>
        ${markMarkup('khalid', p.key)}
        ${markMarkup('marwa', p.key)}
      </li>`;
  }).join('');
}

/* ============================================================== streaks === */

function dayComplete(person, key) {
  return PRAYERS.every((p) => {
    const s = Data.status(person, key, p.key);
    return s === 'on_time' || s === 'late';
  });
}

/**
 * A day only breaks a run once a prayer there has actually been missed. Missed
 * is derived rather than stored, so this asks shownStatus, not the log.
 */
function dayMissed(person, key) {
  return PRAYERS.some((p) => shownStatus(person, key, p.key) === 'missed');
}

function prayedCount(person, key) {
  return PRAYERS.filter((p) => {
    const s = Data.status(person, key, p.key);
    return s === 'on_time' || s === 'late';
  }).length;
}

const personComplete = (person) => (key) => dayComplete(person, key);
const personMissed = (person) => (key) => dayMissed(person, key);
const duoComplete = (key) => PEOPLE_IDS.every((p) => dayComplete(p, key));
const duoMissed = (key) => PEOPLE_IDS.some((p) => dayMissed(p, key));

/**
 * Consecutive complete days ending today. A today still in progress is stepped
 * over rather than counted against the run — it only breaks it once a prayer
 * there has actually been missed.
 */
function runEndingToday(isComplete, isMissed) {
  const today = todayKey();
  let cursor = today;

  if (!isComplete(today)) {
    if (isMissed(today)) return 0;
    cursor = addDays(today, -1);
  }

  let count = 0;
  while (count < HISTORY_DAYS && isComplete(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/** The longest run anywhere in the history we have loaded. */
function bestRun(isComplete) {
  const today = todayKey();
  let best = 0;
  let run = 0;
  for (let i = HISTORY_DAYS; i >= 0; i -= 1) {
    if (isComplete(addDays(today, -i))) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

function streakFor(person) {
  return runEndingToday(personComplete(person), personMissed(person));
}

function duoStreak() {
  return runEndingToday(duoComplete, duoMissed);
}

function lastSevenDays() {
  const today = todayKey();
  const days = [];
  for (let i = 6; i >= 0; i -= 1) days.push(addDays(today, -i));
  return days;
}

/* ------------------------------------------------------------- ledger --- */

/** Remembered so a new best can be highlighted the moment it is reached. */
let lastDuoBest = null;

/**
 * The seven days as a compact table: a column per day, a row for the pair and
 * one for each of us. Marks are typographic — a check, a count, an en dash.
 */
function renderStreaks() {
  const today = todayKey();
  const days = lastSevenDays();
  const duo = duoStreak();
  const duoBest = bestRun(duoComplete);

  const newBest = lastDuoBest !== null && duoBest > lastDuoBest && duo === duoBest;
  lastDuoBest = duoBest;

  const tipFor = (key) => {
    const each = PEOPLE_IDS
      .map((p) => `${name(p)} ${prayedCount(p, key)}/${PRAYERS.length}`)
      .join(' · ');
    return `${fmtGregorianShort.format(parseKey(key))} · ${each}`;
  };

  const cell = (key, inner, duoRow) => {
    const tip = esc(tipFor(key));
    return `<button class="lg-c${duoRow ? ' is-duo' : ''}" type="button" data-date="${key}"
                    title="${tip}" aria-label="${tip}. Show this day.">${inner}</button>`;
  };

  const TICK = '<span class="lg-tick">&#10003;</span>';
  const DASH = '<span class="lg-dash">&ndash;</span>';

  /** A check when the day is done, a count while it is going, a dash when
      there is nothing to say yet, struck through once a finished day has a
      prayer missing. */
  function personMark(person, key) {
    const n = prayedCount(person, key);
    if (n === PRAYERS.length) return TICK;
    if (key < today && dayMissed(person, key)) {
      return `<span class="lg-n is-missed">${n}</span>`;
    }
    if (n > 0) return `<span class="lg-n">${n}</span>`;
    return DASH;
  }

  const head = days.map((key) => {
    const d = parseKey(key);
    return `<span class="lg-h${key === today ? ' is-today' : ''}" aria-hidden="true">
      <span class="lg-wd">${fmtDayShort.format(d).slice(0, 1)}</span>
      <span class="lg-dm">${d.getDate()}</span>
    </span>`;
  }).join('');

  const streakBits = (n, best, cls) =>
    `<span class="lg-streak${cls}">${n}</span>` +
    (best > n ? `<span class="lg-best">best ${best}</span>` : '');

  const duoRow =
    `<span class="lg-lab is-duo">
       <span class="lg-duo-label">Together</span>
       ${streakBits(duo, duoBest, newBest ? ' is-new-best' : '')}
     </span>` +
    days.map((key) => cell(key, duoComplete(key) ? TICK : DASH, true)).join('');

  const personRows = PEOPLE_IDS.map((person) =>
    `<span class="lg-lab">
       <span class="lg-name">${esc(name(person))}</span>
       ${streakBits(streakFor(person), bestRun(personComplete(person)), '')}
     </span>` +
    days.map((key) => cell(key, personMark(person, key), false)).join('')
  ).join('');

  const bothDone = PEOPLE_IDS.every((p) => dayComplete(p, today));

  el('streaks').innerHTML = `
    <div class="lg">
      <span class="lg-h lg-corner" aria-hidden="true"></span>
      ${head}
      ${duoRow}
      ${personRows}
    </div>
    ${bothDone ? '<p class="sk-note">You both completed today.</p>' : ''}`;
}

/* ================================================================= ayah === */

/** Once per date; a failure with nothing cached just leaves the card hidden. */
async function renderAyah() {
  const key = todayKey();
  if (State.ayahFor === key || State.ayahLoading === key) return;
  State.ayahLoading = key;

  try {
    const ayah = await loadAyah(key);
    if (todayKey() !== key) return;
    el('ayah-ar').textContent = ayah.arabic;
    el('ayah-en').textContent = ayah.english;
    el('ayah-ref').textContent = `${ayah.surah} · ${ayah.number}`;
    el('ayah-link').href = `#/quran/${ayah.number.replace(':', '/')}`;
    el('ayah').hidden = false;
    State.ayahFor = key;
  } catch {
    el('ayah').hidden = true;
  } finally {
    State.ayahLoading = null;
  }
}

/* ============================================================== render ==== */

/** Everything that shows a logged status. */
function renderStatuses() {
  const focused = document.activeElement;
  const restore = focused && focused.classList && focused.classList.contains('markmenu-btn')
    ? { set: focused.dataset.set, person: focused.dataset.person, prayer: focused.dataset.prayer }
    : null;

  renderTimetable();
  renderStreaks();

  // Re-rendering replaces the button the keyboard was on; put focus back.
  if (restore) {
    const again = document.querySelector(
      `.markmenu-btn[data-set="${restore.set}"][data-person="${restore.person}"][data-prayer="${restore.prayer}"]`
    );
    if (again) again.focus();
  }
}

function render() {
  renderHeader();
  renderNextUp();
  renderDayNav();
  renderTimeline();
  renderStatuses();
  renderLegend();
  renderAyah();
}

/* ========================================================= interaction === */

/** The one place a status is written. */
async function setStatus(person, prayer, next) {
  if (person !== State.me) return;

  const date = State.viewDate;
  const before = Data.status(person, date, prayer);
  if (before === next) return;

  // Optimistic, so a tap feels instant on a phone.
  Data.setLocal(person, date, prayer, next);
  renderStatuses();

  try {
    await Data.writeStatus(person, date, prayer, next);
  } catch (err) {
    Data.setLocal(person, date, prayer, before);
    renderStatuses();
    toast(`Could not save: ${esc(err.message || err)}`, { error: true });
  }
}

el('timetable').addEventListener('click', (event) => {
  const item = event.target.closest('.markmenu-btn');
  if (item) {
    setStatus(item.dataset.person, item.dataset.prayer, item.dataset.set);
    return;
  }
  // Tapping the mark itself cycles, which is how the phone works.
  const mark = event.target.closest('button.mark');
  if (!mark) return;
  const { person, prayer } = mark.dataset;
  const before = Data.status(person, State.viewDate, prayer);
  setStatus(person, prayer, CYCLE[(CYCLE.indexOf(before) + 1) % CYCLE.length]);
});

/* day navigation */

/** Only the tracker follows the chosen day; the Next Prayer card stays on today. */
async function goToDay(key) {
  State.viewDate = key;
  renderDayNav();
  renderStatuses();
  await Data.ensureDay(key).catch(() => {});
  renderStatuses();
}

el('day-prev').addEventListener('click', () => goToDay(addDays(State.viewDate, -1)));
el('day-next').addEventListener('click', () => goToDay(addDays(State.viewDate, 1)));
el('day-today').addEventListener('click', () => goToDay(todayKey()));

el('streaks').addEventListener('click', (event) => {
  const cell = event.target.closest('.lg-c');
  if (cell) goToDay(cell.dataset.date);
});

/* keyboard: arrows change day, T jumps to today */
document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (!el('settings').hidden) return;
  if (Sections.current !== 'prayer') return;

  const t = event.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    goToDay(addDays(State.viewDate, -1));
  } else if (event.key === 'ArrowRight') {
    if (State.viewDate >= addDays(todayKey(), 1)) return;
    event.preventDefault();
    goToDay(addDays(State.viewDate, 1));
  } else if (event.key === 't' || event.key === 'T') {
    event.preventDefault();
    goToDay(todayKey());
  }
});

/* settings */

function openSettings() {
  const me = Data.people[State.me] || {};
  el('settings-who').textContent = `Signed in on this device as ${name(State.me)}.`;
  el('set-name').value = me.display_name || '';
  el('set-status').textContent = '';
  el('settings').hidden = false;
  el('set-name').focus();
}

function closeSettings() {
  el('settings').hidden = true;
  el('settings-open').focus();
}

el('settings-open').addEventListener('click', openSettings);
el('settings-close').addEventListener('click', closeSettings);
el('settings-scrim').addEventListener('click', closeSettings);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !el('settings').hidden) closeSettings();
});

el('set-save').addEventListener('click', async () => {
  const patch = { display_name: el('set-name').value.trim() || name(State.me) };

  el('set-status').textContent = 'Saving…';
  try {
    await Data.saveSettings(State.me, patch);
    el('set-status').textContent = 'Saved.';
    render();
    setTimeout(closeSettings, 550);
  } catch (err) {
    el('set-status').textContent = `Could not save: ${err.message || err}`;
  }
});

el('switch-person').addEventListener('click', () => {
  try {
    localStorage.removeItem(PERSON_STORE);
  } catch { /* ignore */ }
  location.reload();
});

/* =============================================================== realtime = */

function onRemoteChange(change) {
  // My own edits already rendered optimistically.
  if (change.person === State.me) {
    renderStatuses();
    return;
  }

  // Only logging a prayer is news; clearing one passes quietly.
  if (change.status !== 'on_time' && change.status !== 'late') {
    renderStatuses();
    return;
  }

  const who = esc(name(change.person));
  const prayer = PRAYER_LABEL[change.prayer];
  let line = `<b>${who}</b> prayed ${prayer}`;
  if (change.status === 'late') line += ' (late)';

  if (change.date !== todayKey()) line += ` · ${friendlyDay(change.date)}`;

  toast(line);
  renderStatuses();
}

/* ============================================================== section === */

Sections.register({
  id: 'prayer',
  label: 'Prayer',
  order: 1,
  icon: `<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
    <path d="M6 20.5V11a6 6 0 0 1 6-6.5A6 6 0 0 1 18 11v9.5" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M4 20.5h16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,
  root: el('section-prayer'),
  show: () => render(),
});

/* ================================================================= boot === */

async function start() {
  Sections.start();
  render();

  if (!Data.configured) {
    showBanner(
      'Supabase is not configured yet, so nothing is being saved. ' +
      'Add your project URL and anon key to config.js, then reload.'
    );
    startClock();
    return;
  }

  try {
    await Data.loadPeople();
    await Data.loadRecent();
    render();
  } catch (err) {
    showBanner(`Could not reach Supabase: ${err.message || err}`);
  }

  Data.subscribe(onRemoteChange);
  startClock();

  // Coming back to the tab on a phone: catch up on anything missed.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      await Data.loadPeople();
      await Data.loadRecent();
      render();
    } catch { /* stay with what we have */ }
  });
}

function startClock() {
  if (State.tick) clearInterval(State.tick);
  let lastDate = todayKey();
  let lastNext = null;
  let lastMinute = -1;

  State.tick = setInterval(() => {
    const next = renderNextUp();
    const now = new Date();

    if (todayKey() !== lastDate) {
      lastDate = todayKey();
      lastNext = next?.key || null;
      lastMinute = now.getMinutes();
      render();
      return;
    }

    // A prayer time arriving closes the previous window, so marks can turn
    // to missed: redraw everything that shows a status.
    if (next && next.key !== lastNext) {
      lastNext = next.key;
      renderStatuses();
      renderTimeline();
    } else if (now.getMinutes() !== lastMinute) {
      lastMinute = now.getMinutes();
      renderTimeline();
    }
  }, 1000);
}

/* Entry point. */
Data.init();
State.me = storedPerson();
if (State.me) {
  el('app').hidden = false;
  start();
} else {
  showGate();
}
