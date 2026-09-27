# Wesen Craft Design DNA — UI 2.1

This document explains the authoritative machine-readable rules in [DESIGN-DNA.json](DESIGN-DNA.json). UI 2.1 is a restrained evolution of the existing operational workspace, not a marketing dashboard.

## Product and visual intent

**Mode:** Operate.
**Product:** Import logistics cost calculation and purchasing decisions.
**Personality:** Quiet, wide, precise, data-led, operational, premium, recognizable.

The interface uses warm greige, white, near-black, and neutral grey for roughly 90–95% of its visual weight. Wesen Ink Blue occupies about 5–10%, only where it improves recognition of navigation, selection, information, or cost data.

## Color tokens

### Neutral

- Canvas `#F7F7F4`
- Surface `#FFFFFF`
- Quiet surface `#FAFAF9`
- Border `#E6E6E3`
- Strong border `#D2D2CE`
- Primary text/action `#1C1C1E`
- Secondary text `#41423F`
- Muted text `#686966`

### Brand

- Accent `#456B8A`
- Accent hover `#385B77`
- Accent soft `#EEF3F6`
- Accent soft strong `#E1EAF0`
- Accent muted `#7E9BB1`
- Tax chart accent `#5B7083`

### Semantic

Use green only for real success or a real cost decrease, amber only for a real warning, and red only for an actual error or destructive state. Always pair semantic color with text or an icon. Accent blue is never a success signal.

Ink Blue may mark the active sidebar icon and thin indicator, selected tab underline, links, informational details, visible focus, small KPI icon wells, and logistics chart data. Keep selected navigation surfaces neutral and primary buttons near-black. Avoid blue page backgrounds, blue primary buttons, filled blue tabs, broad blue sidebar fills, and blue KPI-card surfaces.

## Layout and responsive rules

There is no global application max-width. The workspace and dense tables use the available width. Each component sets its own useful limit; at 4K the overview can cap at 2880px while remaining left aligned, and dense tables may fill the workspace.

- **390px:** four KPI cards stack vertically; donut and text summary follow; local table scrolling only.
- **768px:** KPI cards are 2×2; donut moves to a full-width row beneath.
- **1280–1599px:** compact desktop with 24–32px page padding.
- **1440px:** fluid workspace and declaration table.
- **1600–1919px:** wider tables and adjacent analysis where the page task benefits.
- **1920–2559px:** comparison and context/cost panels use parallel columns.
- **2560–3839px:** expose more useful context and table capacity; keep forms and side panels bounded.
- **3840px+:** use a wide operational canvas without a narrow centered page or indiscriminate component stretching.

Forms generally stay within 960–1600px depending on field count. Prose stays near 720–900px. Tables use the full available work area. Inputs remain bounded rather than stretching across a 4K screen.

## Batch overview

The overview has four light, bordered KPI cards beside a cost-composition panel:

1. **Total pieces:** `sumQty` from current item quantities; `sumItemCount` is supporting line-item count.
2. **CNY goods value:** the current goods-value sum already produced by existing item calculations.
3. **Total weight and volume:** the existing current-batch route context totals.
4. **Duty plus VAT:** existing landed-cost totals when valid, with the current established tax-summary fallback otherwise.

The goods-value number has the strongest KPI type. Units are subdued. The cards use a subtle surface and a small accent-tinted icon well, not a blue fill. Separate this overview from the goods detail table by 24–32px.

## Donut and cost summary

All amounts come from the existing `calculateLandedCost().totals` result; UI code may aggregate returned components but must not add a parallel calculation:

- `logisticsCostCny = international + domestic + insurance + other`
- `taxCostCny = duty + vat`
- `logisticsPct = logisticsCostCny / goodsValueCny × 100`
- `taxPct = taxCostCny / goodsValueCny × 100`
- `totalAdditionalPct = (logisticsCostCny + taxCostCny) / goodsValueCny × 100`

The chart shows logistics in Ink Blue, taxes in muted slate blue, and remaining goods-value baseline in pale neutral. A text legend and summary list show labels, amounts, and one-decimal percentages. The center shows the actual total additional-cost share.

If the total exceeds 100%, the ring represents the internal logistics-versus-tax composition; the center retains the true percentage and a text notice explains that additional costs exceed goods value. Never invent a remaining segment. If goods value is zero, do not divide: show an empty ring, an em dash, and a concise instruction.

The summary remains a label/value list with fine separators, not another card.

## Page composition

- **Declaration:** overview, then a dense full-width product table.
- **Routes:** route options and quote context in parallel on wide desktop; FCL editing remains a distinct workspace.
- **Quotes:** quote list beside its detail editor on ultrawide screens.
- **Landed cost:** allocation controls and route totals above the full-width cost table.
- **Customs:** search and origin/destination context beside a bounded manual-rate form on wide screens.
- **Lookup and tracking:** preserve existing task flows; apply shared accent, typography, spacing, icons, tables, and responsive rules.

## Type, tables, forms, and motion

Use distinct page, section, panel, primary metric, secondary metric, body, table, metadata, and caption levels. Apply `font-variant-numeric: tabular-nums` to all numeric data. Right-align numeric headers, values, and editable fields. Keep rows compact and do not increase row height merely because the screen is wide.

Forms use 2–4 responsive columns where fields are logically related. Bound inputs and prose even when the overall workspace is fluid. Use one coherent 24×24 rounded-outline SVG family, with consistent stroke and optical sizing.

Maintain visible keyboard focus, WCAG AA contrast, labels and values in the donut legend, and touch targets on mobile. Accent is never the only state indicator. Motion remains minimal and nonessential transitions respect `prefers-reduced-motion`.

## Preserve

Do not change cost formulas, customs or tax rules, exchange-rate logic, LCL/FCL calculations, quote logic, import/export behavior, persistence, schemas, APIs, permissions, established terminology, or Chinese/Japanese/English support.