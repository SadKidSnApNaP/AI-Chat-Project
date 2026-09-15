# Nexora Engine (formerly CalcMall) — Business Intelligence & ERP — preview & run notes

Static web app: `index.html` + `css/style.css` + `js/cloud.js` +
`js/calculations.js` + `js/app.js`. No package.json, no build step, no server
software included. `js/cloud.js` (added 2026-09-13) needs the Supabase SDK,
loaded from a CDN tag in `index.html` just before it — see "Cloud backend
(Supabase)" below. In a normal browser, just double-click `index.html`
(`file://` works; data lives in `localStorage`). Renamed to "Nexora Engine"
2026-09-10 (user-visible strings only — `calcmall_*` localStorage keys kept
for data compatibility).

## How to run the preview

**Current mode (2026-09-11): local static server + URL registration.**
The Preview tab's htmlPath mode serves a cached snapshot that can lag or
corrupt externally-written files (mid-write captures broke app.js once), so
the preview now runs a tiny PowerShell static server over the project root
and registers `index.html` by URL — the page loads its real `css/style.css`,
`js/calculations.js`, `js/app.js` straight from disk on every request.

Start it detached (port 8437; PowerShell recipe — stdout/stderr to DIFFERENT
files):

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"F:\AI-Chat Project\server-preview.ps1\"' -RedirectStandardOutput 'F:\AI-Chat Project\.freebuff\preview-3d2b8678-6d91-4c71-ac61-1caa17ac8cca.log' -RedirectStandardError 'F:\AI-Chat Project\.freebuff\preview-3d2b8678-6d91-4c71-ac61-1caa17ac8cca.log.err' -WindowStyle Hidden -PassThru).Id"
```

Confirm it survived and answers, then register by URL:
`register_preview(url = 'http://127.0.0.1:8437/index.html', pid = <pid>)`.
Kill/restart with the port's owner:
`Get-NetTCPConnection -LocalPort 8437 -State Listen`.

Fallback mode (no server wanted): regenerate `preview.html` (below) and
`register_preview(htmlPath = preview.html)`. NOTE: after external (PowerShell)
writes to any file the preview layer serves, make one small platform edit to
that file (str_replace) or the layer may keep serving a stale snapshot.
`preview.html` currently also carries two intentional patches: the stale
inline app IIFE is disabled (`<script type="text/plain"
data-stale-inline-app=...>`) and fresh css/js load from
`http://127.0.0.1:8437/...` at the end of body — both redundant when serving
via the static server, and both regenerated away by rebuilding preview.html
from sources (re-add only if the htmlPath fallback is ever needed).

## Glassmorphism theme & emoji policy (2026-09-12)

The final block of `css/style.css` ("NEXORA DASHBOARD THEME — final override
ruleset") is loaded last and wins the cascade: deep blue/purple radial canvas
on `body`/`#app-root`, translucent glass cards (`.card`, `.kpi-card`,
`.utility-card`, `.tool-card`, `.activity-panel`, `.widget-card`), indigo
hover glow, white `#0b0d17`-text CTAs, and green/red/grey `.kpi-delta` pills.
Emoji policy: the sidebar/nav uses strictly monochrome inline SVG icons (no
emoji glyphs), while each `.tool-card` shows a distinct rich emoji in its
square badge via the `TOOL_EMOJI` map in `js/app.js`
(`renderToolsGrid`). All 12 tool ids have an entry; add a new one there
whenever a tool is added or it falls back to the placeholder glyph.

**Glow backdrop (2026-09-12):** `<body>` starts with
`<div id="glow-backdrop"></div>` — a fixed, `pointer-events:none`,
`z-index:-9999` layer carrying the indigo/violet/cyan/base radial gradients (styled in
`css/style.css` right above the `body::before` rule). The `#nexora-glass-force`
block keeps `:root` on the `--bg-gradient` as an opaque canvas fallback but
forces `body`, `#app-root`, `.container`, `.main-area` (and the generic
`.main-content`/`.min-h-screen`/`.dashboard-container` names) to
`background: transparent` so the glow shows through. Any new full-screen
wrapper with an opaque background must be added to that transparent list or it
will hide the glow.

**Forced glass overrides (2026-09-12):** `index.html` also carries a
`<style id="nexora-glass-force">` block placed immediately after the
stylesheet `<link>`. The build inlines `css/style.css` at the link position,
so this block always loads last; its selectors are `:root`-prefixed (higher
specificity than the equal-`!important` rules in `style.css`) so the deep
blue/purple `--bg-gradient`, `--card-bg`, `--card-border`, `--card-glow`
variables and the card/hover/overlay rules can never be overridden. Edit
`index.html` (not `style.css`) to retune these. Two known intentional side
effects: the Appearance "Background color" presets/picker no longer repaint
`body` (the forced gradient wins), and rule 5's `[class*="bg-"]` wildcard
excludes `.bg-preset`/`.bg-picker`/`.bg-row`/`.bg-presets` so the color
swatches keep their fills.

## Sidebar structure (2026-09-12)

The left nav is grouped with `.nav-group-label` headers (10px, `#6b7280`,
700, uppercase) in three sections — WORKSPACE (Home / Master ERP Engine /
Item & Client Database), MANAGEMENT (History & Saved Documents / All
Utilities), CONFIGURATION (Company & Brand Settings / Appearance Settings /
Data Backup & Restore). The active item uses `.sidebar-link.active` =
`rgba(99,102,241,0.15)` background + `border-left: 3px solid #6366f1`
(`padding-left: 9px` compensates so labels stay aligned). The sidebar footer
pins the theme toggle, the permanent "How to use" button and the user/guest
card, which now also shows a local-storage line (`.js-storage-status`, filled
by `renderStorageStatus()` using the existing `storageUsedBytes()`/`fmtBytes()`).

`Data Backup & Restore` (`#sidebar-backup` → `#backup-view`) downloads a JSON
snapshot of every localStorage entry (`downloadBackup`) and restores one
(`restoreBackupFile`, accepts the wrapped `{data:{…}}` payload or a bare
key→value map, confirms, then reloads). `showView()` hides `#backup-view` for
non-backup views and `navIds` maps `sidebar-backup` → `backup`.

## Access control & AI credits (2026-09-12)

Two GLOBAL `window.localStorage` keys (not routed through the per-user key
shim): `nexora_user_logged_in` (`'true'` when signed in) and
`nexora_ai_credits`. `handleAuthSubmit()` calls `grantLoginEntitlements()` on
both login and sign-up, which sets the flag and resets credits to `'1'`;
logout removes the flag. `initAccessState()` migrates pre-existing sessions
(sets the flag if `currentUser` exists and grants 1 credit if the key is
missing).

**Developer / admin bypass (2026-09-12):** `ADMIN_EMAIL =
'himalabey.503@gmail.com'` (plus `ADMIN_CREDITS = 99999` and the third raw
key `nexora_user_role`). `grantLoginEntitlements(email)` — called by
`handleAuthSubmit()` for both login and sign-up — routes that address to
`grantAdminEntitlements()`, which sets `nexora_user_role = 'admin'` and
`nexora_ai_credits = '99999'`; every other account gets
`nexora_user_role = 'user'` and the single free credit. `initAccessState()`
also promotes an already-signed-in developer session, so the bypass applies
without a fresh login. `isAdmin()` returns true on the role flag OR on the
live session email (so clearing the role key still works and
`checkAccessAndCredits()` re-asserts the role). The gate then returns `true`
before any credit read: no deduction, no "1 AI Credit Used" toast, never the
limit modal. `renderAuthUi()` shows the admin badge text
`Logged In (Admin - Unlimited Testing)` instead of the credit count. To
retire the dev account, change `ADMIN_EMAIL` and clear
`nexora_user_role`/`nexora_ai_credits` for signed-in testers.

**Superseded (2026-09-13) — the bypass is an allowlist, and the credit keys
are gone.** `ADMIN_EMAIL` (a single string) became `ADMIN_EMAILS` in
`js/app.js` (≈line 145), matched case-insensitively by `isAdminEmail()` via
`indexOf`:

```js
const ADMIN_EMAILS = [
  'himalabey.503@gmail.com',      // original developer account
  'jayawardhanaworks@gmail.com'   // second admin account
];
```

**This list is the single source of truth.** There is nothing to set in
Supabase: the five tables (`brand_settings`, `items`, `clients`, `documents`,
`appearance_settings`) are keyed only by `user_id` and have no role/plan
column at all, and `nexora_user_role` is merely a *per-account* localStorage
cache — it is namespaced as `u:<email>:nexora_user_role` (`GLOBAL_KEYS` is
empty) and `initAccessState()` re-derives it from the live session email on
every boot via `grantAdminEntitlements()`. Promotion therefore needs no manual
key edit and no migration; adding the address to `ADMIN_EMAILS` is the whole
job. The `nexora_ai_credits` / `ADMIN_CREDITS` details above are historical.

Everything downstream is unchanged because it all funnels through one chain:
`isAdminEmail()` → `isAdmin()` → `isPremium()` → the `if (isPremium()) return
true` early exit in `checkAccessAndCredits()`. Both admin accounts therefore
show `Developer — Unlimited Credits` in `planState()` (the `acct-plan-pill`,
`acct-row-plan` and sidebar chip), `Unlimited Credits` in `renderPlanHealth()`
(`#hl-plan` on the Home System-health card) with the title
`Developer account — every tool, unmetered.`, and no upgrade button.

*Known limitation (pre-existing, unchanged here):* the role cache is a plain
localStorage value, so this whole allowlist is a UI/entitlement convenience,
not a security boundary — anyone can set `u:<their email>:nexora_user_role`
to `admin` from devtools and get the same unlimited bypass, since no server
re-checks it. Hardening would mean verifying the email server-side (a Supabase
RLS-checked table or an edge function) instead of reading a local flag.

`checkAccessAndCredits()` is the single strict gate: it reads the two raw
keys (never deducting when it blocks), opens `showAuthRequiredModal()` /
`showCreditLimitModal()` (thin aliases over `#gate-modal` in auth / limit
mode), and on success deducts one credit, toasts "1 AI Credit Used" and
calls `updateCreditUI()` (`renderAuthUi()` + `renderStorageStatus()`).
`consumeToolCredit()` is now just an alias of it.

Wrapping helpers: `gateClick(handler)` returns a click listener that runs the
gate first and, when blocked, calls `preventDefault()` + `stopPropagation()`
+ `stopImmediatePropagation()` and returns `false` — so no export, no download
and no print dialog can fire. `gated(fn)` does the same for starters that get
no event (the History re-export path).

Everything that STARTS a tool session or produces an output now goes through
it: the Home tools grid card / "Launch Tool →" button, both `.tool-slot`
paths, `#open-utility-btn`, the six footer shortcut launchers
(`footer-open-*`), the History "view" action for tool drafts, and every
exporter — `#erp-pdf`, `#erp-export-xlsx`, `#boq-pdf`, `#qr-pdf`, `#inv-pdf`,
`#vr-pdf` plus the History "pdf" re-download. Sidebar navigation, the ERP
engine form itself and the DB/backup views stay ungated (or guests could not
reach the dashboard at all), as do in-form actions like `Save Record` and
`Template` download. Guests get the `#gate-modal` in auth mode; a drained
balance gets it in limit mode. Sidebar status (`renderAuthUi`) shows
`Guest Account (0 Credits)` with an amber `.acct-status-guest` dot, or
`Logged In (N Credit… Available)` / `(N Credits Left)` with the green dot.

## Editing saved items & clients (2026-09-12)

Both database collections can be **edited as well as deleted**. There is no
second modal: editing re-uses the existing create form so validation, the
SKU/client-name de-duplication and the ERP datalists stay in one place.

- `dbEditing = { item: -1, client: -1 }` holds the ARRAY INDEX of the record
  currently loaded into the form; `-1` means plain "add" mode.
- `startEditDbItem(idx)` / `startEditDbClient(idx)` prefill the form,
  `setDbFormMode()` swaps the primary button to **"Update item" /
  "Update client"** with a check icon (restoring the `plus` icon + "Add …"
  label in add mode) and reveals the `#db-item-cancel` / `#db-client-cancel`
  ghost buttons. `revealDbForm()` switches to `#db-view`, scrolls the card
  into sight and focuses the first field — so an edit started from a drawer
  is visible.
- `addDbItem()` / `addDbClient()` update `db.items[editIdx]` in place with
  `Object.assign` when a session is active (never append a duplicate). The
  duplicate guards compare against `db.items.indexOf(existing) !== editIdx`,
  so **renaming a record to its own current SKU/name is allowed** but
  colliding with another record is still refused.
- `resetDbForm(which)` clears the fields and returns to add mode;
  `noteDbRemoval(which, idx)` keeps an open session pointing at the right
  record after a delete (same index → reset, greater index → shift down).
- Public hooks for the drawer (and anything external):
  **`window.editDatabaseItem(id)`** and **`window.editDatabaseClient(id)`**,
  where `id` is the item's `sku` / the client's `clientName || name` — the
  app's natural primary keys. They close any open drawer, then start the
  edit session. The `nexora_database_items` / `nexora_database_clients` key
  names from the original request do NOT exist here; live keys are
  `nexora_item_db` / `nexora_client_db` (see the DB section above).
- UI: every DB row and every drawer row now carries an edit button next to
  the delete one, inside a `.db-actions` flex group (`gap: 6px`). Class
  `.qr-edit` mirrors `.qr-del` (30×30, 8px radius, 15px inline `edit` SVG)
  with an indigo hover (`.qr-edit` uses the new `edit` entry in
  `TOOL_ICONS`). Grid action columns widened `36px → 72px` in
  `.db-grid-items` / `.db-grid-clients` (and the `max-width: 760px`
  override), and the drawer tables' Action cell is `.w70` (`.data-table
  .w70 { width: 74px; }`).

Verified live: edit→save updates in place (count unchanged, no duplicate),
names/SKUs renamable, duplicate SKU blocked with the alert, cancel restores
the pre-edit client currency, editing a record then deleting the row above
keeps the session valid, deleting the edited record itself resets to add
mode, and the drawer edit path closes the drawer and lands on the prefilled
form. Console clean.

## Sign-up Email OTP verification (2026-09-12)

Sign up is two steps inside `#auth-modal`. Step 1 is the registration form
(`#auth-step-1`, submit button reads **Continue** in signup mode); on submit
`handleAuthSubmit()` validates, rejects duplicate emails, then calls
`beginOtpVerification(name, email, hashPass(pass))`. Step 2 is `#otp-form`,
swapped in by `showAuthStep('otp')` (which also hides `.auth-tabs` and sets
the modal title to **"Verify Your Email"** — the step heading, deliberately
not duplicated inside the form).

The code is simulated locally (no mail service, no network): a random 6-digit
PIN (`Math.floor(100000 + Math.random() * 900000)`) is stored in the
spec-named globals `window.currentSignupOTP` and `window.otpExpiry =
Date.now() + 2 * 60 * 1000`.

**The code is NEVER rendered into the page (2026-09-12).** The old floating
`#otp-mail-toast` / `.mail-toast` notification is gone from `js/app.js`,
`index.html` and `css/style.css` — do not resurrect it. A 1-second interval
(`startOtpTimer`) still drives the live `Code expires in: MM:SS` line; at zero
it switches to `Code expired — click Resend Code for a new one.` and adds
`.expired` (red).

Delivery goes through one hook, `sendVerificationEmail(email, otp)` (async,
fired-and-forgotten with a `.catch` so a dead mail service can never block the
view the user is already on) called from BOTH `beginOtpVerification()` and
`resendOtp()`. Its dev body logs
`[DEV MODE] OTP for <email>: <otp>` — the single console line, deliberately
not duplicated with a second `console.log('OTP:', …)` — and the production
call is staged commented-out against `POST /api/auth/send-otp`; uncomment it
and drop the log to go live. Read the code from the console to finish a local
sign-up.

`#otp-help` (`.modal-card .otp-help`, 12.5px `#8b949e`) sits under the OTP
input: "Check your inbox (or dev console during local testing) for your
6-digit verification code." It is referenced from the input's
`aria-describedby` alongside `otp-timer`.

`handleOtpSubmit()` checks expiry first (`Date.now() > window.otpExpiry` →
"Verification code has expired. Please click 'Resend Code'."), then compares
the stripped-digits value to `window.currentSignupOTP` (mismatch → "Invalid
verification code. Please check and try again."), and only then calls
`finishSignup()`: push the user (name / email / hashed pass / created) into
`users`, `grantLoginEntitlements(email)`, `setSession(email)` (reloads =
auto-login). `resendOtp()` clears the timers, mints a fresh code, resets the
expiry to +2 minutes, clears input + errors and fires a new notification.
`#otp-code` filters to digits, max 6. `resetAuthFlow()` (tied to mode
switches, `closeAuthModal()` and Esc) stops the countdown, drops the pending
code and returns to step 1.

CSS caveat worth remembering: the auth styles use `.modal-card p` and
`.auth-field input`, whose specificity beats a bare class — the OTP rules are
therefore written as `.modal-card .otp-sub` / `.otp-input` / `.otp-timer` /
`.otp-resend`, and `#otp-form[hidden]`/`#auth-step-1[hidden]` are forced with
`display: none !important` because the theme block styles `form`/`div`
elements.

First preview load shows the "How to use" onboarding modal automatically
(`hasSeenOnboarding` is empty in the preview's fresh localStorage); Skip / X /
Get Started all dismiss it for the session. The permanent "❓ How to use"
button at the bottom of the sidebar re-opens it anytime.

## Verification email delivery via Resend (2026-09-13, supersedes the simulated-OTP notes above)

Everything in the section above about a locally simulated PIN is **obsolete**.
Auth is real Supabase now: `signUp()` mints and emails the code, `verifyOtp()`
(with `type: 'signup'`) validates it, and the session — not a flag — is what
`isLoggedIn()` reads. `window.currentSignupOTP`, `sendVerificationEmail`,
`hashPass`, the local `users` store and `#otp-mail-toast` no longer exist; do
not reintroduce them. The countdown, `#otp-help`, `resendOtp()`, the
digits-only `#otp-code` filter and `resetAuthFlow()` all still work as
described.

### Why delivery moved off Supabase's mailer

Supabase's built-in email provider is capped at **2 emails/hour per project**
(`supabase.com/docs/guides/auth/rate-limits`), which rejected the first real
signups with "email rate limit exceeded". The supported fix is the **Send Email
hook**: Supabase keeps minting and verifying the code, but hands *delivery* to
us, and the limit becomes configurable instead of fixed at 2/hour.

```
browser → supabase.auth.signUp()      ← Supabase creates the user
              ↓
Supabase Auth → POST /api/send-code   ← signed webhook (api/send-code.js)
              ↓
Resend API → the user's inbox
browser → supabase.auth.verifyOtp()   ← unchanged; Supabase checks the code
```

So nothing changed in `js/app.js` or `js/cloud.js` — only *who sends the mail*.
The endpoint is a transport, never an authority: it can only relay a code
Supabase already generated, and it stores nothing.

### `api/send-code.js`

Exports `POST` and `GET` as Web-standard handlers (`export async function
POST(request)`) so the **raw** body can be read with `request.text()`. This is
load-bearing: Vercel's Node runtime pre-parses a JSON body for a classic
`(req, res)` handler, which would destroy the exact bytes the HMAC covers and
make every signature fail. Both handler forms are documented for `/api/*.js`
in Vercel's Functions API Reference.

Signature check is standard-webhooks (Svix-compatible), verified against the
reference implementation rather than assumed: signing input is
`<webhook-id>.<integer seconds>.<raw body>`, key is the **base64-decoded**
secret with the `v1,` and `whsec_` prefixes stripped, output is base64
HMAC-SHA256 compared in constant time. Only `v1,`-prefixed candidates are
considered, the timestamp must be within ±300s, and **there is no unverified
fallback** — an unset or wrong secret returns 401 and sends nothing, so the URL
cannot be abused as an open mail relay.

`email_action_type` selects the copy and the subject for signup /
reauthentication / recovery / invite / magiclink / email_change. For
`email_change` the counterintuitive field mapping is explicit (`token_new`,
because Supabase names the pair backwards). Non-digits are stripped from the
code before it is rendered.

### Operator setup (required — the endpoint refuses to send without it)

1. **Supabase → Authentication → Hooks → Send Email**, type **HTTPS**, URL
   `https://<production-domain>/api/send-code`, and generate the secret
   (`v1,whsec_…`). With the Email provider enabled *and* the hook enabled, the
   hook owns sending and SMTP is not used at all.
2. **Vercel → Settings → Environment Variables**: `SEND_EMAIL_HOOK_SECRET`
   (that `v1,whsec_…` value) and `RESEND_API_KEY`. Optional `RESEND_FROM`.
3. **Raise the limit**: Authentication → Rate Limits → "Emails sent per hour" —
   with a custom sender/hook this is configurable, but the value may still sit
   at 2 until it is changed.
4. **Verify a sending domain in Resend.** `onboarding@resend.dev` is Resend's
   sandbox sender and can only mail the Resend account owner, so `RESEND_FROM`
   must become a verified-domain address before real users can receive codes.

A browser hitting `/api/send-code` gets a JSON self-report (which env vars are
configured, and the active `from`) — that is the quickest post-deploy check.

### Test harness

`.freebuff/send-code-test.html` (open via the preview server) imports the REAL
`api/send-code.js` with `crypto`, `process` and `fetch` shimmed, and signs the
request independently with native WebCrypto HMAC. 35/35 assertions cover:
the shimmed HMAC matching WebCrypto byte-for-byte, a valid signup payload
producing exactly one Resend send carrying Supabase's own token, tampered body
/ wrong secret / stale timestamp / missing headers / unset secret all refused
with no send, the `email_change` token mapping, code sanitisation, provider
failures surfacing as 502, no secret leaking into any response, and `GET`
reporting configuration. The real file parses as ESM and exports both handlers.

Note the hook owns **every** auth email, so subjects and branding now come from
`ACTIONS` in the endpoint, not from Supabase's email templates. `resetPassword`
in `js/cloud.js` is currently unreferenced — there is no password-reset UI yet;
when one is added the hook already delivers that code (`email_action_type:
'recovery'`, `token` is the 6-digit OTP for `verifyOtp({type:'recovery'})`).

## Sidebar collapse toggle moved beside the brand (2026-09-13)

The rail collapse control used to be the last item of the **MORE** section,
rendered as a labelled `Menu` sidebar-link (`#sidebar-collapse-label`). It is
now the conventional icon button in a header row next to the Nexora Engine
logo:

```html
<div class="sidebar-head">
  <button class="sidebar-brand" id="sidebar-brand">…logo + name…</button>
  <button class="sidebar-toggle" id="sidebar-collapse" …>hamburger</button>
</div>
```

- **Id unchanged** (`#sidebar-collapse`), so the handler in `wireEvents()` and
  `syncSidebarState()` were not touched. The old label span is gone.
- `.sidebar-toggle` was already declared but **unused** CSS; it was restyled
  into the 34x34 icon button rather than adding a parallel class. `.sidebar-head`
  took over `.sidebar-brand`'s `flex: 0 0 auto` (the brand is now the flex
  child that grows, with `min-width: 0` so a long name truncates instead of
  pushing the button out of the rail).
- **MORE now holds exactly Other Utilities and Premium Plans.**
- Icon-only means the accessible name carries the action: `syncSidebarState()`
  now sets "Collapse the navigation" / "Expand the navigation" (and "Close the
  navigation" on the mobile drawer) instead of the old `Menu — …` wording,
  which only existed because the visible label was the word "Menu".
- Still a pure UI action: it never navigates, in either layout.

### Verifying it (desktop behaviour needs a wide viewport)

The preview viewport is ~645px, where the sidebar is an off-canvas drawer and
BOTH the collapse transform and the reopen handle live inside
`@media (min-width: 1025px)`. `.freebuff/sidebar-toggle-test.html` therefore
loads `preview.html` in a **1280px iframe** (same-origin, so its DOM can be
driven directly) and asserts **32/32**: the toggle is the brand's next sibling
inside `.sidebar-head`, 4px to its right (`brand.right=215`, `toggle.left=219`),
vertically centred to 0.00px, inside the rail (right edge 253 of 270) and above
`#sidebar-nav`; MORE holds exactly the two items; clicking leaves the hash alone
while the rail moves to `translateX(-270px)` with `opacity: 0` and
`pointer-events: none`; the reopen handle appears at `left: 0` and restores it;
and the label flips Collapse/Expand.

At the real 645px width the same button closes the open drawer, does not set
`sidebar-collapsed` (a desktop-only flag) and does not navigate — verified
separately in the live preview.

Two assertion bugs worth remembering: the collapse is a 0.34s transition, so a
synchronous `getComputedStyle` read sees the *start* state (identity matrix);
and `position: fixed` blockifies a declared `inline-flex`, so the reopen
handle's computed `display` is `flex`, not `inline-flex`.

## Account Settings page + compact sidebar footer (2026-09-13)

The sidebar footer used to hold a 5-line profile block (Guest / status /
`Local storage: …` / `Cloud: …`) plus Login and Sign-up buttons — 235px in
total, the tallest thing in the rail. It is now ONE row: a chip with the
avatar, the display name and the plan, which opens the new
**Account Settings** page. Everything that was listed there moved onto that
page, so nothing was lost.

```
.sidebar-foot  before 235px   after 155px   (-34%)
account block  before 119px   after  43px   (-64%)
footer buttons before 3       after  0
```

### Where things live now

- View id `#account-view`, route `#/account`, registered in `VIEW_NAMES` and
  toggled in `showView()` (which repaints it on entry, alongside
  `renderStorageStatus()` / `renderCloudStatus()`).
- Sidebar entry **Account Settings** sits under **CONFIGURATION**, directly
  above Appearance Settings (`#sidebar-account`). `navIds` maps
  `'sidebar-account' → ['account']` for the active pill.
- The chip is `#account-chip` (`chip-avatar` / `chip-name` / `chip-status` /
  `chip-dot`). Both the chip and the sidebar link call `showView('account')`.
- Three cards, and only the applicable ones show: `#acct-guest` for visitors,
  `#acct-user` (profile) and `#acct-meta-card` (account · plan · sync) for
  signed-in accounts.
- **Login / Sign-up / Log-out kept their ids** (`#login-btn`, `#signup-btn`,
  `#logout-btn`) — `initAuthUi()` binds them by id, so they simply moved into
  the page with no rebinding. Do not rename them.
- The old `#auth-guest` / `#user-badge` / `#guest-status` / `#user-status` /
  `#user-name` / `#user-email` / `#user-avatar` ids and the `.sidebar-profile`
  CSS block are gone. `renderAuthUi()` is now the single painter for the chip,
  the page and (via `renderPlanHealth`) the Home health row, all fed by
  `planState()`.

### Profile

- **Display name** → Supabase `user_metadata.full_name` via
  `NexoraCloud.auth.updateProfile({ fullName })` (`client.auth.updateUser`). It
  is server-side, so it follows the account to any device; supabase-js writes
  the updated user back into the stored session, which is why `currentUser()`
  picks it up without a reload.
- **Profile picture** → a data URL under `nexora_avatar_v1` in the per-user
  shim, so it is per account but **per browser** — deliberately not
  `user_metadata`, because that is carried in the JWT and anything multi-KB
  there breaks request headers. Files are refused unless they are images under
  8 MB, then downscaled to 256px on a canvas (PNG while it stays under ~60KB,
  otherwise JPEG 0.85) so a camera photo cannot blow the quota.
- **Email is read-only** (`#acct-email`): changing an address needs a
  re-confirmation round-trip that is not wired up.
- Account created date comes from `NexoraCloud.sessionCreatedAt()`
  (`user.created_at`, formatted with `toLocaleDateString`).

### Verifying the signed-in path without a real login

`.freebuff/account-test-stub.html` + `.freebuff/make-account-test.ps1` inject a
fake session and stubbed auth responses immediately before the inline app.js
block of `preview.html`, producing `.freebuff/account-test.html`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File build-preview.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .freebuff/make-account-test.ps1
# → open /.freebuff/account-test.html
```

The stub must be injected *before* app.js because `SESSION_EMAIL` is captured
once at module evaluation — seeding a session and only changing the hash does
nothing (a hash-only navigation never re-evaluates the page). Keep
`make-account-test.ps1` pure ASCII: Windows PowerShell reads `.ps1` as ANSI
without a BOM, so a non-ASCII literal becomes mojibake and every `IndexOf` on
it fails silently. The generated `account-test.html` is not kept (it is a
~870KB duplicate of the bundle) — regenerate it when needed.

Verified that way: the chip and page render the signed-in state; saving the
name issues `PUT /auth/v1/user {data:{full_name}}` and the chip updates with no
reload; the picture round-trips and downscales to 256x171 from 1200x800; a
Premium subscription turns the pill into `Premium — Unlimited Credits` with
`Unlimited Credits` in the credits row and hides *Change plan*; Remove picture
routes through the shared confirm dialog; and Log out confirms, clears the
session and boots as a guest.

## How to reproduce the preview artifact

`preview.html` must stay in sync with the real sources. Regenerate it after
editing `index.html`, `css/style.css`, `js/calculations.js`, or `js/app.js`.
From a PowerShell at the project root run the build script (reads/writes
UTF-8 — no manual inline commands needed):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File build-preview.ps1
# → preview.html written: <bytes>
```

`build-preview.ps1` inlines `css/style.css`, `js/calculations.js` and
`js/app.js` into `index.html` and fails loudly if an asset tag goes missing
or a JS file ever contains `</script>`. There is also `build-test.ps1`, which
produces `test-inline.html` (the calculation test page with the math file
inlined) — used only to verify the 86 assertions from the Preview tab, since
the preview server cannot serve sibling files. Delete `test-inline.html`
after checking; the canonical test page is `test/calculations.test.html`
(double-click it from disk — no server needed).

Checks after regenerating (via preview tools):
- Sidebar fixed & flush left (left:0); footer shows only brand + Legal (no
  TOOLS column). Settings section 3: bg preset/picker/reset updates the body
  background instantly, persists in `cm-bg-v1`, and the picker restores the
  saved color on reload; the accent strip persists `cm-accent-v1`.
- No 404/console errors; `document.styleSheets.length >= 1`;
  `typeof window.Calc === 'object'`.
- Header controls: Login/Sign up open the "Accounts coming soon in v2.0"
  modal (Esc/overlay/button close); the ☀️/🌙 toggle flips light/dark and
  persists (`cm-theme` in localStorage).
- Dynamic labels: switching a Hours|Days toggle relabels the fields
  (hourly/daily rate, extra hours/days) and converts an entered rate ×8/÷8
  so values stay correct; a days project renders "2d" everywhere.
- Landing first: app opens on the CalcMall Home/All Tools view (black-and-
  white glassmorphism: grayscale Unsplash background + frosted cards); the
  tool selector
  bar (Scope Guard / Qty & Rate / Quotation / Pricing / Invoice) swaps the
  preview card, "Coming
  soon" tools disable the button; "Open Calculator →", the logo, and the
  Home link switch views (Qty & Rate opens `#qr-view`; the Quotation badge
  opens `#boq-view`).
- Homepage sections: 3-step "How CalcMall works" grid, "Why use CalcMall"
  two-column copy, 4-item FAQ accordion (native `<details>`), and the footer
  (tool link, Reset all data, Terms/Privacy opening `#legal-modal` with the
  matching copy).
- Save a project (price 1500, hours 20, target 60) → all four main cards
  appear; original effective rate shows `$75.00/hr`.
- Days check: set the setup unit to Days and enter 2.5 (same 20 h) →
  original rate still `$75.00/hr`, dashboard shows `2.5d`; a 1.5-day request
  at 60 → value `$720.00`, drop `37.5%`, committed `1.5d`, current estimate
  `4d`, change-order text contains `2.5d (20 h)`.
- Add a request of 12 extra hours → drop `37.5%`, rate `$46.88/hr`,
  break-even `$900.00`; after adding, the dashboard turns red with unbilled
  `$720.00`; generating a message fills the inline Change Order Generator.
- Quantity & Rate tool (#02): select the Qty & Rate badge → preview shows
  Tool #02 with an enabled button; open it → line-items table. Enter the
  example rows (Pipe installation 25 m 1500 / Valve installation 4 No. 2500
  / Testing 1 Lot 15000) → amounts 37,500 / 10,000 / 15,000 and Total
  62,500. Decimals (2.5 × 3.5 → 8.75) fine; negative qty → amount "—" and
  total uncorrupted; ✕ removes a row; Enter on the last row adds + focuses
  the next; rows persist across reload (`cm-qr-v1`); Clear all empties.
- BOQ tool (#03): select the Quotation badge → preview shows Tool #03 with
  an enabled button; open it → Quotation Details + Bill of Quantities +
  Discount/VAT & Summary. Fill client fields, add items (25 m 1500, 4 Nr
  2500, 1 Lot 15000), set 5% discount / 18% VAT → Sub Rs62,500.00, Discount
  −Rs3,125.00, Net Rs59,375.00, VAT +Rs10,687.50, Final Rs70,062.50; the
  offscreen `#quotation-doc` holds the formal letter (formal letterhead,
  recipient, itemized table, totals, T&C, signature); "Download Client
  Quotation PDF" runs html2pdf (needs the CDN; on a real browser it saves
  a PDF); data persists across reload (`cm-boq-v1`); Reset quotation clears
  it. Requires the html2pdf.js CDN script in the head to be reachable.
- Nav names: the tool bar + banner headings read "Quotation" (shortened
  from "Quotation Tool") and "Invoice" opens the Smart Invoice & Document
  Builder (#05, `#invoice-view`).
- PDF document template — reference invoice sheet (2026-09-12): `generatePrintHTML(data)`
  in `app.js` is now the **complete reference invoice template**,
  verbatim. It renders the WHOLE document itself — header banner (logo cell
  25% + right-aligned company block), tagline over the `#0d1b6e` divider,
  bordered title bar, the 2-column bordered Supplier | Purchaser metadata
  grid, the bordered line-item table (`NO · DESCRIPTION · UNIT · QTY ·
  RATE (LKR) · AMOUNT (LKR)`, money as `2,726,000.00` with NO currency
  prefix), the right-aligned Sub Total / Discount / 18% VAT / TOTAL breakdown
  (Discount and VAT rows emitted ONLY when their value is `> 0`; TOTAL has
  the `3px double` bottom border) and the words + courtesy + sign-off footer.
  `buildErpDoc()` therefore only FEEDS it data (items as
  `{description, unit, qty, rate, amount}`, `subTotal`, `discount`, `vat`,
  `grandTotal`, `amountInWords` = `"<currency word> <Calc.amountInWords> Only"`,
  `supplierContact` built as `Contact: <phone> | email: <addr> | www.<site>`)
  and must NOT splice anything into the markup any more.
  Consequences/notes: the template has **one** company-name field
  (`data.supplierName`, fed `mxLegalName()`); `TRANSPARENT_PX` is still passed
  when no logo is uploaded so the `<img>` can't print a broken-image glyph;
  the title/label swap is the template's own
  (`TAX INVOICE` → "Tax Invoice No", otherwise "Quotation No"), the PO row is
  omitted when `poNo` is empty, and `Place of Supply` falls back to `N/R`.
  DROPPED by this template (it has no slot for them): the T&C / payment-terms
  block (`brandDocTerms()`), the BANK & BENEFICIARY block, the seal, and the
  mode-specific extras (VAT Reg No / Consignee / Deliver To / Vehicle), and
  **Delivery Note mode now prints money columns too** (the template always
  renders Rate/Amount — the old `showMoney`/`erpDocType()` behaviour is no
  longer applied to the PDF, though it still drives the on-screen table).
  `mxDocTable` / `mxFooter` / `mxMoney` (and the `.mx-*` CSS) are now DEAD
  code with zero call sites — left in place deliberately; delete them only
  after checking nothing else grows a dependency on them.
- Letterhead tune-up (2026-09-12): the tagline (`.mx-spec`) is a bare
  block — no wrapper box — styled italic/bold 11px centered `#0d1b6e`
  (`margin: 4px 0 8px 0`, full width) directly under the `Contact:` line, with
  a full-width `.mx-rule` (`border-bottom: 2px solid #0d1b6e`, `margin-bottom:
  12px`) rendered right after it (only when a tagline exists). `.mx-doctitle`
  (QUOTATION / TAX INVOICE) is centered `800`/16px with `letter-spacing: 2px`,
  `margin: 10px 0 14px 0`, 1px top+bottom borders. Both copies — `style.css`
  and the `PRINT_DOC_CSS` array in `app.js` — must stay in sync. Metadata
  mapping is strict: "Purchaser's Name" ← `#erp-client`; "Additional
  Information" row value renders as `Project Name: <value>` ← `#erp-project`.
- PDF engine (2026-09-09): all 5 PDF exports (QR, BOQ/Quotation,
  Invoice, Variation, ERP) use the **standalone hidden-iframe print engine**
  (`compilePrintHtml` + `openPrintWindow` in app.js): a complete inline-
  styled A4 HTML document is written into a new window
  (open → write → close), images/styles wait before print(). Works
  fully offline; no html2pdf/CDN dependency for exports. Blank PDF bug
  (CDN/offscreen capture) is fixed. `@media print` rules in style.css
  keep on-page printing dark-text-on-white with chrome hidden.
- Sidebar logo (2026-09-09): the 🏬 CalcMall block atop the sidebar is a
  button (`#sidebar-brand`, cursor pointer + hover tint) — clicking it
  opens the Homepage Dashboard (`#home-view`, hero + tool directory).
  The header logo (`#brand-home`) does the same.
- Currencies (2026-09-09): 15 codes in `Calc.TOOL_CURRENCIES` (USD, EUR,
  GBP, LKR, AED, INR, CAD, AUD, SGD, JPY, CHF, SAR, MYR, ZAR, NZD) in
  every banner select. `setToolCurrency` syncs GLOBALLY: any select change
  updates all tools' displays + `erpState`/`invState` + PDF symbols without
  resetting inputs. All-Utilities icons render in a glass `.utilities-grid`
  (auto-fill minmax(110px,1fr)).
- Theme & accent (2026-09-09): Settings "Toggle theme" switches BOTH
  `data-theme` on <html> and the `light-theme` class on <body> (persisted
  in `cm-theme`); a Custom Accent Color card (presets + color input,
  `cm-accent-v1`) rewrites the `--accent*`/`--glow` variables live. Scope
  Guard rate displays follow the Hours/Days unit via `fmtRateU`
  (canonical-hourly → ×8 shown as `$X/day`). The alert callout is red
  (⚠️, `.killer.danger`) when the effective rate drops and green (✅,
  `.killer.ok`) when it holds/rises — the projection now includes the
  chargeable value of committed extras (`projectedEffectiveRate` 4th arg,
  `Calc.committedValue`). Approve/Decline history buttons are green #22c55e
  / red #ef4444 (`.mini.ok` / `.mini.danger`).
- ERP engine (2026-09-09): the app now opens on the **Master ERP Engine**
  (`#erp-view`, default). Sidebar: 🏢 ERP / 📦 Item & Client Database /
  📜 History & Saved Documents / 🎨 Brand & Theme Settings / 🛠️ All
  Utilities. Brand kit (`calcmall_brand_v1`), DB (`calcmall_db_v1`) and
  ERP doc (`calcmall_erp_v1`) all live in localStorage; project name
  auto-fills client/address/currency, SKU auto-fills name/unit/rate,
  Document Mode tabs switch Quotation/Pro Forma/Commercial/Delivery
  (delivery hides money columns), and "Generate Document PDF" renders the
  brand letterhead + items + totals + terms + signature via html2pdf.
  The 12 utilities moved to the All Utilities grid (dblclick opens).
- Sidebar & history (2026-09-08): the left sidebar shows 🛠️ Tools
  Dashboard / 📜 History / ⚙️ Settings / Currency (sticky ≥1025px; overlay
  drawer via the floating ☰ Menu button (top of <main>) below 1025px —
  the top navbar was removed 2026-09-10 (sidebar-only navigation, Home/
  theme/Login/Sign up live in the sidebar footer); the Settings view also
  has a theme toggle and Reset all data). Any PDF export or Copy summary
  creates a `calcmall_history` entry — open 📜 History: entries list tool,
  title, total with currency and timestamp, with View/Load draft
  (navigates to the tool), Re-download PDF (re-runs the export), Delete,
  and Clear all. Double-clicking a tool icon in the grid opens the tool
  directly. Numeric inputs show comma grouping on blur (1,500,000) and
  strip commas on focus; math stays correct either way.
- Tools #11/#12: Retainer (20 h × 3500 + 15,000 OH, 30% margin, 10% SLA →
  Rs133,571/mo, annual Rs1,602,857, margin 36.4%) and Delay Impact
  (5M contract, 0.5%/day, 10% cap, 15 days, 25,000/day OH → Rs750,000
  total = 7.5% of contract, capped warning when raw penalty > cap).
- Test page: 91/91 assertions pass (open `test/calculations.test.html`
  from disk, or build `test-inline.html` via `build-test.ps1` to check it
  in the preview).
- Quantity & Rate PDF: "📄 Export to PDF" sits next to ＋ Add row / Clear
  all; it now compiles a formal letter-layout sheet (brand letterhead,
  Item #/Description/Unit/Qty/Rate/Total Amount table, FINAL TOTAL,
  sign-off) into a hidden-iframe print engine.
- ERP records & import (2026-09-10): "Primary Key / Record ID" bar in
  ERP Section 1 (Load/Save/Delete + meta line; store
  `calcmall_erp_records_v1`) snapshots/restores the whole document; 📥
  Import Excel / CSV (SheetJS CDN) + ⬇ Template in the ERP banner fill
  header fields from Field/Value sheets and append items from
  SKU/Description/Unit/Qty/Rate columns (fuzzy headers, xlsx/xls/csv).
- Formal document layout (2026-09-10): every invoice-family export
  (ERP all 4 modes, Smart Invoice, BOQ Quotation, QR sheet, Variation)
  uses the shared `.fm-*` builders — letterhead + doc banner (with
  supplier TIN), consignee | order-details metadata box, right-aligned
  comma-formatted item table, Sub/Discount/Net/VAT/FINAL totals, Amount-
  In-Words line, bank & beneficiary footer, seal + signature block.
  Fill the new Brand fields (phone/email/website/spec/TIN + bank block)
  in 🎨 Brand & Theme Settings to complete the letterhead.
- Invoice builder (#05): the Document type dropdown swaps dynamic fields —
  Proforma shows Payment terms/Bank name/Account no/SWIFT/Branch; Commercial
  shows Invoice no/Date/VAT reg no/Consignee/Bill-to/Currency (LKR/USD);
  Delivery Note hides the Rate + Amount columns (`display:none` via the
  `hide-money` class) and the totals summary, swapping in Deliver-to/
  Delivery date/Note no/Delivery address fields. Fill company name/address/
  contact → they appear in the offscreen `#inv-doc`; upload a logo → it
  renders on the letterhead; "Generate Document PDF" fires html2pdf; totals
  read grouped money (Rs62,500.00); data persists (`cm-inv-v1`); Reset
  document clears it. Requires the html2pdf.js CDN script in the head.

## Master invoice template (FORMAT ONLY) — 2026-09-12

`generatePrintHTML(data)` in `js/app.js` reproduces the layout of the
client's master tax invoice. The master PDF is a **design blueprint**:
`MXPT` holds only measured geometry (page box, margins, band heights,
column widths, row pitches, rule weights) and **no company data of any
kind** — every printable string arrives in the `data` argument, sourced
from the Brand settings and the ERP fields.

Measured against the master's own vector/text operators (US Letter
612×792pt, zero page margin):

| Element | Master | Rendered |
|---|---|---|
| frame box | x 46.08 / top 54.99 / w 519.84 | 46.08 / 54.99 / 519.84 |
| Date-of-Invoice band | 117.26–136.46 | 117.26–136.46 |
| metadata boxes | top 142.82, h 118.71 | top 142.82, h 118.71 |
| Additional Information band | 267.89–287.09 | 267.89–287.09 |
| item table top | 306.77 | 306.77 |
| header / item / total rows | 28.44 / 32.64 / 17.76 | same |
| every text baseline | — | within 0.1px |

Column widths: No 28.44, Description 224.33, Unit 37.22, Qty 48.96,
Rate 81.39, Amount 99.5 (pt). The master's Address cell is two rows tall,
leaving ONE blank row before Telephone No in **both** columns — that is
reproduced, not a bug.

Body text is Roboto 9.8pt, so the app loads Roboto from Google Fonts
(`index.html`) and the print frame waits on `document.fonts.ready`
before printing. `@page` is `612pt 792pt; margin: 0` (hides the browser's
URL/date furniture).

More items than fit one page continue onto further pages with the same
grid — `thead` repeats, no row/summary/footer block is split
(`.mx-keep`). The page is never compressed or clipped.

### Long / multiline text (format preserved, rows grow)

The layout is fixed; the TEXT inside it is not. Every block that holds
user data uses `min-height` + wrapping rather than a fixed height and
`overflow:hidden`, so long content grows the block downwards instead of
colliding with the next one:

- **Metadata rows** are `display:flex; align-items:flex-start` with a
  non-shrinking label (`flex:0 0 <labelW>pt`) and a value span of
  `white-space:pre-wrap` + `overflow-wrap:anywhere`. Short values keep the
  master's 19.2pt pitch exactly; a 4-line address simply makes that row
  taller. Real line breaks the user typed are preserved.
- **Letterhead** is flow (not absolutely positioned) with the master's
  measured margins (`hdr: { nameM, addrM, conM, ruleM, tagM }`), so a long
  company name / address / contact wraps and pushes the frame down. The
  logo and optional full-width banner stay absolute — images cannot wrap.
- **Table cells** are `vertical-align: top` at `line-height: 1.3`, so the
  row number, unit, qty and amounts stay level with the FIRST line of a
  wrapped description. `padTop` values are derived from the verified
  mid-aligned baselines; tuning them is the only way to move a table
  baseline, because a centred cell ignores line-height entirely.
- **Safety**: `box-sizing:border-box` on everything, `overflow-wrap:
  anywhere`, `table-layout:fixed`, `max-width:100%` — mirrored in
  `PRINT_DOC_CSS` (print frame) and the `.mx-doc` block in `css/style.css`
  (on-screen sheet).

Do NOT put `height:100%` on a wrapper inside a table cell here: it
resolves against an auto-height row and the rows below land at different
offsets between layouts.

Regression guard: with the master's own short values every baseline
(header, 6 metadata rows per column, 3 item rows, 5 summary rows, words,
courtesy, sign-off, signature) still lands within 0.1px. With a long
brand name, a 5-line address, a 3-line description and an 80-character
unbreakable token: no horizontal overflow (doc width stays 816px), no
row overlap, and nothing clipped.

## Premium Plans view (2026-09-12)

`#plans-section` is a normal workspace view in `.main-area`: `showView('plans')`
toggles its `hidden` like every other view and `navIds` maps
`sidebar-plans` → `plans` for the active pill. The sidebar entry sits last
in the CONFIGURATION group (`#sidebar-plans`, a `<button class="sidebar-link">`
with the new `star` entry in `TOOL_ICONS`, NOT the `<a class="nav-item">` +
`⭐` from the original request — the sidebar is SVG-only by an earlier
explicit rule, and anchors don't participate in `showView`).

Two cards in `.plans-grid`: Monthly Premium `$12.99 / monthly` (ghost CTA)
and Yearly Premium `$125 / yearly` (featured, `Save ~20%` corner badge,
primary CTA, indigo edge + glow, green bullets).

Two layout gotchas baked into `css/style.css`:

- The grid is `repeat(2, minmax(0, 1fr))`, **not** `auto-fit minmax(260px…)`:
  with only two cards auto-fit keeps adding tracks on a wide screen and
  leaves the pair stranded in the left half. It collapses to one column
  below `620px` (so the two cards still sit side by side in the ~645px
  preview pane).
- The featured card's edge is `:root .card.plan-card-featured` — the
  `#nexora-glass-force` block in `index.html` sets `:root .card` with
  `!important`, so a bare `.plan-card-featured` was silently wiped (0,1,0 vs
  0,2,0, both important). Match its shape and go one class deeper.

`Subscribe Monthly` / `Subscribe Yearly` are `data-plan` / `data-price`
buttons wired to a shared listener that records the choice in
`nexora_plan_interest` and calls `showToast(...)`; no payment provider is
connected in this build, and the view says so in a `hint` under the cards.

## Editable document preview — field whitelist model (2026-09-12, supersedes the toolbar)

There was no on-screen PDF preview until recently: the document existed only
as the offscreen `#erp-doc` (`.pdf-offscreen`, `left:-10000px`) and the print
frame. The ERP view now carries a `Document preview` card holding an
EDITABLE sheet that **is the print source**: `exportErpPdf()` copies this DOM
instead of re-running the template, so what the user edited is what prints.

**The generic editor toolbar is GONE** (font / size / colour / zoom /
line-height / Move mode / "Nothing selected" readout, plus`#pdf-toolbar`,
`.pdf-tb-*`, `.pdf-selected`, `data-pdf-block`, `pdfSelect`, `pdfTextNodes`,
`pdfDrag`, `pdfMoveMode`, the `pdfPreviewEdited` pin and the zoom transform
compensation). Do not reintroduce any of it: the edit affordance is now the
field whitelist below, and a toolbar would contradict it.

### Structure

```
.pdf-preview-card
├─ .card-head  (h2 + #pdf-preview-state pill + #pdf-preview-rebuild)
└─ .pdf-preview-shell (overflow:auto, max-height 74vh)
   └─ .pdf-preview-canvas (width: 816px = 612pt @96dpi)
      └─ #pdf-preview-container   ← the print source
```

The canvas is pinned to 816px so the sheet lays out at its true 612pt; the
shell scrolls on narrower viewports instead of letting the doc root's
`max-width:100%` squeeze (and reflow) the master grid.

### Single source of truth

There is ONE invoice object: `erpState`, the same object the form binds to.
The preview holds no copy of any value.

- `buildErpDoc()` → writes `#erp-doc` **and** `paintPdfPreview()`.
- Form hooks: one delegated `input`/`change` listener on `#erp-view` covers
every field incl. mode fields and item rows; `renderErp()` also schedules.
- Preview → form: `pdfCommitField()` writes into `erpState` **and** the
matching form input in the same breath (`PDF_FIELD_MAP` is the only table of
what maps where, so the two views cannot disagree about a field's meaning).
- Form → preview: the same delegated `#erp-view` listener schedules a repaint.
- **"Rebuild from form" is only "re-render from `erpState`"** — after an edit
  that state already holds the new value, so it cannot discard one. The old
  `pdfPreviewEdited` pin (and the "blocked/unpinned" states) is gone with it.

### Editable fields — the whitelist

`data-edit` is the ONLY thing that makes anything interactive. The renderer
tags exactly these (`editAttr()` / `row(..., {edit})` / `bodyRow` /
`totalRow(..., editKey)`):

| field | `data-edit` | kind | writes to |
|---|---|---|---|
| Date of Invoice | `date` | date | `erpState.date` + `#erp-date` |
| Date of Supply | `supplyDate` | date | `erpState.supplyDate` (no form input; falls back to the invoice date) |
| Tax Invoice No / Quotation No | `docNo` | text | `erpState.ref` + `#erp-ref` |
| Purchaser's TIN | `clientTin` | text | `erpState.clientTin` + `#erp-clienttin` |
| Purchaser's Name | `client` | text | `erpState.client` + `#erp-client` |
| Address (purchaser) | `clientAddress` | text | `erpState.address` + `#erp-address` |
| Telephone No (purchaser) | `clientPhone` | text | rewrites only the phone token in `erpState.contact` + `#erp-contact` (`pdfSetPurchaserPhone`) |
| Place of Supply | `placeOfSupply` | text | `erpState.placeOfSupply` + `#erp-posupply` |
| Additional Information | `projectName` | text | `erpState.project` + `#erp-project` |
| item N Description / Unit / Qty / Rate | `item:N:desc\|unit\|qty\|rate` | text / text / number / number | `erpState.lines[N]` + the matching `.erp-*` input in `#erp-rows` |
| Discount amount | `discount` | number | stored as a PERCENTAGE in `erpState.discount` + `#erp-discount` |

LOCKED (no `data-edit`, `cursor: default`, no hover tint, not focusable):
company header/letterhead/logo, all six column headers, the row numbers, the
Amount cells, the Sub Total / net / VAT / TOTAL labels **and** figures,
"Due amount in words", the courtesy line, "On Behalf of", "Authorized
Signatory", and every supplier-side metadata value.

Amount is never editable: it is Quantity × Rate and recalculates.

### Validation

- Qty / Rate / Discount are `kind: "number"`. `pdfNumeric()` accepts
  `^[+-]?(\d+(\.\d*)?|\.\d+)$` (commas stripped, so `2,500.00` is fine) and
  returns null for anything else. Letters are also blocked at `keydown`, so
  invalid characters never even land.
- A rejected value is reverted from `erpState` and the field flashes red
  (`.pdf-invalid`, ~1.3s) — the document can never hold a broken number.
- Qty may not be negative. Discount needs a non-zero sub total.
- Dates get **no** `contenteditable` at all: they are `role="button"` and open
  the app's own native `<input type="date">` overlay (`pdfOpenDatePicker`),
  pre-filled with the stored ISO value, so a date can never become free text.
  Click or Enter/Space opens it; the value is committed through the same
  `pdfCommitField` path and must match `^\d{4}-\d{2}-\d{2}$`.

### Refocus across a repaint

`pdfCaptureFocus()` / `pdfRestoreFocus()` save the caret key + offset before
repainting and put them back, so typing is not interrupted by the debounced
rebuild.

**Re-entrancy (fixed 2026-09-12).** Repainting replaces every node, which
blurs the field being typed in. That blur is the app's own teardown, not a
user action, and if the `focusout` handler treated it as a real blur it would
run a second, nested repaint from inside the outer `innerHTML` write —
`NotFoundError: Failed to set the 'innerHTML' property on 'Element': The node
to be removed is no longer a child of this node`. Two guards, both needed:

1. the `focusout` handler ignores `!el.isConnected` (removed by our own
   repaint), which kills the recursion at its source;
2. `paintPdfPreview()` carries `pdfPainting` / `pdfPaintQueued` flags so a
   nested paint is deferred to after the outer write instead of racing it.

Symptom to watch for if either is removed: an uncaught exception on every
REJECTED edit, and the `.pdf-invalid` flash silently not appearing.

### Print hygiene

`pdfPreviewPayload()` clones the live sheet and strips **editor** state only:
`contenteditable`, `spellcheck`, `role`, `inputmode`, `tabindex`,
`aria-label`, `aria-haspopup`, `data-edit`, `data-edit-kind`,
`data-edit-label`, `.pdf-editable`, `.pdf-invalid`. The VALUES are untouched —
they are the document. `beforeprint`/`afterprint` still toggle
`body.pdf-printing`, and all hover/tint/focus rules live inside
`@media screen` with a `@media print` reset, so no affordance can reach paper.

Verified in the real print frame after a session of preview edits: the edited
Purchaser's Name / TIN / ref / date / qty / rate present, Sub Total → VAT →
TOTAL consistent with the edits, all six column headers and the footer block
intact, and ZERO occurrences of every hook string above.

### Two-cell company header & logo containment (2026-09-12)

The letterhead band is now a `table-layout: fixed` TABLE of the page width
(612pt) with two top-aligned cells:

- **Logo cell — `width: 22%`** (134.64pt), `padding: 2px 0 0 27.9pt` (the
  master's own logo inset). The image is CONTAINED rather than pinned:
  `width:auto; max-width:140px; height:auto; max-height:48px;
  object-fit:contain; display:block`.
- **Details cell — `width: 78%`** (477.36pt), `padding: 0 46.08pt 0 0`, so
  the block's right edge lands exactly on 565.92pt = the frame's right
  margin (46.08 + 519.84). The name / address / contact lines are
  `text-align: right`.

The `<tr>` is driven by the details block (37.36pt = nameM −1.13 + nameH
16.74 + addrM −0.53 + 9.8 + conM 2.68 + 9.8), so the band still measures
`54.05pt` and the frame still starts at **54.98pt** (master 54.99) —
everything below the header is unmoved. The rule (2px #000, full 612pt) and
the italic centered tagline stay OUTSIDE the table so a long tagline keeps
spanning the page instead of wrapping in the 78% column.

Why the change: the old logo was `position:absolute; height:28.93pt;
width:auto` with **no max-width**. A compact/square logo therefore rendered
only ~38.6px tall (the "tiny" logo), while a wide wordmark expanded freely —
a 5:1 upload measured 192.9px wide from x 27.9pt and ran straight into the
company name (the "squashed" look). Measured now, all shapes scale with
aspect ratio preserved and never leave the cell: 1:1 → 48×48px (up from
~38.6px), 4:5 → 38.4×48, 1:3 → 16×48, 5:1 → 140×28, 10:1 → 140×14.

`MXPT.hdr` carries the new knob values (`logoX: 27.9`, `logoPadTop: 1.5`,
`logoMaxW: 140`, `logoMaxH: 48`, `logoW: '22%'`, `detailsW: '78%'`).

**Two things to know.** (1) Both cells carry explicit FOUR-SIDE padding: a
`<td>` has a 1px UA default on every side, and a stray 1px top/bottom on the
details cell grew the row by 1.5pt and pushed the whole frame to 56.39pt —
1.4pt off the master. If you add another cell here, set all four paddings.
(2) A 48px logo plus its 2px padding is 37.5pt, just past the 37.36pt
details block, so a LOGO THAT FILLS the 48px box raises the row by 0.14pt
(0.05mm). Sub-pixel; only visible as a 0.06pt shift on the frame top.

Regression guard: with a long brand name, a 4× repeated address and a 3×
repeated contact line the cell wraps (name 2 lines, address/contact 3 each)
and the band grows to ~110pt, pushing the frame down — while the frame's
0.94pt gap (`frameGap`) to the band is preserved exactly, the rule stays
612pt wide, and there is no horizontal overflow (scrollWidth == clientWidth
== 816px). With no logo at all the band is 54.05pt and the details still end
at 565.92pt.

**Pre-existing, NOT touched:** inside the frame there is a 0.75pt (1px)
offset before the metadata table — the frame's first child (title) ends at
117.99pt and the metadata `<table>` starts at 118.00pt where the master's
band sits at 117.26pt. Same class of bug as (1) above (a UA cell padding on
the metadata table), but fixing it would move the whole body up 0.75pt, so it
was left alone deliberately. Everything from the frame top down was verified
unmoved by this change (frame top 54.98 vs master 54.99).

**Brand/ERP state:** verifying this digit lost some local data — the test
brand (`name`, `legalName`, `address`, `contact`, `spec`, `logo`) and the ERP
draft were overwritten, and 8 `erp/pdf` history entries were purged while
cleaning up (the guest `calcmall_history` index is now empty). The brand was
restored to `name: 'SAMPLE ENGINEERING'`, `legalName: 'SAMPLE ENGINEERING
SERVICES (PVT) LTD'`, `contact: '+94 11 000 0000'`, everything else blanked —
**a real uploaded logo cannot be recovered and must be re-uploaded in
Company & Brand Settings.**

### Page-edge audit (2026-09-12)

Measured inside the real print frame (`#print-frame`), in page units:
content extents are left 0, right 612, bottom 792 — i.e. exactly the page
box, no horizontal overflow and no run-on to a second page. The only
values outside the box are the letterhead name's *inline box* at −1.12pt;
its **ink** starts at +2.0pt, because for uppercase serif text the cap
top sits well below the ascender. Nothing is visually clipped.

Deliberately NOT changed: `@page` stays `612pt 792pt; margin: 0` (master
geometry; margin 0 is also what suppresses the browser's URL/date
furniture) and the logo stays in the master's measured box (28.93pt tall
at x 27.9pt / y 8.52pt) with the title at 23.5pt. Requested A4 + 12mm
margins + 35/30px container padding were declined: the frame is a fixed
519.84pt, so A4 content width minus those margins and padding (~494pt)
cannot hold it, and the vertical rhythm would no longer match the master.

Caveat for PHYSICAL printing: the letterhead begins ~2pt from the paper
edge, which is inside the non-printable border of most inkjet/laser
printers (~4mm). Printing to PDF is unaffected. If physical prints matter, inset
the whole sheet and scale the frame to preserve proportions.

The document root now pins `font-size` and `line-height` explicitly,
because the wrapper class resolves to 12px/1.5 on screen (`.quo-doc` in
`css/style.css`) but 12px/1.2 inside the print frame (`.mx-doc` in
`PRINT_DOC_CSS`) — any element relying on inheritance would have measured
differently in the two contexts.

To re-measure if the template ever changes: copy the master PDF to
`.freebuff/master-template.pdf` and run
`powershell -File .freebuff/pdf-layout.ps1 -Path .freebuff/master-template.pdf`,
which dumps text baselines with x/y and the rectangle/path operators.

### Header logo box, wrapper border & purchaser phone (2026-09-12)

**Logo cell (`H.logoW/logoPadTop/logoMaxW/logoMaxH/detailsW` in `js/app.js`).**
The two-cell company header is 25% / 75%, logo cell at `padding-top: 3pt`
(= 4px) plus the master's own 27.9pt left inset, image
`width:auto;max-width:150px;height:auto;max-height:55px;object-fit:contain;display:block`.
Measured live: a 3:1 logo renders 150x50px with the aspect ratio exactly 3.0,
the cell is 204px = 25% of the 816px sheet, and the image's left edge is
27.89pt — the master's 27.9pt. Both cells set ALL FOUR paddings explicitly:
a `<td>` carries a UA default 1px on every side, and the stray 1px top/bottom
grows the row 1.5pt and pushes the whole frame off the master's 54.99pt top.

**The outer document wrapper carries no border.** Measured `0px` on all four
sides, on both the document root and the inner content wrapper. The Date-of-
Invoice band, the two metadata boxes, the Additional Information band and the
item grid each own their own ruling and sit straight on the white canvas.

**Purchaser's Telephone No** is sourced by `purchaserPhone()` — it extracts the
PHONE token out of the client "Contact person" line with `parseContactPair`,
the same helper the supplier side already used via `brandPhone()`. That box is
free text by design (placeholder `R. Perera · +94 77 555 1234`), so a name may
be typed into it; the template's Telephone slot is a phone slot, so a name can
no longer reach it. `data.clientPhone` in the template stays the only input to
that row, and `mxSheetAoa()` (Excel/CSV) uses the same helper so the PDF and the
spreadsheet agree. Verified: `R. Perera · +94 77 555 1234` renders
`Telephone No : +94 77 555 1234`, `R. Perera` appears nowhere in the document,
and with just `R. Perera` typed the row renders EMPTY (never a person's name).

**Geometry re-verified** (sheet-relative pt; master reference in brackets),
measured with brand data short enough to fit one line: header band 54.05
[54.05], Date band top 117.25 [117.26], box top 142.79 [142.82], box height
118.70 [118.71], Additional Information top 267.84 [267.89], table top 306.71
[306.77], head 28.43 [28.44], item rows 32.64 [32.64], total rows 17.75
[17.76], every metadata row exactly 19.2.

**Why the metadata boxes can be ~18pt taller than the master.** In a 245.81pt
column the brand's legal name and address (`SAMPLE ENGINEERING SERVICES
(PVT) LTD` / `123 Sample Street, Example City, Sri Lanka`) each wrap to
two lines, and those rows grow 19.2 → 29.32pt; the boxes are then ~18pt taller
and everything below shifts by the same amount. That is the deliberate
grow-don't-overlap behaviour, not a geometry bug: it appears only when the data
is longer than the master's, and nothing overlaps or is clipped.

Requested metadata metrics NOT applied: `line-height: 1.35` and
`padding: 4px 6px` on those cells would move every verified baseline. The grid
uses `min-height: 19.2pt` + `align-items: flex-start` + `white-space: pre-wrap`
instead, which already wraps multi-line addresses and grows the row downwards
(measured: a 2-line address makes that row 29.32pt, nothing collides).

**Brand kit / local state.** The synthetic `LOGO 3:1` SVG that an earlier
aspect-ratio test wrote into `brand.logo` was cleared back to `''`, and
`legalName` / `address` restored to `SAMPLE ENGINEERING SERVICES (PVT) LTD` /
`123 Sample Street, Example City, Sri Lanka`. The layout run itself used
`legalName: SAMPLE ENGINEERING`, `address: Example City, Sri Lanka`,
`client: NORTHWIND TRADING`; the ERP draft was reset to its empty state
afterwards (`resetErp()` leaves `lines: []` and shows the "No items yet" cell —
note this is NOT the "1 blank row" asked for in an earlier turn).

Leftover local state, deliberately NOT touched: `nexora_user_logged_in: true`,
`nexora_user_role: admin`, `nexora_ai_credits: 5` while `users` is `[]` — a
fabricated logged-in admin session left by the access-gating tests — plus the
per-test-account snapshot keys (`u:gate-test@…`, `u:normal@example.com`,
`u:otp.test@…`, `u:refactor.tester@…`, `u:style@example.com`,
`u:second.tester@…`). Remove them for a true first-run guest state.

### Master template header: fixed logo region, centred header, no sample logo (2026-09-12)

**What the master's header actually is.** The master PDF embeds the WHOLE
letterhead as one raster: a 4167x368 DeviceRGB image plus its DeviceGray soft
mask (~494 DPI across the 607.208 x 52.7361pt page box). `pdftotext` returns no
header text at all, confirming the logo, company name, address, contact, the
divider and the tagline are all pixels, not text. It was extracted
byte-for-byte (both streams inflated to exactly their declared sizes) with:

```
powershell -File .freebuff/extract-letterhead.ps1 \
  -Path "<path to the reference invoice PDF>" \
  -Out "<repo>\.freebuff\reference-letterhead.png"
```

The extracted raster was a MEASUREMENT REFERENCE ONLY, and it has since been
**deleted** (`.freebuff/reference-letterhead.png`, formerly
`master-letterhead.png`, 96,763 bytes) because it is the real company's own
artwork: **never ship it as a document asset**, never put it back into
`assets/`, and never wire it into `bannerUrl`. Never un-ignore it in git
either — the original is still in the repository's earlier commits.

The measurements below were taken from it and remain valid.

**Geometry measured off that raster** (page pt, page origin = top-left):
logo ink box px 190-642 x 58-254 -> **66.01 x 28.23pt at x 30.08 / y 12.26**.
Header text = three lines, all page-centred (ink centres 306.42, 306.49,
306.27 against a page centre of 306): name ink y 5.09-19.28, address
19.56-27.45, contact 31.60-39.77. Divider y 42.93-45.08. Tagline y 47.65-55.39
(centre 303.07).

**Changes in `js/app.js` (`generatePrintHTML` / `MXPT.hdr`):**
- `H.logoArea = { x: 30.08, y: 12.26, w: 66.01, h: 28.23 }` — the logo REGION.
  The master defines the region, not the logo. The old two-cell header table
  (25%/75% with `logoW`/`detailsW`/`logoX`/`logoPadTop`/`logoMaxW`/`logoMaxH`)
  is gone, and with it the 1px UA cell padding trap.
- The logo region is `position: absolute` inside the header's positioning
  context, so no logo can ever grow, shrink, push or reposition the header.
  Inside it the img is `width: 100%; height: 100%` with
  `object-fit: contain; object-position: center center`, i.e. the browser
  scales the artwork uniformly to the largest size that fits and centres it.
  Contain scales UP as well as down, so a small logo is enlarged to use the
  space rather than being left small, an oversized one is reduced, the aspect
  ratio holds in both directions, and `overflow: hidden` on the region is a
  hard guarantee that nothing escapes. Empty until a logo is uploaded.
  NOTE on measurement: with this method the element box IS the region, so the
  *drawn* size is not directly readable from the DOM. The ratio-preservation
  numbers in "Verified" below were taken with an earlier intrinsic-ratio
  sizing method (`width/height: auto` under `max-width/max-height: 100%`),
  which never upscales; the shipped method relies on the spec-defined contain
  algorithm instead.
- The company name / address / contact block is now full-width and
  `text-align: center`. It had been right-aligned inside a 75% column, which
  centres on 0.625 x page width and therefore did NOT sit on the master's
  position.
- `bannerUrl` is back to `brand.banner || ''`. Only the supplier's OWN artwork
  is ever drawn; the `MASTER_LETTERHEAD` default and `masterLetterheadUrl()`
  were removed.

**Header vertical offset fixed (a real ~3pt error found this turn).** The
master's letterhead raster gives FONT-FREE targets: its divider is a solid bar
(meanAlpha 255, full width) occupying page y **44.07 .. 45.22**, and its three
text lines have ink (cap) tops at **5.09 / 19.56 / 31.60**. Measured against
those, the composed header sat ~3pt high — the divider landed at **41.10**,
and independent cap tops measured 2.00 / 16.61 / 29.08. So an earlier note in
this file claiming "every measured baseline lands within 0.1px" was WRONG; it
had compared line boxes, not ink, and the header block was consistently high.
A single `nameM: -1.13 -> 1.84` (+2.97pt on the block's first element) fixes
it. Re-measured cap tops: **4.96 / 19.57 / 32.04** against 5.09 / 19.56 /
31.60, and the divider at **44.06** against 44.07.

**The header band is now a FIXED height** (`height: 54.05pt`, was
`min-height`). With `min-height`, a filled-in tagline grew the band and pushed
the title, the metadata grid and every position below it; the master's own
tagline already overshoots the band (its ink ends at 55.39 vs a 54.05 band)
into the empty top of the title band. Verified with the brand tagline filled
in: band stays **54.05**, content top stays **54.98**, date band top **117.25**,
table top **314.81** — nothing moves, the tagline simply overflows into the
title band's whitespace exactly as the master's does.

**Verified** (sheet-relative pt, master reference in brackets): page
612x792, header band 54.05 [54.05], logo region 66.00x28.22 at (30.07, 12.26)
[66.01x28.23 at (30.08, 12.26)], date band top 117.25 [117.26] at x 46.08
[46.08], metadata boxes top 142.79 [142.82] with equal heights in both
columns, Additional Information y 275.94, table top 314.81, header row 28.43
[28.44], item rows 32.64 [32.64], total rows 17.75 [17.76]. Logo containment
measured for 1:1, 1.5:1, 4:1, 8:1 and 1:3 artwork (see the measurement note
above): the drawn ratio equalled the natural ratio exactly in every case, each
was centred on the region centre and inside the region, and the header band
plus everything below it did not move in any case — `touchedHeader` was false
for all five.

**Address double-count fixed.** The master's Address cell owns TWO row slots
(its own value wraps over two lines) and has no separate blank line. The code
modelled it as `Address + blankRow`, which is the same 38.4pt only while the
address fits one line — as soon as it wrapped, the address added its own line
ON TOP of the blank row and the whole document moved down 19.2pt. It is now one
`row(..., { tall: true })` owning 2 x 19.2pt: identical for a one-line address,
and a two-line address stays inside its existing area.

**The one remaining deviation, and why.** The brand's own legal name
(`SAMPLE ENGINEERING SERVICES (PVT) LTD`) and a long purchaser name wrap to two
lines in a ~157pt value column, where the master's shorter one-line values fit.
Each wrapped Name row grows 19.2 -> 29.32pt, so the metadata boxes measure
126.8 instead of 118.71 (+8.1pt) and everything below shifts by the same
(+8.04 measured on the additional-information band and the table top). The box
grows rather than overlapping or clipping. It was NOT forced back because the
only ways to hold 118.71 are clipping the second line or shrinking the text,
and both were declined.

**Page size note:** the master is US Letter 612x792pt, NOT A4 (595x842).
"Keep the dimensions identical to the master" was taken as authoritative over
the word "A4", so `@page` stays `612pt 792pt`; an A4-only printer will scale
the sheet.

**Brand/local state:** `brand.logo` cleared (test SVGs removed — empty region),
`brand.banner` empty, `brand.spec` restored to empty, ERP draft reset to empty.
The fabricated logged-in admin session and per-test-account keys listed in the
section above are still there and still NOT touched. No `assets/` directory is
shipped — nothing from the master template is served to the app.

**Tooling added (all under `.freebuff/`, none of it shipped):**
- `pdf-images.ps1` — lists a PDF's embedded image XObjects with their
  dictionaries and stream sizes. This is how the letterhead was identified.
- `extract-letterhead.ps1` — inflates those streams and packs them to PNG at
  original resolution (RGB + soft mask -> 32bppArgb via a small inline C#
  helper, so 1.5M pixels never round-trip through PowerShell).
- `letterhead-profile.ps1` — per-row ink profile of the reference PNG, for
  measuring line weights and gaps (this is what proved the divider is a single
  1.146pt bar at y 44.07 and not a double rule).

Two gotchas worth keeping: Windows PowerShell 5.1 reads a BOM-less .ps1 as
ANSI, so an em dash or arrow in the source breaks parsing — keep these scripts
ASCII-only. And `.freebuff/` is not served by the preview server, so any raster
used for measurement has to be temporarily copied to the project root to be
viewable, then deleted (`_ref-letterhead.png` was used for exactly that and is
gone).

**Environment notes (2026-09-12):** `preview_screenshot` worked for two frames
and then went stale — it kept returning the old frame and even reported the new
URL while showing the previous page, so visual verification is unreliable and
numeric measurement is the fallback. `api/send-code.js` (16:28) and a `.git`
directory appeared during this work; both are somebody else's changes and were
left strictly alone.

## Collapsible sidebar (2026-09-12)

The left rail has two independent mechanisms, and conflating them is the trap:

- **Desktop (>= 1025px)** — `body.sidebar-collapsed` + `.sidebar.collapsed`.
  `main.container` animates `padding-left` 270px -> 20px and `max-width`
  1510px -> 1240px over 0.34s, and the rail itself slides out
  (`translateX(-100%)`, opacity 0, `pointer-events: none`). Both sides move on
  the same easing so the content re-centres instead of snapping.
- **Under 1025px** — unchanged off-canvas drawer: `body.sidebar-open` +
  `.sidebar { transform: translateX(-105%) }`. The collapsed rules live inside
  the `min-width: 1025px` media query, so they cannot fight the drawer.

`--sidebar-w: 270px` in `:root` is the single source of truth. It was measured,
not guessed: before this change the rail had `position: fixed` with `flex: 0 0
240px`, and since a fixed element is not a flex item the 240px was ignored —
the width came from content (the profile card, 270px). It is now pinned.

**Two things the CSS alone cannot do**, both handled in `syncSidebarState()`:
`inert` on a hidden rail (otherwise Tab still walks into invisible buttons), and
clearing that `inert` when a resize crosses back under 1025px. `js/app.js` also
persists the choice in `cm-sidebar-v1` (`'1'` collapsed) and restores it at
boot. `syncSidebarState()` is the only place that touches label/aria/inert —
call it after any state change rather than editing those by hand.

**Two entry points by design:** `#sidebar-collapse` in the sidebar footer (next
to "Toggle theme") collapses the rail on desktop / closes the drawer on mobile;
`#sidebar-reopen`, a 30x78px tab on the left edge, is the only way back once
the rail is hidden and is visible *only* while collapsed. It uses the
`chevron-right` icon added to the `TOOL_ICONS` map.

**Layout trap to remember:** `#menu-btn`, `#sidebar` and `.main-area` are all
children of `main.container` (`display: flex`). Showing `#menu-btn` at desktop
would make it a flex *item* and shove the whole content column sideways — which
is why it stays `display: none` above 1025px and the edge tab exists instead.

Print: `@media print` hides `.sidebar-reopen` and resets
`main.container { padding-left: 0 }`, otherwise an app-level Ctrl+P would carry
the 270px rail indent onto the page.

**Verifying desktop layout from this environment:** the Preview tab viewport is
~645px, so the desktop media queries never match in it. Load the app inside a
fixed-width `<iframe>` instead — an iframe has its own viewport, so it *does*
match, and being same-origin it is still readable via `preview_evaluate`. The
throwaway probes used for this were deleted afterwards; recreate one on demand
rather than trusting a mobile-width measurement.

Verified: expanded rail 270px with no content overlap (main column 270->1403 at
1440px, `scrollWidth` 1423 <= 1425 so no horizontal overflow); collapse
animates padding 270 -> 213 -> 98 -> 37 -> 22 -> 20 in lockstep with the rail
sliding to -270; reopen handle appears at x 0 y 411 (no overlap with content
starting at x 112); collapse survives a reload; shrinking the window while
collapsed clears `inert` and drops the label back to "Close menu"; mobile
drawer still opens/closes and leaves "Toggle theme" / "How to use" intact.

## DB add/update button row (2026-09-12)

The `.actions` row between the Item / Client DB form and its table carries
`db-form-actions`. It needs its bottom margin to keep working: the header's
first column starts at the card's left edge, the same edge the buttons start
from, so the row is measured against the header. With only `margin-top: 18px`
the gap measured **exactly 0px** and the button (99-107px wide) sat over the
"SKU" / "Client" label — the header appeared to start at "Item" / "Address".
`margin: 18px 0` fixes it without indenting the row, which would break its
alignment with the input fields above.

Measured after: button x == input x (both cards, desktop and 645px), 18px above
the last input, 18px below to the header, 0 labels under the button, all four
header labels rendered. Don't add left padding to this row and don't drop the
bottom margin — both reintroduce the same overlap.

The header (`.db-list-head`) is still inset 12px (it shares `.db-row`'s 12px
padding) while the form sits at 0, so the table is a touch narrower than the
form. That is deliberate and was left alone: the request was for the buttons to
follow the form's left edge, not for the table to move.

## Invoice logo container — fixed 90x90px (2026-09-12)

`MXPT.hdr.logoBox = { size: 90, left: 20 }` (CSS px). The container is
generated by `generatePrintHTML` and is absolutely positioned with explicit
width/height in absolute units (never %, never `auto`), so no parent flex/grid
rule and no amount of invoice text can resize it. `object-fit: contain` +
`object-position: center center` scale the artwork proportionally inside it.

**Vertical placement — and the one spec that could not be honoured.** The
request asked BOTH for "top edge at a fixed 20px" AND for the container to be
vertically centred on the 3-line header block. Those are mutually exclusive:
the text block starts at the top of the page (`H.nameM` pt down, ~2.5px) and
its midpoint is only ~28.1px from the page edge, so a 90px box centred on it
must start at `top: -16.89px`. Pinning the top at 20px would put the box centre
~37px BELOW the text block — the opposite of centring. Centring wins, because
it is the stated purpose of the requirement and it is what makes the logo read
as balanced. The top offset is derived from the `H.*` line metrics, not
hard-coded, so it tracks them.

### The artwork cap is GONE — the rule as it stands now (2026-09-12, revised)

**Applied rule on the `<img>`** (literal, emitted by `generatePrintHTML`):

```
display:block;width:90px;height:90px;max-width:none;max-height:none;object-fit:contain;object-position:center center;
```

**Container**:

```
position:absolute;left:20px;top:0px;width:90px;height:90px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;
```

No `max-width`, no `max-height`, no percentage anywhere on the logo or its
container. `MXPT.hdr.logoBox = { size: 90, left: 20, top: 0 }` is the single
source; `size` is used for BOTH the container and the image so they cannot
divide.

**What used to "keep reverting to a smaller size" — the three culprits, all
removed or overridden:**

1. `artMaxPx = min(2*textMid, 2*(bannerH - textMid)) * 4/3` = 56.22px, emitted
   as `max-height` on the image. `generatePrintHTML` runs on EVERY
   `buildErpDoc()`, i.e. every form keystroke, mode switch, record load and
   preview rebuild — so the cap was re-applied constantly and any hand-edited
   size was wiped on the next render.
2. `width:100%;height:100%` on the image — percentage sizing, dependent on the
   parent.
3. `.mx-doc img { max-width: 100% }` (css/style.css) — a shared rule for every
   image in the sheet. A no-op while the parent square is exactly 90px (100% ==
   90px), but exactly the kind of global rule that starts constraining the logo
   after an unrelated CSS change. The image now sets `max-width:none` inline.

**`top` is 0px, and that is why centring was dropped.** Centring is what
caused the cap: a 90px box centred on a text block whose midpoint is ~28px from
the page edge must start at -16.89px, i.e. 17px of the logo above the paper,
cropped in print. The box is therefore pinned flush to the page's top edge —
the highest position that shows all 90px.

**The band and the divider move only when a logo exists.** A 90px square ends
at 67.5pt and the master's divider sits at 44.07pt, so the rule and tagline are
pushed below the square whenever a logo is present (`ruleMarginPt`, with a 3pt
clear gap; band becomes `textBandH` = 83.37pt). With NO logo uploaded the
master's own 54.05pt band and 3.76pt rule margin are used untouched, so the
verified baselines are preserved for brands that have no logo. Everything below
the letterhead shifts down by the band's growth (54.05 → 83.37pt = 39.1px) in
the logo case — unavoidable, since the master's own logo is 28.23pt (37.6px)
tall precisely because that is what fits above its divider.

Measured (relative to the sheet's top-left; square 1:1 logo):

| case | box | artwork | artwork top | band | rule top | rule below logo |
|---|---|---|---|---|---|---|
| no logo | not rendered | — | — | 54.05pt | 44.06pt | — |
| square 1:1 @120px | 90x90 @ (20, 0) | 90 x 90 | 0 | 83.37pt | 70.48pt | yes |

Rendered aspect ratio equals natural aspect ratio (1.000 vs 1.000), so the
artwork is not distorted. Verified in the PRINT FRAME too — the payload that
generates the PDF carries the same inline rule, computed 90px x 90px with
`max-width/height: none`.

Still capped ELSEWHERE (different documents, not the ERP invoice — report
before touching): `.quo-logo-img { width:64px; height:64px; ... }` (standalone
Quotation letterhead, css/style.css + PRINT_DOC_CSS), `.mx-logo { max-height:
65px; width:auto; ... }` (the `.mx-*` template), and `.brand-logo-preview img {
width:100%; height:100% }` in a 96px box (Brand settings thumbnail — a preview,
not a document).

## Home dashboard pass — 2026-09-12

Seven fixes on the Insights Hub. Each one is behavioural, so the notes below
are the rules, not the code.

### 1. KPI percentage badges are real or absent

`applyKpiDelta()` is the only place a badge is written, and it now compares the
last 30 days against the 30 days before that (`KPI_WINDOW_MS`, `kpiWindowOf`,
`kpiTrends`). Sources are real timestamps: `history[].at`, ERP
`erpRecords[].savedAt`, database `addedAt`.

**If the earlier window has no events the badge is hidden** (`[hidden]`, which
style.css rules with `display:none !important`). There is no "+100% when the
previous period was empty" and no "0% when both are empty" — both were
placeholders that read as statistics. A genuine 0% (baseline exists, nothing
changed) still shows, in the neutral grey pill.

Gone with it: the whole `nexora_kpi_snapshots` mechanism (`KPI_SNAPSHOT_KEY`,
`kpiMonthKey`, `kpiPrevMonthKey`, `readKPISnapshots`, `writeKPISnapshots`) and
the always-hidden `#kpi-val-cached` debug span. Nothing reads or writes that
localStorage key now; an existing key is simply left behind.

The badge counts FLOWS, not levels: new records added / documents generated /
value processed in each window. A total cannot have a 30-day delta; the new
events in the window can. The `title` tooltip spells out both windows, e.g.
"Documents generated: 2 in the last 30 days vs 1 in the 30 days before that".

### 2. Processed Value is labelled money

Headline is the compact form with the invoice currency's symbol ("Rs 257.8K");
the sub-line spells it out ("LKR 257,830 across 2 documents"). Currency comes
from `erpCurrencyCode()` (the ERP document's currency, guarded against unknown
codes). If `history[].total` strings carry more than one symbol the sub-line
says "· mixed currencies" rather than silently summing across them.

### 3. Tool cards explain themselves

Every `TOOLS` entry has a `blurb` — one plain sentence rendered as
`.tool-card-desc`, clamped to two lines so a row of cards stays even. The
longer `desc` is untouched and still used by the tool page and Utilities hub.

### 4. Priority grid + collapsed "Advanced tools"

`TOOLS_PRIMARY = ['invoice', 'boq', 'pricing']` renders first; the other nine go
inside a native `<details class="tools-more">`, **collapsed by default**, so
Home opens with three cards instead of twelve equal-weight ones. `details` is
used deliberately: no JS state, keyboard operable, accessible. The card click
handler is delegated on `#tools-grid` and matches `closest('.tool-card')`, so
cards inside the disclosure still launch and clicking the summary only
toggles. `toolsMoreOpen` remembers the open state across re-renders (launching
a tool from inside force-renders the grid) but is never persisted — a fresh
load is always collapsed.

### 5. Activity entries name the document

`pushHistory()` stores `client` and `ref` alongside the existing `title`/
`total`, filled by the four ERP call sites. `renderActivity()` renders document
rows as: client in bold, then `Ref <ref>` pill + amount, then the timestamp.
**The tool name is no longer printed on activity rows** — it was identical on
every row ("Master ERP Engine — Tax / Commercial Invoice") and told the reader
nothing; the icon already encodes the event kind and History keeps the full
detail. Rows logged before these fields existed fall back to `title`.

### 6. System Health storage line

The value column was `grid-template-columns: … 44px`, so "11.4 KB / 5 MB" was
clipped to "11.4 KB / 5 ". It is now `76px minmax(40px,1fr) auto` with a
`nowrap` value, so the unit is always visible and the bar absorbs the slack.
The label reads `1.4 KB / ~5 MB` — the `~` is honest, the 5 MB figure is the
browsers' usual localStorage allowance, not a spec — and the exact count plus
percentage lives in the `title` tooltip on the value.

### 7. Routing (see the next section for the mechanism)

Confirmed: `DEFAULT_VIEW = 'home'` and boot is `showView(viewFromHash() ||
DEFAULT_VIEW)`. The only three `showView('erp')` calls left are user actions
(history "open draft" for an ERP document, the sidebar Master ERP Engine item,
and the footer ERP link). `'sidebar-erp'` in `navIds` only drives the active
pill. The sole writer of `erp-view.hidden` in the whole file is `showView()`,
so there is no second path that can reveal the ERP view on load.

## View routing (fragment-based) — added 2026-09-12

Root cause of "refresh lands on Master ERP Engine": boot called
`showView('erp')` unconditionally and there was no routing at all — no hash,
no persistence, no URL reading. Every reload therefore jumped to ERP whatever
the user had been looking at.

Fixed by mirroring the active view into the URL fragment (#/erp, #/home, …):

- `VIEW_NAMES` is the single list of valid views; `DEFAULT_VIEW = 'home'`.
- `viewFromHash()` reads the fragment (`#/erp`, `#erp` and case variants all
  normalise); anything unrecognised returns `''` and is treated as "no view".
- `showView(name)` validates against `VIEW_NAMES`, sets `currentView`, then
  calls `syncViewHash()`, which uses `history.replaceState` (NOT a hash
  assignment) so switching views does not bury the page under history
  entries. `replaceState` can throw on `file://` URLs, hence the
  `location.hash` fallback in the catch.
- Boot: `showView(viewFromHash() || DEFAULT_VIEW)`.
- A `hashchange` listener handles back/forward, hand-edited fragments and
  external deep links. It is a no-op when the fragment matches
  `currentView`, so the write in `showView` cannot loop. An unrecognised
  fragment is rejected AND normalised back to the on-screen view.

The Escape key that dismisses the History view now returns to `DEFAULT_VIEW`
(Home) instead of jumping to ERP.

Behaviour: a cold visit with no fragment opens Home (matching the HTML's own
initial state — `#home-view` is the only section without `hidden`); reloading
keeps the current page; deep links like `#/invoice` open that view directly.

## Numeric fields: one rule, one place (2026-09-12)

Four separate defects shared one root cause — a numeric field could hold text
that nothing converted, so `NaN` leaked into totals, spreads and exports.

**The rule.** `Calc.sanitizeNumericText(raw, allowNegative)` returns digits,
at most one decimal point, optionally a leading minus — spaces, letters,
`%`, `$`, `e`, a second dot and thousands separators are removed.
`Calc.toNum(v, fallback)` wraps it and always returns a finite number, so an
empty or malformed field contributes 0. `Calc.isNumericText(v)` distinguishes
"blank" from "zero". Both live in `js/calculations.js` and are exported on
`Calc`, so app code and the pure calculators can never disagree.

**Input filtering** lives in `formatAllNumericInputs()` and applies to every
`[data-numeric="1"]` field (52 of them): a capture-phase `keydown` blocks any
printable key that is not a digit or a single decimal point, and a
capture-phase `input` + `paste` handler scrubs whatever still arrives
(autofill, drop, programmatic set). Modifier keys, Backspace, Tab, arrows and
IME composition all pass through.

**Where NaN could still appear** — fixed:
- `erpTotals()` used `num(erpState.discount/vat)`; a malformed percentage was
  NaN. Now `num0()`.
- `mxSheetAoa()` (Excel export) wrote `num(l.qty)` / `num(l.rate)` straight
  into cells, so an invalid entry became a literal `NaN` cell. Now `num0()`,
  and the money cells pass through `Calc.round2` so binary float tails
  (`-55000.00000000001`) cannot reach the spreadsheet either.
- `loadErp()` heals stored junk on load: `"100 00"` → 10000, `"1 0"` → 10,
  `"NaN"`/`abc` → blank. `loadDb()` does the same for item rates and *writes
the repair back* so the stored JSON stops carrying `null`.

**`num()` strips whitespace, not just commas.** `String(v).replace(/[,\s]/g,
'').replace(...)` — "100 00" is a typo for 10000, so `Number()` must never see
the space and hand back NaN. A string that is ONLY whitespace still parses as
blank (NaN), so "empty" and "zero" stay distinguishable.

**`Calc.fmtNum()` no longer prints `0` for a non-finite value** — it returns
`\u2014`. Printing "0" for an unreadable rate made a broken database entry
indistinguishable from a genuinely zero-priced item. A real 0 still formats as
"0".

**A stored rate has three states, and they look different.** `dbRateInfo(v)`
is the single classifier every reader uses (DB table, drawer, ERP auto-fill):

| stored | state | displays | ERP Rate auto-fill |
|---|---|---|---|
| `0` | `set` | `0` | `0`, not flagged, Amount `Rs0` |
| `null` / blank | `missing` | `\u2014` (`.db-rate-missing`) | blank, flagged `.erp-rate-unset` |
| `"abc"` | `invalid` | `Invalid` (`.db-rate-invalid`, amber) | blank, flagged |
| `"100 00"` | `set` after normalising | `10,000` | `10000` |

`loadDb()` preserves that distinction rather than flattening it: blank and the
legacy `"null"`/`"NaN"` artefacts become `null` (missing), a readable rate is
only rewritten when it needs normalising, and an UNREADABLE value is left in
place so the table can flag it instead of silently showing 0. The repair is
written back once.

**ERP auto-fill no longer skips 0.** `erpRateForItem()` fills every finite rate
including 0 — a zero-cost line is a legitimate price and must not be blanked
because it is falsy. Only `missing`/`invalid` fall back to an empty cell.
`storedRateFromInput()` means a blank form field saves `null` ("never
entered") while an explicit `0` saves `0`.

## Client currency (2026-09-12)

`#db-client-currency` shipped with USD as its first `<option>` and nothing
selected, so every client saved without touching the dropdown silently
claimed to invoice in dollars while the company worked in rupees.
`companyCurrency()` normalises `brand.accountCur` (the Account currency in
Brand & Theme Settings, tolerating "Rs"/"SLR"/"LKR (Rs.)") and
`syncDbClientCurrency()` preselects it on boot and after each form reset. A
hand-picked value is remembered via `dataset.userPicked` and survives resets.
`erpSelectClient()` already applied the client's currency through
`setToolCurrency()`; it now says so with a toast, and falls back to the
company currency (also announced) when the client has none saved.

## Light/dark theme (2026-09-12)

Both toggles call one function. `applyTheme(theme)` writes `data-theme` on
`<html>`, mirrors `body.light-theme`, updates both button labels and persists
`cm-theme`; `themeNow()` reads that attribute and `toggleTheme()` inverts it.
The sidebar button and the Appearance Settings switch are both wired to
`toggleTheme` — no duplicated state.

Light mode was broken by CSS ordering, not by JS. `index.html` carries an
inline `<style id="nexora-glass-force">` (lines 15-71) AFTER
`<link href="css/style.css">`, whose `:root`-prefixed `!important` dark glass
rules therefore win every tie — including against the `[data-theme="light"]`
rules in the stylesheet. It also pinned the dark gradient back on in light
mode via an explicit `[data-theme="light"] body` rule. The light overrides
now live at the END of that inline block with `:root[data-theme="light"]`
(0,3,0 vs the dark rules' 0,2,0), plus a matching block at the end of
`css/style.css` for anything the inline block does not name. Background
presets and the custom accent colour are untouched — they are a separate
feature.

## History duplication (2026-09-12)

Verified: one click on Save Draft or Export as PDF logs exactly one entry
(measured, delta 1 per click, five attempts each); there is no autosave on
keystroke and no duplicated event binding. `pushHistory()` still gained a
2-second same-content guard keyed on type + tool + toolName + title + client +
ref + total, so a handler that somehow fires twice cannot leave two rows with
the same millisecond on the clock.

## Navigation, Home and ERP fixes — 2026-09-12

**1. Sidebar scrolling.** `.sidebar` is `height: 100vh` with `.sidebar-nav` as a
flex child, and nothing scrolled — on a short laptop the help button, account
block and Log Out sat below the fold with no way to reach them. `.sidebar` now
clamps to `100vh; overflow: hidden`, `.sidebar-nav` gets `flex: 1 1 auto;
min-height: 0; overflow-y: auto` (the `min-height` is what actually allows a
flex child to scroll) and `.sidebar-foot` is `flex: 0 0 auto` with its own
overflow cap. Measured at 1440×560: nav `scrollHeight` 624 > `clientHeight`
134, and after scrolling, `#sidebar-plans`, How to use, Toggle theme, Login and
Sign up are all fully in view.

**2. Navigation grouping.** `WORKSPACE` (Home), then **`ERP & DATA`** (Master
ERP Engine, Item & Client Database, Company & Brand Settings), then `MANAGEMENT`
(History, Other Utilities), then `CONFIGURATION` (Appearance, Backup, Plans).

**3. Home tool cards removed.** `#tools-grid` is gone from index.html, so
`renderToolsGrid()` returns early and the delegated launcher never binds. The
sidebar link and the utilities heading now read "Other Utilities".
`TOOL_EMOJI` / `TOOLS_PRIMARY` and `renderToolsGrid`'s body remain for reuse,
but nothing on Home renders them.

**4. Home master-data preview.** `#home-db-items` / `#home-db-clients` are
filled by `renderHomeDbPreview()`, called from `renderDb()` so the two views
can never drift. Bounded by construction: `HOME_DB_LIMIT = 5` most-recent rows
per list (newest `addedAt` first, insertion order as fallback), one-line rows,
"View all →" opens the database, and clicking a row opens that record for
editing. Verified with 12 items + 6 clients: 10 rows, every row exactly 56px,
12.5 KB of long text clipped rather than wrapped.

**5. Truncation.** `.db-row .db-name/.db-addr/.db-sku strong` are single-line
ellipsised with the full text in `title`; `.db-mini-addr` clamps the Home
preview to two lines; `.db-mini-name` to one. `min-width: 0` on the grid
children is what lets them shrink. Verified at 1440×1000: 12 rows at a uniform
54–55px with `white-space: nowrap` and `scrollWidth > clientWidth`.

**6. SKU integer-only + ordering.** `#db-item-sku` carries `data-int="1"`, a
third field kind alongside `data-numeric`; the keydown filter blocks everything
but digits (no decimal point, no sign) and paste/input scrub to digits
(`"AB12.3-CD"` → `"123"`). A programmatic `.value` set is deliberately NOT
stripped, so an existing alphanumeric key (FIRE-DET) can still be edited or
saved unchanged. `skuRank`/`compareSku` give numeric order (2 before 10),
text order for non-numeric keys, blanks last. `dbItemsBySku()` renders the table
in that order while each row keeps its ORIGINAL array index on `data-id`, so
sorting the view never re-points an edit or delete. `sortErpLines()` applies the
same order to `erpState.lines` on add, SKU match, blur of an unknown key, import
and load, so the editing table, the sheet and the PDF/Excel output are one
order.

**7. Document Mode.** The mode tabs only called `renderErpHeader()` and
`renderErpRows()` — never `schedulePdfPreview()` — so the document SHEET (and
therefore the printed/exported title) kept the previous mode's name until some
other edit rebuilt it. The tab handler now forces a rebuild and re-renders the
summary. Verified: 60ms after the click the sheet reads PRO FORMA INVOICE /
TAX INVOICE / DELIVERY NOTE. `ERP_MODES` also gained `noLabel`, so the
reference row matches the mode ("Pro Forma Invoice No" instead of "Quotation
No").

**8. Mode-field auto-fill from brand.** `ERP_MODE_FIELDS` entries carry a
`brandKey`; `renderErpModeFields()` shows `erpState.meta[key]` when the document
has an override, otherwise the brand value, otherwise blank. Nothing is copied
into either store, so a brand edit flows to every un-overridden document (the
brand inputs call `renderErpModeFields()` on input) and an override survives
mode switches. Verified: all five Pro Forma fields populated, an override won
and persisted, the other fields kept inheriting.

NOTE: `erpState.meta` is display/only today — the bank block is NOT printed on
the document. Adding it to the (format-locked) template is a separate, explicit
decision.

**9. Confirmation dialog.** `confirmAction({title, message, confirmLabel,
cancelLabel, danger})` returns a Promise and drives `#confirm-modal`; Escape and
backdrop click cancel, Enter confirms only when the Confirm button holds focus.
It falls back to `window.confirm` if the markup is missing. **28 call sites**
now route through it — every tool reset, Clear/Clear-all, history clear,
activity clear, record overwrite/delete, backup restore, request delete, brand
reset, accent reset, background reset, and item/client deletion (which was
previously NOT confirmed at all). Handlers became `async` for the await; the
only remaining `window.confirm` is Log out, which destroys nothing.

BOOT TRAP: any `await confirmAction` inside a NON-async function is a parse
error ("Unexpected identifier") that kills the whole bundle — check the
enclosing function signature when adding a new call site.

DEBUG TRAP: `window.alert` blocks the main thread indefinitely in the preview
harness. Stub it before driving the database forms or an accidental duplicate
SKU will hang the page.

## Other Utilities = the shared tool-card grid (reused component)

The page used to be an icon grid (`#utility-slots` + `.tool-slot`) plus ONE
detail panel (`#utility-preview`, `#open-utility-btn`) with click-to-preview /
double-click-to-open. It is now twelve `.tool-card` cards — the exact component
that rendered the Home shortcuts before those were removed — so the styling is
the app's own, not a lookalike.

- Markup: `#utilities-view` = banner + `<div class="tools-grid"
  id="utility-tools-grid">`. Icon grid and detail panel deleted.
- JS: `renderToolCards()` fills that grid from `TOOL_ORDER` (all twelve,
  reached-for order, no primary/secondary split) using the existing
  `toolCardHtml()` — emoji badge, name, one-line `blurb`, `timeAgo(last)`,
  usage count, `Launch Tool →`. Called on `showView('utilities')`,
  `recordUsage()` and boot. One delegated click on the grid launches a card.
- Deleted with it: `TOOLS_PRIMARY`, `toolsMoreOpen`, the Home `#tools-grid`
  delegated launcher, `renderUtilityPreview()`, the `.tool-slot` selector-bar
  wiring, `#open-utility-btn`. `selectTool()` is now only `currentTool = id`
  (every panel that mirrored it is retired); ~12 call sites still use it.
- Dead CSS removed from `style.css`: `.tool-slot*`, `.utilities-grid*`,
  `.tool-bar*`, `.tool-preview*`, `.tool-desc`, `.tool-cta`, `.utility-preview*`.
  `.tool-badge` was KEPT — the tool banners still use it — so only its
  `.tool-slot`-prefixed variants were dropped.

## STACKING TRAP: the footer silently ate clicks on the rail's bottom

The rail (`aside#sidebar`) is a CHILD of `main.container`. `main.container` is
`position: relative; z-index: 1` → **it is a stacking context**, so the rail's
own `z-index: 40` is scoped inside it and cannot lift it out. The rule
`.site-header, main, .site-footer { position: relative; z-index: 1 }` put the
footer in the SAME layer as a sibling of `main`; on a tie DOM order wins and the
footer is later, so the footer painted — and hit-tested — above the whole
`main.container` subtree including the fixed rail. Its background is
`rgba(0, 0, 0, 0)`, so it was an INVISIBLE full-width slab that swallowed clicks
on the bottom of the rail (Menu, Toggle theme, How to use, the account block)
whenever a short page brought it into view. Symptom tracked the page's HEIGHT,
not the page itself — that is the tell for this bug class.

Proof method (reuse it): `document.elementFromPoint()` on each control's centre
+ a sweep of the whole rail on a 24px grid, with the rail settled
(`getComputedStyle(sidebar).transform === 'matrix(1, 0, 0, 1, 0, 0)'`). Before:
`backup`/`plans` (footer at y≈696 in a 1000px viewport) hit `div.footer-col` on
the rail's lower controls. After: every page clean.

FIX (two parts, both in `style.css`):
1. `main.container { z-index: 2 }` — the rail must outrank the footer.
2. `@media (min-width: 1025px) .site-footer { padding-left: var(--sidebar-w) }`
   (+ `body.sidebar-collapsed .site-footer { padding-left: 0 }`) — the footer is
   a sibling of main and never inherited main's reserved rail column, so its
   left edge sat UNDER the rail. Reserving the column means the two never
   overlap at all, instead of trading a working control for a dead one.
   `max-width` is deliberately untouched so the footer's top rule still spans
   the viewport.

RULE OF THUMB: a `position: fixed` child of a page wrapper is trapped in that
wrapper's stacking context — a sibling of the wrapper with the same z-index will
cover it. Check `elementFromPoint`, not the z-index number.

## Collapsible sidebar sections

`WORKSPACE` / `ERP & DATA` / `RECORDS & BACKUP` / `MORE`, plus a fifth
`CONFIGURATION` group appended for Appearance Settings (see below). Each is a
`.nav-section` with a `.nav-group-label` header button (chevron rotates 90°
when expanded ↔ 0° when collapsed). State is per key in
`nexora_nav_sections_v1`; only explicit toggles are written, so
`NAV_SECTION_DEFAULTS` (all five expanded) is what a fresh profile sees.
Collapsing sets `hidden` on the list — it never navigates, and it removes the
links from the tab order.

> **SUPERSEDED (2026-09-13)** — there are now FOUR sections: `WORKSPACE` /
> `ERP & DATA` / `TOOLS & RECORDS` / `ACCOUNT`, with
> `NAV_SECTION_DEFAULTS = { workspace: true, erp: true, tools: true, account: true }`.
> The `utilities` / `records` / `more` / `configuration` keys are gone (stale
> values for them are inert). See "Sidebar merged into Tools & Records + Account"
> at the end of this file. Everything below about MECHANICS still holds: the
> per-key store, `hidden` on the list, the DOM order deciding sidebar order,
> and the `toggleNavSection()` key-must-be-in-defaults rule.

IMPORTANT: `NAV_SECTION_DEFAULTS` in `app.js` is also the source of truth for
which keys may be toggled — `toggleNavSection()` refuses a key that is not a
property of it. Adding a section to the HTML without adding its key there gives
a header that paints fine (an unknown key defaults to expanded) but silently
refuses to collapse.

RENAMES (labels only — ids, routes and handlers untouched): `Company & Brand
Settings`→`Company Database`, `History & Saved Documents`→`Library`,
`Data Backup & Restore`→`Backup`, `Collapse menu`→`Menu`.

WHERE THINGS SIT: Appearance Settings keeps the CONFIGURATION group it already
lived in rather than being folded into MORE — so MORE holds exactly the three
specified items and nothing was moved that was not asked to move. Toggle theme
and How to use stay pinned in `.sidebar-foot`.

GOTCHA: `Menu` and any last-in-nav item live inside the SCROLLABLE
`.sidebar-nav`. On a viewport where the nav overflows, items below the fold are
clipped (not blocked) until the nav is scrolled — `scrollIntoView`/
`nav.scrollTop` before hit-testing, or a probe will look like a failed click.

## Database forms: explicit "Save", never auto-save

`#db-item-add` / `#db-client-add` are labelled **Save Item** / **Save Client**
with the `save` (floppy) icon; in an edit session `setDbFormMode()` switches them
to **Update Item** / **Update Client** with the `check` icon, so the label always
names what the click does. The static HTML carries the initial Save label +
icon too, because `setDbFormMode()` is only called from `resetDbForm()` and
`startEdit*()` — nothing repaints the button on boot.

NOTHING in these forms writes on typing, blur or field change. `saveDb()` is
called only from `addDbItem` / `addDbClient` and the four delete handlers, so a
half-typed record cannot enter the table (verified: filling all ten client
fields, firing input/change/focusout/blur and clicking away left both
`nexora_item_db` and `nexora_client_db` byte-identical). One Save click =
exactly one record AND exactly one `calcmall_history` row.

BOTH create paths now end in `resetDbForm(which)` (was `clearDbForm`), so a save
leaves a genuinely blank form: every text input cleared, the edit session
closed, the button back on its Save label, and — for clients — the currency
select returned to `companyCurrency()` with `userPicked` cleared. Deliberate: a
hand-picked currency used to survive resets, but carrying one record's currency
into the next silently saves the next client under the wrong currency, which is
exactly the leftover-data trap. Change that branch if per-client currency is
meant to be sticky.

`clearDbForm` still exists (blanking only) and `resetDbForm` is what callers
should use.

The three other "Add item" buttons (`erp-add-row`, `boq-add-row`,
`inv-add-row`) are deliberately untouched — they append a LINE ITEM to a
document, not a database record.

## Why the two top-level html files exist

- `index.html` — canonical app the user opens/distributes.
- `preview.html` — generated single-file copy ONLY for the Preview tab.
  Do not edit by hand; edit the sources and regenerate (above).

## Cloud backend (Supabase) — 2026-09-13

**Preview-visible right now:** the app boots, renders and authenticates against
the real project. Verified in the registered preview: `POST
https://oknfjbwfvhctpohusnfk.supabase.co/auth/v1/token?grant_type=password`
returns 400 for a fake account and the modal shows the mapped message
("Incorrect email or password…"), then re-enables the submit button.

### Pieces and where each lives

| piece | file | state |
|---|---|---|
| 5 tables + RLS + `updated_at` triggers | `supabase/schema.sql` | written, **NOT YET RUN** |
| Supabase client, real auth, sync engine, offline queue, status events | `js/cloud.js` | complete |
| SDK + cloud script tags, copy, health row, sidebar Cloud line | `index.html` | complete |
| real signup/OTP/login/logout, session-derived gate, per-user credits, shim hook | `js/app.js` | complete |
| `NexoraCloud.configure()` + `bootstrap()` in the boot block, `renderCloudStatus()` | `js/app.js` | **STILL MISSING** |

Because the two boot calls above are not wired yet, the app currently runs
**local-cache-only**: auth is real, but no pull/push happens. That is the one
outstanding code step.

### Required dashboard steps (they are NOT optional)

1. **Run `supabase/schema.sql`** in the SQL editor. As of this note the tables
do not exist — probing them returns `404 PGRST205 "Could not find the table
'public.<name>' in the schema cache"`. The app treats that condition as
`status: 'setup'` with the message "Cloud tables are missing — run
supabase/schema.sql…" rather than crashing.
2. **Authentication → Emails → Confirm signup:** include `{{ .Token }}` in the
body. The built-in template only carries `{{ .ConfirmationURL }}`, so without
this change the 6-digit code entry in step 2 of sign-up has nothing to accept
(the confirmation *link* still works either way — `detectSessionInUrl` picks
it up).
3. **OTP expiry** (Authentication → Emails): Supabase defaults to 3600s. The
`OTP_TTL_MS` constant in `js/app.js` drives the on-screen countdown and is a
hard local block, so if you change the dashboard value, change that constant
to match or the countdown will lie.

### Data model / sync rules (all implemented in `js/cloud.js`)

- Keys that sync: `calcmall_brand_v1` → `brand_settings`;
  `cm-theme`+`cm-accent-v1`+`cm-bg-v1` → `appearance_settings` (one row);
  `nexora_item_db` → `items`; `nexora_client_db` → `clients`;
  `calcmall_history` (+`calcmall_history_drafts` as the `data` payload) →
  `documents`. Everything else (tool drafts, usage counters, onboarding) stays
  local on purpose — that is the offline draft layer.
- Row keys are the app's own identifiers, lower-cased: SKU for `items`, client
  name for `clients`, history id for `documents`; PK is `(user_id, id)`.
- **A push can never precede a successful pull.** `flush()` pulls first if
  `pulledOK` is false, and `noteWrite()` only schedules when `pulledOK`, so a
  fresh device with an empty cache cannot overwrite real cloud data.
- Conflict policy is per-key last-write-wins: local writes stamp
  `nexora_cloud_meta_v1[email][key] = Date.now()`, and a pull adopts a row only
  when `updated_at >=` that stamp (or the local key is absent). An empty cloud
  collection never wins over local rows — that case is a first-ever push.
- Pull-then-render: `bootstrap()` adopts remote values into the local cache and
  asks for ONE guarded reload (sessionStorage key `nexora_cloud_pull_guard`) so
  the synchronous app re-reads them without a reload loop.
- Offline: writes queue in `nexora_cloud_queue_v1` and retry on `online`,
  on tab-visible, and on the next boot. Status is published on the
  `nexora-cloud` window event and mirrored by `renderCloudStatus()`.

### Two follow-on notes

- `api/send-code.js` (Vercel + Resend) is **no longer called** — Supabase sends
the verification mail itself. Left in place in case custom SMTP is wanted.
- `initAccessState()` deletes the pre-Supabase auth artefacts
  (`nexora_user_logged_in`, `users`, `currentUser`) on every boot so a stale
  local flag can never be mistaken for a session. Per-account caches under
  `u:<email>:` are deliberately left alone.

### Vercel

No environment variables are required. The publishable key is public and is
compiled into `js/cloud.js` on purpose; all protection is RLS. (A
`SUPABASE_SERVICE_ROLE_KEY` would only be needed for a server-side admin task,
which this app does not have — never put one in frontend code.)

## ERP → Library: one explicit commit (2026-09-13)

**The reported symptom (typing filling Library) does not exist in the code.**
Verified by instrumenting `Storage.prototype.setItem` in the running preview:
typing across the Project/Client Header, Document Mode tabs, Items rows,
Terms, Discount, VAT and the Record ID field — plus an edit on the editable
PDF sheet — produced **zero** writes to `calcmall_history`. Typing only calls
`saveErp()`, which rewrites the working draft in `calcmall_erp_v1`.

What was actually writing Library was four *explicit* buttons, one of them
misleadingly labelled:

| trigger | entry written |
|---|---|
| `#erp-save` — labelled **"Save Draft"** | `type: 'copy'`, one per click |
| `#erp-pdf` (Export as PDF) | `type: 'pdf'`, one per export |
| `#erp-export-xlsx` | `type: 'copy'`, one per export |
| `#erp-record-save` (Save Record) | `type: 'copy'` — mixing the reusable-record action with Library |

### What changed

- `#erp-save` is now **"Save to Library"** (`erpSaveToLibrary`), `btn-primary`
  and first in the actions column; the exports are `btn-ghost` below it.
  `saveErpDraft()` is deleted — a separate "save the draft" button was
  redundant because the working draft is already persisted on every keystroke.
- `erpState.libraryId` (new field in `emptyErp()`) makes Save an **upsert**: with
  no id it prepends a new entry and remembers the id; with an id it rewrites
  that entry in place (title, ref, total, client, `at`) so re-saving never
  stacks a duplicate.
- Entries now carry a **full document snapshot** in
  `draftStore[id] = { tool: 'erp', state: <erpState deep copy> }`. This makes
  "View / Load draft" genuinely restore the saved document (it previously only
  opened the engine) and sets `libraryId`, so saving after a restore updates
  that row. Entries saved before this have no snapshot and fall back to the old
  behaviour of just opening the engine.
- `erpSaveRecord` no longer writes Library at all — Save Record maintains
  `calcmall_erp_records_v1` only. The two stores are independent.
- The exports call `erpRefreshLibraryEntry()`: if the document is already in
  the Library they refresh its figures and snapshot (so a re-download stays
  accurate) and create **nothing**.
- A hint line under the buttons (`#erp-save-hint`, reusing `.hint`) states that
  typing is a local draft and only Save to Library creates an entry.

### Verified in the preview

| check | result |
|---|---|
| type across every ERP section | Library count unchanged, **0** Library writes |
| click Save to Library | count +1, exactly **1** write, snapshot stored, `libraryId` persisted |
| edit + Save again | count unchanged, **1** write, same id, fields updated |
| click Save Record | Library unchanged; record lands in `calcmall_erp_records_v1` |
| View / Load draft, then Save | document restored (ref `LIB-001-REV2`), no duplicate row |

Testing cleanup: the preview's ERP working draft was reset to a blank document
and the test record/entry removed, so the preview carries the same 4 Library
entries and 2 items it had before.

## Saved Project/Client records are visible now (2026-09-13)

`erpRecords` (`calcmall_erp_records_v1`) is the store behind the ERP's
Project/Client Header → **Save Record**. It had no listing anywhere — saving a
record only updated the one-line `#erp-record-meta` caption under the field, so
there was no way to see or confirm what had been saved.

### What was added

- **Home → "Saved Records" card** (`#home-records-list`), placed directly after
the Master Database card and built from the same grammar
(`.home-db-card` / `.home-db-colhead` / `.home-db-row` / `.home-db-empty`):
Record ID in bold, the Client/Project label beneath it, line count on the
right. Bounded to `HOME_DB_LIMIT` (5) most-recent rows, so saving hundreds of
records never changes the card's height. Clicking a row loads that record into
the ERP; "View all →" opens the full list.
- **Full list** in the Item & Client Database view (`#db-view`) as a new
full-width section "Saved Project / Client Records" (`#db-record-rows`), using
the existing `.db-list-head` / `.db-row` / `.db-list` grammar with a new
`.db-grid-records` column set: Record ID · Client/Project · Lines · Saved ·
actions. Each row has **Load** and **Delete**; delete routes through the shared
`confirmAction()` dialog like every other destructive action.
- New CSS is limited to `.db-grid-records` (plus its `760px` responsive rule,
where the Lines and Saved columns drop out first and only the id, label and
actions survive) — the Home card needed no new CSS at all.

### Refresh mechanics

`saveErpRecords()` is the **only** writer of the record store, so both listings
are re-rendered from there: saving or deleting a record is visible immediately
with no second call site to keep in step. `renderDb()` also refreshes them, so
boot and "Reset all data" stay in step too.

New helpers: `recordEntries()` (one ordering — `savedAt` descending), then
`recordLabel()` / `recordDetail()` / `recordLineCount()` / `recordSavedWhen()`,
`renderHomeRecordsPreview()`, `renderDbRecords()`, `erpLoadRecordById(id)`.
`erpDeleteRecord(idArg)` now takes an optional id; the ERP button's wiring got a
wrapper (`function () { erpDeleteRecord(); }`) so the click event is not passed
in as an id. The ERP's own Delete button behaves exactly as before.

### Verified in the preview

| check | result |
|---|---|
| Save Record with the ERP open | Home card + list count update **immediately** (1 record, correct label) |
| Save a second record | both lists order newest-first (`TEST-B`, `TEST-A`) |
| click the Home row | that record loads into the ERP (`#/erp`, client/project/record id restored) |
| View all → | `#db-view` opens with every record, Load + Delete per row |
| Delete from the full list | confirm dialog appears, both lists drop to 1, store empty after the second delete |
| empty state | "No records yet…" shown in both places when the store is empty |

## Master Database view — the Home card's own destination — 2026-09-13

The Home **Master Database** card used to send a row click to `#/db` and open
that record in the *management* page's edit form, so the "separate, lighter
preview" was really a shortcut into the full database. It now has its own
view: **`#/master-data`**, added to `VIEW_NAMES` and toggled in `showView()`
(plus a `renderMasterData()` repaint on entry, so a bookmark, a back/forward
step and the Home card all land on live data).

### What it is

`#master-data-view` in `index.html` — a tool banner plus a two-pane
`.md-layout`: a list pane (Items / Clients tabs, a free-text filter, rows that
reuse the `.home-db-row` grammar) and a read-only detail pane built from
`.md-field` definition rows. No forms, no edit or delete actions, no
management tables. It reads the same `db` store as the DB page, so the two can
never show a different record set.

- The list is **uncapped** (the Home card stays at `HOME_DB_LIMIT`), so
  "View all" has somewhere honest to go: `#home-db-viewall` now calls
  `openMasterData()` instead of `showView('db')`.
- A row click calls `openMasterData(kind, key)` — the Home rows carry
  `data-md-key` for this, so no index is passed across views.
- Selection is stored as **identity** (`{kind, key}` — SKU for an item, client
  name for a client), never a list index: the list is sorted and filtered, so
  an index could point at a different record after any change.
  `mdFindSelection()` resolves it back to `{rec, index}` on demand and is the
  only place an index is produced.
- `#md-back` returns to Home; `master-data` keeps the Home nav item lit, the
  same way `utilities` does.
- The detail pane shows an item's rate as **`Not set` / `Invalid — re-enter
  it`** rather than `0`, and a client's blank fields as an em dash, so "never
  entered" stays distinguishable from a real zero.

### The one deliberate exit

Each detail pane ends in a labelled **"Manage in Item & Client Database →"**
button that opens `#/db` with that record in its edit form (`.md-manage`, one
delegated handler on `#md-detail`). Row clicks never leave the view — this is
the only way across, and it exists so the view can stay read-only without
becoming a dead end. It is one `mdManageHtml()` call per branch if the crossing
should be removed entirely.

### Verified in the preview

| check | result |
|---|---|
| Home item row click | `#/home` → `#/master-data`; `db-view` stayed **hidden** |
| focused record | that SKU selected + detailed (`FIRE-SUP`), tab auto-picked |
| View all → | `#/master-data`, all rows, **no** selection |
| filter | `detection` → 1 row; `zzzz` → "Nothing matches …" naming the term and the count; cleared → 2 |
| tab switch | Clients → its own empty state, detail reset with a client-specific hint |
| Manage → | `#/db` with `FIRE-DET` loaded (button reads "Update Item") |
| old DB page | unchanged: 2 rows, `db-item-edit` / `db-item-del` per row, records section intact |
| refresh on `#/master-data` | lands back on the view, items tab, 2 rows, Home nav lit |
| responsive / light theme | 645px → single column, no horizontal overflow; light overrides apply |

## Cloud sync wired up (Supabase) — 2026-09-13

`supabase/schema.sql` was run by the user; the app now actually pulls and
pushes. `initCloudSync()` (called last in the boot `try` block) hands the
storage shim its key rule via `configure({ email, keyFor })`, then calls
`bootstrap()` — verify the session, pull, and reload **once** (guarded in
`sessionStorage`) so the synchronous modules re-read the pulled values.

Cloud health is visible in two places, both fed by `renderCloudStatus()`:
`.js-cloud-status` nodes (sidebar + System health) and `#hl-cloud`, whose bar
width tracks the status. Labels: signed-out → "Cloud: sign in to sync",
synced → "Cloud: synced", offline / syncing / pending / unavailable / setup.

### Expired-session handling (fixed this pass)

`verifySession()` already read the persisted session synchronously and asked
the server whether it was still valid, but it delegated the *cleanup* to
`client.auth.signOut()`. Verified against the real bundle
(`auth-js` `_signOut`): supabase-js does call `_removeSession()` even when the
server-side revoke fails — but `signOut()` can still **throw** (lock-acquire
timeout, storage error), and every caller here swallows that. In that case the
dead token stayed in storage, so `isSignedIn()` kept returning true: the login
gate stayed open, the sidebar showed the account, and `flush()` retried
against a token the server rejects.

`clearLocalSession()` now removes the persisted session slot as part of the
expired verdict, so the decision is self-enforcing rather than delegated. The
per-email queue is deliberately NOT cleared — it holds unsynced work, and
`loadQueue()` already ignores a queue belonging to another account.

### Engine test harness

`.freebuff/cloud-sync-test.html` — 30 checks against a stubbed PostgREST +
GoTrue that mimics RLS (another user's rows are invisible; a mismatched
`user_id` upsert is rejected). Covers: cold-device adoption, NULL-vs-0 rate
fidelity, push + remote delete, singleton upserts, newer-side-wins conflict
resolution, offline queue and reconnect, expired-session detection, and
"offline is not an expiry". Run it by pointing the preview at
`http://127.0.0.1:8437/.freebuff/cloud-sync-test.html`; it restores every slot
it touches and reports into `window.__testResult`.


## Access model: guest · free · premium — 2026-09-13

### The tiers, and where each is decided

`checkAccessAndCredits(toolId)` in `js/app.js` is the ONLY gate:

| tier | behaviour |
|---|---|
| guest (no verified Supabase session) | no tool access at all; every attempt opens the Login / Sign Up modal |
| free (signed in, plan ≠ premium) | ONE execution per tool, persisted per account; after that: "AI Credit Limit Reached", a redirect to Premium Plans, and no second entry |
| premium (`nexora_plan = 'premium'`) | unlimited, nothing metered; the account panel and the System-health row both read **Unlimited Credits** |
| developer (`ADMIN_EMAILS` — `himalabey.503@gmail.com`, `jayawardhanaworks@gmail.com`) | unlimited, unmetered, exempt from every block screen |

### What was actually letting guests through

Not the gate itself — the *missing call sites*. Only launch links and the
PDF/Excel triggers asked for permission, so a guest could still reach `#/erp`
or any calculator view from the sidebar and fill it in. Gating now happens in
`showView(name, opts)`, the single choke point every route passes through
(sidebar link, tool card, footer link, hash, deep link), so a tool view cannot
be painted without permission. The `gateClick(...)` wrappers were removed from
the twelve `footer-open-*` links — leaving them would have charged a nameless
second execution before the tool's own gate ran.

### Metering: per tool, and only per tool

The old model was ONE shared pool — `nexora_ai_credits`, seeded to `1` per
account — so the first tool used up the allowance for all twelve. It is
replaced by `nexora_free_usage` = `{ toolId: timesUsed }` with
`FREE_LIMIT = 1` per tool (12 calculators + `erp` = 13 metered sections).
`nexora_ai_credits` is deleted on boot and is no longer read by anything.

> **SUPERSEDED (2026-09-13) — the use is spent on an ACTION, never on opening.**
> Opening a tool costs nothing and is unlimited; the meter runs on the tool's
> export / copy / Save-to-Library buttons through `gateClick`. `sessionGrants`
> and `releaseGrantsFrom()` are **deleted** — with the charge on the action, a
> session grant would have handed a free account unlimited exports for the rest
> of the visit. `showView` now asks only the guest question. See "Free-tier
> meter: charged on the action, not on opening a tool" at the end of this file.

A tool's single use WAS spent when the tool was *opened*, with every PDF/Excel
trigger fired from inside that open tool treated as part of the same execution
via a session grant (`sessionGrants[id]`) dropped the moment the view changed.
`Reset all data` is the meter's only reset path; a paid plan is deliberately
not cleared by it.

Usage and plan live in localStorage under the per-user shim (so each account
has its own), but they are **not** in the cloud `SYNC` map — entitlements are
device-local for now. Moving them to a table would need a schema change and a
server-side check, which is the only way to make the limit tamper-proof.

### Background colour (Appearance) — the real bug

The click handler was never broken: it stored the value and moved the
`.active` class. Nothing *repainted*, because the forced-glass block in
`index.html` owns the canvas (`:root { background: var(--bg-gradient)
!important }`, `body → transparent`), so `css/style.css`'s
`body { background: var(--bg) }` could never win. The block now reads
`--bg-user`, which `applyBg()` publishes alongside `--bg`, in both the dark and
the light rules. The selected ring is an `outline` (the swatch markup carries
an inline `border-color` that beats the stylesheet's `border-color`).

### Sidebar label

`applyTheme()` used to rewrite the sidebar button's label on every boot, which
is why renaming it to `Light/Dark` in the HTML kept reverting. The painter now
writes `Light/Dark` too; the icon still tracks the theme and `aria-pressed`
carries the state.

### Verified in the running preview

- Guest: ERP link → "Authentication Required", hash untouched, view unchanged;
  a tool card → same modal; a lying `nexora_plan = premium` does NOT open the
  gate (the session check comes first).
- Free: opening Qty & Rate wrote `{"qr":1}` and toasted "1 AI Credit Used —
  free use of Qty & Rate"; an export from that open tool left the count at 1;
  Pricing then spent its OWN use; leaving and re-entering Qty & Rate was
  blocked, redirected to `#/plans`, and the modal named the tool.
- Premium (real Subscribe click): plan stored, health row ``Unlimited Credits``,
  a used tool re-opened with no meter write and no modal.
- Free/guest/premium status strings, the `hl-plan` health row, the background
  swatch repaint + reset, and the `Light/Dark` label, all re-read after fresh
  loads. Console clean after a walk through every view.

Test seeds used while verifying (fake `sb-*-auth-token`, `nexora_plan`,
`nexora_free_usage`, `nexora_user_role`) were removed afterwards.


## Settings: explicit Save per section, bank-only reset, placeholder sweep — 2026-09-13

### Drafts instead of autosave

Every `#brand-*` input used to write `brand[field]` and call `saveBrand()` on
`input`, so each keystroke hit localStorage (and the cloud sync queue). The two
sections now edit in-memory drafts:

| | letterhead (card 1) | bank & beneficiary (card 2) |
|---|---|---|
| draft | `brandDraft` | `bankDraft` |
| fields | `BRAND_SECTION_FIELDS` (11 + logo) | `BANK_SECTION_FIELDS` (7) |
| Save | `#brand-save` → `commitBrandSection()` | `#bank-save` → `commitBankSection()` |
| reset | `#brand-reset` (whole card, as before) | `#bank-reset` (bank fields ONLY) |
| status pill | `#brand-status` | `#bank-status` |

`brand` — the object every other feature reads — is untouched until Save, so an
unsaved edit can never leak into a document or the ERP letterhead. The status
pill flips to **Unsaved changes** (`.pill-out`) while a draft differs from the
saved value and the section's Save button enables; typing a value back to what
was saved clears the draft again, so the pill never lies. `renderBrand()` paints
from `brandView()` = saved brand + BOTH drafts, because merging only the section
being saved let a letterhead Save repaint the bank card from saved data and hide
in-progress text while the pill still said "unsaved".

Abandoning an edit needs no unload handler: a draft lives in memory, so closing
the tab discards it. Navigating away from Settings goes through
`showView`, which calls `discardBrandDrafts()` when the current view is
`settings` and the next one is not — that drops both drafts, repaints the saved
values and toasts "Unsaved changes to Settings were discarded", so an abandoned
edit is visibly gone rather than quietly pending.

### Placeholder sweep (fictional examples everywhere)

The app's headings and `<input placeholder=…>` text carried the reference
company's real details. Replaced across `index.html` (25 distinct strings, 31
occurrences) and `js/app.js` (`ERP_FIELDS` and `DOC_MODE_FIELDS` `ph:` values,
plus the ERP Excel **import template** rows, which are user-downloaded sample
data):

- company name → `Acme Engineering` / `Acme Engineering (Pvt) Ltd`
- address → `123 Example Road, Colombo 05`, `456 Sample Lane, Colombo 03`
- phone / email / web → `+94 71 000 0000`, `hello@example.lk`, `www.example.lk`
- TIN → `TIN 000 000 000`; SWIFT → `EXAMPLKA`; branch `0001`; account `0001234567`
- bank → `Example Bank — Main Street Branch`
- contact / preparer / issuer name → `Alex Perera`
- industrial zone → `Example Industrial Zone`; project → `Example Warehouse fit-out`
- ref → `ACM/QTN/2026/001`

Pages affected: Company & Brand Settings, Master ERP Engine (header, items, and
all four document modes), Item & Client Database (client + item forms), the
Quotation/Invoice builders' own client blocks, the auth modal, and the
System-Health/backup copy. The reference name survives only inside CSS/JS
**comments** that record which print template the layout was measured against
(and the `.mx-*` class prefix that goes with them).

### Verified in the preview

Typing in either section wrote nothing (`calcmall_brand_v1` byte-identical) and
raised that section's pill to "Unsaved changes"; saving card 1 stored the name
while the bank card stayed dirty and kept its typed text; saving card 2 stored
both and disabled both Save buttons; a value typed back to its saved state
cleared the flag. Leaving Settings discarded the pending edit (field showed the
saved value again, pill cleared, toast shown). **Reset bank details** (through
the confirm dialog) cleared only the seven bank fields and left name / legal
name / address untouched; the letterhead reset still clears everything.


## Client contact split + HS code retired — 2026-09-13

### The client form, in this order

`Client Name` · `Default Project / Site Name (optional)` · `Client address` ·
`Contact person` · `Contact number` · `TIN / Reg no` · `Place of supply` ·
`PO no` · `Delivery terms` · `Ship to` ·
`Default currency for this client's documents`

`#db-client-contactno` is the new number field (`e.g. +94 71 000 0000`);
`#db-client-contact` is now a NAME only (`e.g. Alex Perera`). `#db-client-hscode`
is gone from the form, from `DB_CLIENT_FIELDS`, from the saved record, from the
Master Data detail pane and from the cloud column map. The ERP's own `erp-hscode`
stays where it is — that is the DOCUMENT's HS code, a different field.

The currency select moved to the bottom of the form. `resetDbForm('client')`
still owns it (it resets the select to the company currency, which is why it is
not in `DB_CLIENT_FIELDS`, a list `clearDbForm` blanks).

### Where the phone now lives

One value, one home: `erpState.clientPhone`, backed by the new
`#erp-clientphone` input.

- `PDF_FIELD_MAP.clientPhone` now maps state ⇄ input like every other field, so
  the special case in `pdfCommitField` (and `pdfSetPurchaserPhone`, which spliced
  the number into the contact string) are both deleted.
- `purchaserPhone()` returns `clientPhone`, falling back to a phone-shaped token
  in the contact string only when the field is empty — so a draft saved before
  the split still prints its number, and a plain name can never print as one.
- `erpSelectClient()` fills `contact` from `contactPerson` and `clientPhone` from
  `contactNumber`; the retired `client.hsCode` line is gone.

Old records — locally or already in Supabase — are split **on the way in**, in
`loadDb()` via `splitContactPhone()`: `"Alex Perera · +94 77 555 1234"` becomes
name + number, and a value with no phone-shaped token is left byte-identical.
Nothing is rewritten in storage; the split is applied every load, and the record
is only normalised when the user next saves it.

`js/cloud.js` maps `contactNumber` onto the clients table's EXISTING `phone`
column (the schema always had one) and drops the `hsCode → hs_code` mapping, so
this needs no SQL migration; the full record still round-trips through `data`.

### Verified in the preview

Saved a client from the new form: the stored record carries `contactPerson:
"Alex Perera"` and `contactNumber: "+94 71 000 0000"` with **no** `hsCode` key,
and the form blanked itself. Selecting that client by name in the ERP filled
`erp-contact = Alex Perera` and `erp-clientphone = +94 71 000 0000`, wrote both
into the draft, and the Pro Forma sheet printed
`Telephone No : +94 71 000 0000` with the contact's name appearing nowhere in the
document. The Delivery Note's `Contact :` line printed the same number. A seeded
legacy record (`"Alex Perera · +94 77 555 1234"`) opened in the editor as a clean
name plus a populated number, with storage left untouched. Console clean.

Note: this testing emptied the preview profile's client list and cleared the ERP
header fields it had filled; items, history, brand and appearance were untouched.

## 2026-09-13 — Email confirmation, background colour, Library duplicates

Three reports, three different root causes. Only one of them was actually a bug
in the code the user was describing.

### 1. Confirmation link left the app in Guest mode — a 300 ms race

`js/cloud.js` had a `handleConfirmationRedirect()` that stripped the
`#access_token=…` fragment out of the address bar with `replaceState` and then
reloaded the page after a flat **300 ms**.

supabase-js consumes those tokens itself, but NOT synchronously: for the
implicit flow its `_initialize()` parses the URL up front and then
`await this._getUser(access_token)` before `_saveSession()`. Verified against the
shipped SDK source, not assumed:

    async _initialize() {
      if (B() && (e = Dr(window.location.href), this._isImplicitGrantCallback(e)
                                  ? t = 'implicit' : await this._isPKCECallback(e) && (t = 'pkce')), …) {
        let { data: n, error: r } = await this._getSessionFromURL(e, t);
        …
        await this._saveSession(i), …
      }
      return await this._recoverAndRefresh(), { error: null }
    }

So on any connection where that round-trip took longer than 300 ms the reload
cancelled the exchange — and the tokens were by then already gone from the URL,
so nothing could recover them. The user landed on Home still signed out. A
one-shot `sessionStorage` guard marked the attempt "done" before it had
succeeded, so re-clicking the link was ignored too.

**Fixed by removing the race, not by tuning it.** `handleConfirmationRedirect()`
now only DETECTS the callback and waits for supabase-js to report the outcome
through `onAuthStateChange`; nothing touches the URL until then. A 15 s fallback
covers a link that never yields a session, and a URL that Supabase itself refused
(`error_code=` / `error_description=`) resolves immediately instead of waiting.
The guard is set only after a successful exchange and cleared by both an ordinary
page load and the failure path, so it can never block a later attempt.

The second half of the bug was that a session arriving after boot changed
nothing: `SESSION_EMAIL` and the `u:<email>:` key prefix are fixed at module
load, so the app cannot re-namespace itself in place. `js/app.js` now captures
`BOOT_SIGNED_IN` and reloads **once** when a session appears that it did not boot
with (`watchForLateSignIn`), guarded so a reload cannot repeat itself.

`js/cloud.js`'s `auth.onChange` also reports `SIGNED_IN` / `INITIAL_SESSION`, and
cloud messages (a refused link, a lost connection) are mirrored to a toast once
per distinct message.

Tested with `.freebuff/make-confirm-test.ps1` + `.freebuff/confirm-app-stub.html`,
which inject a fetch stub for `/auth/v1/user` into a copy of index.html
(`?mode=token|error`, `?slow=N` delays the exchange). The stub sets the hash
itself, because the preview navigation layer drops URL fragments.

- `?mode=token&slow=1200`: `isConfirming()` true and the fragment still intact
  while the exchange ran (the old code cleared it at t≈0); the exchange finished
  at t+1.20s — four times the old reload window; `guard=1` proves
  `finishConfirmation` took the SUCCESS path, i.e. a session really was saved;
  the page then reloaded once.
- `?mode=error`: resolved immediately, no wait; `guard` left null; toast
  "That confirmation link is no longer valid…"; address bar cleaned.
- Boot with a session present: chip "Confirm Test" / "Free plan", cloud status
  `synced`, and Account Settings showed the email, `14 February 2026`, plan and
  credits rows with the guest card hidden.
- Ordinary load: the stale guard is cleared (verified `null` after reload).

### 2. Background colour — the opaque layer in `#glow-backdrop`

The click handler was never broken: `applyBg()` stored the value, moved `.active`
and published `--bg-user`, and `elementFromPoint` over every swatch returned the
swatch itself (no overlay). The canvas the user actually sees is
`#glow-backdrop` — fixed, full-viewport, `z-index:-9999` — and its LAST gradient
layer was an opaque `#20274c → #111428 → #090a14`. It painted over `:root`,
where the chosen colour lives, so the swatch selection moved while the page never
changed. (What reads as a "stuck red swatch" is the active ring, which is tinted
with `--accent`.)

`#glow-backdrop` now paints `background-color: var(--glow-bg, transparent)` and
takes its base layer from `var(--glow-base, <built-in gradient>)`; `applyBg()`
publishes `--glow-bg: <hex>` + `--glow-base: none`, and clears both on reset. The
light-mode rule was rewritten from the `background` shorthand to
`background-image` so it can no longer reset the colour.

Verified live: preset → `rgb(22, 35, 71)`, custom picker `#808080` → a plainly
grey canvas (screenshot), Reset → base gradient restored, `--glow-*` cleared,
picker back to `#000000`, no active swatch.

### 3. ERP auto-save — already correct; the duplicates were old rows

The explicit Save was already in place from an earlier change:
`#erp-save` ("Save to Library") sits in the Master ERP Engine's Live summary, and
`erpSaveToLibrary()` is the only thing that writes a Library row.

Re-measured rather than assumed: typing into `erp-project`, `erp-client`,
`erp-ref`, `erp-contact`, `erp-clientphone`, `erp-address`, `erp-posupply` left
the history at 5 entries, and two rapid clicks on Save to Library produced ONE
new row (the entry id is remembered, so a resave updates in place). The Item /
Client Database forms were equally inert while typing.

The duplicates were therefore stale rows from the old auto-save build. Added a
confirm-guarded **Remove duplicates** button to Library (`#history-dedupe`),
shown only while duplicates exist: two rows are the same save when they share
type + tool + toolName + title + client + ref + total AND fall inside the same
minute, which keeps a deliberate re-issue of identical figures out of the net.
Verified: it removed exactly the redundant copy of the two `Example Client (PVT)
LTD / Rs128,915` rows, kept the newer one, pruned its orphaned draft, re-rendered
the list and hid itself; three injected rows with one genuine same-minute pair
and one different-minute re-issue produced exactly 1 duplicate, not 2.

## 2026-09-13 — Excel exports: real styling, live formulas, per-mode field sets

**Supersedes every earlier note about `mxSheetAoa()` / the Excel export.** That
function is GONE (as are its mentions at the old sections above): it built one
flat AOA grid for every Document Mode, so a Delivery Note exported rate, amount,
discount and VAT columns it does not have, and SheetJS could not style any of it.

### Two libraries, split by DIRECTION

Measured, not assumed: **SheetJS CE 0.18.5 cannot write styles.** A workbook
written with a bold, bordered, shaded cell came back with one default font and an
empty border — the `s` object is silently dropped and only number formats
survive. So:

| library | role | why |
|---|---|---|
| SheetJS (`xlsx@0.18.5`) | **reading** (`erpImportFile`) | also reads legacy `.xls` |
| ExcelJS (`exceljs@4.4.0`) | **every write** | styles, merges, frozen panes, formulas |

Both are CDN `<script>` tags in `index.html` next to the other libraries; the
ExcelJS one carries a comment explaining the split.

### One writer per document template

`erpDocData()` (new) is the single description of the document being built — the
PDF sheet and every spreadsheet are generated from the same object, so an export
cannot drift from the printout. The writer is picked from the same `template`
field the PDF templates are picked from:

| mode | Excel sheet | columns | totals |
|---|---|---|---|
| Tax / Commercial Invoice, Pro Forma | `Invoice` | No / Description / Unit / Qty / Rate / Amount | Sub Total → Discount → (net) → VAT → TOTAL |
| Quotation / Offer | `Quotation` | Item / Description of Item / Unit / Qty / Rate / Amount (description carries the `Make / Model:` line) | Sub Total → Estimated Freight → Total — **no VAT / discount / TIN** |
| Delivery Note | `Delivery Note` | Item No / Description of Item / Model No / Unit / Qty — **five columns, nothing else** | none (no pricing at all) |

Every calculated figure is a LIVE FORMULA over the cells above it, each carrying
the value it currently evaluates to; `wb.calcProperties.fullCalcOnLoad = true`
so Excel recalculates on open:

```
F16 =D16*E16      F18 =SUM(F16:F17)   F19 =-F18*5%
F20 =F18+F19      F21 =F20*18%        F22 =F20+F21
```

The discount / VAT rows only exist when that percentage is non-zero, exactly as
the sheet omits them.

### Formatting

Bordered + bold + shaded header row (`FFD9E1F2`) on the item grid; every grid cell
boxed (`FFEDF1F9` labels in the info blocks); the letterhead and the recipient /
client blocks MERGED across the sheet (26–28 merges per document); the item
heading row frozen so the column names stay on screen; widths `[7.5, 40, 9.5,
9.5, 15, 16]`; A4 portrait, fit to one page wide.

**A trap worth remembering:** no column width may be exactly **9**. ExcelJS
treats 9 as the default width, writes no `customWidth` flag, and the column comes
back `undefined` after a save/load round trip (reproduced in isolation: 9 →
`undefined`, 9.5 → survives). That is why the Qty column is 9.5, with a comment.

### The import template (`#erp-template-dl`)

`xlWriteImportTemplate()` writes a genuinely formatted workbook: `Header` sheet
with a shaded bold title band, a bold `Field | Value` heading row and **frozen at
row 3**; `Items` sheet with bold shaded `SKU / Description / Unit / Qty / Rate`
headings, **frozen at row 1**, borders on every cell, `0.###` / `#,##0.00`
formats, widths 14/48/10/10/15, plus 6 empty ruled rows to fill in.

### Verified in the browser

Ran against a real export via the seeded-session harness
(`.freebuff/make-account-test.ps1` — the gate needs a signed-in account), with
`URL.createObjectURL`/`HTMLAnchorElement.click` patched to capture the blob
instead of downloading it, then reloaded each file with ExcelJS and read the
cells back:

- **Invoice** (100 × 3500, 25 × 4250.5, discount 5%, VAT 18%): sub `456262.5`,
discount `-22813.13`, net `433449.38`, VAT `78020.89`, total `511470.26` —
**identical to the printed sheet's** 456,262.50 / -22,813.13 / 433,449.38 /
78,020.89 / 511,470.26.
- **Pro Forma**: title cell reads `PRO FORMA INVOICE` (mode-driven, not
hardcoded) and **no VAT or Discount cell exists** with both percentages at 0.
- **Quotation**: `Item / Description of Item / Unit / Qty / Rate (LKR) / Amount
(LKR)`; Sub Total → Estimated Freight → Total; zero VAT/discount rows.
- **Delivery Note**: exactly `Item No / Description of Item / Model No / Unit /
Qty` — a scan for `Rate|Amount|Discount|VAT|TOTAL` in the sheet returns **0 hits**.
- File names are mode-driven: `TAX INVOICE INV-2026-001.xlsx`,
`QUOTATION INV-2026-001.xlsx`, `DELIVERY NOTE INV-2026-001.xlsx`.
- Import template: two sheets, frozen 3 / 1, borders and fills on every cell.

Note for re-testing: the preview server caches sibling files, so a regenerated
`.freebuff/account-test.html` must be opened with a cache-busting query string
(`?v=N`) or the OLD build keeps running — this bit me once and looked like a
width edit that "did not apply".

Update the stale mentions above (`mxSheetAoa()` at the Excel/CSV lines) to read
"now `erpDocData()` + the per-mode ExcelJS writers" if you work in those sections.

## 2026-09-13 — Database edits flow into the open document

An in-progress document only ever held COPIES of what the master database
supplied (a line's name / unit / rate when its SKU was picked; the header's
client fields when the client was chosen). Correcting the database afterwards
left those copies frozen, so a loaded record kept printing the old rate.

### The rule

**A database edit flows into the open document for every field that still holds
the value the database supplied; a value typed by hand on the document is never
overwritten.**

### How it works — provenance, field by field

| where | what is remembered |
|---|---|
| `erpState.lines[n].src` | `{ name, unit, rate }` — what the record supplied to that line |
| `erpState.clientSrc` | `{ name, v: { client, project, address, contact, clientPhone, clientTin, placeOfSupply, poNo, deliveryTerms, shipTo, currency } }` |

Written in `addErpRow` / `erpFillFromSku` (lines) and `erpSelectClient` (header).
A field still equal to its recorded value is LINKED and follows the record; a
field that now differs is a **per-document override** and is left alone. So
overriding one description for one invoice does not stop the rate from
following, and a database edit does not silently undo an override. Re-picking
the SKU is the explicit "take it from the database" and re-links every field.

**Documents saved before this existed have no provenance.** For those the
database's PREVIOUS value is the yardstick (knowable exactly when an edit
happens) in `erpApplyItemToLine`, so a line plainly populated from the record
does follow while one typed over does not. On the re-resolve paths there is no
"previous" value, so a legacy line is only linked where it already equals the
record — which changes no value and just records provenance for next time.

### Where it fires

| trigger | path |
|---|---|
| saving an item / client edit in the database (live, whichever view is open) | `addDbItem` / `addDbClient` → `syncDocumentWithDbItem` / `syncDocumentWithDbClient` |
| Load Record | `erpLoadRecord` → `dbMaybeReload()` → `erpResolveFromDb()` |
| entering the engine, incl. back/forward | `showView('erp')` → `dbMaybeReload()` → `erpResolveFromDb()` |
| another tab writes the keys | `storage` listener → `dbMaybeReload()` |
| a pull from Supabase replaced the local copy | `onCloudEvent` → `dbMaybeReload()` |

`dbStorageSig()` / `dbMaybeReload()` are a cheap signature check over the two
stored database keys: the in-memory `db` is only re-read when the stored copy
actually differs, so the cloud/status events that fire constantly cost nothing.

### Two bugs this turn found by testing, not reading

1. **The boot-time `showView` runs BEFORE the first `renderErp`.** On a cold
   start straight into `#/erp`, `readErpHeader()` would read the still-empty
   HTML inputs and wipe the document just loaded from storage. Fixed with
   `erpDomPainted`, set at the end of `renderErpHeader()`, which makes
   `readErpHeader()` a no-op until the inputs have actually been painted.
2. **The client half of the re-resolve starts by reading the header back**
   (`readErpHeader()` inside `erpSyncClientForRecord`), and with a stale table
   on screen that wrote the OLD line values straight over the ones just
   refreshed — measured as: the line's `src` moved to the new rate while the
   cell itself snapped back to the old one. `erpResolveFromDb` now renders the
   rows BEFORE calling the client half.

### Verified in the preview (all paths, current build)

- **Live**: editing the item through the database UI while the ERP page was
  open moved the line to the new name + rate and recalculated the amount
  (4 × 6000 → `Rs24,000`) with a toast; editing the client moved the header's
  address and TIN instantly.
- **Override**: after typing a rate of 7777 on the line, a later database edit
  (9000) updated the **name** but kept the **rate**, with `src.rate` left at the
  value it was linked to — and the toast said how many values were kept.
- **Load Record**: with the database edited out-of-band (8500), pressing Load
  Record on a record holding 7000 produced 8500 in both the state and the DOM.
- **Re-entry**: a database write made while on `#/home` was reflected on
  returning to `#/erp`.
- **Another tab**: a `storage` event on the item key refreshed the open line.
- **Library is untouched**: after Save to Library, a database edit left the
  saved entry (total `Rs24,000`) AND its draft snapshot byte-identical while the
  working draft moved to the new rate. Nothing in the sync path calls
  `erpRefreshLibraryEntry()`, `saveHistory()` or `pushHistory()` — it rewrites
  only the working draft key (`calcmall_erp_v1`).

Re-test note: the harness page must be opened with a fresh `?v=N` (the preview
server caches sibling files) and `window.alert` must be stubbed before clicking
**Save Record** — that handler ends in `window.alert`, which blocks the page's
main thread and stalls the automation.

## 2026-09-13 — Item "Model no": stored once, auto-filled into the ERP

### What the field is

`db.items[].model` — a free-text make/model code on the item record, stored with
the record and (like every other item field) carried inside the `data` jsonb
column in Supabase. **No schema change was needed**: `items` has explicit
columns for sku/name/unit/rate, and `rowsToItems()` merges `data` back over them,
so `model` round-trips through the cloud untouched. Do not add a `model` column
unless you also add it to `itemsToRows`/`rowsToItems`.

- Form: `#db-item-model` ("Model no (optional)"), between Item name and Unit.
  In `DB_ITEM_FIELDS`, so clearing/resetting the form covers it; pre-filled by
  `startEditDbItem()`, saved by `addDbItem()`.
- Lists: the items table (`.db-grid-items`, head label `Model`) and the items
  drawer (`<th>Model no</th>`). Blank shows `—`; full text is in the cell title.
- Master Database view: `mdField('Model no', rec.model)`.
- ERP: `erpFillFromSku()`/`addErpRow()` copy it, `erpLineSrc()` records it, and
  `erpApplyItemToLine()` syncs it (the field list is now
  `['name','model','unit','rate']`), so a Model no edited in the database reaches
  an open line and a hand-typed Model no becomes a per-document override like the
  other three. `loadErp()` gives older lines a `model` key so the render never
  reads `undefined`.

### Two real layout bugs found while testing this

1. **`.qr-amount` on the item row's rate cell.** The row borrowed that class for
   its bold money look, and `.qr-amount` carries `min-width: 96px` — the rate
   cell was therefore 96px wide inside a ~52px grid track and bled into the
   actions column. `.db-rate` now owns its styling (bold, tabular, nowrap,
   `min-width: 0`, ellipsis) and the row no longer has `qr-amount`. Use
   `.qr-amount` only on a tool table's amount cell.
2. **Header labels sized the columns.** A grid `fr` track grows to its item's
   min-content, so the head's own text sized the tracks differently from the row
   below it — labels sat up to 230px off the cells they named on the clients
   grid. `.db-list-head > span { min-width: 0 }` neutralises it on both sides.

### Responsive bands for the item row (6 columns)

`.db-grid-items` floors total 368px (columns) + 40px (gutters) ≈ the row's
content box at a ~440px card. The dashboard's two-column layout returns at
981px, which squeezes this card to ~400px, so the item row **stacks** in
`(min-width: 981px) and (max-width: 1240px)` as well as below 760px — otherwise
the name/model columns have nowhere to go. `.db-row.db-grid-items` scoping keeps
those rules off the client/record rows (an unscoped `.db-row .db-unit` rule hit
the clients grid). Clients/records only stack below 760px, where their 4 columns
no longer fit.

### Harnesses

- `.freebuff/db-grid-test.html?w=<viewport>` — loads the real app in an iframe of
  that width, seeds items+clients, and asserts: head/row column alignment, cell
  widths vs their tracks, no bleed outside the row or card, no horizontal
  overflow, row heights stay equal with a 100-character name/model, Model No and
  `0`/`—` rate rendering, ellipsis + title. It reports the mode it measured
  (`grid` or `stacked`). Passing at 645 (15), 900 (18), 1024 (16), 1241 (18),
  1280 (18), 1440 (18), 1920 (18).
- `.freebuff/cloud-sync-test.html` — the Supabase mapper test. Three checks were
  added for the rate tie-break: a null `rate` COLUMN keeps the rate the record's
  own `data` carries; a real column rate (0 included) wins over the payload; and
  no rate anywhere still comes back `null`. 33/33 pass.
- Signed-in ERP checks use the `account-test-stub.html` + `make-account-test.ps1`
  pair (see the Account Settings section above); regenerate it with
  `make-account-test.ps1` after any `build-preview.ps1` run, open it with a fresh
  `?v=N`, and remember the guest gate blocks the ERP for signed-out users.

Rate display note: `dbRateInfo()` is the only reader — `set` prints
`Calc.fmtNum(value)` (0 → `0`), a blank/null prints `—`, and unreadable text
prints `Invalid`. Verified against every stored shape: `242`, `0`, `null`, `"242"`,
`"10 000"` → 10,000, `"abc"` → Invalid, `""`/`"NaN"` → `—`.

## 2026-09-13 — Row click on the Item & Client Database opens the browse view's Details

The two screens now share one renderer instead of two copies of the same fields:

- `mdDetailHtml(kind, rec, actions)` returns the read-only body (title, sub, every
  `mdField(...)` row). `renderMasterDataDetail()` renders it into the browse pane
  with `mdManageHtml(kind)` as the action; the new drawer renders the same html
  with `''` — the "Manage in Item & Client Database →" link is meaningless on that
  page, so its footer carries **Edit this item/client** (loads that record into the
  form) and **Close** instead.
- New markup: `#db-detail-drawer` (`.drawer-card`, body `#db-detail-body` which
  carries the `.md-detail` class so the browse view's CSS applies verbatim).
- `openDbDetail(kind, rec)` / `closeDbDetail()` / `renderDbDetail()` keep the
  selection as `{ kind, key }` (SKU / client name), never an index — so a sort or a
  rename cannot point it at the wrong record. `renderDb()` re-renders the open
  drawer, and `renderDbDetail()` closes it if the record no longer exists (deleted
  while it was open).
- Clicks: the existing `#db-item-rows` / `#db-client-rows` handlers now fall through
  to the drawer whenever the click was NOT on `.db-item-edit` / `.db-item-del` (and
  the client equivalents), so the pencil and the ✕ are untouched. Rows are
  `tabindex="0"` with a descriptive `aria-label`; Enter/Space on a focused row opens
  the same drawer (blocked while the event target is one of the row's buttons).
  Backdrop click, ✕/Close and Escape all close it.
- CSS: `cursor: pointer` and a `:focus-visible` ring are scoped to
  `.db-row.db-grid-items` / `.db-row.db-grid-clients` — the record rows
  (`.db-grid-records`) are not click targets and must not look like one.
- `dbDetailSel` is declared with `var`: `renderDb()` can run from a storage/cloud
  event before that line is evaluated, and every use is falsy-safe.

Harness: `.freebuff/db-detail-test.html` — loads the real app in an iframe, seeds an
item and a client, then asserts: the browse view's field list for a record is
**byte-identical** to the drawer's for the same record (items AND clients), the
drawer's kind label and Edit button, backdrop/Close/Escape exits, `tabindex` +
Enter opening, the pencil still loading the form without opening the drawer, ✕
still going through the confirm dialog, an edit made while the drawer is open being
reflected in it, and the drawer's Edit button loading the record and closing.
22/22 pass. Deleting the open record (✕ → confirm) closes the drawer and removes
the row — checked live in the preview.

## 2026-09-13 — Yearly Premium price $125 → $124.99

Two places carried the yearly price, both in `index.html`: the card's
`<p class="plan-price"><strong>$125</strong>` and the subscribe button's
`data-price="$125 / yearly"`. Both now read `$124.99`; `data-price` is what the
CTA handler writes into `nexora_plan_interest` and into the activation toast
("Yearly Premium activated ($124.99 / yearly) — …"), so the summary text follows
automatically. The "Save ~20%" badge is unchanged ($124.99 vs $12.99 × 12 =
$155.88 is ~19.8% off). Monthly ($12.99) is untouched.

Nothing else references the yearly price: Account Settings shows plan state and
credits ("Premium — Unlimited Credits"), never a figure. Verified live — card
label, badge, CTA attribute, activation toast, and `/\$125(?!\.)/` false across
the whole DOM; `preview.html` rebuilt with no `$125` left in it.

## 2026-09-13 — Library is documents-only; revision cap; per-document expiry

**The last writers into `history` that were not a document save.** Every item or
client add / edit / delete called `pushHistory({ type: 'db', … })`, and
`renderHistory()` renders the whole array — so saving a database record put an
"Item DB updated" / "Client DB updated" row into History & Saved Documents that
nobody had saved, and inflated the "Saved Documents" KPI (`docCount =
history.length`). The ERP document path was already clean: typing writes only
`calcmall_erp_v1`, and `erpRefreshLibraryEntry()` returns false without a
`libraryId`, so an export can never create a row.

There is now a second, LOCAL store — `calcmall_activity_v1` (`activityLog`,
`logActivity()`, `isDuplicateActivity()` — same 2 s one-action guard as
`pushHistory`). All 8 database writers call `logActivity`; the Home feed is
`activityFeed()` = `history` + `activityLog`, newest first, so the feed looks
unchanged while the Library holds documents only. `clearActivity()` now clears
WHAT THE FEED SHOWS (the activity log plus any notification rows an older build
left in History) and never saved documents — which is what its own copy has
always promised. `clearHistory()` stays Library-only. `resetAll()` clears the
activity key too.

The remaining `pushHistory` call sites are the standalone tools' export / copy
actions (qr, boq, invoice, pricing, duty, variation, breakeven, fx, gpa,
retainer, delay) — each is an explicit user action, unchanged.

Leftovers are visible and removable, never auto-deleted: `libraryNotificationCount()`
labels a Library button "Remove N notifications", which goes through
`confirmAction` and then `removeLibraryNotifications()`.

**Revision cap (warn at 3).** `erpLibraryPayload()` now carries `project` and
`recordId` (read from the Project/Client Header's Primary Key field), and
`erpLibraryKey()` identifies the JOB — `rec:<id>` when there is one, else
`cp:<client>\u0001<project>`. `erpSaveToLibrary()` is `async` and, when it is
about to create a NEW row for a job that already has ≥
`LIBRARY_VERSION_WARN_AT` (3) rows, awaits a cancellable `confirmAction`
("Save another version? … Save another one anyway?"). Cancel returns without
writing; nothing is ever deleted. Re-saving the same open document still
updates its row in place via `libraryId`, so the warning only appears for a
genuinely new row.

**Per-document auto-expiry (opt-in, default OFF).** Every entry carries
`autoExpire` (false unless switched on for that row) and `touchedAt`.
`LIBRARY_EXPIRE_DAYS = 30`; `libraryExpiryDue()` ignores any entry that is not
`autoExpire === true`, so a finalized invoice/quotation is never removed for
being old. `historyAction` handles `act === 'retention'` (the Library row's
"Keep forever" ⇄ "● Auto-delete in Nd" button, `.history-retention.is-on`),
and `touchLibraryEntry()` refreshes the clock on View / Load draft and
Re-download. `sweepExpiredLibrary()` runs ONCE per boot, before the Library
paints, and the count it removed is announced by a toast.

**How it was tested.** The app gates every tool view behind sign-in, so a
throwaway root page (index.html with `.freebuff/account-test-stub.html` injected
before the `cloud.js` tag, built by a temporary `.freebuff/make-erp-test.ps1`)
ran the real `js/app.js` with a seeded session. (The helper is recreated and
deleted as needed — nothing test-only is shipped.) Measured: typing in the ERP
(a client, project, ref, a line item) then navigating away left History empty;
saving an item put one entry in `calcmall_activity_v1` and none in History;
with 3 seeded JOB-1 versions the 4th save raised "JOB-1 already has 3 saved
versions…" — Cancel left the list at 5, Save anyway took it to 6 with
`recordId: 'JOB-1'`, `autoExpire: false`; every Library row defaulted to "Keep
forever"; toggling one on stored `autoExpire: true`, and after 40 idle days a
reload removed exactly that row ("1 document passed its 30-day auto-delete
window…") while unflagged rows 90 days old survived; "Remove 2 notifications"
took the Library from 6 rows to 4 and hid itself. Test page, helper, seeded
items/clients and test history were all removed afterwards, and `preview.html`
was rebuilt (969,506 bytes).

## 2026-09-13 — Excel export gets a review step

"Export as Excel (.xlsx)" used to jump straight to a Save As dialog, so the
sheet could only be judged after the file existed (the PDF path already had its
review step, the browser print preview). There is now a preview dialog between
the click and the file: title, the sheet's dimensions in the note, the file name
and currency in the footer, and the sheet itself as a read-only ruled table with
`Download .xlsx` and `Cancel`. Cancel, the ✕, a backdrop click and Escape all
return to editing without downloading; Enter confirms when the download button
has focus.

**The preview is not a second description of the document.** `xlRecordSheet()`
is a worksheet with exactly the surface the template builders use (`getCell`,
`mergeCells`, `getColumn().width`, `getRow().height`, `pageSetup`, `views`), and
`xlDocPlan(d)` runs the REAL builder — `xlInvoiceSheet` / `xlQuotationSheet` /
`xlDeliverySheet` — against it. Because `xlStyle()` writes into whatever cell
object it is handed, the recorder collects the very font, fill, border,
alignment and `numFmt` ExcelJS is about to write, plus every merge. One
implementation, two outputs, nothing to drift. `xlSheetPreviewHtml()` then paints
that plan: merges become `colspan`/`rowspan` (28 in the invoice fixture), fills
come from the recorded ARGB, column widths are Excel character units scaled to
px (min 26), and a formula cell is flagged with a marker and `title="Live
formula: =…"` so a calculated figure is never mistaken for typed text.

Verified with the signed-in harness, three modes, with the same anchor-click
interception used for the earlier export checks (`HTMLAnchorElement.prototype.click`
records `this.download` and returns, so the test proves a download happened
without writing files):

- click Export → modal opens, **0 downloads**; Cancel/✕/backdrop/Escape → modal
  closes, **0 downloads**, still on the ERP view
- click Export → Download → exactly one anchor click,
  `download="TAX INVOICE REF-XL-1.xlsx"` (and the usual `erpRefreshLibraryEntry()`
  refresh afterwards)
- Invoice mode: VAT, Discount, Sub Total, TOTAL and "Due amount in words" all
  present; 11 formula cells, `=D16*E16` … `=SUM(F16:F21)` … `=-F22*5%` …
  `=F24+F25`, amounts formatted `#,##0.00`
- Quotation mode: written-out date + Our Ref, recipient block, "Dear Sir,",
  Rate/Amount, Estimated Freight, Terms & Conditions — and NO VAT, NO Discount
- Delivery Note mode: headings `Item No / Description of Item / Model No / Unit
  / Qty` — NO Rate, NO Amount, NO Discount, NO VAT
- a multi-line description keeps its line break (quotation `Make / Model: …`
  renders inside the description cell, `white-space: pre-wrap`)

Two things worth knowing. The preview makes an existing wart *visible*: empty
item rows in the ERP grid are still part of `d.items`, so they appear as zero
rows in both the preview and the file — the export was always doing this, but now
you can see it before saving. And the entitlement is still charged on the click
(`gateClick(exportErpExcel)` runs before the preview), which matches the PDF
path, where the print dialog also appears after the credit is spent.

## 2026-09-13 — "Processed Value" scope + the plan tally's wording

Reported: a brand-new account showed "Processed Value: Rs 2.8K" while its own
sub-line read "LKR 2,809 across 0 documents", and "12 of 13 free".

**Neither was stale cache**, and the numbers were not per-account wrong — the
repro (a fresh account, same device, guest store deliberately full of leftovers)
produced the report's exact wording: `Rs 2.8K` / `LKR 2,809 across 0 documents`
with `nexora_free_usage = {"erp":1}`. Two real defects:

1. `currentKPIValues()` added the UNSAVED ERP working draft to the headline:
   `if (erpDocType()) procVal += erpDocTotals().final;`. The sub-line's document
   count came from `history` — a different scope — so one typed draft line
   (qty 1 x rate 2809) produced money "across 0 documents". `kpiTrends().val`
   already summed documents only, so the headline also disagreed with its own
   30-day badge. `procVal` is now COMMITTED value (saved documents + saved Scope
   Guard requests), the sub-line is built from the same figures it sums
   ("LKR 2,809 from 1 saved document", "— nothing processed yet" at zero), and
   the draft is named on the pipeline caption instead ("Pipeline in progress — …
   Draft on this device: Rs 2,809."). `currentKPIValues()` returns `docVal`,
   `reqCount`, `reqVal` for that purpose; `listAnd()` joins the parts.

2. The plan tally was phrased as REMAINING — "12 of 13 tools still free" — which
   reads as "12 used". `planState().credits` now reports USED: "0 of 13 free
   uses spent" on a fresh account, "1 of 13 …" after one tool view. The count
   itself was always per-account and correct (verified); `acct-row-credits` is
   its only consumer.

**Per-account freshness checked for every stat, not just the broken one.** Two
accounts on the SAME device, booted back to back through the fresh-account
harness (`?as=<email>`, `/rest/v1/` returning no rows):

| | account A (seeded: 2 items, 1 client, 1 doc Rs5,000, 1 saved record, 1 request Rs1,000, usage {erp:1}) | account B (untouched) | A again, after B |
|---|---|---|---|
| Active estimates | 1 | 0 | 1 |
| Database records | 3 | 0 | 3 |
| Saved documents | 1 | 0 | 1 |
| Processed value | Rs 6K — "LKR 6,000 from 1 saved document and 1 project requests" | Rs 0 — "LKR 0 — nothing processed yet" | Rs 6K |
| Credits | 1 of 13 free uses spent | 0 of 13 free uses spent | 1 of 13 |

Everything reads through the `userKey()` shim, so the prefix is the account:
keys are frozen at module load (`SESSION_EMAIL`) and every sign-in path ends in
`reloadApp()`, with `watchForLateSignIn()` covering a session that arrives after
boot. A fresh account is NOT supposed to be untouched-and-non-zero; a session
that appears late forces the one reload that re-namespaces the page. Test page,
helper, stub and the seeded accounts were all removed afterwards; `preview.html`
rebuilt (983,421 bytes).

**Still worth deciding (not changed):** opening a tool VIEW spends that tool's
single free use, before the user does anything with it — so browsing the ERP
costs the same as exporting from it. That is the standing design ("entering a
tool view IS a tool execution"); the new wording at least makes it visible
rather than implied.

**Incidental find, fixed:** the boot log carried
`SyntaxError: Failed to execute 'add' on 'DOMTokenList': The token provided must
not be empty` from `renderDashboard()` — a PRE-EXISTING line (not part of this
change), `dropEl.classList.add(c.drop > 0 ? 'drop-bad' : (hasBaseline ?
'drop-none' : ''))`, which passes `''` whenever a Scope Guard project exists with
no baseline and no drop. Because it threw inside `renderAll()`, everything the
boot sequence does after that call never ran: the later renders AND the
`hashchange` listener registration. Fixed by only adding a class when there is
one (`const dropCls = …; if (dropCls) dropEl.classList.add(dropCls);`). Verified:
a fresh load now logs nothing at all, and a hand-set `#/history` fragment
switches the view, which can only happen if boot reached the end.

## 2026-09-13 — Formal PDF letterhead: the blank dark box, and the page margin it never had

Two defects, both shared by every tool that builds a formal letter.

**1. The "empty" dark box was the doc-type badge, painted #111827 on #111827.**
`formalLetterhead()` emits `<div class="fm-right"><div class="fm-banner">LINE
ITEMS</div>…</div>`, so the badge is a direct `<div>` child of `.fm-right` — and
the row rule `.fm-right > div { font-size: 11px; color: #111827 }` is (0,1,1),
which outranks `.fm-banner` (0,1,0). Both the colour AND the size were lost:
computed `color: rgb(17, 24, 39)` on `background: rgb(17, 24, 39)`, at 11px
instead of 12.5px. Fixed in BOTH copies of the rule (`css/style.css` and the
`PRINT_DOC_CSS` array in `js/app.js`) with `.fm-right > div:not(.fm-banner)`;
the `@media print` block in `css/style.css` also dropped `.fm-banner` from its
`color: #111827 !important` list. The badge is NOT leftover markup — it carries
the document type (LINE ITEMS / QUOTATION / TAX INVOICE / VARIATION ORDER) and
now renders.

**2. The formal letters had no page margin at all.** `compilePrintHtml()` wraps
the body in `.doc-page` with `padding: 0` — correct for the MX/ERP template,
whose `MXPT` coordinates already carry the master's own 46pt margins and which is
absolutely positioned. The flow-based `.fm-doc` letters therefore ran
edge-to-edge: `.fm-head` spanned 0→816px of the 816px (612pt) page, so the
right-aligned Date / Ref / TIN block sat exactly on the paper edge (measured
`right: 816.0`) and read as clipped. Fixed by scoping the page padding to them:
`.doc-page > .fm-doc { padding: 15mm 12mm; box-sizing: border-box; }` — the same
padding the app's own `@media print` already gave these docs. The `.mx-doc`
template is not matched, so its geometry is untouched.

Measured in the print payload (the hidden `#print-frame`, i.e. exactly what the
PDF receives), header box before → after:

| tool | doc class | `.fm-head` | badge |
|---|---|---|---|
| Quantity & Rate | `.quo-doc fm-doc` | 0→816 → **45.3→770.7** | `LINE ITEMS`, white, 12.5px |
| Quotation (BOQ) | `.quo-doc fm-doc` | 0→816 → **45.3→770.7** | `QUOTATION`, white |
| Smart Invoice (all 4 modes) | `.quo-doc fm-doc` | 0→816 → **45.3→770.7** | `TAX INVOICE`, white |
| Variation | `.var-doc fm-doc` | 0→816 → **45.3→770.7** | `VARIATION ORDER`, white |
| Master ERP Engine | `.quo-doc mx-doc` | unchanged (absolute, master geometry) | n/a |

Only these five tools produce a document at all: `exportViaPrintWindow` has
exactly five call sites (`qr` / `boq` / `invoice` / `variation` / `erp`). Scope
Guard, Pricing, Import Tax, Breakeven, FX & Fees, GPA, Retainer and Delay have
**no PDF export** — they copy to the clipboard (`copy*` functions) only — so
there is no template, no badge and no clipping to fix there.

**Method worth reusing when checking a print payload.** The engine writes into a
hidden `#print-frame` iframe; read that frame's own document to measure what the
PDF will actually contain. Replace `frame.contentWindow.print` with a no-op
BEFORE clicking export — and again immediately after, because `document.open()`
can drop the override — otherwise the browser's print dialog blocks the renderer
and every `preview_evaluate` times out until it is dismissed (this wedged the
preview mid-investigation). Making `#print-frame` visible at `transform:
scale(0.78)` lets `preview_screenshot` show the real sheet.

## 2026-09-13 — Result figures never clip: one fit pass for every tool

The report: the Margin & Markup Pricing tool showed `Rs190,323,232,3` in the
"Selling price" box while the box beside it looked correct. Not a formatting
bug. Every result box was a fixed font size inside a `min-width: 0` grid/flex
cell, and a money figure is ONE unbreakable token — so a big enough number
overflows its cell and gets cut where an ancestor clips (`.kpi-card` carries
`overflow: hidden`). The box that "looked right" was simply shorter.

Two halves that must stay together:

- `css/style.css` gives every result box one contract — `.stat-value,
  .result-value, .kpi-value, .qr-total-value, .boq-sum-line strong` are
  `display: block; white-space: nowrap; max-width: 100%; min-width: 0`, so the
  measured width is honest and the element can never leave its card.
  `.fit-wrap` is the escape hatch.
- `js/app.js` `fitResultValues()` keeps the design font size while the figure
  fits, shrinks it in 0.5px steps until it does, and — if it still does not fit
  at the 10px floor — adds `.fit-wrap` so the figure wraps onto a second line
  instead of being cut. A wrapped number is still readable; a clipped one is
  wrong.

It is driven centrally: a `MutationObserver` (text, plus `hidden`) queues a
single rAF pass, so no renderer has to remember to call it; `showView()`
re-runs it, because a figure inside a hidden view has no width; and a window
`resize` re-runs it. The observer watches `hidden` deliberately — watching
`class` or `style` would feed it its own `.fit-wrap` / font-size writes.

Two traps, both found by testing rather than reasoning:

1. A container rebuilt with `innerHTML` (`#results`, `#erp-summary`) produces a
   record whose TARGET is the container, not the new figures — so checking only
   `record.target` and its ancestors missed every one of those renders. The
   check now inspects `record.addedNodes` too.
2. A figure written while its panel is still hidden cannot be measured. Those
   elements are reported `unlaid` and retried for a handful of frames, with the
   budget reset by every real mutation and view change — bounded, because a
   permanently hidden view is `unlaid` forever and would otherwise spin.

Verified live with `190323232323` as the base value in all twelve tools plus
the Home KPIs: **13 surfaces, every visible result box reporting
`scrollWidth <= clientWidth`, 0 overflows.** A deliberately absurd 45-character
figure shrinks to the 10px floor and wraps to two lines, staying inside its
card. At normal values nothing changes — a 250,000 base leaves all six pricing
figures at the design 21px, because an inline size equal to the CSS size
renders identically.

Coverage: every tool's summary reuses these same classes, so this is one rule
rather than per-tool code. (Pricing aside, the copy-only tools never printed a
figure into a document — see the PDF sections above.)

## 2026-09-13 — The Library has exactly ONE writer now

The hint under the ERP's Save to Library claimed that only that button puts a
document in the Library and that generating a PDF or Excel file does not. Half
of that was true and half was not, so here is the full audit of every path that
could append a row, taken from the code rather than from the intent:

| path | what it actually did |
|---|---|
| `#erp-save` → `erpSaveToLibrary()` | the deliberate save — the only legitimate append |
| `erpRefreshLibraryEntry()` (both ERP exports) | refresh only: `if (!erpState.libraryId) return false` — cannot create |
| `pushHistory()` — **11 call sites** | qr / boq / invoice / variation PDF exports **and** the Copy buttons of pricing, duty, breakeven, fx, gpa, retainer and delay appended a Library row on EVERY export or copy |
| database add / edit / remove | already moved to the activity feed in an earlier change |
| `saveErp()` | writes the working-draft key only, never `history` |
| unload / navigation | none: no `beforeunload`, `pagehide` or `visibilitychange` handler touches history (cloud.js's `visibilitychange` only flushes the sync queue) |
| timers | none write history; the only `setInterval` is the OTP countdown |

So typing was already harmless — but **every export and every summary copy still
appended a row**, which is exactly what the hint promised they did not (and the
empty-state under the list even advertised "export a PDF or copy a summary from
any tool" as a way to create entries).

Fix: the 11 `pushHistory()` calls became `logActivity()`, and `pushHistory()` +
`isDuplicateHistory()` were **deleted** so no second writer exists to drift back
in — the comment left in their place says so. Exports and copies keep the same
shape in the Home activity feed (type / tool / title / client / ref / total), so
the feed looks unchanged while the Library stops pretending an action was a save.
Copy that read "export a PDF or copy a summary" was rewritten in the Library's
empty state and in `#erp-save-hint`.

Deliberate consequences: the "Saved documents" KPI and "Processed value" now
count deliberate saves only, and a tool export no longer offers "Re-download
PDF" from the Library (the tool's own Export button is untouched).

Verified end to end, with the ERP holding 3 line items and a typed header:

| action | Library | activity feed |
|---|---|---|
| type 6 header fields + add 2 line items | **1 → 1** | 0 → 0 |
| navigate away and back (Home, Database, Library, ERP) | 1 | 0 |
| **reload the page** | 1 (draft restored, not saved) | 0 |
| Export as Excel (preview → download) | **1** (figures refreshed) | 1 |
| Export as PDF (print frame really built) | **1** | 1 |
| Copy summary from another tool | **1** | **+1** |
| click **Save to Library** on an unsaved document | **2** | 1 |

Repeats found in this profile's Library at the time of the audit: **2 rows,
both deliberate saves of the same quotation** (`Acme Holdings (Pvt) Ltd`,
`REF 2026 009`, `Rs13,000`, two minutes apart) — my own test saves, which the
Library itself flagged as `Review 1 repeat`. "Remove duplicates" and "Remove
notifications" were both correctly hidden (no legacy `db` rows remained in this
profile — those were cleared in the earlier change, and their removal is already
offered through the Library's own "Remove N notifications" button). Test rows
and the temporary premium flag were cleared afterwards; `preview.html` rebuilt
(991,170 bytes).

If a user still sees old rows, the mechanism is that the Library is synced to
the `documents` table, so a cloud pull restores whatever the OLD build wrote
(notification and export rows included). Nothing in this change deletes them:
the Library's own read-only "Review repeats" and "Remove N notifications"
controls are the way to see and clear them.

## 2026-09-13 — Export testing must not touch the user's disk (`?nodl=1`)

**The rule: never verify an export by letting a real download happen.** Load the
page with `?nodl=1` and assert on the recorded payload instead. One final real
download is acceptable only when the user asks for it.

Why it matters: while iterating on the Excel export and the PDF letterhead the
real export was run repeatedly in the live preview to see its output. Every one
of those ends in a genuine browser download, and reloading between iterations
aborts downloads still in flight, which is how a Downloads folder ends up full
of Chrome's incomplete scratch files. Severity note: the app itself has no
code path that can loop a download — there is nothing to fix in `app.js` for
this, only in how the testing is done.

The app now has ONE choke point for disk writes, `nexoraSaveFile(content,
filename, mime)` (~line 7590), used by both file producers (`xlDownload` for
`.xlsx` and `downloadBackup` for the JSON snapshot). With the flag on it writes
nothing and instead pushes `{ filename, type, bytes, at }` into
`window.__nexoraDownloads`, so the real bytes and the real file name are still
asserted on. `openPrintWindow()`'s `doPrint` has the same switch for the PDF
side: the document is still written into the hidden `#print-frame` (so the
print payload stays measurable in the DOM), but `win.print()` is skipped and a
`{ at, title, bytes, html }` record lands in `window.__nexoraPrintouts`.

```js
// in the preview, with the page loaded as ...?nodl=1
await fetch('js/app.js');                  // sanity: the served file has the seam
window.__nexoraPrintouts = [];             // reset per trial
screenshotless assertions: __nexoraDownloads / __nexoraPrintouts
```

Verified (nothing was written to disk): backup JSON recorded as 11,791 bytes
with 0 anchor clicks; Excel export recorded `QUOTATION NODL-1.xlsx`, 8,277
bytes, 0 anchor clicks, and only AFTER the preview dialog was confirmed; the PDF
export recorded `QUOTATION NODL-1`, 25,583 bytes with the frame still holding
the document. With the flag OFF the real path is unchanged — exactly one anchor
click carrying `download="nexora-backup-2026-09-13.json"` and a `blob:` href —
checked by intercepting `HTMLAnchorElement.prototype.click` rather than letting
Chrome write the file.

Related gotchas found while doing this:

- **`localStorage` is namespaced.** The app writes through the per-user key shim
  (`u:<email>:<key>`), so a test that clears or reads the bare `calcmall_history`
  is measuring the wrong key and will report "nothing saved" while the save
  actually worked. Assert against `u:<email>:calcmall_history`.
- **A hash-only `preview_navigate` does NOT reload the page.** Only the fragment
  changes, so the in-memory state survives and a "cleared storage" step looks
  like it did nothing. Add a real query param (`?nodl=1&t=4`) to force a reload.
- **The previous instance flushes on unload.** Clearing storage and then
  navigating can be undone by the outgoing page writing its in-memory state
  back. Measure the value at the START of the evaluating call, not before it.

## 2026-09-13 — The "double print payload" was a deferral, not a bug

One measurement showed two identical print payloads from a single click. It is
**not** an app bug and it is now permanently instrumented rather than assumed
either way:

- Every print record carries an ISO `at` timestamp, and a second payload for the
  same title inside 1500ms logs
  `[print-audit] DOUBLE PRINT PAYLOAD for "…" — previous at …, now … (Nms apart)`.
- Measured with single clicks and a wait longer than the deferral: **5/5 trials
  produced exactly one payload**, evenly spaced ~1.7s apart, matching the click
  cadence. Earlier trials (5 more) were also single.
- The mechanism: `doPrint` is deferred until `document.fonts.ready` and pending
  images settle (up to ~2.5s). Records are therefore written when printing
  actually happens, not when the button is clicked, so a payload from an earlier
  click can land inside the NEXT measurement window and look like a double-fire.
  The one pair seen was 1ms apart, i.e. two queued callbacks flushing together.
- The "my automation retried the evaluation" theory was tested and REFUTED: a
  deliberately slow expression (11s, past the 10s eval limit) incremented a
  counter stored in localStorage exactly ONCE.

So the audit line is the evidence to trust if it ever recurs; the app prints
once per click.

## 2026-09-13 — Every mini-tool can Save to Library (its only writer)

The 12 Other Utilities tools had no Save button, so exports and summary copies
had been the de-facto way rows appeared. They now have the ERP's contract.

**Two writers, both behind an explicit click.** The complete audit of
`history` mutations: `history.unshift(entry)` in `erpSaveToLibrary()` (~10159)
and in `saveToolToLibrary()` (~10460). Everything else removes rows (delete,
clear, notification purge, expiry sweep) or loads them at boot. `pushHistory()`
is gone; the only remaining occurrence of that name is the comment recording
that it is gone.

- **Buttons:** 12 × `Save to Library` with `data-tool-save="<tool>"`
  (`sg-save`, `qr-save`, `boq-save`, `pr-save`, `dt-save`, `vr-save`,
  `bk-save`, `fx-save`, `gp-save`, `rt-save`, `dl-save`, `inv-save`), placed
  before each tool's Export/Copy button. The `save` icon already existed in
  `TOOL_ICONS`. Bound by one loop in `wireEvents()` over `[data-tool-save]`, so
  a new tool needs no new binding. Not credit-gated — the ERP's save is not
  either.
- **Export / Copy write nothing.** They still record what happened, but to the
  activity feed via `logActivity()`. The 12 inline identity objects were
  replaced by one registry, `TOOL_DOC[tool]()`, which the save button ALSO
  uses — so a feed entry and a saved row can never describe one document two
  ways. `logActivity()` now ignores a null entry.
- **One row per project/session.** `toolLibraryIds` (key
  `calcmall_tool_library_v1`) remembers each tool's entry id, so repeated saves
  update in place. Resetting a tool — or clearing its rows — calls
  `clearToolLibraryId()`, so the next save starts a NEW document. Deleting a
  Library row also drops any tool id pointing at it. This is what makes a tool
  with no client field of its own (Pricing, Breakeven, FX, GPA) still update one
  row instead of piling up copies.
- **Re-download PDF stays, now for saved documents only.** `type: 'pdf'` is set
  for the five tools that really print (ERP, qr, boq, invoice, variation), so
  only those rows offer the button; the copy-only tools do not.
- **View / Load draft now restores.** `toolSnapOf()` stores a deep copy in
  `draftStore[id]` and `restoreToolSnapshot()` merges it back onto the tool's
  own empty shape (a snapshot from an older build cannot leave a field
  undefined), then repaints. Opening a saved row also re-points that tool's next
  save at the same row.
- **Revision cap generalised.** `libraryJobKey(tool, rec)` / `
  libraryVersionCount(tool, key)` now carry the tool id, and `erpLibraryKey` /
  `erpLibraryVersionCount` are thin wrappers over them, so "3 versions of this
  job" means the same thing in every tool.

Verified in the preview, all with `?nodl=1`:

| check | result |
|---|---|
| typing a qty/rate | Library unchanged (0 rows), totals update |
| Save (Qty & Rate) | 1 row, `type: pdf`, total `Rs 20,000`, id remembered |
| change qty, Save again | still 1 row, same id, total `Rs 50,000`/`Rs 70,000` |
| Export to PDF | history delta **0**, 1 print payload, activity feed +1 |
| Copy Pricing Summary | history delta **0**, activity feed entry `Pricing summary / Rs279,140,740,740` |
| Save (Pricing, copy-only) | 1 row, `type: copy`; saving again → still 1 row |
| Re-download PDF from a saved row | 1 print payload, history delta 0 |
| copy-only row | offers no Re-download button (nothing to re-download) |
| wreck the inputs, click View | inputs restored from the snapshot; next save updates the same row |
| Save with an empty tool | toast "Fill in the GPA Planner first — there is nothing to save yet.", 0 rows, no dialog |
| 4th version of one job | dialog "Save another version? … already has 3 saved versions …" — Cancel left the count at 3, Save anyway took it to 4 |
| ERP regression | 1 row created, re-save updated it in place (same id, total Rs5,000 → Rs15,000) |

Test rows and the temporary premium flag are cleared, `_signed-in-test.html` is
deleted, and `preview.html` is rebuilt (1,009,920 bytes). Cosmetic note: a few
rows now show two `btn-primary` buttons (the tool's own `Add row` plus Save);
the ERP row has only one. Left as is deliberately — demoting `Add row` would
change a long-standing affordance nobody asked to change.

## 2026-09-13 — Saved project/client records get their own Details view

Saved records (`erpRecords`, the ERP's Save Record store) used to be reachable
only as a jump into the ERP with the Record ID pre-filled — clicking one from
Home did not show what was in it. They now browse exactly like items and
clients, in the SAME list + detail panes:

- **A third tab in the Master Database browse view** —
  `#md-tab-records` / `data-md-tab="records"`, count in `#md-records-count`.
  `mdRowsForTab()` reads `recordEntries()` (most recent save first) and keys
  each row on the Primary Key / Record ID; `mdMatches()` searches id, client,
  project, address, contact, TIN, ref, PO, currency and terms; `mdFindSelection()`
  resolves a `record` selection against `erpRecords` rather than `db`.
  The tab handler used to hard-code `clients ? 'clients' : 'items'` — it now
  accepts `records` too, which is the kind of thing that silently swallows a new
  tab.
- **The detail pane** (`mdDetailHtml(kind='record', rec, actions, recId)`, a new
  4th argument carrying the record id) shows the saved header — Saved date,
  Document mode, Client name, Project name, Address, Contact, Purchaser TIN,
  Place of supply, PO no, Reference, Date of invoice, Currency, Line total —
  then a read-only **line-item table** (No / Description / Unit / Qty / Rate /
  Amount), reusing `.md-field` and `.data-table`. A Delivery Note record shows
  no Rate/Amount columns, because a delivery note has no pricing — the same rule
  the document itself follows. A Model value prints as a second line under the
  description.
- **One labelled exit**: `mdManageHtml('record', key)` renders
  **“Load in Master ERP Engine →”**, and the `.md-manage` handler routes a
  `record` straight to `erpLoadRecordById()` — the SAME path the ERP's own Load
  Record button uses — instead of jumping to the database page. The read-only
  pane still never edits anything.
- Home wiring: a `#home-records-list` row click now calls
  `openMasterData('record', id)` (it used to call `erpLoadRecordById`), and
  “View all” calls `openMasterData('record')` — the full list in the same browse
  view, not the Item & Client Database. Row tooltip is now “View this record's
  details”. `openMasterData()` maps `record` → the `records` tab.
- New CSS is one small block: `.md-lines` neutralises `.data-table`'s
  `min-width: 640px` for this narrow pane so the table fits instead of
  scrolling.

### The real “Load Record not populating” bug, found and fixed

Wiring the button exposed why loading a record never appeared to restore the
header. `erpLoadRecord()` ran `erpResolveFromDb()` **before** `renderErp()`, and
`erpResolveFromDb()` starts with `readErpHeader()` — which takes the live
INPUTS as the truth. So the freshly loaded header was read straight back out of
the still-stale inputs and overwritten: lines changed, the header did not.
Reproduced with the ERP's OWN Load Record button (`client` stayed
`WRECKED-A`, while `#erp-record-meta` and the alert claimed a successful load,
and the document preview confirmed the STATE was wrong too, not just the
inputs). Fixed by painting first, then re-resolving:

```js
erpState = Object.assign(emptyErp(), rec.state);
...
renderErp();          // inputs now mirror the loaded record
 erpResolveFromDb();  // readErpHeader() can no longer clobber it
erpRecordMeta(id);
```

Verified with `?nodl=1` after the fix: wrecking the header, then Home → Saved
Records → the record → “Load in Master ERP Engine →” gives
`clientInput = Acme Engineering Pvt Ltd`, `projectInput = Fire system upgrade —
Phase 2`, `refInput = REF 2026 021`, 2 lines, and the document preview contains
“Acme Engineering” with no “WRECKED” — so `erpState` is correct, not just the
DOM. Also checked: the details pane shows the record's real data on the first
click, the line table renders both lines with amounts, “View all” opens the
records tab with the read-only empty state, the Items/Clients tabs are
unaffected, and the Item & Client Database page's own records list still offers
its Load and Delete buttons untouched.

Test record and premium flag cleared, `_signed-in-test.html` deleted,
`preview.html` rebuilt (1,018,346 bytes).

#### Re-verified after the session interruption (same bundle, no code change)

Re-built `_signed-in-test.html` from `.freebuff/make-erp-test.ps1`, signed in
via the stub, set `u:alex.perera@example.lk:nexora_plan = premium`, and walked
the flow again on the live dev server:

- Home → **Saved Records** row (`#home-records-list [data-rec]`) → click →
  `#/master-data`, tab **Saved records** active, Details pane shows
  `E2E-REC-1 · Acme Engineering Pvt Ltd · Fire system upgrade — Phase 2`,
  document mode, address, ref, **Line items (2)** with
  `Rs20,000` + `Rs2,500` and **Line total Rs22,500**.
- **Load in Master ERP Engine →** → `#/erp` with `erp-record-id = E2E-REC-1`,
  `erp-client`, `erp-project`, `erp-ref` all populated and both line rows
  restored (SKU 7 / MX-9000 / 2 × 10000, SKU 9 / FS-450 / 1 × 2500); summary
  reads `Sub total Rs22,500 · Quotation total Rs22,500`. This is the
  `renderErp()`-before-`erpResolveFromDb()` ordering fix holding.
- **View all →** → same browse view on the records tab with the full list.
- Items / Clients tabs still switch and keep their own empty states.

Note on synthetic input: driving the line rows with dispatchEvent from the
console is not a faithful test — the SKU `change` handler's re-render can land
after the scripted writes, so a snapshot taken that way can hold `sku` only.
That is a harness artefact, not app behaviour; the record used for this pass was
seeded through the store instead. Verify line edits by hand in the UI.

Cleanup: record store key, premium flag, `cm-inv-v1` draft, and the console
probe keys (`__evalRetryProbe`, `nexora_confirm_loads`, `nexora_confirm_log`,
`nexora_harness_log_v2`, `nexora_harness_runs_v2`) removed from the preview
profile; `_signed-in-test.html` deleted. No code changed in this pass, so
`preview.html` is still current.

## Sticky footer — the page container is `<body>` (2026-09-13)

**Symptom:** on a short page (empty Library, empty Backup, the guest Account
Settings page) the footer sat directly under the content block with a large
dead band below it instead of sitting on the bottom of the window.

**Cause:** nothing was wrong with the footer itself — there was simply no
full-height container. `<body>` was a normal block, so the document ended
where the content ended and the footer stopped with it.

**Shape of the fix** (all of it in `css/style.css`):

- A new "Sticky footer" block right after `.container` (≈line 161) makes
  `<body>` the page container:
  `display: flex; flex-direction: column; min-height: 100vh;` then
  `min-height: 100dvh;` (mobile: excludes the retracting URL bar).
- `main.container { flex: 1 0 auto; }` — the main area absorbs the slack, so
  the footer is flush with the bottom of the viewport on short pages and the
  column just grows (footer scrolling normally after the content) as soon as
  the content is taller than the screen.
- Inside the `@media print` block (≈line 3199) the existing
  `body, [data-theme="light"] body` rule gained `display: block !important;
  min-height: 0 !important;`. Print paginates normal flow, not a flex column:
  without the reset the offscreen documents — `position: static` in print —
  would become shrinkable flex items and could be squashed across page breaks.
  The reset wins on both counts (later in the sheet **and** `!important`).

**Why the flex conversion is safe:** out-of-flow children are never flex items.
`#glow-backdrop` and all eight `.modal-overlay` modals are `position: fixed`,
and the five `.pdf-offscreen` documents are `position: absolute` — so the only
things that became flex items are `<main>` and the footer, exactly the two that
should. Desktop alignment is unchanged because `.container`'s `margin: 0 auto`
still absorbs the cross-axis free space (auto margins beat
`align-items: stretch`), and the footer, having no auto margins, still spans the
full viewport width.

**Verified live** (preview viewport 647×1000, i.e. the narrow/mobile branch).
For every sidebar destination the invariant checked was
`footerEnd + trailingGap == scrollHeight` and `scrollHeight >= innerHeight`:

| view | scrollHeight | footerEnd | trailing gap | scrolls |
|---|---|---|---|---|
| Library (empty) | 1000 | 1000 | 0 | no |
| Backup (empty) | 1000 | 1000 | 0 | no |
| Account Settings (guest) | 1000 | 1000 | 0 | no |
| Premium Plans | 1000 | 1000 | 0 | no |
| Appearance | 1316 | 1316 | 0 | yes |
| Home | 1598 | 1598 | 0 | yes |
| Master ERP Engine | 1598 | 1598 | 0 | yes |
| Other Utilities | 1964 | 1964 | 0 | yes |
| Item & Client Database | 2698 | 2698 | 0 | yes |
| Company Database | 2966 | 2966 | 0 | yes |

So every short page pins the footer flush with no gap below it, and every tall
page still ends at its own content. Light mode (`#theme-toggle`) was checked on
a short page and also pins at gap 0. The CSSOM was inspected directly to confirm
the print rule really is later than the sticky rule (index 698 vs 19) — not just
that both exist. No JS or markup changed for this; `preview.html` was rebuilt
(1,019,686 bytes).

## Smart Invoice tool — step 4 was rendering in the top-right corner (2026-09-13)

**Symptom:** in Other Utilities → Invoice (Smart Invoice & Document Builder) the
four numbered sections did not read in order. Steps 1–3 stacked down the left
column, but "4 Totals & Export" appeared at the top-right *beside step 1*,
because it was the only thing in the second column.

**Cause — the two-column layout was being used for the wrong thing.**
`#invoice-view` had `.dash-layout` > `.col-left` (steps 1, 2, 3) + `.col-right`
(step 4). That is a legitimate pattern in this app, but the right column exists
for an **unnumbered** companion panel: the Master ERP Engine uses it for its
"Live summary" card while steps 4–5 stay in the left column, so its numbering
still reads straight down. The Invoice tool put a *numbered* step over there.

**Fix:** moved the "4 Totals & Export" `<section>` out of `.col-right` into
`.col-left`, immediately after "3 Line Items", and deleted the now-empty
`.col-right` element. Markup only — no JS and no CSS changed, because nothing
references `col-left` / `col-right` (verified: no hits in `js/*.js` or
`css/style.css`), and every control id (`inv-save`, `inv-pdf`, `inv-reset`, …)
is untouched, so the existing bindings still work.

**Why the empty column had to go rather than just be emptied:** `.col` is
`flex: 1 1 0`, so a leftover empty `.col` still claims ~50% of the row and would
have squeezed the remaining single column back to half width.

**Verified** (preview viewport is only 645px wide, where the
`@media (max-width: 980px)` rule stacks `.dash-layout` into a column anyway and
hides the bug — so the wide branch was reproduced deliberately): that media rule
only sets `flex-direction`, so forcing `display:flex; flex-direction:row` on a
clone hosted in a 1440px-wide element **is** the desktop layout.

| check | result |
|---|---|
| `.dash-layout` children in `#invoice-view` | **1** — `col col-left` |
| `.col-right` elements in `#invoice-view` | **0** |
| desktop column width at a 1440px host | **1440** (full row, not 720 = half) |
| desktop section tops | 0 → 423 → 887 → **1179** (strictly increasing) |
| sections sharing a left edge | all 4 (nothing sits beside anything) |
| desktop visual reading order | **1 Document → 2 Your Business (Letterhead) → 3 Line Items → 4 Totals & Export** |
| other views | all 11 two-column layouts unchanged, ERP's unnumbered "Live summary" still in its right column; no empty `.col` anywhere |

A screenshot could not be captured for this one — the preview webview stopped
compositing (`produced no frames`) after the layout probing above, which is an
environment state, not a page fault; the geometry numbers are the evidence.
Note also that this is a 645px pane, so a wide-window look in a real browser is
still worth one glance. `preview.html` rebuilt (1,020,934 bytes).

## Other Utilities PDFs were greyscale — now they use the ERP's accent (2026-09-13)

**Which tools even produce a PDF.** Only FOUR of the twelve Other Utilities tools
have a PDF export — the rest ship Export-as-copy only. The complete list of PDF
entry points in the app is five: `qr-pdf` (Qty & Rate), `boq-pdf` (Quotation),
`vr-pdf` (Variation), `inv-pdf` (Smart Invoice) and `erp-pdf` (Master ERP
Engine). So Scope Guard, Pricing, Import Tax, Breakeven, FX & Fees, GPA Planner,
Retainer and Delay Impact were never in the black-and-white set — they have no
PDF at all.

**All four were greyscale.** `exportViaPrintWindow()` compiles the offscreen
`*-doc` element into a standalone document through the single `PRINT_DOC_CSS`
array (js/app.js) — that array is the *only* thing that styles a PDF, and the
app's own `css/style.css` is not involved. Counting hex literals per template
family in it showed the whole story:

| family | used by | `#0d1b6e` accent | verdict |
|---|---|---|---|
| `.mx-*` | Master ERP Engine | **4** | coloured (the reference) |
| `.fm-*` | all four tool PDFs (letterhead) | 1 — only `.fm-spec` | greyscale |
| `.quo-*` | Quotation + shared table/totals | **0** | greyscale |
| `.var-*` | Variation | **0** | greyscale |

`.fm-head`, `.fm-co h1`, `.fm-banner`, `.fm-metabox` and the table headers all
used `#111827` (a near-black), so every one of the four printed black-and-white
while the ERP printed navy.

**The fix reuses the ERP's own approach rather than inventing one:** the exact
accent the ERP already uses, `#0d1b6e`, plus a light tint of it, `#e8ebf8`, for
table-header fills. Structural elements became navy — the letterhead rule,
company name, doc-type badge background, metabox/box borders and their dividers,
column headings, totals emphasis rules, dashed words box, signature lines,
`.var-h3` — and the table header row went navy-on-`#e8ebf8`. Body copy stays
`#111827` and the table grid stays `#000000`, matching the ERP's own grid.
Applied to `PRINT_DOC_CSS` (the PDF path) **and** mirrored into the
`css/style.css` copies, including that file's `@media print` block, which had
been forcing `.fm-co h1`, `.fm-meta-col h3` and the badge back to `#111827`/
`#111827` and would otherwise have flattened the accent in the direct-Ctrl+P
path.

**`.mx-*` was deliberately NOT touched** — the ERP already prints correctly and
its geometry/colour is the locked reference: `git diff` shows **0** changed
lines mentioning `mx-` in either file. The narrow grey `Item #` column keeps its
pre-existing `#6b7280` from `.quo-table .q-num` (higher specificity than
`.quo-table th`), left as designed.

**Verified from the real print payload, not from the stylesheet.** Each export
was driven through the actual UI with `?nodl=1` (the existing seam: the compiled
document is still written into `#print-frame` — exactly what the PDF receives —
but no dialog opens and no file is written), then `getComputedStyle` was read
from `frame.contentDocument`:

| tool | `fm-head` rule | `fm-co h1` | badge bg | table `th` bg / text | other |
|---|---|---|---|---|---|
| Qty & Rate | navy | navy | navy | tint / navy | — |
| Quotation | navy | navy | navy | tint / navy | `.fm-final` border navy + tint |
| Smart Invoice | navy | navy | navy | tint / navy | `.fm-metabox` border + divider navy, `.fm-meta-col h3` navy, `.fm-footbox` border navy |
| Variation | navy | navy | navy | — | `.var-h3` navy, `.var-table .q-final-row` border navy, `.q-sigline` navy |

("navy" = `rgb(13, 27, 110)`; "tint" = `rgb(232, 235, 248)`.)

### The double-print audit fired — first real data point

During this work the `[print-audit]` detector from the earlier session caught a
recurrence for the first time: **one** click on `qr-pdf` produced two identical
payloads 1ms apart (`16:36:33.920Z` and `.921Z`, both 14846 bytes), and the
warning logged both timestamps as designed.

It then behaved: two further single clicks produced exactly one payload each
(`16:37:17.922Z`, `16:37:21.921Z`). Note also that `doPrint` is guarded by a
per-call `printed` flag set before the payload is recorded, so a single
`openPrintWindow` **cannot** record twice — two records mean `qrExportPdf` ran
twice in one tick, i.e. the button fired twice, not that one payload was double
counted. Two identical bytes means the state was identical, so the state was not
half-updated between them.

Working hypothesis for the next investigation (NOT yet proven): the double
appeared on the *first* export click after a page load, which fits the button
being bound once in `wireEvents()` plus once more by view entry — `wireEvents()`
is called exactly once (line ~12601), so a per-view re-wiring path is the only
remaining candidate. Worth testing by entering the Qty & Rate view twice and
clicking once: if the payload count rises, that confirms duplicate listeners.
Note the other two "pairs" seen in this session were *my own* repeated clicks
(a timed-out evaluation had already fired the export), which is exactly the
false positive the warning text warns about.

## Home KPI row was flush to the top, and the "stray line" explained (2026-09-13)

**Symptom (as reported):** the KPI cards (Active Estimates, Database Records,
Saved Documents, Processed Value) had no room above them, and a thin horizontal
line sat right at the top edge of the viewport.

**Cause 1 — the top padding really was missing.** The padding lives on the
shared `.main-area` wrapper, not on the KPI row, and it was tiny:

```css
.main-area { padding: 4px 24px 40px 24px; }          /* base  */
.main-area { padding: 0 0 40px 0; }                  /* <=1024px */
```

So the first element of *every* view started 4px (or 0px) below the top of the
window. Measured: `#kpi-row` and `#home-view` both at `top: 0`, `kpi-row`
`margin-top: 0`.

**Cause 2 — the line was the KPI cards' own top edge, not a stray divider.**
Nothing was drawing a separate rule: `main.container`, `.main-area` and
`#home-view` all report `border-top: 0px`, and `main-area`/`#home-view` have no
pseudo-elements. What was at `top: 0` across the content width was each
`.kpi-card`'s own `border-top: 1px solid rgba(255,255,255,0.09)` plus its
decorative `::after`:

```css
.kpi-card::after { content: ''; position: absolute; top: 0; left: 0; right: 0;
  height: 1px; background: linear-gradient(90deg, transparent,
  rgba(255,255,255,0.35), transparent); opacity: 0.6; }
```

That is an intentional "subtle glowing accent line along the top edge" of each
card. With zero page padding the four cards' highlights sat in a row directly on
the viewport's top edge, which reads as one stray floating line rather than as a
card accent. **It was kept, not deleted** — the fix is the padding, after which
it renders as designed.

**Fix:** both `.main-area` rules now carry a 20px top inset — the same value as
the app's own vertical rhythm between sections (`.card` and `.kpi-row` both use
`margin-bottom: 20px`; `.hub-layout` uses `gap: 20px`), so the padding is
literally the measured inter-section gap. Two rules changed, nothing else.

**Verified:** `#kpi-row` now starts at **20px** and the gap to the next section
is **20px** — identical. Spot-checked the same on other views, which were equally
flush before and are now equally inset: Library first element 20 / gap 20,
Company Database first element 20 / gap 20. A full sweep of the top 19px band
finds only `#menu-btn` (the narrow-screen Menu pill, `top: 16px`, hidden above
1024px) — no border, background or pseudo-element is drawn at the viewport edge
any more.

One measurement trap worth remembering: `#home-view > *` runs a 0.5s `fadeInUp`
whose first frame is `translateY(16px)`, so a `getBoundingClientRect()` taken
right after switching views reports every first element at `top: 36` instead of
20. Wait for the animation to settle (~900ms) before believing the number.
`preview.html` rebuilt (1,021,985 bytes).

## Other Utilities is its own sidebar category, between ERP & DATA and RECORDS & BACKUP (2026-09-13)

Reordering only. `#sidebar-utilities`, its `#/utilities` route and the utilities
page itself are untouched — the tool-card grid still holds all 12 cards.

**Markup** (`index.html`) — a sixth `<section class="nav-section">` was inserted
between the `erp` and `records` sections, and the `Other Utilities` button was
removed from the `more` section (which now holds only `Premium Plans`). DOM order
is what decides sidebar order, so no CSS or reorder logic was needed:

    workspace → erp → utilities → records → more → configuration

**JS** (`js/app.js`) — one line: `utilities: true` added to
`NAV_SECTION_DEFAULTS`. This is required, not cosmetic: `toggleNavSection()`
bails out for any key absent from that object, so without it the new header
would have rendered but silently refused to collapse. Expanding by default
keeps the section's state consistent with the other five for a new user.

Verified in the preview: the six headers sit at strictly increasing y
(141 / 231 / 420 / 510 / 649 / 740); the utilities header toggles only itself
(`{"utilities":false}`, `aria-expanded="false"`, items `hidden`) while
`erp` stays open, and collapsing `more` writes `{"more":false}` without
touching `utilities`; clicking the relocated link still routes to `#/utilities`
where `#utilities-view` holds 12 `.tool-card`s in the original order
(Scope Guard … Delay Impact). The test's `nexora_nav_sections_v1` key was
removed afterwards so the profile is back to new-user defaults.
`preview.html` rebuilt (1,022,952 bytes).

## The ERP working draft is memory-only, with a leave warning (2026-09-13)

The engine used to persist its working document on every keystroke
(`saveErp()` → `ERP_KEY = 'calcmall_erp_v1'`, called from ~20 mutation
sites), so a half-finished invoice outlived the tab, came back after a
reload and reappeared whenever the engine was reopened — with no save ever
having been asked for.

**What changed** (`js/app.js`, `index.html`):

* `loadErp()` became `normalizeErp(parsed)` — the shape/healing rules, now
  used only by the two SAVED paths (`erpLoadRecord`, and the Library's
  "load draft"), which previously duplicated that healing inline.
* `let erpState = emptyErp();` — the engine always opens empty. The stale
  `ERP_KEY` from an older build is no longer READ (only removed, on discard
  or reset), so a draft left in a browser cannot come back.
* `saveErp()` is now `erpDirty = true` — the same 20 call sites, no storage
  write. `erpMarkCommitted()` lowers it, and is called from every commit:
  Save Record, Load Record (after `erpResolveFromDb`), Save to Library
  (both branches), the Library-refresh on export, `resetErp`, `resetAll`,
  and the Library's load-draft path.
* `erpResolveFromDb()` now only sets the flag when `changed ||
  clientRes.changed`. It runs on EVERY entry to the engine (#erp-view via
  `showView`) and its old unconditional `saveErp()` would have marked a
  freshly opened engine dirty — verified: opening the engine leaves the
  pill hidden.
* Leave guard inside `showView()` (the single route choke point, so sidebar
  links, Home cards, the hash, the back button and deep links all pass
  through it): `erpHasUnsaved() && name !== 'erp' && !opts.force` asks
  `confirmAction({ title:'You have unsaved changes', … focusCancel:true })`,
  returns immediately, and only re-enters `showView(wanted, {force:true})`
  on confirm; on cancel it calls `syncViewHash(currentView)` so a move that
  came from the hash (back button) leaves the address bar in step.
  `{ force: true }` is used by the two internal gate redirects.
* `confirmAction` gained `focusCancel` — the unsaved-changes prompt focuses
  "Go back and save", so a stray Enter keeps the work instead of discarding
  it (every other prompt still focuses Confirm).
* `beforeunload` guard for a reload / tab close, disarmed by
  `unloadGuardOff` which `reloadApp()` sets; the three raw
  `window.location.reload()` calls were routed through `reloadApp()`.
* Live summary card: an `#erp-dirty-pill` ("Unsaved changes", painted only
  from `paintErpDirty()` which both flag setters and `renderErp()` call) and
  rewritten hint copy that says the draft is discarded.

**Verified live** (premium harness, then restored to a clean guest):

| check | result |
|---|---|
| open the engine | empty, pill hidden, 0 lines |
| type one header field | pill appears; **no** `ERP_KEY` written; Library unchanged (0 rows) |
| click a sidebar page | dialog shown, move DEFERRED (still on #/erp, field intact) |
| "Go back and save" (focus lands here) | stays on the engine, typing kept |
| "Leave and discard" | lands on the target view, draft cleared, reopening = fresh (0 lines) |
| every destination | db / Library / Backup / Account all asked, landed, cleared |
| leave via the hash (back-button path) | asked; cancel restored the URL to `#/erp` |
| `beforeunload` arming | armed ONLY when in the engine AND dirty; not armed on another view, on a clean engine, or after a save |
| navigation blocked while dirty | `preview_navigate` to another URL was cancelled by the unload guard; the same navigation succeeded once clean |
| Save Record | record stored, pill cleared, Library still 0 rows, leaving afterwards is silent |
| Save to Library | 1 row created on the click; pill cleared |
| a stale `calcmall_erp_v1` seeded in storage | ignored — the engine opened empty, the saved record survived |

NOT changed: the 11 mini-tools under Other Utilities still persist their own
drafts (`QR_KEY`, `BOQ_KEY`, `INV_KEY`, `PR_KEY`, `DUTY_KEY`, `VAR_KEY`,
`BK_KEY`, `FX_KEY`, `GP_KEY`, `RT_KEY`, `DL_KEY`) exactly as before. They are
the same "offline draft layer", so the same surprise exists there; the guard
was deliberately NOT extended to them without asking.
`preview.html` rebuilt (1,030,747 bytes).

## Every tool: memory-only drafts + the leave warning, through one mechanism (2026-09-13)

The 11 mini-tools persisted their working state on every keystroke exactly as
the engine used to (`saveQr` → `QR_KEY`, `saveState` → `STORAGE_KEY`, …), so a
half-typed tool survived navigations, reloads and tab closes. Rather than
repeat the engine's fix 12 times, the engine's own flag was generalised.

**`js/app.js`**

* `draftDirty` — one map, keyed by the same tool ids `TOOL_VIEWS` and
  `data-tool-save` use, with `'erp'` for the engine. `markDraftDirty` /
  `markDraftCommitted` replace `erpDirty`; `saveErp()` is now a wrapper, so its
  20 existing call sites are untouched.
* `paintDraftDirty(tool)` — the engine's pill still ships in the markup; a
  mini-tool's is created on demand (once) next to its own Save button from
  `[data-tool-save="<tool>"]`, so no markup changed for the 12 tools.
* The pill follows `toolHasContent(tool)`, not the raw flag: a tool just RESET
  to its empty shape still carries the flag its own reset raised, and an empty
  tool must not advertise unsaved changes. That witness is also why **no reset
  handler needed patching** — `markDraftDirty` never early-returns, so the
  first keystroke after a reset brings the pill back (verified).
* `draftUnsavedIn(view)` guards `showView()` for ANY tool (the ERP, and all
  twelve), wording `Your changes to the <full tool name> have not been saved
  yet.` `toolFullName()` uses `TOOLS[id].name` because "the Qty & Rate" needed
  an article it cannot carry while "the Quantity & Rate Calculator" reads fine.
* `discardToolDraft(tool)` — clears the legacy storage key, then empties the
  tool through `restoreToolSnapshot()`, then lowers the flag. Order matters:
  `restoreToolSnapshot` ends in the tool's own `saveX()`, which raises it again,
  so emptying before the commit left an emptied tool still showing the pill.
* `anyDraftUnsaved()` arms `beforeunload` for work in ANY tool, not just the
  open one — a reload destroys every in-memory draft at once.
* The 11 `loadX()` became `normalizeX(parsed)` (shape/healing rules, storage
  read removed) and are now called by `restoreToolSnapshot()`, which had been
  merging onto the empty shape by hand. Boot states are `emptyX()`;
  `loadState()` → `normalizeScopeState()`, `loadQr()` deleted.
* `saveToolToLibrary()` and the Library's "View / Load draft" both end in
  `markDraftCommitted(tool)`; `resetAll()` clears the whole map.
* Two real bugs surfaced by the cross-tool work, both fixed:
  * `setToolCurrency()` writes `erpState.currency` / `invState.currency` for
    whichever tool's banner fired. Marking those dirty marked the ENGINE
    unsaved when the currency was changed in another tool, which (via the
    app-wide unload guard) refused reloads until the engine had been visited
    and its "draft" discarded. It now only marks them when `currentView` IS
    that tool — a currency choice elsewhere is a preference, not an edit.
  * `renderSetup()` never wrote the project fields when `state.project` was
    null, so emptying the Scope Guard left the old project's name/price/hours
    sitting in the create form. It now blanks them — which also fixes "Reset
    all data" leaving that stale text.
  * `toolLabel` was declared TWICE in the IIFE, so the second silently
    shadowed the first and the credit-limit dialog read "of tool" for the
    engine. Renamed the second to `toolShortLabel`.

**Verified live** (premium harness, then restored to a clean guest)

| check | result |
|---|---|
| each of the 12 tools: type → leave | pill appears, dialog named the tool, move deferred |
| each of the 12 tools: "Leave and discard" | target view reached, reopening = EMPTY (qr, boq, pricing, duty, variation, breakeven, fx, gpa, retainer, delay, invoice, scope-guard all checked) |
| no draft key written | `cm-qr-v1` … `fsg-state-v1` all absent while typing |
| Library untouched by typing | 0 rows; 1 row per explicit Save to Library |
| Save to Library | pill cleared, exactly one row, leaving afterwards silent |
| tool's own Reset | value cleared, pill gone, leaving silent; next keystroke restores the pill |
| Scope Guard (submit-style form) | submit project → dirty → warned → discarded → blank create form |
| currency changed in the QR tool | engine stays clean, pill hidden, unload guard NOT armed |
| engine regression | unchanged: same wording, discard clears it, fresh on reopen |

Cleanup: harness deleted and the tracked `.freebuff/account-test.html` restored;
test keys, the plan flag, the Library rows and the swept currency choice cleared
from the preview profile; preview back on `index.html` as a clean guest.
`preview.html` rebuilt (1,039,341 bytes).

### Re-verification round (2026-09-13, `preview.html` 1,040,227 bytes)

Re-checked from the code and then live, in case anything had regressed:

- Code state — `saveErp()`/`saveState()`/`saveQr()`/… /`saveDelay()` (13 of them)
  are now **one line each** (`markDraftDirty('<tool>')`); there is **no read**
  of `STORAGE_KEY`, `QR_KEY` … `ERP_KEY` anywhere any more, only the
  `TOOL_DRAFT_KEYS` map that `discardToolDraft()` and "Reset all data" use to
  remove drafts older builds left behind. `markDraftCommitted()` has four call
  sites: the Library load-draft path, the Save-to-Library commit (shared by the
  engine and all 12 tools), and `erpDiscardDraft()`/`discardToolDraft()`.
- Live — FX: typed 3.5 → pill appeared; leaving → dialog named the tool;
  "Go back and save" kept the value and wrote no key; "Leave and discard"
  reached `#/history`, cleared the field, hid the pill and removed `cm-fx-v1`;
  reopening showed a fresh tool with no dialog. Scope Guard (submit-style
  create form, no project yet) warned the same way, and cancelling from a
  hand-edited hash restored it to `#/tool`. Engine: typed `#erp-client` →
  warned with the engine's own wording → discarded → reopening was blank with
  no legacy `calcmall_erp_v1`. Save to Library → exactly one row, pill cleared,
  second click updated the same id (still one row), leaving afterwards silent.
- No source file was edited in this round; `preview.html` was regenerated from
  the unchanged sources to confirm the artefact matched (identical byte count),
  and the signed-in harness used for the checks (already current, generated from
  the same sources in the round above) was restored to its committed state
afterwards.

## Sidebar merged into Tools & Records + Account (2026-09-13)

Four categories became two. The old split had four items spread across three
headers — `OTHER UTILITIES` (1), `RECORDS & BACKUP` (2), `MORE` (1) — plus
`CONFIGURATION` (2), which is more chrome than content.

```
WORKSPACE       Home
ERP & DATA      Master ERP Engine · Item & Client Database · Company Database
TOOLS & RECORDS Other Utilities · Library · Backup
ACCOUNT         Premium Plans · Account Settings · Appearance Settings
```

- **Markup** (`index.html`): the four `<section class="nav-section">` blocks
  were replaced by two, `data-nav-section="tools"` and `="account"`, with item
  ids `#nav-items-tools` / `#nav-items-account`. The ten sidebar buttons kept
  their ids — `#sidebar-utilities`, `#sidebar-history`, `#sidebar-backup`,
  `#sidebar-plans`, `#sidebar-account`, `#sidebar-appearance` — so `navIds`,
  the click handlers and every route are untouched (the item order changed,
  which is exactly what the DOM order is for).
- **JS** (`js/app.js`): `NAV_SECTION_DEFAULTS` is now
  `{ workspace: true, erp: true, tools: true, account: true }`. Both new keys
  are **required** — `toggleNavSection()` refuses any key it does not own, so
  omitting one gives a header that paints but silently will not collapse.
  The removed keys are left behind in `nexora_nav_sections_v1` for existing
  profiles and are simply **inert**: `navSectionState()` only iterates the keys
  listed in `NAV_SECTION_DEFAULTS`.
- No CSS was needed — `.nav-section` / `.nav-group-label` / `.nav-group-items`
  are key-agnostic. The leading "Six independent sections" comment became
  "Four".

**Verified live** — four sections, DOM order matching the visual order
(tops 139 / 225 / 414 / 602) with exactly the items above; each header toggles
**independently** (`{tools:false}` left `account` and `erp` expanded) and
remembers across a reload; a profile carrying the OLD store
(`erp:false, utilities:false, records:false, more:false, configuration:false`)
boots with the new sections at their defaults and honours only the surviving
`erp:false`; and every item still routes where it did — `#/home`, `#/db`,
`#/settings`, `#/utilities`, `#/history`, `#/backup`, `#/plans`, `#/account`,
`#/appearance` (with Master ERP Engine still raising the guest auth gate, as
before). Console clean.

`preview.html` rebuilt (1,039,495 bytes). The change is in `index.html` and
`js/app.js`, so it needs a redeploy to reach Vercel.

## Free-tier meter: charged on the action, not on opening a tool (2026-09-13)

**The bug.** `showView()` ran `checkAccessAndCredits(targetTool)` on every
entry to a tool view, so merely LOOKING at a tool spent its single free use.
A free account got one visit per tool and then hit the limit modal on the
second, having produced nothing — and `sessionGrants` then made the export
that followed free, so the meter was charging the wrong event twice over.

**The model now** (one sentence): *opening a tool is free and unlimited; the
free tier buys one export, copy or Save to Library per tool.*

| event | guest | free | premium |
|---|---|---|---|
| open a tool view, type, read live results | blocked (auth modal) | **free, unlimited** | free |
| Export to PDF / Excel | auth modal | 1st charges, then blocked → Plans | free |
| Copy Summary / Copy Message | auth modal | 1st charges, then blocked → Plans | free |
| Save to Library (ERP + any tool) | auth modal | 1st charges, then blocked → Plans | free |
| Save Record, Excel Template download | blocked | free | free |

- `checkAccessAndCredits(toolId)` is unchanged in shape but is now reached ONLY
  from `gateClick`, i.e. from an action. Its `sessionGrants` early-return and
  the `sessionGrants`/`releaseGrantsFrom()` pair were deleted: they existed to
  stop one visit costing two uses, and with the charge moved onto the action
  they would instead let a free account export forever after one charge.
- `showView()` gates guests only (`isLoggedIn()`), and no longer touches the
  meter. That is the one line that fixes the reported behaviour; `{ gate:false }`
  still covers the upgrade redirect and the boot fallback.
- Wired through `gateClick(handler, toolId)` with an explicit tool id:
  `msg-copy`→scope-guard, `qr-pdf`, `boq-pdf`, `pr-copy`, `inv-pdf`,
  `dt-copy`, `vr-pdf`, `bk-copy`, `fx-copy`, `gp-copy`, `rt-copy`, `dl-copy`,
  `erp-pdf`, `erp-export-xlsx`, `erp-save`, and every `[data-tool-save]` button
  (found by attribute, so a tool added later is metered automatically).
- Copy updated with it: the limit modal now reads "You have used the free
  export, copy or save in <tool>. You can still open this tool and edit it —
  Premium removes the limit on producing anything from it."; the Home health
  row and the downgrade dialog say the same thing.

**Verified live** (free tier, harness session, `__NEXORA_NO_DOWNLOAD = true` so
no dialog opened and no file was written):

| check | result |
|---|---|
| open all 12 tools one after another | 12 correct hashes, `nexora_free_usage` = `{}`, no modal |
| type in each tool (12 of them), then leave and reopen | no charge at any point |
| each tool's action clicked once | exactly `{toolId: 1}` — one use, that tool, no other |
| the same action clicked again | usage unchanged, "AI Credit Limit Reached" + redirect to `#/plans` |
| Save to Library (in a tool and in the ERP) | charged on the first click, blocked on the second |
| a tool whose use is ALREADY spent | still opens, still types, `{qr:1}` unchanged; only its Export is refused |
| guest clicking a tool card | stays on `#/home`, "Authentication Required", nothing charged (unchanged) |

Tools covered individually: scope-guard, qr, boq, pricing, invoice, duty,
variation, breakeven, fx, gpa, retainer, delay, plus the ERP.

TESTING GOTCHA, worth remembering: the preview webview reports
`document.visibilityState === 'hidden'`, so `setTimeout` is clamped to ~1s and
`requestAnimationFrame` never fires. Any probe that awaits a timer takes
seconds per step and blows the 10s evaluation limit, while the same work done
SYNCHRONOUSLY is instant — the gate charges inside the click handler, so "click
the action twice and read `nexora_free_usage`" needs no waiting at all. Only
the modal's DOM insertion is async, so read that in the *next* call.

**Known sharp edge, deliberately left as-is:** the gate runs BEFORE the
handler, so an action the tool itself rejects — e.g. Copy on an empty Pricing
calculator, which only alerts "Enter your base cost first" — still spends the
use. Charging an action *attempt* is what the spec asked for, but if the intent
is "only a produced document counts", the gate would have to move inside each
handler after its own validation.

**Also deliberately ungated:** `Save Record` (the reusable project/client
record) and the Excel Template download. Neither produces a document and
neither was metered before; flagging rather than silently changing them.

`preview.html` rebuilt (1,041,203 bytes). Change is in `js/app.js`, so it needs
a redeploy to reach Vercel.

## A1 — platform/export switchboard (`js/platform.js`) — 2026-09-14

First stage of the desktop/mobile conversion. The app was ONE codebase that
would need to run in a browser, an Electron window and an Android WebView, and
exactly two things genuinely differ per platform: **producing a PDF** and
**writing a file**. Both already had a single choke point, so the change is a
switchboard rather than a refactor.

NEW FILE `js/platform.js` — holds no business logic, no maths, no templates; it
only decides WHO does those two jobs. Loaded between `calculations.js` and
`app.js` (and inlined by `build-preview.ps1`, which now requires its tag).

the two call sites, each ONE line and both placed AFTER the existing
test-suppression check so `?nodl=1` still produces no dialog and no file on
every platform:

| file:line | guard |
|---|---|
| `js/app.js` `openPrintWindow` → `doPrint` | `if (window.NexoraPlatform && window.NexoraPlatform.print(compiledHTML, title)) return;` |
| `js/app.js` `nexoraSaveFile` | `if (window.NexoraPlatform && window.NexoraPlatform.saveFile(blob, filename)) return null;` |

The print guard sits after the print-audit record, so the payload is still
measured even when a shell takes it. A shell installs itself with
`NexoraPlatform.register({ printPdf, saveFile })`; a backend that throws
synchronously is treated as "did not take it" so the browser path still runs.

**In a browser it is a no-op by construction** — no backend is ever registered,
so both guards return false and the original statements run unchanged. Proven
by diff (12 insertions, 0 deletions in `app.js`) and by measurement.

### Parity measurement (no file ever written)

Harness: `.freebuff/make-a1-parity.ps1` (+ `a1-prep-stub.html`, `a1-driver.js`)
generates a test page from `index.html` and is REUSED for A2–A7. Two things it
had to get right, both learned the hard way:

1. **The plan seed must be namespaced.** The app reads plan/usage through its
   per-user shim, so a raw `nexora_plan` is invisible to it. Getting this wrong
   fails SILENTLY: the account stays on the free tier, the first export spends
   its single free use, and every later export is refused with no output at
   all. Seed `u:<email>:nexora_plan` (the chip then reads "Premium — unlimited").
2. **Dirty drafts cancel navigation.** A tool with unsaved input arms a
   `beforeunload` handler, and the browser then CANCELS the next full page load
   — which is why a uniquely-named test page silently failed to load. The
   harness clears drafts through each tool's own Reset/Clear (a commit point)
   via `__a1reset()`.

Also: the preview layer IGNORES a navigation that differs only in its query
string, so each run must generate a uniquely-named page.

| sink | export | before | after |
|---|---|---|---|
| print (`openPrintWindow`) | Qty & Rate PDF | 14,844 B / `9430d7de` | 14,844 B / `9430d7de` |
| print (`openPrintWindow`) | Variation PDF | 14,967 B / `2f9d0f16` | 14,967 B / `2f9d0f16` |
| save (`nexoraSaveFile`) | Backup JSON | 3,093 B | 3,093 B |

Byte-identical, payload counts included. Reported live: `kind: 'web'`,
`hasBackend: false`, `isSuppressed: true`. `test/calculations.test.html`:
**90 / 0 passed** (the suite has grown past the 86 in the README).

**Detection note:** `kind` is evidence-based and does NOT sniff the user-agent
for "Electron". The Freebuff preview pane is itself an Electron webview, so a
UA sniff reported `electron` for an ordinary browser session — it now waits for
the shell to identify itself (`window.nexoraNative`) or for Capacitor to
confirm native, and keeps the raw signal in `uaHint` for diagnostics only.

### Unrelated, but reproduced while measuring

The deferred-print flush fired TWICE for one click, twice in a row, and the
built-in audit detector logged it with timestamps as designed:

```
[print-audit] two print payloads for "Quantity & Rate sheet" landed close
  together — previous at 2026-09-14T11:54:27.631Z (14844 bytes), now at
  2026-09-14T11:54:27.631Z (14844 bytes), 1ms apart.
```

Identical timestamp to the millisecond and identical bytes ⇒ ONE flush
producing two payloads, not two clicks. It reached the hidden-frame seam
(`openPrintWindow`) and not the new platform guard. The browser's real
printing is unchanged by A1, so this is a pre-existing observation, recorded
and still unconfirmed rather than fixed.

`preview.html` rebuilt (1,049,175 bytes). Changes are in `index.html`,
`js/app.js`, `js/platform.js` and `build-preview.ps1` ⇒ needs a redeploy.

## A2 — everything is vendored; the app now really is offline — 2026-09-14

NEW `vendor/` (~3.7 MB, meant to be committed — the deploy is a git push):

| file | size |
|---|---|
| `xlsx.full.min.js` (SheetJS 0.18.5, import) | 881,727 B |
| `html2pdf.bundle.min.js` 0.10.1 | 905,956 B |
| `exceljs.min.js` 4.4.0 (all .xlsx writing) | 947,702 B |
| `supabase.js` (@supabase/supabase-js v2 UMD) | 218,318 B |
| `fonts/fonts.css` + **25** woff2 subsets (Inter + Roboto) | 612 KB |
| `background.jpg` (1920x1459) | 152,977 B |

`index.html`: the four CDN `<script>` tags became `vendor/...`; the Google Fonts
`<link>` + its two `preconnect`s became one local `vendor/fonts/fonts.css`;
the four original CDN URLs survive **only** inside a small synchronous fallback
loader.

**The fallback uses `document.write` deliberately.** A fallback injected by
`onerror` or `createElement` is asynchronous and would land AFTER app.js has
evaluated, which is too late — these globals must exist first. `document.write`
while the parser is on that block is synchronous and preserves the order.
Caveat, seen in Chrome's own console: it warns that a cross-site
parser-blocking `document.write` script "may be blocked … in this or a future
page load due to poor network connectivity". That risk applies ONLY to the
fallback path; the primary path is a local file with no such caveat.

### The dependency nobody had noticed

The first measurement still showed ONE external request: the glass backdrop was
being fetched from `images.unsplash.com` (`css/style.css`, two rules — the dark
and light themes). It is decorative, so it failed silently and the app "looked"
offline while making a third-party request on every single load. Downloaded and
vendored; both rules now point at `../vendor/background.jpg`. The path is
relative to the stylesheet, which also resolves correctly in the inlined
`preview.html`.

`build-preview.ps1`: vendor tags are intentionally NOT inlined (that would add
~3 MB to `preview.html` and break nothing — the check it enforces only covers
`src="js/` and `href="css/`). `font/fonts.css` must stay a LINKED stylesheet in
any future bundling: its woff2 URLs are relative to its own folder, so inlining
it into a `<style>` block would break every font path.

### The second dependency: the compiled PDF pulled Roboto from Google

Found by grepping for remaining external URLs rather than by looking at the page.
`compilePrintHtml()` — the function that builds EVERY print document — embedded a
`<link>` to `fonts.googleapis.com`, and its own comment admitted the
consequence: *"offline the stack falls back to Arial/Helvetica"*. A generated PDF
is this app's core output and the print pipeline is the most font-sensitive part
of it (its own comment elsewhere: fonts must be in before the first paint or
"every metric shifts"), so an offline PDF silently re-laying out was the exact
failure A2 exists to prevent.

It now links the VENDORED stylesheet — the same Roboto faces — resolved to an
ABSOLUTE url via `new URL('vendor/fonts/fonts.css', document.baseURI)`. Absolute
because the compiled document is written into an `about:blank` frame, where a
relative path depends on the frame's base URL rather than on the script's
location; if that resolution ever fails the link is omitted, which is the old
offline behaviour rather than a new breakage.

Proof that ONLY the font source changed (the strongest check available, since the
payload bytes necessarily move): substituting the old Google href back into the
new payload reproduces the A1 baseline exactly.

| | bytes | hash |
|---|---|---|
| new payload | 14,794 | `a31fe740` |
| new payload with the OLD href substituted back | **14,844** | **`9430d7de`** ← the A1 baseline |

So the template output is byte-identical; the diff is one stylesheet URL. Also
measured: the print frame makes **zero** external requests, its two Roboto woff2
files resolve to LOCAL, and `frame.contentWindow.document.fonts.check('1em Roboto')`
is `true`.

### Verified

| check | result |
|---|---|
| external requests on a clean load of `index.html` | **0** (14 resources, every one local, all HTTP 200) |
| console on a clean load | **empty** |
| globals from vendor | `XLSX 0.18.5`, `ExcelJS`, `html2pdf`, `supabase.createClient` |
| cloud layer against the vendored SDK | `NexoraCloud.status()` → `synced` |
| SheetJS functional | write→read round trip, sheet + row data intact |
| ExcelJS functional | ERP import template produced (`Nexora-Engine-ERP-import-template.xlsx`, 8,663 B) |
| vendored backdrop | computed `::before` background resolves to `background.jpg` |
| fallback path | two vendor files deliberately broken: both 404'd, both re-fetched from the CDN, both globals present, warning logged |
| console on a clean load, after the sourcemap strip | **empty** (was two failed `.map` requests) |
| **print parity vs A1** | Qty & Rate **14,844 B / `9430d7de`**, Variation **14,967 B / `2f9d0f16`** — byte-identical |
| **save parity vs A1** | backup JSON **3,093 B** — byte-identical |

Note: xlsx byte length wobbles by ~2 bytes run to run (8,663 / 8,664 / 8,665) —
ExcelJS stamps a build date into the zip's `docProps`. Not a regression; just
don't diff xlsx by size.

### One intentional edit to a vendored file

`exceljs.min.js` and `html2pdf.bundle.min.js` each end with a
`//# sourceMappingURL=<name>.map` comment. Vendoring made the browser actually
fetch those `.map` files (on the CDN they existed; here they don't), which
produced two failed requests and two console errors on **every** load. The
comment is the final line of both files, so it was deleted — the only functional
change is "stop pointing at a file we do not ship"; the libraries are otherwise
byte-identical to upstream and both were re-verified afterwards. Flagged because
it is a deliberate deviation from the published artifact.

### Test-suite reporting is broken (found here, NOT fixed here)

`test/calculations.test.html` prints `"90 / 0 tests passed"` and sets
`document.title = "FAIL — 90/0"`. Both are artefacts of dead scaffolding: the
file declares `var tests = []` + an `add()` helper + a `for` loop over
`tests.length`, but the suite actually runs as a long sequence of direct
`test(...)` calls, so `total` is ALWAYS 0 and `allPass` is ALWAYS false. The
headline can therefore never report a failure count.

Consequence: the real state is **90 PASS / 1 FAIL**, and the failing row is only
visible by scrolling the table:

```
37  fmtNum: NaN -> "0" (no crash)   expected 0   got —   FAIL
```

That expectation is STALE, not a regression: `Calc.fmtNum` returns `\u2014` for
non-finite input on purpose (an earlier request asked to distinguish "invalid /
unparseable" from "genuinely zero" so a broken database rate is not silently
displayed as `0`). The test predates that change. Left untouched on purpose —
editing a test to make it pass needs the owner's sign-off, and it is outside
A2's scope. **Correcting the A1 note: it claimed "90 / 0 passed"; the banner said
that, and the banner is wrong.**

*FIXED in the A2 cleanup pass (owner-approved): the counter now reads the real
`test(...)` calls, and test #37 expects `\u2014`. Suite reports **PASS — 91/91**,
and the failure path was confirmed separately (an injected failing assertion
produces `FAIL — 91/92 (1 failed)` and lists the row).*

---

## A3 — installable app shell: manifest, icons, service worker — 2026-09-14

Files added: `manifest.webmanifest`, `sw.js`, `icons/` (4 PNGs), `build-icons.ps1`.
`index.html` gained head metadata (manifest link, theme-color, apple touch icon,
favicon) and a small guarded registration script before `</body>`. Nothing else
changed: no app logic, no template, no data shape. `build-preview.ps1` needed no
edit because the new references are not `js/` or `css/` (its sanity check only
asserts those two).

### Policy: network-first, cache only as a fallback

This is the decision that makes A3 safe for a live site. When the network
answers, the response is the live file, every time — the worker is a proxy with
an offline fallback, not a cache in front of the app. Consequences:

- an online user can never be pinned to a stale bundle (verified, below);
- the live site's behaviour is unchanged, which was the standing ground rule.

The `fetch` handler deliberately returns without calling `respondWith` for:
non-GET requests, any cross-origin URL (Supabase auth + REST, the CDN fallbacks),
and anything under `/api/`. So the RLS-protected cloud data can never be served
from a cache, and `api/send-code.js` is always live. Offline boot is therefore
limited to the app shell, which is exactly the intent.

`install` adds the `SHELL` list **one entry at a time** rather than `cache.addAll`
(atomic: a single 404 would abort the whole install and leave no worker at all).
`activate` deletes any previous `nexora-shell-*` cache and claims clients.

### The icons were generated from the app's own mark

The app had no icon asset of any kind — only an inline SVG, which a manifest
cannot reference. `build-icons.ps1` draws the sidebar's mark (page + folded
corner + tick, in its own 24x24 coordinates, stroke-width 2, round caps) onto
the glass gradient at 192, 512, maskable-512 (glyph inside the 80% safe zone)
and apple 180. Sizes were verified by reading each PNG's IHDR: 192/512/512/180.

**PowerShell gotcha that cost a cycle:** `@( ,@(x,y), ... )` does NOT give an
array of point pairs — PowerShell flattens it into a mix of scalars and arrays,
and the `[float]` cast then dies with "cannot convert Object[] to Single". Flat
coordinate arrays are the fix. Related: keep these `.ps1` files **ASCII-only**;
PowerShell 5.1 reads them as ANSI without a BOM, so an em-dash is a parse error.

### Proving offline boot in a real browser (and why the preview could not do it)

A caution for future sessions: **the preview webview does not let the service
worker control subframes.** An iframe pointed at the app comes back blank when
the server is down (`controller: false` inside the frame), even though the
top-level document is controlled and served from cache. So an iframe-based
"offline test" proves nothing. The app must be the TOP-LEVEL document.

Second constraint: the preview tooling is bound to the static server's liveness,
so killing that server also blinds the tools — the exact moment you need to
watch. Hence `.freebuff/offline-chrome-test.ps1`, which uses a throwaway Chrome
profile (separate from the user's browser and from the preview) and needs no
network switch:

```
# 1. online: let the worker install + precache into a fresh profile
powershell -NoProfile -ExecutionPolicy Bypass -File .freebuff/offline-chrome-test.ps1 -Phase prime
# 2. stop the static server, then dump the DOM with the server down
powershell -NoProfile -ExecutionPolicy Bypass -File .freebuff/offline-chrome-test.ps1 -Phase dump
```

The dump phase warns if anything is still listening on 8437 (so a "pass" can
never be a false positive) and reports boot markers. Result with **no listener
on 8437**: 230,203-byte DOM, 4 nav sections, 12 tool cards, and all **81
`[data-icon]` spans hydrated with SVG** — the last one matters most, because the
hydration is done by `js/app.js`, so it proves the JS executed, not just that
HTML arrived.

**Start-Process quoting:** it joins its argument list with spaces without
quoting, so `--user-data-dir` must carry its own embedded quotes when the path
contains a space. Getting this wrong starts Chrome with a different profile and
silently created a stray `F:\AI-Chat` folder outside the project (reported to the
owner for removal).

### Staleness check (the other half of network-first)

Served a page whose content was then changed on disk, and reloaded: the new
content came back, not the cached copy. So "online" always means "the live
file". `MARKER_ONE` → `MARKER_TWO` both observed in order.

### Other verification

- Cache contents: 17 shell entries all present before any runtime use, every one
  `200`/`basic`, **zero cross-origin entries**; runtime-added font subsets only.
- `?nosw=1` skips registration (guarded on protocol too, so `file://` is
  unaffected — matching the README's "double-click index.html" promise).
- `test/calculations.test.html`: **PASS — 91/91** with the worker controlling the
  page. Console on a clean guest load: **empty**.
- The A1/A2 parity harness still runs with the worker active (its `[nodl]` log
  lines show the same two print payloads and a backup JSON). Print payloads are
  now 14,794 B / 14,917 B — a constant **-50 bytes** versus the A1 baseline, which
  is A2's font-URL swap inside `compilePrintHtml` (A2 proved that delta by
  substituting the old href back and reproducing the A1 hash). `app.js` is
  untouched by A3, so A3 cannot have moved it. Note the harness's own
  `__a1collect()` returns empty printouts even though the exports ran; the
  `[nodl]` console lines are the reliable readout.

### Dev-server note

`server-preview.ps1`'s MIME map lacked `.webmanifest`, so the manifest was served
as `application/octet-stream`. Added `application/manifest+json`; a wrong manifest
type is the kind of thing that silently costs you "Install app" on some browsers.

### Known limits, stated plainly

- Installability was verified by construction (valid manifest, real icons of the
  declared sizes, active worker with a fetch handler, secure context) — not by
  clicking "Install" in a browser UI.
- Offline means the **shell**: the app boots and every calculator/template works.
  Signing in and cloud sync still need a connection (A4–A7 territory).
- `VERSION` is manual. A shell-file change without a bump still works online
  (network-first), but the offline copy updates only at the next activate.

### A3 follow-up, raised by the owner before A4: caching was a DENYLIST

The first cut of `sw.js` excluded non-GET, cross-origin and `/api/*`, then cached
*every other* same-origin response. That contradicts the documented policy ("only
the app shell") and was caught by measuring the live cache rather than trusting
the comment:

| | count |
|---|---|
| declared in `SHELL` | 17 |
| actually cached (v1) | 26 unique paths |

The nine extras included `/test/calculations.test.html`, `/.freebuff/offline-probe.html`,
two `_a1-parity-*.html` harness pages and `/sw.js` — none of which belong in an
offline bundle, and two of which no longer existed on disk.

**Why it was worth fixing before A4 rather than after.** Nothing was exploitable
then: all user data is cross-origin (Supabase) or in localStorage. But the guard
was a path exclusion, not a policy. The moment A4–A7 (or Stage E's landing site)
introduce anything same-origin serving user-specific content, it would be written
to a cache that is **shared per-origin and survives logout**, and replayed after
any network failure. That is a shared-device leak arriving as a side effect of
cloud work rather than as a decision.

**Fix:** cache by ALLOWLIST. `isCacheable()` accepts exactly `SHELL`'s paths plus
`RUNTIME_PREFIXES` (`/vendor/fonts/`, needed because `fonts.css` pulls the woff2
subsets lazily). Everything else returns from the fetch handler **without calling
`respondWith` at all** — no interception, no `cache.put`, no cache read. Trade-off
accepted: a URL outside the list is not available offline (that is the intent).
`VERSION` bumped to **v2** so the polluted cache is deleted on activate.

### `check-shell.ps1` — the drift guard

`SHELL` is hand-maintained and `VERSION` is manual, so `sw.js` can silently drift
from reality. Network-first hides that: everything works online while offline boot
breaks. The script fails loudly on either fault and prints a shell fingerprint:

| injected fault | result |
|---|---|
| `./js/platform.js` removed from `SHELL` (still referenced by index.html) | `DRIFT DETECTED: index.html -> js/platform.js` |
| `SHELL` names `./js/does-not-exist.js` | `DRIFT DETECTED: SHELL lists a file that does not exist` |
| clean tree | `OK` + fingerprint `EBAFD8A667D8` (4,220,044 bytes across 17 files) |

Two gotchas it needed: the A2 CDN fallback loader builds `'<script src="' +
FALLBACKS[i][1] + '">'` inside an inline script, and a naive `src|href` regex
reads that concatenation as a real path — so refs containing script punctuation
are skipped. And in PowerShell, a double-quoted regex containing escaped quotes
gets eaten: use a single-quoted string with a doubled `''`.

### Re-verified after the fix (v2 allowlist policy)

| check | result |
|---|---|
| live cache contents | **18 shell entries only**; old `nexora-shell-v1` deleted on activate |
| fetch `/test/calculations.test.html`, `/.freebuff/offline-probe.html`, `/sw.js` | all `200`, **zero** new cache entries — no leak |
| fetch a font under the prefix | cached on demand (and `cache.put` is fire-and-forget, so re-read the cache a moment later or you will "fail" your own test) |
| offline boot, real Chrome, server stopped | **230,203-byte DOM, 4 nav sections, 12 tool cards, 81/81 icons hydrated by app.js** — identical to the v1 numbers |

### A4 started — plan/usage move to the database (schema written, awaiting a run)

A4's first step is `supabase/schema.sql` section 6: a new `public.account_state`
table (`plan`, `usage jsonb`, `updated_at`), plus RLS and grants. The two design
points that are NOT obvious, and would be bugs if left to the client:

1. **`plan` must not be client-writable.** RLS grants access to ROWS, not
   columns, so `auth.uid() = user_id` would happily let a signed-in user UPDATE
   their own `plan` to `premium` straight from the browser console using the
   published anon key. Two independent guards: `grant update (usage)` limits the
   `authenticated` role to the counter column, and a `protect_account_plan()`
   trigger refuses any tier change arriving via the public API. Tier changes are
   made in the SQL editor (role `''`) or by a service-role call — which is also
   how a Stripe webhook will set it, and how `jayawardhanaworks@gmail.com` gets
   developer status.
2. **`usage` must merge with MAX, not last-writer-wins.** Otherwise a second
   device, or a cleared profile, lowers the counter — reintroducing the exact
   per-device quota hole A4 exists to close.

The SQL has been reviewed by inspection only: there is no Postgres on this
machine, so it is unrun until the owner executes it in Supabase. Wiring (cloud
push/pull + offline cache in `js/cloud.js`/`js/app.js`) follows once the table
exists, and the merge is a pure function, so it can be unit-tested locally.

### Trade-off left in place, deliberately: precache is a second download

The shell is **4.2 MB** and `install` fetches it with `cache: 'reload'`, which
bypasses the HTTP cache on purpose — the shell filenames are not content-hashed,
so without `reload` a version bump could store the *old* bytes and leave the
offline bundle stale despite a correct VERSION. The cost is that a returning
visitor downloads the shell twice (page + offline copy) once per version. Trimming
this would mean precaching only boot-critical files and letting `vendor/` fill in
on first use — a deliberate future call, not an oversight.

## A4 — plan + usage are account state (wired and verified) — 2026-09-15

The owner ran section 6 of `supabase/schema.sql` (self-check: 6 tables all
`rls_enabled: true` with 4 policies each; `plan_writable: false`,
`usage_writable: true`), so `public.account_state` now exists and the app is
wired to it.

### What was wired

| file | change |
|---|---|
| `js/cloud.js` | new sync kind `account` (`nexora_plan` primary, `nexora_free_usage` alias), `pushAccountRow()`, a dedicated block in `pull()`, MAX-merge helpers, a `42501`/permission branch in `errorInfo()`, `accountAt` on the status snapshot, and a new diagnostic `NexoraCloud.accountState()` + `NexoraCloud.merge` |
| `js/app.js` | `getPlan()` now normalises `free`/`premium`/`developer`; `isPremium()` is `isAdmin() \|\| getPlan() !== 'free'`; `setPlan()` is GONE (nothing may grant a tier client-side); `planState()` gained the developer branch; the two Premium Plans buttons record a request instead of granting; `onCloudEvent` repaints the gating UI when `accountAt` changes; the setup toast now reports the error's own message |
| `sw.js` | `VERSION` v2 → **v3** (two shell files changed — `check-shell.ps1` fingerprint `EBAFD8A667D8` → `1D6F596C26CC`) |

Two deliberate behaviour changes, both consequences of the tier no longer being
client-writable: **Subscribe** no longer turns on Premium locally (it records
the choice and says the tier is applied server-side), and **Return to Free** no
longer turns it off. Everything else about those buttons is unchanged. Promoting
an account is now one SQL statement (`update account_state set plan='premium'`),
and the `ADMIN_EMAILS` allowlist still gives developer status with no database
change at all.

### Why the push is UPDATE-then-INSERT, not an upsert

An upsert's `SET` list is generated from the whole payload, so a row carrying
`user_id` (and any `plan`) would be sent as an update of columns this role may
not write — the guard doing its job would look like a sync failure. The push
sends exactly one column, and falls back to an INSERT (body exactly
`{user_id, usage}`) only when the UPDATE matched no row. A `23505` on that
INSERT (another device won the race) retries the UPDATE once.

### Harness: `.freebuff/make-a4-account.ps1` (+ `a4-account-stub.html`)

A real round trip is impossible to test from here — the publishable key is
useless without a session, and RLS is what authorises the row — so the harness
seeds a syntactically valid session and answers the REST calls supabase-js
actually makes, through the app's **real** code path (real `cloud.js`, real
client, real request bodies). Only the wire is faked; nothing is downloaded and
no file is written.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .freebuff/make-a4-account.ps1 -Scenario a
# → _a4-a.html at the project root; open it via the preview server
```

Each scenario is a separate file because the preview layer ignores a navigation
that differs only in its query string.

| scenario | account row | local cache | result |
|---|---|---|---|
| `a` | premium + `{qr:2,scope-guard:1}` | **empty** (cleared browser) | tier and meter adopted; `#hl-plan` `Unlimited Credits`, chip `Premium — unlimited`; **no write back** |
| `b` | free + all 13 tools spent | **empty** (cleared browser) | `0 of 13 free` / `All 13 free uses spent` — `clear site data` no longer hands out a fresh allowance |
| `c` | free + `{qr:2}` | `{qr:1,boq:4}` (ours is higher) | one `PATCH`, body keys exactly `['usage']`, body `{"usage":{"boq":4,"qr":2}}` — max of both sides, neither lowered |
| `d` | **none** (never synced) | `plan: premium` (stale grant) | stale premium **revoked** to free, then INSERT with body keys exactly `['user_id','usage']` |
| `e` | — (every REST call rejects) | premium + `{qr:3}` | boots offline (4 nav sections, 12 cards, console empty), gate still reads the cached tier, status `offline` with the explanatory message, and the offline write is **queued** (`nexora_plan` → `{"qr":4}`) rather than lost |
| `f` | **none** (never synced) | **empty** (brand-new account) | row **created**: PATCH (matched nothing) → POST, keys exactly `['user_id','usage']`; nothing else changed |

Each scenario also shows the app taking its own boot path: 2 account_state
GETs (boot → pull changes the cache → one guarded reload → boot).

### Two traps this harness set, both fixed in the harness

1. **The "first load" flag was tab-scoped (`__a4booted`).** Scenarios are
different FILES opened in the same tab, so from the second scenario on, the wipe
and seed never ran — B inherited A's cache and was silently testing a mixture
(all four now key the flag on `location.pathname`, so every page gets its own
first load while a reload of that page keeps what the app itself wrote). The
symptom was a `PATCH` nobody asked for: it was the **correct** local-higher
merge, on a cache that was never supposed to be there. Worth remembering before
believing any "unexplained write" in this harness.
2. **The pull guard (`nexora_cloud_pull_guard`) persists in sessionStorage**, so
a later scenario never reloads. Cleared in the stub's first-load branch.

The harness also wraps `NexoraCloud.noteWrite`/`noteRemove` (app.js calls them
dynamically, so wrapping catches every per-user write with its call site) —
that is what ruled OUT `noteWrite` as the source of that `PATCH`.

### The row-creation trigger — corrected after the first report

The first implementation created the row **only when the account had something
to record** (a spent free use), because `reconcile()`'s account branch sat
after its "nothing local to offer" early return. A signed-in account that had
never exported anything therefore had **no row at all**, which makes the
documented way to promote someone — `update public.account_state set plan = …`
— match nothing and fail silently. (The owner hit exactly this: an admin
account showed the expected empty table, because admin accounts bypass the gate
and so never spend a use.)

The account key is now evaluated before that early return, so the row belongs
to the ACCOUNT rather than to whatever the cache happens to hold:

* signing in creates it, on the boot after the pull's single reload;
* the first metered action creates it if that comes first;
* offline, on the first successful sync;
* and it is created for admin accounts too — they just stay `{free, {}}`, since
  the gate never charges them a use.

Scenario `f` covers this path. Note it is a **follow-up** to the A4 report, so
the trigger described there ("any signed-in boot") is only true as of this fix.

### One real fix found by the harness

`reconcile()` pushed the account row on **every page load**. Its rule is
"local meta is newer than the row ⇒ push", but `setMetaAt` stamps the clock at
flush time, so a freshly written row always looked older than the meta that
wrote it. Harmless for the other keys (idempotent snapshots); for the meter it
meant re-sending an unchanged counter forever. The account key is now excluded
from the timestamp rule and pushes only when the row does not exist yet (the
pull already queues the genuine increases).

**Still pre-existing, NOT addressed here:** the same timestamp rule makes
`appearance_settings` re-POST on every single load. It is an idempotent
single-row write, it predates A4, and changing it affects all four singleton
paths — so it is left alone deliberately, not overlooked.

### Verified alongside

* `test/calculations.test.html`: **91/91, title reads `PASS — 91/91`**.
* `index.html` as a guest: 22 views, 12 tool cards, 4 sections, 81 icons
  hydrated, `signed-out`, no cloud traffic, **console empty**.
* `build-preview.ps1` → `preview.html` 1,065,826 bytes; `check-shell.ps1` → OK
  (all 18 SHELL entries exist; every same-origin reference is covered).
* Generated `_a4-*.html` pages deleted; the harness itself is kept for A5–A7.

## A5 — saved ERP records + per-tool Library pointers sync — 2026-09-15

Two stores, and they are NOT the same kind of thing — which is why they got two
different tables (section 7 of `supabase/schema.sql`, handed over with this
turn):

| local key | table | shape | policy |
|---|---|---|---|
| `calcmall_erp_records_v1` | `erp_records` | `{ recordId: { savedAt, state } }` → one row per record, payload in `data` | collection, newest copy wins (per-record merge is A6) |
| `calcmall_tool_library_v1` | `tool_library_ids` | `{ toolId: historyEntryId }` → one row per user | whole-map last-writer-wins |

The second one is only a POINTER: the documents a mini-tool saves already live in
`calcmall_history`/`documents`. It exists so a repeat *Save to Library* UPDATEs the
entry it created rather than adding a second one. A per-key merge would need
tombstones to survive a tool **Reset** (which deletes a key) without resurrecting
it, for no real gain — so it is one small row, last write wins.

### The deployment hazard, and the fix for it

A4's wiring was safe to ship before its SQL was run because nothing referenced
the table. A5 cannot be: the two new keys are in `SYNC` the moment the code
lands, so a pull against a database without section 7 would throw and take
**every other table down with it** (including the plan/usage row A4 just got
working). So the pull is now per-table:

* a table this build expects and the database does not have is recorded in
  `state.missingTables`, skipped, and the rest of the pull continues;
* its local copy is left ALONE (never blanked to `[]`), and nothing is ever
  pushed at it — `noteWrite` will not schedule it and `flushKey` returns early,
  so the queued write stays queued until the schema exists;
* `missingNotice()` is derived from CURRENT state, so a later successful write
  cannot clear the notice (the old hardcoded `setupMissing: false` in the
  sync-success path did exactly that);
* the app shows it persistently: `renderCloudStatus` appends
  `· N tables local-only` to the sidebar label, with the tooltip naming the
  tables, and a toast fires once per page load.

A real network/auth failure still fails the whole pull as before — only a
missing-table answer is tolerated.

### The second hazard: stale in-memory copies

Both stores are module-level values read once at boot. A pull landing mid-session
left them stale, and the NEXT save would then write the stale map back over what
the pull had brought — silently losing a whole store. `recordsMaybeReload()`
(alongside `dbMaybeReload`, whose pattern it copies) re-reads both when a storage
signature changes, without a reload, so work in progress is untouched. Our own
writes refresh the signature, which is what keeps the notice from firing after
every local save. The baseline is taken in the boot block BEFORE
`initCloudSync()`, so a first-boot pull counts as a change rather than being
baked into the baseline.

### Verified — `.freebuff/make-a4-account.ps1 -Scenario g|h|i|j`

| scenario | cloud | local | result |
|---|---|---|---|
| `g` | two `erp_records` rows | empty | both adopted with their full payload (client, project, 2 lines, `savedAt` preserved), Home card renders `ACME-WH-01 Example Client Name · Warehouse Rewire 2 lines`, and **no write back** |
| `h` | empty `erp_records` | two records | one upsert POST carrying both, with columns (`client`, `project`, `line_count`, `saved_at` as epoch ms, `user_id`) plus the full `data` payload; queue drained |
| `i` | `{retainer: doc-9}` | empty | pointer map adopted; **GETs only** |
| `j` | **both tables return PGRST205** | one record | pull still `synced`; `missingTables: [erp_records, tool_library_ids]`; the record is kept and still rendered; **zero requests to either absent table**; the write is queued; items/clients/documents still sync; sidebar reads `Cloud: synced (1 pending) · 2 tables local-only` |

Scenario `i` re-run after the notice change shows a clean `Cloud: synced` with no
suffix, so the hint appears only when a table is genuinely absent.

### Harness fixes worth remembering

1. The generator wrote scenario tables at the TOP level of `window.__a4` while the
   stub read `CFG.tables[name]`, so the app pulled empty tables and scenario `g`
   "failed" for a reason that had nothing to do with the product. Nested under
   `"tables"` now.
2. PowerShell needed SINGLE-quoted literals for the scenario JSON. Double-quoted
   with embedded `\"` is a parse error (`Unexpected token`) — the same class of
   quoting trap as the ANSI `.ps1` rule above, and it fails at parse time, so the
   generated file is simply never written.

---

## A6 — per-record merge, tombstones, per-key pointers — 2026-09-15

This SUPERSEDES the two policies recorded in the A5 section above: `erp_records`
is no longer decided as a whole collection, and `tool_library_ids` is no longer
whole-map last-writer-wins.

### What was actually wrong

A5 compared two collections as WHOLES: whichever side owned the newest row won
outright. Editing record *X* on one device and record *Y* on another — both
offline, both real, the ordinary two-device case — lost one of the two edits, and
the loss was silent. The pointer map had the same shape of hole: losing a pointer
makes the next *Save to Library* add a SECOND entry instead of updating the first.

### The design

* **Per record, clocked by the record's own `savedAt`** — the instant the user
  pressed Save. It is identical on both sides (it round-trips inside `data`) and,
  crucially, it does not move when a device merely re-pushes what it already had,
  which the row's `updated_at` does. `updated_at` remains the fallback for a row
  written before the payload existed. The collection is the UNION of both sides.
* **Deterministic ties**, in `erpWinner(a, b)`: later save wins → at the same
  instant a delete beats a save (you cannot delete what you have not seen) →
  same instant and same kind falls back to the payload bytes. Both devices run it
  on the same pair, so they converge instead of each keeping its own copy. A tie
  that remote wins is deliberately NOT re-pushed (no write loop), while a
  same-millisecond DELETE IS pushed (otherwise the other device's copy lives on).
* **Deletions travel as data**: `erp_records.deleted_at` (schema section 8) makes
  a deleted record a row with a stamp, so "deleted at T" is distinguishable from
  "created elsewhere and not pulled yet". The app keeps `{ recordId: epochMs }`
  in `calcmall_erp_deleted_v1`, stamped by diffing the store at its single write
  choke point — `saveErpRecords()` — so a record re-saved under a deleted id is
  simply a newer live event and wins.
* **The push no longer SWEEPS when tombstones are available.** "Delete every row
  this device does not have" is a whole-collection rule: under a union it deletes
  records another device created after our last pull (our own push can happen
  later in the same session, with `pulledOK` already true, so no fresh pull
  protects them). The sweep is skipped, and comes back unchanged when the column
  is absent.
* **Per-key pointers**: `calcmall_tool_library_at_v1` holds this device's write
  time for each tool; a key absent from the map but present there is a REMOVAL at
  that time. The remote side has one clock (the row's `updated_at`), which answers
  the only question that matters: was this key removed over there after we wrote
  it? A tool **Reset** therefore survives another device's older map.
* **Tombstone purge after 30 days**, in the same request batch as the push (a
  purge failure never fails the push). A device offline longer than that can
  resurrect a record it holds — the documented cost.

### The fallback that makes the deploy safe

Section 8 is a new column, so the code must be harmless before it is run. The
pull asks once per page load (`select deleted_at limit 1`), and only `true`
switches the merge on: a network blip leaves the question open (asked again next
load) rather than concluding the schema is missing. Without the column, A5's
set-wide rule and its sweep run EXACTLY as before, and no request ever carries a
`deleted_at` key. `NexoraCloud.mergeState()` reports the tri-state
(`tombstones: true | false | null`) plus the pending pushes.

### Verified — `make-a4-account.ps1 -Scenario k|l|m|n|o`

| scenario | setup | result |
|---|---|---|
| `k` | cloud holds record 1 NEWER; local holds 1 (older) and a record 2 the cloud has never seen | local ends with **both**; one POST carrying both rows (`deleted_at: null`); record 2 kept AND published. A5 lost record 2 here |
| `l` | cloud holds a TOMBSTONE for record 1; local still holds it | record 1 removed locally, `calcmall_erp_deleted_v1` gains `1` at the cloud's deletion instant, record 2 untouched; the push carries a tombstone ROW for 1 (`data: null`, `deleted_at` set) and the live row for 2; the only DELETE is the PURGE |
| `m` | a deletion made HERE, cloud still holding both records | published as a tombstone row; records end `{2}`; cloud row 1 becomes `dead`; **no sweep** |
| `n` | the tombstone column ABSENT (section 8 not run) | probe reports the column missing, A5's rule runs, and no request body contains `deleted_at` |
| `o` | cloud map `{retainer, qr}`; local `{qr: doc-1}` + a REMOVAL clock for `retainer` newer than the row | local ends `{qr: doc-4}` (the cloud's id adopted), `retainer` stays REMOVED, ONE push carrying `{qr: doc-4}`, and a second load writes nothing (convergence) |

**The sweep contrast, played as the other device.** After boot, a row `ZZ` is
pushed straight into the fake backend (a record this device has never seen), then
a local save queues a push:

* A6 mode (`m`): the push runs (`ok:true, pushed:1`) and **`ZZ` survives** —
  `rows-removed` is empty (only the purge fires).
* Fallback (`n`): the identical situation **sweeps `ZZ` away** —
  `rows-removed: ["ZZ"]`. That is the bug A6 removes, still present exactly where
  the schema has not been run.

**The app's own choke points, driven through the real UI** (not by writing
storage directly): the record **Delete** button + its confirm modal stamped
`calcmall_erp_deleted_v1: {A6-TEST: 1789472912546}`; re-saving the same id withdrew
it to `{}`; a real *Save to Library* on the Retainer produced
`{retainer: mu2m01fh5nvvk7}` in the pointer map and `{retainer: 1789472965950}` in
the clocks; the tool's **Reset** removed the pointer and re-stamped the clock
newer (a removal) — which is exactly the input scenario `o` consumes.

**The pure rules, called directly** (`NexoraCloud.merge.*`): union with a
local-only record pushed, delete-beats-save at an equal clock (and published),
identical copies producing NO push, the content tie-break agreeing in both
orders, our newer pointer surviving, and a removal not resurrected.

Regressions: `test/calculations.test.html` **91/91** (`PASS — 91/91`), and
`index.html` as a guest boots clean — 12 tool cards, 4 nav sections, 81 hydrated
icons, **empty console**, `mergeState.tombstones: null` (never asked, signed out).

`sw.js` `VERSION` → **v5** (two shell files changed; `check-shell.ps1` passes,
17 files / 4,264,747 bytes).

### Harness additions (and their traps)

* `-Tag <suffix>` on the generator is now the ONLY way to get a fresh SEED: the
  stub wipes and seeds on the first load of a given PATHNAME, so re-visiting a
  scenario page keeps whatever the previous run left in localStorage. A re-run
  without a tag tests a mixture of two scenarios. This bit me once: a re-visited
  `-m` page started from `-n`'s leftover store.
* The stub's generic tables now MUTATE on write (merge by `id`, replace for a
  singleton, DELETE removes the ids it names) instead of logging and discarding.
  Without that, "did it converge?" is not a real question — the second load would
  see the first load's write undone.
* A `DELETE` is logged with `purge: true/false`, because the A5 SWEEP and A6's
  tombstone PURGE are both DELETEs to the same table and are otherwise
  indistinguishable in the log.
* **TRAP — the stub answered DELETEs with `new Response(body, {status: 204})`,
  which throws in the browser** (`Response with null body status cannot have
  body`). The app correctly read that as a dead wire, re-queued, and reported
  `ok:false` — so the A5 sweep looked like a network failure. Fixed to a bodyless
  204. If a push ever returns `ok:false` with `pushed:0` and an empty queue
  afterwards, suspect the harness before the product.
* **TRAP — never rewrite a project file with PowerShell**
  (`Get-Content -Raw | Set-Content`). PS 5.1 reads the file as ANSI and writes
  UTF-8, so every non-ASCII character is double-encoded and a BOM is prepended;
  `sw.js` came back as `Â·`/`â€”` on 18 lines. Only the version bump was needed,
  and it was re-applied with the editor tools. Use `[System.IO.File]` with an
  explicit encoding, or better, the editor tools.
