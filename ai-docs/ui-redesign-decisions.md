# UI/UX Redesign — Design Decisions

Recorded after grilling session, May 2026. Ready for implementation.

---

## Q1 · Aesthetic direction
**C2 — Monospaced display + humanist sans body.**
Mono for the system's voice (nav, slugs, headers, metadata, numerals). Sans for the user's voice (item titles, body prose).

## Q2 · Typefaces
- **Mono:** JetBrains Mono, weight 400/500, ligatures off.
- **Sans:** Inter Tight, 13–14 px, weight 400/500 only.

## Q3 · Theme
**Both light and dark, with a persistent toggle** (system-preference default).
- Light base: `#FAFAF7` bg, `#111111` ink.
- Dark base: `#0E0E0E` bg, `#E8E8E8` ink.

## Q4 · Accent color
**B2 — Highlighter yellow**, used ruthlessly for single accent role only:
focused element, active board tab, valid drop-target border.
- Light: `#FFE94A`
- Dark: `#F5E663`
No other chromatic colors in the system.

## Q5 · Card / surface treatment
**B — Hairline-bordered tiles.**
- Border: 1 px, `#E6E4DD` light / `#262626` dark.
- Border-radius: 0 px.
- Shadow: none.
- Fill: transparent (card inherits page bg).
- Drop target state: border becomes 1.5 px yellow.

## Q6 · Top chrome
**A — Persistent hairline top bar (~36 px tall).**
- Left: product mark `awesome-markdown` in mono lowercase.
- Center: breadcrumb-as-path in mono, e.g. `boards / board-all` or `items / refactor-db`. Each segment is a link.
- Right: 6 px sync-status circle (clean / pulling / dirty) + theme toggle icon.
- Bottom of bar: 1 px hairline rule.

## Q7 · Column headers
**A — Mono uppercase + count, hairline below.**
- Format: `TODO · 3` — 11 px JetBrains Mono, uppercase, `letter-spacing: 0.08em`.
- No fill, no badge, no pill.
- 1 px hairline rule beneath the header row.

## Q8 · Item card content
Three-layer card:
1. **Title** — Inter Tight 14 px / 500, ink color, `line-height: 1.3`.
2. **Summary** — First non-empty, non-heading line of the markdown `body`, stripped of inline markdown, truncated to 2 lines with ellipsis. Inter Tight 12.5 px / 400, muted gray (`#6B6760` light / `#8A867E` dark).
3. **Tags row** — Only the `tags[]` frontmatter array, if present. Rendered as `TAG-A · TAG-B` in 10.5 px JetBrains Mono uppercase, letter-spaced, muted ink. No pills, no colors.
- Padding: 10 px vertical / 12 px horizontal.

## Q9 · Summary & tag sources
- **Summary:** A1′ — first non-empty, non-heading line of `body`. No schema change needed.
- **Tags:** B1 — only the `tags[]` frontmatter field. No passthrough-field explosion.

## Q10 · Drag-and-drop visual language
**A — Border-only feedback.**
- Dragging card: `opacity: 0.4`, no shadow.
- Valid drop target cell: border becomes 1.5 px yellow.
- Invalid / non-invertible cell: border becomes 1 px dashed muted gray, cursor `not-allowed`.
- Insertion placeholder between cards: 2 px solid yellow horizontal rule.

## Q11 · Item editor
**D — Full-page route (`/items/:slug`).**
- Navigates away from board; board visible in breadcrumb for back-navigation.
- Layout: breadcrumb top, large mono slug label, Inter Tight title input (large), mono body textarea, save/cancel actions.
- Browser back = return to board.
- Breadcrumb model: `boards / board-all → items / refactor-db`.

---

## CSS variable sketch

```css
:root {
  /* Light */
  --bg:        #FAFAF7;
  --surface:   #FAFAF7;
  --ink:       #111111;
  --ink-muted: #6B6760;
  --border:    #E6E4DD;
  --accent:    #FFE94A;

  --font-mono: 'JetBrains Mono', monospace;
  --font-sans: 'Inter Tight', sans-serif;
}

[data-theme="dark"] {
  --bg:        #0E0E0E;
  --surface:   #0E0E0E;
  --ink:       #E8E8E8;
  --ink-muted: #8A867E;
  --border:    #262626;
  --accent:    #F5E663;
}
```
