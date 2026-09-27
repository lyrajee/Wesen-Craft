# Wesen Craft — UI 2.2 design direction

Wesen Craft is a quiet, precise, warm import cost and purchasing decision workspace. Its canvas is fluid; controls and forms have task-specific bounds, while dense tables use available width. The six pages are product declaration, route comparison, freight quotes, landed cost, customs tariff, and online product lookup.

## Color and controls

| Role | Token | Value |
| --- | --- | --- |
| Primary ink and action | `--ink`, `--primary` | `#1C1C1E` |
| Canvas | `--canvas` | `#F7F7F4` |
| Surface | `--surface` | `#FFFFFF` |
| Wesen Yellow | `--accent` | `#F9DE53` |
| Hover / pressed | `--accent-hover`, `--accent-pressed` | `#F2D447`, `#E7C83C` |
| Soft / strong soft | `--accent-soft`, `--accent-soft-strong` | `#FFF9DD`, `#FCEB95` |
| Muted / dark | `--accent-muted`, `--accent-dark` | `#A88C18`, `#7D6814` |
| Tax / remaining / track | `--chart-tax`, `--chart-remaining`, `--chart-track` | `#3F3F3B`, `#ECECE8`, `#F2F2EE` |

Neutral colors occupy roughly 90–95% of the interface. Yellow marks identity, selection, and wayfinding; primary actions retain near-black fill and white text. Ordinary body text and KPI numbers remain near-black. Use green, amber, and red only for actual success, warning, and error states. Focus has a 2px near-black outline and a soft yellow halo. Respect reduced-motion preferences.

## Navigation and page ownership

The desktop sidebar uses one 24×24 rounded outline icon family at about 17px. Icons for each page have distinct silhouettes. Its active row has a yellow background, near-black label and icon, 600 weight, rounded corners, and a 3px near-black left indicator. Hover uses soft yellow.

At 840px and below, the sidebar becomes a compact app header and a single horizontal navigation rail. The rail scrolls locally, with 44px targets, keyboard arrow/Home/End navigation, and automatic reveal of the active item. The page itself must not scroll horizontally.

Only `.panel.on` is visible. Any responsive root panel layout must use an active selector such as `#routes.panel.on`, while layout of panel children may use ordinary selectors. Product declaration ends after the overview, goods table, and declaration parameters. FCL entry and confirmed quote comparison belong only to the route page; FCL details can be collapsed when no FCL route or charges are active.

## Data hierarchy

Declaration shows four white KPI cards with neutral borders and identical `#FFF7CC` icon wells. Their icons use `#7D6814`; numbers remain near-black with tabular numerals. The donut uses yellow logistics, charcoal taxes, and neutral remaining value. Its text summary states amounts and percentages, and a short sentence about the larger component is derived directly from the current values. Zero goods value never causes division.

Quote rows emphasize All-in CNY and distinguish selected quotes with a narrow yellow marker, soft yellow surface, and text badge. Each row shows Open and a keyboard-accessible contextual menu for Select and Delete. Quote list and bounded detail appear side by side at wide desktop widths.

The customs form has four groups: basic information; core rates; special taxes and trade remedies; regulatory details and sources. HS Code, effective duty, and VAT lead the hierarchy. Empty special taxes are collapsed. Groups use one to three columns according to width, with bounded fields and a natural reading order.

## Responsive workspace

| Width | Layout |
| --- | --- |
| 390px | Single navigation rail, stacked KPI cards, chart and summary below, local table scrolling. |
| 768px | Compact header, 2×2 KPI cards, full-width chart, one or two form columns. |
| 1280–1440px | Fluid desktop, aligned table columns, bounded forms. |
| 1920px | Parallel route context, quote list/detail, and customs search/form; exactly one root panel visible. |
| 2560–3840px | More simultaneous context and complete table columns; bounded inputs and readable prose. |

`src/ui/ui21.css` is the single application stylesheet. Keep color, spacing, radius, border, typography, control height, sidebar width, motion, and focus values in its token layer. Preserve all product, FX, route, quote, tariff, allocation, landed-cost, import/export, and batch persistence calculations. Older v3 batch `tracking` and `trackings` fields are retained as opaque data only; new and duplicated batches do not create or copy them.
