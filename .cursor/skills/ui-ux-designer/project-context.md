# B2C frontend — design context

## Stack

| Layer | Technology |
|-------|------------|
| UI | React 18 |
| Styling | Tailwind (`src/index.css`, `tailwind.config.js`), Bootstrap 5, component CSS files |
| Icons | react-icons, Font Awesome, inline SVG in docs |
| Routing | react-router-dom v6 |
| Alerts | sweetalert2 |

Many screens mix Tailwind utility classes with Bootstrap components and legacy CSS (`Menu.css`, `marketplace.css`, etc.). **Match the file you are editing** — do not introduce a third styling approach on the same screen without a deliberate migration plan.

## Typography

- Hebrew: **Rubik** — `.font-hebrew`, `.font-rubik` in `src/index.css`
- Legacy menu: Alef / assorted script fonts in `Menu.css` — treat as legacy unless redesigning nav globally

## Color (recurring)

- Brand / primary blue: `#3563E9`, `#2563eb`, `#1e40af` (logo gradient in `index.css`)
- Category accents (from menu docs): green vegetables, orange fruits, emerald greens, gray other, blue gradient for "הכל"
- Bootstrap primary hover legacy: `#007BFF` in `Menu.css`

Prefer Tailwind `blue-*` / `emerald-*` / `orange-*` when the surrounding component already uses Tailwind.

## Layout patterns (documented)

- **Store / products:** vertical cards desktop, horizontal compact mobile; category pills in header
- **Search:** 48px bar, focus ring, suggestions dropdown max-height ~384px
- **Marketplace:** `src/components/marketplace/` + `marketplace.css`

Reference `docs/MenuAndLayoutImprovements.md`, `docs/SearchFeature.md`, and related docs before proposing conflicting patterns.

## Roles & surfaces (high level)

Consumer ordering, coordinators, business sellers, admin/delivery tools — role-specific nav items with icons. Keep IA role-aware; do not expose admin patterns on consumer flows.

## Implementation hints

- New shared styles: prefer Tailwind in JSX if sibling code uses Tailwind; otherwise extend existing CSS module/file
- Hebrew strings: keep in component or existing i18n pattern; do not hardcode English for user-visible primary UI
- Electron build exists — avoid layouts that assume desktop-only width for flows that also run in browser

## Files to inspect first

| Intent | Start here |
|--------|------------|
| Global styles / fonts | `src/index.css` |
| Navigation | `src/components/Menu.css`, menu components |
| Marketplace | `src/components/marketplace/` |
| Landing | `src/components/LandingPage.css` |
| Past UX decisions | `docs/*.md` |
