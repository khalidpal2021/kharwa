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

/* ------------------------------------------------------------- streaks --- */

/** Remembered so a new best can be highlighted the moment it is reached. */
let lastDuoBest = null;

const STATE_WORD = { prayed: 'prayed', missed: 'missed', none: 'not yet' };

/** What a single square says: prayed, missed, or nothing to show yet. */
function cellState(person, key, prayer) {
  const s = shownStatus(person, key, prayer);
  if (s === 'on_time' || s === 'late') return 'prayed';
  return s === 'missed' ? 'missed' : 'none';
}

/**
 * Three streak figures over a square per prayer per day, seven days wide. The
 * weekday header and both grids share one grid, so every column lines up.
 */
function renderStreaks() {
  const today = todayKey();
  const days = lastSevenDays();
  const duo = duoStreak();
  const duoBest = bestRun(duoComplete);   // still drives the new-best highlight

  const newBest = lastDuoBest !== null && duoBest > lastDuoBest && duo === duoBest;
  lastDuoBest = duoBest;

  const figure = (label, n, isDuo) => `
    <div class="st-top${isDuo ? ' is-duo' : ''}">
      <span class="st-n${isDuo && newBest ? ' is-new-best' : ''}">${n}</span>
      <span class="st-l">${esc(label)}</span>
    </div>`;

  const head = days.map((key) => `
    <span class="st-wd${key === today ? ' is-today' : ''}" aria-hidden="true">${
      fmtDayShort.format(parseKey(key)).slice(0, 2)}</span>`).join('');

  const block = (person) => `
    <h3 class="st-name">${esc(name(person))}</h3>` +
    PRAYERS.map((p) => `
      <span class="st-pl" aria-hidden="true">${p.label.slice(0, 1)}</span>` +
      days.map((key) => {
        const state = cellState(person, key, p.key);
        const tip = `${name(person)} · ${p.label} · ${
          fmtGregorianShort.format(parseKey(key))} · ${STATE_WORD[state]}`;
        return `<button class="st-cell" type="button" data-date="${key}"
                        title="${esc(tip)}" aria-label="${esc(tip)}. Show this day."
                      ><i class="st-dot is-${state}"></i></button>`;
      }).join('')).join('');

  const bothDone = PEOPLE_IDS.every((p) => dayComplete(p, today));

  el('streaks').innerHTML = `
    <div class="st-tops">
      ${figure('Together', duo, true)}
      ${PEOPLE_IDS.map((p) => figure(name(p), streakFor(p), false)).join('')}
    </div>

    <hr class="rule st-rule" />

    <div class="st-grid">
      <span class="st-corner" aria-hidden="true"></span>
      ${head}
      ${PEOPLE_IDS.map(block).join('')}
    </div>

    <p class="st-legend" aria-hidden="true">
      <span><i class="st-dot is-prayed"></i>prayed</span>
      <span><i class="st-dot is-missed"></i>missed</span>
      <span><i class="st-dot is-none"></i>not yet</span>
    </p>

    ${bothDone ? '<p class="sk-note">You both completed today.</p>' : ''}`;
}

/* ================================================================= qada === */

/** The five, plus Witr, which is only ever owed from the backlog. */
const QADA_PRAYERS = [...PRAYERS, { key: 'witr', label: 'Witr' }];

/** How many of the most recent owed prayers the card lists. */
const QADA_LIST = 5;

/**
 * What a person owes: every prayer shown as missed from their qada start
 * through today, oldest first, plus the backlog. Making one up is logging it
 * as late, which takes it off the list.
 */
function qadaOwed(person) {
  const missed = [];
  const start = Data.qadaStart(person);
  const today = todayKey();
  const yesterday = addDays(today, -1);
  const now = new Date();

  for (let key = start; key && key <= today; key = addDays(key, 1)) {
    for (const p of PRAYERS) {
      // Before yesterday every window has closed, so skip the prayer times.
      const isMissed = key < yesterday
        ? Data.status(person, key, p.key) === 'none'
        : shownStatus(person, key, p.key, now) === 'missed';
      if (isMissed) missed.push({ date: key, prayer: p.key });
    }
  }

  const backlog = Data.backlog[person] || {};
  const counts = Object.fromEntries(QADA_PRAYERS.map((p) => [p.key, backlog[p.key] || 0]));
  for (const m of missed) counts[m.prayer] += 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return { missed, backlog, counts, total };
}

function renderQada() {
  const me = State.me;
  const owed = qadaOwed(me);

  const otherLine = PEOPLE_IDS.filter((p) => p !== me).map((p) => {
    const n = qadaOwed(p).total;
    return `<p class="qd-other">${esc(name(p))}: ${n ? `${n} to make up` : 'all caught up'}</p>`;
  }).join('');

  if (!owed.total) {
    el('qada').innerHTML = `<p class="qd-clear">All caught up.</p>${otherLine}`;
    return;
  }

  const showWitr = (owed.backlog.witr || 0) > 0;
  const counts = QADA_PRAYERS
    .filter((p) => p.key !== 'witr' || showWitr)
    .map((p) => `<span class="qd-count${owed.counts[p.key] ? '' : ' is-zero'}"
                       title="${p.label}: ${owed.counts[p.key]}">${p.label.slice(0, 1)}&nbsp;${owed.counts[p.key]}</span>`)
    .join('<span class="qd-sep" aria-hidden="true">·</span>');

  const recent = owed.missed.slice(-QADA_LIST);
  const earlier = owed.missed.length - recent.length;
  const missedRows = recent.map((m) => `
    <li class="qd-row">
      <span class="qd-what">${PRAYER_LABEL[m.prayer]} · ${esc(fmtDayNav.format(parseKey(m.date)))}</span>
      <button class="btn qd-btn" type="button" data-date="${m.date}" data-prayer="${m.prayer}"
              aria-label="Mark ${PRAYER_LABEL[m.prayer]}, ${esc(fmtGregorianShort.format(parseKey(m.date)))}, as made up">Made up</button>
    </li>`).join('');

  const backlogRows = QADA_PRAYERS
    .filter((p) => (owed.backlog[p.key] || 0) > 0)
    .map((p) => `
      <li class="qd-row">
        <span class="qd-what">${p.label} · ${owed.backlog[p.key]} from before</span>
        <button class="btn qd-btn" type="button" data-backlog="${p.key}"
                aria-label="Made up one ${p.label} from before">&minus;1 Made up</button>
      </li>`).join('');

  el('qada').innerHTML = `
    <div class="qd-top">
      <span class="qd-n">${owed.total}</span>
      <span class="qd-l">to make up</span>
    </div>
    <p class="qd-counts">${counts}</p>
    ${earlier ? `<p class="qd-more">${earlier} earlier not shown</p>` : ''}
    ${missedRows ? `<ul class="qd-list" aria-label="Recent missed prayers">${missedRows}</ul>` : ''}
    ${backlogRows ? `<ul class="qd-list" aria-label="Owed from before Kharwa">${backlogRows}</ul>` : ''}
    ${otherLine}`;
}

el('qada').addEventListener('click', async (event) => {
  const btn = event.target.closest('.qd-btn');
  if (!btn) return;

  if (btn.dataset.date) {
    setStatus(State.me, btn.dataset.prayer, 'late', btn.dataset.date);
    return;
  }

  const prayer = btn.dataset.backlog;
  const before = Data.backlog[State.me]?.[prayer] || 0;
  if (before < 1) return;
  try {
    await Data.saveBacklog(State.me, { [prayer]: before - 1 });
  } catch (err) {
    toast(`Could not save: ${esc(err.message || err)}`, { error: true });
  }
  renderQada();
});

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
  renderQada();

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

/** The one place a status is written. The Qada card passes its own date. */
async function setStatus(person, prayer, next, date = State.viewDate) {
  if (person !== State.me) return;

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
  const cell = event.target.closest('.st-cell');
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
  el('set-learn').checked = Data.showsLearn(State.me);
  el('set-status').textContent = '';

  const first = Data.firstLog[State.me];
  el('set-qada-start').value = Data.qadaStart(State.me) || '';
  el('set-qada-start').max = todayKey();
  el('set-qada-start-note').textContent = first
    ? `Missed prayers count as owed from this date. Clear it to go back to your first log, ${
      fmtGregorianShort.format(parseKey(first))}.`
    : 'Missed prayers count as owed from this date. Left empty, it is your first log.';

  const backlog = Data.backlog[State.me] || {};
  el('set-backlog').innerHTML = QADA_PRAYERS.map((p) => `
    <label class="set-backlog-item">
      <span class="set-backlog-label">${p.label}</span>
      <input class="input" type="number" inputmode="numeric" min="0" max="99999" step="1"
             data-prayer="${p.key}" value="${backlog[p.key] || 0}"${Data.backlogReady ? '' : ' disabled'} />
    </label>`).join('');
  el('set-backlog-note').textContent = Data.backlogReady
    ? 'Prayers you owe from before you started using Kharwa.'
    : 'Run supabase/schema.sql again to turn this on.';
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
  const me = Data.people[State.me] || {};
  const patch = { display_name: el('set-name').value.trim() || name(State.me) };

  // Stored only when it differs from the first log, so an untouched date keeps
  // following it. qada_start is absent until schema.sql is re-run.
  const start = el('set-qada-start').value || null;
  const qadaStart = start && start !== Data.firstLog[State.me] ? start : null;
  if (qadaStart !== (me.qada_start || null)) {
    if (!('qada_start' in me)) {
      el('set-status').textContent = 'Run supabase/schema.sql again to change the qada start date.';
      return;
    }
    patch.qada_start = qadaStart;
  }

  // Absent until schema.sql is re-run, when the default still applies.
  const showLearn = el('set-learn').checked;
  if (showLearn !== Data.showsLearn(State.me)) {
    if (!('show_learn' in me)) {
      el('set-status').textContent = 'Run supabase/schema.sql again to change the Learn tab.';
      return;
    }
    patch.show_learn = showLearn;
  }

  const backlog = Data.backlog[State.me] || {};
  const counts = {};
  for (const input of el('set-backlog').querySelectorAll('input')) {
    const n = Math.max(0, Math.floor(Number(input.value) || 0));
    if (n !== (backlog[input.dataset.prayer] || 0)) counts[input.dataset.prayer] = n;
  }

  el('set-status').textContent = 'Saving…';
  try {
    await Data.saveSettings(State.me, patch);
    if (Data.backlogReady) await Data.saveBacklog(State.me, counts);
    // An earlier start reaches back past the logs in the cache.
    if ('qada_start' in patch) await Data.loadRecent();
    if ('show_learn' in patch) Sections.refresh();
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
    Sections.refresh(); // show_learn may differ from the default
    await Data.loadQada();
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
      Sections.refresh(); // show_learn may differ from the default
      await Data.loadQada();
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
