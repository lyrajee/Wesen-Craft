# Wesen Craft — Product UI Direction

Wesen Craft is an Operate-style import logistics cost and purchasing decision workspace. UI 2.1 keeps the quiet warm-neutral identity while adding a restrained brand accent and real wide-desktop composition.

## Visual system

Use a neutral foundation with restrained Wesen Ink Blue:

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--canvas` | `#F7F7F4` |
| Work surface | `--surface` | `#FFFFFF` |
| Quiet surface | `--surface-quiet` | `#FAFAF9` |
| Primary text/action | `--ink` | `#1C1C1E` |
| Secondary text | `--secondary-text` | `#41423F` |
| Muted text | `--muted` | `#686966` |
| Border | `--line` | `#E6E6E3` |
| Strong border | `--line-strong` | `#D2D2CE` |
| Wesen Accent | `--accent` | `#456B8A` |
| Accent hover | `--accent-hover` | `#385B77` |
| Accent soft | `--accent-soft` | `#EEF3F6` |
| Accent soft strong | `--accent-soft-strong` | `#E1EAF0` |
| Accent muted | `--accent-muted` | `#7E9BB1` |
| Tax chart accent | `--accent-deep` | `#5B7083` |

Neutral surfaces and text remain about 90–95% of the interface. Use Ink Blue for active navigation, selected icons/tabs, links, informational emphasis, quiet focus treatment, and logistics chart data. Primary buttons stay near-black. Do not use blue for the page background, primary buttons, broad card fills, or the whole sidebar.

Green, amber, and red are reserved for real success, warning, and error states, with text or icon cues. Blue is never success.

## Fluid shell and responsive strategy

The app shell and toolbar use the available workspace with no global 1440/1520px cap. Dense tables may use the full content width. Cap forms, prose, charts, and context panels according to their task. The 4K overview is left aligned and may cap at 2880px; tables may continue across the workspace.

| Viewport | Space strategy |
| --- | --- |
| 390px | Stack the four KPI cards, then the donut and cost summary; keep the table’s horizontal scroll local. |
| 768px | Use a 2×2 KPI group; place the chart below at full width; keep the page from scrolling horizontally. |
| 1280–1599px | Compact desktop; 24–32px page padding; overview beside the cost chart. |
| 1440px | Fluid desktop; declaration table uses the available width and keeps numeric columns aligned. |
| 1600–1919px | Increase usable table width and place related analysis beside its workspace when it helps. |
| 1920–2559px | Use parallel route/quote context and cost analysis layouts. |
| 2560–3839px | Show more useful context and table capacity; keep input widths and panels bounded. |
| 3840px+ | Use the wide operational canvas. Do not center a narrow page or stretch every card and field. |

Component width guidance: forms generally 960–1600px depending on field count; prose 720–900px; comparison panels may grow; tables use 100% of the work area. Inputs remain bounded and related fields stay grouped.

## Page roles

Keep one shared page header, neutral controls, typography, icons, and focus states while composing each task for its own job:

- Declaration: four-part overview above a full-width dense product table.
- Route comparison: route options alongside selected freight-quote context on wide screens.
- Freight quotes: quote list and quote detail side by side on ultrawide screens.
- Landed cost: allocation controls and summary above a full-width item breakdown.
- Customs: compact search/context beside bounded manual rate details on wide screens.
- Lookup and tracking: preserve their existing result and shipment workflows while using shared tokens and responsive behavior.

## Batch overview and cost composition

Replace the old eight-metric 4×2 overview with four light KPI cards: total pieces, CNY goods value, total weight/volume, and duty plus VAT. Separate the overview from the operational goods table by 24–32px.

Show an SVG donut and text summary using existing calculated results only:

- Logistics cost = international + domestic + insurance + other from `calculateLandedCost().totals`.
- Tax cost = duty + VAT from those same totals; consumption tax is excluded from this chart measure.
- Logistics share = logistics cost / CNY goods value × 100.
- Tax share = tax cost / CNY goods value × 100.
- Total additional-cost share = (logistics + tax) / CNY goods value × 100.

Display one decimal place, labels, amounts, and non-color cues. Ink Blue represents logistics; muted slate blue represents tax; pale neutral represents the remaining goods-value baseline. If additional costs exceed 100%, show the actual percentage in the center and use the ring for the internal logistics/tax mix; do not show a remaining-value segment. If goods value is zero, show an empty ring and an em dash without dividing.

## Data, forms, tables, and accessibility

Use one 24×24 rounded-outline SVG icon family. Navigation icons are about 17px, actions 16px, KPI icons 16–18px. Keep tabular numerals for currency, rates, quantities, weight, volume, and percentages. All numeric table values, headers, and editors align right. Tables stay compact (about 42–44px rows) and use sticky headers when helpful.

Forms use responsive 2–4-column groups according to the task, with bounded controls. Text contrast targets WCAG AA; keyboard focus is visible; selected state is also indicated by text, placement, underline, or shape. Donut data has a text legend. Respect reduced-motion preferences.

Preserve all cost formulas, tax/customs rules, FX logic, LCL/FCL and quote behavior, import/export, persistence, schemas, APIs, established terminology, and Chinese/Japanese/English support.