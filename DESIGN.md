# DESIGN.md — Renew Subastas

Canonical source: the transactional email system (`functions/src/lib/email-templates.ts`). All surfaces match it.

## Color (OKLCH, tinted neutrals — never pure #000/#fff)

Strategy: **Restrained**. Ink + warm-neutral paper; one semantic accent per status only.

- Ink (headers, CTAs, primary text): `#0a0a0a` → `oklch(0.15 0.004 286)`
- Paper (deck background): `#e9e9eb` → `oklch(0.93 0.002 286)`
- Card / panel: `#ffffff` → `oklch(0.995 0.001 286)`
- Soft surface (footers, tiles): `#f5f5f5` / `#fafafa`
- Text secondary: `#52525b` · muted: `#71717a` · faint: `#a1a1aa`
- Hairline: `#e4e4e7` / `#f0f0f0`

Semantic status (badges, callouts — fg on bg):

- success `#166534` on `#dcfce7` · danger `#991b1b` on `#fee2e2`
- warning `#92400e` on `#fef3c7` · info `#1e40af` on `#dbeafe` · neutral `#fafafa` on `#27272a`

## Typography

System sans stack: `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.

- Display / H1: weight 800, letter-spacing -0.4px, line-height 1.15
- Eyebrow / section label: 11–12px, weight 700, UPPERCASE, letter-spacing 0.6px, muted
- Body: 15–17px, line-height 1.55, secondary color; cap ~70ch
- Stat value: 800 weight, -0.3px tracking
- Scale ratio ≥1.25 between steps.

## Shape & Elevation

- Radius: cards 18px · tiles/callouts 12px · pills 999px · buttons 11px
- Borders are full hairlines, never side-stripes. Flat or one soft shadow; no glass.

## Components (from email system, reused in decks)

- **badge(tone)** — uppercase status pill
- **statPair** — two tiles; `strong` variant = ink-filled (white text)
- **sectionLabel** — small uppercase divider
- **dataRows** — key/value table, empty = "—"
- **callout(tone)** — tinted box for warnings/notes
- **ctaButton** — ink-filled pill

## Motion

Ease-out (quart/quint), 200–400ms. No bounce. Slide transitions subtle (fade/slide). Never animate layout props.

## Deck-specific

- Wordmark: white on ink covers, black on paper slides. Square `RS` mark for accents.
- 16:9. One idea per slide. Numbered step flows for manuals. Status always shown via badge.
- Bans (enforced): no gradient text, no side-stripe accents, no glassmorphism, no hero-metric template, no identical card grids, no em dashes.
