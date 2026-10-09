/* ===========================================================================
   install.js — Kharwa as a home-screen app.

   Registers the service worker (sw.js), and runs "Install Kharwa" in
   Settings → App:
   - Chrome, Edge and Android offer an install prompt; the button opens it.
   - iPhone and iPad have no prompt, so the row says how: Share, then Add to
     Home Screen.
   - Anywhere else, or once Kharwa is installed, the row stays hidden.

   Loads before app.js, so it uses no helpers from it.
   =========================================================================== */

const Install = {
  prompt: null,   // the deferred beforeinstallprompt event

  /** Opened from the home screen rather than in a browser tab. */
  installed() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  },

  /** iPhone or iPad (an iPad reports itself as a Mac with a touch screen). */
  isIOS() {
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  },

  render() {
    const row = document.getElementById('set-install');
    if (!row) return;
    const ios = !this.prompt && this.isIOS();
    row.hidden = this.installed() || (!this.prompt && !ios);
    document.getElementById('set-install-btn').hidden = !this.prompt;
    document.getElementById('set-install-ios').hidden = !ios;
  },

  async install() {
    const prompt = this.prompt;
    if (!prompt) return;
    this.prompt = null;      // a prompt can only be shown once
    prompt.prompt();
    try { await prompt.userChoice; } catch { /* dismissed */ }
    this.render();
  },
};

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();    // no mini-infobar: the button in Settings offers it
  Install.prompt = event;
  Install.render();
});

window.addEventListener('appinstalled', () => {
  Install.prompt = null;
  Install.render();
});

window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => Install.render());

document.getElementById('set-install-btn').addEventListener('click', () => Install.install());

Install.render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* the app works without it */ });
  });
}
