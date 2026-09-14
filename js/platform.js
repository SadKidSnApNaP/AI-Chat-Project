/* Nexora Engine — platform switchboard
 * ─────────────────────────────────────────────────────────────────────────
 * The app is ONE codebase that runs in a browser, in an Electron window and
 * inside an Android WebView. Only two things genuinely differ per platform:
 *
 *   1. producing a PDF     — the browser prints via a hidden iframe; a desktop
 *                            shell builds a real file with printToPDF; an
 *                            Android WebView cannot print() at all.
 *   2. writing a file      — the browser downloads an <a download>; a desktop
 *                            shell wants a native save dialog.
 *
 * This file is the single place that difference lives. It holds NO business
 * logic, no calculations and no document templates: it only decides WHO does
 * those two jobs.
 *
 * WHY IT IS SAFE TO ADD
 *   In a plain browser no backend is ever registered, so every method below
 *   returns false and the caller's original code runs exactly as it did
 *   before. The app.js call sites are a single guard each, placed AFTER the
 *   existing test-suppression check so `?nodl=1` keeps producing no dialog and
 *   no file on every platform.
 *
 * HOW A SHELL INSTALLS ITSELF
 *   The shell registers a backend with the two optional methods:
 *
 *     window.NexoraPlatform.register({
 *       printPdf: function (html, title) { ... },   // → any value; returning
 *       saveFile: function (blob, filename) { ... } //   is enough to claim it
 *     });
 *
 *   Electron sets `window.nexoraNative` from its preload script; Capacitor is
 *   detected through its own global. Neither is required — a missing backend
 *   is simply the browser path.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ── Which shell are we in? ────────────────────────────────────────────
     Detection is evidence-based and only ever affects reporting: the actual
     routing decision is "is a backend registered?", so a wrong answer here
     can never change behaviour — it can only mislabel the status readout.

     Deliberately NOT sniffing the user-agent for "Electron". A great many
     host apps are Electron-based without being OUR shell — an IDE, a chat
     client, the preview pane this was developed in — and all of them carry
     Electron in the UA. Sniffing them would report "electron" for an ordinary
     browser session, so the check waits for the shell to identify itself
     (`window.nexoraNative`, set by the shell's preload) or for Capacitor to
     confirm it is native. `uaHint` keeps the raw signal available for
     diagnostics without letting it drive the answer. */
  function hasElectronUA() {
    try { return /Electron/i.test(navigator.userAgent || ''); } catch (e) { return false; }
  }

  function detect() {
    try {
      if (window.nexoraNative && window.nexoraNative.platform) return String(window.nexoraNative.platform);
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return 'android';
      if (hasBackend()) return 'native';
    } catch (e) { /* fall through to web */ }
    return 'web';
  }

  /* ── The test seam, mirrored ───────────────────────────────────────────
     Same rule as the app's own guard (loading with `?nodl=1`, or setting
     `window.__NEXORA_NO_DOWNLOAD = true`). Exposed so a shell can honour it
     too — without this a "no writes" test run would still pop a native save
     dialog, which is exactly the kind of side effect the flag exists to stop. */
  function isSuppressed() {
    try {
      if (window.__NEXORA_NO_DOWNLOAD === true) return true;
      return /(^|[?&])nodl=1(&|$)/.test(String(window.location.search || ''));
    } catch (e) { return false; }
  }

  let backend = null;

  function hasBackend() {
    return !!(backend && (typeof backend.printPdf === 'function' || typeof backend.saveFile === 'function'));
  }

  const api = {
    /* A live property, not a snapshot: a shell registers AFTER this file runs,
       so a value captured at load time would report "web" forever. */
    get kind() { return detect(); },

    /* Diagnostics only — never used to decide anything. */
    uaHint: hasElectronUA() ? 'electron' : 'other',

    /* Called by a shell once, as early as it can. Passing nothing clears it. */
    register: function (b) {
      backend = (b && typeof b === 'object') ? b : null;
      return hasBackend();
    },

    hasBackend: hasBackend,

    isSuppressed: isSuppressed,

    /* ── Print a compiled document ───────────────────────────────────────
       `html` is the complete standalone print document the app already
       compiled (embedded stylesheet, no CDN, no offscreen capture), so a
       shell can render it verbatim and get the same layout as the browser.
       Returns TRUE only when the shell claims the job, which is what tells
       app.js to skip its own iframe print and avoid producing the document
       twice. A backend that throws synchronously is treated as "did not take
       it" so the browser path still runs. */
    print: function (html, title) {
      if (!backend || typeof backend.printPdf !== 'function') return false;
      try {
        backend.printPdf(String(html || ''), String(title || ''));
        return true;
      } catch (e) {
        warn('printPdf backend failed', e);
        return false;
      }
    },

    /* ── Write a file ────────────────────────────────────────────────────
       Same contract: true ⇒ the shell wrote it, so the anchor-download path
       is skipped. The blob is passed through untouched, so a shell writes
       exactly the bytes the app produced. */
    saveFile: function (blob, filename) {
      if (!backend || typeof backend.saveFile !== 'function') return false;
      try {
        backend.saveFile(blob, String(filename || 'nexora-file'));
        return true;
      } catch (e) {
        warn('saveFile backend failed', e);
        return false;
      }
    }
  };

  function warn(what, e) {
    try { console.warn('[platform] ' + what + ':', (e && e.message) || e); } catch (err) { /* ignore */ }
  }

  window.NexoraPlatform = api;
})();
