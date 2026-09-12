# MEMORY — standing context for future sessions

> Read this first. This file is the persistent memory for the **Freebuff
> Desktop** workspace at `F:\AI-Chat Project`. Imported context originally
> came from ChatGPT memory (imported 2026-09-07) and has been extended with
> everything decided and built here. Update the dated log and status sections
> whenever milestones change.

---

## 1 · Who the user is

- **18 years old (adult), based in Sri Lanka** (corrected 2026-09-07 — not a
  minor). School/study commitments come first.
- Decent computer skills. Desktop PC only (no laptop): **Intel i5 12th gen,
  16 GB RAM, RTX 5070, 1 TB NVMe**.
- Reads/writes English fine; realtime speaking less confident. Communicate in
  clear written English.
- Has an **own debit card** but **chooses not to spend**: **$0 budget** for
  business expenses until there is evidence of demand. Will not pay for
  courses/tools.

## 2 · Binding constraints (never violate)

- **No face online, no voice recordings, no livestreaming, no cold calls,
  no meeting-heavy client work.** Everything is text-based and anonymous.
- **$0 spend on anything** until there is evidence of demand. No paid tools,
  no ads, no paid accounts.
- **Age 18 (adult):** user can open accounts and payout rails (e.g., Gumroad →
  PayPal) in their own name where terms allow. Still comply with every
  platform's terms — no bypassing anything.
- **$0 spend discipline:** the debit card exists but stays in the wallet until
  there is evidence of demand.
- User does **not** intend to buy the **Monetise** offer (chooses not to spend).
  Monetise
  (Iman Gadzhi/Russell Brunson funnel; "$55M+" figure = marketing claim, not
  established fact) is used **only as free input** — WhatsApp waitlist +
  free episodes. Pay nothing.
- AI is a **tool to build/test faster, not a magic money generator**. The
  assistant's role: genuine business/building assistant (research, specs,
  code, copy, analysis). The user keeps final judgment.

## 3 · The business plan

**Model — "CalcMall"** (renamed from "Digital Mall" on 2026-09-08): one digital
property/site/brand hosting many
small free tools → traffic → paid products/premium versions → revenue →
more tools. Build in districts, never "100 random products".
Platform sub-headline: *Micro-Calculators & Estimates for Businesses, Teams,
and Professionals.* (2026-09-08 rebrand: was "Free Micro-Calculators &
Estimates for Professionals and Contractors" — all "Free" copy removed,
trade/freelance wording replaced with businesses/founders/independent
professionals, Tool #06 renamed "Import Tax & Landed Cost Calculator")

**Loop:** find problem → validate demand → smallest useful product → launch →
measure → improve winners / kill losers. Weak validation evidence = likes and
"I'd use this". Strong = actual use, repeat use, feature requests, voluntary
payment.

**First district — Freelancer / solo-business tools** (chosen 2026-09-06 over
student tools, small-business calculators, gaming, generic AI — generic AI
rejected: too competitive).

**Chosen product — "Project Change & Scope Calculator"** (CalcMall tool #01;
working name was "Freelance Scope Guard"):
- Positioning: *Know when a project stops being profitable.* / *Track scope.
  Calculate the cost. Send the change request.*
- Solves the "client asks for one more thing" pain. Generic rate calculators
  are NOT differentiated (research covered Freelero, The Solo Ledger,
  WebToolsHQ, Sengi, Freelance Hub, HustleNumbers) — the wedge is making
  scope creep tangible (effective-rate drop) + generating the change request.
- Killer feature: ORIGINAL vs CURRENT ESTIMATE with *"Your effective rate has
  dropped X%"* and unbilled value.

**Second tool — "Quantity & Rate Calculator"** (CalcMall tool #02, added
2026-09-08): a fast spreadsheet-free line-item estimator for
engineers/contractors/tradespeople. Rows of **Item · Qty · Unit · Rate** →
**Amount = Qty × Rate** + running **Total**, live on every keystroke.
Decimal-safe, invalid/blank inputs show "—" (never corrupt the total),
Enter on the last row adds the next one, units suggested via datalist,
rows persist in `localStorage` (`cm-qr-v1`), Clear all + reset both work.
Pricing/Invoice remain "coming soon" slots (now #04/#05).

**Third tool — "Engineering Quotation & BOQ Generator"** (CalcMall tool #03,
added 2026-09-08): a client quotation builder for engineers/contractors.
Quotation details (client/designation/company/address/date/ref) + itemized
BOQ (Item · Unit · Qty · Rate in LKR; Amount = Qty × Rate) + optional
**Discount %** and **VAT %**. Live summary = Sub total → Discount → Net →
VAT → **Final total**; invalid/blank rows excluded. **PDF export** via the
html2pdf.js CDN renders a formal A4 quotation letter (METRIX ENGINEERING
SERVICES letterhead, recipient + ref/date, itemized table, totals, T&C
block for Payment/Warranty/Mobilization/Validity, Engineer signature).
Persists under `cm-boq-v1`; Reset quotation + "Reset all data" both clear
it. PDF needs internet on first load for the CDN (falls back to a print
hint offline).

**Fourth tool — "Smart Invoice & Document Builder"** (CalcMall tool #05,
added 2026-09-08; nav label **Invoice**): one dynamic builder replacing the
static invoice placeholder. A **Document type** dropdown switches between
**Quotation / Proforma Invoice / Commercial-Tax Invoice / Delivery Note**
with per-type dynamic fields (Proforma: payment terms + bank/account/SWIFT/
branch; Commercial: invoice no, VAT reg no, consignee, bill-to, currency
LKR/USD; Delivery Note: deliver-to fields and the Rate + Amount columns
totally hidden plus the totals summary hidden). Shared: line items
(Description · Model · Unit · Qty · Rate · Amount = Qty × Rate),
letterhead customizer (company name/address/contact + **logo upload**),
live grouped-money totals (`Rs62,500.00` via an upgraded `fmtMoney` with
thousands grouping), and **Generate Document PDF** (html2pdf letterhead
document). Persists under `cm-inv-v1`; Reset document + Reset all data
clear it. Quotation tool #03's nav label was shortened to **Quotation**.
Pricing remains the only "coming soon" slot (#04).

## 4 · Project state — Project Change & Scope Calculator v0.2 (BUILT, CalcMall)

Status: **v0.5 built — CalcMall with 5 tools: Scope Guard (#01), Quantity &
Rate Calculator (#02, + PDF export), Engineering Quotation & BOQ Generator
(#03), Pricing (coming soon #04), and the Smart Invoice & Document Builder
(#05: Quotation / Proforma / Commercial-Tax Invoice / Delivery Note with
letterhead + logo + html2pdf export); glassmorphism B&W theme; live preview
verified end-to-end.**

Files (canonical sources):
- `index.html` — CalcMall header nav (logo + Home link, Login/Sign up, theme
  toggle), Home/All Tools landing view with the compact tool selector bar
  (Scope Guard / Qty & Rate / Quotation / Pricing / Invoice) + featured-tool preview
  card, "How CalcMall works" 3-step grid, "Why use CalcMall" SEO copy block,
  4-question FAQ accordion (native `<details>`), professional footer (four
  tool links, Reset all data, Terms/Privacy → legal modal), then the
  two-column dashboard for tool #01 (left = Project Setup + Add Request;
  right = Live Scope Metrics, Request History, Change Order Generator), a
  dedicated `#qr-view` for tool #02 (line-items table + total + Export to
  PDF), a dedicated `#boq-view` for tool #03 (quotation details, BOQ table,
  discount/VAT summary) plus an offscreen `#quotation-doc` (PDF source),
  and a dedicated `#invoice-view` for tool #05 (document type selector,
  dynamic fields, letterhead customizer + logo, line items, totals,
  offscreen `#inv-doc`).
  Time fields have Hours | Days toggles.
- `css/style.css` — black-and-white glassmorphism theme: grayscale-filtered
  abstract Unsplash background image on `body::before` (vignette radial +
  `bgPulse` opacity pulse), glass cards `rgba(18,18,18,0.75)` with
  `backdrop-filter: blur(16px)` and `rgba(255,255,255,0.12)` borders,
  white headings (-0.03em Inter), `#cbd5e1` platinum-silver body text,
  silver glass pills, `fadeInUp` staggered landing entrance, icon-badge
  hover `translateY(-3px) scale(1.04)` on
  `cubic-bezier(0.16,1,0.3,1)` with a soft white glow; tool selector bar +
  preview card on the landing, `[hidden]{display:none!important}` guard;
  two columns ≥981px, one below.
- `js/calculations.js` — pure math + formatting (`window.Calc`), incl.
  `toHours`/`fromHours`/`fmtDur` (1 day = 8 h), 155-currency symbols,
  `fmtNum` (thousands-grouped, up to 2 decimals) for tool #02, `fmtMoney`
  (thousands-grouped money, e.g. `Rs62,500.00`), and the BOQ
  helpers (`boqAmount`, `boqSubTotal`, `boqDiscount`, `boqNet`,
  `boqVatAmount`, `boqFinal`) for tool #03.
- `js/app.js` — state in `localStorage`, Home↔tool view switching
  (`home` / `tool` / `qr` / `boq` via a `TOOL_VIEWS` map), unit-aware math
  (days → canonical hours at input boundaries; state always stores hours +
  a `hoursUnit`/`unit` label), rendering, events, message generator, the QR
  tool module (`cm-qr-v1` rows, add/remove/Enter-to-add, instant totals,
  Clear all), and the BOQ tool module (`cm-boq-v1` meta/lines/discount/VAT,
  live totals, offscreen quotation doc, html2pdf export).
- `test/calculations.test.html` — 42 no-dependency browser assertions
  (fixture: 20 h/$1,500 → 32 h → $46.88/hr, −37.5% + `fmtNum` + grouped
  `fmtMoney` + BOQ cases). Open in a browser.
- `README.md` — run/test/deploy/validation instructions + QA checklist.
- `preview.html` — **generated** self-contained copy for the Preview tab
  (CSS+JS inlined). Regenerate after touching the sources.
- `.freebuff/run.md` — why preview.html exists + PowerShell regeneration
  script + verification steps.
- `MEMORY.md` — this file.

Core formulas: orig rate = price/hours; committed = Pending+Approved
requests; projected rate = price/(hours+committed); rate-drop %; unbilled =
Σ value of committed; break-even charge = hours × orig rate + expenses.
Declined requests excluded everywhere.

Verification to date (2026-09-07): static checks passed; live preview ran the
full flow with correct numbers (37.5% drop, $46.88/hr, break-even $900,
unbilled $720, inline change order generated). Manual QA on the user's real
browser still outstanding.

## 5 · Environment quirks (important for future sessions)

- **No shell on this machine:** Git Bash is missing, so `run_terminal_command`
  cannot execute anything. Do all work with file tools + the Preview tools.
- Preview tab serves ONE html file only (sibling CSS/JS 404). That's why
  `preview.html` exists; the real app works by double-clicking `index.html`
  in a normal browser (needs JS enabled; data stays local).
- No package.json/build tooling. Zero dependencies by design.

## 6 · Next actions

1. User runs README's manual QA checklist in a real browser (or the agent
   walks it on the live preview) and reports anything broken.
2. **Deploy free** (only when user is ready): GitHub Pages or Cloudflare Pages
   (age 18 → user runs these accounts themselves).
3. **Validation sprint:** 5–10 real freelancers use it → then share text posts
   in freelancer communities that allow it. Success metric = repeat use and
   feature requests. ~2-week gate: if nobody returns/asks → kill or pivot.
4. Only after usage evidence: paid upgrade experiments and/or next mall
   district. Watch Monetise free episodes as input only; extract 1 actionable
   idea per episode into this plan.
5. Whenever sources change, regenerate `preview.html` (script in
   `.freebuff/run.md`) and re-verify.

## 7 · Dated events log

- 2026-09-09 (e) — **Blank-PDF fix: new print-window export engine**. All
  5 exporters (Quantity & Rate, Quotation/BOQ, Smart Invoice, Variation,
  Master ERP) replaced the html2pdf CDN rasterizer (blank pages when the
  CDN was unreachable or offscreen capture failed) with a self-contained
  pipeline in `app.js`: `PRINT_DOC_CSS` (inlined A4 print stylesheet with
  the full quo-/var- doc classes — dark text on white),
  `compilePrintHtml(body, title)` (complete `<!DOCTYPE html>` string),
  `openPrintWindow()` doing `document.open() → write(html) → close()` on
  a new window, waiting for `<img>` load/error (2 s safety net) or
  window load before `print()`, popup-block alert fallback, and
  `exportViaPrintWindow(sourceEl, title)` used by every exporter. Values
  are pulled live from state/inputs by the existing build*Doc() calls
  immediately before compile; `esc()` + `|| '\u2014'` / `'0.00'`
  fallbacks prevent null/undefined in output (verified: blank client/ref
  render em-dashes, never "undefined"). `@media print` rules added to
  style.css (header/sidebar/footer/buttons hidden; cards → white bg,
  no shadows; `.pdf-offscreen` and all doc containers static + dark-on-
  white — no blanket display:none) plus `.quo-signoff`/`.quo-signline`
  styles. PDFs now also work fully OFFLINE (no CDN). Verified live: all
  5 exports captured complete standalone docs (DOCTYPE + inline CSS +
  letterhead + ref/date/client + comma figures + totals + terms);
  invoice letterhead uses its own business fields by design; inputs
  preserved; console clean; state reset. Test page (86/86) unaffected —
  pure math only. html2pdf <script> tag left in index.html (harmless;
  remove later).

- 2026-09-09 (d) — **Routing, utilities-grid & global currency fixes**:
  (1) Sidebar 🏬 CalcMall logo now opens the **Homepage Dashboard**
  (`#home-view`, hero + tool directory) — NOT the ERP view (earlier same-
  day change reverted per user request). (2) The All-Utilities icon bar
  became a **CSS Grid** (`.utilities-grid`: repeat(auto-fill,
  minmax(110px,1fr)), gap 16px) inside a glassmorphism container
  (rgba(18,18,18,0.75) + blur(16px) + rounded borders; per-icon card
  backgrounds, hover + active states; light-theme variants). (3) Currency
  list expanded 8 → **15** (added INR ₹, JPY ¥, CHF Fr., SAR SR, MYR RM,
  ZAR R, NZD NZ$; USD first) in `Calc.TOOL_CURRENCIES` + all 13 static
  selects in index.html. **`setToolCurrency` is now a global sync**:
  changing any tool's select updates ALL 11 banner selects, the invoice
  inline currency field, `erpState`/`invState` (persisted), re-renders
  every money surface (tables, summaries, headers, PDF builders) and
  never resets user inputs. Client auto-fill still re-syncs globally to
  the client's default currency. Verified live: JPY/INR/ZAR/CHF/NZD
  symbols flow through ERP summary + row amounts + generated doc
  (`Rate (NZD)`, `NZ$44,250.00`), QR total symbol, all selects follow,
  inputs preserved, reset clean, console clean.

- 2026-09-09 (c) — **Sidebar logo navigation fix**: the 🏬 CalcMall block
  at the top of the sidebar was a plain `div` with no listener (only the
  header logo `#brand-home` was wired). It is now a `<button id="sidebar-brand">`:
  clicking returns to the Master ERP Engine home view (`showView('erp')`,
  which smooth-scrolls to top and closes the mobile drawer); CSS gives it
  cursor pointer, hover tint (`--accent-soft`), active scale and a logo
  pop on hover. Verified live: click from History → ERP view, scrollY 0,
  cursor pointer, console clean.

- 2026-09-09 (b) — **Bug fixes + theme/accent features**: (1) Settings
  "Toggle theme" button had been miswired to `toggleSidebar` — now wired to
  `applyTheme`, which sets BOTH `data-theme` on <html> and a `light-theme`
  class on <body>, persisted in `cm-theme`. (2) **Custom Accent Color** in
  Settings: 7 preset swatches + `<input type=color>` + Reset; writes
  `--accent`, `--accent-hover`, `--accent-ink` (luminance-picked black/white),
  `--accent-soft`, `--accent-line`, `--glow` on `document.documentElement.style`
  and persists in `cm-accent-v1` (empty string = default monochrome).
  (3) **Hours vs Days displays**: new `fmtRateU`/`displayRateU`/`rateSuffix`
  helpers — rates are stored canonically HOURLY and converted for display
  (`rateForDisplay` ×8 for days), so every stat, comparison card, summary
  line and rate hint shows `$X/day` + `d` in days mode (verified
  $2,500.00/day). (4) **Projection math fix** (behavior change):
  `projectedEffectiveRate(price, estHours, committedExtraHours,
  committedExtraValue)` now ADDS the chargeable value of committed extra
  work to the numerator — fairly/better-charged extras hold or RAISE the
  effective rate (green callout reachable), free/undercharged extras lower
  it; classic fixture 1500/(20+12)=46.88 unchanged (4th arg omitted).
  New `Calc.committedValue` (approved+pending request value, declined
  excluded). (5) **Alert color coding**: `.killer.danger` = red border/tint
  + ⚠️ (rate drop), `.killer.ok` = green border/tint + ✅ (rate holds/
  rises); real red/green now flow through `--danger*`/`--ok*` variables
  (dark + light themes; removed a stale duplicate grey `--ok` block).
  (6) **History action colors**: Approve = `#22c55e` green
  (`.mini.ok`), Decline = `#ef4444` red (`.mini.danger`). Test page grew
  to **86 assertions, 86 pass**. Verified live: theme toggle round-trip,
  accent apply/reset + .btn-primary repaint, days labels, red/green
  callouts, button colors, zero console errors.

- 2026-09-09 — **Major refactor: CalcMall is now a Unified Business ERP
  Engine** (default view) with a standalone **All Utilities** section.
  Sidebar restructured to 🏢 Master ERP Engine / 📦 Item & Client Database /
  📜 History & Saved Documents / 🎨 Brand & Theme Settings / 🛠️ All
  Utilities. New modules in `app.js`: **Brand kit** (`calcmall_brand_v1`:
  company name/tagline/address/contact, logo upload, default terms — used
  as the letterhead on ERP PDFs), **Item & Client Database**
  (`calcmall_db_v1`: SKUs with unit + default rate; clients with address +
  default currency), and the **Master ERP Engine** (`calcmall_erp_v1`):
  project/client header (project name auto-fills client + address +
  currency from the DB; ref placeholder per mode `REF/PI/INV/DN-2026-001`),
  item rows with **SKU auto-fill** (name/unit/rate), Document Mode tabs
  (Quotation-Offer / Pro Forma / Tax-Commercial Invoice / Delivery Note;
  delivery hides Rate+Amount and the money summary; per-mode meta fields:
  bank/SWIFT for pro forma, VAT reg no + consignee for commercial),
  discount/VAT (default 18) with live summary, editable per-document terms
  (falls back to brand defaults), letterhead **Generate Document PDF**
  (logo, contact line, itemized table with comma thousands, totals, terms,
  signature — via html2pdf) and **Save Draft**; all exports/copies
  snapshot into `calcmall_history` with reload/re-download. The 12
  standalone calculators moved to the **All Utilities** grid
  (click = preview, **double-click = open**), each keeping its own currency
  selector and comma formatting. `formatAllNumericInputs` is now delegated
  (focusin/focusout) so dynamic rows get comma painting too. resetAll also
  clears `calcmall_erp_v1`, `calcmall_db_v1`, `calcmall_brand_v1`.
  Verified live: brand→DB→ERP auto-fill chain, math (25m@$1,500 = $37,500;
  5% disc; 18% VAT → $42,037.50), delivery-note column hiding, all four
  doc modes, doc content (letterhead/T&C/signature), PDF pipeline, Save
  Draft→history, dblclick, theme toggle, reset coverage, zero console
  errors. README gains a "Master ERP Engine (v0.4)" section.
- 2026-09-08 — **Added tool #05 — Smart Invoice & Document Builder** and
  polished tools #02/#03: Quotation nav label shortened to "Quotation";
  "📄 Export to PDF" added to Quantity & Rate (html2pdf table + grand
  total); the static Invoice placeholder replaced by a universal builder
  (Document type dropdown: Quotation / Proforma Invoice / Commercial-Tax
  Invoice / Delivery Note; per-type dynamic fields; letterhead customizer
  with logo upload; grouped-money totals via an upgraded `fmtMoney` with
  thousands grouping — now `Rs62,500.00`; html2pdf "Generate Document
  PDF"). Verified live: all four doc-type field sets, delivery-note column
  hiding (computed `display:none` on rate/amount columns + hidden
  summary), company/client/items/total in the generated doc, both PDF
  buttons fire, QR example total 62,500, persistence, other tools intact,
  zero console errors. Test page grew to 42 assertions. Docs updated.
- 2026-09-08 — Homepage expansion: added the "How CalcMall Works" 3-step
  grid, "Why Use CalcMall" two-column SEO copy (tradespeople/engineers/
  freelancers), a 4-question FAQ accordion (native `<details>`), and a
  professional footer with Terms/Privacy modals, a quick tool link, and
  Reset all data. Verified live (accordion, both modals, footer links,
  glass styles, zero console errors); README/run-doc QA updated.
- 2026-09-06 — User chose Path A (digital products), $0 start, AI as business
  assistant; stated no-face/no-voice constraints and desktop specs.
- 2026-09-07 — User decided NOT to pay for Monetise; plan = stay on WhatsApp
  waitlist, watch Episode 2 free. Imported ChatGPT memory into this workspace.
- 2026-09-07 — User corrected the record: is **18 (adult), not a minor**, has
  their **own debit card**, but still keeps the $0-until-demand rule.
- 2026-09-07 — Digital Mall plan adopted; first district chosen (freelancer
  tools); competition research done; "Freelance Scope Guard" concept selected.
- 2026-09-07 — MVP v0.1 built (all files above); spec followed strictly
  (no accounts/backend/payments/AI-in-product).
- 2026-09-07 — Restyled to dark emerald two-column dashboard; inline Change
  Order Generator replaced the modal; fixed "Add Request card never shown"
  bug. Live preview registered + verified; `preview.html` + `.freebuff/run.md`
  created.
- 2026-09-07 — UI refinements: zero-baseline rates/drop now show "—" (no
  $0.00/hr/NaN%/0.1%); history table = Task | Added hours | Value | Status
  badge (Approve/Decline/Reopen mini-controls) | Actions incl. Delete;
  generator Copy button is "📋 Copy to Clipboard" → "Copied! ✓" for 2 s with
  a slide-down reveal.
- 2026-09-08 — Nav + units polish: header now has Login (link) and Sign up
  (primary) buttons that open a glass modal ("Accounts coming soon in v2.0
  — all tools are currently free and run locally in your browser!"; closes
  via button, overlay click, or Esc), plus a ☀️/🌙 theme toggle that flips
  `[data-theme="light"]` on <html> with a full light variable palette and
  persists the choice in localStorage (`cm-theme`). Hours | Days toggles
  now dynamically relabel fields ("Estimated hours/days", "Target
  hourly/daily rate", "Extra hours/days", "Charge rate /hr · /day") and
  update placeholders (e.g. 60/hr vs 400/day); a daily-rate entry is
  converted to canonical hourly (÷ 8) for storage so all math stays
  correct, and the request form inherits the project's unit. Verified live:
  modal open/close, theme toggle + persistence, days project 3200/2d @
  400/day → $200.00/hr effective, 1-day request @ 400/day → $400 value,
  change-order text in days. NOTE: the embedded preview browser can lose a
  localStorage write if the page is reloaded immediately after — real
  browsers are fine.
- 2026-09-08 — Fourth restyle same day: glassmorphism pass — grayscale
  Unsplash abstract background (on body::before so the filter never grays
  the UI), frosted-glass cards (blur 16px), platinum-silver text, silver
  glass pills, fadeInUp landing entrance, bgPulse background pulse, springy
  icon-badge hovers on cubic-bezier(0.16,1,0.3,1). Verified via computed
  styles + screenshot; zero console errors.
- 2026-09-08 — Third restyle same day: minimalist black-and-white theme
  (pure black + pulsing radial glow, Inter, cubic-bezier motion) and the
  big landing cards replaced by a compact app-style tool selector bar
  (Scope Guard / Pricing / Invoice circular badges) + a preview card with
  an "Open Calculator" button. `TOOLS` registry + `selectTool()` in app.js
  lets future tools plug in; unavailable tools show "Coming soon" and a
  disabled button. Fixed a `[hidden]`-vs-`.pill display` bug with a global
  `[hidden]{display:none!important}` rule. Verified live: badge switching,
  coming-soon state, fonts loaded, zero console errors.
- 2026-09-08 — Second restyle same day: all-blue theme replaced with a dark
  black tech theme (pitch-black `#050505` body + abstract Unsplash overlay,
  matte black `#0f0f0f` cards with `#222` borders, neon green `#22c55e`
  accents/buttons with black text, dark-green badge pills, white headings
  and `#a1a1aa` grays, glowing CTA shadow). Verified live: computed styles
  match spec, Unsplash image loads, zero console errors.
- 2026-09-08 — Rebranded the platform to **CalcMall** (sub-headline: "Free
  Micro-Calculators & Estimates for Professionals and Contractors") and the
  tool to "Project Change & Scope Calculator" (tool #01). Added header nav +
  Home link and a Home/All Tools landing view with a featured tool card.
  Added Hours | Days unit toggles (8-hour day) in Project Setup and Add
  Request — all math, displays, and change-order text adapt. Restyled the
  whole app to the all-blue theme (obsidian/navy/cobalt/sky, glow hover on
  the featured card). Rebuilt `preview.html` in sync; live preview
  re-registered and verified: landing→tool navigation, days math (2.5 d =
  20 h → $75/hr; 1.5-day request @60 → $720, 37.5% drop, $900 break-even),
  zero console errors.
- 2026-09-07 — Currency picker expanded to all 155 ISO 4217 circulating
  currencies. Currencies now stored by ISO code (`LKR`) instead of bare
  symbols (`Rs`); formatter maps code → common symbol, falls back to the code
  for symbol-less currencies, and legacy symbol-based saved data migrates
  automatically.
- 2026-09-08 — **Added tool #02 — Quantity & Rate Calculator** (no redesign,
  existing tools untouched). Added a Qty & Rate badge to the tool selector
  bar and a dedicated `#qr-view` (banner + line-items table + total bar +
  Add row/Clear all), plus a footer quick link. New `fmtNum` in
  calculations.js (thousands grouping, ≤2 decimals); QR module in app.js
  (rows persist under `cm-qr-v1`, Amount = Qty × Rate live, invalid/blank
  inputs show "—" and are excluded from the total, Enter on the last row
  adds + focuses the next, ✕ removes a row). Pricing → Tool #03 and Invoice
  → Tool #04. Verified live: example rows (25×1500=37,500; 4×2500=10,000;
  1×15000=15,000) total 62,500; decimals 8.75; negative qty → "—" with total
  uncorrupted; row removal + persistence across reload; scope-guard tool
  intact; zero console errors. `preview.html` rebuilt in sync; test page
  grew to 32 assertions.
- 2026-09-08 — **Added tool #03 — Engineering Quotation & BOQ Generator**
  (no redesign). Added a Quotation badge (📑) to the tool selector bar and a
  dedicated `#boq-view` (Quotation Details, Bill of Quantities, Discount /
  VAT & Summary), plus a footer link and an offscreen `#quotation-doc` for
  the PDF. New BOQ helpers in calculations.js; BOQ module in app.js
  (`cm-boq-v1` meta/lines/discount/vat, live totals, html2pdf.js CDN
  export of a formal A4 letter with METRIX letterhead, recipient, itemized
  table, totals, T&C and signature). Pricing → Tool #04, Invoice → Tool
  #05. Verified live: example items (25 m 1500, 4 Nr 2500, 1 Lot 15000) →
  sub Rs62,500.00, 5% discount −Rs3,125.00, net Rs59,375.00, 18% VAT
  +Rs10,687.50, final Rs70,062.50; invalid qty → "—" excluded; Enter adds
  a row; the quotation doc contains letterhead/recipient/table/terms/
  signature; html2pdf `.save()` triggered; persistence across reload; other
  tools intact; zero console errors. `preview.html` rebuilt in sync; test
  page grew to 40 assertions.
- 2026-09-08 — **Tools #04–#10 + global currency** (partly from a failed
  turn, completed and verified): #04 Margin & Markup Pricing (`cm-pr-v1`,
  seg toggle margin⇄markup); #06 Import Tax & Landed Cost (`cm-duty-v1`,
  CIF × duty/PAL/CESS/SSCL/VAT%, VAT default 18); #07 Variation & Change
  Order (`cm-var-v1`, revised value + % increase + formal PDF);
  #08 Rate & Overhead Breakeven (`cm-bk-v1`, admin hours → lost days,
  gross-up for tax, min hourly/daily); #09 Cross-Border FX & Fee Adjuster
  (`cm-fx-v1`, gross-up (target+fixed)/(1−pct−fx), platform presets);
  #10 GPA & Target Grade Planner (`cm-gp-v1`, required average + course
  score needed). Per-tool currency selectors (8 currencies) in every tool
  banner, persisted in `cm-currency-v1`; TOOL_CURRENCIES + fmtToolMoney in
  calculations.js.
- 2026-09-08 — **Left sidebar, History, Tools #11–#12, rebrand**: fixed/
  collapsible **left sidebar** (🛠️ Tools Dashboard / 📜 History / ⚙️
  Settings / Currency; sticky ≥1025px, overlay drawer + header ☰ Menu
  button below; desktop collapse toggles `body.sidebar-collapsed`).
  **History** (`calcmall_history` + `calcmall_history_drafts`): pushHistory
  hooks on all 7 PDF exports and 8 copy summaries (tool, title, total with
  currency, timestamp; cap 60); History view with View/Load draft,
  Re-download PDF (re-runs the tool's export), Delete, Clear all.
  **#11 Retainer & SLA Pricing** (`cm-rt-v1`, (h×rate+oh)/0.7-style
  gross-up × SLA surcharge) and **#12 Project Delay & Damages Impact**
  (`cm-dl-v1`, daily penalty % capped, extended overhead). **Numeric
  inputs** → text+inputmode=decimal with `data-numeric="1"`; commas
  painted on blur, stripped on focus; `num()` comma-safe (49 inputs).
  **Double-click** a tool icon opens it directly. Rebrand: "Micro-
  Calculators & Estimates for Businesses, Teams, and Professionals", Free
  mentions removed, #06 renamed. New build scripts: `build-preview.ps1`
  (UTF-8!) and `build-test.ps1`. Verified live: 12 slots, sidebar nav +
  settings/history views, history save/view/delete/clear, retainer
  (20h×3500+15000 → Rs133,571/mo, 36.4% margin), delay (5M, 0.5%/day,
  10% cap, 15d, 25000/d → Rs750,000 = 7.5% of contract, capped flag),
  dblclick, comma painting, reset-all clears history; **82/82 test
  assertions pass**; zero console errors.

## 8 · Standing instructions to future assistant sessions

- Start by reading this file, then the conversation handoff facts it captures
  (profile, constraints, plan) rather than re-asking the user for basics.
- Act as the user's AI business/building assistant for CalcMall, with
  $0 and no-face/no-voice enforced in every suggestion.
- Keep the product files canonical; treat `preview.html` as generated and
  regenerate it (per `.freebuff/run.md`) whenever `index.html`, CSS, or JS
  change — then re-verify with the Preview tools.
- School, safety, and legality come before business. Never suggest bypassing
  age/payment restrictions or spending money.

### 2026-09-10 · Formal Metrix document layout (PDF engine v2)

All invoice-family exports now render the **formal Metrix Engineering
layout** (user-specified):
- **Letterhead**: logo + company name/registered address/phone/email/
  website/specialization tagline left; document banner right (type, Doc No,
  Date, supplier TIN). New brand fields: `phone, email, website, spec, tin`.
- **Two-column metadata box**: Consignee/Billed-To (customer, address,
  contact person, TIN, place of supply) | Order Details (PO no, project,
  delivery terms, ship-to, HS code). New erpState fields: `contact,
  clientTin, placeOfSupply, poNo, deliveryTerms, shipTo, hsCode`.
- **Line-item table**: Item # / Description-Specification / Unit / Qty /
  Rate / Total Amount — money columns right-aligned, comma-formatted.
  Shared builder: `formalLetterhead/formalMetaBox/formalLineTable/
  formalTotalsFoot/fmWordsLine/formalBankBlock/formalSignoff/
  formalTermsBlock` in app.js (`.fm-*` classes in both style.css and
  PRINT_DOC_CSS).
- **Totals**: Sub Total → Discount → Net Amount → VAT/Tax → FINAL TOTAL +
  full-width **"Amount In Words / Due Amount in Words: Rupees … Only"** —
  new `Calc.amountInWords()` (international scales; cents; currency word
  map `FM_CUR_WORDS` for all 15 currencies). Blank→'Zero' fallback.
- **Two-column footer**: Bank & Beneficiary (payment terms, beneficiary,
  bank & branch, SWIFT, branch code, account no + currency — brand fields
  with per-document ERP/invoice overrides) | sign-off ("On Behalf of …",
  signature line, dashed round **company-seal** area).
- **A4 print rules**: `@page A4 portrait, 15mm`; black text on white;
  `1px solid #000` borders; `tr/fm-words/fm-footer/fm-terms/quo-sign`
  page-break-inside: avoid; `thead: table-header-group`. Same rules in
  the standalone print window (PRINT_DOC_CSS) and app @media print.
- Applied to all 5 exporters: ERP (all 4 modes; delivery = no money cols,
  no bank block, no words line), Smart Invoice (brand-kit letterhead
  fallbacks; Make&Model folded into description; delivery hides money),
  BOQ Quotation, Quantity & Rate sheet (brand letterhead now), Variation
  (formal head + approval sign-pair footer).
- New brand storage keys (in `calcmall_brand_v1`): bank block fields.
  Test suite **91/91 pass** (new: amountInWords cases). Verified live:
  full letterhead/metadata/words/bank/seal rendering on every exporter,
  zero console errors; seeded test data cleaned.

### 2026-09-10 · UI cleanup: navbar removed, glass cards, DB grid cards

- **Top header bar deleted** (`<header class="site-header">` removed from
  index.html; `.site-header`/`.header-inner`/`.site-nav`/`.nav-link` are
  `display:none` in CSS). Sidebar is the only nav chrome; its 🏬 CalcMall
  brand button has `margin-bottom: 24px` and still opens Home. New
  **sidebar footer**: Home · Toggle theme · Login/Sign up (all old navbar
  controls, same ids — JS untouched except `applyTheme` now sets an inner
  `<span>` label, and `#brand-home` wiring is guarded because the element
  is gone). Mobile <1025px: floating **☰ Menu** button (inside `<main>`,
  before the sidebar) opens the drawer as before.
- **Cards**: `background: rgba(22,24,29,0.7); backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.08); padding: 24px; margin-bottom:
  20px` (640px: 20px). **Inputs**: `background:#1e222b;
  border:1px solid #333947; color:#f1f5f9; radius 8px; padding 10px 14px;
  font 14px`; placeholders `#94a3b8`; hints `.hint` → `#94a3b8/13px`;
  `h2` → `18px/600/#ffffff`. Light theme gets white inputs + slate
  placeholders; the old light `.site-header` rule removed.
- **Item & Client Database**: tables replaced by full-width **grid cards**
  (`.db-list` + `.db-list-head` + `.db-row.db-grid-items/.db-grid-clients`,
  5/4-column grids, subtle row dividers, hover tint, stacks to 2 columns
  under 760px). `renderDb()` now emits divs (same `db-item-del`/
  `db-client-del` handlers, data-id = index). Row buttons: primary actions
  keep high-contrast `.btn-primary` fill; secondary stay `.btn-ghost`
  outlined.
- Verified live: all 5 sidebar views + Home nav, drawer open/close, theme
  toggle from sidebar, add/remove DB item renders grid card with right-
  aligned rate; 91/91 tests pass; console clean.

### 2026-09-10 · Print engine → hidden iframe (pop-up-blocker-proof)

- `openPrintWindow()` no longer calls `window.open()` (which blockers
  could suppress → the old "allow pop-ups" alert). It now creates/reuses a
  single hidden `<iframe id="print-frame">` appended to `document.body`
  (`position:fixed; top:-9999px; left:-9999px; width:794px; height:1123px;
  visibility:hidden` — kept off-screen and *rendered*, not display:none,
  and A4-sized so layout matches paper; created lazily on first export).
- Compiled standalone HTML is written via
  `frame.contentWindow.document.open()/write()/close()`; the engine waits
  for pending images (load/error + 2s safety net) or readyState, then
  `contentWindow.focus()` + `contentWindow.print()` — guarded by a
  `printed` flag so safety-net timers and load listeners can't
  double-print; `frame.onload` uses property assignment (no listener
  build-up across exports).
- Pop-up-blocker `alert()` removed (path can't be blocked). All 5
  exporters (QR, BOQ, Invoice, Variation, ERP) share the frame — verified
  live: 1 frame after 6 exports, each document written fully (letterhead,
  line items), `contentWindow.print()` called exactly once per export,
  console clean. History re-download unchanged (same funnel).

### 2026-09-10 · ERP Record IDs + Excel/CSV import

- **Record store** (`calcmall_erp_records_v1`): "Primary Key / Record ID"
  bar atop ERP Section 1 — ID input + **Load Record / Save Record /
  Delete** + live meta line. Save snapshots the ENTIRE active form
  (`readErpHeader()` mirrors every header input + live line cells into
  erpState, then deep-clones); Load restores all fields, lines, mode,
  discount/VAT, terms, currency and re-renders (Enter in the ID field
  also loads; overwriting asks confirm; saved records listed with
  client/lines/date). Reset-all clears the store.
- **Excel/CSV import** (SheetJS CDN `xlsx@0.18.5`): 📥 Import Excel / CSV
  in the ERP banner + ⬇ Template download
  (`CalcMall-ERP-import-template.xlsx`: "Header" Field/Value sheet +
  "Items" SKU/Description/Unit/Qty/Rate sheet). Parser is
  fuzzy-header-based (`normCol` strips case/spaces/punct): finds the
  header row with most known column names, reads Field/Value sheets into
  header fields (project, client, address, TIN, PO no, discount, VAT…)
  and appends item rows (SKU/Description/Unit/Qty/Rate, comma-safe) from
  every sheet. Works with xlsx/xls/csv (CSV via the same fuzzy matcher);
  graceful alerts when the CDN is offline or nothing matches.
- Verified live: save → reset → load round-trip (Rs630,563 totals
  restored), real .xlsx import filled 7 header fields + 3 lines
  (subtotal Rs43,000 → final Rs45,666), CSV header-sheet import, template
  capture, delete record; console clean; state reset after tests.

## 2026-09-10 — Layout polish + background color customization
- Sidebar: fixed, flush to viewport left edge (left:0, top:0, 100vh), flex 232px column.
- Footer: TOOLS column removed; only CalcMall brand block (left) + LEGAL links (right).
- Theme settings Section 3: "Background & accent colors" — 5 bg presets (pure black, obsidian #0a0f1d, navy #111c38, #162347, seal #111b26) + custom <input type=color id="bgpicker"> + Reset; sets --bg on <html> (body{background:var(--bg)}); persists in localStorage cm-bg-v1. Accent (Section 4) persists cm-accent-v1 driving --accent/--accent-ink/--accent-soft/--accent-line/--glow.
- BUGFIX: duplicate `const ACCENT_KEY` declaration (theme block vs accent block) killed the entire script — removed.
- BUGFIX: initAccentBg used `$('bg-picker')` but real id is `bgpicker` — picker now restores saved color on load.
- Verification (preview.html:63026): preset/custom/reset flows update body bg instantly + persist across reload; accent swatches set/clear vars; sidebar fixed left:0; footer headings = [Legal]; console clean; state pristine (bg reset, theme dark).
