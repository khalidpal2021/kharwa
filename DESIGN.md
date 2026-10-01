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
- **Body and UI** — "Source Sans 3", system-ui, sans-serif. 16px minimum,
  line-height 1.75, tracking `0.01em`. Buttons and nav use medium weight with
  `0.05em` tracking.
- **Labels** — "IBM Plex Mono", 12px, weight 500, uppercase, letter-spacing
  `0.15em`, in gold. Section labels follow the pattern: thin rule, label,
  thin rule.
- **Big numbers** — countdown and streaks are large Playfair display numerals.

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
| Made up    | gold circle, half filled                       |
| Missed     | warm gray circle with a thin strike-through    |
| Not logged | empty thin-bordered circle, no text            |

A made-up prayer is a prayer prayed. It reads gold and positive, and counts
exactly like an on-time prayer in every summary — streaks and the week bars
alike. Only *missed* is negative. The stored value is still `late`; only the
label and the summary treatment changed.

In the week bars: gold for prayed (on time or made up), warm gray
(`--mark-empty`) for missed, and a light `--border-hover` outline for not
logged.

## Desktop layout (≥ 900px)

Max width 1920px, centered. The page is at least the viewport tall, so on a
large screen the two lower cards stretch and the prayer rows grow with them
rather than leaving dead space. Type and spacing scale with `clamp()` so 1920px
and 2560px look deliberate rather than magnified.

Note that the card padding and gaps cost height: at 1366x768 the view is about
150px taller than the viewport and scrolls, and about 85px at 1920x1080. The
prayer rows are already at their floor, the height of a 44px mark, so fitting a
short laptop screen again would mean smaller cards or smaller tap targets.

1. **Masthead** — "Kharwa" wordmark in Playfair on the left; the Gregorian date
   with the Hijri date beneath it as a small-caps line; a settings ghost button
   on the right. A thin rule underneath. Not a card.
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
4. Hovering or focusing your own mark shows a small menu: On time / Made up /
   Missed / Clear. The other person's marks are read-only and must not look
   clickable.
5. **Keyboard** — ← → change day, T jumps to today.

## Mobile (< 900px)

The same style, with the three cards stacked: masthead, Next prayer, Today,
This Week.
The masthead is the wordmark with a gear on the right and the Gregorian and
Hijri dates on one quiet line beneath. The timeline is dropped, since the
timetable already lists the times. Tap your own mark to cycle on time → made up
→ missed → clear. 44px minimum tap targets, no horizontal scrolling.

Spacing follows one rhythm throughout, as the tokens `--s1` 8px, `--s2` 16px,
`--s3` 24px and `--s4` 40px.

## "Who's this?" screen

Centered Kharwa wordmark, a Playfair "Who's this?", and two outline buttons for
Khalid and Marwa.
