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

  async test() {
    const msg = el('set-rem-test-msg');
    const btn = el('set-rem-test');
    if (!this.sub) return;
    btn.disabled = true;
    msg.textContent = 'Sending…';
    try {
      await Data.sendTestPush(this.sub.endpoint);
      msg.textContent = 'Sent. It should arrive in a few seconds.';
    } catch (err) {
      msg.textContent = `Couldn’t send: ${err.message || err}`;
    } finally {
      btn.disabled = false;
    }
  },
};

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
