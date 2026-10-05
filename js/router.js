/* ===========================================================================
   router.js — the app's sections and hash routing.

   Each section is a module that calls Sections.register() with:
     id     — the first hash segment: #/prayer, #/quran, ...
     label  — the nav label
     order  — position in the nav (the lowest is the default section)
     icon   — inline SVG markup for the mobile tab bar
     root   — the section's element, shown only while it is active
     show(params) — called on every visit; params are the remaining hash
                    segments, e.g. #/quran/2/255 -> ['2', '255']
     enabled()    — optional; when it returns false the section leaves both
                    navs, and its URLs fall back to the default section
   Both navs (masthead tabs on desktop, the bottom tab bar on a phone) are
   drawn from this list, so a new section needs no other wiring.
   =========================================================================== */

const Sections = {
  list: [],
  current: null,

  register(section) {
    this.list.push(section);
    this.list.sort((a, b) => a.order - b.order);
  },

  /** The sections this person can see, in nav order. */
  visible() {
    return this.list.filter((s) => !s.enabled || s.enabled());
  },

  /** Redraw the navs and re-route, only if an enabled() answer has changed. */
  refresh() {
    if (!this.started) return;
    const ids = this.visible().map((s) => s.id).join(',');
    if (ids === this.navIds) return;
    this.renderNav();
    this.route();
  },

  /** "#/quran/2/255" -> ['quran', '2', '255'] */
  parse(hash) {
    return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  },

  start() {
    if (this.started) return;
    this.started = true;
    this.renderNav();
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  route() {
    let [id, ...params] = this.parse(location.hash);
    const visible = this.visible();
    let section = visible.find((s) => s.id === id);
    if (!section) {
      section = visible[0];
      params = [];
      history.replaceState(null, '', `#/${section.id}`);
    }

    const changed = this.current !== section.id;
    for (const s of this.list) s.root.hidden = s !== section;
    this.current = section.id;

    for (const link of document.querySelectorAll('.navtab')) {
      if (link.dataset.section === section.id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    if (changed) window.scrollTo(0, 0);
    section.show(params);
  },

  renderNav() {
    const item = (s, withIcon) => `
      <a class="navtab" href="#/${s.id}" data-section="${s.id}">
        ${withIcon ? `<span class="navtab-icon" aria-hidden="true">${s.icon}</span>` : ''}
        <span class="navtab-label">${s.label}</span>
      </a>`;
    const visible = this.visible();
    this.navIds = visible.map((s) => s.id).join(',');
    document.getElementById('nav-top').innerHTML = visible.map((s) => item(s, false)).join('');
    document.getElementById('nav-bottom').innerHTML = visible.map((s) => item(s, true)).join('');
  },
};
