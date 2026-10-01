# Kharwa design system

Editorial, timeless, warm, refined — like a well-made prayer journal or a
printed almanac. Classical restraint: serif typography, thin rule lines,
generous whitespace, one gold accent. Nothing loud, trendy, or dashboard-like.

## Colors

Defined as CSS custom properties at the top of `styles.css`. No colour is
hardcoded anywhere else in the stylesheet.

| Token                  | Value     | Use                               |
| ---------------------- | --------- | --------------------------------- |
| `--background`         | `#FAFAF8` | ivory page                        |
| `--foreground`         | `#1A1A1A` | rich black text                   |
| `--muted`              | `#F5F3F0` | quiet fills                       |
| `--muted-foreground`   | `#6B6B6B` | secondary text                    |
| `--accent`             | `#B8860B` | burnished gold                    |
| `--accent-secondary`   | `#D4A84B` | lighter gold, hover               |
| `--accent-foreground`  | `#FFFFFF` | on gold                           |
| `--border`             | `#E8E4DF` | rules and hairlines               |
| `--border-hover`       | `#D8D2CA` | slightly darker warm gray         |
| `--card`               | `#FFFFFF` | raised surfaces                   |
| `--ring`               | `#B8860B` | focus ring                        |

Two further tokens exist for accessibility and for the status marks:

| Token            | Value     | Use                                            |
| ---------------- | --------- | ---------------------------------------------- |
| `--accent-text`  | `#8A6508` | small gold text — see *Contrast* below          |
| `--mark-empty`   | `#8A857D` | the not-logged circle, so it clears 3:1 on ivory |

There is no dark night-sky background and no per-prayer sky colours. The
palette is ivory, rich black, warm gray and burnished gold only.

## Type

Loaded from Google Fonts with `font-display: swap`.

- **Display and headings** — "Playfair Display", Georgia, serif. Normal weight,
  tracking `-0.02em` on large display text and `-0.01em` on section heads,
  line-height 1.1–1.2.
- **Body and UI** — "Source Sans 3", system-ui, sans-serif. 15px body text,
  line-height 1.7, tracking `0.01em`; form fields stay at 16px or more so iOS
  doesn't zoom on focus. Buttons and nav use medium weight with
  `0.05em` tracking.
- **Labels** — "IBM Plex Mono", 11px, weight 500, uppercase, letter-spacing
  `0.15em`, in gold. Section labels follow the pattern: thin rule, label,
  thin rule.
- **Big numbers** — countdown and streaks are large Playfair display numerals.
- **Quranic Arabic** — "Amiri Quran", falling back to Amiri, Scheherazade New
  and Geeza Pro, used only for the Ayah of the Day.

### Contrast

`--accent` (#B8860B) on ivory measures 3.11:1. That clears WCAG AA for UI
components and large text, but not the 4.5:1 required for small text. Small gold
text — the mono labels — therefore uses `--accent-text` (#8A6508, 5.09:1). Gold
as a fill, rule, mark or large numeral still uses `--accent`.

White on gold is 3.25:1, which is enough for the checkmark inside the on-time
mark (a graphic needs 3:1) but not for button text. The primary button keeps
both specified golds and sets its label in `--foreground`: 5.35:1 at rest and
7.94:1 on hover.

## Surfaces and effects

- **Radii** — buttons and inputs 6px, cards 8px.
- **Borders** — 1px solid `var(--border)`. Thin horizontal rules carry the
  structure instead of boxes wherever possible.
- **Shadows** — `sm: 0 1px 2px rgba(26,26,26,0.04)`,
  `md: 0 4px 12px rgba(26,26,26,0.06)`. Used sparingly.
- **Texture** — a very faint paper-noise overlay over the page, and one large
  blurred gold glow at about 2% opacity for warmth.
- **Motion** — transitions 150–200ms ease-out. No bounce, and no lift or
  translate on hover. Hover is a subtle shadow, border or colour shift.
  `prefers-reduced-motion` is respected.
- **Focus** — 2px gold ring at 2px offset, always visible.
- **Tapping** — the arrows, the date and the prayer marks set `user-select: none`
  and a transparent tap highlight, so tapping them does not flash grey or select
  text on a phone.
- **Buttons** — primary is gold, lighter gold on hover, with a rich-black label
  for contrast (see *Contrast*). Ghost is
  muted text that darkens on hover and gains a gold underline at 4px offset.
  44px minimum tap height.

## Cards

Each section sits on its own card: white on the ivory page, 1px `--border`,
8px radius, `--shadow-sm`, and 32px of padding on desktop, 20px on a phone.
Cards are separated by 40px on desktop and 24px on a phone. The masthead is not
a card — it sits directly on the page background.

The Next Prayer card is the featured one and carries a 2px gold top border.

Every card opens with the same header: a centred small-caps gold label with a
thin rule running out to each edge, spanning the full card width. A three-column
grid — `1fr auto 1fr` — keeps the label centred whatever its length.

## Prayer status marks

Gold and gray only, and distinguishable without colour — each state differs in
shape or fill, not just hue.

| Status     | Mark                                           |
| ---------- | ---------------------------------------------- |
| On time    | filled gold circle with a white checkmark      |
| Late       | gold circle, half filled                       |
| Missed     | warm gray circle with a ✕                      |
| Not logged | empty thin-bordered circle, no text            |

Only *on time* and *late* are ever stored. A late prayer is a prayer prayed:
it reads gold and counts exactly like an on-time one in streaks and the week
bars. *Missed* is never chosen or stored. A prayer shows as missed when it is
still empty after its window has closed:

- Fajr, Dhuhr, Asr and Maghrib when the next prayer's time arrives;
- Isha when the next day's Fajr arrives;
- so every empty prayer on a past day, apart from last night's Isha before
  this morning's Fajr.

A missed prayer can still be tapped and logged as on time or late. Older rows
stored as `missed` are read as empty, so they show as missed in the same way.

In the week bars: gold for prayed (on time or late), warm gray
(`--mark-empty`) for missed, and a light `--border-hover` outline for a prayer
whose window is still open. A one-line legend under the timetable,
"✓ on time · ◐ late · ✕ missed", is drawn with the marks themselves in small
muted text.

## Desktop layout (≥ 900px)

Content is capped at 1160px wide and centred. The page is only as tall as its
content: the rows keep a fixed height instead of stretching to fill the
screen. The few sizes that still use `clamp()` grow slightly with the window
and stop by about 1440px, so 1920px and 2560px look the same as a laptop,
just with more margin, rather than magnified.

The scale is deliberately compact. Body text is 15px, prayer names 17–19px,
the next-prayer name 40–52px (36–46px on a phone), and the status circles 22px
on a phone and 24px on desktop. Each circle sits in a 44px tap area, which also
sets the row height. On a 390x844 iPhone the next-prayer card and all five
Today rows fit on the first screen. At 1366x768 the whole view is about 40px
taller than the window; at 1920x1080 it fits with room to spare.

1. **Masthead** — "Kharwa" wordmark in Playfair on the left, then the section
   tabs (Prayer, Quran) in quiet sans, the current one in ink with a gold
   underline resting on the masthead rule; the Gregorian date with the Hijri
   date beneath it as a small-caps line; a settings ghost button on the right.
   A thin rule underneath. Not a card. The masthead is shared by every section;
   what follows is the Prayer section.
2. **Next prayer card** — full width, featured. The prayer name in large
   Playfair, the countdown beneath it and the clock time beneath that, all
   centred; then the rule-line timeline with the five prayers evenly spaced and
   a small gold marker showing where we are in the day.
3. **Two cards side by side**, asymmetric at about 1.3fr / 0.7fr and equal in
   height:
   - **Left — Today**, styled like a printed timetable. Under the card header
     sits one centred row: a ‹ arrow, the full date, a › arrow. The arrows are
     44px round ghost buttons and never move — the date label is sized by a
     hidden copy of the longest date it can hold and uses tabular figures. The
     header label says which day you are on (TODAY, YESTERDAY, TOMORROW or PAST
     DAY) and a centred "Back to today" link appears below the date when you are
     away from today, its space always reserved. Then one row per prayer: the
     name in Playfair, the time, then Khalid's mark and Marwa's mark under
     small, quiet column headings. The time needs no heading, and its column is
     only as wide as "12:45 PM", so the spare width goes to the prayer names.
     The headings and the columns share one set of explicit widths, so they
     line up exactly. Thin rules between rows.
   - **Right — This Week**. For each person: their name, their current streak as
     a large Playfair number with a small "day streak" label, and seven small
     5-segment bars (one segment per prayer). Clicking a day jumps Today to that
     date.
4. **Ayah of the Day** — full width under the two cards, same card style, with
   an AYAH OF THE DAY header. The Arabic (Uthmani) is centred, right-to-left,
   in Amiri Quran at a generous line height. Beneath it, the Sahih
   International translation is in Playfair italic, kept to a readable measure.
   The reference ("AL-HASHR · 59:10") sits at the bottom in small-caps Plex
   Mono, muted. `js/ayat.js` holds only references. The text always comes from
   the Al-Quran Cloud API and is never written into the code. Everyone sees the
   same ayah on a given date, cached in `localStorage` for the day. If it
   can't be fetched and nothing is cached, the card stays hidden.
5. Hovering or focusing your own mark shows a small menu: On time / Late /
   Clear. The other person's marks are read-only and must not look
   clickable.
6. **Keyboard** — ← → change day, T jumps to today.

## Sections and navigation

The app is a set of sections behind hash routes (`#/prayer`, the default, and
`#/quran`), drawn from one registry in `js/router.js`. On desktop the tabs sit
in the masthead; on a phone a bottom tab bar (50px plus the iPhone safe area,
white with a hairline top border) shows each section's line icon and label, the
current one in dark gold. A new section is one module and its markup; both
navs pick it up.

## Quran

Calm and spacious, like a printed mushaf. All Arabic and translation text comes
from the Al-Quran Cloud API and is never written into the code.

- **Surah list** — a featured *Continue reading* card ("Al-Kahf · ayah 24" in
  Playfair, linking straight there), with a quieter line beneath for where the
  other person is reading. Then *Bookmarks* (when there are any), then
  *Surahs*: a search box (name, meaning or number, forgiving of transliteration)
  over all 114, each row with its number in a small gold diamond, the English
  name in Playfair, the meaning, "MECCAN · 110 AYAT" in small caps, and the
  Arabic name on the right in Amiri Quran. Two columns on desktop.
- **Reader** — one centred page, at most 820px wide. The surah header is a
  cartouche framed in a double gold rule: "SURAH 18", the Arabic name large,
  the English name in Playfair, the meaning in italic, and "MECCAN · 110 AYAT".
  Below it, small chips for Arabic size (S / M / L), Translation and Arabic
  only, saved per device, and a one-line hint. The basmala is centred above
  every surah except Al-Fatihah, where it is ayah 1, and At-Tawbah, which has
  none. It is taken from Al-Fatihah 1:1 and split from the start of ayah 1 as
  the API gives it, and only when it is found there. Each ayah is the Arabic
  right-aligned in Amiri Quran (26/31px, line-height 2.15) ending in an
  ornamental number: an eight-point gold star with the Arabic-Indic numeral
  inside. The Sahih International translation sits beneath in the body font,
  with a small gold ayah number, and thin rules separate the ayat. *Arabic only*
  flows the ayat together as one right-aligned page. Previous and next surah
  links close the page.
- **Bookmarks** — tap an ayah's number star. A bookmarked star fills with pale
  gold. Bookmarks and the reading position (the topmost ayah in a band across
  the upper screen, saved 1.5s after it settles) are kept per person in
  Supabase; the position is also kept on the device, and the newer copy wins.

## Mobile (< 900px)

The same style, with the cards stacked: masthead, Next prayer, Today, This
Week, Ayah of the Day, and the tab bar fixed at the bottom. With Safari's own
toolbars on a 390px iPhone, the next-prayer card and all five Today rows still
end above the tab bar.
The masthead is the wordmark with a gear on the right and the Gregorian and
Hijri dates on one quiet line beneath. The timeline is dropped, since the
timetable already lists the times. Tap your own mark to cycle empty → on time →
late → empty. 44px minimum tap targets, no horizontal scrolling.

Spacing follows one rhythm throughout, as the tokens `--s1` 8px, `--s2` 14px,
`--s3` 20px and `--s4` 32px.

## "Who's this?" screen

Centered Kharwa wordmark, a Playfair "Who's this?", and two outline buttons for
Khalid and Marwa.
