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

`--accent` (#B8860B) on ivory is 3.16:1. That clears WCAG AA for UI components
and large text, but not the 4.5:1 required for small text. Small gold text —
the mono labels — therefore uses `--accent-text` (#8A6508, 5.2:1). Gold as a
fill, rule, mark or large numeral still uses `--accent`.

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
- **Buttons** — primary is gold with white text, lighter gold on hover. Ghost is
  muted text that darkens on hover and gains a gold underline at 4px offset.
  44px minimum tap height.

## Prayer status marks

Gold and gray only, and distinguishable without colour — each state differs in
shape or fill, not just hue.

| Status     | Mark                                           |
| ---------- | ---------------------------------------------- |
| On time    | filled gold circle with a white checkmark      |
| Late       | gold outline with a half fill                  |
| Missed     | warm gray circle with a thin strike-through    |
| Not logged | empty thin-bordered circle, no text            |

## Desktop layout (≥ 900px)

Max width ~1200px, centered. Today's view fits a laptop screen without
scrolling.

1. **Masthead** — "Kharwa" wordmark in Playfair on the left; the Gregorian date
   with the Hijri date beneath it as a small-caps line; a settings ghost button
   on the right. A thin rule underneath.
2. **Next prayer** — the prayer name in large Playfair with "in 1h 12m" beside
   it. Under it, a thin horizontal rule-line timeline with the five prayers
   evenly spaced and a small gold marker showing where we are in the day.
3. **Two columns**, asymmetric at about 1.3fr / 0.7fr:
   - **Left — Today**, styled like a printed timetable. Section label "TODAY"
     with ‹ › day navigation. One row per prayer: English name in Playfair,
     Arabic name in small muted text, the time, then Khalid's mark and Marwa's
     mark under small-caps column headings. Thin rules between rows, no boxed
     cards. A small "Times from Islamic Society of Tracy" note at the bottom.
   - **Right — This Week**. For each person: their name, their current streak as
     a large Playfair number with a small "day streak" label, and seven small
     5-segment bars (one segment per prayer; gold when prayed, gray when missed,
     nearly invisible when not logged). Clicking a day jumps Today to that date.
4. Hovering or focusing your own mark shows a small menu: On time / Late /
   Missed / Clear. The other person's marks are read-only and must not look
   clickable.
5. **Keyboard** — ← → change day, T jumps to today.

## Mobile (< 900px)

The same style, stacked: masthead, next prayer, Today timetable, This Week.
Tap your own mark to cycle on time → late → missed → clear. 44px minimum tap
targets, no horizontal scrolling.

## "Who's this?" screen

Centered Kharwa wordmark, a Playfair "Who's this?", and two outline buttons for
Khalid and Marwa.
