/* ══ A1 PARITY DRIVER — TEST HARNESS ONLY, NEVER SHIPPED ═══════════════════
   Proves the browser's export output is unchanged across the A1 refactor.

   It never writes a file. The page is opened with `?nodl=1`, so the app's own
   seams record what WOULD have been written:
     window.__nexoraPrintouts  ← every PDF payload (title, byte length, html)
     window.__nexoraDownloads  ← every disk write (filename, mime, bytes)

   All 22 views live in ONE document, so NOTHING navigates: a button inside a
   hidden view still fires its handler, and the exporters read app state rather
   than visibility. That is deliberate — the tools keep their drafts in memory
   and the unsaved-changes guard defers a view change once a draft has content,
   so navigating between steps would raise that dialog and tangle the run.
   Every step is therefore independent and order-free.

   Usage (from the test page):
     __a1seedPremium()            → unmetered, so no gate interferes
     __a1run('qr'|'erp'|'backup') → fill + trigger (records nothing yet)
     __a1collect()                → JSON fingerprint, after the exporter flushes
   ═════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function setVal(el, v) {
    if (!el) return false;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function byText(root, re, sel) {
    var nodes = Array.prototype.slice.call((root || document).querySelectorAll(sel || 'button'));
    for (var i = 0; i < nodes.length; i++) {
      if (re.test(nodes[i].textContent || '')) return nodes[i];
    }
    return null;
  }

  /* Fill the first line row of a table. The two tables use different input
     classes (the QR tool: .qr-item/.qr-qty/.qr-unit/.qr-rate; the ERP items
     table: .erp-sku/.erp-name/.erp-model/.erp-unit/.erp-qty/.erp-rate), so the
     field map is passed in. */
  function fillFirstRow(hostSel, fields) {
    var host = document.querySelector(hostSel);
    if (!host) return 'no container ' + hostSel;
    var row = host.querySelector('tr.qr-row');
    if (!row) return 'no row in ' + hostSel;
    var got = [];
    Object.keys(fields).forEach(function (sel) {
      if (setVal(row.querySelector(sel), fields[sel])) got.push(sel);
    });
    return 'filled [' + got.join(' ') + ']';
  }

  /* Premium ⇒ isPremium() true ⇒ nothing is metered. Read live by getPlan(). */
  window.__a1seedPremium = function () {
    try { localStorage.setItem('nexora_plan', 'premium'); } catch (e) { /* ignore */ }
    return localStorage.getItem('nexora_plan');
  };

  /* Click the confirm dialog's CONFIRM button if one is open, synchronously.
     confirmAction() paints the modal synchronously and resolves on a
     microtask, which drains before this function returns — so a click here
     really does complete the pending action within the same call. */
  function confirmIfOpen() {
    var modal = document.getElementById('confirm-modal');
    var ok = document.getElementById('confirm-ok');
    if (!modal || !ok || modal.hasAttribute('hidden')) return false;
    ok.click();
    return true;
  }
  window.__a1confirm = confirmIfOpen;

  /* Disarm the unsaved-changes guard by using the app's OWN reset path.
     This matters for the harness, not for the product: a dirty draft arms a
     `beforeunload` handler, and a browser then cancels the next full page
     load — which is how a uniquely-named test page silently failed to load
     while a previous tool still held unsaved input. Each tool's Reset/Clear
     is a commit point, so it lowers the flag the guard reads. */
  window.__a1reset = function (tool) {
    var RESET = { qr: 'qr-clear', erp: 'erp-reset', variation: 'vr-reset' };
    var id = RESET[tool] || null;
    var btn = id ? document.getElementById(id) : null;
    var out = { tool: tool, clicked: null, confirmed: 0 };
    if (btn) {
      out.clicked = id;
      btn.click();
      for (var i = 0; i < 4 && confirmIfOpen(); i++) out.confirmed++;
    }
    return JSON.stringify(out);
  };

  /* Fill inputs by id — for the tools whose form is a flat set of fields
     rather than a table row. */
  function fillById(map) {
    var got = [];
    Object.keys(map).forEach(function (id) {
      if (setVal(document.getElementById(id), map[id])) got.push(id);
    });
    return 'filled [' + got.join(' ') + ']';
  }

  /* `keep` suppresses the per-call reset so a multi-step run can accumulate
     every payload into one pair of arrays (see __a1runAll). */
  window.__a1run = function (step, keep) {
    if (!keep) {
      window.__nexoraPrintouts = [];
      window.__nexoraDownloads = [];
    }
    var log = { step: step, notes: [] };
    var btn = null;

    if (step === 'qr') {
      var qrHost = document.getElementById('qr-rows');
      if (qrHost && !qrHost.querySelector('tr.qr-row')) {
        var add = document.getElementById('qr-add-row');
        if (add) { add.click(); log.notes.push('clicked qr-add-row'); }
      }
      log.notes.push(fillFirstRow('#qr-rows', {
        '.qr-item': 'Cable tray installation',
        '.qr-qty': '25',
        '.qr-unit': 'm',
        '.qr-rate': '1500'
      }));
      btn = document.getElementById('qr-pdf');

    } else if (step === 'erp') {
      var erpHost = document.getElementById('erp-rows');
      if (erpHost && !erpHost.querySelector('tr.qr-row')) {
        var addItem = document.getElementById('erp-add-row');
        if (addItem) { addItem.click(); log.notes.push('clicked erp-add-row'); }
        else log.notes.push('NO erp-add-row button');
      }
      log.notes.push(fillFirstRow('#erp-rows', {
        '.erp-sku': 'FD-PANEL-01',
        '.erp-name': 'Fire detection panel, addressable, 2-loop',
        '.erp-model': 'MX-2000',
        '.erp-unit': 'Nr',
        '.erp-qty': '2',
        '.erp-rate': '12500'
      }));
      btn = document.getElementById('erp-pdf');

    } else if (step === 'variation') {
      log.notes.push(fillById({
        'vr-project': 'Warehouse electrical fit-out — Phase 2',
        'vr-original': '3500000',
        'vr-added': '425000',
        'vr-days': '10',
        'vr-desc': 'Additional 40A distribution board and containment works.'
      }));
      btn = document.getElementById('vr-pdf');

    } else if (step === 'erp-xlsx') {
      log.notes.push(fillFirstRow('#erp-rows', {
        '.erp-sku': 'FD-PANEL-01',
        '.erp-name': 'Fire detection panel, addressable, 2-loop',
        '.erp-model': 'MX-2000',
        '.erp-unit': 'Nr',
        '.erp-qty': '2',
        '.erp-rate': '12500'
      }));
      btn = document.getElementById('erp-export-xlsx');

    } else if (step === 'template') {
      btn = document.getElementById('erp-template-dl');

    } else if (step === 'backup') {
      btn = document.getElementById('backup-download');

    } else {
      log.notes.push('unknown step');
    }

    log.trigger = btn ? btn.id : 'NOT FOUND';
    if (btn) btn.click();
    return JSON.stringify(log);
  };

  /* Every step in ONE call, so a run costs a single round trip. The print
     payloads are deferred until fonts/images settle, so they are collected by
     a LATER call — that is why __a1run's per-step reset is hoisted here. */
  window.__a1runAll = function () {
    window.__nexoraPrintouts = [];
    window.__nexoraDownloads = [];
    var notes = [];
    ['qr', 'variation', 'backup'].forEach(function (step) {
      var out = JSON.parse(window.__a1run(step, true));
      notes.push(step + ': ' + out.trigger + ' — ' + out.notes.join('; '));
    });
    return JSON.stringify(notes);
  };

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }

  window.__a1collect = function () {
    var p = window.__nexoraPrintouts || [];
    var d = window.__nexoraDownloads || [];
    return JSON.stringify({
      platformKind: (window.NexoraPlatform && window.NexoraPlatform.kind) || 'absent',
      hasNativeBackend: !!(window.NexoraPlatform && window.NexoraPlatform.hasBackend && window.NexoraPlatform.hasBackend()),
      printouts: p.map(function (r) {
        return { title: r.title, bytes: r.bytes, hash: hashStr(String(r.html || '')) };
      }),
      downloads: d.map(function (r) {
        return { filename: r.filename, type: r.type, bytes: r.bytes };
      })
    });
  };
})();
