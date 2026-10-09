/* ===========================================================================
   us.js — the Us tab: a private thread between the two of you.

   Text, an ayah or a hadith shared from the Quran and Hadith tabs, and a
   quiet line for each nudge from the Prayer tab. Every message goes through
   the send-message Edge Function, which saves it and pushes it to the other
   person's devices; this file only reads, marks read and deletes. New,
   read and deleted messages arrive live through Supabase Realtime.

   Mine on the right on a faint gold tint, theirs on the left on white, with
   day separators in small caps. Long-press one of mine to delete it.
   Messages delete themselves after 30 days (supabase/messages-cron.sql).

   Routes:  #/us        the thread, at the latest message
            #/us/123    the thread, at message 123 (from a notification)

   ShareSheet, at the bottom, is the "Send to Marwa" sheet for an ayah or a
   hadith, opened from the ayah popup, a long-press in the Quran reader, and
   the send button on each hadith. Moments is "Ayahs for the moment": ayahs
   by feeling (us-presets.js, plus any you added), opened from the "Send an
   ayah" chip, the book beside the box, or a mood card in the thread.

   Depends on data.js, router.js, info.js, times.js and, at run time, app.js
   (esc, name, toast, State, showSheet, hideSheet, swipeToClose),
   quran.js (Quran), ayah-sheet.js (AyahSheet) and hadith.js (Hadith).
   =========================================================================== */

const US_QUICK_DEFAULTS = ['I love you ❤️', 'Thinking of you', 'Make dua for me 🤲', 'Proud of you', 'On my way home'];
const US_QUICK_MAX = 8;          // quick sends kept in Settings
const US_QUICK_LEN = 60;         // characters each
const US_TEXT_MAX = 500;
const US_LONG_PRESS_MS = 550;

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
};

const byId = (id) => document.getElementById(id);

const fmtUsTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

const Us = {
  list: [],             // messages, oldest first, including ones still sending
  ready: false,         // the messages table answered
  failed: false,        // ...or did not
  started: false,
  target: null,         // a message id to bring into view
  selected: null,       // my message with Delete showing
  seq: 0,               // ids for messages still sending: "p1", "p2"...
  hintTimer: null,

  other() {
    return PEOPLE_IDS.find((p) => p !== State.me);
  },

  quickSends() {
    const list = Data.people[State.me]?.quick_sends;
    return Array.isArray(list) && list.length ? list : US_QUICK_DEFAULTS;
  },

  unread() {
    return this.list.filter((m) => m.to_person === State.me && !m.read_at && !m.pending).length;
  },

  /** The thread is on screen, so what arrives is read. */
  watching() {
    return Sections.current === 'us' && document.visibilityState === 'visible';
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
      const rows = await Data.loadMessages();
      const sending = this.list.filter((m) => m.pending);
      this.list = [...rows, ...sending];
      this.ready = true;
      this.failed = false;
    } catch {
      this.failed = !this.ready;
    }
    this.updateBadge();
    if (Sections.current === 'us') this.render();
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
    if (event === 'DELETE') {
      this.list = this.list.filter((m) => m.id !== row.id);
    } else {
      const atEnd = this.nearBottom();
      this.put(row);
      if (event === 'INSERT' && row.to_person === State.me && this.watching()) this.markRead();
      if (Sections.current === 'us') {
        this.render();
        if (event === 'INSERT' && atEnd) this.scrollToEnd(true);
      }
      this.updateBadge();
      return;
    }
    this.updateBadge();
    if (Sections.current === 'us') this.render();
  },

  async markRead() {
    if (!this.watching() || !this.unread()) return;
    const now = new Date().toISOString();
    for (const m of this.list) if (m.to_person === State.me && !m.read_at) m.read_at = now;
    this.updateBadge();
    try { await Data.markMessagesRead(State.me); } catch { /* tried again next time */ }
  },

  updateBadge() {
    Sections.setBadge('us', this.unread() > 0);
  },

  /* ------------------------------------------------------------ sending --- */

  /** Shows it at once, then sends it. `fields`: { type, body, ref, note }. */
  async send(fields) {
    const local = {
      id: `p${++this.seq}`, pending: true, from_person: State.me, to_person: this.other(),
      created_at: new Date().toISOString(), read_at: null, ref: null, note: null, ...fields,
    };
    this.list.push(local);
    if (Sections.current === 'us') {
      this.render();
      this.scrollToEnd(true);
    }
    return this.deliver(local);
  },

  /** Resolves to the function's answer once it is saved, or false. */
  async deliver(local) {
    local.failed = false;
    try {
      const res = await Data.sendMessage({
        from: State.me, to: this.other(), type: local.type, body: local.body, ref: local.ref, note: local.note,
      });
      if (!res.ok) {
        local.failed = true;
        toast(res.reason === 'rate_limited'
          ? 'That’s 30 messages this hour. Wait a little before sending more.'
          : 'That message couldn’t be sent.', { error: true });
        return false;
      }
      this.list = this.list.filter((m) => m !== local);
      this.put(res.message);
      if (!res.devices) this.hint(`${esc(name(this.other()))} will see it in Kharwa`);
      return res;
    } catch (err) {
      local.failed = true;
      toast(`Couldn’t send: ${esc(err.message || err)}`, { error: true });
      return false;
    } finally {
      if (Sections.current === 'us') this.render();
    }
  },

  async remove(id) {
    const i = this.list.findIndex((m) => m.id === id);
    if (i < 0) return;
    const [gone] = this.list.splice(i, 1);
    this.selected = null;
    this.render();
    try {
      await Data.deleteMessage(State.me, id);
    } catch (err) {
      this.put(gone);
      this.render();
      toast(`Couldn’t delete: ${esc(err.message || err)}`, { error: true });
    }
  },

  /** A quiet line under the box, for a few seconds. */
  hint(html) {
    const node = byId('us-hint');
    node.innerHTML = html;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { node.textContent = ''; this.counter(); }, 5000);
  },

  counter() {
    const left = US_TEXT_MAX - byId('us-input').value.length;
    if (left <= 80) byId('us-hint').textContent = `${left} left`;
    else if (/ left$/.test(byId('us-hint').textContent)) byId('us-hint').textContent = '';
  },

  /* ---------------------------------------------------------- rendering --- */

  show(params) {
    const id = Number(params[0]);
    this.target = Number.isInteger(id) && id > 0 ? id : null;
    if (params.length) history.replaceState(null, '', '#/us');
    this.renderChrome();
    this.render();
    if (this.target && this.list.some((m) => m.id === this.target)) this.scrollToMessage(this.target);
    else this.scrollToEnd(false);
    this.markRead();
    if (!this.ready) this.load();
  },

  /** The parts that only change with the people: the title, chips, placeholder. */
  renderChrome() {
    const other = esc(name(this.other()));
    byId('us-title').innerHTML = `${esc(name(State.me))} &amp; ${other}`;
    byId('us-input').placeholder = `Write to ${name(this.other())}…`;
    byId('us-input').setAttribute('aria-label', `Message to ${name(this.other())}`);
    byId('us-chips').innerHTML = `
      <button class="us-chip us-chip--ayah" type="button" data-moments>${US_ICONS.book}Send an ayah</button>
      ${US_MOODS.filter((m) => m.feeling).map((m) => `
        <button class="us-chip us-chip--feel" type="button" data-feel="${m.id}">${esc(m.feeling)}</button>`).join('')}
      ${this.quickSends().map((text, i) => `
        <button class="us-chip" type="button" data-quick="${i}">${esc(text)}</button>`).join('')}`;
  },

  dayLabel(key) {
    const today = todayKey();
    if (key === today) return 'Today';
    if (key === addDays(today, -1)) return 'Yesterday';
    return fmtDayNav.format(parseKey(key));
  },

  render() {
    const thread = byId('us-thread');
    if (this.failed) {
      thread.innerHTML = `<p class="us-empty">Messages aren’t set up yet. Run
        <code>supabase/schema.sql</code> again in Supabase, then reload.</p>`;
      return;
    }
    if (!this.list.length) {
      thread.innerHTML = `<p class="us-empty">${this.ready ? 'No messages yet. Say salam.' : 'Loading…'}</p>`;
      return;
    }

    const lastMine = [...this.list].reverse().find((m) => m.from_person === State.me && m.type !== 'nudge' && !m.pending);
    let day = null;
    thread.innerHTML = this.list.map((m) => {
      const key = dateKey(new Date(m.created_at));
      const sep = key !== day ? `<p class="us-day"><span>${this.dayLabel(key)}</span></p>` : '';
      day = key;
      return sep + this.messageMarkup(m, m === lastMine && m.read_at);
    }).join('');
  },

  messageMarkup(m, seen) {
    const mine = m.from_person === State.me;
    const time = fmtUsTime.format(new Date(m.created_at));

    if (m.type === 'nudge') {
      const prayer = esc(m.body || PRAYER_LABEL[m.ref?.prayer] || 'their prayer');
      const line = mine
        ? `You nudged ${esc(name(m.to_person))} to pray ${prayer}`
        : `${esc(name(m.from_person))} nudged you to pray ${prayer}`;
      return `<p class="us-nudge" id="us-m-${m.id}">${line} · ${time}</p>`;
    }

    let inner = '';
    if (m.type === 'text') {
      inner = `<p class="us-text">${esc(m.body)}</p>`;
    } else if (m.type === 'mood') {
      // "I'm stressed": the other can answer it with an ayah for that mood
      const mood = US_MOOD[m.body];
      inner = `
        <p class="us-mood-label">Feeling</p>
        <p class="us-mood-text">${esc(mood?.feeling || m.body)}</p>
        ${!mine && mood ? `<button class="us-mood-btn" type="button" data-mood="${mood.id}">Send an ayah for this</button>` : ''}`;
    } else {
      const range = ayahRange(m.ref?.ayah, m.ref?.ayah_to);
      const share = m.type === 'ayah'
        ? {
          href: `#/quran/${m.ref?.surah}/${range.replace('–', '-')}`,
          ar: m.ref?.arabic,
          ref: `${m.ref?.name || 'Quran'} · ${m.ref?.surah}:${range}`,
        }
        : {
          href: `#/hadith/${m.ref?.book}/n/${m.ref?.number}`,
          ar: '',
          ref: `${m.ref?.name || 'Hadith'} · ${m.ref?.number}`,
        };
      inner = `
        ${m.note ? `<p class="us-text">${esc(m.note)}</p>` : ''}
        <a class="us-share us-share--${m.type}" href="${share.href}">
          ${share.ar ? `<p class="us-share-ar" lang="ar" dir="rtl">${esc(share.ar)}</p>` : ''}
          <p class="us-share-en">${esc(m.body)}</p>
          <p class="us-share-ref">${esc(share.ref)}</p>
        </a>`;
    }

    let meta = time;
    if (m.pending && m.failed) meta = `Not sent · <button class="us-retry" type="button" data-retry="${m.id}">Retry</button>`;
    else if (m.pending) meta = 'Sending…';
    else if (seen) meta += ' · Seen';

    const selected = this.selected === m.id;
    return `
      <div class="us-msg ${mine ? 'is-mine' : 'is-theirs'}${m.type === 'mood' ? ' us-msg--mood' : ''}${m.pending ? ' is-pending' : ''}${selected ? ' is-selected' : ''}"
           id="us-m-${m.id}" data-id="${m.id}">
        <div class="us-bubble">${inner}</div>
        <p class="us-meta">${meta}</p>
        ${selected ? `<button class="us-del" type="button" data-del="${m.id}">Delete message</button>` : ''}
      </div>`;
  },

  /* ----------------------------------------------------------- scrolling --- */

  nearBottom() {
    const doc = document.documentElement;
    return doc.scrollHeight - (window.scrollY + window.innerHeight) < 160;
  },

  scrollToEnd(smooth) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  },

  scrollToMessage(id) {
    requestAnimationFrame(() => {
      const node = document.getElementById(`us-m-${id}`);
      if (!node) return;
      node.scrollIntoView({ block: 'center' });
      node.classList.add('is-target');
      setTimeout(() => node.classList.remove('is-target'), 2200);
    });
  },
};

Info.add('us', () => `
  <p>Just the two of you. Each message also arrives as a notification on the
     other person&rsquo;s phone, if they have turned on Prayer reminders.</p>
  <p>Messages delete themselves after 30 days. Long-press one of yours to delete
     it sooner.</p>`);

/* -------------------------------------------------------------- events --- */

byId('us-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = byId('us-input');
  const body = input.value.trim();
  if (!body) return;
  input.value = '';
  Us.growInput();
  Us.counter();
  Us.send({ type: 'text', body: body.slice(0, US_TEXT_MAX) });
});

Us.growInput = () => {
  const input = byId('us-input');
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
};

byId('us-input').addEventListener('input', () => {
  Us.growInput();
  Us.counter();
});

// Enter sends on a keyboard; Shift+Enter, and Enter on a phone, is a new line.
byId('us-input').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;
  event.preventDefault();
  byId('us-form').requestSubmit();
});

byId('us-chips').addEventListener('click', (event) => {
  if (event.target.closest('[data-moments]')) { Moments.open(); return; }
  const feel = event.target.closest('[data-feel]');
  if (feel) { Us.send({ type: 'mood', body: feel.dataset.feel }); return; }
  const chip = event.target.closest('[data-quick]');
  if (chip) Us.send({ type: 'text', body: Us.quickSends()[Number(chip.dataset.quick)] });
});

byId('us-moments').addEventListener('click', () => Moments.open());

byId('us-thread').addEventListener('click', (event) => {
  const answer = event.target.closest('[data-mood]');
  if (answer) { Moments.open(answer.dataset.mood); return; }
  const del = event.target.closest('[data-del]');
  if (del) { Us.remove(Number(del.dataset.del)); return; }
  const retry = event.target.closest('[data-retry]');
  if (retry) {
    const local = Us.list.find((m) => m.id === retry.dataset.retry);
    if (local) { Us.render(); Us.deliver(local); }
    return;
  }
  // a link inside a card that was just long-pressed should not open
  if (Us.justPressed) { event.preventDefault(); Us.justPressed = false; return; }
  if (Us.selected !== null && !event.target.closest('.us-msg.is-selected')) {
    Us.selected = null;
    Us.render();
  }
});

/* Long-press (or right-click) one of my messages to delete it. */
{
  let timer = null;
  let start = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const select = (msg) => {
    Us.selected = Number(msg.dataset.id);
    Us.justPressed = true;
    window.getSelection?.().removeAllRanges();
    Us.render();
  };
  byId('us-thread').addEventListener('pointerdown', (event) => {
    const msg = event.target.closest('.us-msg.is-mine:not(.is-pending)');
    if (!msg || event.button > 0) return;
    start = { x: event.clientX, y: event.clientY };
    Us.justPressed = false;
    timer = setTimeout(() => { timer = null; select(msg); }, US_LONG_PRESS_MS);
  });
  byId('us-thread').addEventListener('pointermove', (event) => {
    if (timer && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancel();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) byId('us-thread').addEventListener(type, cancel);
  byId('us-thread').addEventListener('contextmenu', (event) => {
    const msg = event.target.closest('.us-msg.is-mine:not(.is-pending)');
    if (!msg) return;
    event.preventDefault();
    cancel();
    select(msg);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Us.started) Us.load();
});

Sections.register({
  id: 'us',
  label: 'Us',
  order: 3.5,
  icon: US_ICONS.heart,
  root: byId('section-us'),
  show: (params) => Us.show(params),
});

/* =========================================================== share sheet === */

/* "Send to Marwa": a preview of the ayah or hadith, an optional note, Send. */
const ShareSheet = {
  open: false,
  item: null,          // { type, body, ref, preview: { ar, en, ref } }
  returnFocus: null,
  openedAt: 0,

  /** One ayah, or a range sent as one card (94:5–6), with an optional
      note already filled in. */
  async openAyah(s, a, to = a, { note = '' } = {}) {
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
    const { type, body, ref } = this.item;
    const note = byId('share-note').value.trim().slice(0, 200) || null;
    byId('share-send').disabled = true;
    const other = esc(name(Us.other()));
    this.close();
    const res = await Us.send({ type, body, ref, note });
    if (res) toast(res.devices ? `Sent to ${other}` : `Sent. ${other} will see it in Kharwa`);
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

/* ===================================================== quick messages === */

/* Settings → App: the chips above the box, edited as a short list. Saved to
   people.quick_sends; null keeps the usual five. */
const QuickSends = {
  draft: [],

  fill() {
    this.draft = [...Us.quickSends()];
    this.render();
  },

  render() {
    byId('set-quick').innerHTML = this.draft.map((text, i) => `
      <div class="set-quick-row">
        <input class="input set-quick-input" type="text" maxlength="${US_QUICK_LEN}" data-i="${i}"
               value="${esc(text)}" aria-label="Quick message ${i + 1}" />
        <button class="set-quick-remove" type="button" data-remove="${i}"
                aria-label="Remove ${esc(text) || 'this one'}">&times;</button>
      </div>`).join('');
    byId('set-quick-add').disabled = this.draft.length >= US_QUICK_MAX;
  },

  save(wait = 600) {
    queueSave('quick', async () => {
      const me = Data.people[State.me] || {};
      if (!('quick_sends' in me)) throw new Error('run supabase/schema.sql again first.');
      const list = this.draft.map((t) => t.trim()).filter(Boolean).slice(0, US_QUICK_MAX);
      const value = list.length && JSON.stringify(list) !== JSON.stringify(US_QUICK_DEFAULTS) ? list : null;
      if (JSON.stringify(value) === JSON.stringify(me.quick_sends ?? null)) return false;
      await Data.saveSettings(State.me, { quick_sends: value });
      Us.renderChrome();
      return true;
    }, wait);
  },
};

byId('set-quick').addEventListener('input', (event) => {
  const input = event.target.closest('.set-quick-input');
  if (!input) return;
  QuickSends.draft[Number(input.dataset.i)] = input.value;
  QuickSends.save();
});

byId('set-quick').addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove]');
  if (!remove) return;
  QuickSends.draft.splice(Number(remove.dataset.remove), 1);
  QuickSends.render();
  QuickSends.save(0);
});

byId('set-quick-add').addEventListener('click', () => {
  if (QuickSends.draft.length >= US_QUICK_MAX) return;
  QuickSends.draft.push('');
  QuickSends.render();
  byId('set-quick').querySelector('.set-quick-row:last-child input').focus();
});

byId('set-quick-reset').addEventListener('click', () => {
  QuickSends.draft = [...US_QUICK_DEFAULTS];
  QuickSends.render();
  QuickSends.save(0);
});

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
    ShareSheet.openAyah(x.s, x.a, x.to, { note: US_MOOD[this.mood].note });
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
