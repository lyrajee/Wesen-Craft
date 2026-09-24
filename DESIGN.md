# Wesen Craft — Product UI Direction

Operational logistics and landed-cost application. Treat `design/DESIGN-DNA.json` as the machine-readable specification and `design/DESIGN.md` as its human-readable explanation. This is a refinement of the existing interface; preserve all product behavior and business rules.

## Approved visual system

Use warm greige (`#F3F3F0`), white (`#FFFFFF`), near-black (`#1C1C1E`), and neutral grey. The primary hover/pressed colors are `#343436` and `#0E0E0F`. Quiet/selected/hover surfaces are `#FAFAF9`, `#E7E7E4`, `#EEEEEB`, and `#F7F7F5`. Borders are `#E6E6E3` and `#D2D2CE`; muted text is `#686966`. Focus uses `#777873` and `rgba(28, 28, 30, 0.14)`. These values are explicitly user-selected, not reference-image measurements.

Routine interactions are neutral monochrome. Semantic colors are reserved for actual success, warning, or error status. Do not reproduce bright-blue boxes or red handwritten numbers in supplied screenshot captures; those are annotations, not product UI.

## Operational hierarchy

- Near-black solid primary actions; white outlined secondary actions. Import is secondary to Add Item.
- Warm greige sidebar with a quiet neutral selected surface; no accent-colored icons, rails, borders, glows, or shadows.
- One calm eight-metric overview card, then the full-width declaration table and compact parameters.
- At 1280px and 1440px, every declaration column fits without horizontal scrolling. Use proportional fixed columns and one-line headers. Contain scrolling to the table below desktop breakpoints.
- Keep text columns left aligned and numeric columns right aligned with tabular numerals. Maintain consistent alignment between table headers, values, and editors.
- Route comparisons use neutral cards and selection; “参考方案” remains a separate neutral badge. Landed-route tabs use a dark underline.
- Keep text-only page headings, no broad accent washes, flat surfaces, restrained borders/radii, and calm whitespace.

Preserve calculation formulas, taxes, freight, exchange-rate APIs, route logic, lookup, import/export, persistence, data structures, and established terminology. For responsive, component, and state details, follow the JSON specification.
