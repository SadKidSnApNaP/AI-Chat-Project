-- ═══════════════════════════════════════════════════════════════════════════
-- Nexora Engine — Supabase schema
-- Run this ONCE in the Supabase dashboard → SQL Editor → New query → Run.
-- It is idempotent: re-running it will not destroy data.
--
-- Design notes
--  * Every table is owned by the signed-in user through a `user_id` column
--    that defaults to auth.uid(), and Row Level Security is the ONLY thing
--    protecting the rows — the publishable (anon) key is shipped in the
--    frontend, so a table without RLS would be world-readable.
--  * The app's own identifiers are used as primary keys (lower-cased SKU for
--    items, lower-cased client name for clients, the app's history id for
--    documents) so the browser can diff its local cache against the cloud
--    without a second id space. Primary keys are therefore composite:
--    (user_id, id).
--  * `rate` is nullable on purpose: NULL means "never entered", 0 means "a
--    genuine zero price". The app shows those two states differently.
--  * `documents.data` holds the full saved document payload (the draft the
--    app needs to reload or re-download that entry).
--  * `account_state` (section 6, added in A4) is the ONE row per user that is
--    mostly NOT client-writable: the browser may read the whole row and write
--    only `usage`. The plan tier is set by the owner or by a server-side call
--    (Stripe webhook), never by the browser — see the notes in that section.
--  * `erp_records` and `tool_library_ids` (section 7, added in A5) carry the two
--    stores that were still device-only: the Master ERP Engine's saved
--    project/client records, and the per-tool pointer that decides whether a
--    "Save to Library" updates an entry or adds one. Both are ordinary tables
--    with the same RLS rule; see the notes there for why the second is a
--    whole-map last-writer-wins row rather than a per-key merge.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── updated_at maintenance ────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ═══ 1. Company & Brand Settings (1 row per user) ══════════════════════════
create table if not exists public.brand_settings (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name          text not null default '',
  legal_name    text not null default '',
  tagline       text not null default '',
  address       text not null default '',
  contact       text not null default '',
  phone         text not null default '',
  email         text not null default '',
  website       text not null default '',
  spec          text not null default '',
  tin           text not null default '',
  terms         text not null default '',
  logo          text not null default '',   -- data URL (kept in-row: see SUPABASE_SETUP.md)
  pay_terms     text not null default '',
  beneficiary   text not null default '',
  bank_branch   text not null default '',
  swift         text not null default '',
  branch_code   text not null default '',
  account_no    text not null default '',
  account_cur   text not null default '',
  updated_at    timestamptz not null default now()
);

-- ═══ 2. Master Item Database (1 row per item) ══════════════════════════════
create table if not exists public.items (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id          text not null,                -- lower-cased SKU
  sku         text not null,                -- SKU exactly as typed
  name        text not null default '',
  unit        text not null default 'Nr',
  rate        numeric,                      -- null = never entered, 0 = genuinely free
  added_at    bigint,                       -- epoch ms (used by the KPI trend)
  data        jsonb,                        -- the record exactly as the app held it
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- ═══ 3. Client Database (1 row per client) ═════════════════════════════════
create table if not exists public.clients (
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id              text not null,            -- lower-cased client name
  name            text not null,
  default_project text not null default '',
  address         text not null default '',
  contact_person  text not null default '',
  phone           text not null default '',
  email           text not null default '',
  currency        text not null default '',
  tin             text not null default '',
  place_of_supply text not null default '',
  po_no           text not null default '',
  delivery_terms  text not null default '',
  ship_to         text not null default '',
  hs_code         text not null default '',
  added_at        bigint,
  data            jsonb,                  -- the record exactly as the app held it
  updated_at      timestamptz not null default now(),
  primary key (user_id, id)
);

-- ═══ 4. History & Saved Documents (1 row per saved entry) ══════════════════
create table if not exists public.documents (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id          text not null,                -- the app's history id
  type        text not null default 'pdf',  -- 'pdf' | 'copy' | 'db' | …
  tool        text not null default '',
  tool_name   text not null default '',
  title       text not null default '',
  client      text not null default '',
  ref         text not null default '',
  total_text  text not null default '',     -- as displayed ("Rs743,400")
  amount      numeric,                      -- parsed for querying/reporting
  happened_at bigint,                       -- epoch ms, the displayed timestamp
  data        jsonb,                        -- full document payload (reload / re-download)
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

-- ═══ 5. Appearance Settings (1 row per user) ═══════════════════════════════
create table if not exists public.appearance_settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  theme       text not null default 'dark',  -- 'dark' | 'light'
  accent      text not null default '',
  background  text not null default '',
  updated_at  timestamptz not null default now()
);

-- ── Touch updated_at on every update ──────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['brand_settings','items','clients','documents','appearance_settings'] loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ── Helpful indexes for the per-user reads the app performs ───────────────
create index if not exists items_user_added_idx     on public.items (user_id, updated_at desc);
create index if not exists clients_user_added_idx   on public.clients (user_id, updated_at desc);
create index if not exists documents_user_time_idx  on public.documents (user_id, happened_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Enabled explicitly on every table, then one policy per operation so each
-- verb can be audited on its own. All five tables use the same rule:
--     auth.uid() = user_id
-- which also denies the `anon` role entirely (auth.uid() is null for it).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.brand_settings      enable row level security;
alter table public.items               enable row level security;
alter table public.clients             enable row level security;
alter table public.documents           enable row level security;
alter table public.appearance_settings enable row level security;

-- brand_settings
drop policy if exists brand_settings_select on public.brand_settings;
drop policy if exists brand_settings_insert on public.brand_settings;
drop policy if exists brand_settings_update on public.brand_settings;
drop policy if exists brand_settings_delete on public.brand_settings;
create policy brand_settings_select on public.brand_settings
  for select to authenticated using (auth.uid() = user_id);
create policy brand_settings_insert on public.brand_settings
  for insert to authenticated with check (auth.uid() = user_id);
create policy brand_settings_update on public.brand_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy brand_settings_delete on public.brand_settings
  for delete to authenticated using (auth.uid() = user_id);

-- items
drop policy if exists items_select on public.items;
drop policy if exists items_insert on public.items;
drop policy if exists items_update on public.items;
drop policy if exists items_delete on public.items;
create policy items_select on public.items
  for select to authenticated using (auth.uid() = user_id);
create policy items_insert on public.items
  for insert to authenticated with check (auth.uid() = user_id);
create policy items_update on public.items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy items_delete on public.items
  for delete to authenticated using (auth.uid() = user_id);

-- clients
drop policy if exists clients_select on public.clients;
drop policy if exists clients_insert on public.clients;
drop policy if exists clients_update on public.clients;
drop policy if exists clients_delete on public.clients;
create policy clients_select on public.clients
  for select to authenticated using (auth.uid() = user_id);
create policy clients_insert on public.clients
  for insert to authenticated with check (auth.uid() = user_id);
create policy clients_update on public.clients
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy clients_delete on public.clients
  for delete to authenticated using (auth.uid() = user_id);

-- documents
drop policy if exists documents_select on public.documents;
drop policy if exists documents_insert on public.documents;
drop policy if exists documents_update on public.documents;
drop policy if exists documents_delete on public.documents;
create policy documents_select on public.documents
  for select to authenticated using (auth.uid() = user_id);
create policy documents_insert on public.documents
  for insert to authenticated with check (auth.uid() = user_id);
create policy documents_update on public.documents
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy documents_delete on public.documents
  for delete to authenticated using (auth.uid() = user_id);

-- appearance_settings
drop policy if exists appearance_settings_select on public.appearance_settings;
drop policy if exists appearance_settings_insert on public.appearance_settings;
drop policy if exists appearance_settings_update on public.appearance_settings;
drop policy if exists appearance_settings_delete on public.appearance_settings;
create policy appearance_settings_select on public.appearance_settings
  for select to authenticated using (auth.uid() = user_id);
create policy appearance_settings_insert on public.appearance_settings
  for insert to authenticated with check (auth.uid() = user_id);
create policy appearance_settings_update on public.appearance_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy appearance_settings_delete on public.appearance_settings
  for delete to authenticated using (auth.uid() = user_id);

-- ── Table privileges ─────────────────────────────────────────────────────
-- RLS decides WHICH ROWS; these statements decide which VERBS the API roles
-- may even attempt. The anonymous (logged-out) role gets nothing at all.
revoke all on public.brand_settings, public.items, public.clients,
              public.documents, public.appearance_settings from anon;
grant select, insert, update, delete on public.brand_settings, public.items,
      public.clients, public.documents, public.appearance_settings to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. ACCOUNT STATE — plan tier + per-tool usage (A4)                          --
-- ═══════════════════════════════════════════════════════════════════════════
-- Why this table exists: both values used to live ONLY in localStorage, which
-- made quota a per-DEVICE fact. Another browser, or one "clear site data",
-- handed out a fresh free allowance; and a Premium badge on one machine was
-- invisible to the next. Worse, the plan tier was client-writable, so the gate
-- was advisory at best.
--
-- Two things are deliberate here:
--
--  * `usage` is a jsonb map of toolId -> count, and it is merged with MAX, never
--    last-writer-wins. Two devices cannot lower each other's count, and a user
--    who clears storage cannot reset their allowance by pushing an empty map.
--  * `plan` is READ-ONLY to the browser. RLS governs which ROWS a client may
--    touch, not which COLUMNS, so `grant update (usage)` below restricts writes
--    to the counter, and the trigger below refuses any plan change arriving
--    through the public API. Without that, anyone could open the console with
--    the publishable key and set their own tier to premium.
-- ═══════════════════════════════════════════════════════════════════════════

-- The role from the request's JWT: 'authenticated' for a signed-in browser
-- session, 'service_role' for server-side calls, '' in the SQL editor. Used to
-- tell "an end user is writing" apart from "the owner is administering".
create or replace function public.jwt_role()
returns text
language sql
stable
as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role',
    ''
  );
$$;

create table if not exists public.account_state (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  plan       text not null default 'free',        -- 'free' | 'premium' | 'developer'
  usage      jsonb not null default '{}'::jsonb,  -- { toolId: count } — merged with MAX
  updated_at timestamptz not null default now()
);

-- Guard the tier against the public API. Runs for every write, from any client.
create or replace function public.protect_account_plan()
returns trigger
language plpgsql
as $$
begin
  if public.jwt_role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.plan := 'free';          -- a browser session only ever creates a free row
    else
      new.plan := old.plan;        -- and may never change its own tier
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_account_plan on public.account_state;
create trigger trg_protect_account_plan
  before insert or update on public.account_state
  for each row execute function public.protect_account_plan();

drop trigger if exists trg_touch_updated_at on public.account_state;
create trigger trg_touch_updated_at before update on public.account_state
  for each row execute function public.touch_updated_at();

alter table public.account_state enable row level security;

drop policy if exists account_state_select on public.account_state;
drop policy if exists account_state_insert on public.account_state;
drop policy if exists account_state_update on public.account_state;
drop policy if exists account_state_delete on public.account_state;
create policy account_state_select on public.account_state
  for select to authenticated using (auth.uid() = user_id);
create policy account_state_insert on public.account_state
  for insert to authenticated with check (auth.uid() = user_id);
create policy account_state_update on public.account_state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy account_state_delete on public.account_state
  for delete to authenticated using (auth.uid() = user_id);

-- Column-level privileges: the browser may read the row and write ONLY `usage`.
-- `plan` is therefore not merely policy-protected but un-updatable by the role.
revoke all on public.account_state from anon;
revoke update on public.account_state from authenticated;
grant select, insert, delete on public.account_state to authenticated;
-- `updated_at` is included so the BEFORE trigger's assignment can never be the
-- thing that fails an upsert; the trigger overwrites it regardless, so this
-- grants the client nothing it can actually use. NOTE: `plan` is absent — that
-- is the guard, not an oversight.
grant update (usage, updated_at) on public.account_state to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. SAVED ERP RECORDS + PER-TOOL LIBRARY POINTERS (A5)                        --
-- ═══════════════════════════════════════════════════════════════════════════
-- Two local stores that were still device-only:
--
--  * `erp_records` — the Master ERP Engine's "Primary Key / Record ID" store
--    (`calcmall_erp_records_v1`): { recordId: { savedAt, state } }, where
--    `state` is the whole reusable document. A COLLECTION, keyed by the id the
--    user typed, with the full payload in `data` so nothing is lost on a round
--    trip. Like `items` and `clients`, the newest copy of a collection wins
--    until A6 adds per-record merge.
--
--  * `tool_library_ids` — `calcmall_tool_library_v1`: { toolId: historyEntryId }.
--    NOT a document store: it is the bookmark that makes a tool's "Save to
--    Library" UPDATE the entry it already created for the current project
--    instead of adding a second one. The documents themselves are in
--    `documents` (already synced). One row per user, and the whole map is last
--    -writer-wins — deliberately, because it is a pointer, not data: the worst
--    case is that the next save starts a new entry rather than overwriting the
--    previous one, and a per-key merge would need tombstones to survive a
--    "Reset" (which deletes a key) without resurrecting it.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.erp_records (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id         text not null,                -- the Record ID exactly as typed
  client     text not null default '',
  project    text not null default '',
  line_count integer not null default 0,
  saved_at   bigint,                       -- epoch ms, from the record's own savedAt
  data       jsonb,                        -- { savedAt, state } exactly as held
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.tool_library_ids (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,   -- { toolId: historyEntryId }
  updated_at timestamptz not null default now()
);

-- ── updated_at maintenance ────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['erp_records','tool_library_ids'] loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

create index if not exists erp_records_user_saved_idx on public.erp_records (user_id, saved_at desc);

-- ── RLS + policies: same rule as every other table ────────────────────────
alter table public.erp_records      enable row level security;
alter table public.tool_library_ids enable row level security;

drop policy if exists erp_records_select on public.erp_records;
drop policy if exists erp_records_insert on public.erp_records;
drop policy if exists erp_records_update on public.erp_records;
drop policy if exists erp_records_delete on public.erp_records;
create policy erp_records_select on public.erp_records
  for select to authenticated using (auth.uid() = user_id);
create policy erp_records_insert on public.erp_records
  for insert to authenticated with check (auth.uid() = user_id);
create policy erp_records_update on public.erp_records
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy erp_records_delete on public.erp_records
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists tool_library_ids_select on public.tool_library_ids;
drop policy if exists tool_library_ids_insert on public.tool_library_ids;
drop policy if exists tool_library_ids_update on public.tool_library_ids;
drop policy if exists tool_library_ids_delete on public.tool_library_ids;
create policy tool_library_ids_select on public.tool_library_ids
  for select to authenticated using (auth.uid() = user_id);
create policy tool_library_ids_insert on public.tool_library_ids
  for insert to authenticated with check (auth.uid() = user_id);
create policy tool_library_ids_update on public.tool_library_ids
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tool_library_ids_delete on public.tool_library_ids
  for delete to authenticated using (auth.uid() = user_id);

-- ── Table privileges ─────────────────────────────────────────────────────
revoke all on public.erp_records, public.tool_library_ids from anon;
grant select, insert, update, delete on public.erp_records, public.tool_library_ids to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Self-check — run the query below after the script to confirm RLS is on.
-- EVERY row must read `true`, one row per table (EIGHT rows).
-- ═══════════════════════════════════════════════════════════════════════════
-- select tablename, rowsecurity as rls_enabled,
--        (select count(*) from pg_policies p
--          where p.schemaname = 'public' and p.tablename = t.tablename) as policies
--   from pg_tables t
--  where schemaname = 'public'
--    and tablename in ('brand_settings','items','clients','documents','appearance_settings',
--                       'account_state','erp_records','tool_library_ids')
--  order by tablename;
--
-- Then confirm the column guard is real — this must FAIL for a browser session
-- (as the owner in the SQL editor it will succeed, which is how you grant
-- yourself or a colleague 'premium'/'developer'):
-- select has_column_privilege('authenticated','public.account_state','plan','UPDATE')   as plan_writable,
--        has_column_privilege('authenticated','public.account_state','usage','UPDATE')  as usage_writable;
