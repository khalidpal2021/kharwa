/* ===========================================================================
   app.js — screens, rendering, and interaction.

   Both layouts are rendered on every pass and CSS decides which one is on
   screen (the 900px breakpoint). They are small enough that this is cheaper
   than keeping a second source of truth about the viewport.
   =========================================================================== */

const PERSON_STORE = 'kharwa.person';
const CYCLE = ['none', 'on_time', 'late', 'missed'];

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
  view: 'today',       // mobile tabs only
  tick: null,
};

/* ============================================================== helpers === */

function name(person) {
  return Data.people[person]?.display_name || person;
}

function toast(message, { error = false } = {}) {
  const node = document.createElement('div');
  node.className = `toast${error ? ' is-error' : ''}`;
  node.innerHTML = message;
  el('toasts').appendChild(node);
  setTimeout(() => {
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 280);
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

/* ========================================================= shared chrome === */

function renderHeader() {
  const now = new Date();
  const greg = fmtGregorian.format(now);
  const hij = hijriFor(now);
  el('gregorian').textContent = greg;
  el('hijri').textContent = hij;
  el('d-gregorian').textContent = greg;
  el('d-hijri').textContent = hij;
}

function renderNextUp() {
  const now = new Date();
  const next = nextPrayerFrom(now);
  const when = timeText(next.time) + (next.tomorrow ? ' tomorrow' : '');

  el('next-up').hidden = false;
  el('next-name').textContent = next.label;
  el('next-time').textContent = when;
  el('next-count').textContent = untilText(next.time - now);

  el('d-next-name').textContent = next.label;
  el('d-next-time').textContent = when;

  const { h, m, s } = untilParts(next.time - now);
  el('d-countdown').innerHTML = h > 0
    ? `${h}<small>h</small>${m}<small>m</small>`
    : m > 0
      ? `${m}<small>m</small>${s}<small>s</small>`
      : `${s}<small>s</small>`;

  return next;
}

function renderSource() {
  const { estimated } = timesFor(State.viewDate);
  const chip = estimated
    ? '<span class="chip">Estimated</span>'
    : '';
  const html = `<span>${TIMES_SOURCE}</span>${chip}`;
  el('source').innerHTML = html;
  el('d-source').innerHTML = html;
}

function renderDayNav() {
  const today = todayKey();
  const isToday = State.viewDate === today;
  const atEnd = State.viewDate >= addDays(today, 1); // nothing to log past tomorrow

  el('day-label').textContent = isToday
    ? `Today · ${fmtDateShort.format(parseKey(State.viewDate))}`
    : friendlyDay(State.viewDate);
  el('day-today').hidden = isToday;
  el('day-next').disabled = atEnd;

  el('d-day-label').textContent = isToday
    ? `Today · ${fmtDateShort.format(parseKey(State.viewDate))}`
    : friendlyDay(State.viewDate);
  el('d-day-today').hidden = isToday;
  el('d-day-next').disabled = atEnd;
}

/* ========================================================== mobile today == */

function cellMarkup(person, prayer) {
  const status = Data.status(person, State.viewDate, prayer);
  const mine = person === State.me;
  const who = esc(name(person));
  const label = `${who}, ${PRAYER_LABEL[prayer]}: ${STATUS_LABEL[status].toLowerCase()}`;

  if (!mine) {
    return `
      <div class="cell is-readonly" data-status="${status}" role="group" aria-label="${label}">
        <span class="cell-who">${who}</span>
        <span class="cell-status">${STATUS_LABEL[status]}</span>
      </div>`;
  }

  return `
    <button class="cell is-mine" type="button"
            data-status="${status}" data-person="${person}" data-prayer="${prayer}"
            aria-label="${label}. Activate to change.">
      <span class="cell-who">${who}</span>
      <span class="cell-status">${STATUS_LABEL[status]}</span>
    </button>`;
}

function renderPrayers() {
  const { times } = timesFor(State.viewDate);
  const isToday = State.viewDate === todayKey();
  const next = isToday ? nextPrayerFrom(new Date()) : null;

  el('prayers').innerHTML = PRAYERS.map((p) => {
    const isNext = next && !next.tomorrow && next.key === p.key;
    return `
      <li class="prayer${isNext ? ' is-next' : ''}" data-prayer="${p.key}">
        <div class="prayer-head">
          <span class="prayer-name">${p.label}</span>
          <span class="prayer-time">${timeText(times[p.key])}</span>
          ${isNext ? '<span class="prayer-flag">next</span>' : ''}
        </div>
        <div class="cells">
          ${cellMarkup('khalid', p.key)}
          ${cellMarkup('marwa', p.key)}
        </div>
      </li>`;
  }).join('');
}

/* ========================================================= desktop today == */

function tcellMarkup(person, prayer) {
  const status = Data.status(person, State.viewDate, prayer);
  const mine = person === State.me;
  const who = esc(name(person));
  const label = `${who}, ${PRAYER_LABEL[prayer]}: ${STATUS_LABEL[status].toLowerCase()}`;
  const shown = `<span class="tdot"></span><span class="tnow">${STATUS_LABEL[status]}</span>`;

  if (!mine) {
    return `<td class="tcell" data-status="${status}" aria-label="${label}">${shown}</td>`;
  }

  const btn = (value, text, extra = '') => `
    <button class="pick-btn${extra}${status === value ? ' is-active' : ''}" type="button"
            data-set="${value}" data-person="${person}" data-prayer="${prayer}"
            aria-label="${PRAYER_LABEL[prayer]}: ${text}">${text}</button>`;

  return `
    <td class="tcell is-mine" data-status="${status}" aria-label="${label}">
      ${shown}
      <div class="pick">
        ${btn('on_time', 'On time')}${btn('late', 'Late')}${btn('missed', 'Missed')}
        ${btn('none', 'Clear', ' pick-clear')}
      </div>
    </td>`;
}

function renderTable() {
  const { times } = timesFor(State.viewDate);
  const isToday = State.viewDate === todayKey();
  const next = isToday ? nextPrayerFrom(new Date()) : null;

  el('d-th-khalid').textContent = name('khalid');
  el('d-th-marwa').textContent = name('marwa');

  el('d-rows').innerHTML = PRAYERS.map((p) => {
    const isNext = next && !next.tomorrow && next.key === p.key;
    return `
      <tr class="trow${isNext ? ' is-next' : ''}" data-prayer="${p.key}">
        <th scope="row" class="tname">${p.label}${isNext ? '<span class="tflag">next</span>' : ''}</th>
        <td class="ttime">${timeText(times[p.key])}</td>
        ${tcellMarkup('khalid', p.key)}
        ${tcellMarkup('marwa', p.key)}
      </tr>`;
  }).join('');
}

function renderTimeline() {
  const { times } = timesFor(State.viewDate);
  const fajr = times.fajr.getTime();
  const isha = times.isha.getTime();
  const span = isha - fajr || 1;
  const pct = (t) => Math.max(0, Math.min(100, ((t - fajr) / span) * 100));

  const now = new Date();
  const isToday = State.viewDate === todayKey();
  const current = isToday ? currentPrayerAt(now) : null;

  let html = PRAYERS.map((p) => {
    const t = times[p.key];
    const past = isToday && t <= now;
    return `
      <div class="tl-item${past ? ' is-past' : ''}${current === p.key ? ' is-current' : ''}"
           data-prayer="${p.key}" style="top: ${pct(t.getTime()).toFixed(2)}%">
        <i class="tl-dot"></i>
        <span class="tl-text">
          <span class="tl-name">${p.label}</span>
          <span class="tl-time">${timeText(t)}</span>
        </span>
      </div>`;
  }).join('');

  // Only mark "now" while it actually sits on the timeline.
  if (isToday && now.getTime() >= fajr && now.getTime() <= isha) {
    html += `<div class="tl-now" style="top: ${pct(now.getTime()).toFixed(2)}%"><span>now</span></div>`;
  }

  el('d-timeline').innerHTML = html;
}

/* ================================================================ week ==== */

function dayComplete(person, dateKeyStr) {
  return PRAYERS.every((p) => {
    const s = Data.status(person, dateKeyStr, p.key);
    return s === 'on_time' || s === 'late';
  });
}

/**
 * Consecutive days, counting back, where all five prayers are on time or late.
 * Today only breaks the streak once it is over — an unfinished today is skipped
 * rather than counted as a miss.
 */
function streakFor(person) {
  let cursor = todayKey();
  if (!dayComplete(person, cursor)) cursor = addDays(cursor, -1);

  let count = 0;
  while (count < HISTORY_DAYS && dayComplete(person, cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function lastSevenDays() {
  const today = todayKey();
  const days = [];
  for (let i = 6; i >= 0; i -= 1) days.push(addDays(today, -i));
  return days;
}

function daySummary(person, key) {
  return PRAYERS
    .map((p) => `${p.label} ${STATUS_LABEL[Data.status(person, key, p.key)].toLowerCase()}`)
    .join(', ');
}

function renderWeek() {
  el('streaks').innerHTML = PEOPLE_IDS.map((person) => {
    const n = streakFor(person);
    return `
      <div class="streak">
        <span class="streak-who">${esc(name(person))}</span>
        <span class="streak-n">${n}</span>
        <span class="streak-unit">${n === 1 ? 'day' : 'days'} in a row</span>
      </div>`;
  }).join('');

  const today = todayKey();
  const rows = lastSevenDays().map((key) => {
    const cells = PEOPLE_IDS.map((person) => {
      const dots = PRAYERS.map((p) => {
        const status = Data.status(person, key, p.key);
        return `<i class="dot" data-prayer="${p.key}" data-status="${status}"
                   title="${PRAYER_LABEL[p.key]}: ${STATUS_LABEL[status]}"></i>`;
      }).join('');
      return `<div class="dots" role="img"
                   aria-label="${esc(name(person))} on ${friendlyDay(key)}: ${daySummary(person, key)}">${dots}</div>`;
    }).join('');

    const d = parseKey(key);
    return `
      <div class="week-row${key === today ? ' is-today' : ''}">
        <span class="week-day">${fmtDayShort.format(d)}<small>${fmtDateShort.format(d)}</small></span>
        ${cells}
      </div>`;
  }).join('');

  el('week').innerHTML = `
    <div class="week-head">
      <span>Day</span>
      <span>${esc(name('khalid'))}</span>
      <span>${esc(name('marwa'))}</span>
    </div>
    ${rows}`;
}

function renderDesktopWeek() {
  const today = todayKey();
  const days = lastSevenDays();

  const head = `
    <div class="dweek-head">
      <span class="dweek-corner"></span>
      ${days.map((key) => {
        const d = parseKey(key);
        const cls = [
          key === today ? 'is-today' : '',
          key === State.viewDate ? 'is-viewed' : '',
        ].join(' ').trim();
        return `<button class="dweek-day ${cls}" type="button" data-date="${key}"
                        aria-label="Show ${friendlyDay(key)}">
                  ${fmtDayShort.format(d)}<small>${fmtDateShort.format(d)}</small>
                </button>`;
      }).join('')}
      <span class="dweek-streak-head">Streak</span>
    </div>`;

  const rows = PEOPLE_IDS.map((person) => {
    const cells = days.map((key) => {
      const segs = PRAYERS.map((p) => {
        const status = Data.status(person, key, p.key);
        return `<i class="seg" data-prayer="${p.key}" data-status="${status}"
                   title="${PRAYER_LABEL[p.key]}: ${STATUS_LABEL[status]}"></i>`;
      }).join('');
      return `<div class="dweek-cell${key === State.viewDate ? ' is-viewed' : ''}"
                   data-date="${key}" role="img"
                   aria-label="${esc(name(person))} on ${friendlyDay(key)}: ${daySummary(person, key)}">${segs}</div>`;
    }).join('');

    const n = streakFor(person);
    return `
      <div class="dweek-row">
        <span class="dweek-who">${esc(name(person))}</span>
        ${cells}
        <div class="dweek-streak"><b>${n}</b><span>${n === 1 ? 'day' : 'days'}</span></div>
      </div>`;
  }).join('');

  el('d-week').innerHTML = head + rows;
}

/* ============================================================== render ==== */

/** Everything that shows a logged status. */
function renderStatuses() {
  const focused = document.activeElement;
  const restore = focused && focused.classList && focused.classList.contains('pick-btn')
    ? { set: focused.dataset.set, person: focused.dataset.person, prayer: focused.dataset.prayer }
    : null;

  renderPrayers();
  renderTable();
  renderWeek();
  renderDesktopWeek();

  // Re-rendering replaces the button the keyboard was on; put focus back.
  if (restore) {
    const again = document.querySelector(
      `.pick-btn[data-set="${restore.set}"][data-person="${restore.person}"][data-prayer="${restore.prayer}"]`
    );
    if (again) again.focus();
  }
}

function render() {
  renderHeader();
  renderNextUp();
  renderSource();
  renderDayNav();
  renderTimeline();
  renderStatuses();
}

/* ========================================================= interaction === */

/** The one place a status is written, from either layout. */
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

/* mobile: tap to cycle */
el('prayers').addEventListener('click', (event) => {
  const cell = event.target.closest('button.cell');
  if (!cell) return;
  const { person, prayer } = cell.dataset;
  const before = Data.status(person, State.viewDate, prayer);
  setStatus(person, prayer, CYCLE[(CYCLE.indexOf(before) + 1) % CYCLE.length]);
});

/* desktop: pick a status directly */
el('d-rows').addEventListener('click', (event) => {
  const btn = event.target.closest('.pick-btn');
  if (!btn) return;
  setStatus(btn.dataset.person, btn.dataset.prayer, btn.dataset.set);
});

/* day navigation */

async function goToDay(key) {
  State.viewDate = key;
  renderDayNav();
  renderSource();
  renderTimeline();
  renderStatuses();
  await Data.ensureDay(key).catch(() => {});
  renderStatuses();
}

el('day-prev').addEventListener('click', () => goToDay(addDays(State.viewDate, -1)));
el('day-next').addEventListener('click', () => goToDay(addDays(State.viewDate, 1)));
el('day-today').addEventListener('click', () => goToDay(todayKey()));
el('d-day-prev').addEventListener('click', () => goToDay(addDays(State.viewDate, -1)));
el('d-day-next').addEventListener('click', () => goToDay(addDays(State.viewDate, 1)));
el('d-day-today').addEventListener('click', () => goToDay(todayKey()));

/* clicking a day in the week grid jumps the Today table to it */
el('d-week').addEventListener('click', (event) => {
  const target = event.target.closest('[data-date]');
  if (target) goToDay(target.dataset.date);
});

/* keyboard: arrows change day, T jumps to today */
document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (!el('settings').hidden) return;

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

/* mobile tabs */

function setView(view) {
  State.view = view;
  const isToday = view === 'today';
  el('tab-today').setAttribute('aria-selected', String(isToday));
  el('tab-week').setAttribute('aria-selected', String(!isToday));
  el('view-today').hidden = !isToday;
  el('view-week').hidden = isToday;
}

el('tab-today').addEventListener('click', () => setView('today'));
el('tab-week').addEventListener('click', () => setView('week'));

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
el('d-settings-open').addEventListener('click', openSettings);
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

  const who = esc(name(change.person));
  const prayer = PRAYER_LABEL[change.prayer];
  let line;
  if (change.status === 'on_time') line = `<b>${who}</b> prayed ${prayer}`;
  else if (change.status === 'late') line = `<b>${who}</b> prayed ${prayer} late`;
  else if (change.status === 'missed') line = `<b>${who}</b> missed ${prayer}`;
  else line = `<b>${who}</b> cleared ${prayer}`;

  if (change.date !== todayKey()) line += ` · ${friendlyDay(change.date)}`;

  toast(line);
  renderStatuses();
}

/* ================================================================= boot === */

async function start() {
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

    // The "next" marker on the cards, table and timeline has to move when a
    // prayer time passes; the timeline's now-marker creeps every minute.
    if (next && next.key !== lastNext) {
      lastNext = next.key;
      renderPrayers();
      renderTable();
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
