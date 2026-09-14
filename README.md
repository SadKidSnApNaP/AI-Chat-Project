# Project Change & Scope Calculator — CalcMall Tool #01

**CalcMall** — *Micro-Calculators & Estimates for Businesses, Teams, and
Professionals* — opens on a Home/All Tools landing view (header nav with a
☰ Menu button + logo + Home link) and a **fixed/collapsible left sidebar**
(🛠️ Tools Dashboard · 📜 History · ⚙️ Settings / Currency — overlay drawer
under 1025px, collapse toggle on desktop). The landing shows a compact
app-style tool selector bar: 48px circular badges for all **12 tools**
(Scope Guard · Qty & Rate · Quotation · Pricing · Invoice · Import Tax ·
Variation · Breakeven · FX & Fees · GPA Planner · Retainer · Delay
Impact) with a spring hover (`translateY(-4px) scale(1.05)`) and a glowing
ring on the active one — **double-click any icon to open that tool
immediately**. A sleek preview card beneath has an "Open Calculator"
button. Black-and-white glassmorphism theme: a grayscale-filtered abstract
background image (vignette + slow `bgPulse`) behind frosted-glass cards —
`rgba(18,18,18,0.75)` with `backdrop-filter: blur(16px)` and hairline
white borders — Inter typography with `-0.03em` header tracking,
`#cbd5e1` platinum-silver body text, silver glass pills, a staggered
`fadeInUp` landing entrance, and springy icon-badge hovers on
`cubic-bezier(0.16, 1, 0.3, 1)` (respects `prefers-reduced-motion`).

**History** — every PDF export or summary copy automatically saves a
snapshot to `localStorage` (`calcmall_history`): tool name, client/project
title, calculated total with currency, and a timestamp. The sidebar's
📜 History view lists entries with **View / Load draft**, **Re-download
PDF**, and **Delete** actions, plus Clear all. **Numeric inputs** accept
and display comma thousands separators (1,000,000.00) — commas are
stripped on focus and repainted on blur; all math stays comma-safe.
Every tool header has a per-tool currency selector
(LKR/USD/EUR/GBP/AED/AUD/CAD/SGD) that live-updates totals, table
headers, and PDF exports.

Below the featured card the landing carries three content sections plus a
footer: the **How CalcMall Works** 3-step grid (Set Baseline → Track Scope
Changes → Send Change Orders), the **Why Use CalcMall** two-column SEO copy
block ("Built for Businesses, Founders, and Independent Professionals"), a 4-question
**FAQ accordion** (native `<details>`), and a professional footer with
Terms of Use / Privacy Policy modals, a quick tool link, and **Reset all
data**.

**Tool #01 — Project Change & Scope Calculator:** a free, private,
single-page web tool for freelancers who undercharge for "just one more
thing." Track scope creep, calculate what an extra client request really
costs against your effective hourly rate, and send a professional
change-request message.

> Positioning: *Track scope. Calculate the cost. Send the change request.*
> Know when a project stops being profitable.

**Tool #02 — Quantity & Rate Calculator:** a fast, spreadsheet-free
line-item estimator for engineers, contractors, and tradespeople. Enter
**Item / description · Qty · Unit · Rate** for each row and the **Amount**
and running **Total** update instantly — no Excel, no formula errors. Rows
can be added and removed quickly, decimals are handled, and invalid/blank
inputs show "—" instead of corrupting the total. Enter on the last row adds
the next one. Units are suggested via a datalist (No., Item, m, Meter, Lot,
kg, L, set, each, hr, day, m², m³). **Export to PDF** renders the line-item
table + grand total as a clean printable document (hidden-iframe print engine).

## What it does (MVP v0.1)

1. **Project setup** — one fixed-price project (price, estimated time with
   an Hours | Days toggle — 1 day = a standard 8-hour working day — target
   hourly rate, revisions included). Currency picker lists 155 ISO 4217
   world currencies (stored by code; formatted with familiar symbols).
   Stored only in your browser.
2. **Extra-request calculator** — enter what the client asked for, the extra
   time (hours or days), your charge rate and expenses, and see live results.
3. **Scope-impact dashboard** — original vs. current estimate with the
   headline number: *"Your effective rate has dropped X%."* Plus unbilled
   work in progress and committed extra hours.
4. **Change-order generator** — an inline panel that writes copy-paste
   professional messages (out-of-scope change order, extra-revision, or
   in-scope heads-up).
5. **Request history** — log every request with Pending / Approved /
   Declined status. Declined work is excluded from every calculation.

### Tool #02 — Quantity & Rate Calculator

1. **Line-item table** — Item / description · Qty · Unit · Rate · Amount,
   plus a per-row **✕ Remove** button and an **＋ Add row** button.
2. **Amount = Quantity × Rate**, computed live on every keystroke.
3. **Running Total** bar under the table (thousands-grouped, up to 2
   decimals, trailing zeros trimmed — currency-free, e.g. `37,500`).
4. **Invalid-input guard:** blank or negative qty/rate shows "—" in the
   amount cell and is excluded from the total (never `NaN` or a broken
   number).
5. **Keyboard-friendly:** Enter on the last row adds and focuses the next
   row; an already-empty last row is focused instead of duplicated.
6. **Persistence:** rows save to `localStorage` under `cm-qr-v1` and survive
   a reload; **Clear all** wipes them. "Reset all data" also clears them.

### Tool #03 — Engineering Quotation & BOQ Generator

1. **Quotation details** — client name, designation, company, address, date
   (defaults to today), and a quotation ref number.
2. **Itemized BOQ table** — Item description · Unit (Nr/Lot/m/Item/Set… via a
   datalist) · Qty · Rate (LKR); **Amount = Qty × Rate** updates live, with
   a per-row **✕ Remove** and **＋ Add item** (Enter on the last row adds the
   next).
3. **Discount & VAT** — optional **Discount %** and **VAT %** (e.g. 5% / 18%).
4. **Live summary** — Sub total → Discount → Net (after discount) → VAT →
   **Final total**; invalid/blank qty/rate rows show "—" and are excluded.
5. **PDF export** — **Download Client Quotation PDF** (via the built-in
   hidden-iframe print engine) renders a formal A4 letter: METRIX
   ENGINEERING SERVICES letterhead, recipient & ref/date block, a clean
   itemized table, the totals, standard Terms & Conditions (Payment /
   Warranty / Mobilization / Validity), and an Engineer signature block.
   Data persists under `cm-boq-v1`; **Reset quotation** clears it.
   (Printing is fully offline and cannot be blocked by pop-up blockers.)

### Tool #05 — Smart Invoice & Document Builder

One dynamic builder for four document types, switched via a **Document
type** dropdown:

1. **Quotation** — client name, date, quotation ref.
2. **Proforma Invoice** — adds Payment terms, Bank name, Account number,
   SWIFT code, Branch code.
3. **Commercial / Tax Invoice** — adds Invoice no, Date, VAT/Tax reg no,
   Consignee details, Bill-to, and a **Currency** selector (LKR / USD).
4. **Delivery Note** — the Rate and Amount columns are hidden in the table
   and the totals summary disappears; fields become Deliver-to, Delivery
   date, Note no, Delivery address.

Plus, shared across all types:

- **Line items** — Description · Model · Unit · Qty · Rate · Amount
  (Amount = Qty × Rate, live), per-row ✕, ＋ Add item, Enter-to-add.
- **Your Business (Letterhead)** — company name, address, contact, and an
  optional **logo upload** (rendered on the document letterhead).
- **Live totals** — Sub total and Total with thousands grouping
  (`Rs62,500.00`); invalid/blank rows are excluded.
- **Generate Document PDF** — a letterhead-formatted A4 document (company
  header + logo, recipient/ref block, itemized table, totals) via
  html2pdf.js. Data persists under `cm-inv-v1`; **Reset document** and
  "Reset all data" both clear it.

### Tools #04 · #06–#12 — quick reference

- **#04 Margin & Markup Pricing** (`cm-pr-v1`) — base cost + overhead %, a
  Margin % ⇄ Markup % segmented toggle, selling price / net profit / actual
  margin & markup, Copy Pricing Summary.
- **#06 Import Tax & Landed Cost** (`cm-duty-v1`) — CIF value + Customs
  duty / PAL / CESS / SSCL / VAT % (VAT defaults to 18), total tax payable,
  component breakdown, landed cost per unit, Copy Breakdown. Percentages
  apply to CIF exactly as entered — no country/HS-specific rules.
- **#07 Variation & Change Order** (`cm-var-v1`) — project name, original
  contract value, added material/labor cost, time extension (days), work
  description → revised value, % increase, formal **Export Variation PDF**
  with an approval signature block.
- **#08 Rate & Overhead Breakeven** (`cm-bk-v1`) — target net income +
  overhead + tax % over working days minus unbilled admin hours/week →
  billable hours/year, gross revenue needed, **minimum hourly & daily
  rate**, breakeven-vs-profit summary card, Copy Summary.
- **#09 Cross-Border FX & Fee Adjuster** (`cm-fx-v1`) — target payout +
  platform presets (Stripe 2.9%+$0.30, PayPal, Wise, wire, custom) + FX
  markup % and a sender→receiver currency route → the **exact amount to
  invoice** so you net the target, full fee-loss breakdown, Copy Invoice
  Amount. (No live FX rates — the markup % models conversion cost.)
- **#10 Academic GPA & Target Grade Planner** (`cm-gp-v1`) — current GPA +
  credits completed vs. target GPA + remaining credits → **required
  average** (with an impossible-feasible verdict), plus a course planner:
  current/target grade % + remaining graded weight → **score needed**
  (locked/cushion flags), Copy Summary.
- **#11 Retainer & SLA Pricing Estimator** (`cm-rt-v1`) — included hours ×
  blended rate + overhead → cost, then margin % and SLA surcharge % →
  **monthly retainer price**, effective hourly on included hours, annual
  contract value, Copy Summary.
- **#12 Project Delay & Damages Impact** (`cm-dl-v1`) — contract value ×
  daily penalty % (capped at cap %) + extended overhead/day × delay days →
  **total damages exposure**, penalty/overhead split, % of contract,
  capped-warning, Copy Summary.

All twelve tools share the glass design system, persist locally, respect
their per-tool currency selector, and record history entries on export/
copy.

## Files

```
index.html                  # sidebar (ERP · Database · History · Brand · Utilities) + 12 tool views
css/style.css               # mobile-first styling, no frameworks
js/calculations.js          # pure math + formatting (window.Calc)
js/platform.js              # platform/export switchboard (browser · Electron · Android)
js/app.js                   # state, rendering, events, history, PDF exports
js/cloud.js                 # the only file that talks to Supabase
vendor/                     # vendored libraries + fonts + backdrop (A2, see below)
test/calculations.test.html # no-dependency browser assertion runner
build-preview.ps1           # regenerates preview.html from the sources
build-test.ps1              # regenerates the self-contained test page copy
README.md
MEMORY.md
```

> `preview.html` is a **generated** single-file copy for the Preview tab —
> do not edit by hand; edit the sources and regenerate with
> `build-preview.ps1` (see `.freebuff/run.md`).

## Master ERP Engine (v0.4)

The default view (🏢 in the sidebar) is a **unified document builder**:

- **Item & Client Database** (📦): master SKUs (key, name, unit, default
  rate) and clients (name, address, default currency), stored in
  `calcmall_db_v1`.
- **Records & import**: a **Primary Key / Record ID** bar (Load / Save /
  Delete) snapshots the entire active document — header, items, mode,
  discount/VAT, terms — under any ID in `calcmall_erp_records_v1` and
  restores it instantly. **📥 Import Excel / CSV** (SheetJS) fills header
  fields from Field/Value sheets and appends line items from
  SKU/Description/Unit/Qty/Rate columns (fuzzy column matching; ⬇
  Template downloads the exact expected format).
- **ERP header**: picking/typing a **Project name** auto-fills the client,
  address and currency from the client database; the reference-number
  placeholder follows the mode (`REF-2026-001`, `PI-…`, `INV-…`, `DN-…`).
- **SKU auto-fill**: typing/picking an Item Key in a line row fills name,
  unit and rate from the item database (unknown keys are kept as typed).
- **Document Mode tabs**: Quotation / Offer · Pro Forma Invoice (payment +
  bank fields) · Tax / Commercial Invoice (VAT reg no, consignee) ·
  Delivery Note (hides Rate/Amount columns and the money summary).
- **Brand & Theme Settings** (🎨): company name, tagline, address,
  contact, **logo upload**, **default terms**, plus the formal letterhead
  fields (**phone, email, website, specialization tagline, supplier TIN**)
  and a **Bank & Beneficiary** block (payment terms, beneficiary, bank &
  branch, SWIFT, branch code, account number + currency) — stored in
  `calcmall_brand_v1` and used on every generated document.
- **Generate Document PDF (formal layout)**: Metrix-style A4 sheet —
  letterhead (logo + registered address + phone/email/web + specialization
  tagline) with a document banner right (type, doc no, date, supplier TIN);
  two-column metadata box (consignee/billed-to | order details: PO no,
  project, delivery terms, ship-to, HS code); standardized line-item table
  (Item # / Description & Specification / Unit / Qty / Rate / Total Amount,
  money columns right-aligned, comma-formatted); right-aligned totals
  (Sub Total → Discount → Net Amount → VAT/Tax → FINAL TOTAL); **Amount In
  Words** line ("Rupees … Only", currency-aware); terms block; and a
  two-column footer (bank & beneficiary | "On Behalf of …" sign-off with
  signature line and company-seal area). A4 portrait, 15 mm margins, black
  text on white, `1px solid #000` table borders, and page-break protection
  for rows/totals/footer. Delivery notes omit money columns and the bank
  block. **Save Draft** and every export snapshot into `calcmall_history`
  for reload/re-download from the History view.
- **All Utilities** (🛠️): the 12 standalone calculators behind one grid —
  click previews, **double-click opens instantly**; every utility keeps
  its own currency selector and comma formatting.

## Run (free, no build step)

Double-click `index.html` to open it in a browser. No server and no install
needed — every asset is local, so it also works from `file://`.

### Vendored assets (A2) — and what "offline" actually means now

`vendor/` holds the four libraries (`html2pdf`, SheetJS `xlsx`, `exceljs`,
`supabase-js`), the Inter/Roboto woff2 subsets, and the backdrop image. Nothing
is fetched from a CDN on load: a clean start pulls **14 resources, all local,
zero external requests**. The four CDN URLs remain in `index.html` only as a
fallback, used when a vendored file is missing or truncated.

*Offline* therefore means: the app starts, every calculator runs, every PDF and
Excel export works, and the databases are readable — all with no network.
Signing in and cloud sync obviously need a connection; the app stays usable from
its local cache without one, and queues changes for the next successful sync.

`vendor/` is ~3.7 MB and is meant to be committed — the deploy is a git push, so
those files must be in the tree for the live site to work.

## Test

Open `test/calculations.test.html` in a browser (double-click). It runs
**86 assertions** against `calculations.js` and shows PASS/FAIL per row,
including the spec fixture (20 h / $1,500 → 32 h → $46.88/hr, −37.5%),
all 12 tools' math helpers, and the fee/duty/GPA edge cases.

Run it **before** every deploy and after any change to the math.

### Manual QA checklist (do after code changes)

- [ ] Landing first: the app opens on the CalcMall Home/All Tools view;
      "Open tool →", the logo, and the Home link switch views correctly.
- [ ] Homepage sections render: 3-step "How CalcMall works" grid (1 column on
      narrow, 3 on wide), "Why use CalcMall" two-column copy, 4 FAQ items —
      each expands/collapses via its summary (chevron flips).
- [ ] Footer: "Project Change & Scope Calculator" and "Quantity & Rate
      Calculator" links open their tool views; Terms of Use / Privacy Policy
      each open the legal modal with the right copy (button, overlay, or Esc
      closes); "Reset all data" runs the reset flow.
- [ ] Tool #02 (Quantity & Rate): select the Qty & Rate badge → preview card
      shows Tool #02, "Open Calculator →" enabled; clicking it opens the
      line-item view. Add rows, enter the example (Pipe installation 25 m
      1500 → 37,500; Valve installation 4 No. 2500 → 10,000; Testing 1 Lot
      15000 → 15,000) → Total reads 62,500.
- [ ] Qty & Rate decimals: 2.5 × 3.5 → amount 8.75; a negative or blank
      qty/rate shows "—" and leaves the total uncorrupted.
- [ ] Qty & Rate: Enter on the last row adds a new focused row; the ✕ button
      removes a row; rows persist across a reload; "Clear all" empties it.
- [ ] Tool #03 (BOQ): select the Quotation badge → preview shows Tool #03 with
      an enabled button; opening it shows Quotation Details, Bill of
      Quantities, and Discount/VAT/Summary. Fill client fields, add items
      (25 m 1500, 4 Nr 2500, 1 Lot 15000), set 5% / 18% → Sub Rs62,500.00,
      Discount −Rs3,125.00, Net Rs59,375.00, VAT +Rs10,687.50, Final
      Rs70,062.50; the letterhead/terms/signature appear in the generated
      quotation doc; "Download Client Quotation PDF" prints the compiled
      export; data persists across a reload; Reset quotation clears it.
- [ ] Nav names: the tool bar + headings read "Quotation" (not "Quotation
      Tool") and "Invoice" opens the Smart Invoice & Document Builder.
- [ ] Tool #02 PDF: "📄 Export to PDF" sits next to ＋ Add row / Clear all;
      clicking it renders the line-item table + grand total in the hidden print iframe.
- [ ] Tool #05 (Invoice builder): the Document type dropdown swaps the
      dynamic field sets — Proforma shows Payment terms/Bank/Account/SWIFT/
      Branch; Commercial/Tax shows Invoice no/Date/VAT reg no/Consignee/
      Bill-to/Currency (LKR/USD); Delivery Note hides the Rate + Amount
      columns and the totals summary, and swaps in Deliver-to/Delivery
      date/Note no/Delivery address fields.
- [ ] Tool #05 letterhead: company name/address/contact flow into the
      generated document; an uploaded logo appears on the letterhead;
      "Generate Document PDF" prints via the hidden iframe; totals read grouped money
      (Rs62,500.00); data persists under `cm-inv-v1`; Reset document clears
      it.
- [ ] Days math: save a project in Days (price 1500, 2.5 days, target 60) →
      original rate $75.00/hr; a 1.5-day request at 60 → value $720.00,
      drop 37.5%, break-even $900.00, dashboard shows "1.5d" / "4d" and the
      change-order text reads "2.5d (20 h)".
- [ ] First-run: only the setup card shows; dashboard hidden until saved.
- [ ] Save project with empty/invalid price or hours → clear inline error, nothing saved.
- [ ] Save project → summary shows; dashboard appears with original rates.
- [ ] Add a request → appears in history as Pending; dashboard updates.
- [ ] Kill-block check: add hours so the effective rate drops → comparison
      block turns red with the drop % and unbilled value.
- [ ] Approve / decline requests via the status badge mini-controls → badge
      color changes, committed hours, unbilled value, and projected rate
      update; declined work disappears from the totals.
- [ ] History columns read: Task | Added hours | Value | Status | Actions
      (Change order / Edit / Delete); after Add Request the form clears for
      the next entry.
- [ ] Zero-baseline guard: with no usable price/hours the rates and the drop
      display "—" (never $0.00/hr, NaN%, or a stray 0.1%).
- [ ] Copy button: reads "📋 Copy to Clipboard"; after clicking becomes
      "Copied! ✓" for ~2 s, then reverts.
- [ ] Reload the page → project and requests persist.
- [ ] Reset all data → double confirmation, then clean first-run state.
- [ ] Generate a message for each request type + scope → the Change Order
      Generator panel appears in the right column, text is editable, Copy
      works (on `file://` and http), Close hides it.
- [ ] Edit a request → form prefills, button says "Save changes",
      Cancel restores.
- [ ] Two-column check on a wide window: Project Setup + Add Request on the
      left; Live Scope Metrics, Request History, Change Order Generator on
      the right.
- [ ] Check mobile width (~390 px): layout stacks to one column, no
      horizontal page scroll, table scrolls inside its wrapper,
      keyboard/enter flows work.
- [ ] Enter a description with HTML like `<script>` → it renders as plain
      text (XSS check).

## How the math works

- **Time units:** all time inputs accept Hours or Days (1 day = 8 hours);
  values are converted to canonical hours at the input boundary, so every
  metric, drop %, and generated change-order email adjusts automatically no
  matter which unit was used.
- **Original effective rate** = price ÷ estimated hours.
- **Committed work** = requests with status *Pending* or *Approved*.
- **Current projected rate** = price ÷ (estimated hours + committed extra hours).
- **Rate drop** = (original − projected) ÷ original.
- **Unbilled value** = sum of (hours × rate + expenses) over committed requests.
- **Break-even charge** = extra hours × original effective rate + expenses —
  the charge that keeps your blended rate unchanged.

Display rule: rates and the drop % show "—" whenever there is no usable
baseline (price or estimated hours missing/zero) instead of misleading
"$0.00/hr", "NaN%", or "0.1%".

## Deploy (free, when you're ready)

**GitHub Pages (recommended):**

1. Create a GitHub repo and push these files to it.
2. Repo → Settings → Pages → Source: `Deploy from a branch`, branch `main`, root.
3. Your tool is live at `https://<username>.github.io/<repo>/`.

**Cloudflare Pages:** connect the repo and deploy — same result, no config.

Notes:
- The user is 18, so GitHub/Cloudflare accounts are fine in their own name.
  Always follow the platform's own terms.
- Later: a simple `CNAME`/custom domain when (and only when) the tool shows
  real usage.

## Validation plan (do not skip)

The tool is only worth building further if people actually use it.

1. **Pre-launch:** hand it to 5–10 freelancers (friends, forums, Discord).
   Watch whether they *return* and whether they *ask for features* —
   compliments and "I'd use this" are weak evidence.
2. **Launch:** share text posts in freelancer communities that allow it.
   Help people genuinely before linking anything.
3. **Gate:** after ~2 weeks, if nobody returns and nobody asks for features,
   kill or pivot this district. Cost so far: $0 and a couple of weeks of
   spare time.
4. **Only after usage evidence:** consider paid upgrades (advanced
   spreadsheet, more projects, saved message templates). Never assume prices
   work before testing them.

## Header controls (v0.3, relocated in v0.5)

> The top horizontal navbar was removed in the v0.5 UI cleanup — the left
> sidebar is the only navigation chrome. **Login / Sign up / Theme toggle /
> Home** now live in the sidebar footer; on mobile (<1025px) a floating
> **☰ Menu** button opens the sidebar as a drawer.

- **Login / Sign up** — open a modal: *"Accounts coming soon in v2.0 — all
  tools are currently free and run locally in your browser!"* Closes via
  the button, clicking the overlay, or Esc.
- **Theme toggle (☀️/🌙)** — switches `[data-theme="light"]` on `<html>`
  (full light palette: white glass cards, dark buttons) and remembers the
  choice in `localStorage` (`cm-theme`; default dark).
- **Background & accent colors (Settings → sections 3–4)** — the
  Background strip (5 presets + custom color input + Reset) sets the page-wide
  `--bg` CSS variable instantly and persists it (`cm-bg-v1`); the Custom accent
  strip recolors primary buttons/glows via the `--accent` variables
  (`cm-accent-v1`). Both survive reloads; Reset restores the built-in look.
- **Hours | Days relabeling** — the unit toggles dynamically swap labels
  ("Estimated hours/days", "Target hourly/daily rate", "Extra hours/days",
  "Charge rate /hr · /day") and placeholders ("e.g. 60/hr" vs
  "e.g. 400/day"). A daily-rate entry is stored as canonical hourly (÷ 8),
  so every metric, the summary line, and generated change-order emails
  stay correct in either unit; the request form inherits the project's
  unit.

## Standing constraints (why this repo looks the way it does)

- $0 build: no paid tools, no server, no frameworks, no analytics.
- No account / login / backend / payments inside the MVP.
- No AI API inside the product — AI (this assistant) is used to build it,
  not bolted into it.
- Runs fully offline; user data never leaves the browser.
