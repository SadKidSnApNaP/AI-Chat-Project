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
-- Self-check — run the query below after the script to confirm RLS is on.
-- Every one of the five rows must read `true`.
-- ═══════════════════════════════════════════════════════════════════════════
-- select tablename, rowsecurity as rls_enabled,
--        (select count(*) from pg_policies p
--          where p.schemaname = 'public' and p.tablename = t.tablename) as policies
--   from pg_tables t
--  where schemaname = 'public'
--    and tablename in ('brand_settings','items','clients','documents','appearance_settings')
--  order by tablename;
