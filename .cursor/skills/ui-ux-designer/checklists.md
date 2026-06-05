# UI/UX checklists

Use during **Validate** (step 6). Check only what applies to the task.

## Accessibility (WCAG-oriented)

- [ ] Color contrast ≥ 4.5:1 for normal text, 3:1 for large text and UI boundaries
- [ ] Focus visible on all interactive elements (keyboard tab order logical)
- [ ] Icons alone are not the only label; `aria-label` or visible text for icon buttons
- [ ] Form fields have associated labels; errors linked to fields with clear fix text
- [ ] Images have meaningful `alt` (decorative: empty alt)
- [ ] Motion respects `prefers-reduced-motion` when adding animations
- [ ] Touch targets ≥ 44×44 CSS px on mobile

## Responsive

- [ ] Layout works at ~320px width without horizontal scroll (except intentional tables)
- [ ] Primary CTA reachable without excessive scroll on mobile
- [ ] Typography scales; no unreadable body text below 14px equivalent
- [ ] Images/cards reflow; grids degrade gracefully (1 col → 2 → 3+)

## RTL / Hebrew

- [ ] `dir="rtl"` respected on Hebrew screens; icons that imply direction mirrored when needed
- [ ] Numbers, prices, and LTR snippets handled (phone, email, URLs)
- [ ] Line length comfortable for Hebrew (avoid full-width paragraphs on desktop)
- [ ] Copy is natural Hebrew, not literal translation; numerals consistent with product convention

## UX quality

- [ ] One obvious primary action per screen
- [ ] Empty, loading, error, and success states designed (not afterthought)
- [ ] Destructive actions confirmed; undo or clear recovery where possible
- [ ] Navigation: user always knows where they are and how to go back

## Handoff completeness

- [ ] All states listed in spec
- [ ] Spacing/type/color specified or referenced to existing classes
- [ ] Acceptance criteria testable by QA
- [ ] No new dependency unless justified
