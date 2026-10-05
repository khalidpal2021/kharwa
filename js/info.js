/* ===========================================================================
   info.js — the ⓘ button and its popover.

   Explanations live here rather than in the page. A section drops
   infoButton('key') next to a header label (or, in index.html, an empty
   <span data-info-slot="key">) and registers what it says with
   Info.add('key', () => html). One popover is shared, so only one is ever
   open; it is fixed to the viewport and follows its button on scroll, which
   keeps it anchored inside the sticky Learn bar and the settings sheet too.

   Closes on a second tap of the button, a tap anywhere else, or Esc.
   =========================================================================== */

/** The small circled "i". `key` names the content registered with Info.add. */
function infoButton(key) {
  return `<button class="info-btn" type="button" data-info="${key}" aria-label="More info"
                  aria-expanded="false" aria-controls="info-pop">
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.2"/>
      <path d="M8 7.2v4.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <circle cx="8" cy="4.8" r="0.9" fill="currentColor"/>
    </svg>
  </button>`;
}

const Info = {
  content: {},
  pop: null,
  btn: null,       // the button whose popover is open

  /** `html` is a function, so text can depend on the moment (a date, a tab). */
  add(key, html) {
    this.content[key] = html;
  },

  init() {
    this.pop = document.createElement('div');
    this.pop.id = 'info-pop';
    this.pop.className = 'info-pop';
    this.pop.setAttribute('role', 'note');
    this.pop.hidden = true;
    document.body.appendChild(this.pop);

    // Buttons in the static markup are placeholders: <span data-info-slot="key">.
    for (const slot of document.querySelectorAll('[data-info-slot]')) {
      slot.innerHTML = infoButton(slot.dataset.infoSlot);
    }

    document.addEventListener('click', (event) => {
      const btn = event.target.closest('.info-btn');
      if (btn) {
        if (btn === this.btn) this.close();
        else this.open(btn);
      }
    });

    // Anywhere outside the popover and its button closes it.
    document.addEventListener('pointerdown', (event) => {
      if (!this.btn) return;
      if (this.pop.contains(event.target) || this.btn.contains(event.target)) return;
      if (event.target.closest('.info-btn')) return; // another one: the click opens it
      this.close();
    }, true);

    // Captured first, so Esc closes only the popover and not the sheet under it.
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.btn) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close({ focus: true });
    }, true);

    // Leaving with the keyboard closes it too.
    document.addEventListener('focusin', (event) => {
      if (this.btn && event.target !== this.btn && !this.pop.contains(event.target)) this.close();
    });

    const follow = () => this.btn && this.place();
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', follow);
  },

  open(btn) {
    const html = this.content[btn.dataset.info];
    if (!html) return;
    this.close();
    this.btn = btn;
    btn.setAttribute('aria-expanded', 'true');
    this.pop.innerHTML = html();
    this.pop.hidden = false;
    this.place();
  },

  close({ focus = false } = {}) {
    if (!this.btn) return;
    const btn = this.btn;
    this.btn = null;
    btn.setAttribute('aria-expanded', 'false');
    this.pop.hidden = true;
    if (focus && btn.isConnected) btn.focus();
  },

  /** Under the button, centred on it and kept on screen; above it when there is no room below. */
  place() {
    if (!this.btn.isConnected) {
      this.close();
      return;
    }
    const r = this.btn.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const w = this.pop.offsetWidth;
    const h = this.pop.offsetHeight;
    const left = Math.min(
      Math.max(margin, r.left + r.width / 2 - w / 2),
      window.innerWidth - w - margin,
    );
    const below = r.bottom + gap;
    const top = below + h > window.innerHeight - margin && r.top - gap - h > margin
      ? r.top - gap - h
      : below;
    this.pop.style.left = `${Math.round(left)}px`;
    this.pop.style.top = `${Math.round(top)}px`;
  },
};

Info.init();
