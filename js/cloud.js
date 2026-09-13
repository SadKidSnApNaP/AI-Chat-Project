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
    remoteAt: {}
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
      setupMissing: state.setupMissing, available: !!client
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
      // null must stay null: "never entered" is not the same as a 0 rate.
      it.rate = (r.rate === null || r.rate === undefined) ? null : Number(r.rate);
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

  function toRows(logicalKey, value, userId) {
    switch (SYNC[logicalKey].transform) {
      case 'brand': return [brandToRow(value, userId)];
      case 'appearance': return [appearanceToRow(value, userId)];
      case 'items': return itemsToRows(value, userId);
      case 'clients': return clientsToRows(value, userId);
      case 'documents': return documentsToRows(value, userId);
      default: return [];
    }
  }

  /* ── Error classification ───────────────────────────────────────────── */
  function errorInfo(err) {
    const msg = text(err && (err.message || err.error_description || err.error || err));
    const code = text(err && (err.code || err.status || ''));
    const low = msg.toLowerCase();
    if (code === 'PGRST205' || code === '42P01' || low.indexOf('schema cache') !== -1 ||
        (low.indexOf('could not find the table') !== -1)) {
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
    if (state.pulledOK && state.status !== 'offline' && state.status !== 'setup') {
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

  async function flushKey(logicalKey) {
    const spec = SYNC[logicalKey];
    if (!spec || !client) return { ok: false };
    const userId = sessionUserId();
    const email = sessionEmail();
    if (!userId || !email) { emit({ status: 'signed-out' }); return { ok: false }; }
    const serialized = localValue(logicalKey);
    let value = parseJson(serialized, spec.kind === 'collection' ? [] : {});
    emit({ status: 'syncing', message: '' });
    try {
      if (spec.kind === 'singleton') {
        const row = toRows(logicalKey, value, userId)[0];
        const res = await client.from(spec.table).upsert(row, { onConflict: 'user_id' });
        if (res.error) throw res.error;
      } else {
        const rows = toRows(logicalKey, value, userId);
        const have = await client.from(spec.table).select('id').eq('user_id', userId);
        if (have.error) throw have.error;
        const localIds = {};
        rows.forEach(function (r) { localIds[r.id] = 1; });
        const gone = (have.data || []).map(function (r) { return r.id; })
          .filter(function (id) { return !localIds[id]; });
        if (gone.length) {
          const del = await client.from(spec.table).delete().eq('user_id', userId).in('id', gone);
          if (del.error) throw del.error;
        }
        if (rows.length) {
          const up = await client.from(spec.table).upsert(rows, { onConflict: 'user_id,id' });
          if (up.error) throw up.error;
        }
      }
      dropQueued(logicalKey);
      setMetaAt(email, logicalKey, Date.now());
      emit({ status: 'synced', lastSyncAt: Date.now(), setupMissing: false });
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
    try {
      const tables = {};
      for (let i = 0; i < Object.keys(SYNC).length; i++) {
        const key = Object.keys(SYNC)[i];
        if (SYNC[key].alias) continue;
        const spec = SYNC[key];
        if (tables[spec.table]) continue;
        tables[spec.table] = await pullTable(spec);
      }

      // — singletons —
      ['calcmall_brand_v1', 'cm-theme'].forEach(function (key) {
        const spec = SYNC[key];
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
      state.pulledOK = true;
      emit({ status: 'synced', lastSyncAt: Date.now(), setupMissing: false });
      return { ok: true, changed: changed, error: null };
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
      if (localRaw === null) return;                 // nothing local to offer
      const localAt = meta[key] || 0;
      const remoteAt = state.remoteAt[key] || 0;
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
      client.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_OUT') {
          const email = state.email;
          if (email) clearCloudMeta(email);
          emit({ status: 'signed-out', email: '', pendingKeys: 0 });
        }
        if (cb) cb(event);
      });
    }
  };

  /* An email-confirmation link lands back on the app with tokens in the URL.
     supabase-js consumes them, then we tidy the address bar and re-render. */
  function handleConfirmationRedirect() {
    const url = String(window.location.href);
    const hasToken = url.indexOf('access_token=') !== -1 || url.indexOf('code=') !== -1 || url.indexOf('error_description=') !== -1;
    if (!hasToken) return false;
    let done = '';
    try { done = window.sessionStorage.getItem('nexora_confirmation_redirect') || ''; } catch (e) { done = ''; }
    if (done === '1') return false;
    try { window.sessionStorage.setItem('nexora_confirmation_redirect', '1'); } catch (e) { /* ignore */ }
    try {
      const clean = window.location.origin + window.location.pathname +
        (window.location.hash && window.location.hash.indexOf('access_token') === -1 ? window.location.hash : '');
      window.history.replaceState(null, document.title, clean);
    } catch (e) { /* ignore */ }
    window.setTimeout(function () { window.location.reload(); }, 300);
    return true;
  }

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
