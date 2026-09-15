/* Nexora Engine — Business Intelligence & ERP — app.js
 * State (localStorage), rendering, events, message generator,
 * Home↔tool view switching, hours/days time-unit handling.
 * Client/Project field standardization r7 — synced for the preview layer.
 * Relies on window.Calc from calculations.js.
 */
(function () {
  'use strict';
  /* sync marker r6-2026-09-11 */

  /* ── Helpers ──────────────────────────────────────────── */
  /* $() is null-tolerant by design: elements can be legitimately
   * removed (e.g. the footer TOOLS column) without killing the
   * rest of the wiring chain. Callers that must have the element
   * check for null themselves. */
  const $ = (id) => document.getElementById(id);

  /* ── Per-user storage shim ─────────────────────────────── */
  /* DATA_KEYS are namespaced with the signed-in user's email
   * ("u:<email>:") so every account gets an isolated data set.
   * Global keys (theme, accent, auth itself) stay unprefixed.
   * The local `localStorage` below shadows window.localStorage
   * for the whole IIFE, so no module code had to change.        */
  const GLOBAL_KEYS = ['cm-theme', 'cm-accent-v1', 'cm-bg-v1', 'users', 'currentUser'];
  const SESSION_EMAIL = (function () {
    /* Read via window.localStorage: the IIFE-scoped shim below is in its
     * temporal dead zone at this point (const not yet initialized). */
    try { return window.localStorage.getItem('currentUser') || ''; } catch (e) { return ''; }
  })();
  function userKey(key) {
    if (GLOBAL_KEYS.indexOf(key) !== -1 || !SESSION_EMAIL) return key;
    return 'u:' + SESSION_EMAIL + ':' + key;
  }
  const localStorage = {
    getItem: function (k) { try { return window.localStorage.getItem(userKey(k)); } catch (e) { return null; } },
    setItem: function (k, v) { try { window.localStorage.setItem(userKey(k), v); } catch (e) { /* ignore */ } },
    removeItem: function (k) { try { window.localStorage.removeItem(userKey(k)); } catch (e) { /* ignore */ } }
  };

  /* ── Auth (local accounts, persisted) ──────────────────── */
  const USERS_KEY = 'users';
  const SESSION_KEY = 'currentUser';
  function hashPass(pw) {
    /* Non-reversible digest — local convenience only, NOT real security. */
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    const s = String(pw);
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + '-' + ((h2 >>> 0).toString(36));
  }
  function getUsers() {
    try { return JSON.parse(window.localStorage.getItem(USERS_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveUsers(users) {
    try { window.localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (e) { /* ignore */ }
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
  function currentUser() {
    if (!SESSION_EMAIL) return null;
    const users = getUsers();
    for (let i = 0; i < users.length; i++) {
      if (users[i].email === SESSION_EMAIL) return users[i];
    }
    return { name: SESSION_EMAIL.split('@')[0], email: SESSION_EMAIL };
  }
  function setSession(email) {
    try {
      if (email) window.localStorage.setItem(SESSION_KEY, email);
      else window.localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
    /* Reload so every module re-reads its (now namespaced) data keys. */
    window.location.reload();
  }

  /* ── Auth UI (modal + sidebar badge) ─────────────────── */
  let authMode = 'login';
  function showAuthError(msg) {
    const el = $('auth-error');
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }
  function setAuthMode(mode) {
    authMode = mode;
    const isSignup = mode === 'signup';
    const t1 = $('auth-tab-login'), t2 = $('auth-tab-signup');
    if (t1) { t1.classList.toggle('active', !isSignup); t1.setAttribute('aria-selected', String(!isSignup)); }
    if (t2) { t2.classList.toggle('active', isSignup); t2.setAttribute('aria-selected', String(isSignup)); }
    const nf = $('auth-name-field');
    if (nf) nf.hidden = !isSignup;
    const title = $('auth-modal-title');
    if (title) title.textContent = isSignup ? 'Create your account' : 'Welcome back';
    const sub = $('auth-submit');
    if (sub) sub.textContent = isSignup ? 'Continue' : 'Login';
    const pass = $('auth-pass');
    if (pass) pass.setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
    showAuthError('');
    showAuthStep('form'); // switching modes always returns to step 1
  }
  function openAuthModal(mode) {
    resetAuthFlow(); // always start on the registration form
    setAuthMode(mode);
    $('auth-modal').hidden = false;
    const first = mode === 'signup' ? $('auth-name') : $('auth-email');
    if (first) first.focus();
  }
  function closeAuthModal() {
    resetAuthFlow(); // clears any pending code + stops the countdown
    $('auth-modal').hidden = true;
  }

  /* ── Access control & AI credits ────────────────────────────────
     Two GLOBAL window.localStorage keys (deliberately NOT routed
     through the per-user key shim): the login flag and the balance. */
  const LOGGED_IN_KEY = 'nexora_user_logged_in';
  const CREDITS_KEY = 'nexora_ai_credits';
  const ROLE_KEY = 'nexora_user_role';
  // Developer / admin test account — bypasses the credit gate entirely.
  const ADMIN_EMAIL = 'himalabey.503@gmail.com';
  const ADMIN_CREDITS = 99999;
  function rawGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function rawSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function rawDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function isLoggedIn() { return rawGet(LOGGED_IN_KEY) === 'true'; }
  function getCredits() {
    const n = parseInt(rawGet(CREDITS_KEY), 10);
    return (isFinite(n) && n > 0) ? n : 0;
  }
  function setCredits(n) { rawSet(CREDITS_KEY, String(Math.max(0, Math.floor(Number(n)) || 0))); }
  function isAdminEmail(email) {
    return String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
  }
  // Admin = the developer account, either by role flag or by live session email.
  function isAdmin() {
    if (rawGet(ROLE_KEY) === 'admin') return true;
    const user = currentUser();
    return !!(user && isAdminEmail(user.email));
  }
  // Developer accounts store the admin role and an effectively unlimited balance.
  function grantAdminEntitlements() {
    rawSet(ROLE_KEY, 'admin');
    rawSet(CREDITS_KEY, String(ADMIN_CREDITS));
  }
  // Every fresh login / sign-up grants the single free AI execution
  // (developer accounts skip the metering instead).
  function grantLoginEntitlements(email) {
    rawSet(LOGGED_IN_KEY, 'true');
    const user = currentUser();
    const who = email || (user && user.email) || '';
    if (isAdminEmail(who)) { grantAdminEntitlements(); return; }
    rawSet(ROLE_KEY, 'user');
    rawSet(CREDITS_KEY, '1');
  }
  // Accounts created before the gate keep their session, granted one credit;
  // an existing developer session is promoted to admin with unlimited credits.
  function initAccessState() {
    const user = currentUser();
    if (user && !isLoggedIn()) rawSet(LOGGED_IN_KEY, 'true');
    if (user && isAdminEmail(user.email)) { grantAdminEntitlements(); return; }
    if (isLoggedIn() && rawGet(CREDITS_KEY) === null) rawSet(CREDITS_KEY, '1');
  }
  function openGateModal(kind) {
    const t = $('gate-title'), m = $('gate-msg');
    const lb = $('gate-login'), sb = $('gate-signup');
    if (kind === 'limit') {
      if (t) t.textContent = 'AI Credit Limit Reached';
      if (m) m.textContent = 'You have used your 1 free AI tool execution. Upgrade or contact support for full access.';
      if (lb) lb.hidden = true;
      if (sb) sb.hidden = true;
    } else {
      if (t) t.textContent = 'Authentication Required';
      if (m) m.textContent = 'Please Login or Sign Up to access Nexora Engine AI utilities.';
      if (lb) lb.hidden = false;
      if (sb) sb.hidden = false;
    }
    const modal = $('gate-modal');
    if (modal) modal.hidden = false;
  }
  function closeGateModal() { const m = $('gate-modal'); if (m) m.hidden = true; }

  // Spec-named modal openers (thin aliases over the shared gate modal:
  // 'auth' = "Authentication Required", 'limit' = "AI Credit Limit Reached").
  function showAuthRequiredModal() { openGateModal('auth'); }
  function showCreditLimitModal() { openGateModal('limit'); }
  // Refresh every credit-bearing piece of UI at once (sidebar status + storage line).
  function updateCreditUI() { renderAuthUi(); renderStorageStatus(); }

  /* Strict access + credit validation. Every tool launch, PDF generator and
     Excel export trigger must pass through here BEFORE any of its own logic
     (or any print dialog) runs. Returns false without deducting when blocked. */
  function checkAccessAndCredits() {
    const loggedIn = rawGet(LOGGED_IN_KEY) === 'true';

    if (!loggedIn) {
      showAuthRequiredModal();
      return false;
    }
    // Developer / admin bypass — run every tool, PDF and export without
    // spending credits or ever seeing a block screen.
    if (isAdmin()) {
      if (rawGet(ROLE_KEY) !== 'admin') grantAdminEntitlements();
      return true;
    }
    const credits = parseInt(rawGet(CREDITS_KEY) || '0', 10) || 0;
    if (credits <= 0) {
      showCreditLimitModal();
      return false;
    }
    // Deduct credit upon valid execution
    rawSet(CREDITS_KEY, String(credits - 1));
    showToast('1 AI Credit Used');
    updateCreditUI();
    return true;
  }

  // Single choke point every tool launch passes through.
  function consumeToolCredit() { return checkAccessAndCredits(); }

  /* Wrap a click handler so a failed gate blocks the underlying logic
     outright — no export, no print dialog, no tool view. */
  function gateClick(handler) {
    return function (e) {
      if (!checkAccessAndCredits()) {
        if (e) {
          if (e.preventDefault) e.preventDefault();
          if (e.stopPropagation) e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        }
        return false;
      }
      return handler.apply(this, arguments);
    };
  }

  // Same gate for programmatic starters that receive no click event
  // (e.g. re-running an export from the History list).
  function gated(start) {
    return function () {
      if (!checkAccessAndCredits()) return false;
      return start.apply(this, arguments);
    };
  }
  function renderAuthUi() {
    const user = currentUser();
    const guest = $('auth-guest'), badge = $('user-badge');
    if (!guest || !badge) return;
    guest.hidden = !!user;
    badge.hidden = !user;
    if (user) {
      const name = user.name || user.email.split('@')[0];
      $('user-name').textContent = name;
      $('user-email').textContent = user.email;
      $('user-avatar').textContent = name.trim().charAt(0).toUpperCase() || '?';
    }
    // Access status + live AI-credit line
    const credits = user ? getCredits() : 0;
    const gs = $('guest-status');
    if (gs) gs.textContent = 'Guest Account (0 Credits)';
    const us = $('user-status');
    if (us) {
      us.textContent = (user && isAdmin())
        ? 'Logged In (Admin - Unlimited Testing)'
        : 'Logged In (' + credits + (credits === 1 ? ' Credit Available)' : ' Credits Left)');
    }
  }
  /* ── Sign-up Email OTP verification (step 2 of the auth modal) ────
     Sign up is two steps: the registration form issues a random
     6-digit code, then the verification view checks it against an
     exact 2-minute expiry before the account is actually created.
     The code is NEVER rendered into the page — there is no on-screen
     toast — it is handed to sendVerificationEmail(), whose dev build
     logs it to the console. Swap the commented fetch() back in to
     deliver real mail from a backend. */
  const OTP_TTL_MS = 2 * 60 * 1000; // codes are valid for exactly 2 minutes
  let otpTimerId = null;
  let pendingSignup = null; // { name, email, pass } held until the code verifies
  window.currentSignupOTP = null; // spec-named globals (also handy for testing)
  window.otpExpiry = 0;

  function randomOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }
  function showOtpError(msg) {
    const el = $('otp-error');
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }
  function fmtClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function renderOtpTimer() {
    const el = $('otp-timer');
    if (!el) return;
    const left = window.otpExpiry - Date.now();
    if (left <= 0) {
      el.textContent = 'Code expired — click Resend Code for a new one.';
      el.classList.add('expired');
      return;
    }
    el.textContent = 'Code expires in: ' + fmtClock(left);
    el.classList.remove('expired');
  }
  function stopOtpTimer() {
    if (otpTimerId) { clearInterval(otpTimerId); otpTimerId = null; }
  }
  // 1-second interval driving the "01:59 / 01:58 …" countdown.
  function startOtpTimer() {
    stopOtpTimer();
    renderOtpTimer();
    otpTimerId = setInterval(function () {
      renderOtpTimer();
      if (Date.now() > window.otpExpiry) stopOtpTimer();
    }, 1000);
  }
 async function sendVerificationEmail(email, otp) {
  try {
    const res = await fetch('/api/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send email');
    console.log('Verification email dispatched:', data);
  } catch (err) {
    console.error('Email dispatch error:', err);
    showOtpError(err.message);
  }
}
  // Swap the modal between the registration form and the verification view.
  function showAuthStep(step) {
    const isOtp = step === 'otp';
    const s1 = $('auth-step-1'), s2 = $('otp-form'), tabs = document.querySelector('.auth-tabs');
    if (s1) s1.hidden = isOtp;
    if (s2) s2.hidden = !isOtp;
    if (tabs) tabs.hidden = isOtp; // the Login/Sign Up tabs belong to step 1
    const title = $('auth-modal-title');
    if (title) {
      title.textContent = isOtp
        ? 'Verify Your Email'
        : (authMode === 'signup' ? 'Create your account' : 'Welcome back');
    }
    if (isOtp) { const f = $('otp-code'); if (f) f.focus(); }
  }
  // Drop any in-flight code and return the modal to the registration form.
  function resetAuthFlow() {
    stopOtpTimer();
    pendingSignup = null;
    window.currentSignupOTP = null;
    window.otpExpiry = 0;
    showOtpError('');
    const f = $('otp-code');
    if (f) f.value = '';
    showAuthStep('form');
  }
  // Issue a fresh code (+2 minutes) and open the verification view.
  function beginOtpVerification(name, email, passHash) {
    pendingSignup = { name: name, email: email, pass: passHash };
    const randomCode = randomOtp();
    window.currentSignupOTP = randomCode;
    window.otpExpiry = Date.now() + OTP_TTL_MS;
    const em = $('otp-email');
    if (em) em.textContent = email;
    const f = $('otp-code');
    if (f) f.value = '';
    showOtpError('');
    showAuthStep('otp');
    startOtpTimer();
    // Fire-and-forget: the code is only ever delivered out of band (console
    // in dev, email in production) — never printed into the page.
    sendVerificationEmail(email, randomCode).catch(function () { /* ignore */ });
  }
  // Resend: clear timers, fresh code, +2 minutes, new delivery attempt.
  function resendOtp() {
    if (!pendingSignup) return;
    stopOtpTimer();
    const randomCode = randomOtp();
    window.currentSignupOTP = randomCode;
    window.otpExpiry = Date.now() + OTP_TTL_MS;
    const f = $('otp-code');
    if (f) { f.value = ''; f.focus(); }
    showOtpError('');
    startOtpTimer();
    sendVerificationEmail(pendingSignup.email, randomCode).catch(function () { /* ignore */ });
  }
  // Code accepted — create the account and sign in.
  function finishSignup() {
    if (!pendingSignup) return;
    const users = getUsers();
    users.push({
      name: pendingSignup.name,
      email: pendingSignup.email,
      pass: pendingSignup.pass,
      created: new Date().toISOString()
    });
    saveUsers(users);
    grantLoginEntitlements(pendingSignup.email);
    const email = pendingSignup.email;
    resetAuthFlow();
    setSession(email); // auto sign-in, reloads
  }
  function handleOtpSubmit(e) {
    e.preventDefault();
    if (!pendingSignup) { showOtpError('Please start the sign up again.'); return; }
    const code = (($('otp-code').value || '')).replace(/\D/g, '');
    if (Date.now() > window.otpExpiry) {
      showOtpError("Verification code has expired. Please click 'Resend Code'.");
      return;
    }
    if (code !== window.currentSignupOTP) {
      showOtpError('Invalid verification code. Please check and try again.');
      return;
    }
    stopOtpTimer();
    finishSignup();
  }

  function handleAuthSubmit(e) {
    e.preventDefault();
    const email = ($('auth-email').value || '').trim().toLowerCase();
    const pass = $('auth-pass').value || '';
    if (!validEmail(email)) return showAuthError('Please enter a valid email address.');
    if (pass.length < 6) return showAuthError('Password must be at least 6 characters.');
    const users = getUsers();
    if (authMode === 'signup') {
      const name = ($('auth-name').value || '').trim();
      if (!name) return showAuthError('Please enter your full name.');
      for (let i = 0; i < users.length; i++) {
        if (users[i].email === email) return showAuthError('An account with this email already exists. Try logging in.');
      }
      // Step 1 done — issue the code and hand over to the verification view.
      showAuthError('');
      beginOtpVerification(name, email, hashPass(pass));
    } else {
      let match = null;
      for (let i = 0; i < users.length; i++) {
        if (users[i].email === email) { match = users[i]; break; }
      }
      if (!match) return showAuthError('No account found with this email. Sign up first.');
      if (match.pass !== hashPass(pass)) return showAuthError('Incorrect password. Please try again.');
      grantLoginEntitlements(email);
      setSession(email); // reloads
    }
  }
  function initAuthUi() {
    const modal = $('auth-modal');
    if (!modal) return;
    $('login-btn').addEventListener('click', function (e) { e.preventDefault(); openAuthModal('login'); });
    $('signup-btn').addEventListener('click', function () { openAuthModal('signup'); });
    $('auth-tab-login').addEventListener('click', function () { setAuthMode('login'); });
    $('auth-tab-signup').addEventListener('click', function () { setAuthMode('signup'); });
    $('auth-modal-close').addEventListener('click', closeAuthModal);
    $('auth-form').addEventListener('submit', handleAuthSubmit);
    // Step 2 — email OTP verification
    const otpForm = $('otp-form');
    if (otpForm) otpForm.addEventListener('submit', handleOtpSubmit);
    const resendBtn = $('otp-resend');
    if (resendBtn) resendBtn.addEventListener('click', resendOtp);
    const codeInput = $('otp-code');
    if (codeInput) {
      // digits only, never more than 6
      codeInput.addEventListener('input', function () {
        const digits = this.value.replace(/\D/g, '').slice(0, 6);
        if (digits !== this.value) this.value = digits;
      });
    }
    modal.addEventListener('click', function (e) { if (e.target === modal) closeAuthModal(); });
    $('logout-btn').addEventListener('click', function () {
      if (window.confirm('Log out? Your data stays saved in this browser under your account.')) {
        rawDel(LOGGED_IN_KEY);
        setSession('');
      }
    });
    // Access / AI-credit gate modal
    const gate = $('gate-modal');
    if (gate) {
      if ($('gate-close')) $('gate-close').addEventListener('click', closeGateModal);
      if ($('gate-login')) $('gate-login').addEventListener('click', function () { closeGateModal(); openAuthModal('login'); });
      if ($('gate-signup')) $('gate-signup').addEventListener('click', function () { closeGateModal(); openAuthModal('signup'); });
      gate.addEventListener('click', function (e) { if (e.target === gate) closeGateModal(); });
    }
    initAccessState();
    renderAuthUi();
    maybeShowOnboarding();
  }

  /* ── Toast notifications (import/export feedback) ───────────── */
  let toastTimer = null;
  function showToast(msg, kind) {
    let el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      document.body.appendChild(el);
    }
    el.className = 'app-toast show' + (kind === 'error' ? ' error' : '');
    el.textContent = msg;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3800);
  }

  /* ── Confirmation dialog ────────────────────────────────────────
     ONE prompt for every reset / destructive action in the app.

     confirmAction({ title, message, confirmLabel, cancelLabel, danger })
     resolves true only when the user explicitly confirms, so handlers read
     as `if (!(await confirmAction({...}))) return;`. It falls back to
     window.confirm when the dialog markup is absent (e.g. an older page
     cached from a CDN) so a missing modal can never silently allow a wipe.

     Escape and a click on the backdrop count as Cancel — the safe answer is
     always the default. */
  let confirmResolver = null;

  function confirmAction(opts) {
    const o = opts || {};
    const message = o.message || 'This cannot be undone.';
    const modal = $('confirm-modal');
    const titleEl = $('confirm-title');
    const textEl = $('confirm-text');
    const okBtn = $('confirm-ok');
    const cancelBtn = $('confirm-cancel');
    if (!modal || !okBtn || !cancelBtn) return Promise.resolve(window.confirm(message));

    // A second prompt while one is open must not leave the first unresolved.
    if (confirmResolver) { const prev = confirmResolver; confirmResolver = null; prev(false); }

    if (titleEl) titleEl.textContent = o.title || 'Are you sure?';
    if (textEl) textEl.textContent = message;
    okBtn.textContent = o.confirmLabel || 'Confirm';
    cancelBtn.textContent = o.cancelLabel || 'Cancel';
    okBtn.classList.toggle('btn-danger', !!o.danger);
    modal.hidden = false;
    try { okBtn.focus(); } catch (e) { /* ignore */ }

    return new Promise(function (resolve) {
      const finish = function (val) {
        if (!confirmResolver) return;
        confirmResolver = null;
        document.removeEventListener('keydown', onKey, true);
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        modal.hidden = true;
        resolve(val);
      };
      const onOk = function () { finish(true); };
      const onCancel = function () { finish(false); };
      const onBackdrop = function (e) { if (e.target === modal) finish(false); };
      const onKey = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        // Enter confirms only when the confirm button has focus, so a stray
        // Enter cannot wipe data.
        else if (e.key === 'Enter' && document.activeElement === okBtn) { e.preventDefault(); finish(true); }
      };
      confirmResolver = finish;
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey, true);
    });
  }

  /* ── First-time "How to use" onboarding modal ────────────────── */
  // Shows once per browser (localStorage 'hasSeenOnboarding'), and again
  // on first login/signup for brand-new accounts.
  const ONBOARDING_KEY = 'hasSeenOnboarding';
  let onboardIdx = 0;

  function onboardSteps() {
    return Array.prototype.slice.call(document.querySelectorAll('#onboard-steps .onboard-step'));
  }
  function renderOnboardStep() {
    const steps = onboardSteps();
    const dots = $('onboard-dots');
    for (let i = 0; i < steps.length; i++) steps[i].classList.toggle('active', i === onboardIdx);
    if (dots) {
      dots.innerHTML = steps.map(function (_, i) {
        return '<span class="onboard-dot' + (i === onboardIdx ? ' active' : '') + '"></span>';
      }).join('');
    }
    const back = $('onboard-back');
    const next = $('onboard-next');
    const count = $('onboard-count');
    if (back) {
      // 'Previous' stays visible but inert on step 1 (per spec: Previous + Next always shown)
      back.classList.toggle('hidden-step', onboardIdx === 0);
    }
    if (count) count.textContent = 'Step ' + (onboardIdx + 1) + ' of ' + steps.length;
    const skip = $('onboard-skip');
    if (skip) skip.hidden = (onboardIdx === steps.length - 1); // no Skip on the final step
    if (next) next.textContent = (onboardIdx === steps.length - 1) ? 'Get Started' : 'Next';
  }
  function openOnboarding() {
    onboardIdx = 0;
    renderOnboardStep();
    $('onboarding-modal').hidden = false;
  }
  function closeOnboarding(markSeen) {
    $('onboarding-modal').hidden = true;
    if (markSeen) {
      try { window.localStorage.setItem(ONBOARDING_KEY, '1'); } catch (e) { /* ignore */ }
    }
  }
  function maybeShowOnboarding() {
    let seen = false;
    try { seen = !!window.localStorage.getItem(ONBOARDING_KEY); } catch (e) { /* ignore */ }
    if (!seen) openOnboarding();
  }
  function initOnboarding() {
    const modal = $('onboarding-modal');
    if (!modal) return;
    // Sidebar 'How to use' — always available, even after onboarding is done.
    const helpBtn = $('sidebar-help');
    if (helpBtn) helpBtn.addEventListener('click', openOnboarding);
    $('onboard-back').addEventListener('click', function () {
      if (onboardIdx > 0) { onboardIdx--; renderOnboardStep(); }
    });
    $('onboard-next').addEventListener('click', function () {
      const steps = onboardSteps();
      if (onboardIdx < steps.length - 1) { onboardIdx++; renderOnboardStep(); }
      else closeOnboarding(true);
    });
    $('onboard-skip').addEventListener('click', function () { closeOnboarding(true); });
    $('onboard-close').addEventListener('click', function () { closeOnboarding(true); });
    modal.addEventListener('click', function (e) { if (e.target === modal) closeOnboarding(true); });
  }

  const TYPE_LABELS = {
    'new-feature': 'New feature',
    'change': 'Change to agreed work',
    'extra-revision': 'Extra revision',
    'other': 'Other'
  };

  // Flash a copy button: swap its label for 'Copied!', then restore the
  // original markup (SVG icon included) — icon buttons keep their glyph.
  function flashCopied(btn) {
    const prev = btn.innerHTML;
    btn.textContent = 'Copied!';
    window.setTimeout(function () { btn.innerHTML = prev; }, 2000);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Raw parse. Returns NaN for anything unusable — callers that need an
     "is this blank?" distinction use this; callers feeding a CALCULATION
     use num0() below so a typo can never become NaN in a total.

     Whitespace is stripped along with thousands separators: "100 00" is a
     typo for 10000, not a broken number, so Number() must not see the space
     and hand back NaN. A string that is nothing BUT whitespace still parses
     as blank (NaN) rather than quietly becoming 0, so "empty" and "zero"
     stay distinguishable for every caller that cares. */
  function num(v) {
    if (v === '' || v === null || v === undefined) return NaN;
    const cleaned = String(v).replace(/[,\s]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '+') return NaN;
    return Number(cleaned);
  }

  // Anything -> a finite number, 0 when empty/invalid. Every money or
  // quantity that reaches a total, a PDF cell or a spreadsheet cell goes
  // through here (or through Calc.toNum, which is the same rule).
  function num0(v) { return Calc.toNum(v, 0); }

  // The characters a numeric field is allowed to contain, applied as the
  // user types AND to anything pasted in.
  function numericSafeText(raw, allowNegative) {
    return Calc.sanitizeNumericText(raw, allowNegative);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Defensive displays: never show "$0.00/hr", "NaN%" or a misleading
  // tiny "0.1%" when there is no usable baseline (price/hours missing or 0).
  // Rates are stored canonically as HOURLY; fmtRateU converts to the chosen
  // display unit (days → ×8) and picks the /day or /hr suffix, so the shown
  // daily rate always equals value ÷ total days.
  function rateSuffix(unit) { return unit === 'days' ? '/day' : '/hr'; }
  function fmtRateU(canonicalRate, currency, unit) {
    if (!(canonicalRate > 0)) return '\u2014';
    return Calc.fmtMoney(rateForDisplay(canonicalRate, unit), currency) + rateSuffix(unit);
  }
  function displayRateU(canonicalRate, currency, unit) {
    return fmtRateU(canonicalRate, currency, unit);
  }
  function displayRate(rate, currency) {
    return rate > 0 ? Calc.fmtRate(rate, currency) : '\u2014';
  }

  function displayDrop(pct, hasBaseline) {
    if (!hasBaseline) return '\u2014';
    return pct > 0 ? Calc.fmtPct(pct) : '0%';
  }

  /* ── Time units ─────────────────────────────────────────────── */
  // State stores canonical HOURS; 'days' means a standard 8-hour working day.
  function normUnit(u) { return u === 'days' ? 'days' : 'hours'; }

  // "16h" in hours mode; "2d (16 h)" in days mode — unambiguous in messages.
  function durLabel(hours, unit) {
    const label = Calc.fmtDur(hours, unit);
    return unit === 'days' ? label + ' (' + Calc.fmtHours(hours) + ' h)' : label;
  }  /* ── Theme (dark ⇄ light, persisted) ─────────── */
  const THEME_KEY = 'cm-theme';
  // Applies BOTH mechanisms for compatibility: data-theme on <html> (the
  // stylesheet's selector) and the 'light-theme' class on <body>.
  function applyTheme(theme) {
    const light = theme === 'light';
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark');
    document.body.classList.toggle('light-theme', light);
    const tt = $('theme-toggle');
    if (tt) {
      tt.innerHTML = light
        ? '<span class="nav-icon" data-icon="moon" aria-hidden="true"></span><span>Toggle theme</span>'
        : '<span class="nav-icon" data-icon="sun" aria-hidden="true"></span><span>Toggle theme</span>';
      hydrateIcons(tt);
    }
    const st = $('theme-toggle-settings');
    if (st) st.textContent = light ? 'Switch to Dark mode' : 'Switch to Light mode';
    try { localStorage.setItem(THEME_KEY, light ? 'light' : 'dark'); } catch (e) { /* ignore */ }
    // Screen readers follow the sidebar button's meaning, not its wording.
    if (tt && tt.setAttribute) tt.setAttribute('aria-pressed', light ? 'true' : 'false');
  }

  /* The ONE source of theme truth is the data-theme attribute on <html>
     (mirrored to <body class="light-theme"> and persisted under THEME_KEY by
     applyTheme). Both toggles — the sidebar button and the Appearance
     Settings switch — call exactly this, so they can never disagree. */
  function themeNow() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function toggleTheme() {
    applyTheme(themeNow() === 'light' ? 'dark' : 'light');
  }

  /* ── Custom accent color (CSS variables, persisted) ── */
  const ACCENT_KEY = 'cm-accent-v1';
  const BG_KEY = 'cm-bg-v1';
  const BG_PRESETS = ['#000000', '#0a0f1d', '#111c38', '#162347', '#111b26'];
  function applyAccent(hex) {
    const root = document.documentElement.style;
    if (!hex) {
      root.removeProperty('--accent');
      root.removeProperty('--accent-hover');
      root.removeProperty('--accent-ink');
      root.removeProperty('--accent-soft');
      root.removeProperty('--accent-line');
      root.removeProperty('--glow');
    } else {
      const rgb = hex.replace('#', '');
      const n = parseInt(rgb.length === 3 ? rgb.split('').map(function (c) { return c + c; }).join('') : rgb, 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      root.setProperty('--accent', hex);
      root.setProperty('--accent-hover', hex);
      root.setProperty('--accent-ink', lum > 0.6 ? '#000000' : '#ffffff');
      root.setProperty('--accent-soft', 'rgba(' + r + ',' + g + ',' + b + ',0.12)');
      root.setProperty('--accent-line', 'rgba(' + r + ',' + g + ',' + b + ',0.55)');
      root.setProperty('--glow', '0 0 22px rgba(' + r + ',' + g + ',' + b + ',0.35)');
    }
    const swatches = document.querySelectorAll('.accent-swatch');
    for (let i = 0; i < swatches.length; i++) {
      swatches[i].classList.toggle('active', swatches[i].getAttribute('data-accent') === (hex || 'default'));
    }
  }
  function applyBg(hex) {
    const root = document.documentElement.style;
    if (!hex) { root.removeProperty('--bg'); root.removeProperty('--bg-overlay'); }
    else root.setProperty('--bg', hex);
    const sw = document.querySelectorAll('.bg-preset');
    for (let i = 0; i < sw.length; i++) {
      sw[i].classList.toggle('active', sw[i].getAttribute('data-bg') === hex);
    }
  }
  function initAccentBg() {
    let savedAccent = '';
    let savedBg = '';
    try { savedAccent = localStorage.getItem(ACCENT_KEY) || ''; } catch (e) { /* ignore */ }
    try { savedBg = localStorage.getItem(BG_KEY) || ''; } catch (e) { /* ignore */ }
    applyAccent(savedAccent || '');
    applyBg(savedBg || '');
    const ap = $('accent-picker'), bp = $('bgpicker');
    if (ap) ap.value = savedAccent || '#ffffff';
    if (bp) bp.value = savedBg || '#000000';
  }

  /* ── Sidebar (collapsible rail on desktop; overlay drawer under 1025px) ──
     Two states, two mechanisms: on desktop the rail is taken out of the way
     with `sidebar-collapsed` (the main column animates across to fill the
     gap); under 1025px it is an off-canvas drawer driven by `sidebar-open`.
     The collapsed/expanded choice is remembered across reloads. */
  const SIDEBAR_KEY = 'cm-sidebar-v1';

  function isDesktopNav() {
    return !!(window.matchMedia && window.matchMedia('(min-width: 1025px)').matches);
  }

  /* Paints everything that depends on the collapsed state: the body class
     (which drives the CSS), the rail's own `.collapsed` class, the toggle's
     label + aria state, and `inert` so a hidden rail cannot take focus. */
  function syncSidebarState() {
    const desktop = isDesktopNav();
    const collapsed = desktop && document.body.classList.contains('sidebar-collapsed');
    const sb = $('sidebar');
    if (sb) {
      sb.classList.toggle('collapsed', collapsed);
      if ('inert' in sb) sb.inert = collapsed;
      if (collapsed) sb.setAttribute('aria-hidden', 'true');
      else sb.removeAttribute('aria-hidden');
    }
    const toggle = $('sidebar-collapse');
    if (toggle) {
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      // The visible label is a fixed "Menu" (rename of "Collapse menu"); the
      // action it will take is carried by the accessible name + tooltip.
      const action = desktop
        ? (collapsed ? 'expand the navigation' : 'collapse the navigation')
        : 'close the navigation';
      toggle.setAttribute('aria-label', 'Menu — ' + action);
      toggle.setAttribute('title', 'Menu — ' + action);
    }
    const reopen = $('sidebar-reopen');
    if (reopen) reopen.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
  }

  function toggleSidebar() {
    if (isDesktopNav()) {
      const next = !document.body.classList.contains('sidebar-collapsed');
      document.body.classList.toggle('sidebar-collapsed', next);
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0'); } catch (e) { /* ignore */ }
    } else {
      document.body.classList.toggle('sidebar-open');
    }
    syncSidebarState();
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
  }

  /* Restore the remembered rail state and keep it honest across resizes
     (a rail collapsed on desktop must not leave the drawer inert on mobile). */
  function initSidebarState() {
    let saved = '';
    try { saved = localStorage.getItem(SIDEBAR_KEY) || ''; } catch (e) { /* ignore */ }
    document.body.classList.toggle('sidebar-collapsed', saved === '1');
    syncSidebarState();
    window.addEventListener('resize', function () {
      if (isDesktopNav()) closeSidebar();
      syncSidebarState();
    });
  }

  /* ── Collapsible nav sections (WORKSPACE / ERP & DATA / RECORDS & BACKUP / MORE) ──
     Each section toggles independently and its choice is remembered per key,
     so collapsing MORE never touches ERP & DATA. Only explicit toggles are
     written to storage, which keeps "what a new user sees" fixed at the
     defaults below rather than pinned to whatever the last click did. */
  const NAV_SECTIONS_KEY = 'nexora_nav_sections_v1';
  const NAV_SECTION_DEFAULTS = { workspace: true, erp: true, records: true, more: true, configuration: true };

  function readNavSectionStore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(NAV_SECTIONS_KEY) || '{}'); } catch (e) { saved = null; }
    return (saved && typeof saved === 'object') ? saved : {};
  }

  // Effective state: remembered value when there is one, otherwise the default.
  function navSectionState() {
    const saved = readNavSectionStore();
    const state = {};
    const keys = Object.keys(NAV_SECTION_DEFAULTS);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      state[k] = Object.prototype.hasOwnProperty.call(saved, k)
        ? saved[k] !== false
        : NAV_SECTION_DEFAULTS[k];
    }
    return state;
  }

  function paintNavSections(state) {
    const secs = document.querySelectorAll('.nav-section');
    for (let i = 0; i < secs.length; i++) {
      const sec = secs[i];
      const open = state[sec.getAttribute('data-nav-section')] !== false;
      sec.classList.toggle('collapsed', !open);
      const head = sec.querySelector('.nav-group-label');
      if (head) {
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        head.setAttribute('title', (open ? 'Hide' : 'Show') + ' ' +
          (head.firstElementChild ? head.firstElementChild.textContent.trim() : 'section'));
      }
      // `hidden` removes the links from the tab order too, so a collapsed
      // section cannot be reached by keyboard — collapsed means collapsed.
      const items = sec.querySelector('.nav-group-items');
      if (items) items.hidden = !open;
    }
  }

  function toggleNavSection(key) {
    if (!key || !Object.prototype.hasOwnProperty.call(NAV_SECTION_DEFAULTS, key)) return;
    const state = navSectionState();
    state[key] = !state[key];
    const saved = readNavSectionStore();
    saved[key] = state[key];
    try { localStorage.setItem(NAV_SECTIONS_KEY, JSON.stringify(saved)); } catch (e) { /* ignore */ }
    paintNavSections(state);
  }

  function initNavSections() {
    // Paint first: the header markup ships expanded so the nav is usable even
    // before this runs, then the remembered state is applied on top.
    paintNavSections(navSectionState());
    const nav = $('sidebar-nav');
    if (!nav) return;
    nav.addEventListener('click', function (e) {
      const t = e.target;
      const head = (t && t.closest) ? t.closest('.nav-group-label') : null;
      if (!head) return;
      e.preventDefault();
      toggleNavSection(head.getAttribute('data-nav-toggle'));
    });
  }

  /* ── Comma formatting for numeric inputs (display only) ── */
  // User types digits; commas are painted on blur and stripped again on
  // focus, so the underlying value never contains separators.
  function commaGroups(s) {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function paintNumericInput(el) {
    const v = el.value.replace(/,/g, '').trim();
    if (v === '' || isNaN(Number(v))) return;
    const parts = v.split('.');
    el.value = commaGroups(parts[0]) + (parts.length === 2 ? '.' + parts[1] : '');
  }

  // Delegated: works for static inputs AND dynamically rendered table rows
  // (focusin/focusout bubble, unlike focus/blur).
  function isNumericField(el) {
    return !!(el && el.getAttribute && el.getAttribute('data-numeric') === '1');
  }

  // Field kinds: 'int' accepts WHOLE numbers only (digits, no decimal point,
  // no sign) — used by the Item Key / SKU; 'num' accepts a decimal number.
  function numericFieldKind(el) {
    if (!el || !el.getAttribute) return null;
    if (el.getAttribute('data-int') === '1') return 'int';
    if (el.getAttribute('data-numeric') === '1') return 'num';
    return null;
  }

  /* Characters that must never enter a numeric field. Modifier and control
     keys always pass so shortcuts, tabbing, undo and backspace keep working;
     the numeric keypad's own keys are covered by the length check. */
  function isBlockedNumericKey(e, kind) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key.length !== 1) return false;              // Shift, Arrow, Backspace, F5…
    if (/[0-9]/.test(e.key)) return false;
    if (kind === 'int') return true;                   // whole numbers only: no '.', no '-'
    if (e.key === '.') return e.target.value.indexOf('.') !== -1;  // one decimal point only
    if (e.key === '-' || e.key === '+') return true;   // no negatives in these fields
    return true;                                       // letters, spaces, $, %, e, etc.
  }

  /* Applied on every keystroke AND on paste/drop, so a stray space in
     "100 00" is stripped before it can ever reach a calculation. */
  function sanitizeNumericField(el) {
    const kind = numericFieldKind(el);
    if (!kind) return false;
    const cleaned = kind === 'int' ? String(el.value).replace(/[^0-9]/g, '') : numericSafeText(el.value, false);
    if (cleaned === el.value) return false;
    const atEnd = el.selectionStart === null || el.selectionStart >= el.value.length;
    const caret = el.selectionStart === null ? cleaned.length : Math.max(0, el.selectionStart - (el.value.length - cleaned.length));
    el.value = cleaned;
    try { if (atEnd) el.setSelectionRange(cleaned.length, cleaned.length);
      else el.setSelectionRange(caret, caret); } catch (err) { /* not a text input */ }
    return true;
  }

  function formatAllNumericInputs() {
    document.addEventListener('focusin', function (e) {
      if (isNumericField(e.target)) {
        e.target.value = String(e.target.value).replace(/,/g, '');
      }
    });
    document.addEventListener('focusout', function (e) {
      if (isNumericField(e.target)) {
        paintNumericInput(e.target);
      }
    });
    // 1 ─ block invalid characters at the point of typing.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Process' || e.keyCode === 229) return;   // IME composition
      const kind = numericFieldKind(e.target);
      if (!kind) return;
      if (isBlockedNumericKey(e, kind)) e.preventDefault();
    }, true);
    // 2 ─ scrub whatever still gets through (paste, drop, autofill, a
    //     programmatic value, or a browser that ignored the key filter).
    document.addEventListener('input', function (e) {
      sanitizeNumericField(e.target);
    }, true);
    document.addEventListener('paste', function (e) {
      const kind = numericFieldKind(e.target);
      if (!kind) return;
      const text = e.clipboardData ? e.clipboardData.getData('text') : '';
      if (!text) return;
      e.preventDefault();
      const cleaned = kind === 'int' ? text.replace(/[^0-9]/g, '') : numericSafeText(text, false);
      const start = e.target.selectionStart === null ? e.target.value.length : e.target.selectionStart;
      const end = e.target.selectionEnd === null ? start : e.target.selectionEnd;
      const next = e.target.value.slice(0, start) + cleaned + e.target.value.slice(end);
      e.target.value = kind === 'int' ? String(next).replace(/[^0-9]/g, '') : numericSafeText(next, false);
      e.target.dispatchEvent(new Event('input', { bubbles: true }));
    }, true);
  }

  /* ── Rate unit display: stored canonical hourly ⇄ entered unit ── */
  // In days mode the user enters a DAILY rate; convert for display/storage.
  function rateForDisplay(hourlyRate, unit) {
    const r = Number(hourlyRate) || 0;
    return unit === 'days' ? r * Calc.HOURS_PER_DAY : r;
  }

  /* ── Dynamic labels/placeholders for the Hours | Days toggles ── */
  function updateUnitLabels() {
    const pUnit = normUnit($('p-hours-unit').value);
    const rUnit = normUnit($('r-hours-unit').value);
    $('p-hours-label').textContent = pUnit === 'days' ? 'Estimated days' : 'Estimated hours';
    $('p-hours').placeholder = pUnit === 'days' ? 'e.g. 2' : 'e.g. 10';
    $('p-rate-label').textContent = pUnit === 'days' ? 'Target daily rate' : 'Target hourly rate';
    $('p-rate').placeholder = pUnit === 'days' ? 'e.g. 400/day' : 'e.g. 60/hr';
    $('r-hours-label').textContent = rUnit === 'days' ? 'Extra days' : 'Extra hours';
    $('r-hours').placeholder = rUnit === 'days' ? 'e.g. 2' : 'e.g. 5';
    $('r-rate-label').textContent = rUnit === 'days' ? 'Charge rate /day' : 'Charge rate /hr';
    $('r-rate').placeholder = rUnit === 'days' ? 'e.g. 400/day' : 'e.g. 80/hr';
  }

  /* ── Home: compact tool selector bar ─────────────────── */
  // Rich per-tool emoji used in the Calculators & Utilities grid badges
  // (the sidebar/nav keeps strict monochrome SVG icons — emojis live only
  // inside the square tool-card icon badges).
  const TOOL_EMOJI = {
    'scope-guard': '\uD83D\uDD2E', // 🔮 crystal ball
    'qr': '\uD83D\uDCD0', // 📐 set square
    'boq': '\uD83D\uDCCB', // 📋 clipboard / quotation
    'pricing': '\uD83D\uDCCA', // 📊 bar chart
    'invoice': '\uD83D\uDCC4', // 📄 page
    'duty': '\uD83D\uDCE6', // 📦 package
    'variation': '\uD83D\uDD00', // 🔀 shuffle / process map
    'breakeven': '\u2696\uFE0F', // ⚖️ balance scale
    'fx': '\uD83D\uDCB1', // 💱 currency exchange
    'gpa': '\uD83C\uDF93', // 🎓 graduation cap
    'retainer': '\uD83E\uDD1D', // 🤝 handshake
    'delay': '\u23F1\uFE0F' // ⏱️ stopwatch
  };

  const TOOLS = {
    'scope-guard': {
      badge: 'Tool #01',
      icon: 'target',
      short: 'Scope Guard',
      blurb: 'Price the extra work a client asks for and send a change order.',
      name: 'Project Change & Scope Calculator',
      desc: 'The client asks for \u201cjust one more thing.\u201d See what it really costs, watch your effective hourly rate drop in real time, and send a professional change order in seconds.',
      meta: 'Private · works offline',
      available: true
    },
    'qr': {
      badge: 'Tool #02',
      icon: 'ruler',
      short: 'Qty & Rate',
      blurb: 'Turn quantities and rates into line amounts and a running total.',
      name: 'Quantity & Rate Calculator',
      desc: 'Enter quantity, unit and rate for each line item — amounts and the running total update instantly. Built for businesses and teams who are tired of doing this in Excel.',
      meta: 'Private · works offline',
      available: true
    },
    'boq': {
      badge: 'Tool #03',
      icon: 'doc',
      short: 'Quotation',
      blurb: 'Build an itemised quotation with discount and VAT, then export a PDF.',
      name: 'Quotation',
      desc: 'Build a client quotation with an itemized bill of quantities, discount and VAT, then download it as a formal PDF. Made for businesses, teams, and independent professionals.',
      meta: 'Private · works offline',
      available: true
    },
    'pricing': {
      badge: 'Tool #04',
      icon: 'chart',
      short: 'Pricing',
      blurb: 'Work out a profitable selling price from cost and margin.',
      name: 'Margin & Markup Pricing Calculator',
      desc: 'Base cost plus overhead allocation, a margin or markup target, and the profitable selling price — with a copyable summary. Price with confidence instead of gut feel.',
      meta: 'Private · works offline',
      available: true
    },
    'invoice': {
      badge: 'Tool #05',
      icon: 'invoice',
      short: 'Invoice',
      blurb: 'Create quotations, invoices and delivery notes with your letterhead.',
      name: 'Smart Invoice & Document Builder',
      desc: 'Build Quotations, Proforma Invoices, Commercial/Tax Invoices and Delivery Notes with your own letterhead and a one-click PDF.',
      meta: 'Private · works offline',
      available: true
    },
    'duty': {
      badge: 'Tool #06',
      icon: 'globe',
      short: 'Import Tax',
      blurb: 'Work out duty, taxes and landed cost per unit on an import.',
      name: 'Import Tax & Landed Cost Calculator',
      desc: 'Enter the CIF value and your duty, PAL, CESS, SSCL and VAT percentages — get the total tax payable, full component breakdown and landed cost per unit instantly.',
      meta: 'Private · works offline',
      available: true
    },
    'variation': {
      badge: 'Tool #07',
      icon: 'list',
      short: 'Variation',
      blurb: 'Log site extras and see the revised contract value.',
      name: 'Variation & Change Order Generator',
      desc: 'Log additional site work with material and labor costs, see the revised contract value and % increase, then export a formal variation PDF for client approval.',
      meta: 'Private · works offline',
      available: true
    },
    'breakeven': {
      badge: 'Tool #08',
      icon: 'scale',
      short: 'Breakeven',
      blurb: 'Find the hourly rate that covers your costs and target income.',
      name: 'Freelance Rate & Overhead Breakeven Calculator',
      desc: 'Target income plus overhead and taxes, minus every unbilled admin hour — get the minimum hourly and daily rate that keeps you out of the red.',
      meta: 'Private · works offline',
      available: true
    },
    'fx': {
      badge: 'Tool #09',
      icon: 'exchange',
      short: 'FX & Fees',
      blurb: 'Invoice enough to still receive your target after transfer fees.',
      name: 'Cross-Border FX & Fee Adjuster',
      desc: 'Invoice the exact amount so you still receive your target payout after Stripe, PayPal, Wise or wire fees — with the full fee-loss breakdown.',
      meta: 'Private · works offline',
      available: true
    },
    'gpa': {
      badge: 'Tool #10',
      icon: 'grad',
      short: 'GPA Planner',
      blurb: 'See the grades you still need to hit your target GPA.',
      name: 'Academic GPA & Target Grade Planner',
      desc: 'See the average you must hold across remaining credits to graduate at your target GPA — and the score each weighted assignment needs.',
      meta: 'Private · works offline',
      available: true
    },
    'retainer': {
      badge: 'Tool #11',
      icon: 'handshake',
      short: 'Retainer',
      blurb: 'Price a monthly retainer with hours, margin and SLA.',
      name: 'Retainer & SLA Pricing Estimator',
      desc: 'Price a monthly client retainer: included hours, blended rate, overhead, target margin and an SLA surcharge — with the annual contract value.',
      meta: 'Private · works offline',
      available: true
    },
    'delay': {
      badge: 'Tool #12',
      icon: 'clock',
      short: 'Delay Impact',
      blurb: 'Estimate delay penalties and overhead exposure before you sign.',
      name: 'Project Delay & Damages Impact Calculator',
      origName: 'Project Delay & Damages Impact Calculator',
      navName: 'Delay Impact',
      desc: 'Forecast delay penalties and extended overhead on a contract — daily penalty %, cap, and the total damages exposure before you sign.',
      meta: 'Private · works offline',
      available: true
    }
  };

  let currentTool = 'scope-guard'; // tool selected in the landing preview

  const TOOL_VIEWS = { 'scope-guard': 'tool', 'qr': 'qr', 'boq': 'boq', 'pricing': 'pricing', 'invoice': 'invoice', 'duty': 'duty', 'variation': 'variation', 'breakeven': 'breakeven', 'fx': 'fx', 'gpa': 'gpa', 'retainer': 'retainer', 'delay': 'delay' };
  function toolViewFor(id) { return TOOL_VIEWS[id] || 'tool'; }

  /* Which tool the user last reached for. The panels that used to mirror it
     (the icon-grid slot styling and the single preview card) are retired —
     Other Utilities renders one card per tool and navigates directly — so
     this is now pure state, kept for the launch handlers. */
  function selectTool(id) {
    if (!TOOLS[id]) return;
    currentTool = id;
  }

  /* ── View switching (Home ↔ tool) ──────────────────────────
     The active view is mirrored into the URL fragment (#/erp, #/home, …)
     so it is part of the browser's own state rather than a variable that
     dies on reload. That is what makes F5 land on the page you were
     actually looking at. No fragment at all → Home; an unrecognised one
     is ignored rather than blanking every view. */
  const VIEW_NAMES = ['home', 'erp', 'db', 'utilities', 'tool', 'qr', 'boq', 'pricing',
    'invoice', 'duty', 'variation', 'breakeven', 'fx', 'gpa', 'retainer', 'delay',
    'history', 'settings', 'appearance', 'backup', 'plans'];
  const DEFAULT_VIEW = 'home';
  let currentView = '';

  function viewFromHash(hash) {
    const raw = String(hash === undefined ? window.location.hash : hash)
      .replace(/^#\/?/, '').trim().toLowerCase();
    return VIEW_NAMES.indexOf(raw) !== -1 ? raw : '';
  }

  /* Reflect the view in the URL. replaceState, not a hash assignment, so
     moving between views does not bury the previous page under a stack of
     history entries — the fragment is a bookmark of where you are, not a
     trail. Some browsers refuse replaceState on file:// URLs, hence the
     fallback. */
  function syncViewHash(name) {
    const want = '#/' + name;
    if (window.location.hash === want) return;
    try {
      window.history.replaceState(null, '', want);
    } catch (e) {
      try { window.location.hash = want; } catch (e2) { /* ignore */ }
    }
  }

  function showView(name) {
    if (VIEW_NAMES.indexOf(name) === -1) name = DEFAULT_VIEW;
    currentView = name;
    syncViewHash(name);
    $('erp-view').hidden = name !== 'erp';
    $('db-view').hidden = name !== 'db';
    $('utilities-view').hidden = name !== 'utilities';
    $('home-view').hidden = name !== 'home';
    $('tool-view').hidden = name !== 'tool';
    $('qr-view').hidden = name !== 'qr';
    $('boq-view').hidden = name !== 'boq';
    $('pricing-view').hidden = name !== 'pricing';
    $('invoice-view').hidden = name !== 'invoice';
    $('duty-view').hidden = name !== 'duty';
    $('variation-view').hidden = name !== 'variation';
    $('breakeven-view').hidden = name !== 'breakeven';
    $('fx-view').hidden = name !== 'fx';
    $('gpa-view').hidden = name !== 'gpa';
    $('retainer-view').hidden = name !== 'retainer';
    $('delay-view').hidden = name !== 'delay';
    $('history-view').hidden = name !== 'history';
    $('settings-view').hidden = name !== 'settings';
    $('appearance-view').hidden = name !== 'appearance';
    $('backup-view').hidden = name !== 'backup';
    $('plans-section').hidden = name !== 'plans';
    // Active-item glowing pill indicators on the sidebar navigation
    const navIds = { 'nav-home': ['home', 'utilities'], 'sidebar-erp': ['erp'], 'sidebar-db': ['db'], 'sidebar-settings-nav': ['settings'], 'sidebar-history': ['history'], 'sidebar-appearance': ['appearance'], 'sidebar-utilities': ['utilities'], 'sidebar-backup': ['backup'], 'sidebar-plans': ['plans'] };
    for (const nid in navIds) {
      const el = document.getElementById(nid);
      if (el) el.classList.toggle('active', navIds[nid].indexOf(name) !== -1);
    }
    // Each calculator view counts as tool usage for the hub grid
    for (const tid in TOOL_VIEWS) {
      if (TOOL_VIEWS[tid] === name) recordUsage(tid);
    }
    // The card grid lives on Other Utilities now, so refresh it there (a
    // launch bumps that tool's Last used / Usage while you are on its page).
    if (name === 'utilities') renderToolCards();
    if (name === 'home') {
      renderKpis();
      renderActivity();
    }
    if (name === 'backup') renderStorageStatus();
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── State ────────────────────────────────────────────────────── */
  const STORAGE_KEY = 'fsg-state-v1';

  function emptyState() {
    return { project: null, requests: [] };
  }

  // Projects saved before the ISO-code change stored bare symbols ('$', 'Rs',
  // '€', '£', '₹'); map them to their modern codes so old data still works.
  const LEGACY_CURRENCIES = { '$': 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR', 'Rs': 'LKR' };

  function normalizeProject(project) {
    if (!project) return null;
    return Object.assign({}, project, {
      currency: LEGACY_CURRENCIES[project.currency] || project.currency || 'USD',
      hoursUnit: normUnit(project.hoursUnit)
    });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyState();
      return {
        project: normalizeProject(parsed.project),
        requests: Array.isArray(parsed.requests) ? parsed.requests : []
      };
    } catch (e) {
      return emptyState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage may be unavailable (private mode) — app still works in-memory */ }
  }

  let state = loadState();
  let editingId = null; // id of a request being edited in the form

  const C = (() => { // shorthand: computations for the current project
    const p = state.project;
    if (!p) return null;
    const orig = Calc.originalEffectiveRate(p.price, p.hours);
    const committed = Calc.committedHours(state.requests);
    const committedValue = Calc.committedValue(state.requests);
    const proj = Calc.projectedEffectiveRate(p.price, p.hours, committed, committedValue);
    const drop = Calc.rateDropPct(orig, proj);
    const unbilled = Calc.unbilledValue(state.requests);
    return {
      p: p,
      orig: orig,
      committed: committed,
      committedValue: committedValue,
      proj: proj,
      drop: drop,
      unbilled: unbilled
    };
  });

  /* ── Render: setup ────────────────────────────────────────────── */
  function renderSetup() {
    const p = state.project;
    const formWrap = $('setup-form-wrap');
    const summary = $('setup-summary');
    const hint = $('setup-hint');

    $('request-section').hidden = !p; // Add Request lives on the left, below setup
    if (!p) {
      hint.hidden = false;
      formWrap.hidden = false;
      summary.hidden = true;
      $('setup-cancel').hidden = true;
      return;
    }

    hint.hidden = true;
    formWrap.hidden = true;
    summary.hidden = false;

    const c = C();
    const name = p.name && p.name.trim() ? p.name.trim() : 'Untitled project';
    const target = (p.targetRate !== null && p.targetRate !== undefined && p.targetRate > 0)
      ? fmtRateU(p.targetRate, p.currency, p.hoursUnit)
      : '—';

    summary.innerHTML =
      '<div class="summary-line">' +
        '<strong>' + esc(name) + '</strong>' +
        '<span>Fixed ' + Calc.fmtMoney(p.price, p.currency) + ' · ' +
          Calc.fmtDur(p.hours, p.hoursUnit) + ' est · effective ' + displayRateU(c.orig, p.currency, p.hoursUnit) + '</span>' +
        '<button type="button" class="btn btn-sm btn-ghost" id="setup-edit-btn">Edit project</button>' +
      '</div>' +
      '<p class="summary-muted">Target rate ' + target + ' · ' +
        p.revisions + ' revision' + (p.revisions === 1 ? '' : 's') +
        ' included · saved locally in your browser.</p>';

    $('setup-edit-btn').addEventListener('click', editProject);
  }

  function showProjectForm() {
    const p = state.project;
    $('setup-form-wrap').hidden = false;
    $('setup-summary').hidden = true;
    $('setup-hint').hidden = true;
    $('setup-cancel').hidden = false;
    if (p) {
      $('p-name').value = p.name || '';
      $('p-currency').value = p.currency || 'USD';
      $('p-price').value = p.price;
      $('p-hours-unit').value = normUnit(p.hoursUnit);
      $('p-hours').value = Calc.fromHours(p.hours, p.hoursUnit);
      $('p-rate').value = (p.targetRate !== null && p.targetRate !== undefined) ? Calc.round2(rateForDisplay(p.targetRate, p.hoursUnit)) : '';
      $('p-revisions').value = p.revisions;
    }
    $('setup-error').hidden = true;
  }

  function editProject() {
    showProjectForm();
    $('setup-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function saveProjectFromForm() {
    const err = $('setup-error');
    const price = num($('p-price').value);
    const hoursEntered = num($('p-hours').value);
    const hoursUnit = normUnit($('p-hours-unit').value);
    const hours = Calc.toHours(hoursEntered, hoursUnit); // days → 8-hour days
    const targetRaw = $('p-rate').value.trim();
    const revisions = num($('p-revisions').value);

    if (!(price > 0)) { showError(err, 'Project price must be more than 0.'); return false; }
    if (!(hoursEntered > 0)) { showError(err, 'Estimated time must be more than 0.'); return false; }

    // A "daily rate" entry is converted to canonical hourly (÷ 8) for storage.
    const targetRate = targetRaw === '' ? null
      : (hoursUnit === 'days' ? num(targetRaw) / Calc.HOURS_PER_DAY : num(targetRaw));
    if (targetRaw !== '' && !(targetRate >= 0)) {
      showError(err, 'Target hourly rate must be a positive number (or leave it blank).');
      return false;
    }
    if (!(revisions >= 0)) { showError(err, 'Revisions must be 0 or more.'); return false; }

    const wasNew = !state.project;
    state.project = {
      name: $('p-name').value.trim(),
      currency: $('p-currency').value,
      price: price,
      hours: hours,
      hoursUnit: hoursUnit,
      targetRate: targetRate,
      revisions: revisions
    };
    saveState();
    renderAll();
    if (wasNew) resetRequestForm(); // prefill charge rate once the project exists
    return true;
  }

  /* ── Render: dashboard ────────────────────────────────────────── */
  function renderDashboard() {
    const dash = $('dashboard');
    const c = C();
    if (!c) {
      dash.hidden = true;
      return;
    }
    dash.hidden = false;
    const p = c.p;

    $('dash-count').textContent = c.committed > 0
      ? state.requests.length + ' request' + (state.requests.length === 1 ? '' : 's') +
        ' · ' + Calc.fmtDur(c.committed, p.hoursUnit) + ' committed'
      : 'No extra requests yet';

    const hasBaseline = c.p.price > 0 && c.p.hours > 0;

    $('stat-orig-rate').textContent = displayRateU(c.orig, p.currency, p.hoursUnit);
    $('stat-proj-rate').textContent = displayRateU(c.proj, p.currency, p.hoursUnit);

    const dropEl = $('stat-drop');
    dropEl.textContent = displayDrop(c.drop, hasBaseline);
    dropEl.classList.remove('drop-bad', 'drop-none');
    dropEl.classList.add(c.drop > 0 ? 'drop-bad' : (hasBaseline ? 'drop-none' : ''));

    $('stat-unbilled').textContent = Calc.fmtMoney(c.unbilled, p.currency);
    $('stat-extra-hours').textContent = Calc.fmtDur(c.committed, p.hoursUnit);

    $('cmp-o-hours').textContent = Calc.fmtDur(p.hours, p.hoursUnit);
    $('cmp-o-price').textContent = Calc.fmtMoney(p.price, p.currency);
    $('cmp-o-rate').textContent = displayRate(c.orig, p.currency);
    $('cmp-c-hours').textContent = Calc.fmtDur(p.hours + c.committed, p.hoursUnit);
    $('cmp-c-price').textContent = Calc.fmtMoney(p.price, p.currency);
    $('cmp-c-rate').textContent = displayRate(c.proj, p.currency);

    const line = $('cmp-line');
    if (c.committed > 0) {
      if (c.drop > 0) {
        line.className = 'killer danger';
        line.innerHTML =
          '<span class="killer-ico" aria-hidden="true">' + toolIconSvg('warn') + '</span>Your effective rate has dropped ' + Calc.fmtPct(c.drop) +
          ' — from ' + fmtRateU(c.orig, p.currency, p.hoursUnit) + ' to ' + fmtRateU(c.proj, p.currency, p.hoursUnit) + '.';
        if (c.unbilled > 0) {
          line.innerHTML += ' Value of work you\u2019re not billing: <strong>' +
            Calc.fmtMoney(c.unbilled, p.currency) + '</strong>.';
        }
      } else {
        line.className = 'killer ok';
        line.innerHTML = '<span class="killer-ico" aria-hidden="true">' + toolIconSvg('check') + '</span>Extra work is fully charged — your effective rate holds at ' +
          fmtRateU(c.proj, p.currency, p.hoursUnit) + '.';
      }
    } else {
      line.className = 'killer';
      line.textContent = 'No scope creep tracked yet. Log the first extra request below and watch its real cost appear in seconds.';
    }
  }

  /* ── Render: request history ──────────────────────────────────── */
  function renderRequests() {
    const sec = $('history-section');
    const c = C();
    if (!c) { sec.hidden = true; return; }
    sec.hidden = false;
    const cur = c.p.currency;

    $('hist-count').textContent = state.requests.length === 0
      ? 'Nothing logged yet'
      : state.requests.length + ' request' + (state.requests.length === 1 ? '' : 's');

    const tbody = $('req-rows');
    if (state.requests.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="empty-cell">No extra requests yet. When the client asks for &ldquo;just one more thing,&rdquo; log it above.</td></tr>';
      return;
    }

    const STATUS_PILLS = { pending: 'pill-out', approved: 'pill-in', declined: 'pill-muted' };
    const STATUS_LABELS = { pending: 'Pending', approved: 'Approved', declined: 'Declined' };

    const rows = state.requests.map(function (r) {
      const value = Calc.requestValueForRequest(r);
      const meta =
        '<span class="pill pill-type">' + esc(TYPE_LABELS[r.type] || 'Other') + '</span>' +
        '<span class="pill ' + (r.scope === 'out' ? 'pill-out' : 'pill-in') + '">' +
          (r.scope === 'out' ? 'Out of scope' : 'In scope') + '</span>' +
        (r.expenses > 0
          ? '<span class="pill pill-muted">' + Calc.fmtMoney(r.expenses, cur) + ' expenses</span>'
          : '');

      const statusBadge =
        '<span class="pill ' + (STATUS_PILLS[r.status] || 'pill-muted') + '">' +
          (STATUS_LABELS[r.status] || r.status) + '</span>';

      let transitions = '';
      if (r.status === 'pending') {
        transitions =
          '<button type="button" class="mini ok" data-action="approve" data-id="' + r.id + '">Approve</button>' +
          '<button type="button" class="mini danger" data-action="decline" data-id="' + r.id + '">Decline</button>';
      } else {
        transitions =
          '<button type="button" class="mini" data-action="reopen" data-id="' + r.id + '">Reopen</button>';
        if (r.status === 'approved') {
          transitions +=
            '<button type="button" class="mini danger" data-action="decline" data-id="' + r.id + '">Decline</button>';
        }
      }

      const actions =
        '<button type="button" class="btn btn-sm btn-ghost" data-action="message" data-id="' + r.id + '">Change order</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-action="edit" data-id="' + r.id + '">Edit</button>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-action="delete" data-id="' + r.id + '">Delete</button>';

      return '<tr>' +
        '<td><span class="req-desc">' + esc(r.description) + '</span>' +
          '<span class="req-meta">' + meta + '</span></td>' +
        '<td><strong>' + Calc.fmtDur(r.hours, normUnit(r.unit)) + '</strong></td>' +
        '<td><strong>' + Calc.fmtMoney(value, cur) + '</strong></td>' +
        '<td>' + statusBadge + '<span class="mini-row">' + transitions + '</span></td>' +
        '<td><span class="row-actions">' + actions + '</span></td>' +
      '</tr>';
    });

    tbody.innerHTML = rows.join('');
  }

  /* ── Request form ─────────────────────────────────────────────── */
  function defaultRate() {
    const c = C();
    if (!c) return 0;
    if (c.p.targetRate !== null && c.p.targetRate !== undefined && c.p.targetRate > 0) return c.p.targetRate;
    return c.orig;
  }

  function setRateHint() {
    const c = C();
    const hint = $('r-rate-hint');
    if (!c) { hint.textContent = ''; return; }
    if (c.p.targetRate > 0) {
      hint.textContent = 'Prefilled with your target rate (' + fmtRateU(c.p.targetRate, c.p.currency, normUnit($('r-hours-unit').value)) + ').';
    } else {
      hint.textContent = 'No target set — prefilled with your original effective rate (' + displayRateU(c.orig, c.p.currency, normUnit($('r-hours-unit').value)) + ').';
    }
  }

  function resetRequestForm() {
    editingId = null;
    $('r-desc').value = '';
    $('r-type').value = 'new-feature';
    $('r-scope-out').checked = true;
    $('r-hours').value = '';
    $('r-hours-unit').value = normUnit(state.project && state.project.hoursUnit);
    $('r-rate').value = Calc.round2(rateForDisplay(defaultRate(), normUnit($('r-hours-unit').value)));
    updateUnitLabels();
    $('r-expenses').value = '0';
    $('req-error').hidden = true;
    $('r-cancel').hidden = true;
    $('r-add').textContent = 'Add request';
    setRateHint();
    recalc();
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = false;
  }

  function readForm() {
    const hoursEntered = num($('r-hours').value);
    const unit = normUnit($('r-hours-unit').value);
    return {
      description: $('r-desc').value.trim(),
      type: $('r-type').value,
      scope: $('r-scope-out').checked ? 'out' : 'in',
      hoursEntered: hoursEntered,               // value as typed
      hoursUnit: unit,                          // 'hours' | 'days'
      hours: Calc.toHours(hoursEntered, unit),  // canonical hours (days × 8)
      rate: unit === 'days' ? num($('r-rate').value) / Calc.HOURS_PER_DAY : num($('r-rate').value), // daily → canonical hourly
      expenses: num($('r-expenses').value) || 0
    };
  }

  function recalc() {
    const panel = $('results');
    const c = C();
    if (!c) { panel.hidden = true; return; }
    const f = readForm();
    if (!(f.hours > 0)) { panel.hidden = true; return; }
    panel.hidden = false;

    const cur = c.p.currency;
    const hours = f.hours > 0 ? f.hours : 0;
    const rate = f.rate > 0 ? f.rate : 0;
    const expenses = f.expenses > 0 ? f.expenses : 0;
    const value = Calc.requestValue(hours, rate, expenses);
    const projIf = Calc.projectedEffectiveRate(c.p.price, c.p.hours, c.committed + hours, c.committedValue + value);
    const dropIf = Calc.rateDropPct(c.orig, projIf);
    const breakEven = Calc.breakEvenCharge(hours, c.orig, expenses);

    $('res-value').textContent = Calc.fmtMoney(value, cur);
    $('res-proj-rate').textContent = displayRateU(projIf, cur, normUnit($('r-hours-unit').value));
    $('res-drop').textContent = displayDrop(dropIf, c.p.price > 0 && c.p.hours > 0);
    $('res-breakeven').textContent = Calc.fmtMoney(breakEven, cur);

    const advice = $('res-advice');
    if (f.scope === 'out') {
      if (value < breakEven - 0.005) {
        advice.className = 'killer killer-advice danger';
        advice.innerHTML = '<span class="killer-ico" aria-hidden="true">' + toolIconSvg('warn') + '</span><strong>' + Calc.fmtMoney(value, cur) +
          '</strong> is below break-even (' + Calc.fmtMoney(breakEven, cur) +
          '). Charging this still lowers your effective rate — raise the rate or add expenses.';
      } else {
        advice.className = 'killer killer-advice ok';
        advice.textContent = 'Charging ' + Calc.fmtMoney(value, cur) +
          ' keeps or raises your effective rate (break-even is ' + Calc.fmtMoney(breakEven, cur) + ').';
      }
    } else {
      advice.className = 'killer killer-advice';
      advice.textContent = 'In-scope work absorbs into your fixed price — the numbers above are the real cost to you. Every hour counts against your rate.';
    }
  }

  function saveRequestFromForm() {
    const err = $('req-error');
    const f = readForm();
    if (!f.description) { showError(err, 'Describe what the client asked for first.'); return; }
    if (!(f.hoursEntered > 0)) { showError(err, 'Extra time must be more than 0.'); return; }
    const rate = f.rate > 0 ? f.rate : defaultRate();
    const expenses = f.expenses > 0 ? f.expenses : 0;

    if (editingId) {
      const existing = state.requests.find(function (r) { return r.id === editingId; });
      if (existing) {
        existing.description = f.description;
        existing.type = f.type;
        existing.scope = f.scope;
        existing.hours = f.hours;
        existing.unit = f.hoursUnit;
        existing.rate = rate;
        existing.expenses = expenses;
      }
    } else {
      state.requests.push({
        id: uid(),
        description: f.description,
        type: f.type,
        scope: f.scope,
        hours: f.hours,
        unit: f.hoursUnit,
        rate: rate,
        expenses: expenses,
        status: 'pending',
        createdAt: Date.now()
      });
    }

    saveState();
    renderAll();
    resetRequestForm();
    $('request-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── Editing requests ─────────────────────────────────────────── */
  function startEdit(id) {
    const r = state.requests.find(function (x) { return x.id === id; });
    if (!r) return;
    editingId = id;
    $('r-desc').value = r.description;
    $('r-type').value = r.type;
    if (r.scope === 'in') $('r-scope-in').checked = true; else $('r-scope-out').checked = true;
    $('r-hours-unit').value = normUnit(r.unit);
    $('r-hours').value = Calc.fromHours(r.hours, normUnit(r.unit));
    $('r-rate').value = Calc.round2(rateForDisplay(r.rate, normUnit(r.unit)));
    updateUnitLabels();
    $('r-expenses').value = r.expenses;
    $('req-error').hidden = true;
    $('r-cancel').hidden = false;
    $('r-add').textContent = 'Save changes';
    setRateHint();
    recalc();
    $('request-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    resetRequestForm();
  }

  /* ── Message generator ────────────────────────────────────────── */
  function buildMessage(r) {
    const c = C();
    const p = c.p;
    const cur = p.currency;
    const projectLabel = p.name && p.name.trim() ? p.name.trim() : 'our project';
    const value = Calc.requestValueForRequest(r);
    const rUnit = normUnit(r.unit);
    const hoursLine = '\u2022 Additional work: ' + durLabel(r.hours, rUnit) + ' at ' + fmtRateU(r.rate, cur, rUnit);
    const expLine = r.expenses > 0 ? '\n\u2022 Expenses: ' + Calc.fmtMoney(r.expenses, cur) : '';

    if (r.scope === 'in') {
      const totalH = p.hours + c.committed + r.hours;
      const pUnit = normUnit(p.hoursUnit);
      return 'Hi [Client],\n\n' +
        'Quick note on \u201c' + r.description + '\u201d: I\u2019ll absorb this into the current scope at no extra charge (' +
        Calc.fmtDur(r.hours, rUnit) + ' additional).\n\n' +
        'Heads-up on the budget: the project is now roughly ' + durLabel(totalH, pUnit) +
        ' total at the fixed ' + Calc.fmtMoney(p.price, cur) +
        ', so my effective rate for this job is dropping. I\u2019m flagging it so we can keep scope and timeline realistic — ' +
        'if more extras stack up I may need to send a change order.\n\n' +
        'Thanks,\n[Your name]';
    }

    let reason;
    if (r.type === 'extra-revision') {
      reason = 'This is a revision beyond the ' + p.revisions + ' revision' + (p.revisions === 1 ? '' : 's') +
        ' included in the original ' + Calc.fmtMoney(p.price, cur) + ' scope, so it falls outside what we agreed.';
    } else {
      reason = 'This falls outside the scope we agreed for ' + projectLabel + ' (' +
        durLabel(p.hours, normUnit(p.hoursUnit)) + ' for a fixed ' + Calc.fmtMoney(p.price, cur) +
        '), so rather than absorb it I\u2019d like to add it as a change order.';
    }

    return 'Hi [Client],\n\n' +
      'Regarding the additional request \u2014 \u201c' + r.description + '\u201d.\n\n' +
      reason + '\n\n' +
      'Proposed change order:\n' +
      hoursLine + expLine + '\n' +
      '\u2022 Additional charge: ' + Calc.fmtMoney(value, cur) + '\n\n' +
      'If that works for you, just confirm and I\u2019ll get started \u2014 or let me know if you\u2019d prefer to adjust the scope instead.\n\n' +
      'Thanks,\n[Your name]';
  }

  function openMessage(r) {
    const c = C();
    if (!c) return;
    $('msg-text').value = buildMessage(r);
    const panel = $('change-order-section');
    panel.hidden = false;
    panel.classList.remove('reveal');
    void panel.offsetWidth; // restart the slide-down animation
    panel.classList.add('reveal');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function copyMessage() {
    const ta = $('msg-text');
    const btn = $('msg-copy');
    const done = function () { flashCopied(btn); };
    const fallback = function () {
      try {
        ta.focus();
        ta.select();
        document.execCommand('copy');
        done();
      } catch (e) {
        btn.textContent = 'Select the text and press Ctrl/Cmd+C';
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ── Per-tool currency state ───────────────────────────────── */
  // Each tool keeps its own currency choice (persisted); scope-guard uses
  // the project's currency. TOOL_CURRENCIES defines the 8 shared options.
  const CURRENCY_KEY = 'cm-currency-v1';

  function toolCurrencyCodes() {
    return Object.keys(Calc.TOOL_CURRENCIES);
  }

  function loadCurrencies() {
    const fallback = { erp: 'LKR', qr: 'LKR', boq: 'LKR', pricing: 'LKR', invoice: 'LKR', duty: 'LKR', variation: 'LKR', breakeven: 'LKR', fx: 'LKR', retainer: 'LKR', delay: 'LKR' };
    try {
      const raw = localStorage.getItem(CURRENCY_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;
      const codes = toolCurrencyCodes();
      const out = {};
      for (const k in fallback) {
        out[k] = codes.indexOf(parsed[k]) !== -1 ? parsed[k] : fallback[k];
      }
      return out;
    } catch (e) {
      return fallback;
    }
  }

  let toolCurrency = loadCurrencies();

  function saveCurrencies() {
    try { localStorage.setItem(CURRENCY_KEY, JSON.stringify(toolCurrency)); } catch (e) { /* ignore */ }
  }

  /* ── The company's own currency ───────────────────────────────
     Brand & Theme Settings carries a free-text "Account currency"
     (the bank account's currency, e.g. LKR). It is normalised to a code
     the tools understand and used as the DEFAULT for anything that asks
     "what currency is this business in?" — the client form, for one. */
  function companyCurrency() {
    const raw = String((brand && brand.accountCur) || '').trim().toUpperCase();
    const code = raw.replace(/[^A-Z]/g, '');
    if (Calc.TOOL_CURRENCIES[code]) return code;
    // Tolerate "Rs", "Rs.", "SLR" and "LKR (Rs.)" style entries.
    if (code === 'SLR' || code === 'RS' || code === 'LKR') return 'LKR';
    return 'LKR';
  }

  /* A brand-new client starts on the company currency, NOT on whatever
     option happens to sit first in the <select>. The old markup shipped
     USD as the first option with nothing selected, so every client saved
     without touching the dropdown silently claimed to invoice in dollars
     while the rest of the app worked in rupees. */
  function syncDbClientCurrency(force) {
    const sel = $('db-client-currency');
    if (!sel) return;
    if (dbEditing.client > -1) return;              // never stomp an edit session
    if (!force && sel.dataset.userPicked === '1') return;  // deliberate choice wins
    sel.value = companyCurrency();
    sel.dataset.userPicked = '';
  }

  function setToolCurrency(tool, code) {
    if (!Calc.TOOL_CURRENCIES[code]) return;
    // Global sync: one change applies to EVERY calculator, table and PDF
    // generator. Tool state (inputs, rows) is untouched — only display
    // currency changes, so nothing the user typed is reset.
    for (const k in toolCurrency) toolCurrency[k] = code;
    saveCurrencies();
    // Document tools persist their own currency (PDF output, client
    // defaults) — keep them in step with the global choice.
    erpState.currency = code;
    saveErp();
    invState.currency = code;
    saveInv();
    // Keep every banner select in step (including the one that fired).
    const selects = ['erp-currency', 'qr-currency', 'boq-currency', 'pr-currency', 'inv-currency', 'duty-currency', 'var-currency', 'bk-currency', 'fx-currency', 'rt-currency', 'dl-currency'];
    for (let i = 0; i < selects.length; i++) {
      const el = document.getElementById(selects[i]);
      if (el) el.value = code;
    }
    // The invoice builder's inline Currency field mirrors the same choice.
    const invCurField = document.getElementById('inv-f-currency');
    if (invCurField) invCurField.value = code;
    // Re-render every money surface with the new symbol.
    renderErpRows(); updateErpSummary();
    renderQr();
    renderBoqRows(); updateBoqSummary();
    updatePricing();
    renderInvRows(); updateInvSummary();
    updateDuty();
    updateVariation();
    updateBreakeven();
    updateFx();
    updateRetainer();
    updateDelay();
  }

  function wireCurrencySelects() {
    const pairs = [['erp-currency', 'erp'], ['qr-currency', 'qr'], ['boq-currency', 'boq'], ['pr-currency', 'pricing'], ['inv-currency', 'invoice'], ['duty-currency', 'duty'], ['var-currency', 'variation'], ['bk-currency', 'breakeven'], ['fx-currency', 'fx'], ['rt-currency', 'retainer'], ['dl-currency', 'delay']];
    for (let i = 0; i < pairs.length; i++) {
      $(pairs[i][0]).addEventListener('change', function () {
        setToolCurrency(pairs[i][1], this.value);
      });
    }
  }

  function initCurrencySelects() {
    const pairs = [['erp-currency', 'erp'], ['qr-currency', 'qr'], ['boq-currency', 'boq'], ['pr-currency', 'pricing'], ['inv-currency', 'invoice'], ['duty-currency', 'duty'], ['var-currency', 'variation'], ['bk-currency', 'breakeven'], ['fx-currency', 'fx'], ['rt-currency', 'retainer'], ['dl-currency', 'delay']];
    for (let i = 0; i < pairs.length; i++) {
      $(pairs[i][0]).value = toolCurrency[pairs[i][1]];
    }
  }

  function syncInvCurrencySelect() {
    // The commercial-invoice "Currency" field and the banner select stay in
    // sync — one source of truth (invState.currency).
    $('inv-currency').value = invState.currency;
  }

  /* ── Quantity & Rate Calculator (tool #02) ────────────────────── */
  // Rows persist locally (own key) exactly like the scope-guard state.
  // Amount = Quantity × Rate; blank or negative qty/rate rows contribute
  // nothing (amount cell shows "—") so invalid input can't corrupt totals.
  const QR_KEY = 'cm-qr-v1';

  function loadQr() {
    try {
      const raw = localStorage.getItem(QR_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  let qrRows = loadQr();

  function saveQr() {
    try { localStorage.setItem(QR_KEY, JSON.stringify(qrRows)); } catch (e) { /* ignore */ }
  }

  function qrRowTemplate() {
    return { id: uid(), item: '', qty: '', unit: '', rate: '' };
  }

  // null = no valid amount (blank or negative qty/rate).
  function qrAmount(row) {
    if (row.qty === '' || row.rate === '') return null;
    const q = Number(row.qty);
    const r = Number(row.rate);
    if (!Number.isFinite(q) || !Number.isFinite(r) || q < 0 || r < 0) return null;
    return q * r;
  }

  function updateQrTotal() {
    let total = 0;
    let count = 0;
    for (let i = 0; i < qrRows.length; i++) {
      const row = qrRows[i];
      const a = qrAmount(row);
      if (a !== null) total += a;
      if (row.item.trim() !== '' || row.qty !== '' || row.unit !== '' || row.rate !== '') count++;
    }
    $('qr-count').textContent = count + ' item' + (count === 1 ? '' : 's');
    $('qr-total-value').textContent = Calc.fmtToolMoney(total, toolCurrency.qr);
  }

  function qrCur() { return toolCurrency.qr; }

  function updateQrHeaders() {
    const sym = Calc.TOOL_CURRENCIES[qrCur()].symbol.trim();
    $('qr-rate-th').textContent = 'Rate (' + sym + ')';
    $('qr-amount-th').textContent = 'Amount (' + sym + ')';
  }

  function renderQr() {
    updateQrHeaders();
    const tbody = $('qr-rows');
    if (qrRows.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty-cell">No line items yet. Add a row and start typing — each amount and the total update instantly.</td></tr>';
    } else {
      const rows = qrRows.map(function (row) {
        const amount = qrAmount(row);
        return '<tr class="qr-row" data-id="' + row.id + '">' +
          '<td><input type="text" class="qr-item" value="' + esc(row.item) + '" placeholder="e.g. Pipe installation" autocomplete="off"></td>' +
          '<td><input type="text" inputmode="decimal" data-numeric="1" class="qr-qty" min="0" step="any" inputmode="decimal" value="' + esc(String(row.qty)) + '" placeholder="0" aria-label="Quantity"></td>' +
          '<td><input type="text" class="qr-unit" list="qr-units" value="' + esc(row.unit) + '" placeholder="m" autocomplete="off" aria-label="Unit"></td>' +
          '<td><input type="text" inputmode="decimal" data-numeric="1" class="qr-rate" min="0" step="any" inputmode="decimal" value="' + esc(String(row.rate)) + '" placeholder="0" aria-label="Rate"></td>' +
          '<td class="qr-amount">' + (amount === null ? '\u2014' : Calc.fmtToolMoney(amount, qrCur())) + '</td>' +
          '<td><button type="button" class="qr-del" data-id="' + row.id + '" aria-label="Remove row">\u2715</button></td>' +
        '</tr>';
      });
      tbody.innerHTML = rows.join('');
    }
    updateQrTotal();
  }

  // Keyboard-friendly: Enter on the last row adds the next row (and focuses
  // it); an already-empty last row is just focused instead of duplicated.
  function addQrRow() {
    const rows = Array.prototype.slice.call($('qr-rows').querySelectorAll('.qr-row'));
    const last = rows[rows.length - 1];
    if (last) {
      const items = Array.prototype.slice.call(last.querySelectorAll('input'));
      const allEmpty = items.every(function (i) { return i.value === ''; });
      if (allEmpty) { last.querySelector('.qr-item').focus(); return; }
    }
    qrRows.push(qrRowTemplate());
    saveQr();
    renderQr();
    const first = $('qr-rows').querySelectorAll('.qr-row:last-child .qr-item')[0];
    if (first) first.focus();
  }

  async function clearQr() {
    if (!(await confirmAction({ title: 'Clear line items?', message: 'Clear all line items? This cannot be undone.', confirmLabel: 'Clear', danger: true }))) return;
    qrRows = [];
    saveQr();
    renderQr();
  }

  /* ── PDF / Print engine (hidden iframe — pop-up-blocker-proof) ── */
  // Every export compiles a COMPLETE standalone HTML document (inline
  // stylesheet embedded — no app CSS, no CDN, no offscreen capture) and
  // writes it into a reusable hidden <iframe> in this same document:
  // frameDoc.open() → write() → close(), waits for images + styles, then
  // contentWindow.focus() + contentWindow.print(). No window.open() is
  // ever used, so browser pop-up blockers cannot interfere. This replaced
  // both the html2pdf rasterizer (blank pages) and the print-window
  // pipeline (blocked popups).
  const PRINT_DOC_CSS = [
    /* margin: 0 forces Chrome/Edge to hide their default URL/date print
       headers & footers; the page padding moves onto .doc-page. */
    /* The master template is US Letter 612×792pt with ZERO page margin —
       margin: 0 also forces Chrome/Edge to hide their default URL/date
       print headers & footers. The template supplies its own margins. */
    '@page { size: 612pt 792pt; margin: 0; }',
    'html, body { margin: 0; padding: 0; background: #ffffff; color: #000000; }',
    'body { font-family: Roboto, Arial, Helvetica, sans-serif; font-size: 9.8pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '.doc-page { width: 612pt; max-width: 612pt; min-height: 792pt; margin: 0 auto; background: #ffffff; color: #000000; padding: 0; box-sizing: border-box; }',
    '.quo-doc { color: #000000; line-height: 1.2; font-size: 9.8pt; padding: 0; }',
    /* The grid itself never scales or reflows — but its TEXT may wrap
       (long addresses, descriptions, notes) and the row grows instead of
       overlapping the row beneath. */
    '.quo-doc, .quo-doc *, .quo-doc *::before, .quo-doc *::after { box-sizing: border-box; }',
    '.quo-doc { overflow-wrap: anywhere; }',
    '.quo-doc table { border-collapse: collapse; width: 100%; max-width: 100%; table-layout: fixed; }',
    '.quo-doc img { max-width: 100%; }',
    '.quo-doc td, .quo-doc th { overflow-wrap: anywhere; word-break: break-word; }',
    '.quo-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 3px solid #111827; padding-bottom: 12px; }',
    '.quo-logo { width: 56px; height: 56px; border: 2px solid #111827; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; color: #111827; flex: none; }',
    '.quo-logo-img { width: 64px; height: 64px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 8px; flex: none; }',
    '.quo-company h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; color: #111827; }',
    '.quo-company p { margin: 2px 0 0; font-size: 11px; color: #374151; }',
    '.quo-refbox { text-align: right; font-size: 12px; }',
    '.quo-refbox > div { margin-top: 2px; }',
    '.quo-refbox span { color: #6b7280; }',
    '.quo-doctype { display: inline-block; background: #111827; color: #ffffff; font-weight: 700; font-size: 12px; letter-spacing: 0.06em; padding: 3px 10px; border-radius: 4px; margin-bottom: 6px; }',
    '.quo-recipient { margin: 16px 0 6px; font-size: 12px; }',
    '.quo-lab { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 4px; }',
    '.quo-intro { margin: 8px 0 12px; }',
    '.quo-contact { font-size: 11px; color: #374151; margin: 0 0 10px; }',
    '.quo-metabox { font-size: 11.5px; color: #374151; }',
    '.quo-metabox div { margin-bottom: 2px; }',
    '.quo-metabox span { color: #6b7280; }',
    '.quo-table { width: 100%; border-collapse: collapse; margin-top: 4px; }',
    '.quo-table th, .quo-table td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 11px; vertical-align: top; color: #111827; text-align: left; }',
    '.quo-table th { background: #f3f4f6; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; color: #111827; }',
    '.quo-table .q-num { width: 28px; text-align: center; color: #6b7280; }',
    '.quo-table .q-c { text-align: center; }',
    '.quo-table .q-r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }',
    '.quo-tfoot td, .quo-totals-row td { font-weight: 600; }',
    '.quo-totals { margin-top: 12px; margin-left: auto; width: 320px; font-size: 12px; }',
    '.quo-totals > div { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #e5e7eb; color: #111827; }',
    '.quo-totals .q-final { font-weight: 800; border-bottom: none; border-top: 2px solid #111827; padding-top: 6px; font-size: 13px; }',
    '.quo-table tfoot td { font-weight: 600; color: #111827; background: #f9fafb; }',
    '.quo-table tfoot .quo-final td { font-weight: 800; border-top: 2px solid #111827; background: #f3f4f6; }',
    '.quo-terms { margin-top: 18px; font-size: 11px; }',
    '.quo-terms h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 6px; color: #111827; }',
    '.quo-terms ul { margin: 0; padding-left: 16px; }',
    '.quo-terms li { margin-bottom: 3px; color: #374151; }',
    '.quo-sign { margin-top: 26px; display: flex; justify-content: flex-end; }',
    '.quo-sign-left { text-align: center; font-size: 11px; color: #374151; }',
    '.q-sigline { display: block; width: 200px; border-bottom: 1px solid #111827; height: 34px; margin: 6px auto 2px; }',
    '.quo-signoff { margin-top: 30px; text-align: right; font-size: 11px; color: #374151; }',
    '.quo-signoff p { margin: 0; }',
    '.quo-signline { width: 200px; border-bottom: 1px solid #111827; height: 30px; margin: 8px 0 4px auto; }',
    '.var-doc { color: #111827; line-height: 1.5; font-size: 12px; }',
    '.var-h3 { margin: 14px 0 6px; font-size: 13px; color: #111827; }',
    '.var-desc-p { margin: 0 0 6px; }',
    '.var-muted { color: #6b7280; font-style: italic; }',
    '.var-table { margin-top: 14px; }',
    '.var-table td { padding: 7px 10px; }',
    '.var-table .q-final-row td { border-top: 2px solid #111827; font-size: 12.5px; }',
    '.var-table .q-final-row td.q-r { white-space: nowrap; }',
    '.var-doc .quo-sign { display: flex; gap: 40px; margin-top: 28px; }',
    '.var-doc .quo-sign-left { display: flex; flex-direction: column; gap: 4px; text-align: center; }',
    '.var-doc .quo-sign-left span { font-size: 11px; color: #374151; }',
    '.var-doc .q-sigline { width: 200px; border-bottom: 1px solid #111827; height: 26px; }',
    /* Formal document layout (sample engineering template) */
    '.fm-doc { font-size: 12px; }',
    '.fm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; border-bottom: 3px solid #111827; padding-bottom: 10px; }',
    '.fm-left { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }',
    '.fm-co { min-width: 0; }',
    '.fm-co h1 { margin: 0 0 2px; font-size: 17px; line-height: 1.2; letter-spacing: 0.01em; color: #111827; text-transform: uppercase; }',
    '.fm-co div { font-size: 10.5px; color: #374151; line-height: 1.45; }',
    '.fm-lab { color: #6b7280; }',
    '.fm-spec { display: block; width: 100%; font-style: italic; font-weight: bold; font-size: 11px; color: #0d1b6e !important; margin: 4px 0 8px 0; }',
    '.fm-right { text-align: right; flex: none; max-width: 42%; }',
    '.fm-banner { display: inline-block; background: #111827; color: #ffffff; font-weight: 700; font-size: 12.5px; letter-spacing: 0.06em; padding: 4px 12px; border-radius: 4px; margin-bottom: 6px; }',
    '.fm-right > div { font-size: 11px; color: #111827; margin-top: 2px; }',
    '.fm-metabox { display: flex; gap: 0; border: 1px solid #111827; border-radius: 4px; margin: 12px 0 10px; }',
    '.fm-meta-col { flex: 1 1 50%; padding: 8px 10px; min-width: 0; }',
    '.fm-meta-col + .fm-meta-col { border-left: 1px solid #111827; }',
    '.fm-meta-col h3 { margin: 0 0 5px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #111827; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; }',
    '.fm-meta-col div { font-size: 11px; color: #111827; line-height: 1.5; }',
    '.fm-dim { color: #9ca3af; }',
    '.fm-table { border-collapse: collapse; }',
    '.fm-table th, .fm-table td { border: 1px solid #000000; }',
    '.fm-table .q-num { width: 34px; }',
    '.fm-totals td { font-weight: 600; background: #f9fafb; }',
    '.fm-totals .fm-final td { font-weight: 800; font-size: 12.5px; border-top: 2px solid #111827; background: #f3f4f6; }',
    '.fm-words { margin-top: 10px; padding: 7px 10px; border: 1px dashed #6b7280; border-radius: 4px; font-size: 11.5px; color: #111827; }',
    '.fm-words strong { font-weight: 700; }',
    '.fm-terms { margin-top: 14px; font-size: 11px; }',
    '.fm-terms h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 5px; color: #111827; }',
    '.fm-terms ul { margin: 0; padding-left: 16px; }',
    '.fm-terms li { margin-bottom: 3px; color: #374151; }',
    '.fm-footer { display: flex; gap: 18px; margin-top: 22px; align-items: stretch; }',
    '.fm-footer-single { justify-content: flex-end; }',
    '.fm-footbox { flex: 1 1 50%; border: 1px solid #111827; border-radius: 4px; padding: 10px 12px; min-width: 0; }',
    '.fm-bank h3, .fm-signbox h3 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #111827; border-bottom: 1px solid #d1d5db; padding-bottom: 3px; }',
    '.fm-bank div { font-size: 11px; color: #111827; line-height: 1.55; }',
    '.fm-signbox { text-align: center; }',
    '.fm-seal { width: 74px; height: 74px; border: 2px dashed #9ca3af; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 6px auto 8px; font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; }',
    '.fm-onbehalfof { font-size: 11px; color: #111827; }',
    '.fm-sigspace { height: 34px; }',
    '.fm-sigline { width: 180px; border-bottom: 1px solid #111827; height: 0; margin: 0 auto 4px; }',
    '.fm-signpair { display: flex; gap: 40px; justify-content: space-around; margin-top: 8px; }',
    '.fm-signpair .quo-sign-left { display: flex; flex-direction: column; gap: 4px; align-items: center; font-size: 11px; color: #374151; }',
    '.fm-signpair .q-sigline { width: 170px; border-bottom: 1px solid #111827; height: 22px; }',
    /* A4 print hygiene: never slice a row, the totals, the footer boxes
       or the signature block across pages; repeat the header row. */
    'tr { page-break-inside: avoid; break-inside: avoid; }',
    'thead { display: table-header-group; }',
    'tfoot { display: table-footer-group; }',
    '.fm-words, .fm-footer, .fm-footbox, .fm-terms, .quo-sign, .quo-signoff, .quo-totals { page-break-inside: avoid; break-inside: avoid; }',
    /* ── MX (mx-*) print layout: mirrored from style.css —
       sample tax invoice format (INV-000) ── */
    '.mx-doc { font-size: 12px; }',
    '.mx-head { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 14px; border-bottom: 2px solid #0d1b6e; padding-bottom: 8px; margin-bottom: 12px; }',
    '.mx-logo { max-height: 65px; width: auto; object-fit: contain; flex: none; }',
    '.mx-head-details { margin-left: auto; text-align: right; min-width: 0; }',
    '.mx-co-name { margin: 0; font-size: 20px; line-height: 1.2; font-weight: 800; letter-spacing: 0.5px; color: #0d1b6e; text-transform: uppercase; }',
    '.mx-legal { margin-top: 2px; font-size: 11px; font-weight: 700; letter-spacing: 0.02em; color: #111827; }',
    '.mx-line { font-size: 11px; color: #333333; font-weight: 500; margin-top: 2px; line-height: 1.5; }',
    '.mx-spec { display: block; width: 100%; font-style: italic; font-weight: bold; font-size: 11px; color: #0d1b6e; text-align: center; margin: 4px 0 8px 0; line-height: 1.5; }',
    '.mx-rule { width: 100%; border-bottom: 2px solid #0d1b6e; margin-bottom: 12px; }',
    '.mx-doctitle { text-align: center; font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #111827; margin: 10px 0 14px 0; padding: 4px 0; border-top: 1px solid #000000; border-bottom: 1px solid #000000; }',
    '.mx-meta { display: flex; justify-content: space-between; border: 1px solid #000000; margin: 0 0 10px; }',
    '.mx-meta-col { flex: 1 1 50%; padding: 6px 10px; min-width: 0; }',
    '.mx-meta-col + .mx-meta-col { border-left: 1px solid #000000; }',
    '.mx-meta-row { display: flex; align-items: baseline; gap: 4px; font-size: 10.5px; color: #111827; line-height: 1.7; }',
    '.mx-lab { font-weight: 700; flex: none; }',
    '.mx-sep { flex: none; }',
    '.mx-val { text-align: right; flex: 1 1 auto; overflow-wrap: anywhere; }',
    '.mx-table { width: 100%; border-collapse: collapse; table-layout: fixed; }',
    '.mx-table col.w6 { width: 6%; }',
    '.mx-table col.w44 { width: 44%; }',
    '.mx-table col.w8 { width: 8%; }',
    '.mx-table col.w10 { width: 10%; }',
    '.mx-table col.w16 { width: 16%; }',
    '.mx-table th, .mx-table td { border: 1px solid #000000; padding: 6px 8px; font-size: 11px; vertical-align: top; overflow-wrap: anywhere; }',
    '.mx-table th { background: #f2f2f2; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; height: 26px; white-space: nowrap; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '.mx-table .mx-c { text-align: center; }',
    '.mx-table .mx-r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }',
    '.mx-table .mx-th-left { text-align: left; }',
    '.mx-table .mx-desc { text-align: left; overflow-wrap: anywhere; }',
    '.mx-totals td { font-weight: 600; padding: 6px 10px; line-height: 1.5; }',
    '.mx-totals .mx-spacer { border: none; background: transparent; }',
    '.mx-totals .mx-sumlab { text-align: right; }',
    '.mx-totals .mx-grand td { font-weight: 800; font-size: 12px; background: #f2f2f2; line-height: 1.6; }',
    '.mx-totals .mx-grand .mx-spacer { background: transparent; }',
    '.mx-totals .mx-grand .mx-sumlab { border-right: none; }',
    '.mx-totals .mx-grand .mx-r { border-bottom: 3px double #000000; padding-bottom: 6px; line-height: 1.8; }',
    '.mx-words { margin-top: 10px; font-size: 11px; color: #111827; }',
    '.mx-words strong { font-weight: 700; }',
    '.mx-terms { margin-top: 8px; font-size: 10.5px; color: #374151; }',
    '.mx-thanks { margin: 20px 0; text-align: center; font-size: 10.5px; font-style: italic; color: #374151; }',
    '.mx-signbox { width: 260px; margin: 18px 0 0 auto; text-align: center; }',
    '.mx-sigspace { height: 40px; }',
    '.mx-onbehalf { font-size: 11px; color: #111827; }',
    '.mx-onbehalf strong { font-weight: 700; }',
    '.mx-sigline { font-size: 11px; color: #111827; white-space: nowrap; overflow: hidden; letter-spacing: -1px; }',
    '.mx-signatory { font-size: 11px; font-weight: 700; color: #111827; margin-top: 2px; }',
    '.mx-words, .mx-terms, .mx-signbox { page-break-inside: avoid; break-inside: avoid; }',
    /* Overflow behaviour: the master is ONE rigid page, but a document may
       carry more items than fit. Rather than clip or compress the table
       (which would change the format), let it continue on further pages
       with the same grid: the header row repeats and no row, summary line
       or footer block is ever split in half. */
    '.quo-doc thead { display: table-header-group; }',
    '.quo-doc tr { break-inside: avoid; page-break-inside: avoid; }',
    '.quo-doc .mx-keep { break-inside: avoid; page-break-inside: avoid; overflow: hidden; }'
  ].join('\n');

  // Builds the full document string. Values must be pulled live by the
  // caller BEFORE calling this (builders read state/inputs at build time);
  // nothing here may be null/undefined — esc() and the builders' `|| '\u2014'`
  // / `|| '0.00'` fallbacks guarantee printable text.
  function compilePrintHtml(bodyHtml, title) {
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(title || 'Nexora Engine document') + '</title>' +
      /* the master template is set in Roboto — load it for the frame too
         (offline the stack falls back to Arial/Helvetica) */
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,700;1,400&display=swap">' +
      '<style>' + PRINT_DOC_CSS + '</style></head><body>' +
      '<div class="doc-page">' + (bodyHtml || '<p>Nothing to print.</p>') + '</div>' +
      '</body></html>';
  }

  // Reusable hidden print frame. Kept off-screen and rendered (rather
  // than display:none — some engines print blank from display:none
  // iframes), sized A4 @96dpi so layout matches the paper.
  function printFrameEl() {
    let frame = document.getElementById('print-frame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'print-frame';
      frame.title = 'Nexora Engine print frame';
      // US Letter @96dpi (612×792pt) so the frame lays out exactly like the paper
      frame.setAttribute('style', 'position:fixed; top:-9999px; left:-9999px; width:816px; height:1056px; border:0; visibility:hidden;');
      document.body.appendChild(frame);
    }
    return frame;
  }

  // write → wait for images/styles → focus + print, all inside the
  // hidden iframe. Returns false only if the frame is unusable (callers
  // keep the UI usable); never shows a pop-up-blocker alert because this
  // path cannot be blocked.
  function openPrintWindow(compiledHTML, title) {
    const frame = printFrameEl();
    let win = null;
    try { win = frame.contentWindow; } catch (e) { win = null; }
    if (!win || !win.document) return false;
    const frameDoc = win.document;
    frameDoc.open();
    frameDoc.write(compiledHTML);
    frameDoc.close();
    let printed = false; // timers + load listeners may race — print once
    const doPrint = function () {
      if (printed) return;
      printed = true;
      try { win.focus(); win.print(); } catch (e) { /* user can Ctrl+P */ }
    };
    /* Fonts must be in before the first paint request, or the master
       template prints in a fallback face and every metric shifts. */
    let fontsPending = true;
    try {
      if (frameDoc.fonts && frameDoc.fonts.ready && frameDoc.fonts.ready.then) {
        frameDoc.fonts.ready.then(function () { fontsPending = false; }).catch(function () { fontsPending = false; });
      } else { fontsPending = false; }
    } catch (e) { fontsPending = false; }
    const whenReady = function (fn) {
      if (!fontsPending) { setTimeout(fn, 80); return; }
      let done = false;
      const go = function () { if (done) return; done = true; setTimeout(fn, 80); };
      try { frameDoc.fonts.ready.then(go).catch(go); } catch (e) { go(); }
      setTimeout(go, 2500); // never block printing on a slow font CDN
    };
    try {
      const imgs = frameDoc.images || [];
      const pending = Array.prototype.filter.call(imgs, function (im) { return !im.complete; });
      if (pending.length) {
        let left = pending.length;
        const done = function () { left -= 1; if (left <= 0) whenReady(doPrint); };
        for (let i = 0; i < pending.length; i++) {
          pending[i].addEventListener('load', done, { once: true });
          pending[i].addEventListener('error', done, { once: true });
        }
        setTimeout(function () { whenReady(doPrint); }, 2000); // safety net
      } else if (frameDoc.readyState === 'complete') {
        whenReady(doPrint);
      } else {
        frame.onload = function () { whenReady(doPrint); }; // property assignment (no listener build-up across exports)
        setTimeout(function () { whenReady(doPrint); }, 1500); // safety net
      }
    } catch (e) {
      setTimeout(doPrint, 250);
    }
    return true;
  }

  // Shared by every exporter: compile + print (hidden iframe). Keeps the
  // on-screen doc element as the single source of the compiled body.
  function exportViaPrintWindow(sourceEl, title) {
    const body = sourceEl ? sourceEl.innerHTML : '';
    if (!body || !String(body).replace(/\s/g, '')) {
      window.alert('Nothing to export yet — fill in the document first.');
      return false;
    }
    return openPrintWindow(compilePrintHtml(body, title), title);
  }

  // Export the line items + total as a clean PDF (print window).
  function qrExportPdf() {
    const items = qrRows.filter(function (r) { return r.item.trim() !== '' || r.qty !== '' || r.rate !== ''; });
    if (items.length === 0) { window.alert('Add at least one line item to export.'); return; }
    let total = 0;
    const rows = items.map(function (r, i) {
      const a = qrAmount(r);
      if (a !== null) total += a;
      return { desc: r.item || '', unit: r.unit || '', qty: r.qty, rate: r.rate === '' ? null : Number(r.rate), amount: a };
    });
    const fmQrLines = rows.map(function (l) {
      return Object.assign({}, l, { money: function (v) { return Calc.fmtToolMoney(v, qrCur()); } });
    });
    $('qr-doc').innerHTML =
      '<div class="quo-doc fm-doc">' +
        formalLetterhead({
          logo: brand.logo,
          name: brandDocTitle(),
          address: brand.address,
          phone: brandPhone(),
          email: brandEmail(),
          website: brand.website,
          spec: '',
          tin: brand.tin,
          docType: 'LINE ITEMS',
          refLabel: 'Sheet No',
          ref: '',
          date: invDateStr(todayStr())
        }) +
        formalLineTable(fmQrLines, qrCur(), true, { sub: total, discPct: 0, disc: 0, net: total, vatPct: 0, vat: 0, final: total, money: function (v) { return Calc.fmtToolMoney(v, qrCur()); }, colspan: 3 }) +
        '<div class="fm-footer fm-footer-single">' + formalSignoff(brandDocTitle()) + '</div>' +
      '</div>';
    // Compile the live values (rows, currency symbols, totals) into a
    // standalone print document — no CDN, no offscreen capture.
    exportViaPrintWindow($('qr-doc'), 'Quantity & Rate sheet');
    pushHistory({
      type: 'pdf', tool: 'qr', toolName: 'Quantity & Rate Calculator',
      title: 'Quantity & Rate sheet',
      total: (function () { let t = 0; for (let i = 0; i < qrRows.length; i++) { const a = qrAmount(qrRows[i]); if (a !== null) t += a; } return Calc.TOOL_CURRENCIES[qrCur()].symbol.trim() + ' ' + Calc.fmtNum(t); })(),
      draft: { tool: 'qr' }
    });
  }

  /* ── Engineering Quotation & BOQ Generator (tool #03) ──────────── */
  // Everything stays local (own key). Line amount = Qty × Rate (LKR);
  // Sub total = Σ line amounts; Discount = sub × %; Net = sub − discount;
  // VAT = net × %; Final total = net + VAT.
  const BOQ_KEY = 'cm-boq-v1';

  function emptyBoq() {
    return {
      meta: { client: '', designation: '', company: '', address: '', date: '', ref: '' },
      lines: [],
      discount: '',
      vat: ''
    };
  }

  function loadBoq() {
    try {
      const raw = localStorage.getItem(BOQ_KEY);
      if (!raw) return emptyBoq();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyBoq();
      return {
        meta: Object.assign({}, emptyBoq().meta, parsed.meta || {}),
        lines: Array.isArray(parsed.lines) ? parsed.lines : [],
        discount: parsed.discount === undefined ? '' : parsed.discount,
        vat: parsed.vat === undefined ? '' : parsed.vat
      };
    } catch (e) {
      return emptyBoq();
    }
  }

  let boqState = loadBoq();

  function saveBoq() {
    try { localStorage.setItem(BOQ_KEY, JSON.stringify(boqState)); } catch (e) { /* ignore */ }
  }

  function boqLineTemplate() {
    return { id: uid(), item: '', unit: 'Nr', qty: '', rate: '' };
  }

  function boqLineAmount(row) {
    return Calc.boqAmount(row.qty, row.rate);
  }

  function boqCur() { return toolCurrency.boq; }
  function boqMoney(v) { return Calc.fmtToolMoney(v, boqCur()); }

  function updateBoqHeaders() {
    const sym = Calc.TOOL_CURRENCIES[boqCur()].symbol.trim();
    $('boq-rate-th').textContent = 'Rate (' + sym + ')';
    $('boq-amount-th').textContent = 'Amount (' + sym + ')';
  }

  function todayStr() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function fillBoqMeta() {
    const m = boqState.meta;
    $('bq-client').value = m.client || '';
    $('bq-designation').value = m.designation || '';
    $('bq-company').value = m.company || '';
    $('bq-address').value = m.address || '';
    $('bq-date').value = m.date || todayStr();
    $('bq-ref').value = m.ref || '';
    $('bq-discount').value = boqState.discount;
    $('bq-vat').value = boqState.vat;
  }

  function renderBoqRows() {
    const tbody = $('boq-rows');
    if (boqState.lines.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="empty-cell">No items yet. Add the first BOQ line and the totals update instantly.</td></tr>';
    } else {
      const rows = boqState.lines.map(function (row) {
        const amount = boqLineAmount(row);
        return '<tr class="qr-row" data-id="' + row.id + '">' +
          '<td><input type="text" class="bq-item" value="' + esc(row.item) + '" placeholder="e.g. Supply & install 25mm conduit" autocomplete="off"></td>' +
          '<td><input type="text" class="bq-unit" list="boq-units" value="' + esc(row.unit) + '" placeholder="Nr" autocomplete="off" aria-label="Unit"></td>' +
          '<td><input type="text" inputmode="decimal" data-numeric="1" class="bq-qty" min="0" step="any" inputmode="decimal" value="' + esc(String(row.qty)) + '" placeholder="0" aria-label="Quantity"></td>' +
          '<td><input type="text" inputmode="decimal" data-numeric="1" class="bq-rate" min="0" step="any" inputmode="decimal" value="' + esc(String(row.rate)) + '" placeholder="0" aria-label="Rate"></td>' +
          '<td class="qr-amount">' + (amount === null ? '\u2014' : boqMoney(amount)) + '</td>' +
          '<td><button type="button" class="qr-del" data-id="' + row.id + '" aria-label="Remove item">\u2715</button></td>' +
        '</tr>';
      });
      tbody.innerHTML = rows.join('');
    }
  }

  function updateBoqSummary() {
    const sub = Calc.boqSubTotal(boqState.lines);
    const discPct = num(boqState.discount);
    const vatPct = num(boqState.vat);
    const disc = Calc.boqDiscount(sub, discPct);
    const net = Calc.boqNet(sub, discPct);
    const vat = Calc.boqVatAmount(net, vatPct);
    const final = Calc.boqFinal(sub, discPct, vatPct);
    const count = boqState.lines.filter(function (l) { return l.item.trim() !== '' || l.qty !== '' || l.rate !== ''; }).length;

    updateBoqHeaders();
    $('boq-count').textContent = count + ' item' + (count === 1 ? '' : 's');
    $('bq-sub').textContent = boqMoney(sub);
    $('bq-disc').textContent = '\u2212 ' + boqMoney(disc);
    $('bq-net').textContent = boqMoney(net);
    $('bq-vat-amt').textContent = '+' + boqMoney(vat);
    $('bq-final').textContent = boqMoney(final);
    $('bq-disc-label').textContent = 'Discount' + (discPct > 0 ? ' (' + Calc.fmtPct(discPct) + ')' : '');
    $('bq-vat-label').textContent = vatPct > 0 ? 'VAT (' + Calc.fmtPct(vatPct) + ')' : 'VAT';

    buildBoqDoc();
  }

  function quoMoney(v) { return boqMoney(v); }

  // Build the formal quotation letter (PDF source) into #quotation-doc.
  function buildBoqDoc() {
    const m = boqState.meta;
    const lines = boqState.lines.filter(function (l) { return l.item.trim() !== '' || l.qty !== '' || l.rate !== ''; });
    const sub = Calc.boqSubTotal(boqState.lines);
    const discPct = num(boqState.discount);
    const vatPct = num(boqState.vat);
    const disc = Calc.boqDiscount(sub, discPct);
    const net = Calc.boqNet(sub, discPct);
    const vat = Calc.boqVatAmount(net, vatPct);
    const final = Calc.boqFinal(sub, discPct, vatPct);
    const dateStr = m.date
      ? new Date(m.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';
    const ref = m.ref || '—';
    const clientName = m.client || '—';
    const designation = m.designation || '';
    const company = m.company || '';
    const address = m.address || '';

    const fmLines = lines.map(function (l) {
      const amt = boqLineAmount(l);
      return { desc: l.item || '', unit: l.unit, qty: l.qty, rate: l.rate === '' ? null : Number(l.rate), amount: amt, money: quoMoney };
    });
    const totals = { sub: sub, discPct: discPct, disc: disc, net: net, vatPct: vatPct, vat: vat, final: final, money: quoMoney, colspan: 3 };
    const curLabel = boqCur();

    const termsText = brand.terms.trim() !== '' ? brand.terms :
      'Payment terms: [e.g. 50% mobilization advance with order, balance on delivery/completion.]\nWarranty: [e.g. workmanship warranted for 12 months from handover.]\nMobilization: [e.g. mobilization within 7 working days of order confirmation.]\nValidity: This quotation is valid for 30 days from the date above.';

    $('quotation-doc').innerHTML =
      '<div class="quo-doc fm-doc">' +
        formalLetterhead({
          logo: brand.logo,
          name: brandDocTitle(),
          address: brand.address,
          phone: brandPhone(),
          email: brandEmail(),
          website: brand.website,
          spec: brand.spec,
          tin: brand.tin,
          docType: 'QUOTATION',
          refLabel: 'Quotation No',
          ref: m.ref && m.ref !== '\u2014' ? m.ref : '',
          date: dateStr
        }) +
        formalMetaBox(
          [['Customer Name', clientName], ['Designation', designation], ['Company', company], ['Address', address]],
          [['Project', m.project || ''], ['PO No', m.poNo || ''], ['Delivery Terms', m.delivery || ''], ['Ship To', m.shipTo || ''], ['HS Code', m.hsCode || '']],
          'Consignee / Billed To'
        ) +
        formalLineTable(fmLines, curLabel, true, totals) +
        fmWordsLine(final, curLabel) +
        formalTermsBlock(termsText) +
        '<div class="fm-footer' + (formalBankBlock({}) ? '' : ' fm-footer-single') + '">' +
          formalBankBlock({}) +
          formalSignoff(brandDocTitle()) +
        '</div>' +
      '</div>';
  }

  function renderBoq() {
    fillBoqMeta();
    renderBoqRows();
    updateBoqSummary();
  }

  function addBoqRow() {
    const rows = Array.prototype.slice.call($('boq-rows').querySelectorAll('.qr-row'));
    const last = rows[rows.length - 1];
    if (last) {
      const items = Array.prototype.slice.call(last.querySelectorAll('input'));
      const allEmpty = items.every(function (i) { return i.value === ''; });
      if (allEmpty) { last.querySelector('.bq-item').focus(); return; }
    }
    boqState.lines.push(boqLineTemplate());
    saveBoq();
    renderBoqRows();
    updateBoqSummary();
    const first = $('boq-rows').querySelectorAll('.qr-row:last-child .bq-item')[0];
    if (first) first.focus();
  }

  async function clearBoq() {
    if (!(await confirmAction({ title: 'Clear BOQ items?', message: 'Clear all BOQ items? This cannot be undone.', confirmLabel: 'Clear', danger: true }))) return;
    boqState.lines = [];
    saveBoq();
    renderBoqRows();
    updateBoqSummary();
  }

  async function resetBoq() {
    if (!(await confirmAction({ title: 'Reset quotation?', message: 'This clears the details, items, discount and VAT.', confirmLabel: 'Reset', danger: true }))) return;
    boqState = emptyBoq();
    saveBoq();
    renderBoq();
  }

  function exportBoqPdf() {
    const err = $('boq-error');
    const hasItems = boqState.lines.some(function (l) { return (Number(l.qty) || 0) > 0 && (Number(l.rate) || 0) > 0; });
    if (!hasItems) {
      err.textContent = 'Add at least one BOQ line with a quantity and a rate before exporting.';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    buildBoqDoc();
    // Live values (client, ref, date, items, discount, VAT) were compiled
    // into #quotation-doc by buildBoqDoc() just above.
    exportViaPrintWindow($('quotation-doc'), 'Quotation ' + (boqState.meta.ref || ''));
    pushHistory({
      type: 'pdf', tool: 'boq', toolName: 'Quotation',
      title: boqState.meta.client || 'Quotation',
      total: quoMoney(Calc.boqFinal(Calc.boqSubTotal(boqState.lines), num(boqState.discount), num(boqState.vat))),
      draft: { tool: 'boq' }
    });
  }

  /* ── Smart Invoice & Document Builder (tool #05) ──────────────── */
  // One tool, four document types (Quotation / Proforma / Commercial /
  // Delivery Note) with type-specific fields, a customizable business
  // letterhead (incl. logo upload), and a one-click html2pdf export.
  const INV_KEY = 'cm-inv-v1';

  const INV_DOC_TYPES = {
    quotation:  { label: 'Quotation',              doc: 'QUOTATION' },
    proforma:   { label: 'Proforma Invoice',       doc: 'PROFORMA INVOICE' },
    commercial: { label: 'Commercial / Tax Invoice', doc: 'TAX INVOICE' },
    delivery:   { label: 'Delivery Note',          doc: 'DELIVERY NOTE' }
  };

  const INV_FIELDS = {
    quotation: [
      { key: 'client', label: 'Client name', type: 'text', ph: 'e.g. R. Perera' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'ref', label: 'Quotation ref', type: 'text', ph: 'e.g. QTN/2026/001' }
    ],
    proforma: [
      { key: 'client', label: 'Client name', type: 'text', ph: 'e.g. R. Perera' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'ref', label: 'Proforma no', type: 'text', ph: 'e.g. PI/2026/001' },
      { key: 'payment', label: 'Payment terms', type: 'text', ph: 'e.g. 50% advance, balance on delivery' },
      { key: 'bank', label: 'Bank name', type: 'text', ph: 'e.g. Commercial Bank' },
      { key: 'account', label: 'Account number', type: 'text', ph: 'e.g. 1001234567890' },
      { key: 'swift', label: 'SWIFT code', type: 'text', ph: 'e.g. CCEYLKLX' },
      { key: 'branch', label: 'Branch code', type: 'text', ph: 'e.g. 001' }
    ],
    commercial: [
      { key: 'invoice', label: 'Invoice no', type: 'text', ph: 'e.g. INV/2026/001' },
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'vatreg', label: 'VAT / Tax reg no', type: 'text', ph: 'e.g. VAT123456789' },
      { key: 'consignee', label: 'Consignee details', type: 'text', ph: 'e.g. Acme Holdings, Colombo' },
      { key: 'client', label: 'Bill to (client)', type: 'text', ph: 'e.g. R. Perera' },
      { key: 'poNo', label: 'PO no', type: 'text', ph: 'e.g. PO-2026-0451' },
      { key: 'project', label: 'Project name', type: 'text', ph: 'e.g. Warehouse fire-alarm upgrade' },
      { key: 'currency', label: 'Currency', type: 'select', options: null } // filled from TOOL_CURRENCIES at render
    ],
    delivery: [
      { key: 'client', label: 'Deliver to (client)', type: 'text', ph: 'e.g. R. Perera' },
      { key: 'date', label: 'Delivery date', type: 'date' },
      { key: 'ref', label: 'Delivery note no', type: 'text', ph: 'e.g. DN/2026/001' },
      { key: 'address', label: 'Delivery address', type: 'text', ph: 'e.g. 42 Galle Road, Colombo' },
      { key: 'poNo', label: 'PO no', type: 'text', ph: 'e.g. PO-2026-0451' }
    ]
  };

  function emptyInv() {
    return { docType: 'quotation', company: { name: '', address: '', contact: '', logo: '' }, meta: {}, lines: [], currency: 'LKR' };
  }

  function loadInv() {
    try {
      const raw = localStorage.getItem(INV_KEY);
      if (!raw) return emptyInv();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyInv();
      return {
        docType: INV_DOC_TYPES[parsed.docType] ? parsed.docType : 'quotation',
        company: Object.assign({}, emptyInv().company, parsed.company || {}),
        meta: parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
        lines: Array.isArray(parsed.lines) ? parsed.lines : [],
        currency: toolCurrencyCodes().indexOf(parsed.currency) !== -1 ? parsed.currency : 'LKR'
      };
    } catch (e) {
      return emptyInv();
    }
  }

  let invState = loadInv();

  function saveInv() {
    try { localStorage.setItem(INV_KEY, JSON.stringify(invState)); } catch (e) { /* ignore */ }
  }

  function invLineTemplate() {
    return { id: uid(), description: '', model: '', unit: 'Nr', qty: '', rate: '' };
  }

  function invLineAmount(row) { return Calc.boqAmount(row.qty, row.rate); }

  function invMoney(v) { return Calc.fmtToolMoney(v, invState.currency); }

  function invIsMoneyType() { return invState.docType !== 'delivery'; }

  function renderInvFields() {
    const wrap = $('inv-fields');
    const fields = (INV_FIELDS[invState.docType] || []).map(function (f) {
      if (f.key === 'currency') {
        return Object.assign({}, f, { options: toolCurrencyCodes() });
      }
      return f;
    });
    const labels = Calc.TOOL_CURRENCIES;
    $('inv-doc-badge').textContent = (INV_DOC_TYPES[invState.docType] || {}).label || 'Quotation';
    wrap.innerHTML = fields.map(function (f) {
      const id = 'inv-f-' + f.key;
      if (f.type === 'select') {
        const opts = (f.options || []).map(function (o) {
          return '<option value="' + o + '">' + o + (labels[o] ? ' (' + labels[o].symbol.trim() + ')' : '') + '</option>';
        }).join('');
        return '<div class="field"><label for="' + id + '">' + f.label + '</label>' +
          '<select id="' + id + '" data-key="' + f.key + '">' + opts + '</select></div>';
      }
      const type = f.type === 'date' ? 'date' : 'text';
      const ph = f.ph ? ' placeholder="' + f.ph + '"' : '';
      return '<div class="field"><label for="' + id + '">' + f.label + '</label>' +
        '<input type="' + type + '" id="' + id + '" data-key="' + f.key + '"' + ph + ' autocomplete="off"></div>';
    }).join('');
    for (let i = 0; i < fields.length; i++) {
      const el = document.getElementById('inv-f-' + fields[i].key);
      if (!el) continue;
      const val = invState.meta[fields[i].key];
      if (fields[i].key === 'currency') el.value = invState.currency;
      else if (fields[i].key === 'date') el.value = val || todayStr();
      else el.value = val || '';
    }
  }

  function renderInvRows() {
    const tbody = $('inv-rows');
    const money = invIsMoneyType();
    if (invState.lines.length === 0) {
      tbody.innerHTML = '<tr><td colspan="' + (money ? 7 : 5) + '" class="empty-cell">No items yet. Add the first line and the totals update instantly.</td></tr>';
    } else {
      const rows = invState.lines.map(function (row) {
        const amount = invLineAmount(row);
        return '<tr class="qr-row" data-id="' + row.id + '">' +
          '<td><input type="text" class="inv-description" value="' + esc(row.description) + '" placeholder="e.g. Supply & install conduit" autocomplete="off"></td>' +
          '<td><input type="text" class="inv-model" value="' + esc(row.model) + '" placeholder="e.g. 25mm" autocomplete="off"></td>' +
          '<td><input type="text" class="inv-unit" list="inv-units" value="' + esc(row.unit) + '" placeholder="Nr" autocomplete="off" aria-label="Unit"></td>' +
          '<td><input type="text" inputmode="decimal" data-numeric="1" class="inv-qty" min="0" step="any" inputmode="decimal" value="' + esc(String(row.qty)) + '" placeholder="0" aria-label="Quantity"></td>' +
          '<td class="inv-rate-col"><input type="text" inputmode="decimal" data-numeric="1" class="inv-rate" min="0" step="any" inputmode="decimal" value="' + esc(String(row.rate)) + '" placeholder="0" aria-label="Rate"></td>' +
          '<td class="inv-amt-col qr-amount">' + (amount === null ? '\u2014' : invMoney(amount)) + '</td>' +
          '<td><button type="button" class="qr-del" data-id="' + row.id + '" aria-label="Remove item">\u2715</button></td>' +
        '</tr>';
      });
      tbody.innerHTML = rows.join('');
    }
    applyInvColumns();
  }

  function applyInvColumns() {
    const money = invIsMoneyType();
    $('inv-table').classList.toggle('hide-money', !money);
    $('inv-summary').hidden = !money;
    const sym = Calc.TOOL_CURRENCIES[invState.currency].symbol.trim();
    $('inv-rate-th').textContent = 'Rate (' + sym + ')';
    $('inv-amount-th').textContent = 'Amount (' + sym + ')';
  }

  function updateInvSummary() {
    const sub = Calc.boqSubTotal(invState.lines);
    const count = invState.lines.filter(function (l) { return l.description.trim() !== '' || l.qty !== '' || l.rate !== ''; }).length;
    $('inv-count').textContent = count + ' item' + (count === 1 ? '' : 's');
    $('inv-sub').textContent = invMoney(sub);
    $('inv-total').textContent = invMoney(sub);
    applyInvColumns();
    buildInvDoc();
  }

  function invDateStr(v) {
    return v ? new Date(v + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  }

  function buildInvDoc() {
    const dt = INV_DOC_TYPES[invState.docType] || INV_DOC_TYPES.quotation;
    const co = invState.company;
    const meta = invState.meta;
    const money = invIsMoneyType();
    const cur = invState.currency;
    // Brand-kit fallbacks (pure read — no state mutation): empty company
    // fields inherit the letterhead set up in Brand & Theme Settings.
    const coName = co.name || brandDocTitle();
    const coAddr = co.address || brand.address;
    const coContact = co.contact || brand.contact;
    const coLogo = co.logo || brand.logo;
    const coPair = parseContactPair(coContact);
    const coWeb = co.contact && co.contact !== brand.contact ? '' : brand.website;
    const coSpec = co.contact && co.contact !== brand.contact ? '' : brand.spec;

    const lines = invState.lines
      .filter(function (l) { return l.description.trim() !== '' || l.qty !== '' || l.rate !== ''; })
      .map(function (l) {
        return {
          // Formal layout folds Make & Model into the description column.
          desc: l.model ? l.description + ' \u2014 ' + l.model : l.description,
          unit: l.unit,
          qty: l.qty,
          rate: l.rate === '' ? null : Number(l.rate),
          amount: invLineAmount(l),
          money: invMoney
        };
      });

    const sub = Calc.boqSubTotal(invState.lines);
    const totals = money ? {
      sub: sub, discPct: 0, disc: 0, net: sub,
      vatPct: 0, vat: 0, final: sub,
      money: invMoney, colspan: 3
    } : null;

    const refLabels = { quotation: 'Quotation No', proforma: 'Proforma No', commercial: 'Invoice No', delivery: 'Note No' };
    const leftRows = [
      ['Customer Name', meta.client],
      ['Address', meta.address],
      ['Consignee', meta.consignee],
      ['TIN / Reg No', meta.vatreg],
      ['Currency', money ? cur : '']
    ];
    const rightRows = [
      ['Delivery Terms', meta.delivery],
      ['Ship To', invState.docType === 'delivery' ? meta.address : ''],
      ['Project Name', meta.project],
      ['PO No', meta.poNo]
    ];

    const bankHtml = formalBankBlock(meta);
    const dateStr = invDateStr(meta.date);

    $('inv-doc').innerHTML =
      '<div class="quo-doc fm-doc">' +
        formalLetterhead({
          logo: coLogo,
          name: coName,
          address: coAddr,
          phone: coPair.phone,
          email: coPair.email,
          website: coWeb,
          spec: coSpec,
          tin: brand.tin,
          docType: dt.doc,
          refLabel: refLabels[invState.docType] || 'Doc No',
          ref: meta.ref || meta.invoice || '',
          date: dateStr
        }) +
        formalMetaBox(leftRows, rightRows, invState.docType === 'delivery' ? 'Deliver To / Consignee' : 'Consignee / Billed To') +
        formalLineTable(lines, cur, money, totals) +
        (money ? fmWordsLine(sub, cur) : '') +
        '<div class="fm-footer' + (bankHtml ? '' : ' fm-footer-single') + '">' +
          bankHtml +
          formalSignoff(coName) +
        '</div>' +
      '</div>';
  }

  function renderInv() {
    $('inv-doctype').value = invState.docType;
    $('inv-co-name').value = invState.company.name;
    $('inv-co-address').value = invState.company.address;
    $('inv-co-contact').value = invState.company.contact;
    renderInvFields();
    renderInvRows();
    updateInvSummary();
    syncInvCurrencySelect();
  }

  function addInvRow() {
    const rows = Array.prototype.slice.call($('inv-rows').querySelectorAll('.qr-row'));
    const last = rows[rows.length - 1];
    if (last) {
      const items = Array.prototype.slice.call(last.querySelectorAll('input'));
      const allEmpty = items.every(function (i) { return i.value === ''; });
      if (allEmpty) { last.querySelector('.inv-description').focus(); return; }
    }
    invState.lines.push(invLineTemplate());
    saveInv();
    renderInvRows();
    updateInvSummary();
    const first = $('inv-rows').querySelectorAll('.qr-row:last-child .inv-description')[0];
    if (first) first.focus();
  }

  async function clearInv() {
    if (!(await confirmAction({ title: 'Clear line items?', message: 'Clear all line items? This cannot be undone.', confirmLabel: 'Clear', danger: true }))) return;
    invState.lines = [];
    saveInv();
    renderInvRows();
    updateInvSummary();
  }

  async function resetInv() {
    if (!(await confirmAction({ title: 'Reset document?', message: 'This clears the type, fields, business details and items.', confirmLabel: 'Reset', danger: true }))) return;
    invState = emptyInv();
    saveInv();
    renderInv();
  }

  function exportInvPdf() {
    const err = $('inv-error');
    const hasItems = invState.lines.some(function (l) { return (Number(l.qty) || 0) > 0; });
    if (!hasItems) { err.textContent = 'Add at least one line item before generating.'; err.hidden = false; return; }
    err.hidden = true;
    buildInvDoc();
    // Live values (doc type, business header + logo, fields, items,
    // currency) were compiled into #inv-doc by buildInvDoc() just above.
    exportViaPrintWindow($('inv-doc'), INV_DOC_TYPES[invState.docType].label + ' ' + (invState.meta.ref || invState.meta.invoice || ''));
    pushHistory({
      type: 'pdf', tool: 'invoice', toolName: 'Smart Invoice & Document Builder',
      title: invState.meta.client || INV_DOC_TYPES[invState.docType].label,
      total: (function () { let t = 0; for (let i = 0; i < invState.lines.length; i++) { const a = invLineAmount(invState.lines[i]); if (a !== null) t += a; } return invMoney(t); })(),
      draft: { tool: 'invoice' }
    });
  }

  /* ── Margin & Markup Pricing Calculator (tool #04) ─────────── */
  // Total cost = direct cost + overhead%. Price solves the margin or
  // markup target; profit, margin and markup are always shown so the two
  // views can be compared. Invalid/blank inputs show "—" (never NaN).
  const PR_KEY = 'cm-pr-v1';

  function emptyPricing() {
    return { cost: '', overhead: '', target: '', mode: 'margin' };
  }

  function loadPricing() {
    try {
      const raw = localStorage.getItem(PR_KEY);
      if (!raw) return emptyPricing();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyPricing();
      return {
        cost: parsed.cost === undefined ? '' : String(parsed.cost),
        overhead: parsed.overhead === undefined ? '' : String(parsed.overhead),
        target: parsed.target === undefined ? '' : String(parsed.target),
        mode: parsed.mode === 'markup' ? 'markup' : 'margin'
      };
    } catch (e) {
      return emptyPricing();
    }
  }

  let prState = loadPricing();

  function savePricing() {
    try { localStorage.setItem(PR_KEY, JSON.stringify(prState)); } catch (e) { /* ignore */ }
  }

  function prCur() { return toolCurrency.pricing; }

  function prMoney(v) { return Calc.fmtToolMoney(v, prCur()); }

  function prModeLabel() { return prState.mode === 'markup' ? 'Markup' : 'Margin'; }

  function updatePricing() {
    const r = Calc.pricingCalc(prState.cost, prState.overhead, prState.target, prState.mode);
    const has = r.price !== null;
    const cur = Calc.TOOL_CURRENCIES[prCur()];

    $('pr-price').textContent = has ? prMoney(r.price) : '\u2014';
    $('pr-profit').textContent = has ? prMoney(r.profit) : '\u2014';
    $('pr-total-cost').textContent = has ? prMoney(r.totalCost) : '\u2014';
    $('pr-overhead-amt').textContent = has ? prMoney(r.totalCost - Number(prState.cost)) : '\u2014';
    $('pr-margin').textContent = has ? Calc.fmtPct(r.marginPct) : '\u2014';
    $('pr-markup').textContent = has ? Calc.fmtPct(r.markupPct) : '\u2014';

    $('pr-target-label').textContent = prModeLabel() === 'Markup' ? 'Profit markup' : 'Profit margin';

    const err = $('pr-error');
    if (has && prState.mode === 'margin' && Number(prState.target) >= 100) {
      err.textContent = 'A 100% margin is impossible — capped at 99.9% for the calculation.';
      err.hidden = false;
    } else if (has && Number(prState.target) < 0) {
      err.textContent = 'Profit target must be 0 or more.';
      err.hidden = false;
    } else {
      err.hidden = true;
    }
  }

  function fillPricingForm() {
    $('pr-cost').value = prState.cost;
    $('pr-overhead').value = prState.overhead;
    $('pr-target').value = prState.target;
    $('pr-mode-margin').classList.toggle('active', prState.mode === 'margin');
    $('pr-mode-margin').setAttribute('aria-selected', prState.mode === 'margin' ? 'true' : 'false');
    $('pr-mode-markup').classList.toggle('active', prState.mode === 'markup');
    $('pr-mode-markup').setAttribute('aria-selected', prState.mode === 'markup' ? 'true' : 'false');
    updatePricing();
  }

  async function resetPricing() {
    if (!(await confirmAction({ title: 'Reset pricing calculator?', message: 'This clears cost, overhead and profit target.', confirmLabel: 'Reset', danger: true }))) return;
    prState = emptyPricing();
    savePricing();
    fillPricingForm();
  }

  function copyPricingSummary() {
    const r = Calc.pricingCalc(prState.cost, prState.overhead, prState.target, prState.mode);
    if (r.price === null) {
      window.alert('Enter a base direct cost and a profit target first.');
      return;
    }
    const lines = [
      'PRICING SUMMARY',
      '',
      'Base direct cost: ' + prMoney(Number(prState.cost)),
      'Overhead: ' + (num(prState.overhead) > 0 ? Calc.fmtPct(num(prState.overhead)) + ' (' + prMoney(r.totalCost - Number(prState.cost)) + ')' : 'none'),
      'Total cost (incl. overhead): ' + prMoney(r.totalCost),
      'Profit target: ' + prModeLabel() + ' ' + Calc.fmtPct(Math.max(Number(prState.target), 0)),
      '',
      'Selling price: ' + prMoney(r.price),
      'Net profit: ' + prMoney(r.profit) + ' (margin ' + Calc.fmtPct(r.marginPct) + ' · markup ' + Calc.fmtPct(r.markupPct) + ')'
    ];
    const text = lines.join('\n');
    pushHistory({
      type: 'copy', tool: 'pricing', toolName: 'Margin & Markup Pricing Calculator',
      title: 'Pricing summary', total: prMoney(r.price),
      draft: { tool: 'pricing' }
    });
    const btn = $('pr-copy');
    const done = function () { flashCopied(btn); };
    const fallback = function () {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-10000px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {
        window.alert('Copy failed — please copy the summary manually.');
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* ── Import Duty & Landed Cost Calculator (tool #06) ──────────── */
  // Shared clipboard helper: copies text, flashes the button label, falls
  // back to execCommand when the async Clipboard API is unavailable.
  function copyText(text, btn, resetLabel) {
    const done = function () { flashCopied(btn); };
    const fallback = function () {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-10000px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {
        window.alert('Copy failed — please copy the breakdown manually.');
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  const DUTY_KEY = 'cm-duty-v1';

  function emptyDuty() {
    return { cif: '', units: '', duty: '', pal: '', cess: '', sscl: '', vat: '18' };
  }

  function loadDuty() {
    try {
      const raw = localStorage.getItem(DUTY_KEY);
      if (!raw) return emptyDuty();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyDuty();
      const out = emptyDuty();
      for (const k in out) {
        if (parsed[k] !== undefined) out[k] = String(parsed[k]);
      }
      return out;
    } catch (e) {
      return emptyDuty();
    }
  }

  let dutyState = loadDuty();

  function saveDuty() {
    try { localStorage.setItem(DUTY_KEY, JSON.stringify(dutyState)); } catch (e) { /* ignore */ }
  }

  function dutyCur() { return toolCurrency.duty; }

  function dutyMoney(v) { return Calc.fmtToolMoney(v, dutyCur()); }

  function updateDuty() {
    const curCode = dutyCur();
    $('dt-cif-cur').textContent = curCode;
    const r = Calc.dutyCalc(dutyState.cif, {
      duty: dutyState.duty, pal: dutyState.pal, cess: dutyState.cess,
      sscl: dutyState.sscl, vat: dutyState.vat
    });
    const has = r !== null;
    const units = Number(dutyState.units);
    const hasUnits = has && Number.isFinite(units) && units > 0;

    $('dt-tax').textContent = has ? dutyMoney(r.totalTax) : '\u2014';
    $('dt-landed').textContent = has ? dutyMoney(r.landed) : '\u2014';
    $('dt-per-unit').textContent = hasUnits ? dutyMoney(r.landed / units) : '\u2014';
    $('dt-cif-amt').textContent = has ? dutyMoney(r.cif) : '\u2014';
    $('dt-duty-amt').textContent = has && num(dutyState.duty) > 0 ? dutyMoney(r.duty) : '\u2014';
    $('dt-pal-amt').textContent = has && num(dutyState.pal) > 0 ? dutyMoney(r.pal) : '\u2014';
    $('dt-cess-amt').textContent = has && num(dutyState.cess) > 0 ? dutyMoney(r.cess) : '\u2014';
    $('dt-sscl-amt').textContent = has && num(dutyState.sscl) > 0 ? dutyMoney(r.sscl) : '\u2014';
    $('dt-vat-amt').textContent = has && num(dutyState.vat) > 0 ? dutyMoney(r.vat) : '\u2014';
    $('dt-tax-line').textContent = has ? dutyMoney(r.totalTax) : '\u2014';
  }

  function fillDutyForm() {
    $('dt-cif').value = dutyState.cif;
    $('dt-units').value = dutyState.units;
    $('dt-duty').value = dutyState.duty;
    $('dt-pal').value = dutyState.pal;
    $('dt-cess').value = dutyState.cess;
    $('dt-sscl').value = dutyState.sscl;
    $('dt-vat').value = dutyState.vat;
    updateDuty();
  }

  function copyDutyBreakdown() {
    const r = Calc.dutyCalc(dutyState.cif, {
      duty: dutyState.duty, pal: dutyState.pal, cess: dutyState.cess,
      sscl: dutyState.sscl, vat: dutyState.vat
    });
    if (!r) {
      window.alert('Enter a CIF value first.');
      return;
    }
    const sym = Calc.TOOL_CURRENCIES[dutyCur()].symbol.trim();
    const line = function (lab, pct, amt) {
      return lab + (pct > 0 ? ' (' + Calc.fmtPct(pct) + ')' : '') + ': ' + sym + Calc.fmtNum(amt);
    };
    const lines = [
      'IMPORT DUTY & LANDED COST BREAKDOWN',
      '',
      'CIF value: ' + dutyMoney(r.cif),
      line('Customs duty', num(dutyState.duty), r.duty),
      line('PAL', num(dutyState.pal), r.pal),
      line('CESS', num(dutyState.cess), r.cess),
      line('SSCL', num(dutyState.sscl), r.sscl),
      line('VAT', num(dutyState.vat), r.vat),
      '',
      'Total tax / duty payable: ' + dutyMoney(r.totalTax),
      'Total landed cost: ' + dutyMoney(r.landed)
    ];
    const units = Number(dutyState.units);
    if (Number.isFinite(units) && units > 0) {
      lines.push('Landed cost per unit (' + Calc.fmtNum(units) + ' units): ' + dutyMoney(r.landed / units));
    }
    lines.push('', 'Percentages applied on CIF as entered — verify current rates with your customs agent.');
    copyText(lines.join('\n'), $('dt-copy'), 'Copy Breakdown');
    pushHistory({
      type: 'copy', tool: 'duty', toolName: 'Import Tax & Landed Cost Calculator',
      title: 'Import duty breakdown', total: dutyMoney(r.landed),
      draft: { tool: 'duty' }
    });
  }

  /* ── Variation & Change Order Generator (tool #07) ────────────── */
  const VAR_KEY = 'cm-var-v1';

  function emptyVariation() {
    return { project: '', original: '', added: '', days: '', desc: '' };
  }

  function loadVariation() {
    try {
      const raw = localStorage.getItem(VAR_KEY);
      if (!raw) return emptyVariation();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyVariation();
      const out = emptyVariation();
      for (const k in out) {
        if (parsed[k] !== undefined) out[k] = String(parsed[k]);
      }
      return out;
    } catch (e) {
      return emptyVariation();
    }
  }

  let varState = loadVariation();

  function saveVariation() {
    try { localStorage.setItem(VAR_KEY, JSON.stringify(varState)); } catch (e) { /* ignore */ }
  }

  function varCur() { return toolCurrency.variation; }

  function varMoney(v) { return Calc.fmtToolMoney(v, varCur()); }

  function updateVariation() {
    const r = Calc.variationCalc(varState.original, varState.added);
    const has = r.revised !== null;
    $('vr-revised').textContent = has ? varMoney(r.revised) : '\u2014';
    $('vr-increase').textContent = has ? '+' + Calc.fmtPct(r.increase) : '\u2014';
    const err = $('vr-error');
    err.hidden = true;
    buildVariationDoc();
  }

  function fillVariationForm() {
    $('vr-project').value = varState.project;
    $('vr-original').value = varState.original;
    $('vr-added').value = varState.added;
    $('vr-days').value = varState.days;
    $('vr-desc').value = varState.desc;
    updateVariation();
  }

  // Build the formal variation document (PDF source) into #variation-doc.
  function buildVariationDoc() {
    const r = Calc.variationCalc(varState.original, varState.added);
    const sym = Calc.TOOL_CURRENCIES[varCur()].symbol.trim();
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const money = function (v) { return sym + Calc.fmtNum(v); };
    const has = r.revised !== null;
    const desc = (varState.desc || '').trim();
    const paras = desc.split('\n').filter(function (p) { return p.trim() !== ''; });
    const descHtml = paras.length
      ? paras.map(function (p) { return '<p class="var-desc-p">' + esc(p) + '</p>'; }).join('')
      : '<p class="var-desc-p var-muted">[Describe the proposed additional work here.]</p>';

    $('variation-doc').innerHTML =
      '<div class="var-doc fm-doc">' +
        formalLetterhead({
          logo: brand.logo,
          name: brandDocTitle(),
          address: brand.address,
          phone: brandPhone(),
          email: brandEmail(),
          website: brand.website,
          spec: '',
          tin: brand.tin,
          docType: 'VARIATION ORDER',
          refLabel: 'Variation No',
          ref: varState.ref || '',
          date: dateStr
        }) +
        '<p class="quo-intro">Dear Sir/Madam,<br>We request your approval for the following variation to the contract:</p>' +
        '<h3 class="var-h3">Description of additional work</h3>' +
        descHtml +
        '<table class="quo-table var-table">' +
          '<tbody>' +
            '<tr><td>Original contract value</td><td class="q-r">' + (has ? money(Number(varState.original)) : '\u2014') + '</td></tr>' +
            '<tr><td>Added cost of variation work (materials &amp; labor)</td><td class="q-r">' + (has ? money(Number(varState.added)) : '\u2014') + '</td></tr>' +
            '<tr><td>Time extension requested</td><td class="q-r">' + (num(varState.days) > 0 ? esc(String(num(varState.days))) + ' day' + (num(varState.days) === 1 ? '' : 's') : '\u2014') + '</td></tr>' +
            '<tr class="q-final-row"><td><strong>Revised contract value</strong></td><td class="q-r"><strong>' + (has ? money(r.revised) : '\u2014') + '</strong></td></tr>' +
            '<tr><td>Contract value increase</td><td class="q-r">' + (has ? '+' + Calc.fmtPct(r.increase) : '\u2014') + '</td></tr>' +
          '</tbody>' +
        '</table>' +
        '<div class="quo-terms"><h3>Approval</h3><ul>' +
          '<li>By signing below, the client approves the variation described above, the revised contract value, and the time extension stated.</li>' +
          '<li>All other terms and conditions of the original contract remain unchanged.</li>' +
        '</ul></div>' +
        '<div class="fm-footer">' +
          formalBankBlock({}) +
          '<div class="fm-signbox"><h3>Approval</h3>' +
            '<div class="fm-signpair">' +
              '<div class="quo-sign-left"><span>Prepared by (Contractor)</span><span class="q-sigline"></span><span>Engineer / Authorized Signatory</span></div>' +
              '<div class="quo-sign-left"><span>Approved by (Client)</span><span class="q-sigline"></span><span>Name \u00b7 Signature \u00b7 Date</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function exportVariationPdf() {
    const r = Calc.variationCalc(varState.original, varState.added);
    if (r.revised === null) {
      window.alert('Enter the original contract value and the added cost first.');
      return;
    }
    buildVariationDoc();
    // Live values (project, desc, figures, dates) were compiled into
    // #variation-doc by buildVariationDoc() just above.
    exportViaPrintWindow($('variation-doc'), 'Contract variation ' + (varState.project || ''));
    pushHistory({
      type: 'pdf', tool: 'variation', toolName: 'Variation & Change Order Generator',
      title: varState.project || 'Contract variation',
      total: varMoney(Calc.variationCalc(varState.original, varState.added).revised),
      draft: { tool: 'variation' }
    });
  }

  /* ── Freelance Rate & Overhead Breakeven (tool #08) ───────────── */
  const BK_KEY = 'cm-bk-v1';

  function emptyBreakeven() {
    return { net: '', overhead: '', days: '', admin: '', dayhours: '8', tax: '' };
  }

  function loadBreakeven() {
    try {
      const raw = localStorage.getItem(BK_KEY);
      if (!raw) return emptyBreakeven();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyBreakeven();
      const out = emptyBreakeven();
      for (const k in out) {
        if (parsed[k] !== undefined) out[k] = String(parsed[k]);
      }
      return out;
    } catch (e) {
      return emptyBreakeven();
    }
  }

  let bkState = loadBreakeven();

  function saveBreakeven() {
    try { localStorage.setItem(BK_KEY, JSON.stringify(bkState)); } catch (e) { /* ignore */ }
  }

  function bkCur() { return toolCurrency.breakeven; }

  function bkMoney(v) { return Calc.fmtToolMoney(v, bkCur()); }

  function updateBreakeven() {
    const r = Calc.breakevenCalc(bkState.net, bkState.overhead, bkState.days, bkState.admin, bkState.dayhours, bkState.tax);
    const has = r !== null && r.hourly !== null;
    const net = Number(bkState.net) || 0;
    const oh = Number(bkState.overhead) || 0;
    const taxPct = Math.min(Math.max(Number(bkState.tax) || 0, 0), 99);

    $('bk-hourly').textContent = has ? bkMoney(r.hourly) : '\u2014';
    $('bk-daily').textContent = has ? bkMoney(r.daily) : '\u2014';
    $('bk-hours').textContent = r !== null ? Calc.fmtNum(r.billableHours) + ' h' : '\u2014';
    $('bk-gross').textContent = has ? bkMoney(r.gross) : '\u2014';

    $('bk-net-line').textContent = Number.isFinite(Number(bkState.net)) && bkState.net !== '' ? bkMoney(net) : '\u2014';
    $('bk-oh-line').textContent = oh > 0 ? bkMoney(oh) : '\u2014';
    $('bk-tax-line').textContent = has && taxPct > 0 ? bkMoney(r.gross - net - oh) + ' (' + Calc.fmtPct(taxPct) + ')' : '\u2014';
    $('bk-admin-line').textContent = r !== null && (Number(bkState.admin) || 0) > 0 ? Calc.fmtNum(r.adminDays) + ' days' : '\u2014';
    $('bk-hours-line').textContent = r !== null ? Calc.fmtNum(r.billableHours) + ' h/yr' : '\u2014';

    const err = $('bk-error');
    if (r !== null && r.hourly === null) {
      err.textContent = 'Your unbilled admin time eats all your working days — reduce admin hours or raise the billable hours per day.';
      err.hidden = false;
    } else {
      err.hidden = true;
    }
  }

  function fillBreakevenForm() {
    $('bk-net').value = bkState.net;
    $('bk-overhead').value = bkState.overhead;
    $('bk-days').value = bkState.days;
    $('bk-admin').value = bkState.admin;
    $('bk-dayhours').value = bkState.dayhours;
    $('bk-tax').value = bkState.tax;
    updateBreakeven();
  }

  function copyBreakevenSummary() {
    const r = Calc.breakevenCalc(bkState.net, bkState.overhead, bkState.days, bkState.admin, bkState.dayhours, bkState.tax);
    if (!r || r.hourly === null) {
      window.alert('Enter at least a target net income and your working days per year.');
      return;
    }
    const lines = [
      'RATE & OVERHEAD BREAKEVEN',
      '',
      'Target net income: ' + bkMoney(Number(bkState.net)),
      'Business overhead: ' + bkMoney(r.overhead),
      'Gross revenue needed / year: ' + bkMoney(r.gross),
      'Billable hours / year: ' + Calc.fmtNum(r.billableHours) +
        (r.adminDays > 0 ? ' (after ' + Calc.fmtNum(r.adminDays) + ' unbilled admin days)' : ''),
      '',
      'Minimum required hourly rate: ' + bkMoney(r.hourly),
      'Required daily rate: ' + bkMoney(r.daily),
      '',
      'Breakeven covers all costs — price above this to make a profit.'
    ];
    copyText(lines.join('\n'), $('bk-copy'), 'Copy Summary');
    pushHistory({
      type: 'copy', tool: 'breakeven', toolName: 'Freelance Rate & Overhead Breakeven Calculator',
      title: 'Rate & overhead breakeven', total: bkMoney(r.hourly) + '/h',
      draft: { tool: 'breakeven' }
    });
  }

  /* ── Cross-Border FX & Fee Adjuster (tool #09) ────────────────── */
  const FX_KEY = 'cm-fx-v1';

  // Preset percentage fees per platform. Fixed fees vary by account and
  // country, so only Stripe's 2.9% + $0.30 (the documented example) is
  // pre-filled; everything stays editable.
  const FX_PLATFORMS = {
    stripe: { pct: 2.9, fixed: 0.30 },
    paypal: { pct: 3.49, fixed: null },
    wise: { pct: 0.5, fixed: null },
    wire: { pct: 0, fixed: null },
    custom: { pct: null, fixed: null }
  };

  function emptyFx() {
    return { target: '', platform: 'stripe', pct: '2.9', fixed: '0.30', markup: '', from: 'USD', to: 'LKR' };
  }

  function loadFx() {
    try {
      const raw = localStorage.getItem(FX_KEY);
      if (!raw) return emptyFx();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyFx();
      const out = emptyFx();
      for (const k in out) {
        if (parsed[k] !== undefined) out[k] = String(parsed[k]);
      }
      if (!FX_PLATFORMS[out.platform]) out.platform = 'stripe';
      return out;
    } catch (e) {
      return emptyFx();
    }
  }

  let fxState = loadFx();

  function saveFx() {
    try { localStorage.setItem(FX_KEY, JSON.stringify(fxState)); } catch (e) { /* ignore */ }
  }

  function fxCur() { return toolCurrency.fx; }

  function fxMoney(v) { return Calc.fmtToolMoney(v, fxCur()); }

  function updateFx() {
    const r = Calc.fxFeeCalc(fxState.target, fxState.pct, fxState.fixed, fxState.markup);
    const has = r !== null && r.invoice !== null;

    $('fx-invoice').textContent = has ? fxMoney(r.invoice) : '\u2014';
    $('fx-received').textContent = has ? fxMoney(r.received) : '\u2014';
    $('fx-fees').textContent = has ? fxMoney(r.fees) : '\u2014';
    $('fx-eff').textContent = has && r.invoice > 0 ? Calc.fmtPct((r.fees / r.invoice) * 100) + ' of invoice' : '\u2014';

    $('fx-pct-amt').textContent = has && r.pctFeeAmt !== null ? fxMoney(r.pctFeeAmt) : '\u2014';
    $('fx-fixed-amt').textContent = has && r.fixedAmt > 0 ? fxMoney(r.fixedAmt) : '\u2014';
    $('fx-fx-amt').textContent = has && r.fxMarkupAmt !== null ? fxMoney(r.fxMarkupAmt) : '\u2014';
    $('fx-total-amt').textContent = has ? fxMoney(r.fees) : '\u2014';
  }

  function fillFxForm() {
    $('fx-target').value = fxState.target;
    $('fx-platform').value = fxState.platform;
    $('fx-pct').value = fxState.pct;
    $('fx-fixed').value = fxState.fixed;
    $('fx-markup').value = fxState.markup;
    $('fx-from').value = fxState.from;
    $('fx-to').value = fxState.to;
    updateFx();
  }

  function applyFxPlatform(name) {
    const p = FX_PLATFORMS[name];
    fxState.platform = name;
    if (p) {
      if (p.pct !== null) { fxState.pct = String(p.pct); }
      if (p.fixed !== null) { fxState.fixed = String(p.fixed); }
    }
    saveFx();
    fillFxForm();
  }

  function copyFxInvoice() {
    const r = Calc.fxFeeCalc(fxState.target, fxState.pct, fxState.fixed, fxState.markup);
    if (!r || r.invoice === null) {
      window.alert('Enter your target payout amount first.');
      return;
    }
    const route = fxState.from + ' \u2192 ' + fxState.to;
    const lines = [
      'INVOICE AMOUNT (fee-adjusted)',
      '',
      'Invoice the client: ' + fxMoney(r.invoice),
      'You receive: ' + fxMoney(r.received),
      'Route: ' + route,
      '',
      'Fee breakdown:',
      '  Percentage fee (' + Calc.fmtPct(Number(fxState.pct) || 0) + '): ' + (r.pctFeeAmt !== null ? fxMoney(r.pctFeeAmt) : '\u2014'),
      '  Fixed fee: ' + (r.fixedAmt > 0 ? fxMoney(r.fixedAmt) : 'none'),
      '  FX markup' + (Number(fxState.markup) > 0 ? ' (' + Calc.fmtPct(Number(fxState.markup)) + ')' : '') + ': ' + (r.fxMarkupAmt !== null ? fxMoney(r.fxMarkupAmt) : 'none'),
      '  Total fees: ' + fxMoney(r.fees),
      '',
      'Send exactly ' + fxMoney(r.invoice) + ' to net ' + fxMoney(r.received) + '.'
    ];
    copyText(lines.join('\n'), $('fx-copy'), 'Copy Invoice Amount');
    pushHistory({
      type: 'copy', tool: 'fx', toolName: 'Cross-Border FX & Fee Adjuster',
      title: 'Fee-adjusted invoice amount', total: fxMoney(r.invoice),
      draft: { tool: 'fx' }
    });
  }

  /* ── Academic GPA & Target Grade Planner (tool #10) ───────────── */
  const GP_KEY = 'cm-gp-v1';

  function emptyGpa() {
    return { current: '', done: '', target: '', remaining: '', courseCur: '', courseTarget: '', courseWeight: '' };
  }

  function loadGpa() {
    try {
      const raw = localStorage.getItem(GP_KEY);
      if (!raw) return emptyGpa();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyGpa();
      const out = emptyGpa();
      for (const k in out) {
        if (parsed[k] !== undefined) out[k] = String(parsed[k]);
      }
      return out;
    } catch (e) {
      return emptyGpa();
    }
  }

  let gpState = loadGpa();

  function saveGpa() {
    try { localStorage.setItem(GP_KEY, JSON.stringify(gpState)); } catch (e) { /* ignore */ }
  }

  function fmtGpa2(v) {
    const n = Number(v);
    return Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : '\u2014';
  }

  function gpaVerdict(g, c) {
    const parts = [];
    if (g) {
      if (g.impossible) {
        parts.push('\u26a0 Not reachable: a ' + fmtGpa2(gpState.target) + ' GPA needs a ' + fmtGpa2(g.required) +
          ' average \u2014 above the 4.0 scale. Adjust your target or add remaining credits.');
      } else if (g.required <= 0) {
        parts.push('Target already met or beaten \u2014 hold your current level to graduate at ' + fmtGpa2(gpState.target) + '.');
      } else {
        parts.push('Reachable: hold a ' + fmtGpa2(g.required) + ' average across the remaining ' +
          Calc.fmtNum(gpState.remaining) + ' credits to graduate at ' + fmtGpa2(gpState.target) + '.');
      }
    }
    if (c) {
      if (c.locked) {
        parts.push('Even a perfect score on the remaining ' + Calc.fmtNum(gpState.courseWeight) + '% cannot reach ' +
          Calc.fmtNum(gpState.courseTarget) + '% in this course.');
      } else if (c.cushion) {
        parts.push('Course target already secured \u2014 no minimum score needed on the remaining work.');
      } else {
        parts.push('Score at least ' + (Math.round(c.needed * 10) / 10) + '% on the remaining ' +
          Calc.fmtNum(gpState.courseWeight) + '% of the course.');
      }
    }
    return parts.join(' ');
  }

  function updateGpa() {
    const g = Calc.gpaRequired(gpState.current, gpState.done, gpState.target, gpState.remaining);
    const c = Calc.courseNeeded(gpState.courseCur, gpState.courseTarget, gpState.courseWeight);

    if (g) {
      $('gp-required').textContent = g.impossible ? '> 4.00' : (g.required <= 0 ? '0.00 ✓' : fmtGpa2(g.required));
    } else {
      $('gp-required').textContent = '\u2014';
    }
    if (c) {
      $('gp-needed').textContent = c.locked ? '> 100%' : (c.cushion ? '0% ✓' : (Math.round(c.needed * 10) / 10) + '%');
    } else {
      $('gp-needed').textContent = '\u2014';
    }

    const verdict = gpaVerdict(g, c);
    $('gp-verdict').textContent = verdict;
    $('gp-verdict').hidden = verdict === '';
  }

  function fillGpaForm() {
    $('gp-current').value = gpState.current;
    $('gp-done').value = gpState.done;
    $('gp-target').value = gpState.target;
    $('gp-remaining').value = gpState.remaining;
    $('gp-course-cur').value = gpState.courseCur;
    $('gp-course-target').value = gpState.courseTarget;
    $('gp-course-weight').value = gpState.courseWeight;
    updateGpa();
  }

  function copyGpaSummary() {
    const g = Calc.gpaRequired(gpState.current, gpState.done, gpState.target, gpState.remaining);
    const c = Calc.courseNeeded(gpState.courseCur, gpState.courseTarget, gpState.courseWeight);
    if (!g && !c) {
      window.alert('Fill in your GPA details (or course grades) first.');
      return;
    }
    const lines = ['GPA & TARGET GRADE FORECAST', ''];
    if (g) {
      lines.push('Current GPA: ' + fmtGpa2(gpState.current) + ' over ' + Calc.fmtNum(gpState.done) + ' credits');
      lines.push('Target GPA at graduation: ' + fmtGpa2(gpState.target));
      if (g.impossible) {
        lines.push('Required average: > 4.00 — NOT reachable (above the scale).');
      } else if (g.required <= 0) {
        lines.push('Required average: 0.00 — target already met or beaten.');
      } else {
        lines.push('Required average in remaining ' + Calc.fmtNum(gpState.remaining) + ' credits: ' + fmtGpa2(g.required));
      }
    }
    if (c) {
      lines.push('');
      if (c.locked) {
        lines.push('Course: even a perfect remaining ' + Calc.fmtNum(gpState.courseWeight) + '% cannot reach ' + Calc.fmtNum(gpState.courseTarget) + '%.');
      } else if (c.cushion) {
        lines.push('Course: target already secured.');
      } else {
        lines.push('Course: score at least ' + (Math.round(c.needed * 10) / 10) + '% on the remaining ' + Calc.fmtNum(gpState.courseWeight) + '%.');
      }
    }
    copyText(lines.join('\n'), $('gp-copy'), 'Copy Summary');
    pushHistory({
      type: 'copy', tool: 'gpa', toolName: 'Academic GPA & Target Grade Planner',
      title: 'GPA forecast', total: '',
      draft: { tool: 'gpa' }
    });
  }
  /* ── History (localStorage) ───────────────────────────────────── */
  // Central event log: every PDF export or summary copy across all tools
  // records a snapshot (tool, title, total with currency, timestamp).
  const HISTORY_KEY = 'calcmall_history';
  const HISTORY_DRAFTS_KEY = 'calcmall_history_drafts';

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  let history = loadHistory();

  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) { /* ignore */ }
  }

  function loadDraftStore() {
    try {
      const raw = localStorage.getItem(HISTORY_DRAFTS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  let draftStore = loadDraftStore();

  // Per-tool launch stats for the Insights Hub (usage counts + last-used).
  let toolUsage = loadUsage();

  // type: 'pdf' → re-downloadable via the source tool; 'copy' → snapshot.
  // draft: { tool: <TOOLS key> } — tool state persists in its own key, so
  // the draft only needs to know where to navigate / which export to rerun.
  /* Identical entries produced within this window are treated as ONE action.
     A document is described by type + tool + client + ref + total, so two
     genuinely different documents can never collide here — but a click that
     somehow reaches its handler twice (a double-fire, not a double-click) no
     longer leaves two rows with the same millisecond on the clock. */
  const HISTORY_DEDUPE_MS = 2000;

  function isDuplicateHistory(entry) {
    const last = history[0];
    if (!last) return false;
    if (Date.now() - last.at > HISTORY_DEDUPE_MS) return false;
    const same = function (a, b) { return String(a || '') === String(b || ''); };
    return same(last.type, entry.type || 'pdf') &&
      same(last.tool, entry.tool) &&
      same(last.toolName, entry.toolName) &&
      same(last.title, entry.title) &&
      same(last.client, entry.client) &&
      same(last.ref, entry.ref) &&
      same(last.total, entry.total);
  }

  function pushHistory(entry) {
    if (isDuplicateHistory(entry)) return;
    history.unshift({
      id: uid(),
      type: entry.type || 'pdf',
      tool: entry.tool || '',
      toolName: entry.toolName || 'Nexora Engine',
      title: entry.title || '\u2014',
      total: entry.total || '',
      /* Document entries carry the client and the reference so the activity
         feed can name WHICH document it was. Repeating the document type for
         every row told the reader nothing; rows logged before these fields
         existed simply fall back to title/total. */
      client: entry.client || '',
      ref: entry.ref || '',
      at: Date.now()
    });
    if (history.length > 60) history = history.slice(0, 60);
    if (entry.draft) draftStore[history[0].id] = entry.draft;
    // Prune orphaned drafts (their list entry aged out).
    const live = {};
    for (let i = 0; i < history.length; i++) {
      if (draftStore[history[i].id]) live[history[i].id] = draftStore[history[i].id];
    }
    draftStore = live;
    saveHistory();
    try { localStorage.setItem(HISTORY_DRAFTS_KEY, JSON.stringify(draftStore)); } catch (e) { /* ignore */ }
    renderHistory();
    renderActivity();
    renderKpis();
  }

  function renderHistory() {
    const list = $('history-list');
    if (!list) return;
    renderActivity();
    renderKpis();
    const clearBtn = $('history-clear');
    if (!history.length) {
      list.innerHTML = '<div class="history-empty">No saved entries yet. Export a PDF or copy a summary from any tool and it will appear here automatically.</div>';
      if (clearBtn) clearBtn.hidden = true;
      return;
    }
    list.innerHTML = history.map(function (h) {
      const when = new Date(h.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      const badge = h.type === 'pdf'
        ? '<span class="pill pill-accent">PDF</span>'
        : '<span class="pill pill-muted">Copy</span>';
      return '<div class="history-item card" data-id="' + h.id + '">' +
        '<div class="history-main">' +
          '<div class="history-title"><strong>' + esc(h.title) + '</strong> ' + badge + '</div>' +
          '<div class="history-meta">' + esc(h.toolName) + ' · ' + when + '</div>' +
          (h.total ? '<div class="history-total">' + esc(h.total) + '</div>' : '') +
        '</div>' +
        '<div class="history-actions">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-hact="view">View / Load draft</button>' +
          (h.type === 'pdf' ? '<button type="button" class="btn btn-ghost btn-sm" data-hact="pdf">Re-download PDF</button>' : '') +
          '<button type="button" class="btn btn-ghost btn-sm" data-hact="delete">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');
    if (clearBtn) clearBtn.hidden = false;
  }

  function historyAction(id, act) {
    const h = history.find(function (x) { return x.id === id; });
    if (!h) return;
    if (act === 'delete') {
      history = history.filter(function (x) { return x.id !== id; });
      delete draftStore[id];
      saveHistory();
      try { localStorage.setItem(HISTORY_DRAFTS_KEY, JSON.stringify(draftStore)); } catch (e) { /* ignore */ }
      renderHistory();
      return;
    }
    const draft = draftStore[id] || {};
    const tool = draft.tool || h.tool;
    if (act === 'view') {
      if (tool === 'erp') { showView('erp'); }
      else if (tool && TOOL_VIEWS[tool]) {
        // Opening a saved draft into a live calculator is a tool launch,
        // so it passes the same gate (a guest must not reach a tool here).
        if (!checkAccessAndCredits()) return;
        selectTool(tool);
        showView(TOOL_VIEWS[tool]);
      } else {
        showView('home');
      }
      return;
    }
    if (act === 'pdf') {
      // Re-run the original export — tool state persists, so the document
      // regenerates exactly as it was saved. Gated: a blocked user must not
      // be able to trigger a print dialog from the History list either.
      if (!checkAccessAndCredits()) return;
      if (tool === 'erp') exportErpPdf();
      else if (tool === 'invoice') exportInvPdf();
      else if (tool === 'boq') exportBoqPdf();
      else if (tool === 'qr') qrExportPdf();
      else if (tool === 'variation') exportVariationPdf();
      else if (tool && TOOL_VIEWS[tool]) { selectTool(tool); showView(TOOL_VIEWS[tool]); }
      return;
    }
  }

  async function clearHistory() {
    if (!(await confirmAction({ title: 'Clear history?', message: 'Clear the entire history? This cannot be undone.', confirmLabel: 'Clear everything', danger: true }))) return;
    history = [];
    draftStore = {};
    saveHistory();
    try { localStorage.removeItem(HISTORY_DRAFTS_KEY); } catch (e) { /* ignore */ }
    renderHistory();
  }

  /* ── Retainer & SLA Pricing Estimator (tool #11) ──────────────── */
  const RT_KEY = 'cm-rt-v1';

  function emptyRetainer() {
    return { client: '', hours: '', hourly: '', overhead: '', margin: '', sla: '' };
  }

  function loadRetainer() {
    try {
      const raw = localStorage.getItem(RT_KEY);
      if (!raw) return emptyRetainer();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyRetainer();
      const out = emptyRetainer();
      for (const k in out) {
        if (parsed[k] !== undefined) out[k] = String(parsed[k]);
      }
      return out;
    } catch (e) {
      return emptyRetainer();
    }
  }

  let rtState = loadRetainer();

  function saveRetainer() {
    try { localStorage.setItem(RT_KEY, JSON.stringify(rtState)); } catch (e) { /* ignore */ }
  }

  function rtCur() { return toolCurrency.retainer; }
  function rtMoney(v) { return Calc.fmtToolMoney(v, rtCur()); }

  function updateRetainer() {
    const r = Calc.retainerCalc(rtState.hours, rtState.hourly, rtState.overhead, rtState.margin, rtState.sla);
    const has = r !== null;
    $('rt-price').textContent = has ? rtMoney(r.price) : '\u2014';
    $('rt-profit').textContent = has ? rtMoney(r.profit) : '\u2014';
    $('rt-cost').textContent = has ? rtMoney(r.cost) : '\u2014';
    $('rt-eff-hourly').textContent = has ? rtMoney(r.effectiveHourly) : '\u2014';
    $('rt-annual').textContent = has ? rtMoney(r.annual) : '\u2014';
    $('rt-margin-act').textContent = has ? Calc.fmtPct(r.marginPct) : '\u2014';
    const note = $('rt-note');
    note.textContent = has
      ? 'Cost covers ' + Calc.fmtNum(rtState.hours) + ' included hours at ' + rtMoney(Number(rtState.hourly) || 0) + ' plus overhead. Hours beyond the included amount bill at the standard rate.'
      : 'Set the monthly included hours and your blended rate to price the retainer.';
  }

  function fillRetainerForm() {
    $('rt-client').value = rtState.client;
    $('rt-hours').value = rtState.hours;
    $('rt-hourly').value = rtState.hourly;
    $('rt-overhead').value = rtState.overhead;
    $('rt-margin').value = rtState.margin;
    $('rt-sla').value = rtState.sla;
    updateRetainer();
  }

  async function resetRetainer() {
    if (!(await confirmAction({ title: 'Reset retainer estimator?', message: 'This clears the client details and pricing inputs.', confirmLabel: 'Reset', danger: true }))) return;
    rtState = emptyRetainer();
    saveRetainer();
    fillRetainerForm();
  }

  function copyRetainerSummary() {
    const r = Calc.retainerCalc(rtState.hours, rtState.hourly, rtState.overhead, rtState.margin, rtState.sla);
    if (!r) {
      window.alert('Enter the included hours and your blended hourly rate first.');
      return;
    }
    const lines = [
      'RETAINER & SLA PRICING SUMMARY' + (rtState.client ? ' — ' + rtState.client : ''),
      '',
      'Included hours / month: ' + Calc.fmtNum(rtState.hours),
      'Monthly cost (hours + overhead): ' + rtMoney(r.cost),
      'Monthly retainer price: ' + rtMoney(r.price),
      'Effective rate on included hours: ' + rtMoney(r.effectiveHourly),
      'Annual contract value: ' + rtMoney(r.annual),
      '',
      'Net profit / month: ' + rtMoney(r.profit) + ' (margin ' + Calc.fmtPct(r.marginPct) + ')'
    ];
    copyText(lines.join('\n'), $('rt-copy'), 'Copy Summary');
    pushHistory({
      type: 'copy', tool: 'retainer', toolName: 'Retainer & SLA Pricing Estimator',
      title: rtState.client || 'Retainer pricing', total: rtMoney(r.price) + '/mo',
      draft: { tool: 'retainer' }
    });
  }

  /* ── Project Delay & Damages Impact (tool #12) ────────────────── */
  const DL_KEY = 'cm-dl-v1';

  function emptyDelay() {
    return { project: '', contract: '', penaltyPct: '', capPct: '', days: '', overhead: '' };
  }

  function loadDelay() {
    try {
      const raw = localStorage.getItem(DL_KEY);
      if (!raw) return emptyDelay();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyDelay();
      const out = emptyDelay();
      for (const k in out) {
        if (parsed[k] !== undefined) out[k] = String(parsed[k]);
      }
      return out;
    } catch (e) {
      return emptyDelay();
    }
  }

  let dlState = loadDelay();

  function saveDelay() {
    try { localStorage.setItem(DL_KEY, JSON.stringify(dlState)); } catch (e) { /* ignore */ }
  }

  function dlCur() { return toolCurrency.delay; }
  function dlMoney(v) { return Calc.fmtToolMoney(v, dlCur()); }

  function updateDelay() {
    const r = Calc.delayCalc(dlState.contract, dlState.penaltyPct, dlState.capPct, dlState.days, dlState.overhead);
    const has = r !== null;
    $('dl-total').textContent = has ? dlMoney(r.total) : '\u2014';
    $('dl-penalty-amt').textContent = has ? dlMoney(r.penalty) : '\u2014';
    $('dl-overhead-line').textContent = has ? dlMoney(r.overhead) : '\u2014';
    $('dl-pct').textContent = has ? Calc.fmtPct(r.pctOfContract) + ' of contract' : '\u2014';
    const capLine = $('dl-cap-line');
    if (capLine) capLine.textContent = has && num(dlState.capPct) > 0 ? dlMoney(r.capAmount) : '\u2014';
    const err = $('dl-error');
    if (has && r.capped) {
      err.textContent = 'The uncapped penalty (' + dlMoney(r.rawPenalty) + ') exceeds the cap — the cap amount applies.';
      err.hidden = false;
    } else {
      err.hidden = true;
    }
  }

  function fillDelayForm() {
    $('dl-project').value = dlState.project;
    $('dl-contract').value = dlState.contract;
    $('dl-penalty').value = dlState.penaltyPct;
    $('dl-cap').value = dlState.capPct;
    $('dl-days').value = dlState.days;
    $('dl-overhead').value = dlState.overhead;
    updateDelay();
  }

  async function resetDelay() {
    if (!(await confirmAction({ title: 'Reset delay calculator?', message: 'This clears the contract details and penalty rates.', confirmLabel: 'Reset', danger: true }))) return;
    dlState = emptyDelay();
    saveDelay();
    fillDelayForm();
  }

  function copyDelaySummary() {
    const r = Calc.delayCalc(dlState.contract, dlState.penaltyPct, dlState.capPct, dlState.days, dlState.overhead);
    if (!r) {
      window.alert('Enter the contract value first.');
      return;
    }
    const lines = [
      'DELAY & DAMAGES IMPACT' + (dlState.project ? ' — ' + dlState.project : ''),
      '',
      'Delay duration: ' + Calc.fmtNum(dlState.days) + ' days',
      'Penalty (' + Calc.fmtPct(num(dlState.penaltyPct)) + '/day' + (num(dlState.capPct) > 0 ? ', capped at ' + Calc.fmtPct(num(dlState.capPct)) : '') + '): ' + dlMoney(r.penalty) + (r.capped ? ' (capped)' : ''),
      'Extended overhead: ' + dlMoney(r.overhead),
      'Total damages exposure: ' + dlMoney(r.total) + ' (' + Calc.fmtPct(r.pctOfContract) + ' of contract)'
    ];
    copyText(lines.join('\n'), $('dl-copy'), 'Copy Summary');
    pushHistory({
      type: 'copy', tool: 'delay', toolName: 'Project Delay & Damages Impact Calculator',
      title: dlState.project || 'Delay impact', total: dlMoney(r.total),
      draft: { tool: 'delay' }
    });
  }

  /* ── Brand & settings (shared letterhead + default terms) ───── */
  const BRAND_KEY = 'calcmall_brand_v1';

  function emptyBrand() {
    return {
      name: '', legalName: '', tag: '', address: '', contact: '', logo: '', terms: '',
      // Formal-document letterhead + bank block (MX layout)
      phone: '', email: '', website: '', spec: '', tin: '',
      payTerms: '', beneficiary: '', bankBranch: '', swift: '', branchCode: '', accountNo: '', accountCur: ''
    };
  }

  function loadBrand() {
    try {
      const raw = localStorage.getItem(BRAND_KEY);
      if (!raw) return emptyBrand();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyBrand();
      return Object.assign(emptyBrand(), parsed);
    } catch (e) { return emptyBrand(); }
  }

  let brand = loadBrand();

  function saveBrand() {
    try { localStorage.setItem(BRAND_KEY, JSON.stringify(brand)); } catch (e) { /* ignore */ }
  }

  function brandDocTitle() {
    return brand.name || 'YOUR COMPANY';
  }

  // Legal entity line for formal documents — falls back to the main name.
  function mxLegalName() {
    return (brand.legalName && brand.legalName.trim() !== '') ? brand.legalName.trim() : brandDocTitle();
  }

  function brandDocTerms() {
    if (brand.terms.trim() !== '') return brand.terms;
    return 'Payment terms: [e.g. 50% mobilization advance with order, balance on delivery/completion.]\nWarranty: [e.g. workmanship warranted for 12 months from handover.]\nValidity: [e.g. this offer is valid for 30 days from the date above.]';
  }

  // First line of the contact block: prefer the dedicated phone field,
  // fall back to the free-text contact field.
  function parseContactPair(text) {
    const t = String(text || '');
    const em = t.match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/);
    const ph = t.match(/[+\d][\d\s+()\-]*/);
    return { phone: ph ? ph[0].trim() : '', email: em ? em[0].trim() : '' };
  }

  function brandPhone() {
    if (brand.phone && brand.phone.trim() !== '') return brand.phone.trim();
    return parseContactPair(brand.contact).phone;
  }

  // First email-looking token in the contact field, or the dedicated one.
  function brandEmail() {
    if (brand.email && brand.email.trim() !== '') return brand.email.trim();
    return parseContactPair(brand.contact).email;
  }

  // Either brand bank field set → the ERP/invoice documents get a formal
  // Beneficiary Details block instead of per-mode hand-typed bank fields.
  function brandHasBank() {
    return [brand.payTerms, brand.beneficiary, brand.bankBranch, brand.swift, brand.accountNo]
      .some(function (v) { return v && String(v).trim() !== ''; });
  }

  function renderBrand() {
    $('brand-name').value = brand.name;
    if ($('brand-legal')) $('brand-legal').value = brand.legalName;
    $('brand-tag').value = brand.tag;
    $('brand-address').value = brand.address;
    $('brand-contact').value = brand.contact;
    $('brand-terms').value = brand.terms;
    if ($('brand-phone')) $('brand-phone').value = brand.phone;
    if ($('brand-email')) $('brand-email').value = brand.email;
    if ($('brand-website')) $('brand-website').value = brand.website;
    if ($('brand-spec')) $('brand-spec').value = brand.spec;
    if ($('brand-tin')) $('brand-tin').value = brand.tin;
    if ($('brand-payterms')) $('brand-payterms').value = brand.payTerms;
    if ($('brand-beneficiary')) $('brand-beneficiary').value = brand.beneficiary;
    if ($('brand-bankbranch')) $('brand-bankbranch').value = brand.bankBranch;
    if ($('brand-swift')) $('brand-swift').value = brand.swift;
    if ($('brand-branchcode')) $('brand-branchcode').value = brand.branchCode;
    if ($('brand-accountno')) $('brand-accountno').value = brand.accountNo;
    if ($('brand-accountcur')) $('brand-accountcur').value = brand.accountCur;
    const prev = $('brand-logo-preview');
    if (brand.logo) {
      prev.innerHTML = '<img src="' + brand.logo + '" alt="Company logo">';
      $('brand-logo-remove').hidden = false;
    } else {
      prev.innerHTML = '<span class="brand-logo-placeholder">Logo</span>';
      $('brand-logo-remove').hidden = true;
    }
    const used = (brand.name ? 1 : 0) + (brand.address ? 1 : 0) + (brand.terms ? 1 : 0) + (brand.logo ? 1 : 0);
    $('brand-status').textContent = used === 0 ? 'Not set up yet' : (used + ' of 4 set');
  }

  function renderBrandStatus() {
    const used = (brand.name ? 1 : 0) + (brand.address ? 1 : 0) + (brand.terms ? 1 : 0) + (brand.logo ? 1 : 0);
    $('brand-status').textContent = used === 0 ? 'Not set up yet' : (used + ' of 4 set');
  }

  /* ── Data-Centric Insights Hub (home view) ───────────────── */
  // Inline stroke-style SVG icons (monochrome, currentColor) so no external
  // assets are needed. Each key maps to a small 24×24 viewBox path set.
  const TOOL_ICONS = {
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.5" fill="currentColor"/>',
    ruler: '<path d="M3 17 L17 3 l4 4 L7 21 Z"/><path d="M8.5 11.5 l2 2"/><path d="M11.5 8.5 l2 2"/><path d="M14.5 5.5 l2 2"/>',
    doc: '<path d="M6 2.5 h8.5 L19 7 v14.5 H6 Z"/><path d="M14 3 v4.5 h4.5"/><path d="M9 12 h7"/><path d="M9 16 h7"/>',
    chart: '<path d="M4 4 v16 h16"/><path d="M8 15 v-4"/><path d="M12.5 15 V8"/><path d="M17 15 v-6"/>',
    invoice: '<path d="M6 2.5 h12 v19 l-2.4 -1.6 -2.4 1.6 -2.4 -1.6 -2.4 1.6 -2.4 -1.6 Z"/><path d="M9 8 h6"/><path d="M9 12 h6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12 h18"/><path d="M12 3 c3.5 3.5 3.5 14 0 18"/><path d="M12 3 c-3.5 3.5 -3.5 14 0 18"/>',
    list: '<path d="M4 5.5 h11"/><path d="M4 12 h11"/><path d="M4 18.5 h11"/><circle cx="19" cy="5.5" r="1.2"/><circle cx="19" cy="12" r="1.2"/><circle cx="19" cy="18.5" r="1.2"/>',
    scale: '<path d="M12 3 v18"/><path d="M5 6 h14"/><path d="M5 6 l-2.8 6.5 a3.4 3.4 0 0 0 5.6 0 Z"/><path d="M19 6 l-2.8 6.5 a3.4 3.4 0 0 0 5.6 0 Z"/><path d="M9 21 h6"/>',
    exchange: '<path d="M4 8 h13 l-3.2 -3.5"/><path d="M20 16 H7 l3.2 3.5"/>',
    grad: '<path d="M2.5 9 L12 4.5 21.5 9 12 13.5 Z"/><path d="M6.5 11.2 v4.8 c3 2.6 8 2.6 11 0 v-4.8"/><path d="M21.5 9 v5"/>',
    handshake: '<path d="M2.5 7.5 h4 v8 h-4 Z" transform="rotate(-8 4.5 11.5)"/><path d="M21.5 7.5 h-4 v8 h4 Z" transform="rotate(8 19.5 11.5)"/><path d="M7 11 l3 -2.2 2.6 2 2.4 -2"/><path d="M7 13.5 l2.8 2.3 2.2 -1.8 2.2 1.8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5 V12 l3.5 2"/>',
    // ── UI icons: sidebar nav, buttons, status lines ──
    home: '<path d="M3.5 10.5 L12 3.5 l8.5 7"/><path d="M5.5 9.5 v10 h13 v-10"/><path d="M10 19.5 v-5.5 h4 v5.5"/>',
    database: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5 v13 c0 1.66 3.58 3 8 3 s8 -1.34 8 -3 v-13"/><path d="M4 12 c0 1.66 3.58 3 8 3 s8 -1.34 8 -3"/>',
    briefcase: '<rect x="3" y="7.5" width="18" height="13" rx="2"/><path d="M9 7.5 V6 a2 2 0 0 1 2 -2 h2 a2 2 0 0 1 2 2 v1.5"/><path d="M3 12.5 h18"/><path d="M10.5 12.5 v2.5 h3 v-2.5"/>',
    history: '<path d="M3.5 12 a8.5 8.5 0 1 1 2.5 6"/><path d="M3.5 12 v-4.5 M3.5 12 h4.5"/><path d="M12 8 v4 l3 2"/>',
    palette: '<path d="M12 3 a9 9 0 1 0 0 18 h1.5 a2 2 0 0 0 0 -4 h-1.5 a1.5 1.5 0 0 1 0 -3 h4.5 a4.5 4.5 0 0 0 0 -11 Z"/><circle cx="7.5" cy="10.5" r="1.1"/><circle cx="12" cy="7.5" r="1.1"/><circle cx="16.5" cy="10.5" r="1.1"/>',
    tools: '<path d="M15.5 8.5 a4.5 4.5 0 0 1 5 -6.2 l-2.8 2.8 0.8 2.4 2.4 0.8 2.8 -2.8 a4.5 4.5 0 0 1 -6.2 5 L6.8 20.2 a2.1 2.1 0 0 1 -3 -3 Z" transform="translate(-1.2 0.8) scale(0.9)"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5 v2.5 M12 19 v2.5 M2.5 12 h2.5 M19 12 h2.5 M5 5 l1.8 1.8 M17.2 17.2 L19 19 M19 5 l-1.8 1.8 M6.8 17.2 L5 19"/>',
    moon: '<path d="M20 13.5 A8.5 8.5 0 1 1 10.5 4 a7 7 0 0 0 9.5 9.5 Z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.3 a2.8 2.8 0 1 1 3.9 2.9 c-0.8 0.4 -1.2 0.9 -1.2 1.9"/><circle cx="12" cy="17.3" r="0.6" fill="currentColor" stroke="none"/>',
    menu: '<path d="M4 6.5 h16 M4 12 h16 M4 17.5 h16"/>',
    close: '<path d="M6 6 l12 12 M18 6 l-12 12"/>',
    'chevron-right': '<path d="M9.5 5.5 L16 12 L9.5 18.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15 H4.5 A1.5 1.5 0 0 1 3 13.5 v-9 A1.5 1.5 0 0 1 4.5 3 h9 A1.5 1.5 0 0 1 15 4.5 V5"/>',
    pdf: '<path d="M5 4.5 h9.5 L20 10 v9.5 h-15 Z"/><path d="M14.5 4.5 V10 H20"/><path d="M8.5 14.2 h1.4 a1.2 1.2 0 0 1 0 2.4 h-1.4 v-4.7 M13 16.6 v-4.7 h1.3 a1.7 1.7 0 0 1 1.7 1.7 v1.3 a1.7 1.7 0 0 1 -1.7 1.7 Z"/>',
    sheet: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 9 h16 M4 14.5 h16 M9.3 9 v11.5 M14.6 9 v11.5"/>',
    csv: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M7.5 9.5 h4 M7.5 12.5 h4 M7.5 15.5 h2.5"/><path d="M14 10 l2 2 -2 2"/>',
    save: '<path d="M5 3.5 h11 L20.5 8 v12.5 h-15.5 Z"/><path d="M8 3.5 v5 h7 v-5"/><rect x="8" y="13" width="8" height="7.5"/>',
    'import': '<path d="M12 3.5 v10.5"/><path d="M8 10.5 l4 4 4 -4"/><path d="M4.5 16.5 v2 a2 2 0 0 0 2 2 h11 a2 2 0 0 0 2 -2 v-2"/>',
    download: '<path d="M12 3.5 v11"/><path d="M8 11 l4 4 4 -4"/><path d="M4.5 17.5 v2 a2 2 0 0 0 2 2 h11 a2 2 0 0 0 2 -2 v-2"/>',
    plus: '<path d="M12 5 v14 M5 12 h14"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 17.5 l5 -5 3.5 3.5 3 -3 3.5 3.5"/>',
    warn: '<path d="M12 3.5 L22 20 H2 Z"/><path d="M12 9.5 v4.8"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5 l2.6 2.6 5.4 -5.6"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9 v10 a1.5 1.5 0 0 0 1.5 1.5 h11 A1.5 1.5 0 0 0 19 19 V9"/><path d="M10 13 h4"/>',
    edit: '<path d="M4.5 19.5 h4 L20.2 7.8 a2.4 2.4 0 0 0 -3.4 -3.4 L5.1 16.1 Z"/><path d="M15.2 6.1 l3.4 3.4"/>',
    star: '<path d="M12 3.4 l2.7 5.48 6.05 0.88 -4.38 4.27 1.03 6.03 -5.4 -2.84 -5.4 2.84 1.03 -6.03 -4.38 -4.27 6.05 -0.88 Z"/>'
  };

  // Hydrate declarative icon placeholders: every [data-icon] span gets the
  // matching minimalist SVG injected. Safe to re-run (skips filled nodes).
  function hydrateIcons(root) {
    const scope = root || document;
    const nodes = scope.querySelectorAll('[data-icon]');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.firstChild) continue; // already hydrated
      el.innerHTML = toolIconSvg(el.getAttribute('data-icon'));
    }
  }
  function toolIconSvg(key) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (TOOL_ICONS[key] || TOOL_ICONS.target) + '</svg>';
  }

  // Per-tool usage stats: { toolId: { count: n, last: timestamp } }
  const USAGE_KEY = 'calcmall_usage_v1';
  function loadUsage() {
    try {
      const raw = localStorage.getItem(USAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) { return {}; }
  }
  function saveUsage() {
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(toolUsage)); } catch (e) { /* ignore */ }
  }
  function recordUsage(toolId) {
    if (!toolId || !TOOLS[toolId]) return;
    if (!toolUsage[toolId]) toolUsage[toolId] = { count: 0, last: 0 };
    toolUsage[toolId].count++;
    toolUsage[toolId].last = Date.now();
    saveUsage();
    renderToolCards(); // refresh Last used / Usage in place
  }

  function timeAgo(ts) {
    if (!ts) return 'Never';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'Just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' min ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    const d = Math.floor(h / 24);
    if (d < 30) return d + (d === 1 ? ' day ago' : ' days ago');
    const mo = Math.floor(d / 30);
    if (mo < 12) return mo + (mo === 1 ? ' month ago' : ' months ago');
    return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  // Tools grid — the app's structured calculator card component
  // (`.tools-grid` + `.tool-card` + `.tool-launch`), reused as-is from the
  // Home shortcuts that used to render it. It is now the whole of Other
  // Utilities. Ordered the way the tools are reached for, not the order the
  // TOOLS map happens to define them in.
  const TOOL_ORDER = ['scope-guard', 'qr', 'boq', 'pricing', 'invoice', 'duty',
    'variation', 'breakeven', 'fx', 'gpa', 'retainer', 'delay'];

  function toolCardHtml(id) {
    const t = TOOLS[id];
    const u = toolUsage[id] || { count: 0, last: 0 };
    return '<button type="button" class="tool-card" data-tool="' + id + '">' +
      '<div class="tool-card-top">' +
        '<span class="tool-cat-icon"><span class="tool-emoji" aria-hidden="true">' + (TOOL_EMOJI[id] || '\uD83D\uDD0D') + '</span></span>' +
      '</div>' +
      '<span class="tool-card-name">' + esc(t.short || t.name) + '</span>' +
      (t.blurb ? '<span class="tool-card-desc">' + esc(t.blurb) + '</span>' : '') +
      '<div class="tool-card-meta">' +
        '<span>Last used: <strong>' + timeAgo(u.last) + '</strong></span>' +
        '<span>Usage: <strong>' + u.count + '×</strong></span>' +
      '</div>' +
      '<span class="tool-launch">Launch Tool \u2192</span>' +
    '</button>';
  }

  /* Other Utilities: one card per tool, always all twelve in TOOL_ORDER —
     no primary/secondary split and no disclosure, because this page exists
     precisely to show everything at once. */
  function renderToolCards() {
    const grid = $('utility-tools-grid');
    if (!grid) return;
    grid.innerHTML = TOOL_ORDER
      .filter(function (id) { return !!TOOLS[id]; })
      .map(toolCardHtml)
      .join('');
  }

  // KPI row — live counts from the local data stores.
  function fmtCompact(n) {
    if (!isFinite(n)) return '0';
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  }
  /* ── KPI trend windows ──────────────────────────────────────────
     The badge is a REAL comparison or it is absent. It compares the last
     30 days of activity against the 30 days before that, built from the
     timestamps the records actually carry (history rows, ERP `savedAt`,
     database `addedAt`).

     It previously compared this month's snapshot against last month's and,
     finding no last month, printed "+100%" whenever the current value was
     non-zero and "0%" when both were zero — a placeholder dressed as a
     statistic. There is no such fallback now: with no events in the earlier
     window the badge is hidden (`[hidden]` in style.css). The old
     `nexora_kpi_snapshots` store is no longer written or read. */
  const KPI_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

  // 'now' = last 30 days, 'prev' = the 30 days before that, 'old' = ignored.
  function kpiWindowOf(ts) {
    const age = Date.now() - ts;
    if (!isFinite(age) || age < 0) return 'now'; // clock skew: treat as current
    if (age <= KPI_WINDOW_MS) return 'now';
    if (age <= 2 * KPI_WINDOW_MS) return 'prev';
    return 'old';
  }

  // The numeric part of a stored money string ('Rs358,720' → 358720).
  function kpiTotalNumber(total) {
    const v = parseFloat(String(total === null || total === undefined ? '' : total).replace(/[^0-9.]/g, ''));
    return isFinite(v) ? v : 0;
  }

  /* Flows per window, not levels: "documents generated", "records saved",
     "value processed". A count of ALL records cannot have a 30-day delta,
     but the new records in each window can — and that is what a growth
     percentage means. */
  function kpiTrends() {
    const blank = function () { return { now: 0, prev: 0 }; };
    const acc = { est: blank(), db: blank(), doc: blank(), val: blank() };
    const bump = function (slot, ts, amount) {
      if (!ts) return;
      const w = kpiWindowOf(ts);
      if (w === 'old') return;
      acc[slot][w] += (amount === undefined ? 1 : amount);
    };
    // Active estimates — every saved record carries `savedAt` (ISO string).
    for (const id in erpRecords) {
      const rec = erpRecords[id];
      if (rec && rec.savedAt) bump('est', Date.parse(rec.savedAt));
    }
    /* Database records — `addedAt` is only set from now on, so records saved
       before it existed are counted in the headline total but deliberately
       left out of the trend (an undated record belongs to no window). */
    for (let i = 0; i < db.items.length; i++) if (db.items[i]) bump('db', db.items[i].addedAt);
    for (let i = 0; i < db.clients.length; i++) if (db.clients[i]) bump('db', db.clients[i].addedAt);
    // Documents and processed value — every history row is timestamped.
    for (let i = 0; i < history.length; i++) {
      bump('doc', history[i].at);
      bump('val', history[i].at, kpiTotalNumber(history[i].total));
    }
    return acc;
  }

  function currentKPIValues() {
    const activeEst = (erpRecords && typeof erpRecords === 'object') ? Object.keys(erpRecords).length : 0;
    const dbCount = db.items.length + db.clients.length;
    const docCount = history.length;
    let procVal = 0;
    for (let i = 0; i < history.length; i++) procVal += kpiTotalNumber(history[i].total);
    if (erpDocType()) procVal += erpTotals().final;
    procVal += state.requests.reduce(function (s, r) { return s + (r.value || 0); }, 0);
    return { activeEst: activeEst, dbCount: dbCount, docCount: docCount, procVal: procVal };
  }

  function fmtPctShort(val) {
    if (val === 0) return '0%';
    return (val > 0 ? '+' : '') + val.toFixed(1).replace(/\.0$/, '') + '%';
  }

  /* `fmt` renders a window figure for the tooltip (money vs a plain count).
     No earlier-window events ⇒ no baseline ⇒ the badge is hidden, never
     faked. A genuine 0% (a baseline exists but nothing changed) is shown,
     in the neutral pill. */
  function applyKpiDelta(deltaEl, cur, prev, what, fmt) {
    if (!deltaEl) return;
    if (!(prev > 0)) {
      deltaEl.hidden = true;
      deltaEl.textContent = '';
      deltaEl.className = 'kpi-delta';
      deltaEl.removeAttribute('title');
      return;
    }
    const pct = ((cur - prev) / prev) * 100;
    let cls = 'kpi-flat';
    if (pct > 0.0001) cls = 'kpi-up';
    else if (pct < -0.0001) cls = 'kpi-down';
    const show = fmt || function (v) { return String(v); };
    deltaEl.hidden = false;
    deltaEl.className = 'kpi-delta ' + cls;
    deltaEl.textContent = fmtPctShort(pct);
    deltaEl.title = what + ': ' + show(cur) + ' in the last 30 days vs ' + show(prev) +
      ' in the 30 days before that';
  }

  function updateKPICards() {
    const t = kpiTrends();
    applyKpiDelta($('kpi-est-delta'), t.est.now, t.est.prev, 'Records saved');
    applyKpiDelta($('kpi-db-delta'), t.db.now, t.db.prev, 'Database entries added');
    applyKpiDelta($('kpi-doc-delta'), t.doc.now, t.doc.prev, 'Documents generated');
    const money = function (v) { return Calc.fmtToolMoney(v, erpCurrencyCode()); };
    applyKpiDelta($('kpi-val-delta'), t.val.now, t.val.prev, 'Value processed', money);
  }

  // Wire live KPI refresh on save/delete of ERP records and DB writes.
  function wireKPILive() {
    const wire = function (id, fn) {
      const el = $(id);
      if (el) el.addEventListener('click', function () { fn(); renderKPIsAfterCommit(); });
    };
    wire('erp-record-save', function () { /* handled by erpSaveRecord */ });
    wire('erp-record-delete', function () { /* handled inside erpDeleteRecord */ });
    wire('db-item-add', function () { /* handled inside addDbItem */ });
    wire('db-client-add', function () { /* handled inside addDbClient */ });
  }

  function renderKPIsAfterCommit() {
    renderKpis();
    updateKPICards();
  }

  // System Health storage line — counts ONLY the app's own keys
  // (nexora_* plus the legacy calcmall_* keys still used for history,
  // brand kit, usage stats and ERP state) and formats bytes as B / KB / MB
  // with proper units (e.g. "512 B", "9.7 KB", "1.2 MB / 5 MB").
  const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024; // 5 MB = 5,242,880 bytes

  function storageUsedBytes() {
    let used = 0;
    try {
      for (let k = 0; k < window.localStorage.length; k++) {
        const key = String(window.localStorage.key(k));
        if (key.indexOf('nexora_') !== 0 && key.indexOf('calcmall_') !== 0) continue;
        used += (String(window.localStorage.getItem(key)) || '').length + key.length;
      }
    } catch (e) { /* ignore */ }
    return used;
  }

  function fmtBytes(n) {
    if (!isFinite(n) || n <= 0) return '0 B';
    if (n < 1024) return Math.round(n) + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderKpis() {
    const est = $('kpi-est'); if (!est) return;
    const cur = currentKPIValues();
    est.textContent = String(cur.activeEst);
    $('kpi-db').textContent = String(cur.dbCount);
    $('kpi-doc').textContent = String(cur.docCount);
    /* Processed Value is money, so it carries the currency the documents are
       written in: the compact form in the headline ("Rs 9.9M") and the exact
       figure spelled out underneath. If the history mixes currencies the
       sum is flagged rather than silently passed off as one currency. */
    const curCode = erpCurrencyCode();
    const curSym = Calc.TOOL_CURRENCIES[curCode].symbol.trim();
    $('kpi-val').textContent = curSym + ' ' + fmtCompact(cur.procVal);
    $('kpi-est-sub').textContent = cur.activeEst === 1 ? '1 active project baseline' : 'Projects with tracked changes';
    $('kpi-db-sub').textContent = db.items.length + ' items · ' + db.clients.length + ' clients';
    $('kpi-doc-sub').textContent = cur.docCount === 1 ? '1 saved entry' : cur.docCount + ' saved entries';
    const valSub = $('kpi-val-sub');
    if (valSub) {
      const exact = curCode + ' ' + Number(cur.procVal).toLocaleString('en-US', { maximumFractionDigits: 2 });
      valSub.textContent = exact + ' across ' + (cur.docCount === 1 ? '1 document' : cur.docCount + ' documents') +
        (kpiMixedCurrencies() ? ' · mixed currencies' : '');
    }
    const pm = $('pm-caption');
    if (pm) pm.textContent = cur.dbCount > 0 || cur.docCount > 0
      ? 'Pipeline active — ' + cur.dbCount + ' DB records and ' + cur.docCount + ' documents ready.'
      : 'Pipeline idle — open the ERP engine to process a document.';
    const setBar = function (id, val, cap, label, title) {
      const strong = $(id);
      const bar = strong.closest('.health-item').querySelector('.health-fill');
      const pct = Math.min(100, cap > 0 ? (val / cap) * 100 : 0);
      bar.style.width = pct.toFixed(1) + '%';
      strong.textContent = label;
      if (title) strong.setAttribute('title', title);
    };
    /* Storage reads as an approximate share of the browser's ~5 MB
       localStorage allowance; the exact byte count goes in the tooltip so the
       line can stay short enough to fit. */
    const usedBytes = storageUsedBytes();
    setBar('hl-storage', usedBytes, STORAGE_QUOTA_BYTES,
      fmtBytes(usedBytes) + ' / ~5 MB',
      Math.round(usedBytes).toLocaleString('en-US') + ' bytes of about 5 MB (' +
      ((usedBytes / STORAGE_QUOTA_BYTES) * 100).toFixed(2) + '% used)');
    setBar('hl-db', cur.dbCount, 200, String(cur.dbCount) + ' / 200',
      cur.dbCount + ' database records (items + clients)');
    setBar('hl-docs', cur.activeEst, 60, String(cur.activeEst) + ' / 60',
      cur.activeEst + ' saved project records');
  }

  // Recent Activity feed — mirrors the history log with ERP-style events.
  const ACTIVITY_ICONS = { pdf: 'doc', copy: 'list', db: 'globe', erp: 'invoice' };
  function activityIconSvg(kind) {
    return toolIconSvg(ACTIVITY_ICONS[kind] || 'clock');
  }
  function renderActivity() {
    const list = $('activity-list');
    if (!list) return;
    const clearBtn = $('activity-clear');
    if (!history.length) {
      list.innerHTML = '<div class="activity-empty">No activity yet — export a PDF, save an ERP record, or update the database and events will appear here.</div>';
      if (clearBtn) clearBtn.hidden = true;
      return;
    }
    list.innerHTML = history.slice(0, 12).map(function (h) {
      const kind = h.type === 'db' ? 'db' : (h.tool === 'erp' ? 'erp' : (h.type === 'copy' ? 'copy' : 'pdf'));
      let head, bits = [];
      if (h.type === 'db') {
        // Database events have no client/reference — they name what changed.
        head = '<strong>' + esc(h.toolName) + '</strong> — ' + esc(h.title);
      } else {
        /* Document rows lead with the CLIENT. The tool name is deliberately
           NOT repeated here: it was identical on every row and told the
           reader nothing. The subtitle carries the reference and the amount,
           and the icon already shows what kind of event it was. */
        head = '<strong>' + esc(h.client || h.title) + '</strong>';
        if (h.ref) bits.push('<span class="activity-ref">Ref ' + esc(h.ref) + '</span>');
        if (h.total) bits.push('<span class="activity-amount">' + esc(h.total) + '</span>');
      }
      return '<div class="activity-item">' +
        '<span class="activity-ico">' + activityIconSvg(kind) + '</span>' +
        '<div class="activity-body">' +
          '<div class="activity-text">' + head + '</div>' +
          (bits.length ? '<div class="activity-doc">' + bits.join('') + '</div>' : '') +
          '<div class="activity-time">' + timeAgo(h.at) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    if (clearBtn) clearBtn.hidden = false;
  }
  async function clearActivity() {
    if (!(await confirmAction({ title: 'Clear activity feed?', message: 'Saved documents in History are not affected.', confirmLabel: 'Clear feed', danger: true }))) return;
    history = [];
    draftStore = {};
    saveHistory();
    try { localStorage.setItem(HISTORY_DRAFTS_KEY, JSON.stringify(draftStore)); } catch (e) { /* ignore */ }
    renderHistory();
    renderActivity();
    renderKpis();
  }

  /* ── Item & Client Database (master data for the ERP) ───────── */
  const DB_KEY_ITEMS = 'nexora_item_db';
  const DB_KEY_CLIENTS = 'nexora_client_db';
  const DB_KEY_LEGACY = 'calcmall_db_v1';

  function emptyDb() {
    return { items: [], clients: [] };
  }

  function loadDb() {
    let items = [];
    let clients = [];
    // Modern per-collection keys (authoritative when both present).
    try {
      const rawItems = localStorage.getItem(DB_KEY_ITEMS);
      if (rawItems) { const p = JSON.parse(rawItems); if (Array.isArray(p)) items = p; }
    } catch (e) { /* ignore */ }
    try {
      const rawClients = localStorage.getItem(DB_KEY_CLIENTS);
      if (rawClients) { const p = JSON.parse(rawClients); if (Array.isArray(p)) clients = p; }
    } catch (e) { /* ignore */ }
    // Legacy single-key migration: only use when modern keys are empty.
    if (!items.length && !clients.length) {
      try {
        const raw = localStorage.getItem(DB_KEY_LEGACY);
        if (raw) {
          const p = JSON.parse(raw);
          if (p && typeof p === 'object') {
            if (Array.isArray(p.items)) items = p.items;
            if (Array.isArray(p.clients)) clients = p.clients;
          }
        }
      } catch (e) { /* ignore */ }
    }
    if (!items.length && !clients.length) return emptyDb();
    /* Repair legacy rows on the way in, WITHOUT flattening three different
       states into one. A rate that is missing, a rate of 0 and a rate that
       cannot be read at all must stay distinguishable:
         missing   → null   (nothing was ever entered)
         0         → 0      (a genuine zero price — free/zero-cost items)
         unreadable→ kept   (so the table can flag it instead of printing 0)
       A rate that IS readable is only rewritten when it needs normalising
       ("100 00" → 10000), so genuine values are never touched. */
    let repaired = false;
    items = items.map(function (it) {
      if (!it || typeof it !== 'object') return it;
      const out = Object.assign({}, it);
      const raw = it.rate;
      const isBlank = raw === null || raw === undefined || String(raw).trim() === '';
      if (isBlank) {
        if (raw !== null) repaired = true;
        out.rate = null;
        return out;
      }
      // Legacy stringified-null artefacts read as "never entered".
      if (/^(null|undefined|nan)$/i.test(String(raw).trim())) { repaired = true; out.rate = null; return out; }
      const n = Calc.toNum(raw, NaN);
      if (!Number.isFinite(n)) return out;      // unreadable — leave it VISIBLE
      const normalised = n < 0 ? 0 : Math.round(n * 10000) / 10000;
      if (normalised !== raw) repaired = true;
      out.rate = normalised;
      return out;
    });
    // Persist the repair once, so the stored JSON stops carrying a null/NaN
    // rate and every later read agrees with what the table shows. Written
    // with the key directly — saveDb() reads the module-scope `db`, which
    // does not exist yet while this initialiser is running.
    if (repaired) {
      try { localStorage.setItem(DB_KEY_ITEMS, JSON.stringify(items)); } catch (e) { /* ignore */ }
    }
    return { items: items, clients: clients };
  }

  /* ── A stored rate has THREE possible states ──────────────────
     Treating them as one is what made a broken database entry look like a
     legitimate free item. `dbRateInfo` is the single classifier every
     reader goes through: the table, the drawer and the ERP auto-fill.

       { state: 'set',     value: 10000 }   a real number, 0 included
       { state: 'missing', value: null  }   nothing was ever entered
       { state: 'invalid', value: null  }   present but unreadable

     `text` is what to display, so "genuinely zero" (0), "never entered"
     (—) and "broken" (Invalid) can never be mistaken for each other. */
  function dbRateInfo(value) {
    if (value === null || value === undefined || String(value).trim() === '') {
      return { state: 'missing', value: null, text: '\u2014' };
    }
    if (/^(null|undefined|nan)$/i.test(String(value).trim())) {
      return { state: 'missing', value: null, text: '\u2014' };
    }
    const n = Calc.toNum(value, NaN);
    if (!Number.isFinite(n)) return { state: 'invalid', value: null, text: 'Invalid' };
    const clean = n < 0 ? 0 : Math.round(n * 10000) / 10000;
    return { state: 'set', value: clean, text: Calc.fmtNum(clean) };
  }

  /* What the create/edit form stores. A blank field is "never entered"
     (null) rather than a silent 0, and anything the field can hold is
     already a real number by the time it gets here. */
  function storedRateFromInput(value) {
    const info = dbRateInfo(value);
    return info.state === 'set' ? info.value : null;
  }

  function dbRateTitle(info) {
    if (info.state === 'invalid') return 'This rate cannot be read — open the item and set a number (use 0 for a zero-cost item)';
    if (info.state === 'missing') return 'No default rate saved — pick this SKU in the ERP and the Rate cell stays blank until you type one';
    return 'Default rate used when this SKU is picked in the ERP';
  }

  let db = loadDb();

  function saveDb() {
    try { localStorage.setItem(DB_KEY_ITEMS, JSON.stringify(db.items)); } catch (e) { /* ignore */ }
    try { localStorage.setItem(DB_KEY_CLIENTS, JSON.stringify(db.clients)); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(DB_KEY_LEGACY); } catch (e) { /* ignore */ }
  }

  function dbFindItem(sku) {
    const key = String(sku || '').trim().toLowerCase();
    if (!key) return null;
    return db.items.find(function (it) { return it.sku.toLowerCase() === key; }) || null;
  }

  function dbFindClient(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    return db.clients.find(function (c) { return c.name.toLowerCase() === key; }) || null;
  }

  /* ── SKU ordering: the one comparison used everywhere ──────────
     A numeric SKU ("2") sorts before "10"; a non-numeric one falls back to
     plain text order; and an item with no SKU sorts last rather than jumping
     to the top of the list. */
  function skuRank(sku) {
    const s = String(sku === null || sku === undefined ? '' : sku).trim();
    if (s === '') return { empty: 1, num: Infinity, text: '' };
    const n = Number(s);
    return { empty: 0, num: Number.isFinite(n) ? n : Infinity, text: s.toLowerCase() };
  }

  function compareSku(a, b) {
    const ra = skuRank(a);
    const rb = skuRank(b);
    if (ra.empty !== rb.empty) return ra.empty - rb.empty;   // blanks last
    if (ra.num !== rb.num) return ra.num - rb.num;           // 2 before 10
    if (ra.text !== rb.text) return ra.text < rb.text ? -1 : 1;
    return 0;
  }

  /* Items in SKU-ascending order, as [record, originalIndex] pairs.
     The INDEX is what the row buttons carry, so sorting the view never
     re-points an edit or a delete at the wrong record. */
  function dbItemsBySku() {
    return db.items.map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) { return compareSku(a.it.sku, b.it.sku); });
  }

  /* ── Home: compact master-data preview ──────────────────────────
     Shows at most HOME_DB_LIMIT most-recent items and clients in condensed
     rows. It is bounded by construction — adding a thousand records changes
     the CONTENT of five rows, never the height of the block — and each row's
     full text lives in its title attribute so long descriptions can be read
     without stretching the layout. "View all" opens the full database. */
  const HOME_DB_LIMIT = 5;

  function homeDbMostRecent(list) {
    return list.map(function (rec, i) { return { rec: rec, i: i }; })
      .sort(function (a, b) {
        const ta = Number(a.rec && a.rec.addedAt) || 0;
        const tb = Number(b.rec && b.rec.addedAt) || 0;
        if (ta !== tb) return tb - ta;          // newest first
        return b.i - a.i;                       // no timestamp: insertion order
      })
      .slice(0, HOME_DB_LIMIT);
  }

  function renderHomeDbPreview() {
    const itemsEl = $('home-db-items');
    const clientsEl = $('home-db-clients');
    if (!itemsEl && !clientsEl) return;

    const itemCount = $('home-db-items-count');
    if (itemCount) itemCount.textContent = db.items.length + (db.items.length === 1 ? ' item' : ' items');
    const clientCount = $('home-db-clients-count');
    if (clientCount) clientCount.textContent = db.clients.length + (db.clients.length === 1 ? ' client' : ' clients');

    if (itemsEl) {
      if (!db.items.length) {
        itemsEl.innerHTML = '<p class="home-db-empty">No items saved yet. Add one in the Item &amp; Client Database and it will auto-fill ERP line items.</p>';
      } else {
        itemsEl.innerHTML = homeDbMostRecent(db.items).map(function (pair) {
          const it = pair.rec;
          const info = dbRateInfo(it.rate);
          return '<button type="button" class="home-db-row" data-db="item" data-id="' + pair.i + '">' +
            '<span class="home-db-main">' +
              '<span class="home-db-title"><strong>' + esc(it.sku) + '</strong></span>' +
              '<span class="home-db-sub db-mini-name" title="' + esc(it.name || '') + '">' + esc(it.name || '\u2014') + '</span>' +
            '</span>' +
            '<span class="home-db-meta db-rate-' + info.state + '" title="' + dbRateTitle(info) + '">' + esc(info.text) + '</span>' +
          '</button>';
        }).join('');
      }
    }

    if (clientsEl) {
      if (!db.clients.length) {
        clientsEl.innerHTML = '<p class="home-db-empty">No clients saved yet. A saved client auto-fills the ERP header when its name is typed.</p>';
      } else {
        clientsEl.innerHTML = homeDbMostRecent(db.clients).map(function (pair) {
          const c = pair.rec;
          const site = c.defaultProject ? ' \u00b7 Site: ' + c.defaultProject : '';
          const addr = (c.address || '\u2014') + site;
          return '<button type="button" class="home-db-row" data-db="client" data-id="' + pair.i + '">' +
            '<span class="home-db-main">' +
              '<span class="home-db-title"><strong>' + esc(c.clientName || c.name) + '</strong></span>' +
              '<span class="home-db-sub db-mini-addr" title="' + esc(addr) + '">' + esc(addr) + '</span>' +
            '</span>' +
            '<span class="home-db-meta">' + esc(c.currency || '') + '</span>' +
          '</button>';
        }).join('');
      }
    }
  }

  function renderDb() {
    const itemsBody = $('db-item-rows');
    if (!db.items.length) {
      itemsBody.innerHTML = '<div class="empty-cell">No items yet. Add your first SKU above — ERP line items will auto-fill from it.</div>';
    } else {
      itemsBody.innerHTML = dbItemsBySku().map(function (pair) {
        const it = pair.it, i = pair.i;
        const info = dbRateInfo(it.rate);
        return '<div class="db-row db-grid-items" data-id="' + i + '">' +
          '<span class="db-sku" title="' + esc(it.sku) + '"><strong>' + esc(it.sku) + '</strong></span>' +
          '<span class="db-name" title="' + esc(it.name || '') + '">' + esc(it.name) + '</span>' +
          '<span class="db-unit">' + esc(it.unit) + '</span>' +
          '<span class="db-rate qr-amount db-rate-' + info.state + '" title="' + dbRateTitle(info) + '">' +
            esc(info.text) + '</span>' +
          '<span class="db-del db-actions">' +
            '<button type="button" class="qr-edit db-item-edit" data-id="' + i + '" aria-label="Edit item" title="Edit item">' + toolIconSvg('edit') + '</button>' +
            '<button type="button" class="qr-del db-item-del" data-id="' + i + '" aria-label="Remove item" title="Remove item">\u2715</button>' +
          '</span>' +
        '</div>';
      }).join('');
    }
    $('db-item-count').textContent = db.items.length + (db.items.length === 1 ? ' item' : ' items');
    const clientBody = $('db-client-rows');
    if (!db.clients.length) {
      clientBody.innerHTML = '<div class="empty-cell">No clients yet. Saved clients auto-fill the ERP header by project name.</div>';
    } else {
      clientBody.innerHTML = db.clients.map(function (c, i) {
        const site = c.defaultProject ? ' \u00b7 Site: ' + c.defaultProject : '';
        const fullAddress = (c.address || '\u2014') + site;
        return '<div class="db-row db-grid-clients" data-id="' + i + '">' +
          '<span class="db-sku" title="' + esc(c.name) + '"><strong>' + esc(c.name) + '</strong></span>' +
          '<span class="db-name db-addr" title="' + esc(fullAddress) + '">' + esc(fullAddress) + '</span>' +
          '<span class="db-unit">' + esc(c.currency) + '</span>' +
          '<span class="db-del db-actions">' +
            '<button type="button" class="qr-edit db-client-edit" data-id="' + i + '" aria-label="Edit client" title="Edit client">' + toolIconSvg('edit') + '</button>' +
            '<button type="button" class="qr-del db-client-del" data-id="' + i + '" aria-label="Remove client" title="Remove client">\u2715</button>' +
          '</span>' +
        '</div>';
      }).join('');
    }
    $('db-client-count').textContent = db.clients.length + (db.clients.length === 1 ? ' client' : ' clients');
    // The Home preview reads the same store, so it is refreshed from here and
    // can never drift from the full database view.
    renderHomeDbPreview();
    // ERP datalists
    $('erp-sku-list').innerHTML = db.items.map(function (it) {
      return '<option value="' + esc(it.sku) + '"></option>';
    }).join('');
    $('erp-project-list').innerHTML = db.clients.map(function (c) {
      return '<option value="' + esc(c.name) + '"></option>';
    }).join('');
    $('erp-client-name-list').innerHTML = db.clients.map(function (c) {
      return '<option value="' + esc(c.name) + '"></option>';
    }).join('');
  }

  /* ── Edit session ────────────────────────────────────────────
     `dbEditing` holds the array index of the record currently loaded
     into the create form (-1 = plain "add" mode). Rather than a second
     modal, editing re-uses the existing form so validation, SKU
     de-duplication and the ERP datalists all stay in one place. */
  const dbEditing = { item: -1, client: -1 };
  let dbEditCurrency = '';

  const DB_ITEM_FIELDS = ['db-item-sku', 'db-item-name', 'db-item-unit', 'db-item-rate'];
  const DB_CLIENT_FIELDS = ['db-client-name', 'db-client-project', 'db-client-address', 'db-client-contact',
    'db-client-tin', 'db-client-posupply', 'db-client-pono', 'db-client-termsdt', 'db-client-shipto', 'db-client-hscode'];

  /* Labels the submit button for the mode it is in. Saving is always an
     EXPLICIT act in these forms — nothing here is written to storage on
     typing, blur or a field change — so the label names the action the click
     performs: "Save Item"/"Save Client" to create a record, "Update …" to
     write changes back over the record being edited. */
  function setDbFormMode(which) {
    const isItem = which === 'item';
    const editing = dbEditing[which] > -1;
    const btn = $(isItem ? 'db-item-add' : 'db-client-add');
    const cancel = $(isItem ? 'db-item-cancel' : 'db-client-cancel');
    if (btn) {
      // Save = floppy (a new record). Update = check (confirming changes).
      btn.innerHTML = '<span class="nav-icon" aria-hidden="true">' + toolIconSvg(editing ? 'check' : 'save') +
        '</span>' + (editing ? 'Update ' : 'Save ') + (isItem ? 'Item' : 'Client');
    }
    if (cancel) cancel.hidden = !editing;
  }

  function clearDbForm(which) {
    const ids = which === 'item' ? DB_ITEM_FIELDS : DB_CLIENT_FIELDS;
    for (let i = 0; i < ids.length; i++) {
      const el = $(ids[i]);
      if (el) el.value = '';
    }
  }

  /* Leaves the form blank and ready for the next entry: every input cleared,
     the edit session closed and the submit button back to its Save label.
     Called after a successful save as well as when an edit ends, so a saved
     record never leaves leftovers in the form. */
  function resetDbForm(which) {
    const wasEditing = dbEditing[which] > -1;
    dbEditing[which] = -1;
    clearDbForm(which);
    if (which === 'client') {
      const cur = $('db-client-currency');
      if (cur) {
        if (wasEditing && dbEditCurrency) {
          cur.value = dbEditCurrency;   // edit ended: put back what it held before
        } else {
          /* A finished save starts a genuinely NEW entry, so the select goes
             back to the company currency like any fresh form. It deliberately
             drops a hand-picked value too: carrying one record's currency into
             the next is exactly the leftover-data trap, and it would silently
             save a client under the wrong currency. */
          cur.value = companyCurrency();
          cur.dataset.userPicked = '';
        }
      }
      dbEditCurrency = '';
    }
    setDbFormMode(which);
  }

  // Bring the form into view so an edit started from a drawer is visible.
  function revealDbForm(which) {
    showView('db');
    const head = $(which === 'item' ? 'db-items-title' : 'db-clients-title');
    const card = head && head.closest ? head.closest('.card') : null;
    if (card && card.scrollIntoView) {
      try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { card.scrollIntoView(); }
    }
    const focusEl = $(which === 'item' ? 'db-item-sku' : 'db-client-name');
    if (focusEl) { try { focusEl.focus({ preventScroll: true }); } catch (e) { focusEl.focus(); } }
  }

  function startEditDbItem(idx) {
    const it = db.items[idx];
    if (!it) return;
    dbEditing.item = idx;
    $('db-item-sku').value = it.sku || '';
    $('db-item-name').value = it.name || '';
    $('db-item-unit').value = it.unit || '';
    // Pre-fill with what is stored, including an unreadable value, so the
    // item can be repaired rather than silently reset.
    $('db-item-rate').value = (it.rate === null || it.rate === undefined) ? '' : String(it.rate);
    setDbFormMode('item');
    revealDbForm('item');
  }

  function startEditDbClient(idx) {
    const c = db.clients[idx];
    if (!c) return;
    dbEditing.client = idx;
    const set = function (id, v) { const el = $(id); if (el) el.value = v || ''; };
    set('db-client-name', c.clientName || c.name);
    set('db-client-project', c.defaultProject);
    set('db-client-address', c.clientAddress || c.address);
    set('db-client-contact', c.contactPerson);
    set('db-client-tin', c.tinRegNo || c.tin);
    set('db-client-posupply', c.placeOfSupply);
    set('db-client-pono', c.poNo);
    set('db-client-termsdt', c.deliveryTerms);
    set('db-client-shipto', c.shipTo);
    set('db-client-hscode', c.hsCode);
    const cur = $('db-client-currency');
    if (cur && c.currency) { dbEditCurrency = cur.value; cur.value = c.currency; }
    setDbFormMode('client');
    revealDbForm('client');
  }

  // Keep the edit session pointing at the right record after a delete.
  function noteDbRemoval(which, removedIdx) {
    if (dbEditing[which] === removedIdx) { resetDbForm(which); return; }
    if (dbEditing[which] > removedIdx) dbEditing[which]--;
  }

  function addDbItem() {
    const sku = $('db-item-sku').value.trim();
    const name = $('db-item-name').value.trim();
    if (!sku || !name) {
      window.alert('Enter both an Item Key / SKU and an item name.');
      return;
    }
    const editIdx = dbEditing.item;
    const existing = dbFindItem(sku);
    if (existing && db.items.indexOf(existing) !== editIdx) {
      window.alert('SKU "' + sku + '" already exists — remove it first or pick another key.');
      return;
    }
    const record = {
      sku: sku,
      name: name,
      unit: $('db-item-unit').value.trim() || 'Nr',
      rate: storedRateFromInput($('db-item-rate').value),
      /* The only timestamp a database record has, and the only way the KPI
         trend can tell when something was added. Edits preserve the original
         through the Object.assign below; records created before this existed
         simply have no `addedAt` and are left out of the trend. */
      addedAt: Date.now()
    };
    if (editIdx > -1 && db.items[editIdx]) {
      // Update in place — never append a duplicate row.
      db.items[editIdx] = Object.assign({}, db.items[editIdx], record);
      saveDb();
      renderDb();
      resetDbForm('item');
      pushHistory({ type: 'db', tool: '', toolName: 'Item DB updated', title: sku + ' updated — ' + db.items.length + ' SKUs' });
      renderKpis();
      updateKPICards();
      return;
    }
    db.items.push(record);
    saveDb();
    resetDbForm('item');   // blank the form for the next entry
    renderDb();
    pushHistory({ type: 'db', tool: '', toolName: 'Item DB updated', title: sku + ' added — ' + db.items.length + ' SKUs' });
    renderKpis();
    updateKPICards();
  }

  function addDbClient() {
    const name = $('db-client-name').value.trim();
    if (!name) {
      window.alert('Enter a client name.');
      return;
    }
    const editIdx = dbEditing.client;
    const existing = dbFindClient(name);
    if (existing && db.clients.indexOf(existing) !== editIdx) {
      window.alert('"' + name + '" already exists — remove it first or pick another name.');
      return;
    }
    const defaultProject = ($('db-client-project') && $('db-client-project').value.trim()) || '';
    const record = {
      name: name,
      clientName: name,
      defaultProject: defaultProject,
      clientAddress: $('db-client-address').value.trim(),
      contactPerson: $('db-client-contact').value.trim(),
      tinRegNo: $('db-client-tin').value.trim(),
      placeOfSupply: $('db-client-posupply').value.trim(),
      poNo: $('db-client-pono').value.trim(),
      deliveryTerms: $('db-client-termsdt').value.trim(),
      shipTo: $('db-client-shipto').value.trim(),
      hsCode: $('db-client-hscode').value.trim(),
      // stored as-is; ERP auto-converts to a canonical code when used
      currency: $('db-client-currency').value,
      addedAt: Date.now() // see addDbItem — the KPI trend's only time source here
    };
    if (editIdx > -1 && db.clients[editIdx]) {
      // Update in place — never append a duplicate row.
      db.clients[editIdx] = Object.assign({}, db.clients[editIdx], record);
      dbEditCurrency = '';
      saveDb();
      renderDb();
      resetDbForm('client');
      pushHistory({ type: 'db', tool: '', toolName: 'Client DB updated', title: name + ' updated — ' + db.clients.length + ' clients' });
      renderKpis();
      updateKPICards();
      return;
    }
    db.clients.push(record);
    saveDb();
    resetDbForm('client'); // blank the form for the next entry
    renderDb();
    pushHistory({ type: 'db', tool: '', toolName: 'Client DB updated', title: name + ' added — ' + db.clients.length + ' clients' });
    renderKpis();
    updateKPICards();
  }

  /* ── Master ERP Engine (unified document builder) ───────────── */
  const ERP_KEY = 'calcmall_erp_v1';

  // `doc` is the document TITLE printed on the sheet; `noLabel` is the label
  // for its reference number in the metadata grid. Both follow the selected
  // mode, so a Pro Forma can no longer print "Quotation No".
  const ERP_MODES = {
    quotation:  { label: 'Quotation / Offer',        doc: 'QUOTATION',            noLabel: 'Quotation No',          refPh: 'REF-2026-001' },
    proforma:   { label: 'Pro Forma Invoice',        doc: 'PRO FORMA INVOICE',    noLabel: 'Pro Forma Invoice No',  refPh: 'PI-2026-001' },
    commercial: { label: 'Tax / Commercial Invoice', doc: 'TAX INVOICE',          noLabel: 'Tax Invoice No',        refPh: 'INV-2026-001' },
    delivery:   { label: 'Delivery Note',            doc: 'DELIVERY NOTE',        noLabel: 'Delivery Note No',      refPh: 'DN-2026-001' }
  };

  // Per-mode extra fields shown under the mode tabs. "meta" holds anything
  // beyond the shared header (bank details, VAT reg no, delivery address…).
  /* `brandKey` is the Company & Brand Settings field this input inherits
     from. The input shows the brand value whenever the document has no
     override of its own, so switching mode fills Bank / Account / SWIFT /
     Branch straight from the saved Bank & Beneficiary block — and a value
     typed here still wins. */
  const ERP_MODE_FIELDS = {
    quotation:  [],
    proforma:   [
      { key: 'payment', label: 'Payment terms', ph: 'e.g. 50% advance, balance on delivery', brandKey: 'payTerms' },
      { key: 'bank', label: 'Bank & branch', ph: 'e.g. Example Bank — Main Street Branch', brandKey: 'bankBranch' },
      { key: 'account', label: 'Account number', ph: 'e.g. 1001234567890', brandKey: 'accountNo' },
      { key: 'swift', label: 'SWIFT code', ph: 'e.g. CCEYLKLX', brandKey: 'swift' },
      { key: 'branch', label: 'Branch code', ph: 'e.g. 001', brandKey: 'branchCode' }
    ],
    commercial: [
      { key: 'vatreg', label: 'VAT / Tax reg no', ph: 'e.g. VAT123456789' },
      { key: 'consignee', label: 'Consignee details', ph: 'e.g. Acme Holdings, Colombo' }
    ],
    delivery: [
      { key: 'deliverTo', label: 'Deliver to (site / address)', ph: 'e.g. Warehouse 2, Example Industrial Zone' },
      { key: 'vehicle', label: 'Vehicle / driver (optional)', ph: 'e.g. WP CAB-1234' }
    ]
  };

  function emptyErp() {
    return {
      mode: 'quotation',
      project: '', client: '', address: '', ref: '', date: '', currency: 'LKR',
      // Date of Supply is its own field on the document. It has no input in
      // the form (the form's single date drives both), so an explicit value
      // only ever arrives from the sheet — but it still lives here, in the
      // one data object, rather than in a preview-side copy.
      supplyDate: '',
      // Consignee / order-detail block (formal invoice layout)
      contact: '', clientTin: '', placeOfSupply: '', poNo: '', deliveryTerms: '', shipTo: '', hsCode: '',
      meta: {},
      lines: [],           // { id, sku, name, unit, qty, rate }
      discount: '', vat: '18',
      terms: ''
    };
  }

  function loadErp() {
    try {
      const raw = localStorage.getItem(ERP_KEY);
      if (!raw) return emptyErp();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyErp();
      const base = emptyErp();
      const out = Object.assign(base, parsed);
      if (!ERP_MODES[out.mode]) out.mode = 'quotation';
      if (!Calc.TOOL_CURRENCIES[out.currency]) out.currency = 'LKR';
      out.meta = (out.meta && typeof out.meta === 'object') ? out.meta : {};
      out.lines = Array.isArray(out.lines) ? out.lines : [];
      /* Heal anything saved before numeric filtering existed: a qty or rate
         stored as "100 00" / "NaN" is repaired to a clean number (0 when it
         cannot be read at all) instead of being carried into the totals. */
      out.lines = out.lines.map(function (l) {
        if (!l || typeof l !== 'object') return l;
        const row = Object.assign({}, l);
        if (row.qty !== '' && row.qty !== undefined && row.qty !== null) row.qty = String(num0(row.qty));
        if (row.rate !== '' && row.rate !== undefined && row.rate !== null) row.rate = String(num0(row.rate));
        return row;
      });
      out.discount = Calc.isNumericText(out.discount) ? String(num0(out.discount)) : '';
      out.vat = Calc.isNumericText(out.vat) ? String(num0(out.vat)) : '';
      // Existing drafts join the same ordering as the database.
      out.lines.sort(function (a, b) { return compareSku(a.sku, b.sku); });
      return out;
    } catch (e) { return emptyErp(); }
  }

  let erpState = loadErp();

  function saveErp() {
    try { localStorage.setItem(ERP_KEY, JSON.stringify(erpState)); } catch (e) { /* ignore */ }
  }

  function erpMoney(v) { return Calc.fmtToolMoney(v, erpState.currency); }

  /* The currency the invoice is written in, guarded against a stale/unknown
     code so money labels never fall back to an empty symbol. */
  function erpCurrencyCode() {
    const c = erpState && erpState.currency;
    return Calc.TOOL_CURRENCIES[c] ? c : 'LKR';
  }

  /* History totals are stored as ready-formatted strings ('Rs358,720'), so a
     sum of them can only be labelled with one currency as long as they all
     share it. This reports whether more than one symbol is in play. */
  function kpiMixedCurrencies() {
    const seen = {};
    let n = 0;
    for (let i = 0; i < history.length; i++) {
      const m = String(history[i] && history[i].total || '').match(/^[^0-9\s-]+/);
      if (!m) continue;
      if (!seen[m[0]]) { seen[m[0]] = 1; n++; }
      if (n > 1) return true;
    }
    return false;
  }

  function erpLineAmount(row) {
    return Calc.boqAmount(row.qty, row.rate);
  }

  function erpDocType() { return erpState.mode !== 'delivery'; }

  /* Purchaser telephone for the document's metadata grid.
     The client "Contact person" box is a free-text line by design (its own
     placeholder is "R. Perera · +94 77 555 1234"), so it may hold a NAME, a
     number, or both. The template's Telephone No slot is a phone slot, so
     pull the phone token out of that line — mirroring brandPhone(), which
     does exactly this for the supplier side of the same box.
     Never returns a person's name: with "R. Perera" typed and no number,
     the slot stays empty rather than printing the contact person there. */
  function purchaserPhone() {
    return parseContactPair(erpState.contact).phone;
  }

  function erpNextRef() {
    const yr = new Date().getFullYear();
    const prefixes = { quotation: 'REF', proforma: 'PI', commercial: 'INV', delivery: 'DN' };
    const p = prefixes[erpState.mode] || 'REF';
    return p + '-' + yr + '-001';
  }

  function renderErpModeFields() {
    const mode = ERP_MODES[erpState.mode];
    $('erp-mode-badge').textContent = mode.label;
    const fields = ERP_MODE_FIELDS[erpState.mode] || [];
    $('erp-mode-fields').innerHTML = fields.map(function (f) {
      const id = 'erp-m-' + f.key;
      return '<div class="field"><label for="' + id + '">' + f.label + '</label>' +
        '<input type="text" id="' + id + '" data-erpmeta="' + f.key + '" placeholder="' + f.ph + '" autocomplete="off"></div>';
    }).join('');
    for (let i = 0; i < fields.length; i++) {
      const el = document.getElementById('erp-m-' + fields[i].key);
      if (!el) continue;
      /* Precedence: a value typed on THIS document wins, otherwise the saved
         brand value, otherwise blank. The document override is never copied
         into brand, and the brand value is never written into the override
         slot — so changing the brand still flows through to every document
         that has not been overridden. */
      const own = erpState.meta[fields[i].key];
      const inherited = fields[i].brandKey ? (brand[fields[i].brandKey] || '') : '';
      el.value = (own !== undefined && own !== null && String(own).trim() !== '') ? own : inherited;
    }
    // Money columns only make sense for money documents.
    const showMoney = erpDocType();
    $('erp-rate-head').hidden = !showMoney;
    $('erp-amt-head').hidden = !showMoney;
  }

  // A picked SKU whose database record carries NO usable rate (never entered,
  // or unreadable): the cell stays blank and is visibly flagged. A stored rate
  // of 0 is a real price, so it fills in and is not flagged.
  function needsRate(row) {
    if (!row || !row.sku || String(row.rate).trim() !== '') return false;
    const it = dbFindItem(row.sku);
    return !!it && dbRateInfo(it.rate).state !== 'set';
  }

  function renderErpRows() {
    const tbody = $('erp-rows');
    const showMoney = erpDocType();
    if (!erpState.lines.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No items yet. Type or pick an Item Key / SKU and press Add — details auto-fill from your database.</td></tr>';
    } else {
      tbody.innerHTML = erpState.lines.map(function (row, i) {
        const amount = erpLineAmount(row);
        return '<tr class="qr-row" data-id="' + row.id + '">' +
          '<td class="q-num">' + (i + 1) + '</td>' +
          '<td><input type="text" class="erp-sku" list="erp-sku-list" value="' + esc(row.sku) + '" placeholder="e.g. PIPE-25" autocomplete="off" aria-label="Item key"></td>' +
          '<td><input type="text" class="erp-name" value="' + esc(row.name) + '" placeholder="Item name &amp; description" autocomplete="off"></td>' +
          '<td><input type="text" class="erp-unit" value="' + esc(row.unit) + '" placeholder="Nr" autocomplete="off" aria-label="Unit type"></td>' +
          '<td><input type="text" inputmode="decimal" data-numeric="1" class="erp-qty" value="' + esc(String(row.qty)) + '" placeholder="0" aria-label="Quantity"></td>' +
          '<td class="erp-rate-col"><input type="text" inputmode="decimal" data-numeric="1" class="erp-rate' + (needsRate(row) ? ' erp-rate-unset' : '') + '" value="' + esc(String(row.rate)) + '" placeholder="' + (needsRate(row) ? 'rate' : '0') + '" aria-label="Rate"' +
            (needsRate(row) ? ' title="This SKU has no default rate in the Item Database — type one, or set it once in the database and every future line will fill in"' : '') +
            (showMoney ? '' : ' disabled') + '></td>' +
          '<td class="erp-amt-col qr-amount">' + (showMoney ? (amount === null ? '\u2014' : erpMoney(amount)) : '\u2014') + '</td>' +
          '<td><button type="button" class="qr-del" data-id="' + row.id + '" aria-label="Remove item">\u2715</button></td>' +
        '</tr>';
      }).join('');
    }
    $('erp-line-count').textContent = erpState.lines.length + (erpState.lines.length === 1 ? ' line' : ' lines');
    updateErpSummary();
  }

  function erpTotals() {
    const sub = erpState.lines.reduce(function (sum, l) {
      const a = erpLineAmount(l);
      return sum + (a === null ? 0 : a);
    }, 0);
    // num0: an empty or malformed percentage is 0, never NaN — so the
    // totals below cannot print "NaN" no matter what the fields hold.
    const discPct = num0(erpState.discount);
    const vatPct = num0(erpState.vat);
    const disc = Calc.boqDiscount(sub, discPct);
    const net = Calc.boqNet(sub, discPct);
    const vat = Calc.boqVatAmount(net, vatPct);
    const final = Calc.boqFinal(sub, discPct, vatPct);
    return { sub: sub, discPct: discPct, disc: disc, net: net, vatPct: vatPct, vat: vat, final: final };
  }

  function updateErpSummary() {
    const wrap = $('erp-summary');
    if (!erpDocType()) {
      wrap.innerHTML =
        '<div class="boq-sum-line"><span>Delivery items</span><strong>' + erpState.lines.length + '</strong></div>' +
        '<p class="summary-muted">Delivery notes list quantities only — no money columns.</p>';
      return;
    }
    const t = erpTotals();
    let html = '<div class="boq-sum-line"><span>Sub total</span><strong>' + erpMoney(t.sub) + '</strong></div>';
    if (t.discPct > 0) html += '<div class="boq-sum-line"><span>Discount (' + Calc.fmtPct(t.discPct) + ')</span><strong>\u2212 ' + erpMoney(t.disc) + '</strong></div>';
    if (t.vatPct > 0) html += '<div class="boq-sum-line"><span>VAT (' + Calc.fmtPct(t.vatPct) + ')</span><strong>+' + erpMoney(t.vat) + '</strong></div>';
    html += '<div class="boq-sum-line boq-final"><span>Final total</span><strong>' + erpMoney(t.final) + '</strong></div>';
    wrap.innerHTML = html;
  }

  // Mirror of renderErpHeader: pull every live input into erpState so a
  // snapshot always captures exactly what is on screen.
  function readErpHeader() {
    const val = function (id) { const el = document.getElementById(id); return el ? el.value : undefined; };
    if (val('erp-project') !== undefined) erpState.project = val('erp-project');
    if (val('erp-client') !== undefined) erpState.client = val('erp-client');
    if (val('erp-address') !== undefined) erpState.address = val('erp-address');
    if (val('erp-contact') !== undefined) erpState.contact = val('erp-contact');
    if (val('erp-clienttin') !== undefined) erpState.clientTin = val('erp-clienttin');
    if (val('erp-posupply') !== undefined) erpState.placeOfSupply = val('erp-posupply');
    if (val('erp-pono') !== undefined) erpState.poNo = val('erp-pono');
    if (val('erp-terms-dt') !== undefined) erpState.deliveryTerms = val('erp-terms-dt');
    if (val('erp-shipto') !== undefined) erpState.shipTo = val('erp-shipto');
    if (val('erp-hscode') !== undefined) erpState.hsCode = val('erp-hscode');
    if (val('erp-ref') !== undefined) erpState.ref = val('erp-ref');
    if (val('erp-date') !== undefined && val('erp-date') !== '') erpState.date = val('erp-date');
    if (val('erp-discount') !== undefined) erpState.discount = numericSafeText(val('erp-discount'), false);
    if (val('erp-vat') !== undefined) erpState.vat = numericSafeText(val('erp-vat'), false);
    if (val('erp-terms') !== undefined) erpState.terms = val('erp-terms');
    // Line items: read current cell values back into the state rows
    const rows = document.querySelectorAll('#erp-rows .qr-row');
    for (let i = 0; i < rows.length; i++) {
      const rowEl = rows[i];
      const row = erpState.lines.find(function (r) { return r.id === rowEl.getAttribute('data-id'); });
      if (!row) continue;
      const grab = function (cls) { const el = rowEl.querySelector('.' + cls); return el ? el.value.replace(/,/g, '') : null; };
      // Quantity and Rate are numeric by definition — strip anything that is
      // not a digit or a decimal point before it reaches the state object.
      const grabNum = function (cls) { const v = grab(cls); return v === null ? null : numericSafeText(v, false); };
      const sku = grab('erp-sku'); if (sku !== null) row.sku = sku;
      const name = grab('erp-name'); if (name !== null) row.name = name;
      const unit = grab('erp-unit'); if (unit !== null) row.unit = unit;
      const qty = grabNum('erp-qty'); if (qty !== null) row.qty = qty;
      const rate = grab('erp-rate'); if (rate !== null && !rowEl.querySelector('.erp-rate').disabled) row.rate = rate;
    }
  }

  function renderErpHeader() {
    $('erp-project').value = erpState.project;
    $('erp-client').value = erpState.client;
    $('erp-address').value = erpState.address;
    $('erp-contact').value = erpState.contact;
    $('erp-clienttin').value = erpState.clientTin;
    $('erp-posupply').value = erpState.placeOfSupply;
    $('erp-pono').value = erpState.poNo;
    $('erp-terms-dt').value = erpState.deliveryTerms;
    $('erp-shipto').value = erpState.shipTo;
    $('erp-hscode').value = erpState.hsCode;
    $('erp-ref').value = erpState.ref;
    $('erp-ref').placeholder = erpNextRef();
    $('erp-date').value = erpState.date || todayStr();
    $('erp-discount').value = erpState.discount;
    $('erp-vat').value = erpState.vat;
    $('erp-terms').value = erpState.terms;
    $('erp-currency').value = erpState.currency;
    // Mode tabs
    const tabs = document.querySelectorAll('.erp-tab');
    for (let i = 0; i < tabs.length; i++) {
      const on = tabs[i].getAttribute('data-erpmode') === erpState.mode;
      tabs[i].classList.toggle('active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    renderErpModeFields();
  }

  function renderErp() {
    renderErpHeader();
    renderErpRows();
    // Keep the editable sheet in step with programmatic state changes
    // (mode switch, record load, reset, import). No-op while it is pinned.
    schedulePdfPreview();
  }

  /* The Rate a SKU contributes to a line. Returns '' when the database
     holds no usable number for that item, so a blank cell asks the user
     to price the line instead of a fake 0 quietly joining the totals. */
  function erpRateForItem(it) {
    if (!it) return '';
    const info = dbRateInfo(it.rate);
    /* Every valid finite rate auto-fills — 0 INCLUDED. A zero-cost line is a
       legitimate price and must not be blanked out just because it is falsy.
       Only a missing or unreadable rate falls back to an empty cell. */
    return info.state === 'set' ? String(info.value) : '';
  }

  /* Line items follow the same SKU-ascending order as the master database, so
     the editing table, the document sheet and the PDF/Excel output are one
     order rather than three. A line with no SKU yet sorts to the end. */
  function sortErpLines() {
    erpState.lines.sort(function (a, b) { return compareSku(a.sku, b.sku); });
  }

  function addErpRow(sku) {
    const row = { id: uid(), sku: sku || '', name: '', unit: 'Nr', qty: '', rate: '' };
    if (sku) {
      const it = dbFindItem(sku);
      if (it) {
        row.sku = it.sku;
        row.name = it.name;
        row.unit = it.unit;
        row.rate = erpRateForItem(it);
      }
    }
    erpState.lines.push(row);
    sortErpLines();
    saveErp();
    renderErpRows();
    return row;
  }

  function erpFillFromSku(rowEl) {
    const skuInput = rowEl.querySelector('.erp-sku');
    const row = erpState.lines.find(function (r) { return r.id === rowEl.getAttribute('data-id'); });
    if (!row) return;
    const it = dbFindItem(skuInput.value);
    if (!it) return; // unknown key — keep whatever the user typed
    row.sku = it.sku;
    row.name = it.name;
    row.unit = it.unit;
    /* Auto-fill the Rate from the saved default. Every finite rate fills in,
       including 0 (a legitimately free line); only a missing or unreadable
       database rate leaves the cell blank. */
    row.rate = erpRateForItem(it);
    sortErpLines();
    saveErp();
    renderErpRows();
    // put the cursor back on the qty cell of the same row
    const again = document.querySelector('.qr-row[data-id="' + row.id + '"] .erp-qty');
    if (again) again.focus();
  }

  function erpApplyProject(name) {
    // Typing/picking a project name resolves a saved client by the
    // canonical clientName / name field and fills the full ERP header.
    // The project field itself is NOT overwritten with the client name —
    // Project Name maps to the site / job location on documents.
    const chosen = erpClientList(name).find(function (it) {
      return erpClientNormalize(it.c.clientName || it.c.name || '') === erpClientNormalize(name);
    });
    if (!chosen) return;
    erpSelectClient(chosen.c.clientName || chosen.c.name, chosen.c);
  }

  /* ── ERP Client name autocomplete (live fuzzy search + autofill) ── */
  // Performance indexes: deduplicate the client list on load when this
  // module is first required, then keep a per-key name-lookup index for
  // logged changes so re-renders never recompute the whole corpus.
  // Map each canonical DB-only client property to the ERP input id
  // that must be filled when a client is selected — the full 9-field
  // codomain so the auto-fill is complete for every ERP header field.
  const ERP_CLIENT_FIELD_MAP = [
    ['clientName', 'erp-client'],
    ['clientAddress', 'erp-address'],
    ['contactPerson', 'erp-contact'],
    ['tinRegNo', 'erp-clienttin'],
    ['placeOfSupply', 'erp-posupply'],
    ['poNo', 'erp-pono'],
    ['deliveryTerms', 'erp-terms-dt'],
    ['shipTo', 'erp-shipto'],
    ['hsCode', 'erp-hscode']
  ];
  // Normalize for matching: lowercase, strip non-alphanumeric.
  function erpClientNormalize(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, '');
  }
  // Build the live suggestion list. No filter = every client. As the
  // user types, matches rank from exact (1000) down to substring within
  // the client's canonical name, then to back-matching. The client's
  // default project / site name is searchable too so typing a project
  // name in the ERP Project Name field resolves its client.
  function erpClientList(query) {
    const q = erpClientNormalize(query);
    const out = db.clients.map(function (el) {
      const canon = erpClientNormalize(el.clientName || el.name || '');
      const proj = erpClientNormalize(el.defaultProject || '');
      if (!q) return { c: el, score: 0 };
      if (canon === q) return { c: el, score: 1000 };
      const idx = canon.indexOf(q);
      if (idx !== -1) return { c: el, score: 500 - idx };
      if (q.indexOf(canon) !== -1 && canon.length > 2) return { c: el, score: 200 };
      if (proj) {
        if (proj === q) return { c: el, score: 900 };
        const pidx = proj.indexOf(q);
        if (pidx !== -1) return { c: el, score: 400 - pidx };
        if (q.indexOf(proj) !== -1 && proj.length > 2) return { c: el, score: 150 };
      }
      return null;
    }).filter(function (x) { return x !== null; });
    out.sort(function (a, b) {
      if (a.score !== b.score) return b.score - a.score;
      return (a.c.name || '').localeCompare(b.c.name || '', undefined, { sensitivity: 'base' });
    });
    return out.slice(0, 12);
  }
  // Populate the suggestion popup list with matching clients.
  // Render the suggestion popup. `anchor` = the input that triggered it
  // (Client Name or Project Name field) — used to highlight the active
  // field and position the shared panel; `panelId` picks which popup to
  // fill so both fields can open their own list.
  function erpRenderClientSuggestions(items, anchor, panelId) {
    const el = $(panelId || 'erp-client-suggestions');
    if (!el) return;
    if (anchor) {
      anchor.setAttribute('aria-controls', el.id);
      anchor.setAttribute('aria-expanded', el.hidden ? 'false' : 'true');
    }
    if (!items || !items.length) {
      el.hidden = true;
      el.innerHTML = '<div class="erp-suggest-empty">No matching clients</div>';
      return;
    }
    const name = function (it) { return it.c.clientName || it.c.name || '—'; };
    const addr = function (it) { return it.c.defaultProject || it.c.clientAddress || it.c.address || '—'; };
    el.innerHTML = '<div class="erp-suggest-empty">' + items.length + ' match' + (items.length === 1 ? '' : 'es') + '</div>' +
      items.map(function (it) {
        return '<div class="erp-suggest-row" role="option" tabindex="-1" data-client-name="' +
          esc(name(it)).replace(/"/g, '&quot;') + '">' +
          '<span>' + esc(name(it)) + '</span>' +
          '<span class="erp-sel-addr">' + esc(addr(it)) + '</span>' +
        '</div>';
      }).join('');
    el.hidden = false;
    el.querySelectorAll('[role="option"]').forEach(function (opt, i) {
      const name = opt.getAttribute('data-client-name');
      const selected = items.find(function (it) { return it.c.name === name || it.c.clientName === name; });
      opt.addEventListener('click', function () {
        if (selected) erpSelectClient(name, selected.c);
        el.hidden = true;
        if (anchor) anchor.setAttribute('aria-expanded', 'false');
      });
    });
  }
  // Select a client from the live suggestions and fill every ERP header
  // field mapped above. The Client Name field gets the company name and
  // the Project Name field auto-fills with the client's default
  // project / site name when one is saved.
  function erpSelectClient(name, client) {
    if (!client) return;
    erpState.client = client.clientName || client.name;
    erpState.project = client.defaultProject || erpState.project || '';
    erpState.address = client.clientAddress || client.address || '';
    erpState.contact = client.contactPerson || '';
    erpState.clientTin = client.tinRegNo || '';
    erpState.placeOfSupply = client.placeOfSupply || '';
    erpState.poNo = client.poNo || '';
    erpState.deliveryTerms = client.deliveryTerms || '';
    erpState.shipTo = client.shipTo || '';
    erpState.hsCode = client.hsCode || '';
    /* The client's saved default currency overrides the company/tool default
       for THIS document — that is the whole point of the field, and the
       document is the customer-facing artefact. Say so out loud: a silently
       swapped currency is how a dollar invoice gets sent to a rupee client. */
    if (Calc.TOOL_CURRENCIES[client.currency]) {
      const wasCode = erpCurrencyCode();
      setToolCurrency('erp', client.currency);
      if (wasCode !== client.currency) {
        showToast('Document currency set to ' + client.currency + ' — ' + (client.clientName || client.name) +
          '\u2019s saved default (change it in the banner above).');
      }
    } else {
      const fallback = companyCurrency();
      if (fallback !== erpCurrencyCode()) {
        setToolCurrency('erp', fallback);
        showToast('Document currency set to the company currency, ' + fallback +
          ' \u2014 this client has no saved currency of its own.');
      }
    }
    saveErp();
    renderErpHeader();
    renderErpRows();
  }

  /* ── ERP Record Store (Primary Key / Record ID save & load) ───── */
  // Whole active ERP form state (header fields, mode meta, lines,
  // discount/VAT, terms, mode) snapshotted under one user-chosen ID in
  // 'calcmall_erp_records_v1'. Loading restores every field, the line
  // table and the live summary instantly.
  const ERP_RECORDS_KEY = 'calcmall_erp_records_v1';

  function loadErpRecords() {
    try {
      const raw = localStorage.getItem(ERP_RECORDS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) { return {}; }
  }

  let erpRecords = loadErpRecords();

  function saveErpRecords() {
    try { localStorage.setItem(ERP_RECORDS_KEY, JSON.stringify(erpRecords)); } catch (e) { /* ignore */ }
  }

  // Snapshot = everything that defines the active document.
  function erpRecordSnapshot() {
    readErpHeader();
    return {
      savedAt: new Date().toISOString(),
      state: JSON.parse(JSON.stringify(erpState))
    };
  }

  function erpRecordMeta(id) {
    const rec = erpRecords[id];
    const el = $('erp-record-meta');
    if (!el) return;
    if (!rec) { el.textContent = id ? 'No record saved as "' + id + '" yet' : 'Not saved yet'; return; }
    const d = new Date(rec.savedAt);
    const when = isNaN(d) ? '' : ' · ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    el.textContent = 'Saved: ' + (rec.state.client || rec.state.project || 'untitled') +
      ' · ' + rec.state.lines.length + ' lines' + when;
  }

  async function erpSaveRecord() {
    const id = $('erp-record-id').value.trim();
    if (!id) {
      window.alert('Enter a Primary Key / Record ID first (e.g. 1 or ACME-WH-01), then click Save Record.');
      $('erp-record-id').focus();
      return;
    }
    const snapshot = erpRecordSnapshot();
    const exists = !!erpRecords[id];
    if (exists && !(await confirmAction({
      title: 'Overwrite saved record?',
      message: 'Record "' + id + '" already exists. Overwrite it with the current form?',
      confirmLabel: 'Overwrite'
    }))) return;
    erpRecords[id] = snapshot;
    saveErpRecords();
    erpRecordMeta(id);
    pushHistory({
      type: 'copy', tool: 'erp', toolName: 'ERP record saved',
      title: id + (erpState.client ? ' — ' + erpState.client : ''),
      total: erpDocType() ? erpMoney(erpTotals().final) : '',
      client: erpState.client || '',
      ref: id,
      draft: { tool: 'erp' }
    });
    renderActivity();
    renderKpis();
    updateKPICards();
    window.alert('Record "' + id + '" saved' + (exists ? ' (overwritten)' : '') + '. Load it anytime by typing the same ID and pressing Load Record.');
  }

  function erpLoadRecord(silent) {
    const id = $('erp-record-id').value.trim();
    if (!id) {
      if (!silent) { window.alert('Enter the Record ID to load.'); $('erp-record-id').focus(); }
      return false;
    }
    const rec = erpRecords[id];
    if (!rec || !rec.state) {
      if (!silent) window.alert('No record saved as "' + id + '". Check the ID or save the current form first.');
      return false;
    }
    erpState = Object.assign(emptyErp(), rec.state);
    if (!ERP_MODES[erpState.mode]) erpState.mode = 'quotation';
    if (!Calc.TOOL_CURRENCIES[erpState.currency]) erpState.currency = 'LKR';
    erpState.meta = (erpState.meta && typeof erpState.meta === 'object') ? erpState.meta : {};
    erpState.lines = Array.isArray(erpState.lines) ? erpState.lines : [];
    saveErp();
    setToolCurrency('erp', erpState.currency);
    renderErp();
    erpRecordMeta(id);
    if (!silent) window.alert('Record "' + id + '" loaded — header, items and totals restored.');
    return true;
  }

  async function erpDeleteRecord() {
    const id = $('erp-record-id').value.trim();
    if (!id) { window.alert('Enter the Record ID to delete.'); return; }
    if (!erpRecords[id]) { window.alert('No record saved as "' + id + '".'); return; }
    if (!(await confirmAction({
      title: 'Delete saved record?',
      message: 'Delete saved record "' + id + '"? The current form stays as it is.',
      confirmLabel: 'Delete',
      danger: true
    }))) return;
    delete erpRecords[id];
    saveErpRecords();
    erpRecordMeta(id);
    renderActivity();
    renderKpis();
    updateKPICards();
  }

  /* ── Excel / CSV import (SheetJS) + template download ──────────── */
  // Column-name matching is fuzzy (case/space/punctuation-insensitive).
  // Header block = first row(s) of "Field | Value" pairs; item rows are
  // any row with a Description/Item + Qty or Rate. Multiple sheets are
  // scanned: the first parseable sheet feeds the header, every sheet's
  // item rows append to the active document.
  function normCol(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const ERP_IMPORT_FIELDS = [
    ['project',   ['projectname', 'project', 'projecttitle']],
    ['client',    ['clientname', 'client', 'customername', 'customer', 'billto']],
    ['address',   ['address', 'clientaddress', 'customeraddress']],
    ['clientTin', ['tin', 'clienttin', 'tinno', 'tinnumber', 'regno', 'vatregno', 'vatno']],
    ['contact',   ['contactperson', 'contact', 'contactno', 'phone']],
    ['placeOfSupply', ['placeofsupply', 'place']],
    ['poNo',      ['pono', 'ponumber', 'po', 'purchaseorder', 'purchaseorderno']],
    ['deliveryTerms', ['deliveryterms', 'terms', 'termsOfdelivery']],
    ['shipTo',    ['shipto', 'deliveryaddress', 'siteaddress']],
    ['hsCode',    ['hscode', 'hs', 'hsncode']],
    ['ref',       ['refno', 'referenceno', 'referencenumber', 'quotationno', 'invoiceno', 'docno']],
    ['discount',  ['discount', 'discountpercent', 'discountpct']],
    ['vat',       ['vat', 'vatpercent', 'vatpct', 'tax', 'taxpercent']]
  ];

  const ERP_IMPORT_LINE_COLS = {
    sku:  ['sku', 'itemkey', 'itemcode', 'code', 'primarykey'],
    name: ['description', 'itemdescription', 'itemname', 'item', 'specification', 'specificationmakemodel', 'details', 'particulars'],
    unit: ['unit', 'unittype', 'uom'],
    qty:  ['qty', 'quantity', 'no', 'nos'],
    rate: ['rate', 'unitrate', 'unitprice', 'price', 'ratecurrency', 'rateusd', 'ratelkr']
  };

  function erpImportTemplate() {
    if (typeof XLSX === 'undefined') {
      showToast('The spreadsheet library did not load (offline?) — the template needs one online page load.', 'error');
      return;
    }
    const headerRows = [
      ['Field', 'Value'],
      ['Project Name', 'Wattala Warehouse Fire-Alarm Upgrade'],
      ['Client Name', 'Acme Holdings (Pvt) Ltd'],
      ['Address', '123 Galle Road, Colombo 03'],
      ['Contact Person', 'R. Perera · +94 77 555 1234'],
      ['TIN', 'TIN 123 456 789'],
      ['Place of Supply', 'Western Province'],
      ['PO No', 'PO-2026-0451'],
      ['Delivery Terms', 'Delivered to site (DDP)'],
      ['Ship To', 'Site gate 2, Example Industrial Zone'],
      ['HS Code', '8536.69'],
      ['Ref No', 'INV-2026-001'],
      ['Discount', '5'],
      ['VAT', '18']
    ];
    const itemRows = [
      ['SKU', 'Description', 'Unit', 'Qty', 'Rate'],
      ['SD-CV', 'Conventional smoke detector', 'Nr', 100, 3500],
      ['PIPE-25', 'PVC pipe 25mm — supply & install', 'm', 250, 850],
      ['VLV-04', 'Gate valve 2 inch', 'No', 4, 2500],
      ['TEST-01', 'Testing & commissioning', 'Lot', 1, 15000]
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(headerRows), 'Header');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemRows), 'Items');
    XLSX.writeFile(wb, 'Nexora-Engine-ERP-import-template.xlsx');
  }

  function erpImportFile(file) {
    if (typeof XLSX === 'undefined') {
      showToast('The spreadsheet library did not load (offline?). Reload the page online once and try again.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onerror = function () { showToast('Could not read that file — try saving it as .csv and importing again.', 'error'); };
    reader.onload = function () {
      let wb;
      try {
        wb = XLSX.read(reader.result, { type: 'array' });
      } catch (e) {
        showToast('That file could not be parsed as .xlsx / .xls / .csv. Re-save from Excel as "CSV (comma delimited)" and try again.', 'error');
        return;
      }
      let headerHits = 0, lineCount = 0;
      for (let s = 0; s < wb.SheetNames.length; s++) {
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[s]], { header: 1, defval: '' });
        if (!aoa.length) continue;
        // Locate the header row: the row containing the most recognized column names.
        let headRow = -1, best = 0;
        const known = {};
        for (let r = 0; r < Math.min(aoa.length, 25); r++) {
          const cells = aoa[r].map(normCol);
          let score = 0;
          Object.keys(ERP_IMPORT_LINE_COLS).forEach(function (key) {
            const idx = cells.findIndex(function (c) { return c && ERP_IMPORT_LINE_COLS[key].indexOf(c) !== -1; });
            if (idx !== -1) { known[key] = idx; score += 1; }
          });
          if (score > best) { best = score; headRow = r; }
        }
        const isHeaderSheet = headRow === -1;
        if (isHeaderSheet) {
          // "Field | Value" pairs sheet — match against ERP_IMPORT_FIELDS.
          for (let r = 0; r < aoa.length; r++) {
            const key = normCol(aoa[r][0]);
            const val = aoa[r][1];
            if (!key || val === '' || val == null) continue;
            for (let f = 0; f < ERP_IMPORT_FIELDS.length; f++) {
              if (ERP_IMPORT_FIELDS[f][1].indexOf(key) !== -1) {
                erpState[ERP_IMPORT_FIELDS[f][0]] = String(val);
                headerHits += 1;
                break;
              }
            }
          }
          continue;
        }
        // Item sheet: append every row below the header that has content.
        for (let r = headRow + 1; r < aoa.length; r++) {
          const cells = aoa[r];
          const getv = function (key) { return known[key] === undefined ? '' : cells[known[key]]; };
          const desc = String(getv('name') == null ? '' : getv('name')).trim();
          const qty = String(getv('qty') == null ? '' : getv('qty')).replace(/,/g, '').trim();
          const rate = String(getv('rate') == null ? '' : getv('rate')).replace(/,/g, '').trim();
          if (!desc && qty === '' && rate === '') continue;
          erpState.lines.push({
            id: uid(),
            sku: String(getv('sku') == null ? '' : getv('sku')).trim(),
            name: desc,
            unit: String(getv('unit') == null ? '' : getv('unit')).trim() || 'Nr',
            // Imported numbers go through the same sanitiser as typed ones.
            qty: numericSafeText(qty, false),
            rate: numericSafeText(rate, false)
          });
          lineCount += 1;
        }
      }
      if (!headerHits && !lineCount) {
        showToast('No recognizable data found. Use the Template button to see the exact expected format.', 'error');
        return;
      }
      sortErpLines();
      saveErp();
      renderErp();
      updateErpSummary();
      showToast('Successfully imported ' + lineCount + ' items into document.');
    };
    reader.readAsArrayBuffer(file);
  }

  /* ── Formal document layout (sample engineering template) ─────────── */
  // One shared builder for the ERP engine, the Smart Invoice builder and
  // the standalone Quotation: letterhead (logo + registered address block
  // + specialization tagline) with a document banner (type / doc no / date
  // / supplier TIN) on the right, a two-column consignee | order-details
  // box, the standardized right-aligned line-item table, a right-aligned
  // totals block with the amount-in-words line, and a two-column footer
  // (bank & beneficiary | sign-off with company seal area).

  function formalLetterhead(opts) {
    const logo = opts.logo
      ? '<img class="quo-logo-img" src="' + opts.logo + '" alt="Company logo">'
      : '<div class="quo-logo">' + esc((opts.name || 'CM').slice(0, 2).toUpperCase()) + '</div>';
    const addrLine = opts.address ? '<div>' + esc(opts.address) + '</div>' : '';
    const tel = opts.phone ? '<div><span class="fm-lab">Tel:</span> ' + esc(opts.phone) + '</div>' : '';
    const mail = opts.email ? '<div><span class="fm-lab">Email:</span> ' + esc(opts.email) + '</div>' : '';
    const web = opts.website ? '<div><span class="fm-lab">Web:</span> ' + esc(opts.website) + '</div>' : '';
    const spec = opts.spec ? '<div class="fm-spec">' + esc(opts.spec) + '</div>' : '';
    const bannerRows = [];
    if (opts.ref) bannerRows.push('<div><span class="fm-lab">' + esc(opts.refLabel || 'Doc No') + ':</span> <strong>' + esc(opts.ref) + '</strong></div>');
    if (opts.date) bannerRows.push('<div><span class="fm-lab">Date:</span> ' + esc(opts.date) + '</div>');
    if (opts.tin) bannerRows.push('<div><span class="fm-lab">TIN:</span> ' + esc(opts.tin) + '</div>');
    return '<div class="fm-head">' +
      '<div class="fm-left">' + logo +
        '<div class="fm-co"><h1>' + esc(opts.name || 'YOUR COMPANY') + '</h1>' + addrLine + tel + mail + web + spec + '</div>' +
      '</div>' +
      '<div class="fm-right">' +
        '<div class="fm-banner">' + esc(opts.docType || 'INVOICE') + '</div>' +
        bannerRows.join('') +
      '</div>' +
    '</div>';
  }

  // Two-column metadata box: billed-to / consignee | order details.
  function formalMetaBox(left, right, leftLabel) {
    const li = left.map(function (r) { return r[1] ? '<div><span class="fm-lab">' + esc(r[0]) + ':</span> ' + esc(r[1]) + '</div>' : ''; }).join('');
    const ri = right.map(function (r) { return r[1] ? '<div><span class="fm-lab">' + esc(r[0]) + ':</span> ' + esc(r[1]) + '</div>' : ''; }).join('');
    if (!li && !ri) return '';
    return '<div class="fm-metabox">' +
      '<div class="fm-meta-col"><h3>' + esc(leftLabel || 'Consignee / Billed To') + '</h3>' + (li || '<div class="fm-dim">\u2014</div>') + '</div>' +
      '<div class="fm-meta-col"><h3>Order Details</h3>' + (ri || '<div class="fm-dim">\u2014</div>') + '</div>' +
    '</div>';
  }

  function fmLineRows(lines, money) {
    return lines.map(function (l, i) {
      const amt = l.amount;
      const rateCell = money ? '<td class="q-r">' + (l.rate === null || l.rate === undefined || l.rate === '' ? '\u2014' : l.money(l.rate)) + '</td>' : '';
      const amtCell = money ? '<td class="q-r">' + (amt === null || amt === undefined ? '\u2014' : l.money(amt)) + '</td>' : '';
      return '<tr>' +
        '<td class="q-num">' + (i + 1) + '</td>' +
        '<td>' + esc(l.desc || '\u2014') + '</td>' +
        '<td class="q-c">' + esc(l.unit || '') + '</td>' +
        '<td class="q-r">' + (l.qty !== '' && l.qty !== null && l.qty !== undefined ? Calc.fmtNum(l.qty) : '\u2014') + '</td>' +
        rateCell + amtCell +
      '</tr>';
    }).join('');
  }

  function formalLineTable(lines, curLabel, money, totals) {
    const head = '<tr>' +
      '<th class="q-num">Item #</th><th>Description / Specification (Make &amp; Model)</th>' +
      '<th class="q-c">Unit</th><th class="q-r">Qty</th>' +
      (money ? '<th class="q-r">Rate (' + esc(curLabel) + ')</th><th class="q-r">Total Amount (' + esc(curLabel) + ')</th>' : '') +
    '</tr>';
    return '<table class="quo-table fm-table">' +
      '<thead>' + head + '</thead><tbody>' + fmLineRows(lines, money) + '</tbody>' +
      (money && totals ? formalTotalsFoot(totals, curLabel) : '') +
    '</table>';
  }

  function formalTotalsFoot(t, curLabel) {
    const csp = (t.colspan || 3);
    const pad = function () { let s = ''; for (let i = 0; i < csp; i++) s += '<td></td>'; return s; };
    let html = '<tfoot class="fm-totals">';
    html += '<tr><td colspan="' + csp + '">Sub Total</td><td class="q-r">' + t.money(t.sub) + '</td>' + pad() + '</tr>';
    html += '<tr><td colspan="' + csp + '">Discount' + (t.discPct > 0 ? ' (' + Calc.fmtPct(t.discPct) + ')' : '') + '</td><td class="q-r">' + (t.disc > 0 ? '\u2212' : '') + t.money(t.disc) + '</td>' + pad() + '</tr>';
    html += '<tr><td colspan="' + csp + '">Net Amount</td><td class="q-r">' + t.money(t.net) + '</td>' + pad() + '</tr>';
    html += '<tr><td colspan="' + csp + '">VAT / Tax' + (t.vatPct > 0 ? ' (' + Calc.fmtPct(t.vatPct) + ')' : '') + '</td><td class="q-r">' + (t.vat > 0 ? '+' : '') + t.money(t.vat) + '</td>' + pad() + '</tr>';
    html += '<tr class="fm-final"><td colspan="' + csp + '">FINAL TOTAL (' + esc(curLabel) + ')</td><td class="q-r">' + t.money(t.final) + '</td>' + pad() + '</tr>';
    html += '</tfoot>';
    return html;
  }

  // "Amount In Words / Due Amount in Words: Rupees [Word Value] Only" —
  // the leading currency word follows the selected document currency.
  var FM_CUR_WORDS = {
    LKR: 'Rupees', INR: 'Rupees', USD: 'US Dollars', EUR: 'Euros', GBP: 'Pounds Sterling',
    AED: 'UAE Dirhams', CAD: 'Canadian Dollars', AUD: 'Australian Dollars', SGD: 'Singapore Dollars',
    JPY: 'Japanese Yen', CHF: 'Swiss Francs', SAR: 'Saudi Riyals', MYR: 'Malaysian Ringgit',
    ZAR: 'South African Rand', NZD: 'New Zealand Dollars'
  };

  function fmWordsLine(finalAmount, currencyCode) {
    const w = Calc.amountInWords(finalAmount) || 'Zero';
    const word = FM_CUR_WORDS[currencyCode] || 'Rupees';
    return '<div class="fm-words"><span class="fm-lab">Amount In Words / Due Amount in Words:</span> ' +
      '<strong>' + esc(word) + ' ' + esc(w) + ' Only</strong></div>';
  }

  // Bottom-left bank & beneficiary block. Brand-kit fields are the
  // source; per-document overrides (e.g. the ERP pro-forma bank inputs)
  // fill any gap. Blank-safe throughout.
  function formalBankBlock(overrides) {
    const ov = overrides || {};
    const pick = function (brandVal, ovKey) {
      const b = brandVal && String(brandVal).trim() !== '' ? String(brandVal).trim() : '';
      const o = ov[ovKey] && String(ov[ovKey]).trim() !== '' ? String(ov[ovKey]).trim() : '';
      return b || o;
    };
    const vals = {
      'Payment Terms': pick(brand.payTerms, 'payment'),
      'Beneficiary Name': pick(brand.beneficiary, 'beneficiary'),
      'Bank & Branch': pick(brand.bankBranch, 'bank'),
      'Swift Code': pick(brand.swift, 'swift'),
      'Branch Code': pick(brand.branchCode, 'branch'),
      'Account Number': pick(brand.accountNo, 'account'),
      'Account Currency': pick(brand.accountCur, 'accountCur')
    };
    const rows = Object.keys(vals).map(function (k) {
      return vals[k] ? '<div><span class="fm-lab">' + k + ':</span> ' + esc(vals[k]) + '</div>' : '';
    }).join('');
    if (!rows) return '';
    return '<div class="fm-footbox fm-bank"><h3>Bank &amp; Beneficiary Details</h3>' + rows + '</div>';
  }

  // Bottom-right sign-off + round company seal area.
  function formalSignoff(companyName) {
    return '<div class="fm-footbox fm-signbox"><h3>' + esc(companyName || 'The Company') + '</h3>' +
      '<div class="fm-seal"><span>Company Seal</span></div>' +
      '<div class="fm-onbehalfof">On Behalf of <strong>' + esc(companyName || 'The Company') + '</strong></div>' +
      '<div class="fm-sigspace"></div>' +
      '<div class="fm-sigline"></div>' +
      '<div class="fm-dim">Authorized Signatory</div>' +
    '</div>';
  }

  function formalTermsBlock(termsText) {
    const items = String(termsText || '').split('\n').filter(function (s) { return s.trim(); });
    if (!items.length) return '';
    return '<div class="fm-terms"><h3>Terms &amp; Conditions</h3><ul>' +
      items.map(function (s) { return '<li>' + esc(s.trim()) + '</li>'; }).join('') + '</ul></div>';
  }

  // ── MX document layout (strict format) ─────────────────────
  // Centered company branding header, Supplier/Purchaser metadata block,
  // fixed 6-column item table (No / Description / Unit / Qty / Rate /
  // Amount), conditional Discount & VAT rows (rendered ONLY when > 0),
  // always-on TOTAL row with double rule, amount-in-words, courtesy
  // line and "On Behalf of" signature block.
  function mxNum2(v) {
    const n = Number(v);
    if (!isFinite(n)) return '0.00';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // MX money: plain thousands groups + 2 decimals, NO currency
  // prefix inside table cells (e.g. 2,726,000.00) — the currency only
  // appears in the column headers, per the reference layout.
  function mxMoney(v) {
    return mxNum2(v);
  }

  // The letterhead band — logo/banner + company BLUE name, then
  // Reg. Address / Contact lines over a double rule, slogan below it.
  // A wide brand.logo renders as a high-res banner image at the top.
  // Document date string (DD/MM/YYYY). Falls back to today when the
  // user hasn't picked a date so "Date of Invoice" never prints empty.
  function erpFormatDate(iso) {
    const d = iso ? new Date(iso + 'T00:00:00') : new Date();
    if (isNaN(d.getTime())) return '';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  function erpDateStr() { return erpFormatDate(erpState.date); }

  // (The previous mxLetterhead / mxMetaGrid class-based builders were
  // replaced by the inline-styled generatePrintHTML() document head —
  // see below, just above buildErpDoc.)

  // MX item table: 6 bordered columns — NO · DESCRIPTION ·
  // UNIT · QTY · RATE (CUR) · AMOUNT (CUR). Grey #f2f2f2 bold header,
  // right-aligned money WITHOUT any currency prefix inside cells
  // (thousands groups + 2 decimals, e.g. 2,726,000.00). Right-hand
  // summary: Sub Total / Discount (only when > 0) / Taxable Sub Total /
  // [X]% VAT (only when > 0) / TOTAL with a double bottom border.
  function mxDocTable(lines, curLabel, money, totals, docLabel) {
    const body = lines.map(function (l, i) {
      const amt = l.amount;
      return '<tr>' +
        '<td class="mx-c mx-num">' + (i + 1) + '</td>' +
        '<td class="mx-desc">' + esc(l.desc || '\u2014') + '</td>' +
        '<td class="mx-c">' + esc(l.unit || '') + '</td>' +
        '<td class="mx-c">' + (l.qty !== '' && l.qty !== null && l.qty !== undefined ? Calc.fmtNum(l.qty) : '\u2014') + '</td>' +
        '<td class="mx-r">' + (l.rate === null || l.rate === undefined || l.rate === '' ? '\u2014' : money(l.rate)) + '</td>' +
        '<td class="mx-r">' + (amt === null || amt === undefined ? '\u2014' : money(amt)) + '</td>' +
      '</tr>';
    }).join('') || '<tr><td class="mx-c" colspan="6">\u2014</td></tr>';
    let foot = '';
    if (totals) {
      const t = totals;
      foot = '<tfoot class="mx-totals">';
      foot += '<tr><td colspan="3" class="mx-spacer"></td><td colspan="2" class="mx-sumlab">Sub Total</td><td class="mx-r">' + money(t.sub) + '</td></tr>';
      if (t.discPct > 0) {
        foot += '<tr><td colspan="3" class="mx-spacer"></td><td colspan="2" class="mx-sumlab">Discount (' + Calc.fmtPct(t.discPct) + ')</td><td class="mx-r">\u2212 ' + money(t.disc) + '</td></tr>';
        foot += '<tr><td colspan="3" class="mx-spacer"></td><td colspan="2" class="mx-sumlab">Taxable Sub Total</td><td class="mx-r">' + money(t.net) + '</td></tr>';
      }
      if (t.vatPct > 0) {
        foot += '<tr><td colspan="3" class="mx-spacer"></td><td colspan="2" class="mx-sumlab">' + Calc.fmtPct(t.vatPct) + ' VAT</td><td class="mx-r">' + money(t.vat) + '</td></tr>';
      }
      foot += '<tr class="mx-grand"><td colspan="3" class="mx-spacer"></td><td colspan="2" class="mx-sumlab">TOTAL</td><td class="mx-r">' + money(t.final) + '</td></tr>';
      foot += '</tfoot>';
    }
    return '<table class="mx-table">' +
      '<colgroup><col class="w6"><col class="w44"><col class="w10"><col class="w8"><col class="w16"><col class="w16"></colgroup>' +
      '<thead><tr>' +
        '<th class="mx-c mx-num">NO</th>' +
        '<th class="mx-th-left">DESCRIPTION</th>' +
        '<th class="mx-c">UNIT</th>' +
        '<th class="mx-c">QTY</th>' +
        '<th class="mx-r">RATE (' + esc(curLabel) + ')</th>' +
        '<th class="mx-r">AMOUNT (' + esc(curLabel) + ')</th>' +
      '</tr></thead>' +
      '<tbody>' + body + '</tbody>' +
      foot +
    '</table>';
  }

  // The footer band: bold full-width words line, centered courtesy
  // sentence, right-aligned signature block (On Behalf of …, / signature
  // & stamp space / Authorized Signatory).
  function mxFooter(finalAmount, currencyCode, termsText, companyName) {
    const w = Calc.amountInWords(finalAmount) || 'Zero';
    const word = FM_CUR_WORDS[currencyCode] || 'Rupees';
    return '<div class="mx-words"><span class="mx-lab">Due amount in words:</span> <strong>' + esc(word) + ' ' + esc(w) + ' Only</strong></div>' +
      '<div class="mx-thanks">Thanking you for making business with us and assuring you our very best services at all times</div>' +
      '<div class="mx-signbox">' +
        '<div class="mx-onbehalf">On Behalf of <strong>' + esc(companyName || 'The Company') + '</strong>,</div>' +
        '<div class="mx-sigspace"></div>' +
        '<div class="mx-sigline">_______________________</div>' +
        '<div class="mx-signatory">Authorized Signatory</div>' +
      '</div>';
  }

  // Shared AOA (array of arrays) snapshot of the active document — drives
  // both the Excel (.xlsx) and CSV exports so the two stay identical.
  function mxSheetAoa() {
    const t = erpTotals();
    const dateStr = erpDateStr();
    const rows = [];
    rows.push([brandDocTitle()]);
    if (mxLegalName() !== brandDocTitle()) rows.push([mxLegalName()]);
    if (brand.address) rows.push(['Reg. Address: ' + brand.address]);
    const contactLine = [brandPhone(), brandEmail(), brand.website].filter(function (v) { return v && String(v).trim() !== ''; }).join(' | ');
    if (contactLine) rows.push(['Contact: ' + contactLine]);
    if (brand.spec) rows.push([brand.spec]);
    rows.push([]);
    rows.push(['Supplier', '', 'Purchaser', '']);
    rows.push(['Date of Invoice', dateStr, ERP_MODES[erpState.mode].noLabel || 'Doc No', erpState.ref || '']);
    rows.push(["Supplier's TIN", brand.tin || '', "Purchaser's TIN", erpState.clientTin || '']);
    rows.push(["Supplier's Name", mxLegalName(), "Purchaser's Name", erpState.client || '']);
    rows.push(['Address', brand.address || '', 'Address', erpState.address || '']);
    // Same source as the PDF: a phone extracted from the contact line, never
    // the contact person's name.
    rows.push(['Telephone No', brandPhone() || '', 'Telephone No', purchaserPhone()]);
    rows.push(['Date of Supply', dateStr, 'Place of Supply', erpState.placeOfSupply || '']);
    if (erpState.poNo) rows.push(['', '', 'PO No', erpState.poNo]);
    rows.push([]);
    rows.push(['NO', 'DESCRIPTION', 'UNIT', 'QTY', 'RATE (' + erpState.currency + ')', 'AMOUNT (' + erpState.currency + ')']);
    let idx = 0;
    erpState.lines.forEach(function (l) {
      idx += 1;
      // num0 through the same sanitizer the inputs use: the spreadsheet can
      // never contain a literal "NaN" cell, and round2 keeps binary float
      // noise (0.1 + 0.2 style tails) out of the money columns.
      const amt = erpLineAmount(l);
      rows.push([idx, l.name || l.sku || '', l.unit || '', Calc.round2(num0(l.qty)), Calc.round2(num0(l.rate)),
        amt === null ? 0 : Calc.round2(amt)]);
    });
    rows.push([]);
    rows.push(['', '', '', '', 'Sub Total', Calc.round2(num0(t.sub))]);
    if (t.discPct > 0) {
      rows.push(['', '', '', '', 'Discount (' + Calc.fmtPct(t.discPct) + ')', Calc.round2(-num0(t.disc))]);
      rows.push(['', '', '', '', 'Taxable Sub Total', Calc.round2(num0(t.net))]);
    }
    if (t.vatPct > 0) {
      rows.push(['', '', '', '', Calc.fmtPct(t.vatPct) + ' VAT', Calc.round2(num0(t.vat))]);
    }
    rows.push(['', '', '', '', 'TOTAL', Calc.round2(num0(t.final))]);
    const w = Calc.amountInWords(t.final) || 'Zero';
    rows.push(['Due amount in words:', (FM_CUR_WORDS[erpState.currency] || 'Rupees') + ' ' + w + ' Only']);
    return rows;
  }

  function exportErpExcel() {
    if (typeof XLSX === 'undefined') {
      window.alert('The spreadsheet library did not load (offline?). Excel export needs one online page load — try again once the page has internet.');
      return;
    }
    if (!erpState.lines.length) {
      const err = $('erp-error');
      err.textContent = 'Add at least one item before exporting.';
      err.hidden = false;
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(mxSheetAoa());
    ws['!cols'] = [{ wch: 6 }, { wch: 42 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Document');
    XLSX.writeFile(wb, (ERP_MODES[erpState.mode].doc + ' ' + (erpState.ref || '')).trim() + '.xlsx');
    pushHistory({
      type: 'copy', tool: 'erp', toolName: 'Master ERP Engine — Excel export',
      title: erpState.client || erpState.project || ERP_MODES[erpState.mode].label,
      total: erpDocType() ? erpMoney(erpTotals().final) : '',
      client: erpState.client || '',
      ref: erpState.ref || '',
      draft: { tool: 'erp' }
    });
  }

  // The template prefixes the site with 'www.' — strip any protocol / www.
  function webHost(u) {
    return String(u == null ? '' : u).replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  }

  /* ── MASTER TEMPLATE — sample tax invoice (INV-000) ───────────────────
     Every number in MXPT was MEASURED out of the client's master PDF
     (sample tax invoice, INV-000): US Letter 612×792pt, 46.08pt side
     margins, 9.8pt Roboto body, 23.5pt Roboto-Bold title, 0.96pt rules,
     28.44pt table header + 32.64pt item rows + 17.76pt total rows.
     This is a FIXED template — only the DATA changes. If the layout must
     change, re-measure the master first; never restyle it by eye. */
  const MXPT = {
    pageW: 612, pageH: 792,
    margin: 46.08, contentW: 519.84,
    bannerH: 54.05, frameGap: 0.94,   // full-bleed letterhead band + gap
    // The master's full-width letterhead image box, verbatim from the PDF's
    // cm operator (607.208 0 0 52.7361 2.39618 735.32 — y from the page top
    // = 3.944). Used only if the supplier uploads their OWN full-width
    // letterhead; the region is fixed by the master and never recomputed.
    banner: { x: 2.39618, y: 3.944, w: 607.208, h: 52.7361 },
    titleBandH: 62.27, titleSize: 23.5, titlePadB: 6.36,
    bandH: 19.2,                      // Date-of-Invoice band / Additional info
    gutter: 6.36,                     // gaps between the metadata blocks
    boxH: 118.71,                     // supplier + purchaser boxes (6 rows)
    rowH: 19.2,
    leftW: 245.81, midW: 6.96, rightW: 267.07,
    gapTable: 19.68,
    headH: 28.44, itemH: 32.64, totalH: 17.76,
    cols: [28.44, 224.33, 37.22, 48.96, 81.39, 99.5],
    labelW: 82.94, labelWR: 86.18, labelWA: 102.86,
    body: 9.8, rule: 0.96,
    fill: '#d9e1f2',                  // item-table header fill
    blue: '#01069d',                  // letterhead blue
    // Line boxes tuned so each text BASELINE lands where the master's is
    // (measured: Roboto 9.8pt → ascent 9.09pt, content 11.48pt;
    //  baseline = rowTop + halfLeading + ascent).
    lh: { meta: '14.66pt', addl: '14.42pt' },
    // Table cells are TOP-aligned (so a wrapped description keeps the row
    // number, unit, qty and amounts on its first line) at a fixed 1.3 line
    // height. padTop puts the first baseline on the master's, derived from
    // the verified mid-aligned offsets: head 16.22, item 18.32, total 12.23
    // → padTop = offset − halfLeading(0.63) − ascent(9.09).
    cellLh: 1.3,
    padTop: { head: 6.2, item: 8.35, total: 0.85 },
    // footer rhythm — master baselines (from the table's bottom border):
    // words +20.16, courtesy +49.20, onBehalf +80.55, signatory +147.99.
    // first line lands at 20.16 (11.19 baseline offset + 8.97 margin); the
    // rest are gaps on top of the 14pt line box.
    f: { words: 8.97, courtesy: 15.04, onBehalf: 17.35, signatory: 53.44, pad: 20.35 },
    // footer lines are 14pt boxes with 9.8pt text: baseline offset 11.19pt
    lineBox: 14, baseOff: 11.19,
    /* Letterhead text block — positions measured from the master's header,
       but expressed as FLOW margins instead of absolute offsets so a long
       company name / address / contact wraps and pushes the block down
       rather than being clipped (margins chosen to land on the exact same
       page offsets the master's banner uses). */
    hdr: {
      /* nameM carries the whole block's offset. Measured against the master's
         own letterhead raster (the divider is font-free evidence): the
         divider sits at page y 44.07 and the block's cap tops at 5.09 /
         19.56 / 31.60. Before this offset the block sat ~3pt high — the
         divider landed at 41.10. A single +2.97 here lands the divider on
         44.07 exactly and the three cap tops within 0.45pt. */
      nameM: 1.84, nameH: 16.74, nameSize: 15.5,
      addrM: -0.53, conM: 2.68, ruleM: 3.76, ruleH: 1.17, tagM: 1.90,
      lineH: 9.8, smallSize: 8.2, tagSize: 6.7,
      /* LOGO CONTAINER — a FIXED 90x90 CSS-px square whose left edge sits
         20px in from the page's left edge. Both figures are hard-coded
         absolute units; the container is absolutely positioned with an
         explicit width and height, never a percentage and never `auto`, so no
         parent flex/grid rule can resize it and no amount of invoice text
         (document number, dates, line items) can change it.
         The master defines the logo AREA, not the logo: a supplied logo is
         contain-fitted inside this square (see logoBox) and can never change
         the container, its position, or the letterhead height.
         Vertical placement is not stored here — `logoTop()` derives it from
         the three header line metrics below so it keeps tracking them. */
      /* `top: 0` is deliberate and hard-coded, not derived. The container is
         centred on the header text block ONLY while that keeps it on the
         paper: a 90px box centred on a text block whose midpoint is ~28px
         from the page edge starts ~17px ABOVE the page, which crops the top
         of the logo in print. It is therefore pinned flush to the page's top
         edge, the highest position that shows the whole 90px.
         No `max-height` on the artwork ANYWHERE: the image is exactly the
         container size and `object-fit: contain` does the fitting, so the
         rendered logo is never capped. (It was: a computed `artMaxPx`
         clamped it to 56.22px and was re-applied on every re-render, which
         is the "it keeps reverting to a smaller size" symptom.) */
      logoBox: { size: 90, left: 20, top: 0 }   // CSS px, hard-coded
    }
  };

  /* NOTE ON DATA: MXPT above encodes the master document's FORMAT ONLY
     (page box, margins, band heights, column widths, row pitches, rule
     weights). The source PDF is used strictly as a design blueprint —
     none of its company names, addresses, contacts, references, dates,
     items or amounts are built into this file. Every printable value
     arrives via the `data` argument below, sourced from the user's brand
     settings and the fields they typed. */

  function mx2(n) {
    const v = Number(n);
    if (!isFinite(v)) return '0.00';
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function generatePrintHTML(data) {
    const FONT = 'Roboto, Arial, Helvetica, sans-serif';
    const B = MXPT.body;
    const RULE = MXPT.rule + 'pt solid #000';
    const C = MXPT.cols;
    // Everything is caller-supplied. An unconfigured brand prints blank
    // lines in the right places — never another company's details.
    const supplierName = data.supplierName || '';
    const supplierAddress = data.supplierAddress || '';
    const supplierContact = data.supplierContact || '';
    const tagline = data.tagline || '';
    const docTitle = data.documentType || 'DOCUMENT';
    const items = data.items || [];

    /* LETTERHEAD — a horizontal band of the exact height the master uses,
       holding the supplier's logo (left) and their own name / address /
       contact / tagline block on the master's measured baselines. */
    const H = MXPT.hdr;
    /* Shared line builder for the lines that follow the stack. */
    const hdrLine = function (marginTop, text, extra) {
      return '<div style="margin-top:' + marginTop + 'pt;line-height:' + H.lineH +
        'pt;box-sizing:border-box;overflow-wrap:anywhere;' + extra + '">' + text + '</div>';
    };
    /* Company name / registered address / contact.
       Vertical offsets are the master's measured baselines. HORIZONTALLY the
       master CENTRES all three on the page — its own ink centres are 306.42,
       306.49 and 306.27 against a page centre of 306 — so the block is
       full-width and `text-align: center`. Right-aligning it, or boxing it
       into a 75% column, moves it off the master's position (a 75% column
       would centre it at 0.625 x page width, not 0.5). */
    const detailsBlock =
      '<div style="margin-top:' + H.nameM + 'pt;min-height:' + H.nameH + 'pt;line-height:' + H.nameH +
        'pt;text-align:center;font-family:\'Times New Roman\', Times, serif;font-weight:700;font-size:' + H.nameSize +
        'pt;color:' + MXPT.blue + ';box-sizing:border-box;overflow-wrap:anywhere;">' + supplierName + '</div>' +
      hdrLine(H.addrM, (supplierAddress ? 'Reg. Address: ' + supplierAddress : ''), 'text-align:center;font-size:' + H.smallSize + 'pt;color:#000;') +
      hdrLine(H.conM, supplierContact, 'text-align:center;font-size:' + H.smallSize + 'pt;color:#000;');
    /* LOGO PLACEHOLDER — a FIXED 90x90px square; only the logo inside it
       changes. Nothing is copied in from another company's template, so with
       nothing uploaded the square stays empty. A supplied logo is filled into
       the square with `object-fit: contain`, which scales it proportionally
       (aspect ratio preserved, never stretched or squashed) and
       `object-position: center` centres it, at whatever size fits — so a
       differently-shaped logo simply leaves more whitespace rather than
       changing the square.
       The square is ABSOLUTELY positioned, so no logo can ever grow, shrink,
       push, or reposition the header, the company name, the divider or any
       other element: it is out of flow by construction. */
    /* The supplied logo is CONTAIN-fitted into the square: the image element
       fills the container and `object-fit: contain` scales the artwork
       proportionally to the largest size that fits inside it. Contain scales
       UP as well as down, so a small logo is enlarged to use the space (it is
       never left unnecessarily small) and an oversized one is reduced — the
       aspect ratio is preserved in both directions and the artwork is never
       stretched, squashed or cropped. `object-position: center center`
       centres it, so a logo with a different aspect ratio simply leaves
       whitespace inside the square instead of changing it.
       SIZING: the container's width/height are absolute px constants — never a
       percentage and never `auto` — so neither the parent flex rules nor the
       length of the invoice content can resize it. Because the artwork is a
       child that only ever *fits inside* the box, it can never drive the box
       either; the box is the constant and the artwork is the variable. */
    /* Vertical: the container is pinned to the page's top edge at
       `H.logoBox.top` (0px) rather than centred on the text block. Centring
       is what produced the shrinking: a 90px box centred on a text block
       whose midpoint is ~28px from the page top starts ~17px ABOVE the paper,
       and the only way to keep it "centred" AND on the page was to cap the
       artwork at 56.22px — which is exactly the smaller logo that kept coming
       back. The box now sits flush to the top edge so the full 90px is
       visible, and the rule + tagline beneath it are pushed down by the
       `ruleMarginPt` below so nothing crosses the artwork. */
    /* The artwork is the container size, written out as literal px, with
       `object-fit: contain` doing the proportional fit inside it. There is no
       max-width, max-height or percentage on the image or on the container.
       `object-position: center center` keeps a differently-shaped logo
       centred in the square instead of pinned to a corner. */
    const boxPx = H.logoBox.size;
    /* `max-width:none;max-height:none` is not redundant: the document CSS
       carries `.mx-doc img { max-width: 100% }`, a shared rule for every
       image in the sheet. It happens to be a no-op here (the parent square is
       exactly 90px wide, so 100% == 90px) but it is precisely the kind of
       global rule that can start constraining the logo after an unrelated CSS
       change, so the logo opts out of it explicitly. */
    const logoTag = (data.logoUrl && !data.bannerUrl)
      ? '<img src="' + data.logoUrl + '" alt="Company logo" style="display:block;width:' + boxPx +
        'px;height:' + boxPx + 'px;max-width:none;max-height:none;object-fit:contain;object-position:center center;">'
      : '';
    /* No `overflow:hidden`: the artwork can never exceed the box now that both
       are the same fixed size, so the rule could only ever crop. */
    const logoBox = data.bannerUrl ? '' :
      '<div style="position:absolute;left:' + H.logoBox.left + 'px;top:' + H.logoBox.top +
        'px;width:' + boxPx + 'px;height:' + boxPx +
        'px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;">' + logoTag + '</div>';
    /* The letterhead is a FIXED-height band, exactly as the master draws it
       (`height`, not `min-height`): the name / address / contact / divider /
       tagline are painted inside 54.05pt and the next block starts at 54.05
       no matter how long that copy is. With `min-height` a filled-in tagline
       (or a wrapped address) grew the band and moved the title, the metadata
       grid and every position below it — the master's own tagline already
       overshoots the band into the empty top of the title band, and a fixed
       band reproduces that instead of re-flowing the document.
       The rule and the tagline stay FULL WIDTH (that is how the master draws
       them), so a long tagline spans the page instead of wrapping. */
    /* The logo square now owns 90px of clear height, so the divider rule and
       the tagline are pushed below it — otherwise the artwork and the
       full-width rule would cross each other. Both numbers below are derived
       from the logo box and the measured text metrics, so they cannot drift:
       `textTopPt` is where the three header lines end, `logoBottomPt` is
       where the square ends, and the rule sits `logoGapPt` under the square.
       The band is then tall enough to contain the rule and the tagline.
       CONSEQUENCE: the letterhead band is therefore taller than the master's
       54.05pt and every block below it starts that much lower. That is the
       unavoidable cost of a 90px logo — the master's own logo is 28.23pt
       (37.6px) tall precisely because that is what fits above its divider. */
    const textTopPt = H.nameM + H.nameH + H.addrM + H.lineH + H.conM + H.lineH;
    const logoBottomPt = H.logoBox.top * 0.75 + H.logoBox.size * 0.75;
    const logoGapPt = 3;
    /* The extra height is needed ONLY when a logo is actually present. With
       no logo the letterhead keeps the master's own 54.05pt band and 3.76pt
       rule margin, so the whole document stays on the master's measured
       baselines; the 90px square is the only reason to grow anything. */
    const hasLogo = !!(data.logoUrl && !data.bannerUrl);
    const ruleMarginPt = hasLogo ? (logoBottomPt + logoGapPt - textTopPt) : H.ruleM;
    const textBandH = hasLogo
      ? (textTopPt + ruleMarginPt + H.ruleH + H.tagM + H.lineH)
      : MXPT.bannerH;
    const textHeader =
      '<div style="display:flow-root;height:' + textBandH.toFixed(2) + 'pt;box-sizing:border-box;overflow-wrap:anywhere;">' +
      logoBox +
      detailsBlock +
      '<div style="margin-top:' + ruleMarginPt.toFixed(2) + 'pt;height:' + H.ruleH + 'pt;background:#000;"></div>' +
      hdrLine(H.tagM, tagline, 'text-align:center;font-style:italic;font-size:' + H.tagSize + 'pt;color:' + MXPT.blue + ';') +
      '</div>';
    /* The full-width letterhead, drawn in the master's own image box taken
       straight from the PDF's cm operator. This is the LOCKED header: when
       one is supplied it IS the header, so the composed text block above is
       dropped (otherwise the brand's name would be painted over the artwork)
       and a spacer of exactly the band height takes its place — every
       position below stays on the master's measured baselines.
       `object-fit` is deliberately absent and the box carries the master's
       own width AND height, so the artwork is placed exactly as the master
       places it: no rescaling, no re-proportioning, no cropping. */
    const banner = data.bannerUrl
      ? '<img src="' + data.bannerUrl + '" alt="" style="position:absolute;left:' + MXPT.banner.x + 'pt;top:' + MXPT.banner.y + 'pt;width:' + MXPT.banner.w + 'pt;height:' + MXPT.banner.h + 'pt;display:block;">'
      : '';
    /* Only the letterhead is absolutely placed — it cannot wrap and must
       bleed to the page edges. The band stays a positioning context whose
       height is driven by the flowing header, so a long address still grows
       the band instead of clipping. */
    const headerBody = data.bannerUrl
      ? '<div style="height:' + MXPT.bannerH + 'pt;"></div>'
      : textHeader;
    const header = '<div style="position:relative;width:' + MXPT.pageW + 'pt;box-sizing:border-box;">' +
      headerBody + banner + '</div>';

    // TITLE — centered, 23.5pt bold, NO borders (the master has none)
    const title = '<div style="height:' + MXPT.titleBandH + 'pt;display:flex;align-items:flex-end;justify-content:center;padding-bottom:' +
      MXPT.titlePadB + 'pt;font-size:' + MXPT.titleSize + 'pt;font-weight:700;line-height:1;letter-spacing:0;">' + docTitle + '</div>';

    /* METADATA — flex row: bold fixed-width label, colon, then the value.
       min-height (not height) is what keeps the master's 19.2pt pitch for
       short values. A long value — address, project brief, extra notes —
       WRAPS and grows the row downwards instead of spilling over the row
       below, and the label never shrinks so every colon stays in column. */
    /* `data-edit` is the ONLY thing that makes a value editable on the
       sheet. There is no other edit affordance anywhere in the template:
       every element that does not carry it is locked furniture (letterhead
       and logo, the NO / DESCRIPTION / UNIT / QTY / RATE / AMOUNT column
       headers, the Sub Total / VAT / TOTAL labels, the "Due amount in
       words" line, the courtesy line and the sign-off). See PDF_FIELD_MAP
       and the preview's handlers for what each key writes back to. */
    const editAttr = function (key, kind, label) {
      return ' data-edit="' + key + '" data-edit-kind="' + kind + '" data-edit-label="' + label + '"';
    };
    function row(label, value, labelW, opts) {
      const o = opts || {};
      /* o.tall: the row owns TWO row slots. Used by Address, which occupies
         two slots in the master because its own value wraps over two lines.
         o.band: the row sits inside its own bordered band, which owns the
         19.2pt min-height — adding one here too would push the band's
         border on top of it and shift everything below by ~1.9pt.
         o.edit / o.kind: tags this row's VALUE as editable. Omitted for
         every supplier-side row and for Date of Invoice's label. */
      const minH = o.tall ? MXPT.rowH * 2 : MXPT.rowH;
      return '<div style="display:flex;align-items:flex-start;' + (o.band ? '' : 'min-height:' + minH + 'pt;') +
        'line-height:' + (o.lh || MXPT.lh.meta) + ';font-size:' + B + 'pt;box-sizing:border-box;overflow-wrap:anywhere;">' +
        '<span style="flex:0 0 ' + labelW + 'pt;width:' + labelW + 'pt;min-width:' + labelW +
          'pt;font-weight:700;box-sizing:border-box;">' + label + '</span>' +
        '<span style="flex:0 0 auto;font-weight:700;">:&#8201;</span>' +
        '<span' + (o.edit ? editAttr(o.edit, o.kind || 'text', label) : '') +
          ' style="flex:1 1 auto;min-width:0;white-space:pre-wrap;word-wrap:break-word;word-break:break-word;overflow-wrap:anywhere;box-sizing:border-box;">' +
          (value === null || value === undefined ? '' : String(value)) + '</span></div>';
    }
    // No overflow:hidden — a grown row must be able to push the box taller.
    const boxStyle = 'border:' + RULE + ';padding:0 0.48pt;box-sizing:border-box;overflow-wrap:anywhere;';
    // min-height, so a long invoice number / date can expand the band too.
    const bandStyle = boxStyle + 'min-height:' + MXPT.bandH + 'pt;line-height:' + MXPT.lh.addl + ';';
    /* The master's Address cell is two row slots tall because its own value
       wraps over two lines. It was modelled here as "Address + one blank
       row", which is the same 38.4pt ONLY while the address itself fits one
       line — as soon as it wrapped, the address added its own line ON TOP of
       the blank row and the box grew 19.2pt, pushing the entire document
       down by the same amount. One row owning two slots is the same 38.4pt
       for a one-line address (so every verified baseline is untouched) and
       lets a two-line address use its existing area instead of growing. */
    const tallRow = { tall: true };
    const bandLH = { lh: MXPT.lh.addl, band: true };
    /* Editable: Date of Invoice + Date of Supply (both through the date
       picker). Everything else on the SUPPLIER side stays locked. */
    const leftBand = '<div style="' + bandStyle + '">' +
      row('Date of Invoice', data.invoiceDate, MXPT.labelW, { lh: MXPT.lh.addl, band: true, edit: 'date', kind: 'date' }) + '</div>';
    const leftBox = row("Supplier's TIN", data.supplierTin, MXPT.labelW) +
      row("Supplier's Name", supplierName, MXPT.labelW) +
      row('Address', supplierAddress, MXPT.labelW, tallRow) +
      row('Telephone No', data.supplierPhone, MXPT.labelW) +
      row('Date of Supply', data.supplyDate, MXPT.labelW, { edit: 'supplyDate', kind: 'date' });
    /* Editable: the document number and every PURCHASER field. */
    const rightBand = '<div style="' + bandStyle + '">' +
      row(data.docNoLabel || 'Doc No', data.docNo, MXPT.labelWR,
        { lh: MXPT.lh.addl, band: true, edit: 'docNo' }) + '</div>';
    const rightBox = row("Purchaser's TIN", data.clientTin, MXPT.labelWR, { edit: 'clientTin' }) +
      row("Purchaser's Name", data.clientName, MXPT.labelWR, { edit: 'client' }) +
      row('Address', data.clientAddress, MXPT.labelWR, { tall: true, edit: 'clientAddress' }) +
      // Purchaser telephone is `data.clientPhone` and nothing else — there is
      // deliberately no fallback to a contact PERSON, so a name can never be
      // printed in the phone slot. Editing it rewrites only the phone token
      // inside the client's contact line (see pdfSetPurchaserPhone).
      row('Telephone No', data.clientPhone || '', MXPT.labelWR, { edit: 'clientPhone' }) +
      row('Place of Supply', data.placeOfSupply || 'N/R', MXPT.labelWR, { edit: 'placeOfSupply' });
    /* One column of the metadata grid: band, gutter, then the bordered box.
       Deliberately plain block siblings — a `height:100%` flex column inside
       a table cell resolves against an auto-height row, which makes the rows
       below land at different offsets between layouts. */
    const metaCol = function (width, band, box) {
      return '<td style="width:' + width + 'pt;vertical-align:top;padding:0;border:0;box-sizing:border-box;">' + band +
        '<div style="height:' + MXPT.gutter + 'pt;"></div>' +
        '<div style="' + boxStyle + 'min-height:' + MXPT.boxH + 'pt;box-sizing:border-box;">' + box + '</div></td>';
    };
    const meta = '<table style="width:100%;border-collapse:collapse;table-layout:fixed;border:0;box-sizing:border-box;"><tr>' +
      metaCol(MXPT.leftW, leftBand, leftBox) +
      '<td style="width:' + MXPT.midW + 'pt;padding:0;border:0;"></td>' +
      metaCol(MXPT.rightW, rightBand, rightBox) +
      '</tr></table>';

    // ADDITIONAL INFORMATION — one full-width bordered row (grows when long)
    const addlInfo = data.projectName || data.poNo || '';
    const addl = '<div style="height:' + MXPT.gutter + 'pt;"></div>' +
      '<div style="' + bandStyle + '">' +
      row('Additional Information', addlInfo, MXPT.labelWA, { lh: MXPT.lh.addl, band: true, edit: 'projectName' }) + '</div>';

    // ITEM TABLE + TOTALS — one grid, so the column rules run straight
    // through the Sub Total / Discount / VAT / TOTAL block like the master.
    const moneyCols = [C[4], C[5]];
    /* Every cell is top-aligned so the row number, unit, qty and amounts
       line up with the FIRST line of a wrapped description. `height` on a
       cell is a minimum in table layout, so any row may grow; nothing is
       clipped and nothing overlaps the row beneath. */
    const CELL_LH = MXPT.cellLh;
    const cellBase = function (height, padTop) {
      return 'border:' + RULE + ';height:' + height + 'pt;min-height:' + height + 'pt;line-height:' + CELL_LH +
        ';font-size:' + B + 'pt;vertical-align:top;box-sizing:border-box;overflow-wrap:anywhere;padding:' +
        padTop + 'pt 2.4pt 2.4pt;';
    };
    const HEAD_TD = cellBase(MXPT.headH, MXPT.padTop.head);
    const ITEM_TD = cellBase(MXPT.itemH, MXPT.padTop.item);
    const TOTAL_TD = cellBase(MXPT.totalH, MXPT.padTop.total).replace('2.4pt 2.4pt', '2.4pt 0');
    const th = function (text) {
      return '<th style="' + HEAD_TD + 'text-align:center;font-weight:700;background:' + MXPT.fill + ';">' + text + '</th>';
    };
    const thRight = function (text) {
      return '<th style="' + HEAD_TD + 'text-align:center;font-weight:700;background:' + MXPT.fill + ';white-space:nowrap;">' + text + '</th>';
    };
    // Description column: honour real line breaks and break long tokens.
    const ITEM_TD_DESC = ITEM_TD + 'text-align:left;white-space:pre-wrap;word-wrap:break-word;word-break:break-word;';
    /* Description, Unit, Qty and Rate are editable per line. AMOUNT is
       deliberately NOT tagged: it is Quantity x Rate and recalculates, so
       there is nothing to type into it. The row number is locked too. */
    const bodyRow = function (item, index) {
      const n = index + 1;
      return '<tr>' +
        '<td style="' + ITEM_TD + 'text-align:center;">' + n + '</td>' +
        '<td style="' + ITEM_TD_DESC + '"' + editAttr('item:' + index + ':desc', 'text', 'Item ' + n + ' description') + '>' + (item.description || '') + '</td>' +
        '<td style="' + ITEM_TD + 'text-align:center;"' + editAttr('item:' + index + ':unit', 'text', 'Item ' + n + ' unit') + '>' + (item.unit || '') + '</td>' +
        '<td style="' + ITEM_TD + 'text-align:center;"' + editAttr('item:' + index + ':qty', 'number', 'Item ' + n + ' quantity') + '>' + (item.qty === '' || item.qty === null || item.qty === undefined ? '0' : item.qty) + '</td>' +
        '<td style="' + ITEM_TD + 'text-align:right;"' + editAttr('item:' + index + ':rate', 'number', 'Item ' + n + ' rate') + '>' + mx2(item.rate) + '</td>' +
        '<td style="' + ITEM_TD + 'text-align:right;">' + mx2(item.amount) + '</td>' +
        '</tr>';
    };
    /* label cells span the Description+Unit+Qty columns; the No and Rate
       cells stay empty, exactly as in the master. `editKey` tags the VALUE
       cell of a summary row (only the Discount amount is editable — the
       Sub Total / VAT / TOTAL labels and figures are computed). */
    const totalRow = function (label, value, boldLabel, boldValue, editKey) {
      const td = TOTAL_TD;
      return '<tr>' +
        '<td style="' + td + '"></td>' +
        '<td colspan="3" style="' + td + 'text-align:center;' + (boldLabel ? 'font-weight:700;' : '') + '">' + label + '</td>' +
        '<td style="' + td + '"></td>' +
        '<td style="' + td + 'text-align:right;' + (boldValue ? 'font-weight:700;' : '') + '"' +
          (editKey ? editAttr(editKey, 'number', label + ' amount') : '') + '>' + mx2(value) + '</td>' +
        '</tr>';
    };
    let totals = totalRow('Sub Total', data.subTotal, true, false);
    if (Number(data.discount) > 0) totals += totalRow('Discount', -Math.abs(Number(data.discount)), true, false, 'discount');
    if (Number(data.discount) > 0) totals += totalRow('', data.netTotal, false, false);
    if (Number(data.vat) > 0) totals += totalRow((data.vatPct ? data.vatPct + '% ' : '') + 'VAT', data.vat, true, true);
    totals += totalRow('TOTAL', data.grandTotal, true, true);
    const table = '<div style="height:' + MXPT.gapTable + 'pt;"></div>' +
      '<table style="width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;border:' + RULE + ';box-sizing:border-box;">' +
      '<colgroup>' + C.map(function (w) { return '<col style="width:' + w + 'pt;">'; }).join('') + '</colgroup>' +
      '<thead><tr>' + th('No') + th('Description') + th('Unit') + th('Qty') +
        thRight('Rate (' + (data.currencyCode || 'LKR') + ')') + thRight('Amount (' + (data.currencyCode || 'LKR') + ')') + '</tr></thead>' +
      '<tbody>' + items.map(bodyRow).join('') + totals + '</tbody></table>';

    // FOOTER — words / courtesy / sign-off, all left-aligned at the margin
    const line = function (text, style, gap) {
      return '<div style="height:' + MXPT.lineBox + 'pt;line-height:' + MXPT.lineBox + 'pt;margin-top:' + gap +
        'pt;font-size:' + B + 'pt;' + style + '">' + text + '</div>';
    };
    const f = MXPT.f;
    // .mx-keep holds the sign-off together if the page is nearly full.
    const footer = '<div class="mx-keep">' +
      line('Due amount in words : ' + (data.amountInWords || ''), 'font-style:italic;', f.words) +
      line('Thanking you for making business with us and assuring you our very best services at all times', 'font-style:italic;', f.courtesy) +
      line('On Behalf of <strong>' + (supplierName || '________________') + '</strong>,', '', f.onBehalf) +
      line('Authorized Signatory', 'font-weight:700;', f.signatory) +
      '</div>' +
      '<div style="height:' + f.pad + 'pt;"></div>';

    /* The root pins font-size AND line-height. Without them the sheet
       inherits whatever the host stylesheet says for the wrapper class —
       on screen `.quo-doc` is 12px/1.5, inside the print frame
       `.mx-doc` makes it 12px/1.2 — so any element that forgot its own
       value would measure differently in the two contexts. */
    return '<div style="font-family:' + FONT + ';font-size:' + MXPT.body + 'pt;line-height:1.2;color:#000;width:' + MXPT.pageW +
      'pt;max-width:100%;min-height:' + MXPT.pageH +
      'pt;box-sizing:border-box;background:#fff;overflow-wrap:anywhere;">' +
      header +
      /* The outer wrapper carries NO border: the Date band, the two metadata
         boxes, the Additional Information band and the item grid each keep
         their own ruling and sit straight on the white canvas. `border: none`
         (not just a smaller weight) so the wrapper adds no offset to the
         inner width and nothing is double-ruled where the item table's own
         border meets it. */
      '<div style="width:' + MXPT.contentW + 'pt;margin:' + MXPT.frameGap + 'pt auto 0;border:none;box-sizing:border-box;overflow-wrap:anywhere;">' +
        title + meta + addl + table + footer +
      '</div>' +
      '</div>';
  }

  /* ── Live editable document preview ───────────────────────────
     The sheet on screen is the PRINT SOURCE, not a picture of one: the
     export step reads this DOM verbatim instead of re-running the template.

     It is NOT a second copy of the data. Every field the renderer tags with
     `data-edit` writes straight back into `erpState` — the same object the
     form edits — so there is exactly one current version of the invoice at
     all times and the two views cannot drift. That is why nothing pins the
     preview any more: "Rebuild from form" is simply "re-render the sheet
     from `erpState`", which can never discard an edit, because after an
     edit the form's data IS the edited value. */
  let pdfPreviewHtml = '';      // last template output
  let pdfPreviewTimer = null;
  let pdfDateInput = null;      // transient native date picker overlay

  function pdfPreviewState(text) {
    const pill = $('pdf-preview-state');
    if (pill) pill.textContent = text;
  }

  /* ── Which fields are editable, and what each one writes back to ──
     One table, so the preview and the form can never disagree about what a
     field means. Anything the renderer does NOT tag with `data-edit` is
     locked template furniture and gets no interaction at all. */
  const PDF_FIELD_MAP = {
    client:        { state: 'client',        input: 'erp-client' },
    clientTin:     { state: 'clientTin',     input: 'erp-clienttin' },
    clientAddress: { state: 'address',       input: 'erp-address' },
    placeOfSupply: { state: 'placeOfSupply', input: 'erp-posupply' },
    projectName:   { state: 'project',       input: 'erp-project' },
    docNo:         { state: 'ref',           input: 'erp-ref' },
    date:          { state: 'date',          input: 'erp-date' },
    supplyDate:    { state: 'supplyDate',    input: null },
    clientPhone:   { state: null,            input: 'erp-contact' }
  };

  /* Tag the editable fields the renderer marked, and nothing else. Dates get
     no `contenteditable` at all — they are set through the native picker, so
     a date field can never become free text. */
  function pdfDecorate() {
    const host = $('pdf-preview-container');
    if (!host) return;
    const fields = host.querySelectorAll('[data-edit]');
    for (let i = 0; i < fields.length; i++) {
      const el = fields[i];
      const kind = el.getAttribute('data-edit-kind') || 'text';
      const label = el.getAttribute('data-edit-label') || 'Editable field';
      el.classList.add('pdf-editable');
      el.setAttribute('spellcheck', 'false');
      el.setAttribute('aria-label', label);
      if (kind === 'date') {
        el.removeAttribute('contenteditable');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-haspopup', 'dialog');
      } else {
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('role', 'textbox');
        if (kind === 'number') el.setAttribute('inputmode', 'decimal');
      }
    }
  }

  /* Re-rendering replaces the DOM, so a field being typed into would lose
     both focus and caret. Capture them first and put them back after. */
  function pdfCaptureFocus() {
    const host = $('pdf-preview-container');
    const active = document.activeElement;
    if (!host || !active || !host.contains(active)) return null;
    const key = active.getAttribute && active.getAttribute('data-edit');
    if (!key) return null;
    let offset = null;
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) offset = sel.getRangeAt(0).startOffset;
    } catch (e) { /* ignore */ }
    return { key: key, offset: offset };
  }

  function pdfRestoreFocus(snap) {
    if (!snap) return;
    const host = $('pdf-preview-container');
    const el = host && host.querySelector('[data-edit="' + snap.key + '"]');
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    if (snap.offset === null || snap.offset === undefined) return;
    try {
      const node = el.firstChild;
      if (!node || node.nodeType !== 3) return;
      const range = document.createRange();
      range.setStart(node, Math.min(snap.offset, node.nodeValue.length));
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) { /* ignore */ }
  }

  /* Repainting replaces every node in the sheet, which blurs whatever field
     the user was typing in. That blur is our own teardown, not a user
     action, and any handler that ran a nested repaint from inside it would
     be rewriting the host's innerHTML while the outer write is still
     unwinding ("The node to be removed is no longer a child of this
     node"). The re-entrancy guard defers such a nested paint until the
     outer one has finished. */
  let pdfPainting = false;
  let pdfPaintQueued = false;

  // Paint the template output into the editable sheet.
  function paintPdfPreview() {
    const host = $('pdf-preview-container');
    if (!host) return;
    if (pdfPainting) { pdfPaintQueued = true; return; }
    const snap = pdfCaptureFocus();
    pdfPainting = true;
    try {
      pdfCloseDatePicker(false);
      host.innerHTML = pdfPreviewHtml;
    } finally {
      pdfPainting = false;
    }
    pdfDecorate();
    pdfPreviewState('Live');
    if (snap) pdfRestoreFocus(snap);
    // A paint that arrived mid-teardown re-runs now, against the newest HTML.
    if (pdfPaintQueued) { pdfPaintQueued = false; paintPdfPreview(); }
  }

  /* Re-render the sheet from `erpState`. Debounced so typing is not fought
     by a rebuild on every keystroke; `force` skips the wait (resets, the
     Rebuild button, programmatic state changes). */
  function schedulePdfPreview(force) {
    clearTimeout(pdfPreviewTimer);
    if (force) { buildErpDoc(); return; }
    pdfPreviewTimer = setTimeout(function () { buildErpDoc(); }, 260);
  }

  /* The print payload: the live sheet, with every editor-only hook removed
     so no contenteditable state, focus ring, hover tint or `data-edit`
     marker can reach the printed page. The VALUES are untouched — they are
     the document. */
  const PDF_EDITOR_ATTRS = ['contenteditable', 'spellcheck', 'role', 'inputmode', 'tabindex',
    'aria-label', 'aria-haspopup', 'data-edit', 'data-edit-kind', 'data-edit-label'];
  function pdfStripEditorHooks(root) {
    for (let i = 0; i < PDF_EDITOR_ATTRS.length; i++) root.removeAttribute(PDF_EDITOR_ATTRS[i]);
    root.classList.remove('pdf-editable', 'pdf-invalid');
    const marked = root.querySelectorAll('[data-edit], [contenteditable], .pdf-editable, .pdf-invalid');
    for (let i = 0; i < marked.length; i++) {
      for (let a = 0; a < PDF_EDITOR_ATTRS.length; a++) marked[i].removeAttribute(PDF_EDITOR_ATTRS[a]);
      marked[i].classList.remove('pdf-editable', 'pdf-invalid');
    }
  }

  function pdfPreviewPayload() {
    const host = $('pdf-preview-container');
    if (!host) return '';
    const clone = host.cloneNode(true);
    pdfStripEditorHooks(clone);
    if (clone.style) {
      if (clone.style.outline) clone.style.outline = '';
      const rest = clone.getAttribute('style');
      if (rest === null || rest.replace(/[\s;]/g, '') === '') clone.removeAttribute('style');
    }
    return clone.innerHTML;
  }

  /* ── Writing an edit back into the single source of truth ────
     Every commit lands in `erpState` — the SAME object the form binds to —
     and the matching form input is updated in the same breath. There is no
     preview-side copy of any value, so the two views cannot drift and
     "Rebuild from form" can never discard an edit. */

  function pdfFieldText(el) {
    const raw = (el.innerText !== undefined && el.innerText !== null) ? el.innerText : el.textContent;
    return String(raw === null || raw === undefined ? '' : raw);
  }

  function pdfSetInput(id, value) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el && el.value !== value) el.value = value;
  }

  /* The purchaser's telephone slot is a phone parsed out of the client's
     free-text contact line, so editing it rewrites just that token and
     leaves any contact person beside it intact. */
  function pdfSetPurchaserPhone(next) {
    const cur = String(erpState.contact || '');
    const found = parseContactPair(cur).phone;
    if (found && cur.indexOf(found) !== -1) erpState.contact = cur.replace(found, next).trim();
    else if (next) erpState.contact = cur.trim() ? cur.trim() + ' \u00b7 ' + next : next;
    pdfSetInput('erp-contact', erpState.contact || '');
  }

  /* A usable number, `''` for an empty field, or null when the text cannot
     be a number at all. "1." and ".5" are accepted so a half-typed number
     is never thrown away mid-keystroke. */
  function pdfNumeric(raw) {
    const t = String(raw === null || raw === undefined ? '' : raw).replace(/,/g, '').trim();
    if (t === '') return '';
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
    return t;
  }

  /* Commit one edited field. Returns 'ok' when it was applied (or is a
     no-op), 'revert' when the input is not usable — the caller then restores
     the field from state so a bad value can never break the document. */
  function pdfCommitField(key, raw) {
    if (key === 'discount') {
      const n = pdfNumeric(raw);
      const t = erpTotals();
      if (n === null || n === '' || t.sub <= 0) return 'revert';
      // Discount is a PERCENTAGE everywhere else in the app, so an amount
      // typed on the sheet is converted back to the percentage it means:
      // one stored value, not an amount and a percentage competing.
      const pct = (Math.abs(Number(n)) / t.sub) * 100;
      erpState.discount = String(Math.round(pct * 10000) / 10000);
      pdfSetInput('erp-discount', erpState.discount);
      updateErpSummary();
      saveErp();
      return 'ok';
    }
    if (key.indexOf('item:') === 0) {
      const parts = key.split(':');            // item : index : field
      const row = erpState.lines[Number(parts[1])];
      const field = parts[2];
      if (!row) return 'revert';
      if (field === 'qty' || field === 'rate') {
        const n = pdfNumeric(raw);
        if (n === null) return 'revert';
        if (field === 'qty' && Number(n) < 0) return 'revert';
        row[field] = n;
      } else if (field === 'desc') {
        row.name = raw.replace(/\s+$/, '');
      } else if (field === 'unit') {
        row.unit = raw.replace(/\s+/g, ' ').trim();
      } else {
        return 'revert';
      }
      // Keep the matching form row in step (rows are matched by data-id) so
      // the form's own amount cell and summary show the same numbers.
      const rowEl = document.querySelector('#erp-rows .qr-row[data-id="' + row.id + '"]');
      if (rowEl) {
        const input = rowEl.querySelector('.erp-' + (field === 'desc' ? 'name' : field));
        const shown = field === 'desc' ? row.name : row[field];
        if (input && input.value !== shown) input.value = shown;
        const amount = erpLineAmount(row);
        const cell = rowEl.querySelector('.qr-amount');
        if (cell) cell.textContent = erpDocType() ? (amount === null ? '\u2014' : erpMoney(amount)) : '\u2014';
      }
      updateErpSummary();
      saveErp();
      return 'ok';
    }
    const spec = PDF_FIELD_MAP[key];
    if (!spec) return 'revert';
    if (key === 'clientPhone') {
      pdfSetPurchaserPhone(raw.replace(/\s+/g, ' ').trim());
    } else {
      const value = key === 'date' || key === 'supplyDate' ? raw.trim() : raw.replace(/\s+/g, ' ').trim();
      if (key === 'date' || key === 'supplyDate') {
        if (value !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'revert';
      }
      erpState[spec.state] = value;
      pdfSetInput(spec.input, value);
    }
    saveErp();
    return 'ok';
  }

  /* Bad input is never kept: the field is restored from `erpState` (the only
     copy) and flashes so the rejection is visible. */
  function pdfRevertField(key) {
    schedulePdfPreview(true);
    const host = $('pdf-preview-container');
    const el = host && host.querySelector('[data-edit="' + key + '"]');
    if (!el) return;
    el.classList.add('pdf-invalid');
    setTimeout(function () { if (el.parentNode) el.classList.remove('pdf-invalid'); }, 1300);
  }

  /* ── Date fields use the form's own picker, never free text ──
     Clicking one opens a native `<input type="date">` overlaid on the exact
     spot, so the value stays the same ISO date the form stores and the
     document's layout never shifts while the picker is open. */
  function pdfStoredDate(key) {
    if (key === 'supplyDate') return erpState.supplyDate || erpState.date || '';
    return erpState.date || '';
  }

  function pdfCloseDatePicker(commit) {
    if (!pdfDateInput) return;
    const input = pdfDateInput;
    pdfDateInput = null;
    if (commit && input.value) {
      const key = input.getAttribute('data-pdf-datekey');
      if (input.value !== pdfStoredDate(key) && pdfCommitField(key, input.value) === 'ok') schedulePdfPreview(true);
    }
    if (input.parentNode) input.parentNode.removeChild(input);
  }

  function pdfOpenDatePicker(field) {
    pdfCloseDatePicker(false);
    const key = field.getAttribute('data-edit');
    if (!key) return;
    const box = field.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'pdf-date-input';
    input.setAttribute('data-pdf-datekey', key);
    input.setAttribute('aria-label', field.getAttribute('data-edit-label') || 'Date');
    input.value = pdfStoredDate(key);
    input.style.position = 'fixed';
    input.style.left = Math.round(box.left) + 'px';
    input.style.top = Math.round(box.top) + 'px';
    input.style.width = Math.max(132, Math.round(box.width) + 26) + 'px';
    input.style.height = Math.max(24, Math.round(box.height) + 2) + 'px';
    document.body.appendChild(input);
    pdfDateInput = input;
    input.addEventListener('change', function () { pdfCloseDatePicker(true); });
    input.addEventListener('blur', function () { pdfCloseDatePicker(true); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); pdfCloseDatePicker(false); }
    });
    input.focus();
    try { if (input.showPicker) input.showPicker(); } catch (e) { /* ignore */ }
  }

  function buildErpDoc() {
    const mode = ERP_MODES[erpState.mode];
    const t = erpTotals();
    const dateStr = erpDateStr();

    // Rows in the exact shape the template's mapper expects.
    const items = erpState.lines.map(function (l) {
      const amt = erpLineAmount(l);
      return {
        description: l.name || l.sku || '',
        unit: l.unit || '',
        qty: l.qty,
        rate: l.rate === '' ? 0 : Number(l.rate),
        amount: amt === null ? 0 : amt
      };
    });

    // "Contact: <phone> | email: <address> | www.<site>"
    const contactBits = [];
    if (brandPhone()) contactBits.push(brandPhone());
    if (brandEmail()) contactBits.push('email: ' + brandEmail());
    if (webHost(brand.website)) contactBits.push('www.' + webHost(brand.website));
    const supplierContact = contactBits.length ? 'Contact: ' + contactBits.join(' | ') : '';

    // Due amount in words, led by the document currency (Rupees / US Dollars…).
    const curWord = FM_CUR_WORDS[erpState.currency] || 'Rupees';
    const inWords = curWord + ' "' + (Calc.amountInWords(t.final) || 'Zero') + '" Only';

    // One self-contained document — the template owns the table, totals and
    // footer, so nothing is spliced in afterwards.
    pdfPreviewHtml =
      '<div class="quo-doc mx-doc">' +
        generatePrintHTML({
          /* Only the supplier's OWN artwork is ever drawn: an uploaded
             full-width letterhead replaces the header, otherwise their logo
             fills the master's fixed logo region and the header text is
             composed from the brand. The master template's own logo and
             letterhead are SAMPLES — they are never copied into a document. */
          bannerUrl: brand.banner || '',
          logoUrl: brand.logo || '',
          supplierName: esc(mxLegalName()),
          supplierAddress: esc(brand.address || ''),
          supplierContact: esc(supplierContact),
          supplierPhone: esc(brandPhone() || ''),
          tagline: esc(brand.spec || brand.tag || ''),
          documentType: esc(mode.doc),
          docNoLabel: esc(mode.noLabel || 'Doc No'),
          invoiceDate: esc(dateStr),
          // Falls back to the invoice date until the sheet sets its own, so
          // the slot is never empty.
          supplyDate: esc(erpState.supplyDate ? erpFormatDate(erpState.supplyDate) : dateStr),
          supplierTin: esc(brand.tin || ''),
          docNo: esc(erpState.ref || ''),
          clientTin: esc(erpState.clientTin || ''),
          clientName: esc(erpState.client || ''),
          clientAddress: esc(erpState.address || ''),
          // A phone — never the contact person's name (see purchaserPhone).
          clientPhone: esc(purchaserPhone()),
          placeOfSupply: esc(erpState.placeOfSupply || ''),
          poNo: esc(erpState.poNo || ''),
          projectName: esc(erpState.project || ''),
          items: items,
          subTotal: t.sub,
          discount: t.disc,
          netTotal: t.net,
          vatPct: t.vatPct,
          vat: t.vat,
          grandTotal: t.final,
          currencyCode: erpState.currency,
          amountInWords: esc(inWords)
        }) +
      '</div>';
    // Offscreen copy (keeps every legacy/history path that reads #erp-doc
    // working) plus the visible sheet the user can type into.
    $('erp-doc').innerHTML = pdfPreviewHtml;
    paintPdfPreview();
  }

  function exportErpPdf() {
    const err = $('erp-error');
    if (!erpState.lines.length) {
      err.textContent = 'Add at least one item before generating the document.';
      err.hidden = false;
      return;
    }
    err.hidden = true;
    /* The on-screen preview is the source of truth. Re-running the renderer
       here would throw away anything the user retyped by hand, so the sheet
       is exported as it stands; the template is only rebuilt when the
       preview has never been painted. */
    const host = $('pdf-preview-container');
    if (!host || !host.firstChild) buildErpDoc();
    const payload = document.createElement('div');
    payload.innerHTML = pdfPreviewPayload();
    exportViaPrintWindow(payload, ERP_MODES[erpState.mode].doc + ' ' + (erpState.ref || ''));
    const t = erpTotals();
    pushHistory({
      type: 'pdf', tool: 'erp', toolName: 'Master ERP Engine — ' + ERP_MODES[erpState.mode].label,
      title: erpState.client || erpState.project || ERP_MODES[erpState.mode].label,
      total: erpDocType() ? erpMoney(t.final) : '',
      client: erpState.client || '',
      ref: erpState.ref || '',
      draft: { tool: 'erp' }
    });
  }

  function saveErpDraft() {
    pushHistory({
      type: 'copy', tool: 'erp', toolName: 'Master ERP Engine — ' + ERP_MODES[erpState.mode].label,
      title: erpState.client || erpState.project || ERP_MODES[erpState.mode].label,
      total: erpDocType() ? erpMoney(erpTotals().final) : '',
      client: erpState.client || '',
      ref: erpState.ref || '',
      draft: { tool: 'erp' }
    });
  }

  async function resetErp() {
    if (!(await confirmAction({ title: 'Reset the document?', message: 'This clears the header, items, discount, VAT and terms.', confirmLabel: 'Reset document', danger: true }))) return;
    erpState = emptyErp();
    saveErp();
    renderErp();
    schedulePdfPreview(true);   // a blank document must not keep the old sheet
  }

  /* ── Reset ────────────────────────────────────────────────────── */
  async function resetAll() {
    /* One dialog, not two — the second window.confirm used to be the only
       thing standing between a mis-click and a total wipe, and it is the
       single most destructive button in the app. The wording now names
       everything it removes. */
    if (!(await confirmAction({
      title: 'Reset ALL data?',
      message: 'This permanently deletes your project, every logged request, all Quantity & Rate line items, the quotations and invoices, the Master ERP Engine draft, the item & client database, your brand settings and the entire history. This cannot be undone.',
      confirmLabel: 'Delete everything',
      danger: true
    }))) return;
    state = emptyState();
    editingId = null;
    qrRows = [];
    boqState = emptyBoq();
    invState = emptyInv();
    prState = emptyPricing();
    dutyState = emptyDuty();
    varState = emptyVariation();
    bkState = emptyBreakeven();
    fxState = emptyFx();
    gpState = emptyGpa();
    rtState = emptyRetainer();
    dlState = emptyDelay();
    erpState = emptyErp();
    db = emptyDb();
    brand = emptyBrand();
    history = [];
    draftStore = {};
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(QR_KEY);
      localStorage.removeItem(BOQ_KEY);
      localStorage.removeItem(INV_KEY);
      localStorage.removeItem(PR_KEY);
      localStorage.removeItem(DUTY_KEY);
      localStorage.removeItem(VAR_KEY);
      localStorage.removeItem(BK_KEY);
      localStorage.removeItem(FX_KEY);
      localStorage.removeItem(GP_KEY);
      localStorage.removeItem(RT_KEY);
      localStorage.removeItem(DL_KEY);
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem(HISTORY_DRAFTS_KEY);
      localStorage.removeItem(ERP_KEY);
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(BRAND_KEY);
      localStorage.removeItem(ERP_RECORDS_KEY);
    } catch (e) { /* ignore */ }
    erpRecords = {};
    renderAll();
    resetRequestForm();
    renderQr();
    renderBoq();
    renderInv();
    fillPricingForm();
    fillDutyForm();
    fillVariationForm();
    fillBreakevenForm();
    fillFxForm();
    fillGpaForm();
    fillRetainerForm();
    fillDelayForm();
    renderBrand();
    renderDb();
    renderErp();
    schedulePdfPreview(true);
    renderHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── Render all ───────────────────────────────────────────────── */
  function renderAll() {
    renderSetup();
    renderDashboard();
    renderRequests();
  }

  /* ── Data Backup & Restore ────────────────────────────────────── */
  // Snapshot / restore every entry this app keeps in localStorage.
  function renderStorageStatus() {
    let keys = 0;
    try { keys = window.localStorage.length; } catch (e) { /* ignore */ }
    const size = fmtBytes(storageUsedBytes());
    const label = 'Local storage: ' + size + ' \u00b7 ' + keys + (keys === 1 ? ' entry' : ' entries');
    const nodes = document.querySelectorAll('.js-storage-status');
    for (let i = 0; i < nodes.length; i++) nodes[i].textContent = label;
    const sum = $('backup-summary');
    if (sum) sum.textContent = 'Currently using ' + size + ' across ' + keys + ' stored ' + (keys === 1 ? 'entry' : 'entries') + '.';
  }
  function downloadBackup() {
    const data = {};
    let n = 0;
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        data[k] = window.localStorage.getItem(k);
        n++;
      }
    } catch (e) { /* ignore */ }
    const payload = { app: 'Nexora Engine', version: 1, exportedAt: new Date().toISOString(), entries: n, data: data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexora-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }, 1500);
    showToast('Backup downloaded \u2014 ' + n + (n === 1 ? ' entry saved.' : ' entries saved.'));
    renderStorageStatus();
  }
  function restoreBackupFile(file) {
    const reader = new FileReader();
    reader.onerror = function () { showToast('Could not read that file \u2014 please try again.', 'error'); };
    reader.onload = async function () {
      let data = null;
      try {
        const parsed = JSON.parse(String(reader.result));
        data = (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
      } catch (e) { data = null; }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        showToast('That file is not a valid Nexora Engine backup.', 'error');
        return;
      }
      const names = Object.keys(data);
      if (!names.length) { showToast('That backup file is empty.', 'error'); return; }
      if (!(await confirmAction({
        title: 'Restore this backup?',
        message: 'Restore ' + names.length + ' saved ' + (names.length === 1 ? 'entry' : 'entries') + '? This overwrites the data currently stored in this browser.',
        confirmLabel: 'Restore',
        danger: true
      }))) return;
      let ok = 0;
      for (let i = 0; i < names.length; i++) {
        try { window.localStorage.setItem(names[i], data[names[i]]); ok++; } catch (e) { /* skip oversized */ }
      }
      showToast('Restored ' + ok + (ok === 1 ? ' entry' : ' entries') + ' \u2014 reloading\u2026');
      setTimeout(function () { window.location.reload(); }, 700);
    };
    reader.readAsText(file);
  }

  /* ── Wire events ──────────────────────────────────────────────── */
  function wireEvents() {
    // Navigation: Home link + platform logos open the landing view
    $('nav-home').addEventListener('click', function (e) {
      e.preventDefault();
      showView('home');
    });
    const brandHome = $('brand-home');
    if (brandHome) brandHome.addEventListener('click', function (e) {
      e.preventDefault();
      showView('home');
    });
    // Sidebar logo block + Home link → main Homepage Dashboard (KPIs + tools)
    $('sidebar-brand').addEventListener('click', function () {
      showView('home');
    });

    // Other Utilities: one handler for the whole card grid — the card IS the
    // launch control, so a single click opens the tool (credit-gated).
    const utilityToolsGrid = $('utility-tools-grid');
    if (utilityToolsGrid) {
      utilityToolsGrid.addEventListener('click', function (e) {
        const card = e.target.closest('.tool-card');
        if (!card) return;
        const id = card.getAttribute('data-tool');
        selectTool(id);
        if (consumeToolCredit()) showView(toolViewFor(id));
      });
    }

    // Sidebar navigation (ERP / Database / History / Settings / Utilities)
    $('sidebar-erp').addEventListener('click', function () {
      showView('erp');
    });
    $('sidebar-db').addEventListener('click', function () {
      showView('db');
    });
    $('sidebar-utilities').addEventListener('click', function () {
      showView('utilities');
    });
    $('sidebar-settings-nav').addEventListener('click', function () {
      showView('settings');
    });
    $('sidebar-appearance').addEventListener('click', function () {
      showView('appearance');
    });
    $('sidebar-backup').addEventListener('click', function () {
      showView('backup');
    });
    $('sidebar-plans').addEventListener('click', function () {
      showView('plans');
    });
    // Premium Plans: no payment provider is wired up in this build, so the
    // buttons only confirm the selection (and remember the last choice).
    for (const cta of document.querySelectorAll('.plan-cta')) {
      cta.addEventListener('click', function () {
        const plan = this.getAttribute('data-plan') || 'Premium';
        const price = this.getAttribute('data-price') || '';
        try { localStorage.setItem('nexora_plan_interest', plan + ' \u2014 ' + price); } catch (e) { /* ignore */ }
        showToast(plan + ' selected (' + price + '). Checkout is not connected yet.');
      });
    }
    // Data Backup & Restore actions
    const backupDownload = $('backup-download');
    if (backupDownload) backupDownload.addEventListener('click', downloadBackup);
    const backupRestoreBtn = $('backup-restore-btn');
    const backupFileInput = $('backup-file');
    if (backupRestoreBtn && backupFileInput) {
      backupRestoreBtn.addEventListener('click', function () { backupFileInput.click(); });
      backupFileInput.addEventListener('change', function () {
        const f = this.files && this.files[0];
        if (f) restoreBackupFile(f);
        this.value = '';
      });
    }
    $('menu-btn').addEventListener('click', function () {
      if (isDesktopNav()) {
        toggleSidebar();
      } else {
        document.body.classList.add('sidebar-open');
      }
    });
    // In-sidebar Menu toggle: collapses the desktop rail, closes the drawer
    // on mobile. The left-edge handle reopens a collapsed rail.
    const sidebarToggleBtn = $('sidebar-collapse');
    if (sidebarToggleBtn) {
      sidebarToggleBtn.addEventListener('click', function () {
        if (isDesktopNav()) toggleSidebar();
        else closeSidebar();
      });
    }
    const sidebarReopenBtn = $('sidebar-reopen');
    if (sidebarReopenBtn) {
      sidebarReopenBtn.addEventListener('click', function () {
        document.body.classList.remove('sidebar-collapsed');
        try { localStorage.setItem(SIDEBAR_KEY, '0'); } catch (e) { /* ignore */ }
        closeSidebar();
        syncSidebarState();
        const firstNav = document.querySelector('.sidebar-nav .sidebar-link');
        if (firstNav) firstNav.focus();
      });
    }
    initSidebarState();
    initNavSections();
    $('theme-toggle-settings').addEventListener('click', toggleTheme);
    const accentSwatches = document.querySelectorAll('.accent-swatch');
    for (let i = 0; i < accentSwatches.length; i++) {
      accentSwatches[i].addEventListener('click', function () {
        const v = this.getAttribute('data-accent');
        const hex = v === 'default' ? '' : v;
        applyAccent(hex);
        try { localStorage.setItem(ACCENT_KEY, hex); } catch (e) { /* ignore */ }
        $('accent-picker').value = hex || '#ffffff';
      });
    }
    $('accent-picker').addEventListener('input', function () {
      applyAccent(this.value);
      try { localStorage.setItem(ACCENT_KEY, this.value); } catch (e) { /* ignore */ }
    });
    $('accent-reset').addEventListener('click', async function () {
      if (!(await confirmAction({ title: 'Reset accent colour?', message: 'Restores the default accent used across buttons, highlights and charts.', confirmLabel: 'Reset accent' }))) return;
      applyAccent('');
      try { localStorage.removeItem(ACCENT_KEY); } catch (e) { /* ignore */ }
      $('accent-picker').value = '#ffffff';
    });
    $('sidebar-close').addEventListener('click', function () {
      document.body.classList.remove('sidebar-open');
    });
    document.addEventListener('click', function (e) {
      // click-outside closes the mobile overlay sidebar
      if (!document.body.classList.contains('sidebar-open')) return;
      const sb = document.getElementById('sidebar');
      const mb = document.getElementById('menu-btn');
      if (sb && !sb.contains(e.target) && mb && !mb.contains(e.target)) {
        document.body.classList.remove('sidebar-open');
      }
    });

    // Theme toggle (dark ⇄ light, persisted in localStorage)
    $('theme-toggle').addEventListener('click', toggleTheme);
    // Background presets + picker
    (function () {
      try {
        const presets = document.querySelectorAll('.bg-preset');
        for (let i = 0; i < presets.length; i++) {
          presets[i].addEventListener('click', function () {
            const v = this.getAttribute('data-bg');
            applyBg(v);
            try { localStorage.setItem(BG_KEY, v); } catch (e) { /* ignore */ }
            const picker = document.getElementById('bgpicker');
            if (picker) picker.value = v;
          });
        }
        const picker = document.getElementById('bgpicker');
        if (picker) {
          picker.addEventListener('input', function () {
            applyBg(this.value);
            try { localStorage.setItem(BG_KEY, this.value); } catch (e) { /* ignore */ }
            const bs = document.querySelectorAll('.bg-preset');
            for (let i = 0; i < bs.length; i++) {
              bs[i].classList.toggle('active', bs[i].getAttribute('data-bg') === this.value);
            }
          });
        }
        const resetBtn = document.getElementById('bgreset');
        if (resetBtn) {
          resetBtn.addEventListener('click', async function () {
            if (!(await confirmAction({ title: 'Reset background?', message: 'Restores the default dashboard background.', confirmLabel: 'Reset background' }))) return;
            applyBg('');
            try { localStorage.removeItem(BG_KEY); } catch (e) { /* ignore */ }
            const p2 = document.getElementById('bgpicker');
            if (p2) p2.value = '#000000';
            const bs2 = document.querySelectorAll('.bg-preset');
            for (let i = 0; i < bs2.length; i++) {
              bs2[i].classList.toggle('active', bs2[i].getAttribute('data-bg') === '');
            }
          });
        }
      } catch (e) { /* ignore wiring failures */ }
    })();

    // Auth modal bindings live in initAuthUi(); keep Esc-to-close here.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('auth-modal').hidden) closeAuthModal();
        if (!$('gate-modal').hidden) closeGateModal();
        if (!$('legal-modal').hidden) $('legal-modal').hidden = true;
      }
    });

    // Footer: legal notice modals (open-tool button removed with the footer TOOLS column)
    const footerOpenTool = $('footer-open-tool');
    if (footerOpenTool) footerOpenTool.addEventListener('click', gateClick(function () {
      showView('tool');
    }));
    const LEGAL_COPY = {
      terms: {
        title: 'Terms of Use',
        text: 'Plain-English version coming soon. The short version: Nexora Engine is provided as-is and free of charge. Everything runs locally in your browser \u2014 use it as a helper, not as legal or financial advice.'
      },
      privacy: {
        title: 'Privacy Policy',
        text: 'The short version: we store nothing. All calculations and project data live only in your browser\u2019s local storage and never reach any server. No accounts, no analytics, no tracking.'
      }
    };
    const legalBtns = document.querySelectorAll('[data-legal]');
    for (let i = 0; i < legalBtns.length; i++) {
      legalBtns[i].addEventListener('click', function () {
        const doc = LEGAL_COPY[this.getAttribute('data-legal')];
        if (!doc) return;
        $('legal-modal-title').textContent = doc.title;
        $('legal-modal-text').textContent = doc.text;
        $('legal-modal').hidden = false;
      });
    }
    $('legal-modal-close').addEventListener('click', function () {
      $('legal-modal').hidden = true;
    });
    $('legal-modal').addEventListener('click', function (e) {
      if (e.target === this) this.hidden = true;
    });

    // Hours | Days toggles: relabel fields and convert the entered rate
    $('p-hours-unit').addEventListener('change', function () {
      const toDays = this.value === 'days';
      const el = $('p-rate');
      const v = num(el.value);
      if (v > 0) el.value = Calc.round2(toDays ? v * Calc.HOURS_PER_DAY : v / Calc.HOURS_PER_DAY);
      updateUnitLabels();
    });
    $('r-hours-unit').addEventListener('change', function () {
      const toDays = this.value === 'days';
      const el = $('r-rate');
      const v = num(el.value);
      if (v > 0) el.value = Calc.round2(toDays ? v * Calc.HOURS_PER_DAY : v / Calc.HOURS_PER_DAY);
      updateUnitLabels();
      recalc();
    });

    // Project setup
    $('setup-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (saveProjectFromForm()) $('setup-cancel').hidden = true;
    });
    $('setup-cancel').addEventListener('click', function () {
      $('setup-form-wrap').hidden = true;
      $('setup-summary').hidden = false;
      $('setup-hint').hidden = true;
      $('setup-cancel').hidden = true;
      $('setup-error').hidden = true;
    });

    // Live currency switch on a saved project
    $('p-currency').addEventListener('change', function () {
      if (state.project) {
        state.project.currency = $('p-currency').value;
        saveState();
        renderAll();
      }
    });

    // Request form: live results + scope switch
    $('request-form').addEventListener('input', function () {
      $('req-error').hidden = true;
      recalc();
    });
    $('request-form').addEventListener('change', function () {
      $('req-error').hidden = true;
      recalc();
    });

    $('request-form').addEventListener('submit', function (e) {
      e.preventDefault();
      saveRequestFromForm();
    });
    $('r-cancel').addEventListener('click', cancelEdit);

    // Results panel → generate message straight from the (unsubmitted) form
    $('res-msg').addEventListener('click', function () {
      const f = readForm();
      if (!f.description || !(f.hours > 0)) {
        showError($('req-error'), 'Fill in the description and extra time to generate a message.');
        return;
      }
      openMessage({
        description: f.description,
        type: f.type,
        scope: f.scope,
        hours: f.hours,
        unit: f.hoursUnit,
        rate: f.rate > 0 ? f.rate : defaultRate(),
        expenses: f.expenses > 0 ? f.expenses : 0
      });
    });

    // History rows (delegated — rows are rebuilt on each render)
    const tbody = $('req-rows');
    tbody.addEventListener('click', async function (e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const req = state.requests.find(function (r) { return r.id === id; });
      if (!req) return;
      const action = btn.getAttribute('data-action');
      if (action === 'delete') {
        if (await confirmAction({ title: 'Delete request?', message: 'This removes the logged request permanently.', confirmLabel: 'Delete', danger: true })) {
          state.requests = state.requests.filter(function (r) { return r.id !== id; });
          if (editingId === id) cancelEdit();
          saveState();
          renderAll();
        }
      } else if (action === 'edit') {
        startEdit(id);
      } else if (action === 'message') {
        openMessage(req);
      } else if (action === 'approve' || action === 'decline' || action === 'reopen') {
        req.status = action === 'approve' ? 'approved' : (action === 'decline' ? 'declined' : 'pending');
        saveState();
        renderAll();
      }
    });

    // Change Order Generator panel (inline card, right column)
    $('msg-copy').addEventListener('click', copyMessage);
    $('msg-close').addEventListener('click', function () {
      $('change-order-section').hidden = true;
    });

    // Quantity & Rate calculator (tool #02)
    const fq = $('footer-open-qr'); if (fq) fq.addEventListener('click', gateClick(function () {
      selectTool('qr');
      showView('qr');
    }));
    $('qr-add-row').addEventListener('click', addQrRow);
    $('qr-clear').addEventListener('click', clearQr);
    const qrBody = $('qr-rows');
    qrBody.addEventListener('input', function (e) {
      const input = e.target;
      if (!input.classList || !(input.classList.contains('qr-item') || input.classList.contains('qr-qty') ||
          input.classList.contains('qr-unit') || input.classList.contains('qr-rate'))) return;
      const rowEl = input.closest('.qr-row');
      if (!rowEl) return;
      const row = qrRows.find(function (r) { return r.id === rowEl.getAttribute('data-id'); });
      if (!row) return;
      if (input.classList.contains('qr-item')) row.item = input.value;
      else if (input.classList.contains('qr-qty')) row.qty = input.value.replace(/,/g, '');
      else if (input.classList.contains('qr-unit')) row.unit = input.value;
      else row.rate = input.value.replace(/,/g, '');
      const amount = qrAmount(row);
      rowEl.querySelector('.qr-amount').textContent = amount === null ? '\u2014' : Calc.fmtToolMoney(amount, qrCur());
      updateQrTotal();
      saveQr();
    });
    qrBody.addEventListener('click', function (e) {
      const el = e.target;
      if (!el || !el.closest) return;
      const del = el.closest('.qr-del');
      if (!del) return;
      qrRows = qrRows.filter(function (r) { return r.id !== del.getAttribute('data-id'); });
      saveQr();
      renderQr();
    });
    qrBody.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const rowEl = e.target.closest('.qr-row');
      if (!rowEl) return;
      const rows = Array.prototype.slice.call(qrBody.querySelectorAll('.qr-row'));
      if (rowEl === rows[rows.length - 1]) {
        e.preventDefault();
        addQrRow();
      }
    });

    // Engineering Quotation & BOQ Generator (tool #03)
    const fb = $('footer-open-boq'); if (fb) fb.addEventListener('click', gateClick(function () {
      selectTool('boq');
      showView('boq');
    }));
    $('boq-add-row').addEventListener('click', addBoqRow);
    $('boq-clear').addEventListener('click', clearBoq);
    $('boq-reset').addEventListener('click', resetBoq);
    $('boq-pdf').addEventListener('click', gateClick(exportBoqPdf));

    // Meta inputs → save + rebuild the quotation doc
    const metaInputs = ['bq-client', 'bq-designation', 'bq-company', 'bq-address', 'bq-date', 'bq-ref'];
    for (let i = 0; i < metaInputs.length; i++) {
      $(metaInputs[i]).addEventListener('input', function () {
        boqState.meta[metaInputs[i].replace('bq-', '')] = this.value;
        saveBoq();
        updateBoqSummary();
      });
    }
    $('bq-discount').addEventListener('input', function () {
      boqState.discount = this.value;
      saveBoq();
      updateBoqSummary();
    });
    $('bq-vat').addEventListener('input', function () {
      boqState.vat = this.value;
      saveBoq();
      updateBoqSummary();
    });

    // BOQ rows (delegated — rows are rebuilt on each render)
    const boqBody = $('boq-rows');
    boqBody.addEventListener('input', function (e) {
      const input = e.target;
      if (!input.classList || !(input.classList.contains('bq-item') || input.classList.contains('bq-unit') ||
          input.classList.contains('bq-qty') || input.classList.contains('bq-rate'))) return;
      const rowEl = input.closest('.qr-row');
      if (!rowEl) return;
      const row = boqState.lines.find(function (r) { return r.id === rowEl.getAttribute('data-id'); });
      if (!row) return;
      if (input.classList.contains('bq-item')) row.item = input.value;
      else if (input.classList.contains('bq-unit')) row.unit = input.value;
      else if (input.classList.contains('bq-qty')) row.qty = input.value.replace(/,/g, '');
      else row.rate = input.value.replace(/,/g, '');
      const amount = boqLineAmount(row);
      rowEl.querySelector('.qr-amount').textContent = amount === null ? '\u2014' : Calc.fmtMoney(amount, 'LKR');
      updateBoqSummary();
      saveBoq();
    });
    boqBody.addEventListener('click', function (e) {
      const el = e.target;
      if (!el || !el.closest) return;
      const del = el.closest('.qr-del');
      if (!del) return;
      boqState.lines = boqState.lines.filter(function (r) { return r.id !== del.getAttribute('data-id'); });
      saveBoq();
      renderBoqRows();
      updateBoqSummary();
    });
    boqBody.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const rowEl = e.target.closest('.qr-row');
      if (!rowEl) return;
      const rows = Array.prototype.slice.call(boqBody.querySelectorAll('.qr-row'));
      if (rowEl === rows[rows.length - 1]) {
        e.preventDefault();
        addBoqRow();
      }
    });

    // Quantity & Rate → Export to PDF
    $('qr-pdf').addEventListener('click', gateClick(qrExportPdf));

    // Margin & Markup Pricing Calculator (tool #04)
    const fp = $('footer-open-pr'); if (fp) fp.addEventListener('click', gateClick(function () {
      selectTool('pricing');
      showView('pricing');
    }));
    ['pr-cost', 'pr-overhead', 'pr-target'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        prState[id.replace('pr-', '')] = this.value;
        savePricing();
        updatePricing();
      });
    });
    $('pr-mode-margin').addEventListener('click', function () {
      prState.mode = 'margin';
      savePricing();
      fillPricingForm();
    });
    $('pr-mode-markup').addEventListener('click', function () {
      prState.mode = 'markup';
      savePricing();
      fillPricingForm();
    });
    $('pr-copy').addEventListener('click', copyPricingSummary);
    $('pr-reset').addEventListener('click', resetPricing);

    // Import Duty & Landed Cost Calculator (tool #06)
    const fd = $('footer-open-duty'); if (fd) fd.addEventListener('click', gateClick(function () {
      selectTool('duty');
      showView('duty');
    }));
    const dutyInputs = ['dt-cif', 'dt-units', 'dt-duty', 'dt-pal', 'dt-cess', 'dt-sscl', 'dt-vat'];
    for (let i = 0; i < dutyInputs.length; i++) {
      $(dutyInputs[i]).addEventListener('input', function () {
        dutyState[dutyInputs[i].replace('dt-', '')] = this.value;
        saveDuty();
        updateDuty();
      });
    }
    $('dt-copy').addEventListener('click', copyDutyBreakdown);
    $('dt-reset').addEventListener('click', async function () {
      if (!(await confirmAction({ title: 'Reset import duty calculator?', message: 'This clears the CIF value, units and all tax rates.', confirmLabel: 'Reset', danger: true }))) return;
      dutyState = emptyDuty();
      saveDuty();
      fillDutyForm();
    });

    // Variation & Change Order Generator (tool #07)
    const fv = $('footer-open-var'); if (fv) fv.addEventListener('click', gateClick(function () {
      selectTool('variation');
      showView('variation');
    }));
    const varInputs = ['vr-project', 'vr-original', 'vr-added', 'vr-days', 'vr-desc'];
    for (let i = 0; i < varInputs.length; i++) {
      $(varInputs[i]).addEventListener('input', function () {
        varState[varInputs[i].replace('vr-', '')] = this.value;
        saveVariation();
        updateVariation();
      });
    }
    $('vr-pdf').addEventListener('click', gateClick(exportVariationPdf));
    $('vr-reset').addEventListener('click', async function () {
      if (!(await confirmAction({ title: 'Reset variation builder?', message: 'This clears the project details, costs and work description.', confirmLabel: 'Reset', danger: true }))) return;
      varState = emptyVariation();
      saveVariation();
      fillVariationForm();
    });

    // Freelance Rate & Overhead Breakeven (tool #08)
    const fk = $('footer-open-bk'); if (fk) fk.addEventListener('click', gateClick(function () {
      selectTool('breakeven');
      showView('breakeven');
    }));
    const bkInputs = ['bk-net', 'bk-overhead', 'bk-days', 'bk-admin', 'bk-dayhours', 'bk-tax'];
    for (let i = 0; i < bkInputs.length; i++) {
      $(bkInputs[i]).addEventListener('input', function () {
        bkState[bkInputs[i].replace('bk-', '')] = this.value;
        saveBreakeven();
        updateBreakeven();
      });
    }
    $('bk-copy').addEventListener('click', copyBreakevenSummary);
    $('bk-reset').addEventListener('click', async function () {
      if (!(await confirmAction({ title: 'Reset breakeven calculator?', message: 'This clears your income target, overhead and time settings.', confirmLabel: 'Reset', danger: true }))) return;
      bkState = emptyBreakeven();
      saveBreakeven();
      fillBreakevenForm();
    });

    // Cross-Border FX & Fee Adjuster (tool #09)
    const ff = $('footer-open-fx'); if (ff) ff.addEventListener('click', gateClick(function () {
      selectTool('fx');
      showView('fx');
    }));
    ['fx-target', 'fx-pct', 'fx-fixed', 'fx-markup'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        fxState[id.replace('fx-', '')] = this.value;
        saveFx();
        updateFx();
      });
    });
    $('fx-platform').addEventListener('change', function () {
      applyFxPlatform(this.value);
    });
    $('fx-from').addEventListener('change', function () {
      fxState.from = this.value;
      saveFx();
    });
    $('fx-to').addEventListener('change', function () {
      fxState.to = this.value;
      saveFx();
    });
    $('fx-copy').addEventListener('click', copyFxInvoice);
    $('fx-reset').addEventListener('click', async function () {
      if (!(await confirmAction({ title: 'Reset FX & fee adjuster?', message: 'This clears the payout target and fee rates.', confirmLabel: 'Reset', danger: true }))) return;
      fxState = emptyFx();
      saveFx();
      fillFxForm();
    });

    // Academic GPA & Target Grade Planner (tool #10)
    const fg = $('footer-open-gp'); if (fg) fg.addEventListener('click', gateClick(function () {
      selectTool('gpa');
      showView('gpa');
    }));
    const gpInputs = [['gp-current', 'current'], ['gp-done', 'done'], ['gp-target', 'target'], ['gp-remaining', 'remaining'], ['gp-course-cur', 'courseCur'], ['gp-course-target', 'courseTarget'], ['gp-course-weight', 'courseWeight']];
    for (let i = 0; i < gpInputs.length; i++) {
      (function (pair) {
        $(pair[0]).addEventListener('input', function () {
          gpState[pair[1]] = this.value;
          saveGpa();
          updateGpa();
        });
      })(gpInputs[i]);
    }
    $('gp-copy').addEventListener('click', copyGpaSummary);
    $('gp-reset').addEventListener('click', async function () {
      if (!(await confirmAction({ title: 'Reset GPA planner?', message: 'This clears your progress, targets and course weights.', confirmLabel: 'Reset', danger: true }))) return;
      gpState = emptyGpa();
      saveGpa();
      fillGpaForm();
    });

    // Retainer & SLA Pricing Estimator (tool #11)
    const fr = $('footer-open-rt'); if (fr) fr.addEventListener('click', gateClick(function () {
      selectTool('retainer');
      showView('retainer');
    }));
    const rtInputs = ['rt-client', 'rt-hours', 'rt-hourly', 'rt-overhead', 'rt-margin', 'rt-sla'];
    for (let i = 0; i < rtInputs.length; i++) {
      (function (id) {
        $(id).addEventListener('input', function () {
          rtState[id.replace('rt-', '')] = this.value;
          saveRetainer();
          updateRetainer();
        });
      })(rtInputs[i]);
    }
    $('rt-copy').addEventListener('click', copyRetainerSummary);
    $('rt-reset').addEventListener('click', resetRetainer);

    // Project Delay & Damages Impact (tool #12)
    const fl = $('footer-open-dl'); if (fl) fl.addEventListener('click', gateClick(function () {
      selectTool('delay');
      showView('delay');
    }));
    const dlInputs = [['dl-project', 'project'], ['dl-contract', 'contract'], ['dl-penalty', 'penaltyPct'], ['dl-cap', 'capPct'], ['dl-days', 'days'], ['dl-overhead', 'overhead']];
    for (let i = 0; i < dlInputs.length; i++) {
      (function (pair) {
        $(pair[0]).addEventListener('input', function () {
          dlState[pair[1]] = this.value;
          saveDelay();
          updateDelay();
        });
      })(dlInputs[i]);
    }
    $('dl-copy').addEventListener('click', copyDelaySummary);
    $('dl-reset').addEventListener('click', resetDelay);

    // History (sidebar + footer)
    $('sidebar-history').addEventListener('click', function () {
      showView('history');
      renderHistory();
    });
    const fh = $('footer-history'); if (fh) fh.addEventListener('click', function () {
      showView('history');
      renderHistory();
    });
    $('reset-link-settings').addEventListener('click', resetAll);
    $('history-back').addEventListener('click', function () {
      showView('home');
    });
    $('history-clear').addEventListener('click', clearHistory);
    const histList = $('history-list');
    histList.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-hact]');
      if (!btn) return;
      historyAction(btn.closest('.history-item').getAttribute('data-id'), btn.getAttribute('data-hact'));
    });

    // Smart Invoice & Document Builder (tool #05)
    const fi = $('footer-open-inv'); if (fi) fi.addEventListener('click', gateClick(function () {
      selectTool('invoice');
      showView('invoice');
    }));
    $('inv-doctype').addEventListener('change', function () {
      invState.docType = this.value;
      saveInv();
      renderInvFields();
      renderInvRows();
      updateInvSummary();
    });
    $('inv-fields').addEventListener('input', function (e) {
      const el = e.target;
      if (!el || !el.getAttribute('data-key')) return;
      const key = el.getAttribute('data-key');
      invState.meta[key] = el.value;
      if (key === 'currency') {
        invState.currency = el.value;
        syncInvCurrencySelect();
        setToolCurrency('invoice', el.value); // re-render with the new symbol
        return;
      }
      saveInv();
      updateInvSummary();
    });
    const coInputs = ['inv-co-name', 'inv-co-address', 'inv-co-contact'];
    for (let i = 0; i < coInputs.length; i++) {
      $(coInputs[i]).addEventListener('input', function () {
        invState.company[coInputs[i].replace('inv-co-', '')] = this.value;
        saveInv();
        updateInvSummary();
      });
    }
    $('inv-co-logo').addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (!file) { invState.company.logo = ''; saveInv(); updateInvSummary(); return; }
      const reader = new FileReader();
      reader.onload = function () { invState.company.logo = reader.result; saveInv(); updateInvSummary(); };
      reader.readAsDataURL(file);
    });
    $('inv-add-row').addEventListener('click', addInvRow);
    $('inv-clear').addEventListener('click', clearInv);
    $('inv-reset').addEventListener('click', resetInv);
    $('inv-pdf').addEventListener('click', gateClick(exportInvPdf));
    const invBody = $('inv-rows');
    invBody.addEventListener('input', function (e) {
      const input = e.target;
      if (!input.classList || !(input.classList.contains('inv-description') || input.classList.contains('inv-model') ||
          input.classList.contains('inv-unit') || input.classList.contains('inv-qty') || input.classList.contains('inv-rate'))) return;
      const rowEl = input.closest('.qr-row');
      if (!rowEl) return;
      const row = invState.lines.find(function (r) { return r.id === rowEl.getAttribute('data-id'); });
      if (!row) return;
      if (input.classList.contains('inv-description')) row.description = input.value;
      else if (input.classList.contains('inv-model')) row.model = input.value;
      else if (input.classList.contains('inv-unit')) row.unit = input.value;
      else if (input.classList.contains('inv-qty')) row.qty = input.value.replace(/,/g, '');
      else row.rate = input.value.replace(/,/g, '');
      const amount = invLineAmount(row);
      rowEl.querySelector('.qr-amount').textContent = amount === null ? '\u2014' : invMoney(amount);
      updateInvSummary();
      saveInv();
    });
    invBody.addEventListener('click', function (e) {
      const el = e.target;
      if (!el || !el.closest) return;
      const del = el.closest('.qr-del');
      if (!del) return;
      invState.lines = invState.lines.filter(function (r) { return r.id !== del.getAttribute('data-id'); });
      saveInv();
      renderInvRows();
      updateInvSummary();
    });
    invBody.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const rowEl = e.target.closest('.qr-row');
      if (!rowEl) return;
      const rows = Array.prototype.slice.call(invBody.querySelectorAll('.qr-row'));
      if (rowEl === rows[rows.length - 1]) {
        e.preventDefault();
        addInvRow();
      }
    });

    // Reset (footer link was removed; Settings button remains)
    const rl = $('reset-link'); if (rl) rl.addEventListener('click', resetAll);

    // Per-tool currency selectors (all tool banners)
    wireCurrencySelects();

    // ── ERP Client name autocomplete wiring (custom popup) ──
    // Selecting a client fills Client Name + the whole header and
    // auto-fills Project Name from the client's default project/site.
    (function wireErpClientAutoFill() {
      const clientInput = $('erp-client');
      if (!clientInput) return;
      const PANEL = 'erp-client-suggestions';
      let debounce = null;
      clientInput.addEventListener('input', function () {
        const q = clientInput.value;
        clearTimeout(debounce);
        if (!q.trim()) {
          const panel = $(PANEL);
          if (panel) { panel.hidden = true; }
          return;
        }
        debounce = setTimeout(function () {
          erpRenderClientSuggestions(erpClientList(q.trim()), clientInput, PANEL);
        }, 45);
      });
      clientInput.addEventListener('change', function () {
        const q = clientInput.value.trim();
        if (!q) return;
        const chosen = erpClientList(q).find(function (it) {
          return erpClientNormalize(it.c.clientName || it.c.name || '') === erpClientNormalize(q);
        });
        if (chosen) erpSelectClient(chosen.c.clientName || chosen.c.name, chosen.c);
        const panel = $(PANEL);
        if (panel) { panel.hidden = true; }
      });
      clientInput.addEventListener('keydown', function (e) {
        const panel = $(PANEL);
        if (!panel || panel.hidden) {
          if (e.key === 'ArrowDown' && clientInput.value.trim()) {
            e.preventDefault();
            const s = erpClientList(clientInput.value.trim());
            if (s.length) erpRenderClientSuggestions(s, clientInput, PANEL);
          }
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          erpFocusNextSuggest(PANEL);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          erpFocusPrevSuggest(PANEL);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const active = panel.querySelector('[role="option"].erp-sel-active');
          if (active) {
            const name = active.getAttribute('data-client-name');
            const chosen = erpClientList(name).find(function (it) { return it.c.name === name || it.c.clientName === name; });
            if (chosen) erpSelectClient(chosen.c.clientName || chosen.c.name, chosen.c);
            panel.hidden = true;
          }
        } else if (e.key === 'Escape') {
          panel.hidden = true;
          clientInput.removeAttribute('aria-expanded');
        }
      });
      document.addEventListener('click', function (e) {
        const panel = $(PANEL);
        if (!panel || panel.hidden) return;
        if (!panel.contains(e.target) && clientInput && !clientInput.contains(e.target)) {
          panel.hidden = true;
          clientInput.removeAttribute('aria-expanded');
        }
      });
    })();

    function erpFocusNextSuggest(panelId) {
      const panel = $(panelId || 'erp-client-suggestions');
      if (!panel || panel.hidden) return;
      const opts = Array.prototype.slice.call(panel.querySelectorAll('[role="option"]'));
      if (!opts.length) return;
      let active = panel.querySelector('[role="option"]:focus') || panel.querySelector('[role="option"][tabindex="0"]');
      const cur = active ? opts.indexOf(active) : -1;
      if (active) active.removeAttribute('tabindex');
      const next = cur < 0 ? 0 : (cur + 1) % opts.length;
      opts[next].setAttribute('tabindex', '0');
      opts[next].classList.add('erp-sel-active');
      opts[next].focus();
      opts[next].scrollIntoView({ block: 'nearest' });
    }

    function erpFocusPrevSuggest(panelId) {
      const panel = $(panelId || 'erp-client-suggestions');
      if (!panel || panel.hidden) return;
      const opts = Array.prototype.slice.call(panel.querySelectorAll('[role="option"]'));
      if (!opts.length) return;
      let active = panel.querySelector('[role="option"]:focus') || panel.querySelector('[role="option"][tabindex="0"]');
      const cur = active ? opts.indexOf(active) : -1;
      if (active) active.removeAttribute('tabindex');
      const prev = cur < 0 ? opts.length - 1 : (cur + opts.length - 1) % opts.length;
      opts[prev].setAttribute('tabindex', '0');
      opts[prev].classList.add('erp-sel-active');
      opts[prev].focus();
      opts[prev].scrollIntoView({ block: 'nearest' });
    }

    // ── Master ERP Engine ──────────────────────────────────────
    const erpHeaderPairs = [['erp-project', 'project'], ['erp-client', 'client'], ['erp-address', 'address'], ['erp-ref', 'ref'], ['erp-contact', 'contact'], ['erp-clienttin', 'clientTin'], ['erp-posupply', 'placeOfSupply'], ['erp-pono', 'poNo'], ['erp-terms-dt', 'deliveryTerms'], ['erp-shipto', 'shipTo'], ['erp-hscode', 'hsCode']];
    for (let i = 0; i < erpHeaderPairs.length; i++) {
      (function (pair) {
        $(pair[0]).addEventListener('input', function () {
          erpState[pair[1]] = this.value;
          saveErp();
        });
      })(erpHeaderPairs[i]);
    }
    $('erp-date').addEventListener('change', function () {
      erpState.date = this.value;
      saveErp();
    });

    /* ── Live editable document preview ─────────────────────────
       One delegated listener covers every ERP field — including the
       dynamically rendered mode fields and the item rows — so the sheet
       follows the form without re-wiring each input. Rebuilding only
       rewrites the preview, never the form, so typing focus is kept. */
    (function wirePdfPreview() {
      const view = $('erp-view');
      const onFormChange = function () { schedulePdfPreview(); };
      if (view) {
        view.addEventListener('input', onFormChange);
        view.addEventListener('change', onFormChange);
      }
      const host = $('pdf-preview-container');
      if (host) {
        /* Typing in an editable field writes straight through to `erpState`
           AND the matching form input. No debounce here — the form has to be
           live immediately — and the event then bubbles on to #erp-view's
           own listener registered above, which schedules the sheet rebuild
           so Amount, Sub Total, VAT and TOTAL follow the edit. */
        host.addEventListener('input', function (e) {
          const el = e.target && e.target.closest ? e.target.closest('[data-edit]') : null;
          if (!el) return;
          const kind = el.getAttribute('data-edit-kind') || 'text';
          if (kind === 'date') return;
          const key = el.getAttribute('data-edit');
          const text = pdfFieldText(el);
          // A numeric field may only ever hold a number. Anything else is
          // rejected on the spot rather than silently accepted.
          if (kind === 'number' && pdfNumeric(text) === null) { pdfRevertField(key); return; }
          if (pdfCommitField(key, text) === 'revert') pdfRevertField(key);
        });
        host.addEventListener('keydown', function (e) {
          const el = e.target && e.target.closest ? e.target.closest('[data-edit]') : null;
          if (!el) return;
          const kind = el.getAttribute('data-edit-kind') || 'text';
          // Dates are a button, not a textbox: Enter/Space open the picker
          // BEFORE the generic Enter handling, which would otherwise just
          // blur the field and look like nothing happened.
          if (kind === 'date' && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
            e.preventDefault();
            pdfOpenDatePicker(el);
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            el.blur();                  // commits through the blur handler
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            el.blur();
            schedulePdfPreview(true);   // discard whatever was typed
            return;
          }
          // Block characters that can never be part of a number, so invalid
          // input never reaches the field at all.
          if (kind === 'number' && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !/[0-9.,]/.test(e.key)) {
            e.preventDefault();
          }
        });
        // Commit (and validate) the moment the field is left.
        host.addEventListener('focusout', function (e) {
          const el = e.target && e.target.closest ? e.target.closest('[data-edit]') : null;
          if (!el) return;
          /* A field that is no longer in the document was removed by our own
             repaint, not left by the user. Committing (or worse, reverting)
             from that phantom blur would rewrite the sheet while it is being
             rebuilt, so it is ignored. */
          if (!el.isConnected) return;
          const kind = el.getAttribute('data-edit-kind') || 'text';
          if (kind === 'date') return;
          const key = el.getAttribute('data-edit');
          if (pdfCommitField(key, pdfFieldText(el)) === 'revert') pdfRevertField(key);
          else schedulePdfPreview();
        });
        // Dates are never free text: the field opens the form's own picker.
        host.addEventListener('click', function (e) {
          const el = e.target && e.target.closest ? e.target.closest('[data-edit]') : null;
          if (!el || (el.getAttribute('data-edit-kind') || 'text') !== 'date') return;
          e.preventDefault();
          pdfOpenDatePicker(el);
        });
      }
      /* "Rebuild from form" is now only "re-render from `erpState`": after
         any edit that state already holds the edited value, so it can never
         overwrite what the user just changed. */
      const rebuild = $('pdf-preview-rebuild');
      if (rebuild) {
        rebuild.addEventListener('click', function () {
          schedulePdfPreview(true);
          pdfPreviewState('Live');
        });
      }

      /* Printing the app itself (Ctrl+P): the toolbar and every selection
         ring are hidden while the print job runs, then restored. */
      window.addEventListener('beforeprint', function () { document.body.classList.add('pdf-printing'); });
      window.addEventListener('afterprint', function () { document.body.classList.remove('pdf-printing'); });
    })();
    // ERP project-name input: live client search + full header autofill.
    // Picking a client from the Project Name field fills Client Name and
    // the rest of the header, but keeps the typed project/site text —
    // Project Name maps to "Project Name / Additional Information" on
    // PDF and Excel documents.
    (function wireErpProjectAutoFill() {
      const projectInput = $('erp-project');
      if (!projectInput) return;
      const PANEL = 'erp-project-suggestions';
      let debounce = null;
      projectInput.addEventListener('input', function () {
        const q = projectInput.value;
        clearTimeout(debounce);
        if (!q.trim()) {
          const panel = $(PANEL);
          if (panel) { panel.hidden = true; }
          return;
        }
        debounce = setTimeout(function () {
          erpRenderClientSuggestions(erpClientList(q.trim()), projectInput, PANEL);
        }, 45);
      });
      projectInput.addEventListener('change', function () {
        const q = projectInput.value.trim();
        if (!q) return;
        const chosen = erpClientList(q).find(function (it) {
          return erpClientNormalize(it.c.clientName || it.c.name || '') === erpClientNormalize(q);
        });
        if (chosen) erpSelectClient(chosen.c.clientName || chosen.c.name, chosen.c);
        const panel = $(PANEL);
        if (panel) { panel.hidden = true; }
      });
      projectInput.addEventListener('keydown', function (e) {
        const panel = $(PANEL);
        if (!panel || panel.hidden) {
          if (e.key === 'ArrowDown' && projectInput.value.trim()) {
            e.preventDefault();
            const s = erpClientList(projectInput.value.trim());
            if (s.length) erpRenderClientSuggestions(s, projectInput, PANEL);
          }
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          erpFocusNextSuggest(PANEL);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          erpFocusPrevSuggest(PANEL);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const active = panel.querySelector('[role="option"].erp-sel-active');
          if (active) {
            const name = active.getAttribute('data-client-name');
            const chosen = erpClientList(name).find(function (it) {
              return it.c.name === name || it.c.clientName === name;
            });
            if (chosen) erpSelectClient(chosen.c.clientName || chosen.c.name, chosen.c);
            panel.hidden = true;
          }
        } else if (e.key === 'Escape') {
          panel.hidden = true;
          projectInput.removeAttribute('aria-expanded');
        }
      });
      document.addEventListener('click', function (e) {
        const panel = $(PANEL);
        if (!panel || panel.hidden) return;
        if (!panel.contains(e.target) && projectInput && !projectInput.contains(e.target)) {
          panel.hidden = true;
          projectInput.removeAttribute('aria-expanded');
        }
      });
    })();
    // Keep the suggestion popups live whenever the client DB changes
    // (both ERP inputs can be on screen with an open list).
    if (typeof renderDb === 'function') {
      const orig = renderDb;
      renderDb = function () {
        orig.call(this);
        const input = $('erp-client');
        if (input && input.value.trim()) {
          erpRenderClientSuggestions(erpClientList(input.value.trim()), input, 'erp-client-suggestions');
        }
        const proj = $('erp-project');
        if (proj && proj.value.trim()) {
          erpRenderClientSuggestions(erpClientList(proj.value.trim()), proj, 'erp-project-suggestions');
        }
      };
    }
    const erpModeTabs = document.querySelectorAll('.erp-tab');
    for (let i = 0; i < erpModeTabs.length; i++) {
      erpModeTabs[i].addEventListener('click', function () {
        erpState.mode = this.getAttribute('data-erpmode');
        saveErp();
        renderErpHeader();
        renderErpRows();
        /* The document SHEET is built by the preview scheduler, which the
           mode tabs never used to touch — so switching to Pro Forma left the
           sheet (and therefore the printed/exported title) showing the old
           mode's name until some other edit happened to rebuild it. Force a
           rebuild now, and re-render the summary card for the new mode. */
        updateErpSummary();
        schedulePdfPreview(true);
      });
    }
    $('erp-mode-fields').addEventListener('input', function (e) {
      const input = e.target.closest('[data-erpmeta]');
      if (!input) return;
      erpState.meta[input.getAttribute('data-erpmeta')] = input.value;
      saveErp();
    });
    $('erp-add-row').addEventListener('click', function () { addErpRow(''); });
    const erpBody = $('erp-rows');
    erpBody.addEventListener('input', function (e) {
      const input = e.target;
      const rowEl = input.closest('.qr-row');
      if (!rowEl) return;
      const row = erpState.lines.find(function (r) { return r.id === rowEl.getAttribute('data-id'); });
      if (!row) return;
      if (input.classList.contains('erp-sku')) {
        row.sku = input.value;
        saveErp();
        erpFillFromSku(rowEl); // may re-render; amounts refresh there
        return;
      }
      if (input.classList.contains('erp-name')) row.name = input.value;
      else if (input.classList.contains('erp-unit')) row.unit = input.value;
      else if (input.classList.contains('erp-qty')) row.qty = numericSafeText(input.value, false);
      else if (input.classList.contains('erp-rate')) row.rate = numericSafeText(input.value, false);
      const amount = erpLineAmount(row);
      rowEl.querySelector('.qr-amount').textContent = erpDocType() ? (amount === null ? '\u2014' : erpMoney(amount)) : '\u2014';
      updateErpSummary();
      saveErp();
    });
    erpBody.addEventListener('change', function (e) {
      // change fires on datalist selection in some browsers — catch SKU picks
      const input = e.target;
      if (!input.classList || !input.classList.contains('erp-sku')) return;
      const rowEl = input.closest('.qr-row');
      if (!rowEl) return;
      const row = erpState.lines.find(function (r) { return r.id === rowEl.getAttribute('data-id'); });
      if (row) row.sku = input.value;
      const matched = dbFindItem(input.value);
      erpFillFromSku(rowEl);           // no-op for an unknown key, sorts when matched
      /* A key the database does not know still has to take its place in the
         order — done on change/blur rather than per keystroke, so rows are
         never reshuffled under the cursor while a SKU is being typed. */
      if (!matched) { sortErpLines(); saveErp(); renderErpRows(); }
    });
    erpBody.addEventListener('click', function (e) {
      const del = e.target.closest('.qr-del');
      if (!del) return;
      erpState.lines = erpState.lines.filter(function (r) { return r.id !== del.getAttribute('data-id'); });
      saveErp();
      renderErpRows();
    });
    erpBody.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const rowEl = e.target.closest('.qr-row');
      if (!rowEl) return;
      const rows = Array.prototype.slice.call(erpBody.querySelectorAll('.qr-row'));
      if (rowEl === rows[rows.length - 1]) {
        e.preventDefault();
        addErpRow('');
      }
    });
    const erpDiscVat = [['erp-discount', 'discount'], ['erp-vat', 'vat']];
    for (let i = 0; i < erpDiscVat.length; i++) {
      (function (pair) {
        $(pair[0]).addEventListener('input', function () {
          erpState[pair[1]] = numericSafeText(this.value, false);
          saveErp();
          updateErpSummary();
        });
      })(erpDiscVat[i]);
    }
    $('erp-terms').addEventListener('input', function () {
      erpState.terms = this.value;
      saveErp();
    });
    $('erp-pdf').addEventListener('click', gateClick(exportErpPdf));
    $('erp-export-xlsx').addEventListener('click', gateClick(exportErpExcel));
    $('erp-save').addEventListener('click', saveErpDraft);
    $('erp-reset').addEventListener('click', resetErp);

    // ── ERP Record store (Primary Key save / load / delete) ────
    $('erp-record-load').addEventListener('click', function () { erpLoadRecord(false); });
    $('erp-record-save').addEventListener('click', erpSaveRecord);
    $('erp-record-delete').addEventListener('click', erpDeleteRecord);
    // Enter in the ID field loads (change-triggered convenience)
    $('erp-record-id').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); erpLoadRecord(false); }
    });
    $('erp-record-id').addEventListener('input', function () { erpRecordMeta(this.value.trim()); });

    // ── Excel / CSV import + template ─────────────────────────
    $('erp-import-file').addEventListener('change', function () {
      const file = this.files && this.files[0];
      this.value = ''; // allow re-importing the same file
      if (file) erpImportFile(file);
    });
    $('erp-template-dl').addEventListener('click', erpImportTemplate);

    // ── Item & Client Database ─────────────────────────────────
    $('db-item-add').addEventListener('click', addDbItem);
    $('db-client-add').addEventListener('click', addDbClient);
    // A hand-picked client currency survives form resets — it is a choice,
    // not a leftover of whatever the form happened to start on.
    if ($('db-client-currency')) {
      $('db-client-currency').dataset.userPicked = '';
      $('db-client-currency').addEventListener('change', function () { this.dataset.userPicked = '1'; });
    }
    $('db-item-rows').addEventListener('click', async function (e) {
      const edit = e.target.closest('.db-item-edit');
      if (edit) { startEditDbItem(Number(edit.getAttribute('data-id'))); return; }
      const del = e.target.closest('.db-item-del');
      if (!del) return;
      const idx = Number(del.getAttribute('data-id'));
      const rec = db.items[idx];
      if (!(await confirmAction({
        title: 'Remove item?',
        message: 'Remove "' + ((rec && rec.sku) || 'this item') + '" from the master database? Documents already created are not affected.',
        confirmLabel: 'Remove',
        danger: true
      }))) return;
      db.items.splice(idx, 1);
      noteDbRemoval('item', idx);
      saveDb();
      renderDb();
      pushHistory({ type: 'db', tool: '', toolName: 'Item DB updated', title: 'Item removed — ' + db.items.length + ' SKUs left' });
      renderKpis();
      updateKPICards();
    });
    $('db-client-rows').addEventListener('click', async function (e) {
      const edit = e.target.closest('.db-client-edit');
      if (edit) { startEditDbClient(Number(edit.getAttribute('data-id'))); return; }
      const del = e.target.closest('.db-client-del');
      if (!del) return;
      const idx = Number(del.getAttribute('data-id'));
      const rec = db.clients[idx];
      if (!(await confirmAction({
        title: 'Remove client?',
        message: 'Remove "' + ((rec && (rec.clientName || rec.name)) || 'this client') + '" from the master database? Documents already created are not affected.',
        confirmLabel: 'Remove',
        danger: true
      }))) return;
      db.clients.splice(idx, 1);
      noteDbRemoval('client', idx);
      saveDb();
      renderDb();
      pushHistory({ type: 'db', tool: '', toolName: 'Client DB updated', title: 'Client removed — ' + db.clients.length + ' left' });
      renderKpis();
      updateKPICards();
    });
    const itemCancel = $('db-item-cancel');
    if (itemCancel) itemCancel.addEventListener('click', function () { resetDbForm('item'); });
    const clientCancel = $('db-client-cancel');
    if (clientCancel) clientCancel.addEventListener('click', function () { resetDbForm('client'); });

    /* Public edit hooks — `id` is the item's SKU or the client's name, which
       are this app's natural primary keys for the two collections. Called by
       the database drawers (and available for any external caller). */
    window.editDatabaseItem = function (id) {
      let idx = -1;
      for (let i = 0; i < db.items.length; i++) { if (String(db.items[i].sku) === String(id)) { idx = i; break; } }
      if (idx === -1) { window.alert('Item "' + id + '" not found.'); return; }
      closeDbDrawer();
      startEditDbItem(idx);
    };
    window.editDatabaseClient = function (id) {
      let idx = -1;
      for (let i = 0; i < db.clients.length; i++) {
        if (String(db.clients[i].clientName || db.clients[i].name) === String(id)) { idx = i; break; }
      }
      if (idx === -1) { window.alert('Client "' + id + '" not found.'); return; }
      closeDbDrawer();
      startEditDbClient(idx);
    };

    // ── Database drawer modals (clickable count badges) ────────
    function openDbDrawer(which) {
      const overlay = $('db-' + which + '-drawer');
      if (!overlay) return;
      overlay.hidden = false;
      closeDbDrawer.__other = which === 'items' ? 'clients' : 'items';
      refreshDbDrawer(which);
    }
    function closeDbDrawer(which) {
      if (which) {
        const overlay = $('db-' + which + '-drawer');
        if (overlay) overlay.hidden = true;
      } else {
        const items = $('db-items-drawer');
        const clients = $('db-clients-drawer');
        if (items) items.hidden = true;
        if (clients) clients.hidden = true;
      }
    }
    function refreshDbDrawer(which) {
      const items = db.items;
      const clients = db.clients;
      if (which === 'items') {
        const search = ($('db-items-search') && $('db-items-search').value || '').trim().toLowerCase();
        const filtered = search ? items.filter(function (it) {
          return it && (it.sku.toLowerCase().indexOf(search) !== -1 || (it.name || '').toLowerCase().indexOf(search) !== -1);
        }) : items;
        const rows = $('db-items-drawer-rows');
        const empty = $('db-items-drawer-empty');
        if (!rows) return;
        if (!filtered.length) {
          rows.innerHTML = '';
          if (empty) empty.hidden = false;
        } else {
          if (empty) empty.hidden = true;
          rows.innerHTML = filtered.map(function (it, i) {
            return '<tr>' +
              '<td><strong>' + esc(it.sku) + '</strong></td>' +
              '<td class="db-name">' + esc(it.name || '\u2014') + '</td>' +
              '<td>' + esc(it.unit || '\u2014') + '</td>' +
              '<td class="text-right db-rate db-rate-' + dbRateInfo(it.rate).state + '" title="' + dbRateTitle(dbRateInfo(it.rate)) + '">' + esc(dbRateInfo(it.rate).text) + '</td>' +
              '<td class="w70"><span class="db-actions">' +
                '<button type="button" class="qr-edit db-item-drawer-edit" data-sku="' +
                  esc(it.sku).replace(/"/g, '&quot;') + '" aria-label="Edit item" title="Edit item">' + toolIconSvg('edit') + '</button>' +
                '<button type="button" class="qr-del db-item-drawer-del" data-sku="' +
                  esc(it.sku).replace(/"/g, '&quot;') + '" aria-label="Remove item" title="Remove item">\u2715</button>' +
              '</span></td>' +
            '</tr>';
          }).join('');
        }
        const countEl = $('db-items-drawer-count');
        if (countEl) countEl.textContent = filtered.length + ' of ' + items.length + ' items';
      } else if (which === 'clients') {
        const search = ($('db-clients-search') && $('db-clients-search').value || '').trim().toLowerCase();
        const filtered = search ? clients.filter(function (c) {
          const key = (c.clientName || c.name || '').toLowerCase();
          return key.indexOf(search) !== -1 || (c.address || '').toLowerCase().indexOf(search) !== -1;
        }) : clients;
        const rows = $('db-clients-drawer-rows');
        const empty = $('db-clients-drawer-empty');
        if (!rows) return;
        if (!filtered.length) {
          rows.innerHTML = '';
          if (empty) empty.hidden = false;
        } else {
          if (empty) empty.hidden = true;
          rows.innerHTML = filtered.map(function (c, i) {
            return '<tr>' +
              '<td><strong>' + esc(c.clientName || c.name) + '</strong></td>' +
              '<td class="db-addr">' + esc(c.clientAddress || c.address || '\u2014') + '</td>' +
              '<td>' + esc(c.contactPerson || '\u2014') + '</td>' +
              '<td>' + esc(c.tinRegNo || c.tin || '\u2014') + '</td>' +
              '<td>' + esc(c.poNo || '\u2014') + '</td>' +
              '<td class="w70"><span class="db-actions">' +
                '<button type="button" class="qr-edit db-client-drawer-edit" data-name="' +
                  esc(c.clientName || c.name).replace(/"/g, '&quot;') + '" aria-label="Edit client" title="Edit client">' + toolIconSvg('edit') + '</button>' +
                '<button type="button" class="qr-del db-client-drawer-del" data-name="' +
                  esc(c.clientName || c.name).replace(/"/g, '&quot;') + '" aria-label="Remove client" title="Remove client">\u2715</button>' +
              '</span></td>' +
            '</tr>';
          }).join('');
        }
        const countEl = $('db-clients-drawer-count');
        if (countEl) countEl.textContent = filtered.length + ' of ' + clients.length + ' clients';
      }
    }
    // Shared close-path: clicking the overlay, the X, or a Close button.
    (  function wireDrawers() {
      [$('db-items-drawer'), $('db-clients-drawer')].forEach(function (overlay) {
        if (!overlay) return;
        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) closeDbDrawer();
        });
      });
      [$('db-items-drawer-close'), $('db-clients-drawer-close'),
       $('db-items-drawer-close-btn'), $('db-clients-drawer-close-btn')].forEach(function (btn) {
        if (!btn) return;
        btn.addEventListener('click', function () { closeDbDrawer(); });
      });
      const searchItems = $('db-items-search');
      if (searchItems) searchItems.addEventListener('input', function () { refreshDbDrawer('items'); });
      const searchClients = $('db-clients-search');
      if (searchClients) searchClients.addEventListener('input', function () { refreshDbDrawer('clients'); });
      // Delete from drawer (delegates to the live table rows).
      const itemsBody = $('db-items-drawer-rows');
      if (itemsBody) itemsBody.addEventListener('click', async function (e) {
        const edit = e.target.closest('.db-item-drawer-edit');
        if (edit) { window.editDatabaseItem(edit.getAttribute('data-sku')); return; }
        const del = e.target.closest('.db-item-drawer-del');
        if (!del) return;
        const sku = del.getAttribute('data-sku');
        const idx = db.items.findIndex(function (it) { return it.sku === sku; });
        if (idx === -1) return;
        if (!(await confirmAction({
          title: 'Remove item?',
          message: 'Remove "' + sku + '" from the master database? Documents already created are not affected.',
          confirmLabel: 'Remove',
          danger: true
        }))) return;
        db.items.splice(idx, 1);
        noteDbRemoval('item', idx);
        saveDb();
        renderDb();
        refreshDbDrawer('items');
        pushHistory({ type: 'db', tool: '', toolName: 'Item DB updated', title: 'Item removed — ' + db.items.length + ' SKUs left' });
        renderKpis();
        updateKPICards();
      });
      const clientsBody = $('db-clients-drawer-rows');
      if (clientsBody) clientsBody.addEventListener('click', async function (e) {
        const edit = e.target.closest('.db-client-drawer-edit');
        if (edit) { window.editDatabaseClient(edit.getAttribute('data-name')); return; }
        const del = e.target.closest('.db-client-drawer-del');
        if (!del) return;
        const name = del.getAttribute('data-name');
        const idx = db.clients.findIndex(function (c) { return (c.clientName || c.name) === name; });
        if (idx === -1) return;
        if (!(await confirmAction({
          title: 'Remove client?',
          message: 'Remove "' + name + '" from the master database? Documents already created are not affected.',
          confirmLabel: 'Remove',
          danger: true
        }))) return;
        db.clients.splice(idx, 1);
        noteDbRemoval('client', idx);
        saveDb();
        renderDb();
        refreshDbDrawer('clients');
        pushHistory({ type: 'db', tool: '', toolName: 'Client DB updated', title: 'Client removed — ' + db.clients.length + ' left' });
        renderKpis();
        updateKPICards();
      });
    })();
    // Count badges are now buttons — open the matching drawer.
    const itemBadge = $('db-item-count');
    if (itemBadge) itemBadge.addEventListener('click', function () { openDbDrawer('items'); });
    const clientBadge = $('db-client-count');
    if (clientBadge) clientBadge.addEventListener('click', function () { openDbDrawer('clients'); });
    // Keyboard: Escape closes whichever drawer is open.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      const items = $('db-items-drawer');
      const clients = $('db-clients-drawer');
      if (items && !items.hidden) { closeDbDrawer('items'); e.preventDefault(); }
      else if (clients && !clients.hidden) { closeDbDrawer('clients'); e.preventDefault(); }
    });

    // ── Brand & Theme Settings ─────────────────────────────────
    const brandPairs = [['brand-name', 'name'], ['brand-legal', 'legalName'], ['brand-tag', 'tag'], ['brand-address', 'address'], ['brand-contact', 'contact'], ['brand-terms', 'terms'], ['brand-phone', 'phone'], ['brand-email', 'email'], ['brand-website', 'website'], ['brand-spec', 'spec'], ['brand-tin', 'tin'], ['brand-payterms', 'payTerms'], ['brand-beneficiary', 'beneficiary'], ['brand-bankbranch', 'bankBranch'], ['brand-swift', 'swift'], ['brand-branchcode', 'branchCode'], ['brand-accountno', 'accountNo'], ['brand-accountcur', 'accountCur']];
    for (let i = 0; i < brandPairs.length; i++) {
      (function (pair) {
        $(pair[0]).addEventListener('input', function () {
          brand[pair[1]] = this.value;
          saveBrand();
          renderBrandStatus();
          /* Bank / beneficiary / payment-terms edits flow straight into any
             ERP mode field that has not been overridden on the document. */
          renderErpModeFields();
        });
      })(brandPairs[i]);
    }
    $('brand-logo-input').addEventListener('change', function () {
      const file = this.files && this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        brand.logo = String(reader.result);
        saveBrand();
        renderBrand();
      };
      reader.readAsDataURL(file);
    });
    $('brand-logo-remove').addEventListener('click', function () {
      brand.logo = '';
      saveBrand();
      renderBrand();
    });
    $('brand-reset').addEventListener('click', async function () {
      if (!(await confirmAction({ title: 'Reset brand data?', message: 'This clears the letterhead details, logo, bank & beneficiary block and default terms.', confirmLabel: 'Reset brand', danger: true }))) return;
      brand = emptyBrand();
      saveBrand();
      renderBrand();
    });

    // ── All Utilities grid (+ footer ERP link if present) ──────
    const fe = $('footer-erp'); if (fe) fe.addEventListener('click', function () {
      showView('erp');
    });
    // ── Insights Hub: activity clear ───────────────────────────
    // ── Home: master-database preview (compact, bounded) ──────
    const homeViewAll = $('home-db-viewall');
    if (homeViewAll) homeViewAll.addEventListener('click', function () { showView('db'); });
    [$('home-db-items'), $('home-db-clients')].forEach(function (list) {
      if (!list) return;
      list.addEventListener('click', function (e) {
        const row = e.target.closest ? e.target.closest('.home-db-row') : null;
        if (!row) return;
        const idx = Number(row.getAttribute('data-id'));
        // Land on the full database with that record already open for
        // editing — the preview is a shortcut, not a second editor.
        if (row.getAttribute('data-db') === 'client') { showView('db'); startEditDbClient(idx); }
        else { showView('db'); startEditDbItem(idx); }
      });
    });
    const actClear = $('activity-clear');
    if (actClear) actClear.addEventListener('click', clearActivity);
  }

  /* ── Init ─────────────────────────────────────────────────────── */
  try {
    let savedTheme = 'dark';
    try { savedTheme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { /* ignore */ }
    applyTheme(savedTheme);
    initAccentBg();
    initOnboarding();
    initAuthUi();
    hydrateIcons();
    wireEvents();
    renderStorageStatus();
  } catch (e) { try { console.error('Nexora Engine boot:', e); } catch (e2) { /* ignore */ } }
  updateUnitLabels();
  renderToolCards(); // Other Utilities: the card grid is the page
    renderKpis();
    renderActivity();
    updateKPICards();
    wireKPILive();
    showView(viewFromHash() || DEFAULT_VIEW); // the fragment wins; Home otherwise
    renderAll();
  renderQr();
  renderBoq();
  renderInv();
  fillPricingForm();
  fillDutyForm();
  fillVariationForm();
  fillBreakevenForm();
  fillFxForm();
  fillGpaForm();
  fillRetainerForm();
  fillDelayForm();
  renderBrand();
  syncDbClientCurrency(true);
  renderDb();
  renderErp();
  renderHistory();
  initCurrencySelects();
  syncInvCurrencySelect();
  formatAllNumericInputs();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !document.getElementById('history-view').hidden) showView(DEFAULT_VIEW);
  });
  // Back/forward, a hand-edited fragment or an external deep link all land
  // here. Skipped when it matches the view already on screen, so the
  // fragment update in showView cannot loop back into a re-render.
  window.addEventListener('hashchange', function () {
    const next = viewFromHash();
    // An unrecognised fragment is not a view: keep what is on screen and
    // put the address bar back in step instead of leaving it lying.
    if (!next) { syncViewHash(currentView || DEFAULT_VIEW); return; }
    if (next === currentView) return;
    showView(next);
  });
  if (state.project) {
    $('r-rate').value = Calc.round2(defaultRate());
    setRateHint();
  }
})();
