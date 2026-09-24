# Wesen Craft Design DNA

The authoritative machine-readable specification is [DESIGN-DNA.json](DESIGN-DNA.json). This precision refinement keeps the existing operational interface and replaces the previous functional-color interactions with a neutral monochrome system. Reference observations remain separate from Wesen-specific rules and chosen values.

## Direction

Warm greige, white, near-black, and neutral grey. Keep the product calm, precise, low-noise, and operational. Routine interface states use no decorative accent color. Semantic success, warning, and error colors appear only when communicating a real status.

## User-selected palette

These values are selected for Wesen and are **not measurements from the reference screenshot**.

| Role | Value |
| --- | --- |
| Primary / text | `#1C1C1E` |
| Primary hover | `#343436` |
| Primary pressed | `#0E0E0F` |
| Sidebar | `#F3F3F0` |
| Quiet surface | `#FAFAF9` |
| Selected surface | `#E7E7E4` |
| Hover surface | `#EEEEEB` |
| Subtle hover | `#F7F7F5` |
| Border | `#E6E6E3` |
| Strong border / control boundary | `#D2D2CE` |
| Muted text | `#686966` |
| Focus border | `#777873` |
| Focus ring | `rgba(28, 28, 30, 0.14)` |
| White | `#FFFFFF` |

Do not reproduce bright-blue boxes or red handwritten numbers visible in supplied reference captures; those are user annotations, not interface elements.

## Components and hierarchy

- Primary actions use near-black fill, white icon/text, and `#343436` / `#0E0E0F` hover and pressed states.
- Secondary actions use a white surface and `1px solid #D6D6D2`. Import remains visually subordinate to Add Item; hover uses `#FAFAF9`, pressed uses `#F1F1EE`.
- Sidebar stays warm greige. Brand-to-navigation spacing is 28–32px; rows are 40–42px with 4–6px gaps, 10–12px horizontal padding, and a 10px icon gap. Active navigation uses `#E7E7E4`, dark text, and neutral dark-grey icons. Hover uses `#EEEEEB`.
- Use one understated monochrome SVG icon family with a 24×24 viewBox, rounded joins/ends, approximately 1.5–1.75 optical stroke, 17px navigation icons, and 16px action icons.
- Keep one overview card with eight distinct metrics in a 4×2 desktop grid. Use a white surface, 1px neutral border, 10–12px radius, and optional nearly invisible shadow. Emphasize landed cost through type weight only.
- At desktop widths of 1200px and above, the declaration table is fixed-layout, full-width, and all columns fit without horizontal scrolling. At narrower widths, scrolling is contained within the table region.
- Table headers remain on one line. Product and SKU are left aligned; quantities and numeric values are right aligned with tabular numerals. Headers and cells share column alignment. Editable fields stay within their column and use compact neutral focus treatment.
- Route cards are white with fine neutral borders. Hover is `#FCFCFB` with `#CACAC6` border. Actual route selection uses a darker neutral border, optionally a small near-black dot. The “参考方案” badge uses `#F1F1EE` and `#555652`, remaining distinct from selection.
- Landed-route tabs use muted defaults and a 2px near-black underline when selected. Links use `#3F403D` and underline on hover.
- Keep page titles text-only, declaration parameters compact, and import/add actions visible only on the declaration page.

## Type and effects

Use the compact operational scale: page title 20–24px, section title 16–18px, panel title 14–16px, body 14px, table body 13px, metadata 12px, and overline 11px. Table headers are 11.5–12px; rows are about 42–44px and headers 38–40px. Use tabular numerals for quantities, currency, weight, volume, percentages, and totals.

Surfaces remain flat with 1px separators and restrained radii. No gradients, glass, heavy shadows, colorful KPI cards, decorative charts, colored focus states, or excessive animation. Motion is brief and functional, with reduced-motion support.

## Responsive and access rules

At desktop widths of 1280px and 1440px, the full declaration table must fit without local or page-level horizontal scrolling. At tablet/mobile, local table scrolling is allowed, but the page itself must not overflow horizontally. Preserve all four navigation destinations, Chinese/Japanese/English, keyboard-operable tabs, visible neutral focus, accessible names, and usable touch targets.

## Wesen Adaptation Rules

### Preserve from the reference

- Warm greige navigation, white work surfaces, near-black typography and primary actions.
- Compact toolbar, subtle separators, restrained radius, low visual noise, and broad calm whitespace.
- Compact professional tables with aligned numeric values.
- Route comparison and cost-breakdown composition.

### Adapt for Wesen Craft

- Use the exact neutral palette above. It is user-selected and is not presented as screenshot-measured.
- Keep all routine interaction states neutral: no accent-colored navigation, hover, focus, links, buttons, route selection, or tabs.
- Fit every declaration column at 1280px and 1440px with explicit proportional widths; contain horizontal scrolling below 1200px.
- Preserve the eight-metric overview, current calculations, business terminology, logistics workflows, responsive behavior, and three-language support.
- Use an outlined white Import action and near-black Add Item action, both only on declaration.
- Distinguish the neutral “参考方案” badge from actual route selection.
- Treat any bright boxes or handwritten marks in supplied screenshots as user annotations and exclude them from the interface system.
