/* ===========================================================================
   reminders.js — prayer reminders, in Settings → App.

   Turning the switch on (from a tap) asks for notification permission,
   subscribes this browser to Web Push with the VAPID public key in
   config.js, and saves the subscription to push_subscriptions with this
   person and their choices: which prayers, and at the start time or 5, 10 or
   15 minutes before. The send-reminders Edge Function does the sending, so
   reminders arrive with Kharwa closed. Each device is its own subscription.

   On an iPhone, Web Push only works once Kharwa is on the Home Screen, so
   until then the switch is replaced by a note saying so.

   Depends on data.js, install.js (Install), and at run time app.js (State,
   queueSave, setSaveError, flashSaved).
   =========================================================================== */

const REMINDER_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const Reminders = {
  sub: null,       // this browser's PushSubscription, when there is one
  on: false,       // whether this device is saved for reminders
  busy: false,
  settings: { prayers: [...REMINDER_PRAYERS], minutes_before: 0 },

  supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  publicKey() {
    return (window.KHARWA_CONFIG || {}).VAPID_PUBLIC_KEY || '';
  },

  /** Why the switch cannot be offered here, or '' when it can. */
  blocker() {
    if (Install.isIOS() && !Install.installed()) {
      return 'Add Kharwa to your Home Screen first to get reminders.';
    }
    if (!this.supported()) return 'This browser can’t show prayer reminders.';
    if (!Data.configured || !this.publicKey()) return 'Reminders aren’t set up on this copy of Kharwa yet.';
    return '';
  },

  /** Called each time Settings opens. */
  async fill() {
    setSaveError('reminders', '');
    el('set-rem-test-msg').textContent = '';
    const why = this.blocker();
    this.note(why);
    el('set-rem-switch').hidden = Boolean(why);
    if (why) { this.on = false; this.render(); return; }

    this.render();
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      this.sub = reg ? await reg.pushManager.getSubscription() : null;
      const row = this.sub ? await Data.loadPushSubscription(this.sub.endpoint) : null;
      this.on = Boolean(row) && Notification.permission === 'granted';
      if (row) {
        this.settings = { ...this.settings, ...row.settings };
        // the device changed hands: its reminders now follow this person
        if (row.person !== State.me) await Data.savePushSubscription(State.me, this.sub, this.settings);
      }
    } catch (err) {
      setSaveError('reminders', `Couldn’t check reminders: ${err.message || err}`);
    }
    if (!this.on && Notification.permission === 'denied') this.note(this.deniedText());
    this.render();
  },

  deniedText() {
    return 'Notifications are blocked for Kharwa. Allow them in your browser’s site settings, then turn this on.';
  },

  note(text) {
    el('set-rem-note').textContent = text;
    el('set-rem-note').hidden = !text;
  },

  render() {
    const sw = el('set-rem-switch');
    sw.setAttribute('aria-checked', String(this.on));
    sw.disabled = this.busy;
    el('set-rem-options').hidden = !this.on;
    for (const btn of document.querySelectorAll('.set-rem-prayer')) {
      btn.setAttribute('aria-pressed', String(this.settings.prayers.includes(btn.dataset.prayer)));
    }
    el('set-rem-when').value = String(this.settings.minutes_before || 0);
  },

  /* ------------------------------------------------------- on and off --- */

  /** From the tap itself: the permission prompt must not wait on anything. */
  async turnOn() {
    const asked = Notification.requestPermission();
    this.busy = true;
    this.render();
    try {
      const permission = await asked;
      if (permission !== 'granted') {
        this.note(permission === 'denied' ? this.deniedText() : 'Allow notifications to get prayer reminders.');
        return;
      }
      this.note('');
      const reg = await navigator.serviceWorker.ready;
      const key = base64UrlBytes(this.publicKey());
      let sub = await reg.pushManager.getSubscription();
      // made with another key (the keys were replaced): start again
      if (sub && !sameBytes(sub.options?.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await Data.savePushSubscription(State.me, sub, this.settings);
      this.sub = sub;
      this.on = true;
      setSaveError('reminders', '');
      flashSaved('reminders');
    } catch (err) {
      setSaveError('reminders', `Couldn’t turn on reminders: ${err.message || err}`);
    } finally {
      this.busy = false;
      this.render();
    }
  },

  async turnOff() {
    this.busy = true;
    this.render();
    try {
      if (this.sub) {
        await Data.deletePushSubscription(this.sub.endpoint);
        await this.sub.unsubscribe().catch(() => {});
      }
      this.sub = null;
      this.on = false;
      setSaveError('reminders', '');
      flashSaved('reminders');
    } catch (err) {
      setSaveError('reminders', `Couldn’t turn off reminders: ${err.message || err}`);
    } finally {
      this.busy = false;
      this.render();
    }
  },

  /* --------------------------------------------------------- settings --- */

  changed() {
    this.render();
    queueSave('reminders', async () => {
      if (!this.on || !this.sub) return false;
      await Data.savePushSubscription(State.me, this.sub, this.settings);
      return true;
    }, 400);
  },

  togglePrayer(prayer) {
    const chosen = new Set(this.settings.prayers);
    if (chosen.has(prayer)) chosen.delete(prayer);
    else chosen.add(prayer);
    this.settings = { ...this.settings, prayers: REMINDER_PRAYERS.filter((p) => chosen.has(p)) };
    this.changed();
  },

  setWhen(minutes) {
    this.settings = { ...this.settings, minutes_before: minutes };
    this.changed();
  },

  /** "Send test notification" opens the test menu. */
  test() {
    const msg = el('set-rem-test-msg');
    if (!this.sub) {
      msg.textContent = 'Couldn’t send: no device signed up. Turn reminders off and on.';
      return;
    }
    msg.textContent = '';
    TestSheet.open();
  },
};

/* ------------------------------------------------------------ test menu --- */

/* Every kind of notification, sent to your own devices only, so you can see
   how each looks (and, with the delay, how it arrives on a locked screen).
   send-reminders builds each from the same template as the real one and
   writes nothing. */
const TEST_DELAY_S = 10;

const TestSheet = {
  sheet: null,
  delay: true,

  groups() {
    const { times } = timesFor(todayKey());
    const other = name(PEOPLE_IDS.find((p) => p !== State.me));
    const at = (key) => timeText(times[key]);
    // Each label is the notification's title, word for word: they are
    // title-only, built by the shared template in send-reminders.
    return [
      {
        label: 'Prayer reminders',
        rows: [
          ...PRAYERS.map((p) => ({ kind: `prayer:${p.key}`, label: `${p.label} · ${at(p.key)}`, hint: 'At the start time' })),
          { kind: 'prayer:asr:10', label: `Asr in 10 minutes · ${at('asr')}`, hint: '10 minutes before' },
        ],
      },
      { label: 'Nudge', rows: [{ kind: 'nudge', label: `${other} nudged you to pray Isha`, hint: 'A nudge' }] },
      {
        label: 'Notes',
        rows: [
          { kind: 'note:love', label: `${other}: I love you ❤️`, hint: 'A note' },
          { kind: 'note:ayah', label: `${other}: For when it feels like too much 🤍 (94:5–6)`, hint: 'An ayah, with a note' },
          { kind: 'note:dua', label: `${other}: Make dua for me 🤲`, hint: 'A note' },
          { kind: 'note:feeling', label: `${other} is feeling stressed`, hint: 'A feeling' },
        ],
      },
    ];
  },

  async open() {
    // made on first use: the sheet helper lives in us.js, which loads with Us
    if (!this.sheet) {
      await Lazy.need('share');
      this.sheet = usSheet('test-pop', 'test-panel', 'test-scrim', 'test-close');
    }
    el('test-delay').setAttribute('aria-checked', String(this.delay));
    el('test-all-msg').textContent = '';
    el('test-list').innerHTML = this.groups().map((g) => `
      <h3 class="ts-group">${esc(g.label)}</h3>
      <ul class="ts-rows">
        ${g.rows.map((r) => `
          <li class="ts-row">
            <span class="ts-text">
              <span class="ts-label">${esc(r.label)}</span>
              <span class="ts-hint">${esc(r.hint)}</span>
              <span class="ts-status" data-status="${r.kind}" aria-live="polite"></span>
            </span>
            <button class="ts-send" type="button" data-kind="${r.kind}">Send</button>
          </li>`).join('')}
      </ul>`).join('');
    this.sheet.show();
  },

  /** Sends one test; `status` is where to say how it went. */
  async send(kind, status, button) {
    const delay = this.delay ? TEST_DELAY_S : 0;
    status.className = 'ts-status';
    status.textContent = delay ? `Sending in ${delay} s…` : 'Sending…';
    if (button) button.disabled = true;
    try {
      const res = await Data.sendTestPush(Reminders.sub.endpoint, kind, delay);
      status.classList.add('is-ok');
      status.textContent = res.scheduled
        ? (delay ? `Sent ✓ · arrives in about ${delay} s` : 'Sent ✓ · a few seconds apart')
        : 'Sent ✓';
    } catch (err) {
      status.classList.add('is-error');
      status.textContent = err.message || String(err);
    } finally {
      if (button) button.disabled = false;
    }
  },
};

document.getElementById('test-list').addEventListener('click', (event) => {
  const btn = event.target.closest('[data-kind]');
  if (!btn) return;
  TestSheet.send(btn.dataset.kind, el('test-list').querySelector(`[data-status="${btn.dataset.kind}"]`), btn);
});

document.getElementById('test-delay').addEventListener('click', () => {
  TestSheet.delay = !TestSheet.delay;
  el('test-delay').setAttribute('aria-checked', String(TestSheet.delay));
});

document.getElementById('test-all').addEventListener('click', () => TestSheet.send('prayers', el('test-all-msg'), el('test-all')));

/** A VAPID key as bytes, from the URL-safe base64 it is written in. */
function base64UrlBytes(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function sameBytes(buffer, bytes) {
  if (!buffer) return true; // the browser does not say: assume it is ours
  const a = new Uint8Array(buffer);
  return a.length === bytes.length && a.every((b, i) => b === bytes[i]);
}

/* ------------------------------------------------------------- events --- */

document.getElementById('set-rem-switch').addEventListener('click', () => {
  if (Reminders.busy) return;
  if (Reminders.on) Reminders.turnOff();
  else Reminders.turnOn();
});

document.getElementById('set-rem-options').addEventListener('click', (event) => {
  const prayer = event.target.closest('.set-rem-prayer');
  if (prayer) Reminders.togglePrayer(prayer.dataset.prayer);
});

document.getElementById('set-rem-when').addEventListener('change', (event) => {
  Reminders.setWhen(Number(event.target.value));
});

document.getElementById('set-rem-test').addEventListener('click', () => Reminders.test());
