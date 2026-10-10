/* ===========================================================================
   us.js — the Us tab: notes passed between the two of you.

   Not a chat. At the top, the last note the other person sent, as one
   postcard: a line of text, an ayah or hadith with their note, or how they
   are feeling (with a way to answer it with an ayah). "Earlier notes" opens
   the rest, sent and received, newest first. Below, "Send something": six
   tiles, each sending a note at once or after a small sheet.

   Every note goes through the send-message Edge Function, which saves it and
   pushes it to the other person's devices; this file only reads, marks read
   and deletes. New, read and deleted notes arrive live through Supabase
   Realtime. Notes delete themselves after 30 days (supabase/messages-cron.sql).

   Routes:  #/us        the tab
            #/us/123    the tab, with note 123 in view (from a notification)

   ShareSheet is the "Send to Marwa" sheet for an ayah or a hadith, opened
   from the ayah popup, a long-press in the Quran reader, the send button on
   each hadith, and "Ayahs for the moment". Moments is that sheet: ayahs by
   feeling (us-presets.js, plus any added from the Quran tab).

   Depends on data.js, router.js, info.js, times.js, us-presets.js and, at
   run time, app.js (esc, name, toast, State, showSheet, hideSheet), quran.js
   (Quran), ayah-sheet.js (AyahSheet) and hadith.js (Hadith).
   =========================================================================== */

const US_NOTE_MAX = 300;     // "Write a note"
const US_DUA_FOR_MAX = 80;   // "Make dua for me", for…

const US_ICONS = {
  heart: `<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
    <path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7.5 2.4c0 5.4-7.5 10-7.5 10z"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`,
  book: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12 6.5v13" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </svg>`,
  moodAdd: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7.5 2.4c0 1-.3 2-.7 2.9"
          fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M18 14.5v6M15 17.5h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
  send: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path d="M4.5 11.6 19.5 5l-4.6 14.5-3.4-5.9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M11.5 13.6 19.5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`,
  love: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
    <path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7.5 2.4c0 5.4-7.5 10-7.5 10z"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`,
  dua: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
    <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M17 4.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor"/>
  </svg>`,
  feeling: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M8.8 14c.8 1.1 1.9 1.7 3.2 1.7s2.4-.6 3.2-1.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="9.3" cy="10" r="1" fill="currentColor"/><circle cx="14.7" cy="10" r="1" fill="currentColor"/>
  </svg>`,
  think: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
    <path d="M7.5 15.5h9a4 4 0 0 0 .6-8A5 5 0 0 0 7.6 8a3.8 3.8 0 0 0-.1 7.5z"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="8" cy="18.6" r="1.1" fill="none" stroke="currentColor" stroke-width="1.4"/>
    <circle cx="5.6" cy="20.7" r=".6" fill="currentColor"/>
  </svg>`,
  write: `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
    <path d="M5 19l1-4.2L15.6 5.2a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.6L9.2 18 5 19z"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M14 6.8l3.2 3.2" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </svg>`,
};

/* The tiles under "Send something", in order. */
const US_TILES = [
  { id: 'ayah', label: 'An ayah for…' },
  { id: 'love', label: 'I love you', body: 'I love you ❤️' },
  { id: 'dua', label: 'Make dua for me' },
  { id: 'feeling', label: 'How I’m feeling' },
  { id: 'think', label: 'Thinking of you', body: 'Thinking of you' },
  { id: 'write', label: 'Write a note' },
];

/* How the other person is referred to on a feeling card ("Send her an
   ayah for this"): Marwa as the brief has it; anyone else by name. */
const US_OBJECT = { marwa: 'her' };

const byId = (id) => document.getElementById(id);

const fmtUsTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "just now", "12m ago", "2h ago", "Yesterday", "Fri, Oct 9". */
function usAgo(iso) {
  const then = new Date(iso);
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const key = dateKey(then);
  if (mins < 12 * 60 || key === todayKey()) return `${Math.floor(mins / 60)}h ago`;
  if (key === addDays(todayKey(), -1)) return 'Yesterday';
  return fmtDayNav.format(then);
}

/** "Ar-Ra'd · 13:28", or a hadith's book and number. */
function usRef(m) {
  if (m.type === 'ayah') return `${m.ref?.name || 'Quran'} · ${m.ref?.surah}:${ayahRange(m.ref?.ayah, m.ref?.ayah_to)}`;
  return `${m.ref?.name || 'Hadith'} · ${m.ref?.number}`;
}

function usHref(m) {
  if (m.type === 'ayah') return `#/quran/${m.ref?.surah}/${ayahRange(m.ref?.ayah, m.ref?.ayah_to).replace('–', '-')}`;
  return `#/hadith/${m.ref?.book}/n/${m.ref?.number}`;
}

const Us = {
  list: [],             // notes, oldest first
  ready: false,         // the messages table answered
  failed: false,        // ...or did not
  started: false,

  other() {
    return PEOPLE_IDS.find((p) => p !== State.me);
  },

  unread() {
    return this.list.filter((m) => m.to_person === State.me && !m.read_at).length;
  },

  /** The tab is on screen, so what arrives is read. */
  watching() {
    return Sections.current === 'us' && document.visibilityState === 'visible';
  },

  /** The postcard: their last note, leaving nudges to the earlier list. */
  latest() {
    const other = this.other();
    return [...this.list].reverse().find((m) => m.from_person === other && m.type !== 'nudge') || null;
  },

  /* -------------------------------------------------------------- data --- */

  async start() {
    if (this.started) return;
    this.started = true;
    await this.load();
    Data.subscribeMessages((change) => this.onChange(change));
  },

  async load() {
    try {
      this.list = await Data.loadMessages();
      this.ready = true;
      this.failed = false;
    } catch {
      this.failed = !this.ready;
    }
    this.updateBadge();
    this.refresh();
    this.markRead();
  },

  put(row) {
    const i = this.list.findIndex((m) => m.id === row.id);
    if (i >= 0) this.list[i] = { ...this.list[i], ...row };
    else {
      this.list.push(row);
      this.list.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    }
  },

  onChange({ event, row }) {
    const before = this.latest()?.id;
    if (event === 'DELETE') this.list = this.list.filter((m) => m.id !== row.id);
    else this.put(row);
    if (event === 'INSERT' && row.to_person === State.me) this.markRead();
    this.updateBadge();
    this.refresh(this.latest()?.id !== before);
  },

  async markRead() {
    if (!this.watching() || !this.unread()) return;
    const now = new Date().toISOString();
    for (const m of this.list) if (m.to_person === State.me && !m.read_at) m.read_at = now;
    this.updateBadge();
    try { await Data.markMessagesRead(State.me); } catch { /* tried again next time */ }
  },

  /** The gold dot on the nav, and the count on the app icon (cleared once
      the tab is opened). The icon badge fails quietly where unsupported. */
  updateBadge() {
    const unread = this.unread();
    Sections.setBadge('us', unread > 0);
    try {
      const done = unread ? navigator.setAppBadge?.(unread) : navigator.clearAppBadge?.();
      done?.catch?.(() => {});
    } catch { /* no badge here */ }
  },

  /** Redraws whatever of the tab is showing. */
  refresh(arrived = false) {
    if (Sections.current === 'us') this.render(arrived);
    if (Earlier.shown) Earlier.render();
  },

  /* ------------------------------------------------------------ sending --- */

  /** Sends a note; `tile` is the tile to mark "Sent ✓". Resolves to the
      function's answer, or false. */
  async send(fields, { tile = null } = {}) {
    const other = esc(name(this.other()));
    try {
      const res = await Data.sendMessage({ from: State.me, to: this.other(), ...fields });
      if (!res.ok) {
        toast(res.reason === 'rate_limited'
          ? 'That’s 30 notes this hour. Wait a little before sending more.'
          : 'That note couldn’t be sent.', { error: true });
        return false;
      }
      this.put(res.message);
      this.refresh();
      if (tile) this.flash(tile);
      toast(res.devices ? `Sent to ${other}` : `Sent. ${other} will see it in Kharwa`);
      return res;
    } catch (err) {
      toast(`Couldn’t send: ${esc(err.message || err)}`, { error: true });
      return false;
    }
  },

  /** The tile says "Sent ✓" for a moment. */
  flash(tileId) {
    const btn = document.querySelector(`.us-tile[data-tile="${tileId}"]`);
    if (!btn) return;
    btn.classList.add('is-sent');
    clearTimeout(btn.sentTimer);
    btn.sentTimer = setTimeout(() => btn.classList.remove('is-sent'), 1800);
  },

  /** A few small hearts rise from the tile. */
  hearts(tileId) {
    const btn = document.querySelector(`.us-tile[data-tile="${tileId}"]`);
    if (!btn || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < 5; i += 1) {
      const h = document.createElement('span');
      h.className = 'us-heart';
      h.setAttribute('aria-hidden', 'true');
      h.style.setProperty('--x', `${(i - 2) * 14 + Math.round(Math.random() * 8 - 4)}px`);
      h.style.setProperty('--d', `${i * 70}ms`);
      h.innerHTML = US_ICONS.love;
      btn.appendChild(h);
      setTimeout(() => h.remove(), 1400);
    }
  },

  tile(id) {
    const tile = US_TILES.find((t) => t.id === id);
    if (!tile) return;
    if (id === 'ayah') Moments.open();
    else if (id === 'love') { this.hearts('love'); this.send({ type: 'text', body: tile.body }, { tile: 'love' }); }
    else if (id === 'think') this.send({ type: 'text', body: tile.body }, { tile: 'think' });
    else NoteSheet.open(id);
  },

  async remove(id) {
    const i = this.list.findIndex((m) => m.id === id);
    if (i < 0) return;
    const [gone] = this.list.splice(i, 1);
    this.refresh();
    try {
      await Data.deleteMessage(State.me, id);
    } catch (err) {
      this.put(gone);
      this.refresh();
      toast(`Couldn’t delete: ${esc(err.message || err)}`, { error: true });
    }
  },

  /* ---------------------------------------------------------- rendering --- */

  show(params) {
    const id = Number(params[0]);
    if (params.length) history.replaceState(null, '', '#/us');
    this.render();
    this.markRead();
    if (!this.ready) this.load();
    // from a notification: the postcard if it is the latest, else the list
    if (Number.isInteger(id) && id > 0 && this.latest()?.id !== id && this.list.some((m) => m.id === id)) {
      Earlier.open(id);
    }
  },

  /** The tiles never change, so they are drawn once: a redraw would cut
      short a "Sent ✓" or the hearts. */
  renderTiles() {
    if (byId('us-tiles').childElementCount) return;
    byId('us-tiles').innerHTML = US_TILES.map((t) => `
      <button class="us-tile" type="button" data-tile="${t.id}">
        <span class="us-tile-icon">${US_ICONS[t.id === 'ayah' ? 'book' : t.id]}</span>
        <span class="us-tile-label">${esc(t.label)}</span>
        <span class="us-tile-sent" aria-hidden="true">Sent &check;</span>
      </button>`).join('');
  },

  render(arrived = false) {
    const other = name(this.other());
    byId('us-from-label').textContent = `From ${other}`;
    this.renderTiles();

    const box = byId('us-latest');
    if (this.failed) {
      box.innerHTML = `<p class="us-quiet">Notes aren’t set up yet. Run <code>supabase/schema.sql</code>
        again in Supabase, then reload.</p>`;
    } else if (!this.ready) {
      box.innerHTML = '<p class="us-quiet">Loading…</p>';
    } else {
      const m = this.latest();
      box.innerHTML = m ? this.postcard(m, arrived) : '<p class="us-quiet">Nothing yet.</p>';
    }
    byId('us-earlier').hidden = !this.list.length;
  },

  postcard(m, arrived) {
    const who = esc(name(m.from_person));
    let inner;
    if (m.type === 'text') {
      inner = `<p class="pc-text">${esc(m.body)}</p>`;
    } else if (m.type === 'mood') {
      const feeling = US_FEELING[m.body];
      const word = esc(feeling?.word || m.body);
      const mood = feeling?.mood && US_MOOD[feeling.mood];
      const them = US_OBJECT[m.from_person] || who;
      inner = `
        <p class="pc-feeling">${who} is feeling <em>${word}</em></p>
        ${mood ? `<button class="pc-answer" type="button" data-answer="${mood.id}">Send ${them} an ayah for this</button>` : ''}`;
    } else {
      inner = `
        ${m.note ? `<p class="pc-note">“${esc(m.note)}”</p>` : ''}
        <a class="pc-share" href="${usHref(m)}">
          ${m.type === 'ayah' && m.ref?.arabic ? `<p class="pc-ar" lang="ar" dir="rtl">${esc(m.ref.arabic)}</p>` : ''}
          <p class="pc-en${m.type === 'hadith' ? ' pc-en--hadith' : ''}">${esc(m.body)}</p>
          <p class="pc-ref">${esc(usRef(m))}</p>
        </a>`;
    }
    return `
      <article class="pc${m.type === 'mood' ? ' pc--mood' : ''}${arrived ? ' is-new' : ''}">
        ${inner}
        <p class="pc-time"><time datetime="${m.created_at}">${usAgo(m.created_at)}</time></p>
      </article>`;
  },
};

Info.add('us', () => `
  <p>Notes just between the two of you. Each one also arrives as a
     notification on the other person&rsquo;s phone, if they have turned on
     Prayer reminders.</p>
  <p>Notes delete themselves after 30 days. You can delete one of yours sooner
     from Earlier notes.</p>`);

byId('us-tiles').addEventListener('click', (event) => {
  const tile = event.target.closest('[data-tile]');
  if (tile) Us.tile(tile.dataset.tile);
});

byId('us-latest').addEventListener('click', (event) => {
  const answer = event.target.closest('[data-answer]');
  if (answer) Moments.open(answer.dataset.answer);
});

byId('us-earlier').addEventListener('click', () => Earlier.open());

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Us.started) Us.load();
});

// "2h ago" keeps up while the tab is open
setInterval(() => {
  if (Sections.current !== 'us') return;
  for (const t of document.querySelectorAll('#section-us time[datetime], #earlier-list time[datetime]')) {
    t.textContent = usAgo(t.getAttribute('datetime'));
  }
}, 60_000);

Sections.register({
  id: 'us',
  label: 'Us',
  order: 3.5,
  icon: US_ICONS.heart,
  root: byId('section-us'),
  show: (params) => Us.show(params),
});

/* ========================================================= sheet helper === */

/* The small sheets here share their opening and closing: the finger that
   opened one lifting over its backdrop is not a tap to close, and Esc closes
   only the top one. */
function usSheet(popId, panelId, scrimId, closeId) {
  const sheet = {
    shown: false,
    openedAt: 0,
    returnFocus: null,
    show() {
      if (this.shown) return;
      this.shown = true;
      this.openedAt = Date.now();
      this.returnFocus = document.activeElement;
      showSheet(byId(popId), byId(panelId));
      byId(panelId).focus();
    },
    hide() {
      if (!this.shown) return;
      this.shown = false;
      hideSheet(byId(popId), byId(panelId));
      if (this.returnFocus?.isConnected) this.returnFocus.focus();
    },
  };
  byId(closeId).addEventListener('click', () => sheet.hide());
  byId(scrimId).addEventListener('click', () => { if (Date.now() - sheet.openedAt > 500) sheet.hide(); });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !sheet.shown) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sheet.hide();
  }, true);
  return sheet;
}

/* ======================================================= earlier notes === */

const Earlier = {
  sheet: usSheet('earlier-pop', 'earlier-panel', 'earlier-scrim', 'earlier-close'),

  get shown() { return this.sheet.shown; },

  open(focusId = null) {
    this.render();
    this.sheet.show();
    if (focusId) {
      requestAnimationFrame(() => {
        const node = byId(`en-${focusId}`);
        if (!node) return;
        node.scrollIntoView({ block: 'center' });
        node.classList.add('is-target');
        setTimeout(() => node.classList.remove('is-target'), 2200);
      });
    }
  },

  close() { this.sheet.hide(); },

  render() {
    const notes = [...Us.list].reverse();
    byId('earlier-list').innerHTML = notes.length
      ? notes.map((m) => this.itemMarkup(m)).join('')
      : '<li class="us-quiet">Nothing yet.</li>';
  },

  itemMarkup(m) {
    const mine = m.from_person === State.me;
    const who = mine ? 'You sent' : esc(name(m.from_person));
    let body;
    if (m.type === 'text') {
      body = `<p class="en-text">${esc(m.body)}</p>`;
    } else if (m.type === 'mood') {
      body = `<p class="en-text en-text--soft">Feeling ${esc(US_FEELING[m.body]?.word || m.body)}</p>`;
    } else if (m.type === 'nudge') {
      body = `<p class="en-text en-text--soft">A nudge to pray ${esc(m.body || PRAYER_LABEL[m.ref?.prayer] || '')}</p>`;
    } else {
      body = `
        ${m.note ? `<p class="en-note">“${esc(m.note)}”</p>` : ''}
        <a class="en-share" href="${usHref(m)}">
          <span class="en-en">${esc(m.body)}</span>
          <span class="pc-ref">${esc(usRef(m))}</span>
        </a>`;
    }
    return `
      <li class="en-item${mine ? ' is-mine' : ''}" id="en-${m.id}">
        <p class="en-who">${who} · <time datetime="${m.created_at}">${usAgo(m.created_at)}</time></p>
        ${body}
        ${mine ? `<button class="en-del" type="button" data-del="${m.id}">Delete</button>` : ''}
      </li>`;
  },
};

byId('earlier-list').addEventListener('click', (event) => {
  const del = event.target.closest('[data-del]');
  if (del) { Us.remove(Number(del.dataset.del)); return; }
  // following an ayah or hadith link leaves the sheet behind
  if (event.target.closest('a')) Earlier.close();
});

/* =========================================================== note sheet === */

/* "Make dua for me" (an optional "for…"), "How I'm feeling" (chips) and
   "Write a note" (a card to write on): one small sheet, three faces. */
const NoteSheet = {
  sheet: usSheet('note-pop', 'note-panel', 'note-scrim', 'note-close'),
  mode: null,
  feeling: null,

  open(mode) {
    this.mode = mode;
    this.feeling = null;
    const body = byId('note-body');
    if (mode === 'dua') {
      byId('note-title').textContent = 'Make dua for me';
      body.innerHTML = `
        <label class="set-label share-label" for="note-for">For… <span class="share-optional">optional</span></label>
        <input id="note-for" class="input" type="text" maxlength="${US_DUA_FOR_MAX}" placeholder="my exam"
               autocomplete="off" enterkeyhint="send" />`;
    } else if (mode === 'feeling') {
      byId('note-title').textContent = 'How I’m feeling';
      body.innerHTML = `
        <div class="nt-feelings" role="group" aria-label="How you are feeling">
          ${US_FEELINGS.map((f) => `
            <button class="mo-mood" type="button" data-feeling="${f.id}" aria-pressed="false">${esc(f.label)}</button>`).join('')}
        </div>`;
    } else {
      byId('note-title').textContent = 'Write a note';
      body.innerHTML = `
        <div class="nt-card">
          <textarea id="note-text" class="nt-text" maxlength="${US_NOTE_MAX}" rows="6"
                    placeholder="Dear ${esc(name(Us.other()))},"></textarea>
          <p id="note-count" class="nt-count">${US_NOTE_MAX}</p>
        </div>`;
    }
    this.sync();
    this.sheet.show();
    byId(mode === 'dua' ? 'note-for' : mode === 'write' ? 'note-text' : 'note-panel').focus();
  },

  /** Send is ready when there is something to send. */
  sync() {
    let ready = true;
    if (this.mode === 'feeling') ready = Boolean(this.feeling);
    if (this.mode === 'write') {
      const text = byId('note-text').value;
      byId('note-count').textContent = US_NOTE_MAX - text.length;
      ready = Boolean(text.trim());
    }
    byId('note-send').disabled = !ready;
  },

  fields() {
    if (this.mode === 'dua') {
      const why = byId('note-for').value.trim().replace(/^for\s+/i, '');
      return { type: 'text', body: why ? `Make dua for me, for ${why} 🤲` : 'Make dua for me 🤲' };
    }
    if (this.mode === 'feeling') return { type: 'mood', body: this.feeling };
    return { type: 'text', body: byId('note-text').value.trim().slice(0, US_NOTE_MAX) };
  },

  async send() {
    if (byId('note-send').disabled) return;
    const fields = this.fields();
    const tile = this.mode;
    byId('note-send').disabled = true;
    const res = await Us.send(fields, { tile });
    if (res) this.sheet.hide();
    else byId('note-send').disabled = false;
  },
};

byId('note-body').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-feeling]');
  if (!chip) return;
  NoteSheet.feeling = chip.dataset.feeling;
  for (const c of byId('note-body').querySelectorAll('[data-feeling]')) {
    c.setAttribute('aria-pressed', String(c === chip));
  }
  NoteSheet.sync();
});
byId('note-body').addEventListener('input', () => NoteSheet.sync());
byId('note-body').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.id === 'note-for') { event.preventDefault(); NoteSheet.send(); }
});
byId('note-send').addEventListener('click', () => NoteSheet.send());

/* =========================================================== share sheet === */

/* "Send to Marwa": a preview of the ayah or hadith, an optional note, Send. */
const ShareSheet = {
  open: false,
  item: null,          // { type, body, ref, preview: { ar, en, ref }, note, tile }
  returnFocus: null,
  openedAt: 0,

  /** One ayah, or a range sent as one card (94:5–6), with an optional
      note already filled in. */
  async openAyah(s, a, to = a, { note = '', tile = null } = {}) {
    try {
      const text = await ayahRangeText(s, a, to);
      const nameOf = await surahName(s);
      const range = ayahRange(a, to);
      this.show({
        type: 'ayah',
        body: text.translation,
        ref: { surah: s, ayah: a, ...(to > a ? { ayah_to: to } : {}), name: nameOf, arabic: text.arabic },
        preview: { ar: text.arabic, en: text.translation, ref: `${nameOf} · ${s}:${range}` },
        note,
        tile,
      });
    } catch {
      toast('That ayah could not be loaded. Check your connection and try again.', { error: true });
    }
  },

  openHadith(book, number) {
    const item = Hadith.chapter?.items.find((h) => h.n === number);
    if (!item?.en) {
      toast('There is no English text to send for this hadith.', { error: true });
      return;
    }
    const nameOf = Hadith.bookName(book);
    this.show({
      type: 'hadith',
      body: item.en,
      ref: { book, number, name: nameOf },
      preview: { ar: '', en: item.en, ref: `${nameOf} · ${number}` },
    });
  },

  show(item) {
    this.item = item;
    const other = name(Us.other());
    byId('share-title').textContent = `Send to ${other}`;
    byId('share-preview').innerHTML = `
      ${item.preview.ar ? `<p class="us-share-ar" lang="ar" dir="rtl">${esc(item.preview.ar)}</p>` : ''}
      <p class="us-share-en">${esc(item.preview.en)}</p>
      <p class="us-share-ref">${esc(item.preview.ref)}</p>`;
    byId('share-note').value = item.note || '';
    byId('share-send').disabled = false;
    if (!this.open) {
      this.open = true;
      this.openedAt = Date.now();
      this.returnFocus = document.activeElement;
      showSheet(byId('share-pop'), byId('share-panel'));
    }
    byId('share-panel').focus();
  },

  close() {
    if (!this.open) return;
    this.open = false;
    hideSheet(byId('share-pop'), byId('share-panel'));
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
  },

  async send() {
    const { type, body, ref, tile } = this.item;
    const note = byId('share-note').value.trim().slice(0, 200) || null;
    byId('share-send').disabled = true;
    this.close();
    await Us.send({ type, body, ref, note }, { tile });
  },
};

byId('share-send').addEventListener('click', () => ShareSheet.send());
byId('share-close').addEventListener('click', () => ShareSheet.close());
// Opened by a long-press, the finger lifts over the backdrop: that is not a tap to close.
byId('share-scrim').addEventListener('click', () => {
  if (Date.now() - ShareSheet.openedAt > 500) ShareSheet.close();
});
byId('share-note').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); ShareSheet.send(); }
});
// Esc closes this sheet only, not the ayah popup under it.
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !ShareSheet.open) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  ShareSheet.close();
}, true);

/* ================================================ ayahs for the moment === */

/** "5" or "5–6". */
function ayahRange(a, to) {
  return to && Number(to) !== Number(a) ? `${a}–${to}` : `${a}`;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arabicNumber = (n) => String(n).replace(/\d/g, (d) => ARABIC_DIGITS[d]);

/** The Arabic and translation of an ayah or a range, from the Quran API
    (through the reader's cache). A range is one text, each ayah closed with
    its number. */
async function ayahRangeText(s, a, to = a) {
  const parts = [];
  for (let n = a; n <= to; n += 1) parts.push(await AyahSheet.ayahText(s, n));
  if (parts.length === 1) return parts[0];
  return {
    arabic: parts.map((p, i) => `${p.arabic} ﴿${arabicNumber(a + i)}﴾`).join(' '),
    translation: parts.map((p) => p.translation).join(' '),
  };
}

async function surahName(s) {
  try {
    const list = await Quran.loadSurahList();
    return list[s - 1]?.englishName || `Surah ${s}`;
  } catch {
    return `Surah ${s}`;
  }
}

const US_MOOD_STORE = 'kharwa.us.mood';

/* The sheet: mood chips across the top, the selected mood's ayahs below,
   each a card that opens to its Arabic and sends through the share sheet
   with the mood's note filled in. "Surprise me" picks one, preferring ones
   not sent to them in the last 30 days (the thread keeps 30 days). Opened in
   "add" mode from the ayah popup, the chips choose the mood to add it to. */
const Moments = {
  shown: false,
  mood: 'stressed',
  adding: null,         // { s, a } while adding an ayah from the Quran tab
  custom: [],           // rows from us_presets
  customLoaded: false,
  texts: new Map(),     // "s:a-to" -> { arabic, translation }, or a promise of it
  expanded: new Set(),  // keys showing their Arabic
  returnFocus: null,
  openedAt: 0,

  key(x) {
    return `${x.s}:${x.a}-${x.to}`;
  },

  /** The mood's ayahs: ours first, then ones added, without repeats. */
  ayahs(moodId) {
    const mood = US_MOOD[moodId];
    const list = mood.ayahs.map((x) => ({ ...x, to: x.to || x.a, builtIn: true }));
    for (const row of this.custom.filter((r) => r.mood === moodId)) {
      const x = { s: row.surah, a: row.ayah_from, to: row.ayah_to, id: row.id, person: row.person };
      if (!list.some((y) => this.key(y) === this.key(x))) list.push(x);
    }
    return list;
  },

  /** When it was last sent to the other person, from the thread, or null. */
  sentAt(x) {
    const hit = [...Us.list].reverse().find((m) => m.type === 'ayah' && m.from_person === State.me && !m.pending
      && Number(m.ref?.surah) === x.s && Number(m.ref?.ayah) === x.a
      && Number(m.ref?.ayah_to || m.ref?.ayah) === x.to);
    return hit ? new Date(hit.created_at) : null;
  },

  async loadCustom() {
    try {
      this.custom = await Data.loadPresets();
      this.customLoaded = true;
    } catch { /* us_presets not there yet: only ours */ }
  },

  text(x) {
    const k = this.key(x);
    if (!this.texts.has(k)) {
      const p = ayahRangeText(x.s, x.a, x.to).then((t) => { this.texts.set(k, t); return t; });
      p.catch(() => this.texts.delete(k));
      this.texts.set(k, p);
    }
    return this.texts.get(k);
  },

  /* ------------------------------------------------------- open, close --- */

  show(moodId) {
    if (moodId && US_MOOD[moodId]) this.mood = moodId;
    if (!this.shown) {
      this.shown = true;
      this.openedAt = Date.now();
      this.returnFocus = document.activeElement;
      showSheet(byId('moments-pop'), byId('moments-panel'));
    }
    this.render();
    byId('moments-panel').focus();
    if (!this.customLoaded) this.loadCustom().then(() => this.shown && this.renderBody());
  },

  /** From the Us tab: send one. */
  open(moodId) {
    this.adding = null;
    if (!moodId) {
      try { moodId = localStorage.getItem(US_MOOD_STORE); } catch { /* the default */ }
    }
    this.show(moodId);
  },

  /** From the ayah popup: add this ayah to a mood. */
  openAdd(s, a) {
    this.adding = { s, a };
    this.show(this.mood);
  },

  close() {
    if (!this.shown) return;
    this.shown = false;
    hideSheet(byId('moments-pop'), byId('moments-panel'));
    if (this.returnFocus?.isConnected) this.returnFocus.focus();
  },

  pick(moodId) {
    this.mood = moodId;
    if (!this.adding) {
      try { localStorage.setItem(US_MOOD_STORE, moodId); } catch { /* this session */ }
    }
    this.render();
  },

  /* ---------------------------------------------------------- drawing --- */

  render() {
    byId('moments-title').textContent = this.adding ? 'Add to a mood' : 'Ayahs for the moment';
    byId('moments-moods').innerHTML = US_MOODS.map((m) => `
      <button class="mo-mood" type="button" data-pick="${m.id}" aria-pressed="${m.id === this.mood}">${esc(m.label)}</button>`).join('');
    this.renderBody();
  },

  async renderBody() {
    const body = byId('moments-body');
    if (this.adding) {
      const { s, a } = this.adding;
      const nameOf = await surahName(s);
      const label = US_MOOD[this.mood].label;
      const there = this.ayahs(this.mood).some((x) => x.s === s && x.a <= a && a <= x.to);
      body.innerHTML = `
        <p class="mo-add-what">${esc(nameOf)} · ${s}:${a}</p>
        <p class="mo-hint">Choose a mood above. It will be there for both of you.</p>
        <button class="btn btn--primary mo-add-btn" type="button" data-add ${there ? 'disabled' : ''}>
          ${there ? `Already in ${esc(label)}` : `Add to ${esc(label)}`}
        </button>`;
      return;
    }

    const mood = this.mood;
    const list = this.ayahs(mood);
    body.innerHTML = `
      <button class="mo-surprise" type="button" data-surprise>Surprise me</button>
      <div class="mo-list">${list.map((x) => this.cardMarkup(x)).join('')}</div>`;

    // the texts come in one by one; each card fills when its arrives
    for (const x of list) {
      Promise.resolve(this.text(x)).then(async () => {
        if (!this.shown || this.mood !== mood || this.adding) return;
        const card = body.querySelector(`[data-key="${this.key(x)}"]`);
        if (card) card.outerHTML = this.cardMarkup(x, await surahName(x.s));
      }, () => {
        const card = body.querySelector(`[data-key="${this.key(x)}"] .mo-en`);
        if (card) card.textContent = 'Could not load this ayah. Check your connection.';
      });
    }
  },

  cardMarkup(x, nameOf = '') {
    const k = this.key(x);
    const t = this.texts.get(k);
    const ready = t && !(t instanceof Promise);
    const open = this.expanded.has(k);
    const sent = this.sentAt(x);
    const theme = x.theme || `Added by ${x.person === State.me ? 'you' : esc(name(x.person))}`;
    return `
      <article class="mo-card" data-key="${k}">
        <button class="mo-main" type="button" data-expand="${k}" aria-expanded="${open}">
          <span class="mo-theme">${esc(theme)}</span>
          ${open && ready ? `<span class="us-share-ar mo-ar" lang="ar" dir="rtl">${esc(t.arabic)}</span>` : ''}
          <span class="us-share-en mo-en${open ? ' is-open' : ''}">${ready ? esc(t.translation) : 'Loading…'}</span>
          <span class="us-share-ref">${nameOf ? `${esc(nameOf)} · ` : ''}${x.s}:${ayahRange(x.a, x.to)}${
            sent ? `<span class="mo-sent" title="Sent ${esc(fmtDayNav.format(sent))}">&check; Sent</span>` : ''}</span>
        </button>
        <span class="mo-acts">
          ${x.id && x.person === State.me ? `<button class="mo-remove" type="button" data-remove-preset="${x.id}">Remove</button>` : ''}
          <button class="mo-send" type="button" data-send="${k}">Send</button>
        </span>
      </article>`;
  },

  /* ---------------------------------------------------------- actions --- */

  byKey(k) {
    return this.ayahs(this.mood).find((x) => this.key(x) === k);
  },

  send(x) {
    this.close();
    ShareSheet.openAyah(x.s, x.a, x.to, { note: US_MOOD[this.mood].note, tile: 'ayah' });
  },

  surprise() {
    const list = this.ayahs(this.mood);
    const fresh = list.filter((x) => !this.sentAt(x));
    const from = fresh.length ? fresh : list;
    this.send(from[Math.floor(Math.random() * from.length)]);
  },

  async add() {
    const { s, a } = this.adding;
    const mood = this.mood;
    try {
      const row = await Data.addPreset(State.me, mood, s, a, a);
      if (row) this.custom.push(row);
      this.close();
      toast(`Added to ${esc(US_MOOD[mood].label)}`);
    } catch (err) {
      toast(`Couldn’t add it: ${esc(err.message || err)}`, { error: true });
    }
  },

  async removePreset(id) {
    const before = this.custom;
    this.custom = this.custom.filter((r) => r.id !== id);
    this.renderBody();
    try {
      await Data.removePreset(id);
    } catch (err) {
      this.custom = before;
      this.renderBody();
      toast(`Couldn’t remove it: ${esc(err.message || err)}`, { error: true });
    }
  },
};


byId('moments-moods').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-pick]');
  if (chip) Moments.pick(chip.dataset.pick);
});

byId('moments-body').addEventListener('click', (event) => {
  const expand = event.target.closest('[data-expand]');
  if (expand) {
    const k = expand.dataset.expand;
    if (Moments.expanded.has(k)) Moments.expanded.delete(k);
    else Moments.expanded.add(k);
    const x = Moments.byKey(k);
    if (x) surahName(x.s).then((n) => { expand.closest('.mo-card').outerHTML = Moments.cardMarkup(x, n); });
    return;
  }
  const send = event.target.closest('[data-send]');
  if (send) { const x = Moments.byKey(send.dataset.send); if (x) Moments.send(x); return; }
  if (event.target.closest('[data-surprise]')) { Moments.surprise(); return; }
  if (event.target.closest('[data-add]')) { Moments.add(); return; }
  const remove = event.target.closest('[data-remove-preset]');
  if (remove) Moments.removePreset(Number(remove.dataset.removePreset));
});

byId('moments-close').addEventListener('click', () => Moments.close());
byId('moments-scrim').addEventListener('click', () => {
  if (Date.now() - Moments.openedAt > 500) Moments.close();
});
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !Moments.shown) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  Moments.close();
}, true);
