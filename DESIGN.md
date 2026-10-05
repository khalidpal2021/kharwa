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
it reads gold and counts exactly like an on-time one on the streaks card. *Missed* is never chosen or stored. A prayer shows as missed when it is
still empty after its window has closed:

- Fajr, Dhuhr, Asr and Maghrib when the next prayer's time arrives;
- Isha when the next day's Fajr arrives;
- so every empty prayer on a past day, apart from last night's Isha before
  this morning's Fajr.

A missed prayer can still be tapped and logged as on time or late. Older rows
stored as `missed` are read as empty, so they show as missed in the same way.

A one-line legend under the timetable,
"✓ on time · ◐ late · ✕ missed", is drawn with the marks themselves in small
muted text.

## Streaks

A day is complete for a person when all five prayers are prayed — on time and
late count the same. Only a missed prayer is negative, and because missed is
derived rather than stored, the streak asks `shownStatus`, not the log.

- **Personal streak** — consecutive complete days.
- **Duo streak** — consecutive days both of them completed.
- A today still in progress never breaks a run: it is stepped over until it is
  complete, and breaks the run only once a prayer there has gone missed.
- **Best** runs, for the pair and for each person, are the longest stretch
  anywhere in the loaded history, computed in the browser from the logs — no
  extra table — so they reach back as far as the 120-day window the app loads.

### The streaks card

Three figures across the top, in equal columns divided by hairlines: Together,
then each of us. Each is a Playfair numeral over a small-caps mono label, all
the same size — Together's numeral and label are gold, the others are plain
foreground over muted. The best duo run is still tracked, and still flashes the
Together numeral once when it is beaten, but it is no longer printed.

Below a rule, a square per prayer per day. The weekday labels appear once, above
both people, with today's in gold; each person then gets their name and a 5x7
grid, prayers labelled F D A M I down the left. The header and both grids are
one CSS grid, so every column lines up with the one above it.

| Square | Meaning |
| ------ | ------- |
| solid gold | prayed, on time or late |
| solid warm gray (`--mark-empty`) | missed |
| thin outline | not yet due, or today still going |

Squares are 11px with a 3px radius, 9px on a phone. The grid is capped and
centred rather than stretched across the card: at full width the columns sat
about 57px apart against 2px between rows, which read as stripes rather than a
grid. Capped, the pitch is about 34px across to 22px down, close enough to read
as even.

Clicking any square moves the Today table to its date, and each carries its own
tooltip and accessible name: "Khalid · Fajr · Thu, Oct 1 · missed". A small
centred legend closes the card, and "You both completed today." sits under it
when it applies.

## Qada

A card under Today, with the same header: QADA between two rules.

- **What is owed** — every prayer that shows as missed (the same `shownStatus`
  rule), counted from the person's qada start: the date of their first log
  unless they set another in Settings. Making one up is logging it as late,
  which takes it off and also counts for streaks. On top of that, a hand-entered
  backlog from before Kharwa (`qada_backlog`), per prayer, Witr included.
- **The card** — the total as a Playfair numeral over a small-caps "TO MAKE UP",
  then a mono row of counts per prayer, "F 1 · D 0 · A 2 · M 0 · I 1", zeros
  muted, W added when there is a Witr backlog. Then the five most recent
  missed prayers, oldest first ("Dhuhr · Thu, Oct 1"), each with a small
  gold-outlined *Made up* button, and one row per backlog prayer with
  *−1 Made up*. The other person's total sits in a quiet line beneath, read
  only. With nothing owed it says "All caught up." A small muted Hanafi note
  closes the card.
- On desktop it sits under Today in the right-hand column.

## Desktop layout (≥ 900px)

Content is capped at 1200px wide and centred. The page is only as tall as its
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
   a small gold marker showing where we are in the day. The whole card always
   shows the real today, whatever day the tracker is on; after Isha it counts
   down to tomorrow's Fajr.
3. **Two columns** at about 0.85fr / 1.15fr, each card only as tall as its
   content. The left column holds the Ayah of the Day with Streaks directly
   under it; the right holds Today. On a 1920x1080 screen the page fits without
   scrolling for short and median ayat. With Today's compact header, the left
   column runs about 110–220px longer, depending on the ayah's length.
   - **Right — Today**, styled like a printed timetable. It has no separate
     card label: its header is one compact row on the timetable's own grid.
     On the left is a small day selector, ‹ Fri, Oct 2 ›, in the body font at
     0.9rem with tabular figures. On the right are the KHALID and MARWA
     headings, exactly over their marks. The date label is as wide as the
     widest date it can show: a hidden stack of every weekday and month in the
     browser's locale shares its grid cell, so the arrows never shift. The
     arrows are small (30px wide) with 44px tap areas. Away from today, a quiet
     text link, "Back to today", appears right after the › arrow: 0.8rem,
     muted, with no pill or background, darkening to ink with a thin gold
     underline (offset 4px) on hover or focus. Its space is always kept, so
     nothing moves. Where the full text would not fit on the row (measured,
     since the date's width depends on the locale), it reads "Today". On narrow phones the selector text
     shrinks (down to 11px at 320px) rather than wrapping. A thin rule closes
     the row. Then one row per prayer: the
     name in Playfair, the time, then Khalid's mark and Marwa's mark under
     small, quiet column headings. The time needs no heading, and its column is
     only as wide as "12:45 PM", so the spare width goes to the prayer names.
     The headings and the columns share one set of explicit widths, so they
     line up exactly. Thin rules between rows.
   - **Left, below — Streaks**. Three streak figures across the top, then a
     square per prayer per day for the last seven days, a grid each under a
     shared row of weekday labels. A new duo best is highlighted once in
     lighter gold.
4. **Ayah of the Day** — top of the left column, like an illuminated page in a
   fine mushaf. Warm paper (`--card-warm`) and a fine gold hairline rule just
   inside the card border, kept restrained. Under the AYAH OF THE DAY header, a
   small thin-gold eight-pointed star between two short rules. The Arabic
   (Uthmani) is centred, right-to-left, in Amiri Quran at 1.6rem, line-height
   2.1, in rich black. Then a short gold divider and the Sahih International
   translation, centred in Playfair italic, muted, 1.05rem, at most 36ch wide.
   The reference ("AL-HASHR · 59:10") follows in gold small caps, then a quiet
   ghost link, "Read in context →", to the ayah in the Quran reader
   (`#/quran/{surah}/{ayah}`). `js/ayat.js` holds only references, kept to ayat
   whose translation is 250 characters or less so the card stays compact. The text always comes from
   the Al-Quran Cloud API and is never written into the code. Everyone sees the
   same ayah on a given date, cached in `localStorage` for the day. If it
   can't be fetched and nothing is cached, the card stays hidden.
5. Hovering or focusing your own mark shows a small menu: On time / Late /
   Clear. The other person's marks are read-only and must not look
   clickable.
6. **Keyboard** — ← → change day, T jumps to today.

## Sections and navigation

The app is a set of sections behind hash routes (`#/prayer`, the default,
`#/quran` and `#/hadith`), drawn from one registry in `js/router.js`. On desktop the tabs sit
in the masthead; on a phone a bottom tab bar (50px plus the iPhone safe area,
white with a hairline top border) shows each section's line icon and label, the
current one in dark gold. A new section is one module and its markup; both
navs pick it up.

## Quran

Calm and spacious, like a printed mushaf. All Arabic and translation text comes
from the Al-Quran Cloud API and is never written into the code.

- **Surah list** — a featured *Continue reading* card ("Al-Kahf · ayah 24" in
  Playfair, linking straight there), with a quieter line beneath for where the
  other person is reading. Then one card with three tabs in gold small caps,
  the current one underlined in gold: *Surahs*, *Juz*, *Bookmarks*.
  - *Surahs*: a search box (name, meaning or number, forgiving of
    transliteration) over all 114. Each row has its number in a small gold
    diamond, the English name in Playfair, the meaning, "MECCAN · 110 AYAT" in
    small caps, and the Arabic name on the right in Amiri Quran. The surah
    you're reading carries a small gold-outlined *Reading* tag. One column on
    a phone, two on desktop.

    The search box is quiet: a light `--border`, 44px tall on a phone and
    40px on desktop, a small muted magnifier on the left, and the placeholder
    "Search surah, 2:255, or a word" in muted text at 60% opacity, 400 weight,
    0.9rem. Typed text stays ink at 16px, so iOS doesn't zoom. On focus the
    border turns gold with a soft 2px gold ring; the browser's clear button is
    a small muted ×. It also reads ayah
    references, in any common form and with surah names matched loosely
    (case, "al-", hyphens, apostrophes and diacritics ignored). A valid one
    shows a single *Go to* card above the list, framed in gold on warm paper:
    "GO TO", the surah name in Playfair, the reference in gold small caps, and
    a one-line preview of the translation, fetched once typing settles and
    then cached. Enter or a tap opens the reader there. An ayah number past the
    end shows a plain line instead ("Al-Baqara has 286 ayat"). When nothing
    matches, a dashed button offers "Search the translation for 'patience'".
    Its results (count, then up to 50 ayat, each with its reference in gold
    small caps and the translation with the word marked in pale gold) replace
    it, with "Searching…" and "No ayat found" states.
  - *Juz*: the 30 juz in the same row style, "Juz 2 · Starts at Al-Baqara ·
    ayah 142", each opening the reader at that ayah.
  - *Bookmarks*: newest first. Each row leads with a small filled gold star,
    which also removes it, then the surah name, "AYAH 10", and the first line
    of its translation (truncated, muted).
- **Reader** — one centred page, at most 820px wide. The surah header is a
  cartouche framed in a double gold rule: "SURAH 18", the Arabic name large,
  the English name in Playfair, the meaning in italic, and "MECCAN · 110 AYAT".
  Then the **options bar**, sticky at the top of the reader
  while scrolling. It runs the page's full width between hairlines, with the
  surah's name on the left. Desktop shows the options inline: S / M / L, three
  independent toggles (Arabic, Transliteration, Translation), and a translation
  picker (Sahih International, Muhammad Asad, Pickthall, Urdu - Jalandhry). On a
  phone they fold behind a small "Aa" button into a panel, the toggles stacked.
  Any mix of layers is allowed, but the last one on can't be turned off. Sizes
  scale the Arabic fully (22/26/31px on a phone, 26/31/37 on desktop) and the
  other layers gently (14/15/16.5). All choices are saved per device.

  The basmala is centred above every surah except Al-Fatihah, where it is ayah
  1, and At-Tawbah, which has none, in each layer that is on. Only the Uthmani
  text carries it inside ayah 1, so it is split from there, taken from
  Al-Fatihah 1:1, and only when it is found. Each ayah is the Arabic
  right-aligned in Amiri Quran (line-height 2.15) ending in an ornamental
  number: an eight-point gold star with the Arabic-Indic numeral inside. Then
  the transliteration in muted italic, then the translation in the body font
  with a small gold ayah number. Urdu runs right to left in Noto Nastaliq Urdu
  with extra line height. With Arabic off, the star number leads the first line
  shown instead, so every ayah stays numbered. Thin rules separate the ayat;
  previous and next surah links close the page. Jumping to an ayah (or a
  range, `#/quran/2/255-257`) scrolls it into view and lights it pale gold,
  which then fades over about two seconds.
- **Bookmarks** — the eight-pointed star that numbers each ayah is the
  bookmark button. Not bookmarked: a thin gold outline with the numeral in
  gold. Bookmarked: solid gold with the numeral in ivory, filling in over
  150ms (instant under prefers-reduced-motion). On desktop, hovering darkens
  the outline slightly. The tap area is 44px; aria-pressed follows the state,
  and the label reads "Bookmark ayah 2:255" or "Remove bookmark". A toast
  confirms: "Bookmarked Al-Baqara 2:255" or "Bookmark removed". With Arabic
  off, the star leads the first line shown, floated so the line spacing stays
  even, so every ayah can still be bookmarked. Under the options bar, a short
  muted hint, "Tap ✦ to bookmark", shows until the first bookmark is saved on
  the device, or whenever there are none yet.

  Bookmarks and the reading position (the topmost ayah in a band across the
  upper screen, saved 1.5s after it settles) are kept per person in Supabase;
  the position is also kept on the device, and the newer copy wins.

## Hadith

The same calm reader as the Quran, and the same pieces: the *Continue reading*
card with the other person's quieter line, *Bookmarks*, the search box, chips,
the framed header and the previous/next pager. All hadith text and grades come
from the hadith API and are never written into the code.

- **Collections** — each row has the name in Playfair, the compiler beneath in
  muted text, and the count ("7,589 HADITH") in small caps on the right. Two
  columns on desktop. The forties have a single chapter and open straight to
  their hadith.
- **Chapters** — the collection's name, compiler and size, a search box over
  chapter titles, then each chapter with its number in the gold diamond, its
  English title in Playfair, and its range ("1–7") in small caps.
- **Reader** — the framed header reads "SAHIH AL-BUKHARI · CHAPTER 1", the
  chapter title in Playfair, and "HADITH 1–7 · 7 HADITH". An Arabic chip
  (saved per device) and a one-line hint follow. Each hadith has its number in
  gold small caps, with a bookmark outline on the right that fills with gold
  when saved. Then the Arabic, right-aligned in Amiri (21/24px, line-height
  2.05), the English beneath in the body font, and the grades as small muted
  pill tags, "Hasan Sahih · Al-Albani", exactly as the API gives them.
  Bukhari and Muslim, which the API leaves ungraded, show "Sahih". Thin rules
  separate the hadith; previous and next chapter links close the page.

## Learn

A guide to praying, Hanafi throughout since ISOT is Hanafi, with a short note
where another school commonly differs. The section opens with one line: a
learning guide, check with your local imam.

Five sub-tabs rather than one long page: Basics, Wudu, Steps, Prayers and
Practice. The labels are kept short on purpose — all five measure 253px together
at 10px with 0.08em tracking, so they fit a 390px phone with room to spare and
still fit at 320px. The bar sits at the top of the section in small-caps mono,
styled like the main navigation, with a gold underline under the active tab and
a thin rule beneath. It is sticky once the masthead scrolls away. If the labels
ever do outgrow the screen it scrolls sideways rather than wrapping, with the
scrollbar hidden and a soft fade on the right edge that appears only while there
is more to reach.

Each sub-tab is its own hash route — `#/learn/wudu`, `#/learn/steps` — so the
back button works and a link can open one directly. `LEARN_ALIASES` keeps the
older `positions` and `pray-along` routes working. The last one visited is
remembered in `localStorage`, and a bare `#/learn` reopens it. Each starts with a
one-line intro saying what it covers.

A sub-tab is one entry in `LEARN_TABS` — id, label, intro, render — and a render
method on `Learn`; the bar, the routing and the remembering all follow from the
list, so Surahs or Duas would be an entry and a method. Panels are built the
first time their tab is opened, which is also what keeps the six Qur'an requests
on the Positions tab from firing until someone goes there.

Where the words come from matters, and the split is deliberate:

- **Qur'an** is fetched from the same Al-Quran Cloud API the Quran tab uses,
  through `Quran.loadEditions`, so it shares that cache and nothing of the
  Qur'an is written into the source. Arabic, transliteration and Sahih
  International, with whole-surah audio from `cdn.islamic.network`; the play
  button hides itself if the audio will not load.
- **Everything else** — Thana, Taʿawwudh, the tasbīḥ of rukūʿ and sujūd,
  Tashahhud, Ṣalawāt, the duʿā before salām, Qunūt — is written out in
  `js/learn-content.js`, which carries a TO REVIEW WITH IMAM header listing
  exactly what wants checking. It is kept in one file for that reason.

Figures are inline SVG line drawings, side on, facing the qibla, no faces:
`--foreground` for the body, `--accent` for whichever part the step is about,
a hairline for the ground. One set, one style.

Practice lists the five prayers as compact rows in one card: the name in
Playfair, a row of small blocks showing the shape of the prayer — sunnah
outlined, fard filled, Witr hatched — the same thing in words, and a chevron,
with thin rules between. The next prayer due is lifted to the top under a small
gold Next tag. An Include sunnah toggle above the list, on by default and
remembered, drops the sunnah rakʿahs from both the blocks and the walk-through;
Witr stays, since it is wājib. Each prayer card on the Prayers tab also carries
a button straight into its own.

Either route opens the same full-screen dialog, built from the same position and
prayer data: one step at a time with a large figure, what to say, a progress bar,
and 54px Back and Next buttons. Fajr is 32 steps with the sunnah, 16 without.

Learn's tab icon is a graduation cap, so it is not mistaken for the Quran tab's
book. It asks for a screen wake lock and takes it again
when the tab comes back; every failure there is ignored. Arrow keys move
between steps and Escape closes it.


## Mobile (< 900px)

The same style, with the cards stacked: masthead, Next prayer, Today, Ayah of
the Day, Streaks, and the tab bar fixed at the bottom. (The markup is in this
order; desktop rearranges it with grid areas.) With Safari's own
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
