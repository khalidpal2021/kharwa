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
  qadaAll: false,      // the card's full list is open
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

/** `action`, { label, run }, adds a button such as Undo, and keeps the toast up a little longer. */
function toast(message, { error = false, action = null } = {}) {
  const node = document.createElement('div');
  node.className = `toast${error ? ' is-error' : ''}${action ? ' has-action' : ''}`;
  node.innerHTML = action ? `<span>${message}</span>` : message;

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 240);
  };

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      dismiss();
      action.run();
    }, { once: true });
    node.appendChild(btn);
  }

  el('toasts').appendChild(node);
  timer = setTimeout(dismiss, action ? 5500 : 4200);
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
      ${nudgeMarkup(person, prayer)}
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

/* =============================================================== nudge === */

/* The bell beside the other person's empty circle: a push asking them to
   pray. Only today, only once the prayer has begun and while its window is
   open, and only if they have a device signed up for pushes (otherwise an ⓘ
   says so). One per prayer every 15 minutes, which send-nudge enforces too. */

const NUDGE_GAP_MS = 15 * 60_000;
const NUDGE_FLASH_MS = 2500;

const Nudge = {
  sending: new Set(),   // nudge keys waiting on the server
  flashUntil: new Map(), // nudge key -> until when "Nudged" shows
};

const BELL_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
  <path d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5v3.6L4.8 15.8h14.4l-1.7-3.2V9A5.5 5.5 0 0 0 12 3.5z"
        fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
  <path d="M9.8 18.6a2.3 2.3 0 0 0 4.4 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
</svg>`;

/** Whether the bell shows for someone's prayer, and how. Null when it does not. */
function nudgeState(person, prayer, now = new Date()) {
  const today = todayKey();
  if (person === State.me || State.viewDate !== today) return null;
  if (Data.status(person, today, prayer) !== 'none') return null;
  const start = timesFor(today).times[prayer];
  const end = windowEnd(today, prayer);
  if (!(now >= start && now < end)) return null;
  if (!Data.pushPeople.has(person)) return { off: true };

  const key = Data.nudgeKey(State.me, person, today, prayer);
  const last = Data.lastNudge(State.me, person, today, prayer);
  return {
    key,
    last,
    sending: Nudge.sending.has(key),
    flash: (Nudge.flashUntil.get(key) || 0) > now.getTime(),
    waiting: Boolean(last) && now.getTime() - last < NUDGE_GAP_MS,
  };
}

function nudgeMarkup(person, prayer) {
  const st = nudgeState(person, prayer);
  if (!st) return '';
  if (st.off) return `<span class="nudge nudge--off">${infoButton('nudge-off')}</span>`;

  const mins = Math.floor((Date.now() - st.last) / 60_000);
  const note = st.flash ? 'Nudged'
    : st.waiting ? `nudged ${mins < 1 ? 'just now' : `${mins}m ago`}` : '';
  const who = esc(name(person));
  const label = st.waiting
    ? `${who} was ${note} about ${PRAYER_LABEL[prayer]}`
    : `Nudge ${who} to pray ${PRAYER_LABEL[prayer]}`;
  return `<span class="nudge">
      <button class="nudge-btn${st.flash ? ' is-sent' : ''}" type="button"
              data-nudge="${person}" data-prayer="${prayer}" aria-label="${label}"
              ${st.waiting || st.sending ? 'disabled' : ''}>${BELL_SVG}</button>
    </span>
    ${note ? `<span class="nudge-note${st.flash ? ' is-sent' : ''}" aria-hidden="true">${note}</span>` : ''}`;
}

async function sendNudge(person, prayer) {
  const today = todayKey();
  const key = Data.nudgeKey(State.me, person, today, prayer);
  if (Nudge.sending.has(key)) return;
  Nudge.sending.add(key);
  renderTimetable();

  try {
    const res = await Data.sendNudge(State.me, person, prayer, today);
    if (res.ok) {
      Data.noteNudge(State.me, person, today, prayer, Date.parse(res.sent_at) || Date.now());
      Nudge.flashUntil.set(key, Date.now() + NUDGE_FLASH_MS);
      setTimeout(renderTimetable, NUDGE_FLASH_MS + 50);
      toast(`Nudge sent to ${esc(name(person))}`);
    } else if (res.reason === 'too_soon') {
      // sent from another device a moment ago
      Data.noteNudge(State.me, person, today, prayer, Date.parse(res.last_at));
      toast(`You nudged ${esc(name(person))} about ${PRAYER_LABEL[prayer]} a moment ago`);
    } else if (res.reason === 'logged') {
      toast(`${esc(name(person))} has already prayed ${PRAYER_LABEL[prayer]}`);
      await Data.loadRecent().catch(() => {});
    } else if (res.reason === 'no_devices') {
      Data.pushPeople.delete(person);
      toast(`${esc(name(person))} hasn’t turned on reminders yet`, { error: true });
    } else {
      toast('Couldn’t send the nudge', { error: true });
    }
  } catch (err) {
    toast(`Couldn’t send the nudge: ${esc(err.message || err)}`, { error: true });
  } finally {
    Nudge.sending.delete(key);
    renderStatuses();
  }
}

/* ================================================================ info === */

Info.add('nudge-off', () => {
  const other = PEOPLE_IDS.find((p) => p !== State.me);
  return `<p>${esc(name(other))} hasn&rsquo;t turned on reminders yet.</p>
    <p>A nudge needs them on, in Settings &rarr; App &rarr; Prayer reminders.</p>`;
});

/* What the ⓘ buttons on the Prayer tab say. */

Info.add('today', () => `
  <p class="info-legend">${['on_time', 'late', 'missed']
    .map((st) => `<span>${markSvg(st)}${STATUS_LABEL[st].toLowerCase()}</span>`).join('')}</p>
  <p>Tap your own circle to log a prayer on time or late. One left empty is
     marked missed by itself once its time has passed: when the next prayer
     begins, or for Isha at the next Fajr.</p>`);

Info.add('streaks', () => `
  <p>Each column is a day, today on the right. Its bars run from Fajr at the top
     to Isha at the bottom. Tap a day to open it in Today.</p>
  <p class="info-legend">
    <span><i class="st-bar is-prayed"></i>prayed</span>
    <span><i class="st-bar is-missed"></i>missed</span>
    <span><i class="st-bar is-none"></i>not yet</span>
  </p>
  <p>A day counts toward a streak when all five are prayed; late counts the same
     as on time. Your streak is your run of complete days, Together the run of
     days you both completed. Today never breaks a run until a prayer there is missed.</p>`);

Info.add('qada', () => `
  <p>Qada is making up a prayer you missed. Every missed prayer since you started
     tracking is listed, plus any you owed from before Kharwa (set in Settings).</p>
  <p>Mark one Made up once you have prayed it: it is logged late, and counts as prayed.</p>
  <p>Hanafi: if you owe fewer than six, make them up before the current prayer when there&rsquo;s time.</p>`);

Info.add('prayer-times', () => `
  <p>Prayer times follow the Islamic Society of Tracy&rsquo;s published timetable,
     so there is nothing to configure for them.</p>`);

Info.add('qada-start', () => {
  const first = Data.firstLog[State.me];
  return `<p>Missed prayers count as owed from this date. ${first
    ? `Clear it to go back to your first log, ${esc(fmtGregorianShort.format(parseKey(first)))}.`
    : 'Left empty, it is the date of your first log.'}</p>`;
});

Info.add('tafsir', () => `
  <p>The tafsir shown when you tap an ayah in the Quran tab. Each is the
     published text of that work, unchanged.</p>`);

Info.add('switch', () => `
  <p>Forgets who you are on this device and asks again. Nothing you have logged changes.</p>`);

Info.add('backlog', () => `
  <p>Prayers you owe from before you started using Kharwa. They are added to your
     qada, and each Made up takes one off.</p>`);

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

/** What a single bar says: prayed, missed, or nothing to show yet. */
function cellState(person, key, prayer) {
  const s = shownStatus(person, key, prayer);
  if (s === 'on_time' || s === 'late') return 'prayed';
  return s === 'missed' ? 'missed' : 'none';
}

/** "Khalid · Thu, Oct 1 · Fajr missed, 4 of 5" */
function dayTip(person, key) {
  const states = PRAYERS.map((p) => cellState(person, key, p.key));
  const missed = PRAYERS.filter((p, i) => states[i] === 'missed').map((p) => p.label);
  const prayed = states.filter((st) => st === 'prayed').length;
  let lead = '';
  if (missed.length === PRAYERS.length) lead = 'All missed, ';
  else if (missed.length) lead = `${missed.join(', ')} missed, `;
  return `${name(person)} · ${fmtDayNav.format(parseKey(key))} · ${lead}${prayed} of ${PRAYERS.length}`;
}

/**
 * Three streak figures, then for each person a week of day columns, each a
 * stack of five bars from Fajr at the top to Isha at the bottom. The weekday
 * labels come once, under the last person, on the same columns.
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

  const week = (person) => `
    <h3 class="st-name">${esc(name(person))}</h3>
    <div class="st-week">${days.map((key) => {
      const tip = dayTip(person, key);
      return `<button class="st-day${key === today ? ' is-today' : ''}" type="button" data-date="${key}"
                      title="${esc(tip)}" aria-label="${esc(tip)}. Show this day.">${
        PRAYERS.map((p) => `<i class="st-bar is-${cellState(person, key, p.key)}"></i>`).join('')}</button>`;
    }).join('')}</div>`;

  const labels = `
    <div class="st-week st-wds" aria-hidden="true">${days.map((key) => `
      <span class="st-wd${key === today ? ' is-today' : ''}">${
        fmtDayShort.format(parseKey(key)).slice(0, 2)}</span>`).join('')}</div>`;

  const bothDone = PEOPLE_IDS.every((p) => dayComplete(p, today));

  el('streaks').innerHTML = `
    <div class="st-tops">
      ${figure('Together', duo, true)}
      ${PEOPLE_IDS.map((p) => figure(name(p), streakFor(p), false)).join('')}
    </div>

    <hr class="rule st-rule" />

    ${PEOPLE_IDS.map(week).join('')}
    ${labels}

    ${bothDone ? '<p class="sk-note">You both completed today.</p>' : ''}`;
}

/* ================================================================= qada === */

/** The five, plus Witr, which is only ever owed from the backlog. */
const QADA_PRAYERS = [...PRAYERS, { key: 'witr', label: 'Witr' }];

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

/** Rows on the card before "+2 more". */
const QADA_LIST = 3;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const QADA_LABEL = Object.fromEntries(QADA_PRAYERS.map((p) => [p.key, p.label]));

/** "today", "yesterday", "3 days ago" */
function daysAgo(key) {
  const n = Math.round((parseKey(todayKey()) - parseKey(key)) / 86400000);
  if (n <= 0) return 'today';
  return n === 1 ? 'yesterday' : `${n} days ago`;
}

/** A person's owed prayers as rows: missed ones oldest first, then the backlog. */
function qadaItems(owed) {
  return [
    ...owed.missed,
    ...QADA_PRAYERS
      .filter((p) => (owed.backlog[p.key] || 0) > 0)
      .map((p) => ({ prayer: p.key, backlog: owed.backlog[p.key] })),
  ];
}

/**
 * One owed prayer in the popup, like a Today row: the prayer in Playfair, the
 * date and how long ago beneath it, and the Today mark on the right.
 */
function qadaRow(item) {
  const label = QADA_LABEL[item.prayer];
  let when;
  let data;
  let aria;

  if (item.backlog) {
    when = `${item.backlog} from before Kharwa`;
    data = `data-backlog="${item.prayer}"`;
    aria = `Made up one ${label} from before Kharwa`;
  } else {
    const day = esc(fmtDayNav.format(parseKey(item.date)));
    when = `${day} · ${daysAgo(item.date)}`;
    data = `data-date="${item.date}" data-prayer="${item.prayer}"`;
    aria = `Mark ${label}, ${day}, as made up`;
  }

  return `
    <li class="qd-r qd-r--stack">
      <span class="qd-r-what">
        <span class="qd-r-name">${label}</span>
        <span class="qd-r-when">${when}</span>
      </span>
      <button class="mark qd-mark" type="button" ${data} aria-label="${aria}">${markSvg('none')}</button>
    </li>`;
}

/* --------------------------------------------------------------- card --- */

/**
 * One owed prayer, like a Today row and never wrapping: the prayer in
 * Playfair with the date after it, as one group that gives way first, and the
 * Today mark pinned to the right.
 */
function qadaCardRow(item) {
  const label = QADA_LABEL[item.prayer];
  let when;
  let data;
  let aria;

  if (item.backlog) {
    when = `${item.backlog} from before`;
    data = `data-backlog="${item.prayer}"`;
    aria = `Made up one ${label} from before Kharwa`;
  } else {
    when = esc(fmtDayNav.format(parseKey(item.date)));   // "Sat, Oct 3"
    data = `data-date="${item.date}" data-prayer="${item.prayer}"`;
    aria = `Mark ${label}, ${when}, as made up`;
  }

  return `
    <li class="qd-r">
      <span class="qd-r-what">
        <span class="qd-r-name">${label}</span>
        <span class="qd-r-when">${when}</span>
      </span>
      <button class="mark qd-mark" type="button" ${data} aria-label="${aria}">${markSvg('none')}</button>
    </li>`;
}

/**
 * Only your own owed prayers, as rows, then one quiet line for the other
 * person. The card is hidden while both of you are caught up.
 */
function renderQada() {
  const me = State.me;
  const mine = qadaOwed(me);
  const others = PEOPLE_IDS.filter((p) => p !== me).map((p) => ({ p, n: qadaOwed(p).total }));

  el('qada-card').hidden = !mine.total && others.every((o) => !o.n);
  if (el('qada-card').hidden) return;

  const items = qadaItems(mine);
  const shown = State.qadaAll ? items : items.slice(0, QADA_LIST);
  const more = items.length - QADA_LIST;

  const otherLines = others.map(({ p, n }) => `
    <p class="qd-other">${esc(name(p))} · ${n ? `${n} to make up` : 'caught up'}</p>`).join('');

  el('qada').innerHTML = `
    ${items.length ? `
      <ul class="qd-rows">${shown.map(qadaCardRow).join('')}</ul>
      ${more > 0 ? `<button class="qd-all" type="button" aria-expanded="${State.qadaAll}">${
        State.qadaAll ? 'Show fewer' : `+${more} more`}</button>` : ''}`
      : '<p class="qd-ok"><svg class="qd-check" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M3.2 8.4l3 3 6.6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>All caught up</p>'}
    ${otherLines}`;
}

el('qada').addEventListener('click', (event) => {
  if (event.target.closest('.qd-all')) {
    State.qadaAll = !State.qadaAll;
    renderQada();
    return;
  }
  const mark = event.target.closest('.qd-mark');
  if (mark) makeUp(mark);
});

/* ---------------------------------------------------------- making up --- */

/**
 * Fades the row out, then logs the prayer as late (or takes one off the
 * backlog), with an Undo toast. Shared by the card and the popup.
 */
async function makeUp(btn) {
  const row = btn.closest('.qd-r');
  const { date, prayer, backlog } = btn.dataset;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  btn.disabled = true;
  // The circle fills with the late mark, and holds a moment.
  btn.innerHTML = markSvg('late');
  await wait(reducedMotion.matches ? 250 : 600);
  row.classList.add('is-leaving');
  await wait(reducedMotion.matches ? 0 : 200);

  if (backlog) {
    const label = QADA_LABEL[backlog];
    const before = Data.backlog[State.me]?.[backlog] || 0;
    try {
      if (before < 1) throw new Error('nothing left to make up');
      await Data.saveBacklog(State.me, { [backlog]: before - 1 });
    } catch (err) {
      toast(`Could not save: ${esc(err.message || err)}`, { error: true });
      renderQadaViews();
      return;
    }
    renderQadaViews();
    toast(`${label} from before Kharwa made up`, {
      action: {
        label: 'Undo',
        run: async () => {
          const now = Data.backlog[State.me]?.[backlog] || 0;
          try {
            await Data.saveBacklog(State.me, { [backlog]: now + 1 });
          } catch (err) {
            toast(`Could not undo: ${esc(err.message || err)}`, { error: true });
          }
          renderQadaViews();
        },
      },
    });
    return;
  }

  const saved = await setStatus(State.me, prayer, 'late', date);
  if (!saved) return;
  toast(`${PRAYER_LABEL[prayer]}, ${esc(fmtDayNav.format(parseKey(date)))}, made up`, {
    action: { label: 'Undo', run: () => setStatus(State.me, prayer, 'none', date) },
  });
}

function renderQadaViews() {
  renderQada();
  renderQadaPop();
}

/* -------------------------------------------------------------- popup --- */

const QadaPop = {
  open: false,
  returnFocus: null,
  closing: null,   // the timer that closes it once everything is made up
};

/* ------------------------------------------------------------ sheets --- */

/* The qada popup and Settings: a bottom sheet on a phone, a modal on desktop. */

function showSheet(modal, panel) {
  modal.classList.remove('is-closing');
  panel.style.transform = '';
  modal.hidden = false;
}

/** Slides the sheet back down (or fades the modal), then hides it. */
function hideSheet(modal, panel) {
  modal.classList.add('is-closing');
  setTimeout(() => {
    if (!modal.classList.contains('is-closing')) return; // opened again meanwhile
    modal.hidden = true;
    modal.classList.remove('is-closing');
    panel.style.transform = '';
  }, reducedMotion.matches ? 0 : 200);
}

/**
 * On a phone a sheet follows a finger dragging it down, and closes past 90px.
 * A drag that starts in its scrolling part only counts when that is already
 * scrolled to the top.
 */
function swipeToClose(panel, scroller, onClose) {
  const sheet = window.matchMedia('(max-width: 899px)');
  let startY = null;
  let dy = 0;

  panel.addEventListener('touchstart', (event) => {
    const area = scroller();
    if (!sheet.matches || (area.contains(event.target) && area.scrollTop > 0)) return;
    startY = event.touches[0].clientY;
    dy = 0;
  }, { passive: true });

  panel.addEventListener('touchmove', (event) => {
    if (startY === null) return;
    dy = Math.max(0, event.touches[0].clientY - startY);
    if (dy < 6) return; // a tap, not a drag
    if (event.cancelable) event.preventDefault();
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${dy}px)`;
  }, { passive: false });

  const end = () => {
    if (startY === null) return;
    startY = null;
    panel.style.transition = '';
    if (dy > 90) onClose();
    else panel.style.transform = '';
  };
  panel.addEventListener('touchend', end);
  panel.addEventListener('touchcancel', end);
}

/* -------------------------------------------------------------- popup --- */

/** Every time the app is opened or reloaded while something is owed. Closing
    it holds until the next open. */
function openQadaPop() {
  if (QadaPop.open || !qadaOwed(State.me).total) return;
  QadaPop.open = true;
  QadaPop.returnFocus = document.activeElement;
  renderQadaPop();
  showSheet(el('qada-pop'), el('qd-pop-panel'));
  // The dialog itself, so no ring shows until someone tabs.
  el('qd-pop-panel').focus();
}

/** Slides the sheet back down (or fades the modal), then hides it. */
function closeQadaPop() {
  if (!QadaPop.open) return;
  QadaPop.open = false;
  clearTimeout(QadaPop.closing);
  QadaPop.closing = null;
  hideSheet(el('qada-pop'), el('qd-pop-panel'));
  if (QadaPop.returnFocus && QadaPop.returnFocus.isConnected) QadaPop.returnFocus.focus();
}

function renderQadaPop() {
  if (!QadaPop.open) return;
  const owed = qadaOwed(State.me);
  const list = el('qd-pop-list');
  const hadFocus = list.contains(document.activeElement);

  if (!owed.total) {
    el('qd-pop-title').innerHTML = `<span class="qd-pop-ok"><svg class="qd-check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3.2 8.4l3 3 6.6-7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>All caught up</span>`;
    list.innerHTML = '';
    el('qada-pop').classList.add('is-done');
    if (hadFocus) el('qd-pop-close').focus();
    if (!QadaPop.closing) QadaPop.closing = setTimeout(closeQadaPop, 1600);
    return;
  }

  // An Undo can bring a prayer back after "All caught up".
  clearTimeout(QadaPop.closing);
  QadaPop.closing = null;
  el('qada-pop').classList.remove('is-done');

  const n = owed.total;
  el('qd-pop-title').innerHTML = `<span class="qd-pop-n">${n}</span>
    <span class="qd-pop-t">prayer${n === 1 ? '' : 's'} to make up</span>`;
  list.innerHTML = qadaItems(owed).map((i) => qadaRow(i)).join('');

  // The button that was pressed has gone; carry on with the next one.
  if (hadFocus) (list.querySelector('button:not(:disabled)') || el('qd-pop-close')).focus();
}

el('qd-pop-list').addEventListener('click', (event) => {
  const mark = event.target.closest('.qd-mark');
  if (mark) makeUp(mark);
});
el('qd-pop-close').addEventListener('click', closeQadaPop);
el('qd-pop-scrim').addEventListener('click', closeQadaPop);

swipeToClose(el('qd-pop-panel'), () => el('qd-pop-list'), closeQadaPop);

/* Esc closes it; Tab stays inside it, and the Undo toasts above it. */
document.addEventListener('keydown', (event) => {
  if (!QadaPop.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeQadaPop();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = [
    ...el('qada-pop').querySelectorAll('button:not(:disabled)'),
    ...el('toasts').querySelectorAll('button'),
  ];
  if (!focusable.length) return;
  const i = focusable.indexOf(document.activeElement);
  const next = event.shiftKey
    ? focusable[(i <= 0 ? focusable.length : i) - 1]
    : focusable[(i + 1) % focusable.length];
  event.preventDefault();
  next.focus();
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
    el('ayah-link').dataset.ref = ayah.number;
    el('ayah').hidden = false;
    State.ayahFor = key;
  } catch {
    el('ayah').hidden = true;
  } finally {
    State.ayahLoading = null;
  }
}

/* "Read in context" opens the ayah sheet; the link is the fallback. */
el('ayah-link').addEventListener('click', (event) => {
  const [s, a] = (el('ayah-link').dataset.ref || '').split(':').map(Number);
  if (!s || !a || event.metaKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  AyahSheet.openAt(s, a);
});

/* ============================================================== render ==== */

/** Everything that shows a logged status. */
function renderStatuses() {
  const focused = document.activeElement;
  const restore = focused && focused.classList && focused.classList.contains('markmenu-btn')
    ? { set: focused.dataset.set, person: focused.dataset.person, prayer: focused.dataset.prayer }
    : null;

  renderTimetable();
  renderStreaks();
  renderQadaViews();

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
  renderAyah();
}

/* ========================================================= interaction === */

/** A prayer is logged: its reminder or nudge on this device has done its job.
    The tag is the one send-reminders and send-nudge give it (the shared
    template's kharwaPrayerTag). Quietly does nothing where unsupported. */
async function closePrayerNotifications(date, prayer) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const open = await reg?.getNotifications({ tag: `kharwa-prayer-${date}-${prayer}` });
    for (const n of open || []) n.close();
  } catch { /* no notifications here */ }
}

/** The one place a status is written. The Qada card passes its own date.
    Resolves to whether the status is now `next`. */
async function setStatus(person, prayer, next, date = State.viewDate) {
  if (person !== State.me) return false;

  const before = Data.status(person, date, prayer);
  if (before === next) return true;

  // Optimistic, so a tap feels instant on a phone.
  Data.setLocal(person, date, prayer, next);
  renderStatuses();

  try {
    await Data.writeStatus(person, date, prayer, next);
    if (next === 'on_time' || next === 'late') closePrayerNotifications(date, prayer);
    return true;
  } catch (err) {
    Data.setLocal(person, date, prayer, before);
    renderStatuses();
    toast(`Could not save: ${esc(err.message || err)}`, { error: true });
    return false;
  }
}

el('timetable').addEventListener('click', (event) => {
  const bell = event.target.closest('.nudge-btn');
  if (bell) {
    sendNudge(bell.dataset.nudge, bell.dataset.prayer);
    return;
  }
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
  const day = event.target.closest('.st-day');
  if (day) goToDay(day.dataset.date);
});

/* keyboard: arrows change day, T jumps to today */
document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (Settings.open || QadaPop.open) return;
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

/* ============================================================ settings === */

/* Three tabs: Profile, Qada and App. Each field saves itself when it changes
   (typing waits for a pause) and says "Saved ✓" beside it for a moment, or
   shows what went wrong under it. */

const SETTINGS_TABS = ['profile', 'qada', 'app'];
const SETTINGS_TAB_STORE = 'kharwa.settings.tab'; // for this session only

const Settings = {
  open: false,
  tab: 'profile',
  timers: {},       // field -> the debounce waiting to save it
  pending: {},      // field -> the save that debounce will run
  chains: {},       // field -> the save in flight, so saves of one field never overlap
  savedTimers: {},
};

const clampCount = (v) => Math.min(99999, Math.max(0, Math.floor(Number(v) || 0)));

function rememberedSettingsTab() {
  try {
    const t = sessionStorage.getItem(SETTINGS_TAB_STORE);
    return SETTINGS_TABS.includes(t) ? t : 'profile';
  } catch {
    return 'profile';
  }
}

function showSettingsTab(id, { focus = false } = {}) {
  Settings.tab = id;
  try { sessionStorage.setItem(SETTINGS_TAB_STORE, id); } catch { /* private mode */ }
  for (const t of SETTINGS_TABS) {
    const on = t === id;
    const tab = el(`set-tab-${t}`);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    el(`set-panel-${t}`).hidden = !on;
  }
  el('set-tabs').setAttribute('aria-orientation',
    window.matchMedia('(min-width: 900px)').matches ? 'vertical' : 'horizontal');
  el('set-panels').scrollTop = 0;
  if (focus) el(`set-tab-${id}`).focus();
}

/* ------------------------------------------------------------ fields --- */

function setSwitch(on) {
  el('set-learn').setAttribute('aria-checked', String(on));
}

function backlogStepper(p, count) {
  const off = Data.backlogReady ? '' : ' disabled';
  return `
    <div class="step">
      <label class="step-label" for="set-bl-${p.key}">${p.label}</label>
      <div class="stepper">
        <button class="stepper-btn" type="button" data-step="-1" data-prayer="${p.key}"
                aria-label="One fewer ${p.label}"${off || (count ? '' : ' disabled')}>&minus;</button>
        <input id="set-bl-${p.key}" class="stepper-input" type="number" inputmode="numeric"
               min="0" max="99999" step="1" data-prayer="${p.key}" value="${count}"${off} />
        <button class="stepper-btn" type="button" data-step="1" data-prayer="${p.key}"
                aria-label="One more ${p.label}"${off}>+</button>
      </div>
    </div>`;
}

/** The − button goes quiet at zero. */
function syncStepper(input) {
  const minus = input.parentElement.querySelector('[data-step="-1"]');
  minus.disabled = !Data.backlogReady || clampCount(input.value) === 0;
}

function fillSettings() {
  const me = Data.people[State.me] || {};
  el('settings-who').textContent = `On this device as ${name(State.me)}`;
  el('set-name').value = me.display_name || '';
  el('set-qada-start').value = Data.qadaStart(State.me) || '';
  el('set-qada-start').max = todayKey();
  setSwitch(Data.showsLearn(State.me));
  el('set-tafsir').innerHTML = AYAH_TAFSIRS
    .map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
  el('set-tafsir').value = AyahSheet.tafsir().id;
  Reminders.fill();

  const backlog = Data.backlog[State.me] || {};
  el('set-backlog').innerHTML = QADA_PRAYERS.map((p) => backlogStepper(p, backlog[p.key] || 0)).join('');
  el('set-backlog-note').hidden = Data.backlogReady;

  for (const node of document.querySelectorAll('#settings .set-error')) node.hidden = true;
  for (const node of document.querySelectorAll('#settings .set-saved')) node.classList.remove('is-on');
}

/* ------------------------------------------------------------ saving --- */

function setSaveError(field, text) {
  const node = document.querySelector(`#settings .set-error[data-for="${field}"]`);
  node.textContent = text;
  node.hidden = !text;
  // An error replaces any "Saved ✓" still showing from before.
  if (text) document.querySelector(`#settings .set-saved[data-for="${field}"]`).classList.remove('is-on');
}

function flashSaved(field) {
  const node = document.querySelector(`#settings .set-saved[data-for="${field}"]`);
  node.textContent = 'Saved ✓';
  node.classList.add('is-on');
  clearTimeout(Settings.savedTimers[field]);
  Settings.savedTimers[field] = setTimeout(() => node.classList.remove('is-on'), 1800);
}

/** Saves `field` with `save` after `wait` ms, replacing a save still waiting. */
function queueSave(field, save, wait = 0) {
  clearTimeout(Settings.timers[field]);
  Settings.pending[field] = save;
  Settings.timers[field] = setTimeout(() => runSave(field), wait);
}

/** `save` resolves to false when there was nothing to change. */
function runSave(field) {
  clearTimeout(Settings.timers[field]);
  const save = Settings.pending[field];
  delete Settings.pending[field];
  if (!save) return Settings.chains[field];
  Settings.chains[field] = (Settings.chains[field] || Promise.resolve()).then(async () => {
    try {
      const changed = await save();
      setSaveError(field, '');
      if (changed !== false) flashSaved(field);
    } catch (err) {
      setSaveError(field, `Couldn’t save: ${err.message || err}`);
    }
  });
  return Settings.chains[field];
}

/** On closing: anything still waiting goes now. */
function flushSettingSaves() {
  for (const field of Object.keys(Settings.pending)) runSave(field);
}

async function saveName() {
  const value = el('set-name').value.trim();
  if (!value || value === (Data.people[State.me]?.display_name || '')) return false;
  await Data.saveSettings(State.me, { display_name: value });
  el('settings-who').textContent = `On this device as ${name(State.me)}`;
  render();
  return true;
}

/* Stored only when it differs from the first log, so an untouched date keeps
   following it. qada_start is absent until schema.sql is re-run. */
async function saveQadaStart() {
  const me = Data.people[State.me] || {};
  const start = el('set-qada-start').value || null;
  const qadaStart = start && start !== Data.firstLog[State.me] ? start : null;
  if (qadaStart === (me.qada_start || null)) return false;
  if (!('qada_start' in me)) throw new Error('run supabase/schema.sql again first.');
  await Data.saveSettings(State.me, { qada_start: qadaStart });
  el('set-qada-start').value = Data.qadaStart(State.me) || '';
  await Data.loadRecent(); // an earlier start reaches past the logs in the cache
  render();
  return true;
}

async function saveShowLearn(on) {
  const me = Data.people[State.me] || {};
  if (on === Data.showsLearn(State.me)) return false;
  try {
    if (!('show_learn' in me)) throw new Error('run supabase/schema.sql again first.');
    await Data.saveSettings(State.me, { show_learn: on });
  } catch (err) {
    setSwitch(Data.showsLearn(State.me));
    throw err;
  }
  Sections.refresh();
  return true;
}

async function saveBacklogCounts() {
  const backlog = Data.backlog[State.me] || {};
  const counts = {};
  for (const input of el('set-backlog').querySelectorAll('.stepper-input')) {
    const n = clampCount(input.value);
    if (n !== (backlog[input.dataset.prayer] || 0)) counts[input.dataset.prayer] = n;
  }
  if (!Object.keys(counts).length) return false;
  await Data.saveBacklog(State.me, counts);
  renderQadaViews();
  return true;
}

el('set-name').addEventListener('input', () => queueSave('name', saveName, 700));
el('set-name').addEventListener('blur', () => {
  if (!el('set-name').value.trim()) el('set-name').value = Data.people[State.me]?.display_name || '';
  if (Settings.pending.name) runSave('name');
});

el('set-qada-start').addEventListener('change', () => queueSave('qada-start', saveQadaStart));

/* Kept on this device, per person. */
el('set-tafsir').addEventListener('change', () => {
  AyahSheet.setTafsir(el('set-tafsir').value);
  setSaveError('tafsir', '');
  flashSaved('tafsir');
});

el('set-learn').addEventListener('click', () => {
  const on = el('set-learn').getAttribute('aria-checked') !== 'true';
  setSwitch(on);
  queueSave('learn', () => saveShowLearn(on));
});

/* The backlog: − and + step one at a time, and a quick run of taps saves once. */
el('set-backlog').addEventListener('click', (event) => {
  const btn = event.target.closest('.stepper-btn');
  if (!btn) return;
  const input = btn.parentElement.querySelector('.stepper-input');
  input.value = clampCount(clampCount(input.value) + Number(btn.dataset.step));
  syncStepper(input);
  queueSave('backlog', saveBacklogCounts, 500);
});

el('set-backlog').addEventListener('keydown', (event) => {
  // Whole numbers only, never negative.
  if (event.target.matches('.stepper-input') && ['-', '+', 'e', 'E', '.', ','].includes(event.key)) {
    event.preventDefault();
  }
});

el('set-backlog').addEventListener('input', (event) => {
  if (!event.target.matches('.stepper-input')) return;
  syncStepper(event.target);
  queueSave('backlog', saveBacklogCounts, 700);
});

el('set-backlog').addEventListener('change', (event) => {
  if (!event.target.matches('.stepper-input')) return;
  event.target.value = clampCount(event.target.value);
  syncStepper(event.target);
  if (Settings.pending.backlog) runSave('backlog');
});

/* -------------------------------------------------------- open, close --- */

function openSettings() {
  if (Settings.open) return;
  Settings.open = true;
  fillSettings();
  showSettingsTab(rememberedSettingsTab());
  showSheet(el('settings'), el('settings-panel'));
  // The dialog itself, so no ring shows until someone tabs.
  el('settings-panel').focus();
}

function closeSettings() {
  if (!Settings.open) return;
  Settings.open = false;
  flushSettingSaves();
  hideSheet(el('settings'), el('settings-panel'));
  el('settings-open').focus();
}

el('settings-open').addEventListener('click', openSettings);
el('settings-close').addEventListener('click', closeSettings);
el('settings-scrim').addEventListener('click', closeSettings);

el('set-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[role="tab"]');
  if (tab) showSettingsTab(tab.dataset.tab);
});

/* Arrow keys move between the tabs, whichever way they run. */
el('set-tabs').addEventListener('keydown', (event) => {
  const i = SETTINGS_TABS.indexOf(Settings.tab);
  const n = SETTINGS_TABS.length;
  const next = {
    ArrowRight: (i + 1) % n, ArrowDown: (i + 1) % n,
    ArrowLeft: (i + n - 1) % n, ArrowUp: (i + n - 1) % n,
    Home: 0, End: n - 1,
  }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  showSettingsTab(SETTINGS_TABS[next], { focus: true });
});

/* Esc closes it, and Tab stays inside it. */
document.addEventListener('keydown', (event) => {
  if (!Settings.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSettings();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = [...el('settings-panel').querySelectorAll(
    'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select',
  )].filter((node) => node.getClientRects().length);
  if (!focusable.length) return;
  const i = focusable.indexOf(document.activeElement);
  const next = event.shiftKey
    ? focusable[(i <= 0 ? focusable.length : i) - 1]
    : focusable[(i + 1) % focusable.length];
  event.preventDefault();
  next.focus();
});

swipeToClose(el('settings-panel'), () => el('set-panels'), closeSettings);

el('switch-person').addEventListener('click', () => {
  try {
    localStorage.removeItem(PERSON_STORE);
  } catch { /* ignore */ }
  location.reload();
});

/* =============================================================== realtime = */

function onRemoteChange(change) {
  // My own edits already rendered optimistically. One from my other device
  // still clears that prayer's reminder or nudge here.
  if (change.person === State.me) {
    if (change.status === 'on_time' || change.status === 'late') closePrayerNotifications(change.date, change.prayer);
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
    await Data.loadPushPeople();
    await Data.loadNudges(todayKey());
    render();
    openQadaPop();
  } catch (err) {
    showBanner(`Could not reach Supabase: ${err.message || err}`);
  }

  Data.subscribe(onRemoteChange);
  Us.start().catch(() => {});
  startClock();

  // Coming back to the tab on a phone: catch up on anything missed.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      await Data.loadPeople();
      Sections.refresh(); // show_learn may differ from the default
      await Data.loadQada();
      await Data.loadRecent();
      await Data.loadPushPeople();
      await Data.loadNudges(todayKey());
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
      renderTimetable(); // the nudge bell: "nudged 3m ago", and when it may ring again
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
