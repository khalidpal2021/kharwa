/* ===========================================================================
   lazy.js — each tab's code, loaded the first time the tab is opened.

   At startup only the Prayer tab's code runs. The Quran, Hadith, Us and Learn
   tabs are in the nav from the start (their entries are here), and the first
   visit loads their scripts in order; the tab's own file hands over its
   real show() through Sections.provide, and it is called once all are in. The Arabic fonts only those tabs use
   (Amiri, Noto Nastaliq Urdu) come with the first of them.

   Lazy.need(bundle) is also how the Prayer tab and Settings reach code from
   these tabs: the ayah sheet ("Read in context") and the test-notification
   sheet.

   Depends on router.js and, at run time, data.js and app.js (State).
   =========================================================================== */

/* The scripts each part needs, in the order they must run. Sharing an ayah
   or a hadith, and "Ayahs for the moment", need the Quran and Us code
   together, so they travel as one. */
const LAZY_SHARE = ['js/quran.js', 'js/ayah-sheet.js', 'js/us-presets.js', 'js/us.js'];
const LAZY_BUNDLES = {
  share: LAZY_SHARE,
  quran: LAZY_SHARE,
  us: LAZY_SHARE,
  hadith: [...LAZY_SHARE, 'js/hadith.js'],
  learn: ['js/quran.js', 'js/learn-content.js', 'js/learn-audio.js', 'js/learn.js'],
};

const LAZY_FONTS = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Nastaliq+Urdu&display=swap';

const Lazy = {
  scripts: new Map(),   // src -> promise of it having run

  script(src) {
    if (!this.scripts.has(src)) {
      this.scripts.set(src, new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = src;
        tag.async = false;
        tag.onload = () => resolve();
        tag.onerror = () => { this.scripts.delete(src); reject(new Error(`Could not load ${src}`)); };
        document.body.appendChild(tag);
      }));
    }
    return this.scripts.get(src);
  },

  fonts() {
    if (this.fontsAdded) return;
    this.fontsAdded = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LAZY_FONTS;
    document.head.appendChild(link);
  },

  /** Loads a bundle's scripts, one after another; resolves once all have run. */
  async need(bundle) {
    this.fonts();
    for (const src of LAZY_BUNDLES[bundle]) await this.script(src);
  },
};

/* The tabs whose code loads later, as the nav shows them. */
const LAZY_SECTIONS = [
  {
    id: 'quran',
    label: 'Quran',
    order: 2,
    bundle: 'quran',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
    <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M12 6.5v13" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </svg>`,
  },
  {
    id: 'hadith',
    label: 'Hadith',
    order: 3,
    bundle: 'hadith',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
    <path d="M6.5 3.5h11v17h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M8.5 8h6M8.5 11.5h6M8.5 15h4" fill="none" stroke="currentColor" stroke-width="1.6"
          stroke-linecap="round"/>
  </svg>`,
  },
  {
    id: 'us',
    label: 'Us',
    order: 3.5,
    bundle: 'us',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
    <path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7.5 2.4c0 5.4-7.5 10-7.5 10z"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`,
  },
  {
    id: 'learn',
    label: 'Learn',
    order: 4,
    bundle: 'learn',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
    <path d="M12 4.2 2.6 9 12 13.8 21.4 9 12 4.2z" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M6.8 11.3v4.4c0 1.3 2.3 2.4 5.2 2.4s5.2-1.1 5.2-2.4v-4.4"
          fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M21.4 9v4.6" fill="none" stroke="currentColor" stroke-width="1.6"
          stroke-linecap="round"/>
  </svg>`,
    enabled: () => Data.showsLearn(State.me),
  },
];

for (const entry of LAZY_SECTIONS) {
  Sections.register({
    ...entry,
    root: document.getElementById(`section-${entry.id}`),
    // Its whole bundle first (at once, after the first visit), then the
    // real show() its file handed over, if the tab is still the one open.
    show(params) {
      Lazy.need(entry.bundle).then(() => {
        if (Sections.current === entry.id) this.real?.(params);
      }, () => {
        toast('That tab could not be loaded. Check your connection and try again.', { error: true });
      });
    },
  });
}
