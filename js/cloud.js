/* Nexora Engine — cloud layer (Supabase)
 * ─────────────────────────────────────────────────────────────────────────
 * This file is the ONLY place that talks to Supabase. app.js keeps working
 * against localStorage exactly as before; this layer mirrors the keys listed
 * in SYNC to the cloud and pulls them back on the next device.
 *
 *   browser localStorage  =  synchronous cache / draft layer (offline-first)
 *   Supabase tables       =  the committed copy, protected by RLS
 *
 * Everything here is defensive: if the SDK is missing, the network is down,
 * the user is signed out or the SQL schema has not been run yet, the app
 * still boots from its local cache and reports the reason through
 * `NexoraCloud.status()` (and a 'nexora-cloud' window event).
 */
(function () {
  'use strict';

  /* ── Project configuration ─────────────────────────────────────────────
     Both values are PUBLIC by design: the publishable key is safe in
     frontend code because every table is protected by RLS (see
     supabase/schema.sql). Never put a service-role / secret key here. */
  const SUPABASE_URL = 'https://oknfjbwfvhctpohusnfk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_0xofSikBlei8zY-zxDIArg_K9uAC4tr';
  const PROJECT_REF = 'oknfjbwfvhctpohusnfk';

  /* Where supabase-js parks the session, so we can read the signed-in user
     synchronously during boot — the app's per-user storage namespacing
     depends on knowing the email before the first render. */
  const AUTH_TOKEN_KEY = 'sb-' + PROJECT_REF + '-auth-token';
  const META_KEY = 'nexora_cloud_meta_v1';    // { [email]: { [key]: epochMs } }
  const QUEUE_KEY = 'nexora_cloud_queue_v1';  // pending writes, per email
  const PULL_GUARD_KEY = 'nexora_cloud_pull_guard';

  const PUSH_DEBOUNCE_MS = 900;
  const AUTH_EVENT = 'nexora-cloud';

  /* ── What syncs, and how it maps onto tables ───────────────────────────
     `singleton` keys hold one object per user (upserted into a single row);
     `collection` keys hold an array whose members are diffed row by row.
     Local keys NOT listed here stay purely local (in-progress tool drafts,
     usage counters, onboarding flags) — that is the offline draft layer. */
  const SYNC = {
    'calcmall_brand_v1': {
      table: 'brand_settings', kind: 'singleton', transform: 'brand'
    },
    'cm-theme': {
      table: 'appearance_settings', kind: 'singleton', transform: 'appearance'
    },
    // Written by the same appearance row — aliases only trigger a push.
    'cm-accent-v1': {
      table: 'appearance_settings', kind: 'singleton', transform: 'appearance', alias: true
    },
    'cm-bg-v1': {
      table: 'appearance_settings', kind: 'singleton', transform: 'appearance', alias: true
    },
    'nexora_item_db': {
      table: 'items', kind: 'collection', transform: 'items', order: 'sku'
    },
    'nexora_client_db': {
      table: 'clients', kind: 'collection', transform: 'clients', order: 'name'
    },
    // The history list is the row set; the drafts map supplies each row's
    // `data` payload. Both local keys are read together.
    'calcmall_history': {
      table: 'documents', kind: 'collection', transform: 'documents', order: 'at'
    },
    'calcmall_history_drafts': {
      table: 'documents', kind: 'collection', transform: 'documents', order: 'at', alias: true
    },
    /* ── The ACCOUNT row (A4): plan tier + free-use meter ─────────────────
       One row per user, but NOT a plain singleton — the two halves are
       reconciled differently (the tier is the account's, the counter is
       merged with MAX), so it has its own kind and its own push. The meter is
       the second local key, hence an alias: a tool use must re-push the row. */
    'nexora_plan': {
      table: 'account_state', kind: 'account', transform: 'account'
    },
    'nexora_free_usage': {
      table: 'account_state', kind: 'account', transform: 'account', alias: true
    },
    /* ── A5 ───────────────────────────────────────────────────────────────
       The Master ERP Engine's saved records: { recordId: { savedAt, state } },
       one row per record, the whole payload in `data`.

       A6 merges this collection PER RECORD, and deletions travel as tombstones
       (`erp_records.deleted_at`, schema section 8) rather than as an absence —
       the local key beside it holds { recordId: epochMs } for the records this
       device has deleted. Without that column the merge falls back to A5's
       set-wide newest-wins, which is why `tombstones` is optional. */
    'calcmall_erp_records_v1': {
      table: 'erp_records', kind: 'collection', transform: 'erpRecords', order: 'savedAt',
      tombstones: 'calcmall_erp_deleted_v1'
    },
    /* { toolId: historyEntryId } — the bookmark that turns a repeat "Save to
       Library" into an UPDATE instead of a second entry. A pointer, not a
       document: one row per user.

       A6 merges it PER KEY. The row shape is unchanged (the map is still one
       row), and the per-key clock lives in a local key beside it — the moment
       THIS device last wrote or removed that key. The remote side has one
       clock for the whole map (the row's `updated_at`), which is enough to
       answer the only question that matters: was this key removed over there
       after we wrote it? */
    'calcmall_tool_library_v1': {
      table: 'tool_library_ids', kind: 'singleton', transform: 'toolLibrary',
      clocks: 'calcmall_tool_library_at_v1'
    }
  };
  // local key → the spec that owns it (aliases resolve to their primary key)
  const PRIMARY_KEY_FOR = {};
  Object.keys(SYNC).forEach(function (key) {
    if (!SYNC[key].alias) PRIMARY_KEY_FOR[key] = key;
  });
  PRIMARY_KEY_FOR['cm-accent-v1'] = 'cm-theme';
  PRIMARY_KEY_FOR['cm-bg-v1'] = 'cm-theme';
  PRIMARY_KEY_FOR['calcmall_history_drafts'] = 'calcmall_history';
  PRIMARY_KEY_FOR['nexora_free_usage'] = 'nexora_plan';

  /* ── Client construction ───────────────────────────────────────────────
     The SDK is loaded from a CDN. When it is blocked (offline first load,
     corporate proxy) the app degrades to local-only instead of throwing. */
  let client = null;
  let sdkError = '';
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: AUTH_TOKEN_KEY
        }
      });
    } else {
      sdkError = 'The Supabase SDK could not be loaded (offline or blocked by an extension).';
    }
  } catch (e) {
    sdkError = 'Supabase client failed to start: ' + (e && e.message ? e.message : e);
  }

  /* ── Tiny helpers ───────────────────────────────────────────────────── */
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* quota/private mode */ } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function parseJson(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try { const v = JSON.parse(raw); return (v === null || v === undefined) ? fallback : v; } catch (e) { return fallback; }
  }
  function text(v) { return v === null || v === undefined ? '' : String(v); }
  function numOrNull(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(String(v).replace(/[,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  // "Rs743,400.00" → 743400 — for the queryable amount column only.
  function amountFromText(v) {
    const cleaned = text(v).replace(/[^0-9.\-]/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  /* ── The free-use meter, as a value ───────────────────────────────────
     { toolId: count }, whole numbers only, drops anything that isn't a
     positive count. Kept total (never throws) because it parses whatever a
     previous version — or the other device — happened to store. */
  function usageCount(v) {
    const n = Math.floor(Number(v));
    return (Number.isFinite(n) && n > 0) ? n : 0;
  }
  function usageMap(value) {
    const out = {};
    let obj = value;
    if (typeof obj === 'string') obj = parseJson(obj, null);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    Object.keys(obj).forEach(function (k) {
      const n = usageCount(obj[k]);
      if (n > 0) out[k] = n;
    });
    return out;
  }
  /** Per-tool MAXIMUM — never last-writer-wins.
   *  A count can therefore only ever go up: two devices cannot lower each
   *  other's spend, and a cleared browser cache cannot reset an allowance that
   *  the account has already used. */
  function maxMergeUsage(a, b) {
    const left = usageMap(a), right = usageMap(b), out = {};
    Object.keys(left).forEach(function (k) { out[k] = left[k]; });
    Object.keys(right).forEach(function (k) { out[k] = Math.max(out[k] || 0, right[k]); });
    return out;
  }
  function sameUsage(a, b) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) if (a[ka[i]] !== b[ka[i]]) return false;
    return true;
  }
  function localUsage() { return usageMap(localValue('nexora_free_usage')); }

  /* ── Public status ──────────────────────────────────────────────────── */
  const state = {
    status: client ? 'signed-out' : 'unavailable',
    message: sdkError || '',
    lastSyncAt: 0,
    pendingKeys: 0,
    email: '',
    setupMissing: false,
    // True once a pull has succeeded in THIS page load. Nothing is ever
    // pushed before it, so a fresh device can't overwrite real cloud data
    // with its empty cache.
    pulledOK: false,
    // { logicalKey: epochMs } of the newest row we saw in the cloud.
    remoteAt: {},
    /* The ACCOUNT row (A4). `remoteUsage` is the last counter map we saw in
       the cloud — the far side of every MAX merge, on both the pull and the
       push — and `accountChangedAt` is how a pull tells the app to repaint
       the gating UI when it adopted a different tier or a higher count. */
    remoteUsage: {},
    accountPlan: '',
    accountUpdatedAt: '',
    accountChangedAt: 0,
    /* Tables this build expects that the database does not have yet (a schema
       section not run). They are skipped, never pushed to, and never allowed
       to take the rest of the sync down with them. */
    missingTables: {},
    /* Keys the PULL decided it must publish (A6's per-record / per-key merges
       work out exactly what needs sending; reconcile() then queues them). */
    pushNeeded: {}
  };
  let notifyListeners = [];

  function emit(patch) {
    if (patch) {
      Object.keys(patch).forEach(function (k) { state[k] = patch[k]; });
      if (patch.status && patch.status !== 'error') state.message = patch.message || '';
    }
    try {
      window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: snapshot() }));
    } catch (e) { /* ignore */ }
    notifyListeners.forEach(function (cb) { try { cb(snapshot()); } catch (e) { /* ignore */ } });
  }
  function snapshot() {
    return {
      status: state.status, message: state.message, email: state.email,
      lastSyncAt: state.lastSyncAt, pendingKeys: state.pendingKeys,
      setupMissing: state.setupMissing, available: !!client,
      // Bumped whenever a pull changed the account row, so the app can repaint
      // the plan/usage UI without re-fetching anything itself.
      accountAt: state.accountChangedAt,
      missingTables: Object.keys(state.missingTables)
    };
  }

  /* ── Session access (SYNCHRONOUS) ─────────────────────────────────────
     Read straight out of the persistence slot supabase-js writes, so the
     app can namespace its storage keys and decide the login gate before any
     promise resolves. The token itself is still verified by Supabase on
     every request — this is only used for routing/identity display. */
  function readSession() {
    const raw = lsGet(AUTH_TOKEN_KEY);
    if (!raw) return null;
    let s = parseJson(raw, null);
    if (!s || typeof s !== 'object') return null;
    // supabase-js has stored both the session itself and a wrapper in
    // different versions — unwrap when needed.
    if (s.currentSession && typeof s.currentSession === 'object') s = s.currentSession;
    if (!s || !s.user) return null;
    return s;
  }
  function sessionEmail() {
    const s = readSession();
    return (s && s.user && s.user.email) ? String(s.user.email) : '';
  }
  function sessionUserId() {
    const s = readSession();
    return (s && s.user && s.user.id) ? String(s.user.id) : '';
  }
  function sessionName() {
    const s = readSession();
    if (!s || !s.user) return '';
    const meta = s.user.user_metadata || {};
    return text(meta.full_name || meta.name || '') || (s.user.email ? String(s.user.email).split('@')[0] : '');
  }
  /* When the account was created — Supabase stamps this on the user record, so
     it survives a browser wipe and is identical on every device. */
  function sessionCreatedAt() {
    const s = readSession();
    return (s && s.user && s.user.created_at) ? String(s.user.created_at) : '';
  }
  function sessionTokenValid() {
    const s = readSession();
    if (!s) return false;
    if (!s.expires_at) return true;              // no expiry recorded → trust it
    if (s.expires_at * 1000 > Date.now() - 30000) return true;
    return !!s.refresh_token;                    // expired access token, but refreshable
  }
  function isSignedIn() { return !!sessionEmail() && sessionTokenValid(); }
  /* Drop the persisted session ourselves.
     supabase-js normally does this inside signOut() (its _signOut calls
     _removeSession() even when the server-side revoke fails), but signOut
     can also throw on its own — a lock-acquire timeout, a storage error —
     and every caller here swallows that. Whenever this module has already
     DECIDED the token is dead, leaving the slot behind would keep the app
     looking signed-in with a session the server rejects on every request:
     the login gate stays open, the sidebar shows the account, and pushes
     retry against a dead token forever. So the verdict is self-enforcing
     rather than delegated. The per-email queue is deliberately NOT cleared
     — it holds unsynced work, and loadQueue() already ignores a queue that
     belongs to a different account. */
  function clearLocalSession() {
    lsDel(AUTH_TOKEN_KEY);
  }

  /* ── Key resolution ───────────────────────────────────────────────────
     app.js owns the namespacing rule ("u:<email>:<key>") and hands it over
     at boot, so there is exactly one definition of where a value lives. */
  let keyFor = function (logicalKey) {
    const email = sessionEmail();
    return email ? 'u:' + email + ':' + logicalKey : logicalKey;
  };
  function configure(opts) {
    const o = opts || {};
    if (typeof o.keyFor === 'function') keyFor = o.keyFor;
    if (o.email) state.email = o.email;
    if (!client) { emit({ status: 'unavailable' }); return; }
    emit({ status: isSignedIn() ? 'synced' : 'signed-out', message: '' });
  }

  /* ── Meta (per-user write timestamps → conflict resolution) ──────────── */
  function metaRoot() { return parseJson(lsGet(META_KEY), {}) || {}; }
  function metaFor(email) {
    const root = metaRoot();
    if (!root[email] || typeof root[email] !== 'object') root[email] = {};
    return root[email];
  }
  function setMetaAt(email, logicalKey, at) {
    const root = metaRoot();
    if (!root[email] || typeof root[email] !== 'object') root[email] = {};
    root[email][logicalKey] = at;
    lsSet(META_KEY, JSON.stringify(root));
  }
  function clearCloudMeta(email) {
    const root = metaRoot();
    if (root[email]) { delete root[email]; lsSet(META_KEY, JSON.stringify(root)); }
  }

  /* ── Transforms: local value ⇄ database row ─────────────────────────── */
  const BRAND_COLUMNS = {
    name: 'name', legalName: 'legal_name', tag: 'tagline', address: 'address',
    contact: 'contact', phone: 'phone', email: 'email', website: 'website',
    spec: 'spec', tin: 'tin', terms: 'terms', logo: 'logo', payTerms: 'pay_terms',
    beneficiary: 'beneficiary', bankBranch: 'bank_branch', swift: 'swift',
    branchCode: 'branch_code', accountNo: 'account_no', accountCur: 'account_cur'
  };
  /* Client record → columns. `contactNumber` maps onto the table's existing
     `phone` column (the schema already kept a separate phone slot), and the
     retired client-level `hsCode` no longer has a mapping — the document's own
     HS code field is a different thing and stays where it is. The full record
     still round-trips through the `data` jsonb column, so nothing is lost. */
  const CLIENT_COLUMNS = {
    name: 'name', defaultProject: 'default_project', clientAddress: 'address',
    contactPerson: 'contact_person', contactNumber: 'phone', currency: 'currency',
    tinRegNo: 'tin', placeOfSupply: 'place_of_supply', poNo: 'po_no',
    deliveryTerms: 'delivery_terms', shipTo: 'ship_to', clientEmail: 'email'
  };

  function localValue(logicalKey) {
    return lsGet(keyFor(logicalKey));
  }

  function brandToRow(v, userId) {
    const b = (v && typeof v === 'object') ? v : {};
    const row = { user_id: userId };
    Object.keys(BRAND_COLUMNS).forEach(function (k) { row[BRAND_COLUMNS[k]] = text(b[k]); });
    return row;
  }
  function rowToBrand(row) {
    const out = {};
    Object.keys(BRAND_COLUMNS).forEach(function (k) { out[k] = text(row[BRAND_COLUMNS[k]]); });
    return out;
  }

  function appearanceToRow(v, userId) {
    // The three appearance keys are read together, so one row carries them.
    const theme = text(localValue('cm-theme')) || 'dark';
    const accent = text(localValue('cm-accent-v1'));
    const bg = text(localValue('cm-bg-v1'));
    return { user_id: userId, theme: theme, accent: accent, background: bg };
  }

  function itemsToRows(v, userId) {
    const arr = Array.isArray(v) ? v : [];
    const rows = [];
    const seen = {};
    arr.forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      const sku = text(it.sku).trim();
      const id = sku.toLowerCase();
      if (!id || seen[id]) return;           // the table key is the SKU
      seen[id] = 1;
      rows.push({
        user_id: userId, id: id, sku: sku,
        name: text(it.name), unit: text(it.unit) || 'Nr',
        rate: numOrNull(it.rate), added_at: numOrNull(it.addedAt) || null,
        data: it
      });
    });
    return rows;
  }
  function rowsToItems(rows) {
    return (rows || []).map(function (r) {
      // `data` holds the record exactly as the app kept it, so a field the
      // normalised columns don't cover can never be dropped by a round trip.
      const it = (r.data && typeof r.data === 'object') ? Object.assign({}, r.data) : {};
      it.sku = text(r.sku);
      it.name = text(r.name);
      it.unit = text(r.unit) || 'Nr';
      /* null must stay null: "never entered" is not the same as a 0 rate —
         so a null COLUMN is not by itself proof that no rate was ever set.
         The record's own copy is the tie-breaker: a row written before the
         column existed, or one whose column never got filled, must not blank
         a rate the record still carries. A record with no rate of its own
         comes back null either way, so "missing" survives the round trip. */
      const own = it.rate;
      const ownMissing = own === null || own === undefined || String(own).trim() === '';
      it.rate = (r.rate === null || r.rate === undefined) ? (ownMissing ? null : own) : Number(r.rate);
      if (r.added_at !== null && r.added_at !== undefined) it.addedAt = Number(r.added_at);
      return it;
    });
  }

  function clientsToRows(v, userId) {
    const arr = Array.isArray(v) ? v : [];
    const rows = [];
    const seen = {};
    arr.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      const name = text(c.name || c.clientName).trim();
      const id = name.toLowerCase();
      if (!id || seen[id]) return;
      seen[id] = 1;
      const row = { user_id: userId, id: id, name: name };
      Object.keys(CLIENT_COLUMNS).forEach(function (k) {
        if (k === 'name') return;
        row[CLIENT_COLUMNS[k]] = text(c[k]);
      });
      row.added_at = numOrNull(c.addedAt) || null;
      row.data = c;
      rows.push(row);
    });
    return rows;
  }
  function rowsToClients(rows) {
    return (rows || []).map(function (r) {
      const c = (r.data && typeof r.data === 'object') ? Object.assign({}, r.data) : {};
      c.name = text(r.name);
      c.clientName = text(r.name);
      Object.keys(CLIENT_COLUMNS).forEach(function (k) {
        if (k === 'name') return;
        c[k] = text(r[CLIENT_COLUMNS[k]]);
      });
      if (r.added_at !== null && r.added_at !== undefined) c.addedAt = Number(r.added_at);
      return c;
    });
  }

  function documentsToRows(v, userId) {
    const entries = Array.isArray(v) ? v : [];
    const drafts = parseJson(localValue('calcmall_history_drafts'), {}) || {};
    return entries.map(function (e) {
      if (!e || typeof e !== 'object' || !e.id) return null;
      const id = String(e.id);
      const draft = drafts[id];
      return {
        user_id: userId, id: id,
        type: text(e.type) || 'pdf', tool: text(e.tool), tool_name: text(e.toolName),
        title: text(e.title), client: text(e.client), ref: text(e.ref),
        total_text: text(e.total), amount: amountFromText(e.total),
        happened_at: numOrNull(e.at) || null,
        // The full payload needed to reload / re-download this entry.
        data: (draft === undefined) ? null : draft
      };
    }).filter(Boolean);
  }
  function rowsToHistory(rows) {
    return (rows || []).map(function (r) {
      return {
        id: String(r.id), type: text(r.type) || 'pdf', tool: text(r.tool),
        toolName: text(r.tool_name) || 'Nexora Engine', title: text(r.title),
        total: text(r.total_text), client: text(r.client), ref: text(r.ref),
        at: Number(r.happened_at) || Date.now()
      };
    }).sort(function (a, b) { return b.at - a.at; });
  }
  function rowsToDrafts(rows) {
    const out = {};
    (rows || []).forEach(function (r) { if (r.data !== null && r.data !== undefined) out[String(r.id)] = r.data; });
    return out;
  }

  function toRows(logicalKey, value, userId, opts) {
    switch (SYNC[logicalKey].transform) {
      case 'brand': return [brandToRow(value, userId)];
      case 'appearance': return [appearanceToRow(value, userId)];
      case 'toolLibrary': return [toolLibraryToRow(value, userId)];
      case 'items': return itemsToRows(value, userId);
      case 'clients': return clientsToRows(value, userId);
      case 'documents': return documentsToRows(value, userId);
      case 'erpRecords': return erpRecordsToRows(value, userId, opts);
      default: return [];
    }
  }

  /* ── A5 transforms ────────────────────────────────────────────────────
     The ERP record store is an OBJECT keyed by the user's Record ID, and the
     table mirrors that: the id is the key, the columns are only an index for
     reading, and `data` carries the record exactly as the app held it.

     A6 adds one thing here: when the tombstone column exists, a deleted record
     keeps its row with `deleted_at` stamped, and a RE-SAVED record clears that
     stamp — otherwise the row would go on saying "deleted" while carrying live
     data, and the next merge would read it as dead. */
  function erpSpec() { return SYNC['calcmall_erp_records_v1']; }
  function erpTombstones() { return parseJson(localValue(erpSpec().tombstones), {}) || {}; }

  function erpRecordsToRows(v, userId, opts) {
    const withTomb = !!(opts && opts.tombstones);
    const map = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    const rows = [];
    Object.keys(map).forEach(function (id) {
      const rec = map[id];
      const key = text(id).trim();
      if (!key || !rec || typeof rec !== 'object') return;
      const st = (rec.state && typeof rec.state === 'object') ? rec.state : {};
      const at = Date.parse(text(rec.savedAt));
      const row = {
        user_id: userId, id: key,
        client: text(st.client), project: text(st.project),
        line_count: Array.isArray(st.lines) ? st.lines.length : 0,
        saved_at: Number.isFinite(at) ? at : null,
        data: { savedAt: text(rec.savedAt), state: st }
      };
      if (withTomb) row.deleted_at = null;
      rows.push(row);
    });
    if (!withTomb) return rows;
    const tom = erpTombstones();
    const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
    Object.keys(tom).forEach(function (id) {
      const key = text(id).trim();
      const at = Number(tom[id]) || 0;
      /* A live record always owns its own row — one upsert cannot touch the
         same row twice — and a deletion past the retention window belongs to
         the server's purge, not to this device restating it forever. */
      if (!key || !at || map[key] || at < cutoff) return;
      rows.push({
        user_id: userId, id: key, client: '', project: '', line_count: 0,
        saved_at: null, data: null, deleted_at: new Date(at).toISOString()
      });
    });
    return rows;
  }

  function rowToErpRecord(r) {
    const rec = (r.data && typeof r.data === 'object' && !Array.isArray(r.data))
      ? Object.assign({}, r.data) : {};
    if (!rec.state || typeof rec.state !== 'object') rec.state = {};
    // A row written before (or without) the payload keeps its timestamp.
    if (!rec.savedAt && r.saved_at) rec.savedAt = new Date(Number(r.saved_at)).toISOString();
    return rec;
  }
  /* The cloud's copy, as the two maps the merge speaks in. A row carrying a
     `deleted_at` stamp is a deletion, not a record — and when the column does
     not exist yet every row's `deleted_at` is undefined, so this degrades to
     "every row is a record", which is exactly the A5 reading. */
  function rowsToErpState(rows) {
    const records = {}, tombstones = {};
    (rows || []).forEach(function (r) {
      const id = text(r.id).trim();
      if (!id) return;
      if (r.deleted_at) { tombstones[id] = Date.parse(text(r.deleted_at)) || 0; return; }
      records[id] = rowToErpRecord(r);
    });
    return { records: records, tombstones: tombstones };
  }
  function rowsToErpRecords(rows) { return rowsToErpState(rows).records; }
  /* Only non-empty pointers are stored, so a tool that has been Reset simply
     has no key — which is what makes the reset survive a round trip. */
  function toolLibraryToRow(v, userId) {
    return { user_id: userId, data: tidyToolLibrary(v) };
  }
  function rowToToolLibrary(row) {
    return tidyToolLibrary(row && row.data);
  }
  function tidyToolLibrary(v) {
    const map = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    const out = {};
    Object.keys(map).forEach(function (k) {
      const val = text(map[k]);
      if (val) out[k] = val;
    });
    return out;
  }

  /* ── A6: merging ONE RECORD AT A TIME ─────────────────────────────────
     A5 compared two collections as wholes: whichever side owned the newest
     row won outright, so editing record X on one device and record Y on
     another (both offline) lost one of the two edits. A6 compares each record
     id on its own and takes the UNION of both sides.

     The clock is the record's OWN `savedAt` — the moment the user pressed
     Save. It is the same value on both sides (it round-trips inside `data`),
     and it does NOT move when a device merely re-pushes what it already had,
     which is exactly what the row's `updated_at` does. (`updated_at` stays the
     fallback for a row written before the payload existed.)

     These functions are pure — no network, no storage — so what the sync runs
     is what a test can call directly. */
  const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

  /* Key-order-independent serialization. "Did anything change?" is answered by
     comparing strings, and a map's key order is not meaningful: the app writes
     its maps in insertion order, the merge builds them in its own. */
  function stableJson(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stableJson(v[k]);
    }).join(',') + '}';
  }

  function erpEvent(at, dead, body) {
    return { at: Number(at) || 0, dead: !!dead, body: text(body) };
  }
  /* A local record's event: when the user saved it, and what the payload was.
     `body` only ever breaks a tie, so it carries the persisted part. */
  function erpLocalEvent(rec) {
    return erpEvent(Date.parse(text(rec && rec.savedAt)), false,
      JSON.stringify((rec && rec.state) || {}));
  }
  /* Deterministic winner of two events. Every device runs this on the same
     pair and gets the same answer, which is the property the union needs: a
     tie must not leave each side keeping its own copy.
       * a later save wins;
       * at the SAME instant a delete beats a save — you cannot delete
         something you have not seen yet, so the delete is the later intent;
       * same instant and same kind (two devices saving in the same
         millisecond) falls back to the payload bytes, so both devices still
         pick the same one. */
  function erpWinner(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    if (a.at !== b.at) return a.at > b.at ? a : b;
    if (a.dead !== b.dead) return a.dead ? a : b;
    return a.body >= b.body ? a : b;
  }
  /* A cloud row's event. A tombstone is a deletion; otherwise the clock is the
     record's own savedAt, with the columns as fallbacks. */
  function erpRowEvent(row) {
    if (row && row.deleted_at) return erpEvent(Date.parse(text(row.deleted_at)), true, '');
    const d = (row && row.data && typeof row.data === 'object' && !Array.isArray(row.data)) ? row.data : {};
    const at = Date.parse(text(d.savedAt)) || numOrNull(row && row.saved_at) ||
      Date.parse(text(row && row.updated_at));
    return erpEvent(at, false, JSON.stringify((d && d.state) || {}));
  }

  /**
   * Merge one account's saved records with the cloud's copy, record by record.
   *
   *   local  = { records: { id: { savedAt, state } }, tombstones: { id: ms } }
   *   remote = the same shape, built from the rows by rowsToErpState()
   *
   * Returns the merged pair, plus what still has to be published:
   *   pushLive — ids whose LOCAL copy is strictly newer (a tie is never
   *              re-pushed: remote wins ties, both devices then agree without
   *              a write, and no write loop can form)
   *   pushDead — deletions the cloud has not seen yet (a tie IS pushed here, or
   *              a same-millisecond delete and save would leave the other
   *              device's copy alive for good)
   */
  function mergeErpRecords(local, remote) {
    const lrec = (local && local.records) || {};
    const ltom = (local && local.tombstones) || {};
    const rrec = (remote && remote.records) || {};
    const rtom = (remote && remote.tombstones) || {};
    const records = {}, tombstones = {}, pushLive = [], pushDead = [];
    const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
    const ids = {};
    [lrec, ltom, rrec, rtom].forEach(function (m) {
      Object.keys(m).forEach(function (id) { ids[id] = 1; });
    });
    Object.keys(ids).forEach(function (id) {
      const mine = lrec[id] ? erpLocalEvent(lrec[id])
        : (ltom[id] ? erpEvent(ltom[id], true, '') : null);
      const theirs = rrec[id] ? erpLocalEvent(rrec[id])
        : (rtom[id] ? erpEvent(rtom[id], true, '') : null);
      const win = erpWinner(mine, theirs);
      if (!win) return;
      if (win.dead) {
        if (win.at && win.at < cutoff) return;   // past retention: the purge owns it
        tombstones[id] = win.at;
        if (win === mine && (!theirs || !theirs.dead || theirs.at < mine.at)) pushDead.push(id);
        return;
      }
      records[id] = (win === mine) ? lrec[id] : rrec[id];
      if (win === mine && (!theirs || theirs.at < mine.at)) pushLive.push(id);
    });
    return { records: records, tombstones: tombstones, pushLive: pushLive, pushDead: pushDead };
  }

  /**
   * Merge the per-tool Library pointers with the cloud's map, key by key.
   *
   * A5 replaced the whole map with whichever side had written last, so saving
   * DIFFERENT tools on two devices inside one clock window lost one pointer —
   * and losing a pointer is what makes the next "Save to Library" for that tool
   * add a SECOND entry instead of updating the existing one.
   *
   * `clocks` is this device's per-key write time (a key that is absent from
   * `localIds` but present in `clocks` is a REMOVAL at that time). The remote
   * side only has one clock for the whole map — the row's `updated_at` — which
   * is enough to answer the only question that needs answering: was this key
   * removed over there after we wrote it?
   */
  function mergeToolLibrary(localIds, clocks, remoteIds, remoteAt) {
    const l = (localIds && typeof localIds === 'object') ? localIds : {};
    const r = (remoteIds && typeof remoteIds === 'object') ? remoteIds : {};
    const c0 = (clocks && typeof clocks === 'object') ? clocks : {};
    const rt = Number(remoteAt) || 0;
    const ids = {}, out = {};
    let push = false;
    const keys = {};
    [l, r, c0].forEach(function (m) {
      Object.keys(m).forEach(function (k) { keys[k] = 1; });
    });
    Object.keys(keys).forEach(function (k) {
      const lt = Number(c0[k]) || 0;
      const mine = Object.prototype.hasOwnProperty.call(l, k);
      const theirs = Object.prototype.hasOwnProperty.call(r, k);
      if (mine && theirs) {
        if (text(l[k]) === text(r[k])) { ids[k] = text(l[k]); out[k] = Math.max(lt, rt); return; }
        if (lt > rt) { ids[k] = text(l[k]); out[k] = lt; push = true; return; }   // ours is newer
        ids[k] = text(r[k]); out[k] = rt;                                        // theirs is
        return;
      }
      if (mine) {
        /* Ours, and the cloud's map does not carry it. If that map was written
           after our write, the key was removed over there — honour that. */
        if (rt > lt) { out[k] = rt; return; }
        ids[k] = text(l[k]); out[k] = lt; push = true;
        return;
      }
      if (theirs) {
        /* Not here, but the cloud has it: either we removed it after the cloud
           published its map (our removal stands) or we simply never had it. */
        if (lt > rt) { out[k] = lt; push = true; return; }
        ids[k] = text(r[k]); out[k] = rt;
        return;
      }
      out[k] = lt;   // a removal clock with nothing on either side: keep it
    });
    return { ids: ids, clocks: out, push: push };
  }

  /* ── Error classification ───────────────────────────────────────────── */
  function errorInfo(err) {
    const msg = text(err && (err.message || err.error_description || err.error || err));
    const code = text(err && (err.code || err.status || ''));
    const low = msg.toLowerCase();
    /* A missing TABLE, and a missing COLUMN, are the same problem from here:
       the database is not the schema this build expects. `42703` is
       undefined_column and `PGRST204` is PostgREST's "column not in the schema
       cache" — both mean a schema section has not been run. */
    if (code === 'PGRST205' || code === '42P01' || code === '42703' || code === 'PGRST204' ||
        low.indexOf('schema cache') !== -1 ||
        (low.indexOf('could not find the table') !== -1) ||
        (low.indexOf('column') !== -1 && low.indexOf('does not exist') !== -1)) {
      return { kind: 'setup', message: 'Cloud tables are missing — run supabase/schema.sql in the Supabase SQL editor.', code: code };
    }
    if (err instanceof TypeError || low.indexOf('failed to fetch') !== -1 ||
        low.indexOf('networkerror') !== -1 || low.indexOf('load failed') !== -1 ||
        (err && err.name === 'AuthRetryableFetchError') ||
        low.indexOf('fetch failed') !== -1) {
      return { kind: 'offline', message: "Can't reach the server — you're offline. Changes are saved on this device and will sync when the connection returns.", code: code };
    }
    if (code === '401' || code === '403' || low.indexOf('jwt') !== -1 || low.indexOf('not authenticated') !== -1) {
      return { kind: 'auth', message: 'Your session has expired. Please sign in again.', code: code };
    }
    /* Row/column privilege refusal — on this project that means the schema is
       not the one this build expects (account_state restricts the browser to
       the `usage` column on purpose, see schema section 6). Retrying cannot
       fix it, so it is reported once as a setup problem rather than as a
       transient sync error. */
    if (code === '42501' || low.indexOf('permission denied') !== -1) {
      return { kind: 'setup', message: 'The cloud refused a write \u2014 re-run supabase/schema.sql so the account_state column grants match this build.', code: code };
    }
    return { kind: 'error', message: msg || 'Cloud sync failed.', code: code };
  }

  function fail(err) {
    const info = errorInfo(err);
    if (info.kind === 'setup') state.setupMissing = true;
    emit({ status: info.kind === 'error' ? 'error' : info.kind, message: info.message });
    return info;
  }

  /* ── Pending-write queue (survives a reload / a spell offline) ──────── */
  function loadQueue() {
    const q = parseJson(lsGet(QUEUE_KEY), null);
    const email = sessionEmail();
    if (!q || typeof q !== 'object' || q.email !== email) return { email: email, keys: {} };
    return { email: email, keys: (q.keys && typeof q.keys === 'object') ? q.keys : {} };
  }
  function saveQueue(q) {
    if (!q || !q.email) { lsDel(QUEUE_KEY); return; }
    lsSet(QUEUE_KEY, JSON.stringify(q));
  }
  function queueKey(logicalKey, serialized) {
    const q = loadQueue();
    if (!q.email) return;
    q.keys[logicalKey] = { v: serialized, at: Date.now() };
    saveQueue(q);
    emit({ pendingKeys: Object.keys(q.keys).length });
  }
  function dropQueued(logicalKey) {
    const q = loadQueue();
    if (!q.keys[logicalKey]) return;
    delete q.keys[logicalKey];
    saveQueue(q);
    emit({ pendingKeys: Object.keys(q.keys).length });
  }

  /* ── Push one key ───────────────────────────────────────────────────── */
  const timers = {};
  function schedule(key, immediate) {
    const primary = PRIMARY_KEY_FOR[key] || key;
    if (timers[primary]) clearTimeout(timers[primary]);
    timers[primary] = setTimeout(function () {
      delete timers[primary];
      flushKey(primary);
    }, immediate ? 0 : PUSH_DEBOUNCE_MS);
  }

  /* True when this key's table is absent from the database. Such a key is
     still CACHED and QUEUED (nothing is lost) but never pushed, so a schema
     section the owner has not run yet cannot turn every local edit into a
     failing request. */
  function tableMissing(logicalKey) {
    const spec = SYNC[logicalKey];
    return !!(spec && state.missingTables[spec.table]);
  }
  /* One wording for a partial schema, derived from the CURRENT state rather
     than passed around, so a later successful write cannot clear the notice
     while a table is still absent (which is what a hardcoded
     `setupMissing: false` in the sync-success path used to do). */
  function missingTables() { return Object.keys(state.missingTables); }
  function missingNotice() {
    const m = missingTables();
    return m.length
      ? 'Some cloud tables are missing \u2014 run supabase/schema.sql. Still local-only: ' + m.join(', ') + '.'
      : '';
  }

  /** Called by app.js on every per-user write. */
  function noteWrite(logicalKey, serialized) {
    if (!client) return;
    if (!PRIMARY_KEY_FOR[logicalKey]) return;      // not a synced key → local-only
    // Record when the local value changed; conflict resolution compares this
    // against the row's updated_at.
    const email = sessionEmail();
    if (email) setMetaAt(email, PRIMARY_KEY_FOR[logicalKey], Date.now());
    if (!email) return;                            // signed out → cache only
    queueKey(PRIMARY_KEY_FOR[logicalKey], serialized);
    // Never push before a pull has succeeded in this page load: until then
    // the write simply waits in the queue.
    if (state.pulledOK && !tableMissing(PRIMARY_KEY_FOR[logicalKey]) &&
        state.status !== 'offline' && state.status !== 'setup') {
      schedule(PRIMARY_KEY_FOR[logicalKey]);
    }
  }

  /** Called by app.js when a per-user key is removed (clear/reset paths).
      A removal is a real change, so it is queued like any other write — and
      flushKey always re-reads the LIVE local value, which means a cleared key
      pushes an empty row/collection (which is what "clear" should do)
      instead of the stale value we passed here.
      Only PRIMARY keys are published: an alias push would read its companion
      keys mid-change and write a half-populated row. */
  function noteRemove(logicalKey) {
    if (!client) return;
    const primary = PRIMARY_KEY_FOR[logicalKey];
    if (!primary || primary !== logicalKey) return;
    noteWrite(primary, null);
  }

  /* ── Pushing the account row ──────────────────────────────────────────
     Deliberately not a plain upsert, for two reasons that both come out of
     section 6 of supabase/schema.sql:

       * `plan` is NOT writable by this role. The browser holds column UPDATE
         privilege on `usage` (and `updated_at`) only, and a trigger pins the
         tier on every write that arrives with an `authenticated` JWT. So this
         publishes `usage` and nothing else, and the tier arrives by pull.
       * UPDATE-then-INSERT is used rather than ON CONFLICT DO UPDATE so the
         statement provably touches one column: an upsert's SET list is
         generated from the whole payload, which would drag `user_id` into an
         update this role is not allowed to perform.

     The published map is the per-tool MAX of our own and the last cloud value
     we saw, so a device that has been offline cannot talk the account's own
     record down. */
  async function pushAccountRow(userId) {
    const merged = maxMergeUsage(localUsage(), state.remoteUsage);
    const up = await client.from('account_state')
      .update({ usage: merged }).eq('user_id', userId).select('user_id');
    if (up.error) throw up.error;
    if (up.data && up.data.length) return merged;
    const ins = await client.from('account_state').insert({ user_id: userId, usage: merged });
    if (ins.error) {
      // Another device created the row inside that window — retry as an update.
      if (String(ins.error.code || '') === '23505') {
        const retry = await client.from('account_state')
          .update({ usage: merged }).eq('user_id', userId);
        if (retry.error) throw retry.error;
        return merged;
      }
      throw ins.error;
    }
    return merged;
  }

  /* ── A6: is the tombstone column there? ───────────────────────────────
     Per-record merge needs `erp_records.deleted_at` (schema section 8) to tell
     "deleted at T" apart from "created elsewhere and not pulled yet". Asked at
     most once per page load, and only the ANSWER `true` switches the merge on:
     a network blip leaves the question open (next load asks again) rather than
     concluding the schema is missing. Until then A5's set-wide rule runs,
     unchanged — a deploy can never be worse than what it replaced. */
  let tombstoneSupported = null;
  let tombstoneProbe = null;
  function tombstonesSupported() {
    if (tombstoneSupported !== null) return Promise.resolve(tombstoneSupported);
    if (tombstoneProbe) return tombstoneProbe;
    if (!client) return Promise.resolve(false);
    if (tableMissing('calcmall_erp_records_v1')) return Promise.resolve(false);
    tombstoneProbe = client.from('erp_records').select('deleted_at').limit(1)
      .then(function (res) {
        tombstoneProbe = null;
        if (!res || !res.error) { tombstoneSupported = true; return true; }
        const info = errorInfo(res.error);
        if (info.kind === 'setup' || info.kind === 'auth') tombstoneSupported = false;
        return false;
      })
      .catch(function () { tombstoneProbe = null; return false; });
    return tombstoneProbe;
  }

  /* Tombstones are only interesting while they are recent: every device that
     was going to see one has seen it long before the retention window closes,
     and after that the row is just weight. Purged here rather than by a
     scheduled job because a deletion is exactly when the list is worth
     pruning — and a purge failure must NOT fail the push it rode in on. */
  async function purgeTombstones(userId) {
    try {
      const cutoff = new Date(Date.now() - TOMBSTONE_RETENTION_MS).toISOString();
      await client.from('erp_records').delete()
        .eq('user_id', userId).not('deleted_at', 'is', null).lt('deleted_at', cutoff);
    } catch (e) { /* housekeeping only */ }
  }

  async function flushKey(logicalKey) {
    const spec = SYNC[logicalKey];
    if (!spec || !client) return { ok: false };
    // No table → no request. The entry stays queued, so the moment the schema
    // is run the next flush publishes it (nothing is dropped on the floor).
    if (tableMissing(logicalKey)) return { ok: false, skipped: 'table-missing' };
    const userId = sessionUserId();
    const email = sessionEmail();
    if (!userId || !email) { emit({ status: 'signed-out' }); return { ok: false }; }
    const serialized = localValue(logicalKey);
    let value = parseJson(serialized, spec.kind === 'collection' ? [] : {});
    emit({ status: 'syncing', message: '' });
    try {
      if (spec.kind === 'account') {
        state.remoteUsage = await pushAccountRow(userId);
        /* The cache becomes the merge result, so what the gate reads and what
           the account holds are the same map — there is no third state to
           drift. A cleared meter is also re-derived here: MAX against the
           cloud's copy restores it rather than resetting it. */
        writeLocal('nexora_free_usage', JSON.stringify(state.remoteUsage));
      } else if (spec.kind === 'singleton') {
        const row = toRows(logicalKey, value, userId)[0];
        const res = await client.from(spec.table).upsert(row, { onConflict: 'user_id' });
        if (res.error) throw res.error;
      } else {
        const useTomb = (logicalKey === 'calcmall_erp_records_v1') && await tombstonesSupported();
        const rows = toRows(logicalKey, value, userId, { tombstones: useTomb });
        const have = await client.from(spec.table).select('id').eq('user_id', userId);
        if (have.error) throw have.error;
        const localIds = {};
        rows.forEach(function (r) { localIds[r.id] = 1; });
        /* The sweep — delete every cloud row this device does not have — is a
           whole-collection rule and stops being safe under A6: a row can be
           absent here simply because another device created it after this
           device's last pull. So it runs ONLY when tombstones are unavailable
           (A5 behaviour); once `deleted_at` exists, deletions travel as
           tombstones instead and nothing is ever swept. */
        const gone = useTomb ? [] : (have.data || []).map(function (r) { return r.id; })
          .filter(function (id) { return !localIds[id]; });
        if (gone.length) {
          const del = await client.from(spec.table).delete().eq('user_id', userId).in('id', gone);
          if (del.error) throw del.error;
        }
        if (rows.length) {
          const up = await client.from(spec.table).upsert(rows, { onConflict: 'user_id,id' });
          if (up.error) throw up.error;
        }
        if (useTomb && Object.keys(erpTombstones()).length) await purgeTombstones(userId);
      }
      dropQueued(logicalKey);
      setMetaAt(email, logicalKey, Date.now());
      emit({
        status: 'synced', lastSyncAt: Date.now(),
        setupMissing: missingTables().length > 0,
        message: missingNotice()
      });
      return { ok: true };
    } catch (err) {
      const info = fail(err);
      if (info.kind === 'offline' || info.kind === 'setup' || info.kind === 'error') {
        queueKey(logicalKey, serialized);   // keep it for the next attempt
      }
      return { ok: false, error: info };
    }
  }

  async function flush() {
    if (!client || !isSignedIn()) return { ok: false, pushed: 0 };
    // A push is only safe after a successful pull: the pull is what tells us
    // whether the cloud copy is actually older than ours.
    if (!state.pulledOK) {
      const first = await pull();
      if (!first.ok) return { ok: false, pushed: 0, error: first.error };
    }
    const q = loadQueue();
    const keys = Object.keys(q.keys);
    if (!keys.length) return { ok: true, pushed: 0 };
    let ok = 0;
    for (let i = 0; i < keys.length; i++) {
      const res = await flushKey(keys[i]);
      if (res && res.ok) ok++;
    }
    return { ok: ok === keys.length, pushed: ok };
  }

  /* ── Pull ───────────────────────────────────────────────────────────── */
  /**
   * Adopt the cloud's saved records, merged PER RECORD (A6). Returns whether
   * the local store changed. Async only because deciding whether the merge can
   * run at all means asking the schema about the tombstone column — and that
   * question is only worth asking when something depends on the answer: rows on
   * the wire, or a deletion waiting here.
   */
  async function pullErpRecords(rows, email) {
    const key = 'calcmall_erp_records_v1';
    const spec = SYNC[key];
    let remoteAt = 0;
    rows.forEach(function (r) {
      const t = Date.parse(r.updated_at || '') || 0;
      if (t > remoteAt) remoteAt = t;
    });
    state.remoteAt[key] = remoteAt;
    const localRaw = localValue(key);
    const tombRaw = localValue(spec.tombstones);
    if (rows.length || Object.keys(parseJson(tombRaw, {}) || {}).length) {
      await tombstonesSupported();
    }
    /* No tombstone column → a row this device does not have is
       indistinguishable from one deleted elsewhere, so A5's rule stands
       EXACTLY as it was for as long as that is true. */
    if (tombstoneSupported !== true) {
      const localAt = metaFor(email)[key] || 0;
      if (localRaw === null || (remoteAt > 0 && remoteAt >= localAt)) {
        writeLocal(key, JSON.stringify(rowsToErpRecords(rows)));
        if (remoteAt) setMetaAt(email, key, remoteAt);
        return true;
      }
      return false;
    }
    const local = {
      records: parseJson(localRaw, {}) || {},
      tombstones: parseJson(tombRaw, {}) || {}
    };
    const merged = mergeErpRecords(local, rowsToErpState(rows));
    let changed = false;
    if (stableJson(merged.records) !== stableJson(local.records)) {
      writeLocal(key, JSON.stringify(merged.records));
      changed = true;
    }
    if (stableJson(merged.tombstones) !== stableJson(local.tombstones)) {
      writeLocal(spec.tombstones, JSON.stringify(merged.tombstones));
    }
    /* Only OUR newer copies go up — the merge names exactly which. Queued
       rather than sent here, because pull() has to finish adopting the cloud
       copy before anything is pushed back at it. */
    if (merged.pushLive.length || merged.pushDead.length) state.pushNeeded[key] = true;
    return changed;
  }

  async function pullTable(spec) {
    // Always scoped to the signed-in user, even though RLS already enforces
    // it — an explicit filter makes the intent readable and the result is
    // identical on every version of PostgREST.
    const res = await client.from(spec.table).select('*').eq('user_id', sessionUserId());
    if (res.error) throw res.error;
    return res.data || [];
  }

  /**
   * Fetch every synced table and adopt the newest side.
   * Returns { ok, changed: [logicalKey], error }.
   */
  async function pull() {
    if (!client) return { ok: false, changed: [], error: { kind: 'unavailable', message: sdkError } };
    const email = sessionEmail();
    if (!email) { emit({ status: 'signed-out' }); return { ok: false, changed: [], error: { kind: 'auth', message: 'Not signed in.' } }; }
    emit({ status: 'syncing', message: '' });
    const meta = metaFor(email);
    const changed = [];
    const missing = [];
    try {
      const tables = {};
      const specs = Object.keys(SYNC).filter(function (k) { return !SYNC[k].alias; });
      for (let i = 0; i < specs.length; i++) {
        const spec = SYNC[specs[i]];
        if (Object.prototype.hasOwnProperty.call(tables, spec.table)) continue;
        try {
          tables[spec.table] = await pullTable(spec);
          delete state.missingTables[spec.table];
        } catch (err) {
          const info = errorInfo(err);
          /* A REAL failure still fails the pull — the caller treats it as
             offline/setup and leaves the cache alone. But a table this build
             knows about and the database does not have yet (a schema section
             not run) must NOT take the rest of the sync down with it: the
             other tables still pull, this one's local copy is left alone, and
             nothing is ever pushed at it (see tableMissing). */
          if (info.kind !== 'setup') throw err;
          tables[spec.table] = null;
          state.missingTables[spec.table] = true;
          missing.push(spec.table);
        }
      }

      // — singletons —
      ['calcmall_brand_v1', 'cm-theme'].forEach(function (key) {
        const spec = SYNC[key];
        if (tables[spec.table] === null) return;   // table absent → leave the cache alone
        const rows = tables[spec.table] || [];
        const row = rows[0];
        const localRaw = localValue(key);
        if (!row) {
          // Nothing in the cloud yet → the local value is offered up by
          // reconcile() once the pull has finished.
          state.remoteAt[key] = 0;
          return;
        }
        const remoteAt = Date.parse(row.updated_at || '') || 0;
        state.remoteAt[key] = remoteAt;
        const localAt = meta[key] || 0;
        if (localRaw === null || remoteAt >= localAt) {
          if (key === 'cm-theme') {
            writeLocal('cm-theme', text(row.theme) || 'dark');
            writeLocal('cm-accent-v1', text(row.accent));
            writeLocal('cm-bg-v1', text(row.background));
          } else if (key === 'calcmall_tool_library_v1') {
            writeLocal(key, JSON.stringify(rowToToolLibrary(row)));
          } else {
            writeLocal(key, JSON.stringify(rowToBrand(row)));
          }
          setMetaAt(email, key, remoteAt || Date.now());
          changed.push(key);
        }
      });

      // — collections —
      ['nexora_item_db', 'nexora_client_db', 'calcmall_history'].forEach(function (key) {
        const spec = SYNC[key];
        if (tables[spec.table] === null) return;   // table absent → leave the cache alone
        const rows = tables[spec.table] || [];
        const localRaw = localValue(key);
        let remoteAt = 0;
        rows.forEach(function (r) {
          const t = Date.parse(r.updated_at || '') || 0;
          if (t > remoteAt) remoteAt = t;
        });
        state.remoteAt[key] = remoteAt;
        const localAt = meta[key] || 0;
        // An EMPTY cloud table never wins over local rows — that case is a
        // first-ever push, handled by reconcile().
        if (localRaw === null || (remoteAt > 0 && remoteAt >= localAt)) {
          if (key === 'nexora_item_db') writeLocal(key, JSON.stringify(rowsToItems(rows)));
          else if (key === 'nexora_client_db') writeLocal(key, JSON.stringify(rowsToClients(rows)));
          else {
            writeLocal('calcmall_history', JSON.stringify(rowsToHistory(rows)));
            writeLocal('calcmall_history_drafts', JSON.stringify(rowsToDrafts(rows)));
          }
          if (remoteAt) setMetaAt(email, key, remoteAt);
          changed.push(key);
        }
      });
      /* — saved ERP records: merged PER RECORD (A6) —
         Deliberately not the set-wide pick the other collections use: each
         record is decided on its own clock, so a record edited on this device
         and a DIFFERENT record edited on another both survive (the collection
         is the union of the two sides, not the newer side). */
      const erpTable = SYNC['calcmall_erp_records_v1'].table;
      if (tables[erpTable] !== null) {
        if (await pullErpRecords(tables[erpTable] || [], email)) changed.push('calcmall_erp_records_v1');
      }

      /* — the per-tool Library pointers: merged PER KEY (A6) —
         The row is still one map; only the MERGE is per key, so two devices
         saving different tools inside one clock window keep both pointers
         (and neither tool adds a second Library entry afterwards). */
      (function () {
        const key = 'calcmall_tool_library_v1';
        const spec = SYNC[key];
        if (tables[spec.table] === null) return;   // table absent → leave the cache alone
        const rows = tables[spec.table] || [];
        const row = rows[0];
        const remoteAt = row ? (Date.parse(text(row.updated_at)) || 0) : 0;
        state.remoteAt[key] = remoteAt;
        const localIds = parseJson(localValue(key), {}) || {};
        const clocks = parseJson(localValue(spec.clocks), {}) || {};
        const merged = mergeToolLibrary(localIds, clocks,
          row ? rowToToolLibrary(row) : {}, remoteAt);
        if (stableJson(merged.ids) !== stableJson(localIds)) {
          writeLocal(key, JSON.stringify(merged.ids));
          changed.push(key);
        }
        /* The clocks are bookkeeping, not data: rewriting them is not a change
           the app can see, so it never triggers a re-render. */
        if (stableJson(merged.clocks) !== stableJson(clocks)) {
          writeLocal(spec.clocks, JSON.stringify(merged.clocks));
        }
        if (merged.push) state.pushNeeded[key] = true;
      })();

      /* — the account row: tier + free-use meter (A4) —
         Deliberately NOT the last-writer-wins pick the other singletons use.
         The TIER is always taken from the account, unconditionally: that is
         the security property — the browser cannot grant itself premium, and
         clearing site data can no longer hand out a fresh free allowance
         either. The COUNTER is merged with MAX, so neither side can lower the
         other's: a second device cannot donate an allowance back, and a
         cleared cache cannot erase what the account has already spent. */
      (function () {
        const key = 'nexora_plan';
        /* An absent account table is NOT the same as an absent row: the first
           means this build and the database disagree, and then the cached
           tier must be left exactly as it is rather than revoked. */
        if (tables[SYNC[key].table] === null) return;
        const rows = tables[SYNC[key].table] || [];
        const row = rows[0];
        const at = row ? (Date.parse(row.updated_at || '') || 0) : 0;
        state.remoteAt[key] = at;
        state.remoteUsage = row ? usageMap(row.usage) : {};
        state.accountPlan = row ? (text(row.plan) || 'free') : '';
        state.accountUpdatedAt = row ? text(row.updated_at) : '';
        /* No row means the account has never synced, so its tier genuinely IS
           'free' — a local 'premium' at that point can only be a leftover
           browser-side grant, which is precisely what this replaces. */
        const effectivePlan = state.accountPlan || 'free';
        const cachedPlan = text(localValue(key)) || 'free';
        const merged = maxMergeUsage(localUsage(), state.remoteUsage);
        let touched = false;
        if (cachedPlan !== effectivePlan) { writeLocal(key, effectivePlan); touched = true; }
        if (!sameUsage(merged, localUsage())) {
          writeLocal('nexora_free_usage', JSON.stringify(merged));
          touched = true;
        }
        if (touched) {
          setMetaAt(email, key, at || Date.now());
          state.accountChangedAt = Date.now();
          changed.push(key);
        }
        if (!sameUsage(merged, state.remoteUsage)) {
          /* We hold the higher count, so publish the merge — queued rather
             than sent here, because pull() must finish adopting the cloud
             copy before anything is pushed back at it. */
          queueKey(key, JSON.stringify(merged));
        }
      })();

      state.pulledOK = true;
      // A partial schema is reported alongside a SUCCESSFUL sync — the tables
      // that do exist still synced, so this is an instruction (run the
      // missing section), not a failure.
      emit({
        status: 'synced', lastSyncAt: Date.now(),
        setupMissing: missing.length > 0,
        message: missingNotice()
      });
      return { ok: true, changed: changed, error: null, missing: missing };
    } catch (err) {
      const info = fail(err);
      return { ok: false, changed: [], error: info };
    }
  }

  /** Write a value into the namespaced local slot the app reads from. */
  function writeLocal(logicalKey, serialized) {
    lsSet(keyFor(logicalKey), serialized);
  }

  /**
   * Push anything whose local value is newer than what we last saw in the
   * cloud. Only runs after a successful pull, so a fresh device never
   * overwrites real remote data with its empty local cache.
   */
  async function reconcile() {
    if (!state.pulledOK) return { ok: false, pushed: 0 };
    const email = sessionEmail();
    if (!email) return { ok: false, pushed: 0 };
    const meta = metaFor(email);
    const keys = Object.keys(SYNC).filter(function (k) { return !SYNC[k].alias; });
    let queued = 0;
    keys.forEach(function (key) {
      const localRaw = localValue(key);
      const localAt = meta[key] || 0;
      const remoteAt = state.remoteAt[key] || 0;
      /* The account row is the one key whose payload is not simply "ours":
         it is a MAX merge, and the pull has already queued it whenever we
         genuinely hold a higher count. So the only thing left to publish is
         the row ITSELF, when the account has never had one. Timestamping it
         like the other keys would re-send an unchanged meter on every single
         page load (the meta clock is stamped at flush time, so it always
         looks newer than the row it just wrote).

         It is created even when this browser holds NO value for it: the row
         belongs to the ACCOUNT, not to the cache, and an account the owner
         wants to promote needs somewhere for that tier to live. Waiting for
         the first metered action would mean a fresh account has no row, so
         `update account_state set plan = …` would silently match nothing.
         So: signing in creates it (on the boot after the pull's one reload),
         and the first metered action creates it if that comes sooner. */
      /* A6's merges decide for themselves what needs publishing, because only
         they know which records and which pointer keys are ours. Their verdict
         outranks the set-wide clock rule below (which stays for the collections
         that still use it). */
      if (state.pushNeeded[key]) {
        delete state.pushNeeded[key];
        queueKey(key, localRaw || '');
        queued++;
        return;
      }
      if (SYNC[key].kind === 'account') {
        if (remoteAt === 0) { queueKey(key, localRaw || 'free'); queued++; }
        return;
      }
      if (localRaw === null) return;                 // nothing local to offer
      // Local is newer than the cloud row, or the cloud has none at all.
      if (localAt > remoteAt || (localAt === 0 && remoteAt === 0)) {
        queueKey(key, localRaw);
        queued++;
      }
    });
    if (!queued) return { ok: true, pushed: 0 };
    return await flush();   // pulledOK is true by now, so this pushes directly
  }

  /* ── Session verification (the gate is NOT a local flag) ──────────────
     The persisted session is read synchronously so the app can boot from it
     instantly, and then the server is asked whether it is still valid.
     Anything that means "this token is dead" clears it locally:
       401/403, an auth error, or an invalid/expired refresh token.
     A NETWORK failure is explicitly NOT one of those reasons — being offline
     must never sign the user out of an app that works from cache. */
  function looksExpired(err) {
    const status = Number((err && err.status) || 0);
    const msg = text(err && (err.message || err.error_description || err));
    const low = msg.toLowerCase();
    if (status === 401 || status === 403) return true;
    if (low.indexOf('refresh token') !== -1) return true;
    if (low.indexOf('invalid claim') !== -1) return true;
    if (low.indexOf('jwt expired') !== -1) return true;
    if (low.indexOf('session') !== -1 && low.indexOf('not found') !== -1) return true;
    return errorInfo(err).kind === 'auth';
  }

  async function verifySession() {
    if (!client) return { ok: false, reason: 'unavailable' };
    if (!isSignedIn()) return { ok: false, reason: 'signed-out' };
    try {
      const res = await client.auth.getUser();
      const err = res && res.error;
      if (err) {
        if (looksExpired(err)) {
          try { await client.auth.signOut(); } catch (e) { /* ignore */ }
          clearLocalSession();
          emit({ status: 'signed-out', email: '', message: 'Your session expired \u2014 please sign in again.' });
          return { ok: false, reason: 'expired' };
        }
        return { ok: false, reason: 'unreachable' };
      }
      return { ok: true, user: (res.data && res.data.user) || null };
    } catch (err) {
      if (looksExpired(err)) {
        try { await client.auth.signOut(); } catch (e) { /* ignore */ }
        clearLocalSession();
        emit({ status: 'signed-out', email: '', message: 'Your session expired \u2014 please sign in again.' });
        return { ok: false, reason: 'expired' };
      }
      return { ok: false, reason: 'unreachable' };
    }
  }

  /* ── Boot: verify the session, pull, then ask the app to re-render once ── */
  async function bootstrap() {
    if (!client) { emit({ status: 'unavailable', message: sdkError }); return { ok: false, reload: false }; }
    if (!isSignedIn()) { emit({ status: 'signed-out' }); return { ok: false, reload: false }; }
    const verify = await verifySession();
    if (verify.reason === 'expired') {
      // The server rejected the stored session and it has been cleared, so a
      // reload is what drops the UI back to the guest state.
      return { ok: false, reload: true, expired: true };
    }
    const email = sessionEmail();
    const res = await pull();
    if (!res.ok) {
      // Keep the cache exactly as it is and report why. Nothing is pushed in
      // this state — the queued writes wait for the next successful pull
      // (the 'online' listener and the visibility listener both retry).
      if (res.error && res.error.kind === 'offline') emit({ status: 'offline', message: res.error.message });
      return { ok: false, reload: false, error: res.error };
    }
    // A pull that changed the cache needs one re-render so the (synchronous)
    // app picks the new values up. Guarded to once per session per user, so
    // this can never turn into a reload loop.
    let reload = false;
    if (res.changed.length) {
      const guard = email + '|' + res.changed.join(',');
      let done = '';
      try { done = window.sessionStorage.getItem(PULL_GUARD_KEY) || ''; } catch (e) { done = ''; }
      if (done !== guard) {
        try { window.sessionStorage.setItem(PULL_GUARD_KEY, guard); } catch (e) { /* ignore */ }
        reload = true;
      }
    }
    if (!reload) await reconcile();
    return { ok: true, reload: reload };
  }

  /* ── Auth ───────────────────────────────────────────────────────────── */
  const AUTH_COPY = {
    'Invalid login credentials': 'Incorrect email or password. Please try again.',
    'Email not confirmed': 'This email has not been verified yet. Enter the 6-digit code we emailed you, or click Resend Code.',
    'User already registered': 'An account with this email already exists. Try logging in.',
    'User already exists': 'An account with this email already exists. Try logging in.',
    'Token has expired or is invalid': "That code is invalid or has expired. Please click 'Resend Code' for a new one.",
    'Password should be at least 6 characters': 'Password must be at least 6 characters.',
    'New password should be different from the old password.': 'Your new password must be different from the old one.',
    'Signups not allowed for this instance': 'New sign-ups are currently disabled for this project.',
    'Email rate limit exceeded': 'Too many emails requested. Please wait a minute and try again.'
  };
  function friendlyAuthError(err) {
    const raw = text(err && (err.message || err.error_description || err.error || err));
    const low = raw.toLowerCase();
    if (AUTH_COPY[raw]) return AUTH_COPY[raw];
    if (low.indexOf('rate limit') !== -1 || low.indexOf('for security purposes') !== -1 || low.indexOf('only request this after') !== -1) {
      return 'Too many attempts just now — please wait a moment before requesting another code.';
    }
    if (low.indexOf('invalid') !== -1 && low.indexOf('token') !== -1) {
      return "That code is invalid or has expired. Please click 'Resend Code' for a new one.";
    }
    if (low.indexOf('failed to fetch') !== -1 || low.indexOf('network') !== -1 || err instanceof TypeError) {
      return "Can't reach the server. Check your internet connection and try again.";
    }
    if (low.indexOf('valid email') !== -1) return 'Please enter a valid email address.';
    return raw || 'Something went wrong. Please try again.';
  }
  function authFail(err) { return { ok: false, message: friendlyAuthError(err), raw: text(err && err.message) }; }

  const auth = {
    /** Step 1 of sign-up: create the (unverified) account and email the code. */
    async signUp(email, password, fullName) {
      if (!client) return { ok: false, message: sdkError || 'Cloud backend unavailable.' };
      try {
        const res = await client.auth.signUp({
          email: email,
          password: password,
          options: {
            data: { full_name: fullName || '' },
            emailRedirectTo: window.location.origin + window.location.pathname
          }
        });
        if (res.error) return authFail(res.error);
        const user = res.data && res.data.user;
        // With confirmations on, an email that already exists comes back as a
        // user with no identities — that is Supabase's anti-enumeration shape.
        if (user && Array.isArray(user.identities) && user.identities.length === 0) {
          return { ok: false, message: AUTH_COPY['User already registered'] };
        }
        return { ok: true, needsVerification: !(res.data && res.data.session) };
      } catch (err) { return authFail(err); }
    },
    /** Step 2: check the 6-digit code and create the real session. */
    async verifyOtp(email, token) {
      if (!client) return { ok: false, message: sdkError || 'Cloud backend unavailable.' };
      try {
        const res = await client.auth.verifyOtp({ email: email, token: token, type: 'signup' });
        if (res.error) return authFail(res.error);
        return { ok: true, session: res.data && res.data.session };
      } catch (err) { return authFail(err); }
    },
    async resendOtp(email) {
      if (!client) return { ok: false, message: sdkError || 'Cloud backend unavailable.' };
      try {
        const res = await client.auth.resend({
          type: 'signup', email: email,
          options: { emailRedirectTo: window.location.origin + window.location.pathname }
        });
        if (res.error) return authFail(res.error);
        return { ok: true };
      } catch (err) { return authFail(err); }
    },
    async signIn(email, password) {
      if (!client) return { ok: false, message: sdkError || 'Cloud backend unavailable.' };
      try {
        const res = await client.auth.signInWithPassword({ email: email, password: password });
        if (res.error) return authFail(res.error);
        return { ok: true, session: res.data && res.data.session };
      } catch (err) { return authFail(err); }
    },
    async signOut() {
      if (!client) return { ok: true };
      try { await client.auth.signOut(); return { ok: true }; }
      catch (err) { return { ok: false, message: friendlyAuthError(err) }; }
    },
    async resetPassword(email) {
      if (!client) return { ok: false, message: sdkError || 'Cloud backend unavailable.' };
      try {
        const res = await client.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname
        });
        if (res.error) return authFail(res.error);
        return { ok: true };
      } catch (err) { return authFail(err); }
    },
    /** Change the account's display name (user_metadata.full_name).
     *  supabase-js writes the updated user back into the stored session, so
     *  sessionName() reflects it immediately — no reload needed. */
    async updateProfile(fields) {
      if (!client) return { ok: false, message: sdkError || 'Cloud backend unavailable.' };
      try {
        const data = {};
        if (fields && typeof fields.fullName === 'string') data.full_name = fields.fullName;
        const res = await client.auth.updateUser({ data: data });
        if (res.error) return authFail(res.error);
        return { ok: true, user: res.data && res.data.user };
      } catch (err) { return authFail(err); }
    },
    /** Next session change wins — the app reloads so keys re-namespace. */
    onChange(cb) {
      if (!client) return;
      client.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_OUT') {
          const email = state.email;
          if (email) clearCloudMeta(email);
          emit({ status: 'signed-out', email: '', pendingKeys: 0 });
        }
        /* A sign-in that arrives AFTER this page finished booting is the case
           a confirmation link produces, but it also covers a session restored
           in another tab. Report it so the app can act on the new identity. */
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
          emit({ status: 'synced', email: sessionEmail(), message: '' });
        }
        if (cb) cb(event);
      });
    }
  };

  /* ── Email-confirmation redirect ──────────────────────────────────────
     A confirmation link comes back to the app carrying the session in the
     URL (#access_token=… for the implicit flow, ?code=… for PKCE). Only
     supabase-js may consume those tokens, and it does so ASYNCHRONOUSLY: for
     the implicit flow it first calls getUser() over the network and only then
     persists the session.

     What used to be here stripped the tokens out of the address bar and
     reloaded the page after a flat 300 ms. Whenever that round-trip took
     longer than 300 ms the reload cancelled the exchange — and the tokens
     were by then already gone from the URL, so the session could never be
     recovered: the user landed on Home still signed out, which is exactly the
     reported symptom. A one-shot sessionStorage guard then ignored every
     later click of the link.

     So this function now only DETECTS the callback and waits for the verdict
     from onAuthStateChange. Nothing touches the URL until then. Deciding what
     to do about a session that arrived after boot belongs to app.js, because
     only it knows that its storage keys have to be re-namespaced. */
  const CONFIRM_GUARD_KEY = 'nexora_confirmation_handled';
  const CONFIRM_TIMEOUT_MS = 15000;
  let pendingConfirmation = false;
  let confirmTimer = null;

  /* Drop the tokens from the address bar. Only ever called once supabase-js
     has finished with them (or given up), never while they are still needed. */
  function cleanAuthUrl() {
    try {
      const hash = window.location.hash && window.location.hash.indexOf('access_token') === -1 ? window.location.hash : '';
      window.history.replaceState(null, document.title, window.location.origin + window.location.pathname + hash);
    } catch (e) { /* ignore */ }
  }

  function confirmSessionStorage() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }

  function finishConfirmation(message) {
    if (!pendingConfirmation) return;
    pendingConfirmation = false;
    if (confirmTimer) { window.clearTimeout(confirmTimer); confirmTimer = null; }
    const signedIn = isSignedIn();
    cleanAuthUrl();
    if (signedIn) {
      /* The exchange worked. Mark it so a reload loop is impossible, then
         report the signed-in state — app.js reloads once from here so every
         module re-reads its data under this account's keys. */
      const ss = confirmSessionStorage();
      if (ss) { try { ss.setItem(CONFIRM_GUARD_KEY, '1'); } catch (e) { /* ignore */ } }
      emit({ status: 'synced', email: sessionEmail(), message: '' });
      return;
    }
    emit({ status: 'signed-out', email: '', message: message || '' });
  }

  function handleConfirmationRedirect() {
    const url = String(window.location.href);
    const hasError = url.indexOf('error_description=') !== -1 || url.indexOf('error_code=') !== -1;
    const hasToken = url.indexOf('access_token=') !== -1 || url.indexOf('code=') !== -1 || hasError;
    if (!hasToken) {
      /* An ordinary load. Clearing the guard here is what keeps a later
         confirmation link working in the same tab. */
      const ss = confirmSessionStorage();
      if (ss) { try { ss.removeItem(CONFIRM_GUARD_KEY); } catch (e) { /* ignore */ } }
      return false;
    }
    if (!client) { cleanAuthUrl(); return false; }
    const ss = confirmSessionStorage();
    if (ss) {
      let done = '';
      try { done = ss.getItem(CONFIRM_GUARD_KEY) || ''; } catch (e) { done = ''; }
      /* Already exchanged in this tab (e.g. the reload raced us): the URL is
         stale, so tidy it and carry on as a normal load. */
      if (done === '1') { cleanAuthUrl(); return false; }
    }
    pendingConfirmation = true;
    if (hasError) {
      /* Supabase itself refused the link (expired, already used, wrong
         project). There is nothing to exchange, so report it at once rather
         than making the user wait out the timeout. */
      window.setTimeout(function () {
        finishConfirmation('That confirmation link is no longer valid. Please sign in, or request a new link.');
      }, 0);
      return true;
    }
    client.auth.onAuthStateChange(function (event, session) {
      if (!pendingConfirmation) return;
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) finishConfirmation('');
    });
    /* A link that is expired, already used, or opened with no network never
       produces a session. Give up gracefully: tidy the address bar and say so,
       instead of leaving the tokens sitting in the URL forever. */
    confirmTimer = window.setTimeout(function () {
      finishConfirmation('That confirmation link could not be verified. Please sign in, or request a new one.');
    }, CONFIRM_TIMEOUT_MS);
    return true;
  }

  /** True while a confirmation link is being exchanged. */
  function isConfirming() { return pendingConfirmation; }

  /* ── Connectivity: flush whenever we come back ──────────────────────── */
  window.addEventListener('online', function () {
    if (!isSignedIn()) return;
    emit({ status: 'syncing', message: '' });
    flush().then(function (res) {
      if (res && res.pushed) emit({ status: 'synced', lastSyncAt: Date.now(), message: 'Back online — changes synced.' });
    });
  });
  window.addEventListener('offline', function () {
    if (!client || !isSignedIn()) return;
    emit({ status: 'offline', message: "You're offline — changes are saved on this device and will sync automatically." });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && isSignedIn()) flush().catch(function () { /* ignore */ });
  });

  /* ── Public surface ─────────────────────────────────────────────────── */
  window.NexoraCloud = {
    config: { url: SUPABASE_URL, key: SUPABASE_KEY, tables: Object.keys(SYNC) },
    available: !!client,
    // sync surface
    configure: configure,
    bootstrap: bootstrap,
    pull: pull,
    flush: flush,
    reconcile: reconcile,
    /* Plan + meter as one readable value (diagnostics and tests): the cached
       tier, the effective counter map, and when the cloud row was written. */
    accountState: function () {
      return {
        plan: text(localValue('nexora_plan')) || 'free',
        cloudPlan: state.accountPlan,
        usage: localUsage(),
        cloudUsage: state.remoteUsage,
        updatedAt: state.accountUpdatedAt
      };
    },
    /* A6 state: whether the tombstone column answered, and what the last pull
       decided still has to be published. `tombstones: null` means the question
       has not been settled (not asked yet, or the answer was unreachable). */
    mergeState: function () {
      return {
        tombstones: tombstoneSupported,
        retentionMs: TOMBSTONE_RETENTION_MS,
        tombstonesLocal: Object.keys(erpTombstones()).length,
        pushNeeded: Object.keys(state.pushNeeded),
        stableJson: stableJson
      };
    },
    /* The pure merge rules, exposed so they can be unit-tested without a
       network or a database (see test/calculations.test.html). */
    merge: {
      usageMap: usageMap, maxMergeUsage: maxMergeUsage, sameUsage: sameUsage,
      erpRecords: mergeErpRecords, toolLibrary: mergeToolLibrary,
      erpWinner: erpWinner, erpRowEvent: erpRowEvent,
      rowsToErpState: rowsToErpState, erpRecordsToRows: erpRecordsToRows
    },
    verifySession: verifySession,
    noteWrite: noteWrite,
    noteRemove: noteRemove,
    status: snapshot,
    onChange: function (cb) { notifyListeners.push(cb); return function () { notifyListeners = notifyListeners.filter(function (f) { return f !== cb; }); }; },
    // session surface (synchronous)
    sessionEmail: sessionEmail,
    sessionUserId: sessionUserId,
    sessionName: sessionName,
    sessionCreatedAt: sessionCreatedAt,
    isSignedIn: isSignedIn,
    // true while an email-confirmation link is still being exchanged
    isConfirming: isConfirming,
    // auth surface
    auth: auth,
    friendlyAuthError: friendlyAuthError,
    // page load entry points
    handleConfirmationRedirect: handleConfirmationRedirect,
    // test/ops helpers
    clearMeta: function () { const e = sessionEmail(); if (e) clearCloudMeta(e); },
    getClient: function () { return client; }
  };

  if (handleConfirmationRedirect()) return;
  if (client) emit({ status: isSignedIn() ? 'synced' : 'signed-out' });
})();
