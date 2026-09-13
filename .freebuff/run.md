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
  offscreen `#quotation-doc` holds the formal letter (METRIX letterhead,
  recipient, itemized table, totals, T&C, signature); "Download Client
  Quotation PDF" runs html2pdf (needs the CDN; on a real browser it saves
  a PDF); data persists across reload (`cm-boq-v1`); Reset quotation clears
  it. Requires the html2pdf.js CDN script in the head to be reachable.
- Nav names: the tool bar + banner headings read "Quotation" (shortened
  from "Quotation Tool") and "Invoice" opens the Smart Invoice & Document
  Builder (#05, `#invoice-view`).
- PDF document template — Access Ekala sheet (2026-09-12): `generatePrintHTML(data)`
  in `app.js` is now the **complete client-supplied Access Ekala template**,
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
- METRIX letterhead tune-up (2026-09-12): the tagline (`.mx-spec`) is a bare
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
  all; it now compiles a formal Metrix-layout sheet (brand letterhead,
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
restored to `name: 'METRIX ENGINEERING'`, `legalName: 'METRIX ENGINEERING
SERVICES (PVT) LTD'`, `contact: '+94 112 286695'`, everything else blanked —
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
column the brand's real legal name and address (`METRIX ENGINEERING SERVICES
(PVT) LTD` / `5/1A, Samagi Mw, Depanama, Pannipitiya, Sri Lanka`) each wrap to
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
`legalName` / `address` restored to `METRIX ENGINEERING SERVICES (PVT) LTD` /
`5/1A, Samagi Mw, Depanama, Pannipitiya, Sri Lanka`. The layout run itself used
`legalName: METRIX ENGINEERING`, `address: Depanama, Pannipitiya, Sri Lanka`,
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
  -Path "C:\Users\User\Downloads\ACCESS EKALA SERVICE INV648 (1).pdf" \
  -Out "<repo>\.freebuff\master-letterhead.png"
```

`.freebuff/master-letterhead.png` (96,763 bytes) is a MEASUREMENT REFERENCE
ONLY. **Never ship it as a document asset**: the master's logo is a SAMPLE and
must not appear on a generated invoice (explicit user instruction). It must
never be put back into `assets/` or wired into `bannerUrl`.

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
(`METRIX ENGINEERING SERVICES (PVT) LTD`) and a long purchaser name wrap to two
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
| developer (`himalabey.503@gmail.com`) | unlimited, unmetered, exempt from every block screen |

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

A tool's single use is spent when the tool is *opened*; every PDF/Excel
trigger fired from inside that open tool is part of the same execution, via a
session grant (`sessionGrants[id]`) that is dropped the moment the view
changes. That is what keeps a document export from costing a second use — and
what makes re-entering the tool after the free use a blocked action, even in
the same browser session. `Reset all data` is the meter's only reset path; a
paid plan is deliberately not cleared by it.

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
