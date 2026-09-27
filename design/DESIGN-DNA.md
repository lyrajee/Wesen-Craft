# Wesen Craft — Design DNA 2.2

**Product:** An import cost and purchasing decision workspace. **Character:** quiet, precise, warm, operational, editorial, recognizable. **Visual ratio:** warm greige, white, near-black, and neutral grey 90–95%; Wesen Yellow 5–10%.

## Tokens

- Identity and selection: `#F9DE53`; hover `#F2D447`; pressed `#E7C83C`; soft `#FFF9DD`; stronger soft `#FCEB95`; muted `#A88C18`; dark `#7D6814`.
- Primary text and action: `#1C1C1E`; primary actions use white labels. Yellow is for identity, selection, and wayfinding.
- Donut: logistics `#F9DE53`; taxes `#3F3F3B`; remaining value `#ECECE8`; track `#F2F2EE`. Center number is near-black. Labels, amounts, and percentages repeat every color-coded fact.
- Four KPI cards: white surface and neutral border; all icon wells `#FFF7CC`; all icon strokes `#7D6814`. Numbers remain near-black and tabular.
- Focus: 2px near-black outline plus soft yellow halo. Hover and selected states have independent text/shape cues. Semantic success/warning/error retain their own colors.

## Composition

- Fluid shell with left sidebar at desktop widths. Six navigation icons share a 24×24 outline family and distinct silhouettes. Active row is yellow with a 3px near-black left marker, near-black icon/text, 600 weight, and 8–10px radius. Hover is soft yellow.
- At 840px and below, compact app header plus a single, locally scrolling navigation rail. 44px targets; keyboard arrows, Home, End, and active-item reveal; no page-level horizontal overflow.
- One root panel is visible at a time. Wide responsive display rules target `.panel.on`. Declaration contains its header, batch controls, four-KPI overview and donut, goods table, and declaration parameters only. FCL editing and confirmed quote comparison live on the route page.
- 390px: stacked KPIs, donut and summary, local table scrolling. 768px: 2×2 KPIs with chart below. 1280/1440px: aligned fluid desktop. 1920/2560/3840px: use breadth for parallel context and data columns, with bounded fields and prose.
- Quote rows show All-in CNY and status clearly, with Open plus a contextual Select/Delete menu. Selected rows use a narrow yellow marker, restrained yellow tint, and text badge. Wide quote list/detail form two work areas.
- Customs form groups basic information, core rates, special taxes/trade remedies, and regulatory details/sources. HS Code, effective duty, and VAT lead. Empty special taxes collapse. Form fields use one to three columns and bounded widths.

## Implementation constraints

`src/ui/ui21.css` owns base, component, and responsive styles. Use tokenized values, reduced motion, tabular numerals, local table overflow, visible keyboard focus, and labelled donut data. Preserve all cost, FX, freight, quote, customs, allocation, import/export, and batch calculations. v3 legacy `tracking` and `trackings` properties remain inert, opaque persistence fields; new batches omit them and duplicate excludes them.
