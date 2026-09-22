-- ============================================================================
--  THE SONDRAVO FAMILY — Official Family Registry
--  COMPLETE DATABASE-OPZET IN ÉÉN BESTAND
-- ============================================================================
--
--  Plak dit hele bestand in de Supabase SQL Editor en klik één keer op RUN.
--  Dat is alles. Je hoeft de losse bestanden in migrations/ niet te draaien.
--
--  Veilig om opnieuw te draaien: er ontstaan geen dubbele leden en bestaande
--  gegevens blijven staan.
--
--  Onderaan zie je een melding zoals:
--      Register bevat nu 20 leden (limiet 20).
--  Verschijnt die, dan is alles goed gegaan.
--
--  Dit bestand is samengesteld uit de migraties in migrations/.
--  Pas je daar iets aan, genereer dit bestand dan opnieuw.
-- ============================================================================


-- ****************************************************************************
-- *  DEEL 1 VAN 8  —  0001_schema.sql
-- ****************************************************************************

-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migration 0001: schema, helper functions, audit triggers
-- Run this first in the Supabase SQL Editor (Database > SQL Editor > New query).
-- The script is idempotent: running it twice is safe.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- RANKS
-- The rank order is data, never alphabetical. `sort_order` is the single
-- source of truth for the order the registry renders in (1 = highest rank).
-- ---------------------------------------------------------------------------
create table if not exists public.ranks (
  key         text primary key,
  label       text        not null,
  glyph       text        not null default '●',
  tone        text        not null default 'neutral'
                          check (tone in ('gold', 'red', 'green', 'stone', 'neutral', 'muted')),
  sort_order  integer     not null,
  created_at  timestamptz not null default now()
);

create unique index if not exists ranks_sort_order_key on public.ranks (sort_order);

-- ---------------------------------------------------------------------------
-- MEMBERS  (every column here is PUBLIC — see 0002 for the policies)
-- Anything that must never reach a visitor lives in private_member_data.
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  id                uuid primary key default gen_random_uuid(),
  slug              text        not null unique,
  name              text        not null
                                check (char_length(btrim(name)) between 1 and 64),
  rank              text        not null references public.ranks (key)
                                on update cascade on delete restrict,
  discord_username  text        check (char_length(discord_username) <= 64),
  phone             text        check (char_length(phone) <= 32),
  avatar_url        text        check (avatar_url ~ '^https://' and char_length(avatar_url) <= 512),
  joined_at         date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists members_rank_idx on public.members (rank);
create index if not exists members_name_idx on public.members (lower(name));

-- ---------------------------------------------------------------------------
-- PRIVATE MEMBER DATA  (admins only — never selectable by anon)
-- discord_user_id lives here as well: it is an account identifier, not a
-- public profile field, and admins are the only ones who need it.
-- ---------------------------------------------------------------------------
create table if not exists public.private_member_data (
  member_id        uuid primary key references public.members (id) on delete cascade,
  discord_user_id  text        check (discord_user_id ~ '^[0-9]{5,32}$'),
  internal_note    text        check (char_length(internal_note) <= 2000),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ADMINS
-- A row here — and nothing else — grants write access. Rows are inserted by
-- hand in the SQL editor (see README, "Eerste admin").
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  label       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- SETTINGS  (singleton row, id is pinned to 1)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id           integer primary key default 1 check (id = 1),
  family_name  text        not null default 'The Sondravo Family',
  member_limit integer     not null default 20 check (member_limit between 1 and 500),
  updated_at   timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- AUDIT LOGS  (admins only)
-- member_id is intentionally NOT a foreign key: the history of a removed
-- member must survive the member row itself.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  admin_user_id  uuid references auth.users (id) on delete set null,
  admin_name     text,
  member_id      uuid,
  member_name    text,
  action         text        not null,
  old_value      jsonb,
  new_value      jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_member_idx on public.audit_logs (member_id);

-- ===========================================================================
-- HELPER FUNCTIONS
-- ===========================================================================

-- Authorization gate used by every write policy. SECURITY DEFINER so that the
-- lookup works even though `admins` itself is unreadable for normal users,
-- and so policies never recurse back into their own table.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admins a where a.user_id = uid);
$$;

comment on function public.is_admin(uuid) is
  'True when the given (default: current) auth user has a row in public.admins.';

-- Readable actor name for the history view, taken from the Discord identity
-- Supabase stored on the auth user.
create or replace function public.current_admin_name()
returns text
language sql
stable
as $$
  select nullif(btrim(coalesce(
    auth.jwt() -> 'user_metadata' -> 'custom_claims' ->> 'global_name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() -> 'user_metadata' ->> 'user_name',
    auth.jwt() ->> 'email',
    ''
  )), '');
$$;

-- URL/identity-safe slug, used to keep the seed idempotent.
create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'), '-'),
    ''
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Fills (and de-duplicates) the slug so admins never have to think about it.
create or replace function public.members_set_slug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  base_slug text;
  candidate text;
  suffix    integer := 1;
begin
  -- Een expliciet meegegeven slug blijft staan zoals hij is. Dat is wat de
  -- seed idempotent houdt: zou de trigger hier 'lahaye' stilletjes in
  -- 'lahaye-2' veranderen, dan slaat het ON CONFLICT (slug) van de seed nooit
  -- aan en groeit de ledenlijst bij elke run.
  if new.slug is not null and btrim(new.slug) <> '' then
    new.slug := coalesce(public.slugify(new.slug), new.slug);
    return new;
  end if;

  -- Geen slug meegegeven (zo voegt de app leden toe): afleiden uit de naam en
  -- ophogen tot hij vrij is, zodat twee leden met dezelfde naam kunnen bestaan.
  base_slug := coalesce(public.slugify(new.name), 'lid');
  candidate := base_slug;

  while exists (
    select 1 from public.members m
    where m.slug = candidate and (tg_op = 'INSERT' or m.id <> new.id)
  ) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

-- ===========================================================================
-- AUDIT TRIGGERS
-- History is written by the database, not by the app, so a change made
-- straight through the SQL editor or the API is logged just the same.
-- ===========================================================================

create or replace function public.log_member_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action      text;
  v_old         jsonb;
  v_new         jsonb;
  v_member_id   uuid;
  v_member_name text;
begin
  if tg_op = 'INSERT' then
    v_action := 'member.created';
    v_new := to_jsonb(new);
    v_member_id := new.id;
    v_member_name := new.name;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_member_id := new.id;
    v_member_name := new.name;

    -- A touch that only moved updated_at is not history.
    if (v_old - 'updated_at') = (v_new - 'updated_at') then
      return new;
    end if;

    if old.rank is distinct from new.rank then
      v_action := 'member.rank_changed';
    elsif old.name is distinct from new.name then
      v_action := 'member.renamed';
    elsif old.phone is distinct from new.phone then
      v_action := 'member.phone_changed';
    else
      v_action := 'member.updated';
    end if;
  else
    v_action := 'member.deleted';
    v_old := to_jsonb(old);
    v_member_id := old.id;
    v_member_name := old.name;
  end if;

  insert into public.audit_logs
    (admin_user_id, admin_name, member_id, member_name, action, old_value, new_value)
  values (
    auth.uid(),
    public.current_admin_name(),
    v_member_id,
    v_member_name,
    v_action,
    v_old,
    v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.log_private_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action      text;
  v_member_id   uuid;
  v_member_name text;
  v_old         jsonb;
  v_new         jsonb;
begin
  if tg_op = 'INSERT' then
    -- An empty private row carries no information; do not log it.
    if new.discord_user_id is null and new.internal_note is null then
      return new;
    end if;
    v_action := 'member.private_updated';
    v_member_id := new.member_id;
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    if (old.discord_user_id, old.internal_note)
       is not distinct from (new.discord_user_id, new.internal_note) then
      return new;
    end if;
    v_action := 'member.private_updated';
    v_member_id := new.member_id;
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
  else
    if old.discord_user_id is null and old.internal_note is null then
      return old;
    end if;
    v_action := 'member.private_cleared';
    v_member_id := old.member_id;
    v_old := to_jsonb(old);
  end if;

  select m.name into v_member_name from public.members m where m.id = v_member_id;

  insert into public.audit_logs
    (admin_user_id, admin_name, member_id, member_name, action, old_value, new_value)
  values (
    auth.uid(),
    public.current_admin_name(),
    v_member_id,
    v_member_name,
    v_action,
    v_old,
    v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.log_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return new;
  end if;

  insert into public.audit_logs
    (admin_user_id, admin_name, member_id, member_name, action, old_value, new_value)
  values (
    auth.uid(),
    public.current_admin_name(),
    null,
    null,
    'settings.updated',
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;

-- --- trigger wiring (drop first so re-running the file is safe) ------------
drop trigger if exists members_set_slug_trg on public.members;
create trigger members_set_slug_trg
  before insert or update of slug, name on public.members
  for each row execute function public.members_set_slug();

drop trigger if exists members_set_updated_at_trg on public.members;
create trigger members_set_updated_at_trg
  before update on public.members
  for each row execute function public.set_updated_at();

drop trigger if exists members_audit_trg on public.members;
create trigger members_audit_trg
  after insert or update or delete on public.members
  for each row execute function public.log_member_change();

drop trigger if exists private_member_data_updated_at_trg on public.private_member_data;
create trigger private_member_data_updated_at_trg
  before update on public.private_member_data
  for each row execute function public.set_updated_at();

drop trigger if exists private_member_data_audit_trg on public.private_member_data;
create trigger private_member_data_audit_trg
  after insert or update or delete on public.private_member_data
  for each row execute function public.log_private_change();

drop trigger if exists settings_set_updated_at_trg on public.settings;
create trigger settings_set_updated_at_trg
  before update on public.settings
  for each row execute function public.set_updated_at();

drop trigger if exists settings_audit_trg on public.settings;
create trigger settings_audit_trg
  after update on public.settings
  for each row execute function public.log_settings_change();

-- ****************************************************************************
-- *  DEEL 2 VAN 8  —  0002_rls_policies.sql
-- ****************************************************************************

-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migration 0002: Row Level Security, policies and table grants
-- Run this AFTER 0001_schema.sql. Idempotent.
--
-- The rule of the house:
--   anon           -> read the public registry, nothing else
--   authenticated  -> identical to anon, UNLESS the user has a row in admins
--   admin          -> full read/write on members, private data, settings, history
--   service_role   -> server-only key, used for the optional Discord sync
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enable RLS everywhere. No table in this schema is left open.
-- ---------------------------------------------------------------------------
alter table public.ranks               enable row level security;
alter table public.members             enable row level security;
alter table public.private_member_data enable row level security;
alter table public.admins              enable row level security;
alter table public.settings            enable row level security;
alter table public.audit_logs          enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Table grants. Policies can only narrow what a grant allows, so the grants
--    are the first line of defence: anon is never granted write on anything,
--    and is not granted anything at all on the private tables.
-- ---------------------------------------------------------------------------
revoke all on public.ranks               from anon, authenticated;
revoke all on public.members             from anon, authenticated;
revoke all on public.private_member_data from anon, authenticated;
revoke all on public.admins              from anon, authenticated;
revoke all on public.settings            from anon, authenticated;
revoke all on public.audit_logs          from anon, authenticated;

-- public registry (read-only for visitors)
grant select on public.ranks    to anon, authenticated;
grant select on public.members  to anon, authenticated;
grant select on public.settings to anon, authenticated;

-- admin surface: the grant is handed to the `authenticated` role, the policies
-- below then restrict every one of these statements to is_admin().
grant insert, update, delete on public.ranks               to authenticated;
grant insert, update, delete on public.members             to authenticated;
grant select, insert, update, delete on public.private_member_data to authenticated;
grant update                 on public.settings            to authenticated;
grant select                 on public.admins              to authenticated;
grant select                 on public.audit_logs          to authenticated;

-- Nobody may write history by hand. Rows are inserted exclusively by the
-- SECURITY DEFINER audit triggers from 0001, which run as the table owner.
revoke insert, update, delete on public.audit_logs from anon, authenticated;
-- Admin rows are handed out in the SQL editor only (service_role / postgres).
revoke insert, update, delete on public.admins from anon, authenticated;

grant execute on function public.is_admin(uuid)      to anon, authenticated;
grant execute on function public.current_admin_name() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RANKS — public reads, admin writes
-- ---------------------------------------------------------------------------
drop policy if exists ranks_public_read on public.ranks;
create policy ranks_public_read
  on public.ranks for select
  to anon, authenticated
  using (true);

drop policy if exists ranks_admin_write on public.ranks;
create policy ranks_admin_write
  on public.ranks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. MEMBERS — every column in this table is public by design
-- ---------------------------------------------------------------------------
drop policy if exists members_public_read on public.members;
create policy members_public_read
  on public.members for select
  to anon, authenticated
  using (true);

drop policy if exists members_admin_insert on public.members;
create policy members_admin_insert
  on public.members for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists members_admin_update on public.members;
create policy members_admin_update
  on public.members for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists members_admin_delete on public.members;
create policy members_admin_delete
  on public.members for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. PRIVATE MEMBER DATA — admins only, for reads as well as writes.
--    `anon` has no grant on this table at all, so a leak needs both a broken
--    policy and a broken grant.
-- ---------------------------------------------------------------------------
drop policy if exists private_member_data_admin_all on public.private_member_data;
create policy private_member_data_admin_all
  on public.private_member_data for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. ADMINS — only an admin may see who the admins are. No write policy
--    exists, so even an admin cannot promote somebody through the API.
-- ---------------------------------------------------------------------------
drop policy if exists admins_admin_read on public.admins;
create policy admins_admin_read
  on public.admins for select
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. SETTINGS — member_limit and family_name are public, updates are not.
--    There is no insert/delete policy: the singleton row stays a singleton.
-- ---------------------------------------------------------------------------
drop policy if exists settings_public_read on public.settings;
create policy settings_public_read
  on public.settings for select
  to anon, authenticated
  using (true);

drop policy if exists settings_admin_update on public.settings;
create policy settings_admin_update
  on public.settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. AUDIT LOGS — readable by admins, writable by nobody.
-- ---------------------------------------------------------------------------
drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read
  on public.audit_logs for select
  to authenticated
  using (public.is_admin());

-- ===========================================================================
-- 9. ADMIN RPCs
--    Saving a member touches two tables. Doing it in one function keeps the
--    write atomic and gives the API a single, validated entry point.
--    SECURITY INVOKER on purpose: RLS still applies, the explicit is_admin()
--    check is a second lock on the same door.
-- ===========================================================================
create or replace function public.admin_save_member(
  p_id               uuid,
  p_name             text,
  p_rank             text,
  p_discord_username text default null,
  p_discord_user_id  text default null,
  p_phone            text default null,
  p_avatar_url       text default null,
  p_joined_at        date default null,
  p_internal_note    text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id               uuid;
  v_name             text := nullif(btrim(coalesce(p_name, '')), '');
  v_discord_username text := nullif(btrim(coalesce(p_discord_username, '')), '');
  v_discord_user_id  text := nullif(btrim(coalesce(p_discord_user_id, '')), '');
  v_phone            text := nullif(btrim(coalesce(p_phone, '')), '');
  v_avatar_url       text := nullif(btrim(coalesce(p_avatar_url, '')), '');
  v_internal_note    text := nullif(btrim(coalesce(p_internal_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'Naam is verplicht' using errcode = '22023';
  end if;

  if not exists (select 1 from public.ranks r where r.key = p_rank) then
    raise exception 'Onbekende rang: %', p_rank using errcode = '22023';
  end if;

  -- Discord usernames are stored without the leading @.
  v_discord_username := nullif(btrim(ltrim(coalesce(v_discord_username, ''), '@')), '');

  if p_id is null then
    insert into public.members (name, rank, discord_username, phone, avatar_url, joined_at)
    values (v_name, p_rank, v_discord_username, v_phone, v_avatar_url, p_joined_at)
    returning id into v_id;
  else
    update public.members
       set name             = v_name,
           rank             = p_rank,
           discord_username = v_discord_username,
           phone            = v_phone,
           avatar_url       = v_avatar_url,
           joined_at        = p_joined_at
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Lid niet gevonden' using errcode = 'P0002';
    end if;
  end if;

  if v_discord_user_id is null and v_internal_note is null then
    delete from public.private_member_data where member_id = v_id;
  else
    insert into public.private_member_data (member_id, discord_user_id, internal_note, updated_at)
    values (v_id, v_discord_user_id, v_internal_note, now())
    on conflict (member_id) do update
      set discord_user_id = excluded.discord_user_id,
          internal_note   = excluded.internal_note,
          updated_at      = now();
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_save_member(uuid, text, text, text, text, text, text, date, text) from public;
grant execute on function public.admin_save_member(uuid, text, text, text, text, text, text, date, text) to authenticated;

-- Capacity / family name. Kept as an RPC so the check lives next to the write.
create or replace function public.admin_update_settings(
  p_member_limit integer,
  p_family_name  text default null
)
returns public.settings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.settings;
begin
  if not public.is_admin() then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  if p_member_limit is null or p_member_limit < 1 or p_member_limit > 500 then
    raise exception 'Ledenlimiet moet tussen 1 en 500 liggen' using errcode = '22023';
  end if;

  update public.settings
     set member_limit = p_member_limit,
         family_name  = coalesce(nullif(btrim(coalesce(p_family_name, '')), ''), family_name)
   where id = 1
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.admin_update_settings(integer, text) from public;
grant execute on function public.admin_update_settings(integer, text) to authenticated;

-- ****************************************************************************
-- *  DEEL 3 VAN 8  —  0003_seed.sql
-- ****************************************************************************

-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migration 0003: seed data (ranks + the current 20 members)
-- Run this AFTER 0002_rls_policies.sql.
--
-- IDEMPOTENT: every member is keyed on a unique slug, so running this file
-- a second (or tenth) time never creates duplicates and never overwrites a
-- change an admin made in the app.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Rank ladder, high to low. sort_order 1 is the top of the family.
-- This order is fixed and is never sorted alphabetically.
-- ---------------------------------------------------------------------------
insert into public.ranks (key, label, glyph, tone, sort_order) values
  ('mpitarika',  'Mpitarika',  '♛', 'gold',    1),
  ('lefitra',    'Lefitra',    '✦', 'red',     2),
  ('mpanoro',    'Mpanoro',    '✦', 'red',     3),
  ('mpifehy',    'Mpifehy',    '✦', 'red',     4),
  ('hery',       'Hery',       '◆', 'green',   5),
  ('mpiady',     'Mpiady',     '◆', 'green',   6),
  ('zoky',       'Zoky',       '◈', 'stone',   7),
  ('mpikambana', 'Mpikambana', '●', 'neutral', 8),
  ('zazavao',    'Zazavao',    '○', 'muted',   9)
on conflict (key) do update
  set label      = excluded.label,
      glyph      = excluded.glyph,
      tone       = excluded.tone,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Current roster — 20 members.
-- `slug` is the idempotency key. Adding a member later through the app gets a
-- slug generated automatically by the members_set_slug trigger.
-- ---------------------------------------------------------------------------
insert into public.members (slug, name, rank) values
  -- Mpitarika
  ('lahaye',   'Lahaye',   'mpitarika'),
  -- Lefitra
  ('vito',     'Vito',     'lefitra'),
  -- Mpanoro
  ('ryan',     'Ryan',     'mpanoro'),
  -- Mpifehy, Hery, Mpiady and Zoky have no members yet. Those ranks stay
  -- hidden on the public page until somebody is placed in them.
  -- Mpikambana
  ('renzo',    'Renzo',    'mpikambana'),
  ('levy',     'Levy',     'mpikambana'),
  ('dave',     'Dave',     'mpikambana'),
  ('gonzalo',  'Gonzalo',  'mpikambana'),
  ('culms',    'Culms',    'mpikambana'),
  ('bseah',    'Bseah',    'mpikambana'),
  ('thomas',   'Thomas',   'mpikambana'),
  ('rano',     'Rano',     'mpikambana'),
  ('santos',   'Santos',   'mpikambana'),
  ('baksteen', 'Baksteen', 'mpikambana'),
  ('dishway',  'Dishway',  'mpikambana'),
  -- Zazavao
  ('ferry',    'Ferry',    'zazavao'),
  ('rinnie',   'Rinnie',   'zazavao'),
  ('jayden',   'Jayden',   'zazavao'),
  ('tarik',    'Tarik',    'zazavao'),
  ('zoef',     'Zoef',     'zazavao'),
  ('xavier',   'Xavier',   'zazavao')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Capacity. The counter on the site reads this value — it is never hardcoded
-- in the front-end — and an admin can change it from the Settings modal.
-- ---------------------------------------------------------------------------
insert into public.settings (id, family_name, member_limit)
values (1, 'The Sondravo Family', 20)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Sanity check: should report 20 members against a limit of 20.
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_limit integer;
begin
  select count(*) into v_count from public.members;
  select member_limit into v_limit from public.settings where id = 1;
  raise notice 'Sondravo registry seeded: % / % members', v_count, v_limit;
end;
$$;

-- ****************************************************************************
-- *  DEEL 4 VAN 8  —  0004_bot_bridge.sql
-- ****************************************************************************

-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migratie 0004: brug voor de Discord-bot (/new)
--
-- Zorgt dat de bot een lid kan toevoegen zonder dat er een ingelogde admin is,
-- terwijl de history nog steeds laat zien WIE het commando gaf.
-- Uitvoeren NA 0003_seed.sql. Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Actornaam. Zonder ingelogde gebruiker (bot via service_role) is auth.uid()
--    leeg. De bot zet daarom `app.actor_name` als transactie-variabele, die
--    hier als laatste terugvaloptie gelezen wordt.
-- ---------------------------------------------------------------------------
create or replace function public.current_admin_name()
returns text
language sql
stable
as $$
  select nullif(btrim(coalesce(
    auth.jwt() -> 'user_metadata' -> 'custom_claims' ->> 'global_name',
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    auth.jwt() -> 'user_metadata' ->> 'user_name',
    auth.jwt() ->> 'email',
    nullif(current_setting('app.actor_name', true), ''),
    ''
  )), '');
$$;

-- ---------------------------------------------------------------------------
-- 2. bot_add_member — het /new commando.
--
--    SECURITY DEFINER zodat hij als eigenaar draait, maar afgeschermd met een
--    harde rolcheck: alleen service_role (de server, nooit de browser) mag hem
--    uitvoeren. Bestaat het Discord-account al in het register, dan wordt het
--    bestaande lid bijgewerkt in plaats van gedupliceerd.
-- ---------------------------------------------------------------------------
create or replace function public.bot_add_member(
  p_discord_user_id  text,
  p_name             text,
  p_discord_username text default null,
  p_rank             text default 'zazavao',
  p_avatar_url       text default null,
  p_actor            text default 'Discord bot'
)
returns table (member_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  v_created boolean := false;
  v_name    text := nullif(btrim(coalesce(p_name, '')), '');
  v_handle  text := nullif(btrim(ltrim(coalesce(p_discord_username, ''), '@')), '');
  v_avatar  text := nullif(btrim(coalesce(p_avatar_url, '')), '');
begin
  if current_user <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  if p_discord_user_id is null or p_discord_user_id !~ '^[0-9]{5,32}$' then
    raise exception 'Ongeldig Discord user ID' using errcode = '22023';
  end if;

  if v_name is null then
    raise exception 'Naam is verplicht' using errcode = '22023';
  end if;

  if not exists (select 1 from public.ranks r where r.key = p_rank) then
    raise exception 'Onbekende rang: %', p_rank using errcode = '22023';
  end if;

  -- Naam van degene die het commando gaf, voor de history.
  perform set_config('app.actor_name', coalesce(nullif(btrim(p_actor), ''), 'Discord bot'), true);

  select d.member_id into v_id
  from public.private_member_data d
  where d.discord_user_id = p_discord_user_id
  limit 1;

  if v_id is null then
    insert into public.members (name, rank, discord_username, avatar_url)
    values (v_name, p_rank, v_handle, v_avatar)
    returning id into v_id;
    v_created := true;

    -- Op de primaire sleutel botsen in plaats van op de kolomnaam: deze
    -- functie geeft een kolom `member_id` terug, en in `on conflict
    -- (member_id)` zou Postgres niet weten of dat de uitvoer of de kolom is.
    insert into public.private_member_data (member_id, discord_user_id, updated_at)
    values (v_id, p_discord_user_id, now())
    on conflict on constraint private_member_data_pkey do update
      set discord_user_id = excluded.discord_user_id,
          updated_at      = now();
  else
    update public.members
       set discord_username = coalesce(v_handle, discord_username),
           avatar_url       = coalesce(v_avatar, avatar_url)
     where id = v_id;
  end if;

  return query select v_id, v_created;
end;
$$;

-- De browser mag hier nooit bij: alleen de server-side service_role.
revoke all on function public.bot_add_member(text, text, text, text, text, text) from public;
revoke all on function public.bot_add_member(text, text, text, text, text, text) from anon, authenticated;
grant execute on function public.bot_add_member(text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. bot_remove_member — tegenhanger voor /verwijder in Discord.
-- ---------------------------------------------------------------------------
create or replace function public.bot_remove_member(
  p_discord_user_id text,
  p_actor           text default 'Discord bot'
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid;
  v_name text;
begin
  if current_user <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  perform set_config('app.actor_name', coalesce(nullif(btrim(p_actor), ''), 'Discord bot'), true);

  select d.member_id into v_id
  from public.private_member_data d
  where d.discord_user_id = p_discord_user_id
  limit 1;

  if v_id is null then
    return null;
  end if;

  select m.name into v_name from public.members m where m.id = v_id;
  delete from public.members where id = v_id;

  return v_name;
end;
$$;

revoke all on function public.bot_remove_member(text, text) from public;
revoke all on function public.bot_remove_member(text, text) from anon, authenticated;
grant execute on function public.bot_remove_member(text, text) to service_role;

-- ****************************************************************************
-- *  DEEL 5 VAN 8  —  0005_rank_colors.sql
-- ****************************************************************************

-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migratie 0005: rangkleuren uit Discord
--
-- Elke rang krijgt de kleur van zijn Discord-rol. De site toont die kleur
-- bewust gedempt: herkenbaar in de rangkop en de badge, maar nooit zo fel als
-- in Discord zelf — anders wordt de ledenlijst een kleurenfestival.
--
-- Uitvoeren NA 0004_bot_bridge.sql. Idempotent.
-- ============================================================================

alter table public.ranks
  add column if not exists color text not null default '#8b8f8a';

-- Alleen echte hexkleuren toestaan; de UI rekent daarop.
do $$
begin
  alter table public.ranks
    add constraint ranks_color_format check (color ~ '^#[0-9a-fA-F]{6}$');
exception
  when duplicate_object then null;
end;
$$;

update public.ranks as r
   set color = v.color
  from (values
    ('mpitarika',  '#1e00ff'),  -- blauw
    ('lefitra',    '#b7ff00'),  -- lime
    ('mpanoro',    '#00f52d'),  -- fel groen
    ('mpifehy',    '#00f52d'),  -- fel groen
    ('hery',       '#2ecc71'),  -- emerald
    ('mpiady',     '#ddf80c'),  -- geel-lime
    ('zoky',       '#f1c40f'),  -- goud
    ('mpikambana', '#ff0000'),  -- rood
    ('zazavao',    '#ff0000')   -- rood
  ) as v(key, color)
 where r.key = v.key
   and r.color is distinct from v.color;

-- ****************************************************************************
-- *  DEEL 6 VAN 8  —  0006_discord_admin_roles.sql
-- ****************************************************************************

-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migratie 0006: beheerrechten via een Discord-rol
--
-- Tot nu toe werd elke admin met de hand toegevoegd. Daar komt een tweede weg
-- bij: wie in Discord de Leader-rol heeft, krijgt bij het inloggen automatisch
-- beheerrechten op de site.
--
-- De kolom `source` houdt de twee wegen uit elkaar:
--   'manual'   met de hand toegevoegd in de SQL-editor. Blijft altijd staan.
--   'discord'  automatisch toegekend op basis van een rol. Verdwijnt weer
--              zodra iemand die rol in Discord kwijtraakt.
--
-- Die scheiding is met opzet: als het bot-token ooit stuk is of de Discord API
-- plat ligt, mag dat nooit de handmatige admins buitensluiten. Er is altijd een
-- sleutel die niet van Discord afhangt.
--
-- Uitvoeren NA 0005_rank_colors.sql. Idempotent.
-- ============================================================================

alter table public.admins
  add column if not exists source text not null default 'manual';

do $$
begin
  alter table public.admins
    add constraint admins_source_check check (source in ('manual', 'discord'));
exception
  when duplicate_object then null;
end;
$$;

comment on column public.admins.source is
  'manual = met de hand toegevoegd (blijft staan); discord = via rol toegekend (wordt gesynchroniseerd).';

-- Rijen die er al waren, zijn met de hand gezet.
update public.admins set source = 'manual' where source is null;

create index if not exists admins_source_idx on public.admins (source);

-- ****************************************************************************
-- *  DEEL 7 VAN 8  —  0007_fixes.sql
-- ****************************************************************************

-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migratie 0007: twee reparaties
--
-- A. De seed was niet idempotent.
-- B. Het /new-commando van de bot werkte niet.
--
-- WAT ER MIS WAS
-- De trigger die de slug invult, hoogde óók een slug op die al meegegeven was.
-- De seed geeft expliciet 'lahaye' mee; stond die al in de tabel, dan maakte de
-- trigger er stilletjes 'lahaye-2' van. Daardoor botste de rij nergens meer mee
-- en deed het ON CONFLICT (slug) DO NOTHING van de seed niets. Elke keer dat de
-- seed opnieuw draaide, kwam de hele ploeg er dus nog eens bij.
--
-- WAT DEZE MIGRATIE DOET
-- 1. Herstelt de trigger: een meegegeven slug blijft voortaan staan.
-- 2. Ruimt de dubbele leden op die er al door ontstaan zijn.
--
-- WAT ER MIS WAS MET /new
-- bot_add_member geeft een kolom `member_id` terug. In `on conflict
-- (member_id)` kon Postgres niet bepalen of dat die uitvoer of de kolom van de
-- tabel was, en brak af met "column reference member_id is ambiguous". Het
-- commando faalde dus altijd bij een nieuw lid.
--
-- Uitvoeren NA 0006. Idempotent, en veilig om te draaien ook als er nooit
-- duplicaten zijn geweest.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. De trigger
-- ---------------------------------------------------------------------------
create or replace function public.members_set_slug()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  base_slug text;
  candidate text;
  suffix    integer := 1;
begin
  -- Een expliciet meegegeven slug blijft staan zoals hij is.
  if new.slug is not null and btrim(new.slug) <> '' then
    new.slug := coalesce(public.slugify(new.slug), new.slug);
    return new;
  end if;

  -- Geen slug meegegeven (zo voegt de app leden toe): afleiden uit de naam en
  -- ophogen tot hij vrij is, zodat twee leden met dezelfde naam kunnen bestaan.
  base_slug := coalesce(public.slugify(new.name), 'lid');
  candidate := base_slug;

  while exists (
    select 1 from public.members m
    where m.slug = candidate and (tg_op = 'INSERT' or m.id <> new.id)
  ) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  new.slug := candidate;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. De dubbele leden
--
-- Bewust streng: een rij gaat alleen weg als hij onmiskenbaar een kopie van de
-- seed is — een slug die op "-<cijfer>" eindigt, terwijl er een lid met de
-- kale slug bestaat, met dezelfde naam en rang, zonder telefoonnummer,
-- avatar, joindatum of privégegevens. Een lid waar iemand iets aan heeft
-- ingevuld blijft dus hoe dan ook staan.
-- ---------------------------------------------------------------------------
do $$
declare
  v_verwijderd integer;
begin
  with kandidaten as (
    select dup.id
    from public.members dup
    join public.members orig
      on orig.slug = regexp_replace(dup.slug, '-[0-9]+$', '')
     and orig.id <> dup.id
    where dup.slug ~ '-[0-9]+$'
      and dup.name = orig.name
      and dup.rank = orig.rank
      and dup.phone is null
      and dup.avatar_url is null
      and dup.joined_at is null
      and dup.discord_username is null
      and not exists (
        select 1 from public.private_member_data p where p.member_id = dup.id
      )
  )
  delete from public.members m
  using kandidaten k
  where m.id = k.id;

  get diagnostics v_verwijderd = row_count;

  if v_verwijderd > 0 then
    raise notice 'Dubbele leden opgeruimd: %', v_verwijderd;
  else
    raise notice 'Geen dubbele leden gevonden.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Het /new-commando
-- ---------------------------------------------------------------------------
create or replace function public.bot_add_member(
  p_discord_user_id  text,
  p_name             text,
  p_discord_username text default null,
  p_rank             text default 'zazavao',
  p_avatar_url       text default null,
  p_actor            text default 'Discord bot'
)
returns table (member_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  v_created boolean := false;
  v_name    text := nullif(btrim(coalesce(p_name, '')), '');
  v_handle  text := nullif(btrim(ltrim(coalesce(p_discord_username, ''), '@')), '');
  v_avatar  text := nullif(btrim(coalesce(p_avatar_url, '')), '');
begin
  if current_user <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  if p_discord_user_id is null or p_discord_user_id !~ '^[0-9]{5,32}$' then
    raise exception 'Ongeldig Discord user ID' using errcode = '22023';
  end if;

  if v_name is null then
    raise exception 'Naam is verplicht' using errcode = '22023';
  end if;

  if not exists (select 1 from public.ranks r where r.key = p_rank) then
    raise exception 'Onbekende rang: %', p_rank using errcode = '22023';
  end if;

  perform set_config('app.actor_name', coalesce(nullif(btrim(p_actor), ''), 'Discord bot'), true);

  select d.member_id into v_id
  from public.private_member_data d
  where d.discord_user_id = p_discord_user_id
  limit 1;

  if v_id is null then
    insert into public.members (name, rank, discord_username, avatar_url)
    values (v_name, p_rank, v_handle, v_avatar)
    returning id into v_id;
    v_created := true;

    -- Op de primaire sleutel botsen, niet op de kolomnaam: `member_id` is hier
    -- ook de naam van een uitvoerkolom van deze functie.
    insert into public.private_member_data (member_id, discord_user_id, updated_at)
    values (v_id, p_discord_user_id, now())
    on conflict on constraint private_member_data_pkey do update
      set discord_user_id = excluded.discord_user_id,
          updated_at      = now();
  else
    update public.members
       set discord_username = coalesce(v_handle, discord_username),
           avatar_url       = coalesce(v_avatar, avatar_url)
     where id = v_id;
  end if;

  return query select v_id, v_created;
end;
$$;

revoke all on function public.bot_add_member(text, text, text, text, text, text) from public;
revoke all on function public.bot_add_member(text, text, text, text, text, text) from anon, authenticated;
grant execute on function public.bot_add_member(text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Controle
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_limit integer;
begin
  select count(*) into v_count from public.members;
  select member_limit into v_limit from public.settings where id = 1;
  raise notice 'Register bevat nu % leden (limiet %).', v_count, v_limit;
end;
$$;

-- ****************************************************************************
-- *  DEEL 8 VAN 8  —  0008_service_role_grants.sql
-- ****************************************************************************

-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migratie 0008: rechten voor de service-role
--
-- WAT ER MIS WAS
-- Staat "Automatically expose new tables" uit in Supabase (aan te raden), dan
-- krijgen nieuwe tabellen géén standaardrechten. Migratie 0002 deelde daarna
-- wel expliciet rechten uit aan anon en authenticated, maar niet aan
-- service_role — die zou ze immers "toch al hebben". Zonder die standaard
-- klopte die aanname niet en hield service_role nul rechten over.
--
-- Gevolg: server-side taken die met de service-role werken konden niets. De
-- Leader-rol uit Discord werd wel herkend, maar de beheerrechten konden niet
-- worden weggeschreven.
--
-- Uitvoeren NA 0007. Idempotent.
-- ============================================================================

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute       on all functions  in schema public to service_role;

-- Ook voor tabellen die later nog bijkomen.
alter default privileges in schema public grant all     on tables    to service_role;
alter default privileges in schema public grant all     on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- ---------------------------------------------------------------------------
-- Controle
-- ---------------------------------------------------------------------------
do $$
declare
  v_zonder_rechten text;
begin
  select string_agg(c.relname, ', ')
    into v_zonder_rechten
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not has_table_privilege('service_role', c.oid, 'INSERT');

  if v_zonder_rechten is null then
    raise notice 'Service-role heeft nu toegang tot alle tabellen.';
  else
    raise notice 'LET OP: nog steeds geen toegang tot: %', v_zonder_rechten;
  end if;
end;
$$;
