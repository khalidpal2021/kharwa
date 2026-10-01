/* ===========================================================================
   app.js — screens, rendering, and interaction.
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
  view: 'today',       // 'today' | 'week'
  location: null,
  tick: null,
};

/* ============================================================== helpers === */

function name(person) {
  return Data.people[person]?.display_name || person;
}

function other(person) {
  return person === 'khalid' ? 'marwa' : 'khalid';
}

function myParams() {
  const p = Data.people[State.me] || {};
  return { method: p.calc_method || 'NorthAmerica', madhab: p.asr_madhab || 'standard' };
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

/* =========================================================== today view === */

function renderHeader() {
  const now = new Date();
  el('gregorian').textContent = fmtGregorian.format(now);
  el('hijri').textContent = hijriFor(now);
}

function renderNextUp() {
  if (!State.location) return;
  const { method, madhab } = myParams();
  const now = new Date();
  const next = nextPrayerFrom(now, State.location, method, madhab);

  el('next-up').hidden = false;
  el('next-name').textContent = next.label;
  el('next-time').textContent =
    timeText(next.time) + (next.tomorrow ? ' tomorrow' : '');
  el('next-count').textContent = untilText(next.time - now);
  return next;
}

function renderPlace() {
  if (!State.location) return;
  const { method } = myParams();
  const label = State.location.exact
    ? 'Times for your location'
    : `Times for ${State.location.name}`;
  const methodName =
    document.querySelector(`#set-method option[value="${method}"]`)?.textContent || method;
  el('place').textContent = `${label} · ${methodName}`;
}

function renderDayNav() {
  const today = todayKey();
  el('day-label').textContent =
    State.viewDate === today
      ? `Today · ${fmtDateShort.format(parseKey(State.viewDate))}`
      : friendlyDay(State.viewDate);
  el('day-today').hidden = State.viewDate === today;
  // Nothing to log past tomorrow.
  el('day-next').disabled = State.viewDate >= addDays(today, 1);
}

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
  const { method, madhab } = myParams();
  const times = State.location
    ? prayerTimesFor(State.viewDate, State.location, method, madhab)
    : null;

  const isToday = State.viewDate === todayKey();
  const next = isToday && State.location
    ? nextPrayerFrom(new Date(), State.location, method, madhab)
    : null;

  el('prayers').innerHTML = PRAYERS.map((p) => {
    const isNext = next && !next.tomorrow && next.key === p.key;
    return `
      <li class="prayer${isNext ? ' is-next' : ''}" data-prayer="${p.key}">
        <div class="prayer-head">
          <span class="prayer-name">${p.label}</span>
          <span class="prayer-time">${times ? timeText(times[p.key]) : '—'}</span>
          ${isNext ? '<span class="prayer-flag">next</span>' : ''}
        </div>
        <div class="cells">
          ${cellMarkup('khalid', p.key)}
          ${cellMarkup('marwa', p.key)}
        </div>
      </li>`;
  }).join('');
}

/* ============================================================ week view === */

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
  const days = [];
  for (let i = 6; i >= 0; i -= 1) days.push(addDays(today, -i));

  const rows = days.map((key) => {
    const cells = PEOPLE_IDS.map((person) => {
      const dots = PRAYERS.map((p) => {
        const status = Data.status(person, key, p.key);
        return `<i class="dot" data-prayer="${p.key}" data-status="${status}"
                   title="${PRAYER_LABEL[p.key]}: ${STATUS_LABEL[status]}"></i>`;
      }).join('');
      const summary = PRAYERS.map((p) =>
        `${p.label} ${STATUS_LABEL[Data.status(person, key, p.key)].toLowerCase()}`
      ).join(', ');
      return `<div class="dots" role="img"
                   aria-label="${esc(name(person))} on ${friendlyDay(key)}: ${summary}">${dots}</div>`;
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

/* ============================================================== render ==== */

function render() {
  renderHeader();
  renderPlace();
  renderNextUp();
  renderDayNav();
  renderPrayers();
  renderWeek();
}

/* ========================================================= interaction === */

el('prayers').addEventListener('click', async (event) => {
  const cell = event.target.closest('button.cell');
  if (!cell) return;

  const { person, prayer } = cell.dataset;
  if (person !== State.me) return;

  const before = Data.status(person, State.viewDate, prayer);
  const after = CYCLE[(CYCLE.indexOf(before) + 1) % CYCLE.length];

  // Optimistic, so a tap feels instant on a phone.
  Data.setLocal(person, State.viewDate, prayer, after);
  renderPrayers();
  renderWeek();

  try {
    await Data.writeStatus(person, State.viewDate, prayer, after);
  } catch (err) {
    Data.setLocal(person, State.viewDate, prayer, before);
    renderPrayers();
    renderWeek();
    toast(`Could not save: ${esc(err.message || err)}`, { error: true });
  }
});

el('day-prev').addEventListener('click', () => goToDay(addDays(State.viewDate, -1)));
el('day-next').addEventListener('click', () => goToDay(addDays(State.viewDate, 1)));
el('day-today').addEventListener('click', () => goToDay(todayKey()));

async function goToDay(key) {
  State.viewDate = key;
  renderDayNav();
  renderPrayers();
  await Data.ensureDay(key).catch(() => {});
  renderPrayers();
}

/* tabs */

function setView(view) {
  State.view = view;
  const isToday = view === 'today';
  el('tab-today').setAttribute('aria-selected', String(isToday));
  el('tab-week').setAttribute('aria-selected', String(!isToday));
  el('view-today').hidden = !isToday;
  el('view-week').hidden = isToday;
  if (!isToday) renderWeek();
}

el('tab-today').addEventListener('click', () => setView('today'));
el('tab-week').addEventListener('click', () => setView('week'));

/* settings */

function openSettings() {
  const me = Data.people[State.me] || {};
  el('settings-who').textContent = `Signed in on this device as ${name(State.me)}.`;
  el('set-name').value = me.display_name || '';
  el('set-method').value = me.calc_method || 'NorthAmerica';
  const madhab = me.asr_madhab === 'hanafi' ? 'hanafi' : 'standard';
  document.querySelector(`input[name="madhab"][value="${madhab}"]`).checked = true;
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
  const patch = {
    display_name: el('set-name').value.trim() || name(State.me),
    calc_method: el('set-method').value,
    asr_madhab: document.querySelector('input[name="madhab"]:checked').value,
  };

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
    render();
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
  render();
}

/* ================================================================= boot === */

async function start() {
  render();

  State.location = await resolveLocation();
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

  State.tick = setInterval(() => {
    const next = renderNextUp();

    if (todayKey() !== lastDate) {
      lastDate = todayKey();
      lastNext = next?.key || null;
      render();
      return;
    }

    // The "next" marker on the cards has to move when a prayer time passes.
    if (next && next.key !== lastNext) {
      lastNext = next.key;
      renderPrayers();
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
