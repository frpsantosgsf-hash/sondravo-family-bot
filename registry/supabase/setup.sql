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
--  NIET MET DE HAND BEWERKEN. Dit bestand wordt samengesteld uit
--  supabase/migrations/ door `npm run build:setup`.
-- ============================================================================

-- ****************************************************************************
-- *  DEEL 1 VAN 16  —  0001_schema.sql
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
-- *  DEEL 2 VAN 16  —  0002_rls_policies.sql
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
-- *  DEEL 3 VAN 16  —  0003_seed.sql
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
--
-- Deze lijst vult ALLEEN een leeg register. Dat is geen detail: sinds de
-- rollen-sync bestaat wordt de ledenlijst gelijkgetrokken met Discord, en dan
-- verdwijnt er soms iemand. Zou dit bestand daarna nog een keer draaien, dan
-- stond die persoon er zo weer bij — met zijn oude rang, zonder dat iemand
-- daarom vroeg. `on conflict (slug)` vangt dat niet af, want zijn rij is dan
-- juist wég.
--
-- Staat er al iemand in het register, dan doet dit blok dus niets, en is
-- setup.sql werkelijk zo veilig om opnieuw te draaien als hij belooft.
-- ---------------------------------------------------------------------------
insert into public.members (slug, name, rank)
select v.slug, v.name, v.rank
  from (values
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
) as v(slug, name, rank)
 where not exists (select 1 from public.members)
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
-- *  DEEL 4 VAN 16  —  0004_bot_bridge.sql
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
-- *  DEEL 5 VAN 16  —  0005_rank_colors.sql
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
-- *  DEEL 6 VAN 16  —  0006_discord_admin_roles.sql
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
-- *  DEEL 7 VAN 16  —  0007_fixes.sql
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
-- *  DEEL 8 VAN 16  —  0008_service_role_grants.sql
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


-- ****************************************************************************
-- *  DEEL 9 VAN 16  —  0009_applications.sql
-- ****************************************************************************

-- =============================================================================
-- 0009 — Sollicitaties
--
-- Bezoekers loggen in met Discord en vullen een formulier in. Alleen Lead/Admin
-- mag die sollicitaties lezen en afhandelen; de inzender zelf ziet alleen zijn
-- eigen inzending terug.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

create table if not exists public.applications (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Wie stuurde dit in? Komt uit de sessie, niet uit het formulier, zodat
  -- niemand zich als een ander kan voordoen.
  auth_user_id         uuid not null,
  discord_user_id      text,
  discord_username     text,
  discord_display_name text,
  avatar_url           text,

  -- Het formulier zelf.
  name                 text not null,
  age                  integer,
  phone                text,
  motivation           text not null,
  experience           text,
  availability         text,

  -- Afhandeling door de Lead.
  status               text not null default 'nieuw',
  handled_by           text,
  handled_at           timestamptz,
  admin_note           text,

  constraint applications_status_check
    check (status in ('nieuw', 'in_behandeling', 'aangenomen', 'afgewezen')),
  constraint applications_name_check
    check (btrim(name) <> '' and char_length(name) <= 64),
  constraint applications_motivation_check
    check (btrim(motivation) <> '' and char_length(motivation) <= 2000),
  constraint applications_age_check
    check (age is null or (age between 10 and 99))
);

create index if not exists applications_status_created_idx
  on public.applications (status, created_at desc);

-- Eén openstaande sollicitatie per persoon. Wie is afgewezen of aangenomen
-- mag het later opnieuw proberen; wie nog wacht kan niet gaan spammen.
create unique index if not exists applications_one_open_per_user_idx
  on public.applications (auth_user_id)
  where status in ('nieuw', 'in_behandeling');

-- -----------------------------------------------------------------------------
-- updated_at bijhouden
-- -----------------------------------------------------------------------------
create or replace function public.applications_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists applications_touch_trg on public.applications;
create trigger applications_touch_trg
  before update on public.applications
  for each row execute function public.applications_touch();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.applications enable row level security;

revoke all on public.applications from anon, authenticated;
grant select, update on public.applications to authenticated;

-- Let op: 'insert' staat hier bewust niet bij. Insturen loopt via
-- submit_application(), die alleen de server mag aanroepen. Zo kan niemand
-- het formulier overslaan en rechtstreeks een rij wegschrijven — de
-- rolcontrole in Discord zou daarmee omzeild zijn.
drop policy if exists "applications public read" on public.applications;
drop policy if exists "applications own insert" on public.applications;

-- Lead/Admin ziet alles.
drop policy if exists "applications admin read" on public.applications;
create policy "applications admin read"
  on public.applications for select
  to authenticated
  using (public.is_admin());

-- De inzender ziet zijn eigen inzending, zodat de site kan tonen dat hij al
-- iets heeft ingestuurd. Verder niets van anderen.
drop policy if exists "applications own read" on public.applications;
create policy "applications own read"
  on public.applications for select
  to authenticated
  using (auth_user_id = auth.uid());

-- Afhandelen is voorbehouden aan Lead/Admin.
drop policy if exists "applications admin update" on public.applications;
create policy "applications admin update"
  on public.applications for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Insturen
--
-- SECURITY DEFINER, maar afgeschermd met een harde rolcheck: alleen
-- service_role mag hem uitvoeren. De server roept hem aan nádat hij heeft
-- gecontroleerd dat de bezoeker is ingelogd én de juiste Discord-rol draagt.
-- -----------------------------------------------------------------------------
create or replace function public.submit_application(
  p_auth_user_id         uuid,
  p_name                 text,
  p_motivation           text,
  p_discord_user_id      text default null,
  p_discord_username     text default null,
  p_discord_display_name text default null,
  p_avatar_url           text default null,
  p_age                  integer default null,
  p_phone                text default null,
  p_experience           text default null,
  p_availability         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- Let op: bij SECURITY DEFINER is current_user de EIGENAAR van de functie,
  -- niet de aanroeper. De rol die PostgREST heeft gezet staat in de
  -- 'role'-instelling; current_user dient als terugval voor psql en de
  -- SQL Editor. De echte grendel is de grant hieronder: alleen service_role
  -- mag deze functie überhaupt uitvoeren.
  if coalesce(current_setting('role', true), '') not in ('service_role', 'postgres')
     and current_user not in ('service_role', 'postgres') then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  if p_auth_user_id is null then
    raise exception 'Geen gebruiker' using errcode = '22023';
  end if;

  insert into public.applications (
    auth_user_id, discord_user_id, discord_username, discord_display_name,
    avatar_url, name, age, phone, motivation, experience, availability
  )
  values (
    p_auth_user_id,
    nullif(btrim(coalesce(p_discord_user_id, '')), ''),
    nullif(btrim(coalesce(p_discord_username, '')), ''),
    nullif(btrim(coalesce(p_discord_display_name, '')), ''),
    nullif(btrim(coalesce(p_avatar_url, '')), ''),
    btrim(p_name),
    p_age,
    nullif(btrim(coalesce(p_phone, '')), ''),
    btrim(p_motivation),
    nullif(btrim(coalesce(p_experience, '')), ''),
    nullif(btrim(coalesce(p_availability, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_application(
  uuid, text, text, text, text, text, text, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.submit_application(
  uuid, text, text, text, text, text, text, integer, text, text, text
) to service_role;

-- -----------------------------------------------------------------------------
-- Afhandelen via een functie, zodat de controle naast de schrijfactie staat
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_application_status(
  p_id     uuid,
  p_status text,
  p_note   text default null
)
returns public.applications
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.applications;
begin
  if not public.is_admin() then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  if p_status not in ('nieuw', 'in_behandeling', 'aangenomen', 'afgewezen') then
    raise exception 'Onbekende status: %', p_status using errcode = '22023';
  end if;

  update public.applications
     set status     = p_status,
         admin_note = nullif(btrim(coalesce(p_note, '')), ''),
         handled_by = public.current_admin_name(),
         handled_at = now()
   where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Sollicitatie niet gevonden' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_set_application_status(uuid, text, text) from public;
grant execute on function public.admin_set_application_status(uuid, text, text) to authenticated;

-- Service role mag alles, net als bij de andere tabellen.
grant all privileges on public.applications to service_role;

notify pgrst, 'reload schema';


-- ****************************************************************************
-- *  DEEL 10 VAN 16  —  0010_private_registry.sql
-- ****************************************************************************

-- =============================================================================
-- 0010 — De ledenlijst is niet langer openbaar
--
-- Tot nu toe kon iedereen met de link de hele ledenlijst lezen, inclusief de
-- ingame telefoonnummers. Dat hoort bij een besloten familie niet zo: wie wil
-- solliciteren moet het formulier kunnen bereiken, maar niet de lijst zelf.
--
-- Vanaf nu ziet alleen iemand die zélf op de lijst staat (of Lead/Admin is)
-- de leden. De koppeling loopt via het Discord-account: staat jouw Discord-ID
-- in private_member_data, dan ben je familie.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Het Discord-ID van de ingelogde bezoeker
--
--    Supabase zet de Discord-identiteit in de JWT. provider_id is het
--    Discord-account-ID; sub is de terugval voor oudere sessies.
-- ---------------------------------------------------------------------------
create or replace function public.current_discord_user_id()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select nullif(btrim(coalesce(
    auth.jwt() -> 'user_metadata' ->> 'provider_id',
    auth.jwt() -> 'user_metadata' ->> 'sub',
    ''
  )), '');
$$;

comment on function public.current_discord_user_id() is
  'Het Discord-account-ID van de ingelogde bezoeker, of null.';

-- ---------------------------------------------------------------------------
-- 2. Staat deze bezoeker zelf op de ledenlijst?
--
--    SECURITY DEFINER omdat private_member_data zelf alleen voor admins
--    leesbaar is. De functie geeft nooit gegevens terug, alleen ja of nee.
-- ---------------------------------------------------------------------------
create or replace function public.is_family_member()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_discord_id text := public.current_discord_user_id();
begin
  if v_discord_id is null then
    return false;
  end if;

  return exists (
    select 1
      from public.private_member_data p
     where p.discord_user_id = v_discord_id
  );
end;
$$;

comment on function public.is_family_member() is
  'True wanneer het Discord-account van de ingelogde bezoeker aan een lid hangt.';

revoke all on function public.is_family_member() from public;
grant execute on function public.is_family_member() to authenticated, service_role;

revoke all on function public.current_discord_user_id() from public;
grant execute on function public.current_discord_user_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. De ledenlijst zelf
-- ---------------------------------------------------------------------------
drop policy if exists members_public_read on public.members;
drop policy if exists members_family_read on public.members;
create policy members_family_read
  on public.members for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

-- anon had leesrecht via de oude policy; dat trekken we ook op tabelniveau in.
revoke select on public.members from anon;

-- ---------------------------------------------------------------------------
-- 4. Rangen blijven leesbaar voor wie is ingelogd
--
--    Namen en kleuren van rangen zijn op zichzelf niets waard, maar er is
--    geen reden ze aan de hele wereld te tonen nu de lijst dicht is.
-- ---------------------------------------------------------------------------
drop policy if exists ranks_public_read on public.ranks;
drop policy if exists ranks_signed_in_read on public.ranks;
create policy ranks_signed_in_read
  on public.ranks for select
  to authenticated
  using (true);

revoke select on public.ranks from anon;

-- ---------------------------------------------------------------------------
-- 5. Instellingen
--
--    Familienaam en maximum blijven voor iedereen leesbaar: de voorpagina
--    toont die naam, en daar is niets gevoeligs aan. Het aantal leden komt
--    uit members en is dus vanzelf afgeschermd.
-- ---------------------------------------------------------------------------
-- (settings_public_read blijft zoals hij was)

notify pgrst, 'reload schema';


-- ****************************************************************************
-- *  DEEL 11 VAN 16  —  0011_fix_submit_application.sql
-- ****************************************************************************

-- =============================================================================
-- 0011 — Herstel van de rolcheck in submit_application
--
-- De functie is SECURITY DEFINER, en daarbij wijst current_user naar de
-- EIGENAAR van de functie in plaats van naar wie hem aanroept. De controle
-- "current_user <> 'service_role'" sloeg daardoor altijd aan, ook wanneer de
-- server het keurig volgens het boekje deed. Insturen mislukte dus altijd.
--
-- De rol die PostgREST zet staat in de 'role'-instelling; die blijft wél
-- overeind binnen een SECURITY DEFINER-functie. current_user dient als
-- terugval voor psql en de SQL Editor.
--
-- De echte grendel was en blijft de grant onderaan: alleen service_role mag
-- deze functie uitvoeren. De check erin is de tweede sluiting.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

create or replace function public.submit_application(
  p_auth_user_id         uuid,
  p_name                 text,
  p_motivation           text,
  p_discord_user_id      text default null,
  p_discord_username     text default null,
  p_discord_display_name text default null,
  p_avatar_url           text default null,
  p_age                  integer default null,
  p_phone                text default null,
  p_experience           text default null,
  p_availability         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(current_setting('role', true), '') not in ('service_role', 'postgres')
     and current_user not in ('service_role', 'postgres') then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  if p_auth_user_id is null then
    raise exception 'Geen gebruiker' using errcode = '22023';
  end if;

  insert into public.applications (
    auth_user_id, discord_user_id, discord_username, discord_display_name,
    avatar_url, name, age, phone, motivation, experience, availability
  )
  values (
    p_auth_user_id,
    nullif(btrim(coalesce(p_discord_user_id, '')), ''),
    nullif(btrim(coalesce(p_discord_username, '')), ''),
    nullif(btrim(coalesce(p_discord_display_name, '')), ''),
    nullif(btrim(coalesce(p_avatar_url, '')), ''),
    btrim(p_name),
    p_age,
    nullif(btrim(coalesce(p_phone, '')), ''),
    btrim(p_motivation),
    nullif(btrim(coalesce(p_experience, '')), ''),
    nullif(btrim(coalesce(p_availability, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_application(
  uuid, text, text, text, text, text, text, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.submit_application(
  uuid, text, text, text, text, text, text, integer, text, text, text
) to service_role;

notify pgrst, 'reload schema';


-- ****************************************************************************
-- *  DEEL 12 VAN 16  —  0012_application_votes.sql
-- ****************************************************************************

-- =============================================================================
-- 0012 — Leden stemmen over een sollicitatie
--
-- Een sollicitatie die binnenkomt is voortaan ook voor de leden zichtbaar,
-- zolang hij openstaat. Iedereen die op de ledenlijst staat mag één keer een
-- duim omhoog of omlaag geven; de Lead beslist uiteindelijk.
--
-- Afgehandelde sollicitaties verdwijnen weer uit beeld voor de leden. Wie is
-- afgewezen hoeft dat niet voor altijd in de familie te laten rondslingeren.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

create table if not exists public.application_votes (
  application_id uuid not null references public.applications(id) on delete cascade,
  voter_id       uuid not null,
  vote           text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  primary key (application_id, voter_id),
  constraint application_votes_vote_check check (vote in ('ja', 'nee'))
);

create index if not exists application_votes_application_idx
  on public.application_votes (application_id);

create or replace function public.application_votes_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists application_votes_touch_trg on public.application_votes;
create trigger application_votes_touch_trg
  before update on public.application_votes
  for each row execute function public.application_votes_touch();

-- ---------------------------------------------------------------------------
-- Leden mogen een openstaande sollicitatie zien
--
-- Alleen zolang hij open is. Zodra de Lead hem aanneemt of afwijst, valt hij
-- weer uit beeld bij de leden; de Lead houdt de volledige geschiedenis.
-- ---------------------------------------------------------------------------
drop policy if exists "applications family read" on public.applications;
create policy "applications family read"
  on public.applications for select
  to authenticated
  using (
    public.is_family_member()
    and status in ('nieuw', 'in_behandeling')
  );

-- ---------------------------------------------------------------------------
-- De stemmen zelf
-- ---------------------------------------------------------------------------
alter table public.application_votes enable row level security;

revoke all on public.application_votes from anon, authenticated;
grant select, insert, update, delete on public.application_votes to authenticated;

-- Leden en Leads zien de stand. Dat iedereen elkaars stem kan tellen is de
-- bedoeling: het gaat om een gezamenlijk oordeel, niet om een geheime stemming.
drop policy if exists "application_votes read" on public.application_votes;
create policy "application_votes read"
  on public.application_votes for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

-- Stemmen doe je op je eigen naam, en alleen als je bij de familie hoort.
drop policy if exists "application_votes insert" on public.application_votes;
create policy "application_votes insert"
  on public.application_votes for insert
  to authenticated
  with check (
    voter_id = auth.uid()
    and (public.is_admin() or public.is_family_member())
  );

-- Van gedachten veranderen mag, maar alleen over je eigen stem.
drop policy if exists "application_votes update" on public.application_votes;
create policy "application_votes update"
  on public.application_votes for update
  to authenticated
  using (voter_id = auth.uid())
  with check (
    voter_id = auth.uid()
    and (public.is_admin() or public.is_family_member())
  );

drop policy if exists "application_votes delete" on public.application_votes;
create policy "application_votes delete"
  on public.application_votes for delete
  to authenticated
  using (voter_id = auth.uid());

grant all privileges on public.application_votes to service_role;

notify pgrst, 'reload schema';


-- ****************************************************************************
-- *  DEEL 13 VAN 16  —  0013_applications_lifecycle.sql
-- ****************************************************************************

-- =============================================================================
-- 0013 — Stemming sluiten, archiveren, en de deur op slot
--
-- Drie dingen die de Lead erbij krijgt:
--
--   1. De stemming sluiten. De stand blijft staan als verantwoording, maar
--      niemand kan er nog iets aan veranderen.
--   2. Archiveren. De sollicitatie verdwijnt uit beeld bij de leden en komt in
--      een archief dat alleen de Lead ziet. Er wordt niets echt weggegooid:
--      een besluit over een mens hoort terug te vinden te zijn.
--   3. De sollicitaties helemaal sluiten. Zitten we vol, dan hoeft er geen
--      formulier meer binnen te komen.
--
-- De ID's van de Discord-berichten worden bewaard, zodat die bij het
-- archiveren ook uit het kanaal verdwijnen.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

alter table public.applications
  add column if not exists voting_closed             boolean not null default false,
  add column if not exists archived_at               timestamptz,
  add column if not exists archived_by               text,
  add column if not exists discord_message_id        text,
  add column if not exists discord_status_message_id text;

create index if not exists applications_archived_idx
  on public.applications (archived_at);

alter table public.settings
  add column if not exists applications_open boolean not null default true;

-- ---------------------------------------------------------------------------
-- Leden zien alleen wat openstaat én niet gearchiveerd is
-- ---------------------------------------------------------------------------
drop policy if exists "applications family read" on public.applications;
create policy "applications family read"
  on public.applications for select
  to authenticated
  using (
    public.is_family_member()
    and archived_at is null
    and status in ('nieuw', 'in_behandeling')
  );

-- ---------------------------------------------------------------------------
-- Stemmen kan niet meer op een gesloten, besliste of gearchiveerde sollicitatie
--
-- Dit staat in de policy en niet alleen in de knop: anders kan iemand die het
-- adres kent alsnog stemmen nadat de Lead de stemming heeft gesloten.
-- ---------------------------------------------------------------------------
create or replace function public.application_accepts_votes(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.applications a
     where a.id = p_id
       and a.archived_at is null
       and a.voting_closed = false
       and a.status in ('nieuw', 'in_behandeling')
  );
$$;

revoke all on function public.application_accepts_votes(uuid) from public;
grant execute on function public.application_accepts_votes(uuid) to authenticated, service_role;

drop policy if exists "application_votes insert" on public.application_votes;
create policy "application_votes insert"
  on public.application_votes for insert
  to authenticated
  with check (
    voter_id = auth.uid()
    and (public.is_admin() or public.is_family_member())
    and public.application_accepts_votes(application_id)
  );

drop policy if exists "application_votes update" on public.application_votes;
create policy "application_votes update"
  on public.application_votes for update
  to authenticated
  using (voter_id = auth.uid())
  with check (
    voter_id = auth.uid()
    and (public.is_admin() or public.is_family_member())
    and public.application_accepts_votes(application_id)
  );

drop policy if exists "application_votes delete" on public.application_votes;
create policy "application_votes delete"
  on public.application_votes for delete
  to authenticated
  using (voter_id = auth.uid() and public.application_accepts_votes(application_id));

-- ---------------------------------------------------------------------------
-- De stemming openen of sluiten
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_voting_closed(
  p_id     uuid,
  p_closed boolean
)
returns public.applications
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.applications;
begin
  if not public.is_admin() then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  update public.applications
     set voting_closed = coalesce(p_closed, false)
   where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Sollicitatie niet gevonden' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_set_voting_closed(uuid, boolean) from public;
grant execute on function public.admin_set_voting_closed(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Archiveren
--
-- Bewust geen delete: wie is afgewezen of aangenomen hoort terug te vinden te
-- zijn, met de stemmen erbij. Alleen de Lead komt in het archief.
-- ---------------------------------------------------------------------------
create or replace function public.admin_archive_application(p_id uuid)
returns public.applications
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.applications;
begin
  if not public.is_admin() then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  update public.applications
     set archived_at   = now(),
         archived_by   = public.current_admin_name(),
         voting_closed = true
   where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Sollicitatie niet gevonden' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_archive_application(uuid) from public;
grant execute on function public.admin_archive_application(uuid) to authenticated;

-- Het ID van een Discord-bericht wordt door de server bijgewerkt, niet door
-- de browser. Vandaar service_role.
create or replace function public.set_application_discord_message(
  p_id                uuid,
  p_message_id        text default null,
  p_status_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('role', true), '') not in ('service_role', 'postgres')
     and current_user not in ('service_role', 'postgres') then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  update public.applications
     set discord_message_id        = coalesce(p_message_id, discord_message_id),
         discord_status_message_id = coalesce(p_status_message_id, discord_status_message_id)
   where id = p_id;
end;
$$;

revoke all on function public.set_application_discord_message(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_application_discord_message(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Sollicitaties open of dicht
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_applications_open(p_open boolean)
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

  update public.settings
     set applications_open = coalesce(p_open, true),
         updated_at        = now()
   where id = 1
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.admin_set_applications_open(boolean) from public;
grant execute on function public.admin_set_applications_open(boolean) to authenticated;

notify pgrst, 'reload schema';


-- ****************************************************************************
-- *  DEEL 14 VAN 16  —  0014_review_fixes.sql
-- ****************************************************************************

-- =============================================================================
-- 0014 — Twee gaten uit de review
--
--   1. Een gearchiveerde sollicitatie blokkeerde de inzender voor altijd. De
--      "één openstaande per persoon"-regel keek alleen naar de status, niet
--      naar het archief. Archiveerde de Lead iets dat nog op 'nieuw' stond,
--      dan kon die persoon nooit meer solliciteren: zijn oude rij bleef in de
--      weg staan terwijl niemand hem nog kon zien of afhandelen.
--
--   2. Elke statuswijziging wiste de interne notitie. De route stuurt geen
--      notitie mee, en de functie schreef die null er onvoorwaardelijk
--      overheen.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Gearchiveerd telt niet meer als "openstaand"
-- ---------------------------------------------------------------------------
drop index if exists public.applications_one_open_per_user_idx;

create unique index if not exists applications_one_open_per_user_idx
  on public.applications (auth_user_id)
  where status in ('nieuw', 'in_behandeling') and archived_at is null;

-- ---------------------------------------------------------------------------
-- 2. Een notitie blijft staan tenzij er een nieuwe wordt meegegeven
--
--    Leegmaken kan hiermee niet meer, en dat is de juiste afweging: per
--    ongeluk wissen gebeurt vaak, bewust leegmaken vrijwel nooit.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_application_status(
  p_id     uuid,
  p_status text,
  p_note   text default null
)
returns public.applications
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row  public.applications;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  if p_status not in ('nieuw', 'in_behandeling', 'aangenomen', 'afgewezen') then
    raise exception 'Onbekende status: %', p_status using errcode = '22023';
  end if;

  update public.applications
     set status     = p_status,
         admin_note = coalesce(v_note, admin_note),
         handled_by = public.current_admin_name(),
         handled_at = now()
   where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Sollicitatie niet gevonden' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_set_application_status(uuid, text, text) from public;
grant execute on function public.admin_set_application_status(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';


-- ****************************************************************************
-- *  DEEL 15 VAN 16  —  0015_review_fixes_2.sql
-- ****************************************************************************

-- =============================================================================
-- 0015 — Nog twee dingen uit de tweede review
--
--   1. bot_add_member en bot_remove_member dragen nog dezelfde kapotte
--      rolcheck die 0011 voor submit_application heeft rechtgezet. Bij
--      SECURITY DEFINER wijst current_user naar de eigenaar van de functie,
--      niet naar wie hem aanroept, dus die controle beoordeelt nooit de
--      aanroeper. De grant is op dit moment de enige echte grendel. Dat werkt,
--      maar het is één ongelukkige regel elders van "iedere ingelogde bezoeker
--      mag bot_remove_member aanroepen en elk lid verwijderen".
--
--      Alleen die ene regel verandert. De rest van beide functies is letterlijk
--      overgenomen uit 0007 en 0004, zodat /new en /verwijder zich precies
--      hetzelfde blijven gedragen.
--
--   2. discord_status_message_id kan nooit gevuld worden, omdat de setter beide
--      ID's tegen hun huidige waarde coalesceert. Erger: na het archiveren
--      blijft het ID van een verwijderd bericht staan, waarna een latere
--      bewerking een bericht probeert bij te werken dat niet meer bestaat.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. De rolcheck in de bot-functies
--
--    current_setting('role') blijft wél overeind binnen een SECURITY
--    DEFINER-functie; current_user is de terugval voor psql en de SQL Editor.
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
  if coalesce(current_setting('role', true), '') not in ('service_role', 'postgres')
     and current_user not in ('service_role', 'postgres') then
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

revoke all on function public.bot_add_member(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.bot_add_member(text, text, text, text, text, text) to service_role;

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
  if coalesce(current_setting('role', true), '') not in ('service_role', 'postgres')
     and current_user not in ('service_role', 'postgres') then
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

revoke all on function public.bot_remove_member(text, text) from public, anon, authenticated;
grant execute on function public.bot_remove_member(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Het bericht-ID moet ook leeggemaakt kunnen worden
--
--    p_clear onderscheidt "laat staan" van "maak leeg". Zonder dat verschil
--    blijft na het archiveren een ID staan dat naar een verwijderd bericht
--    wijst, en probeert een latere bewerking dat bericht bij te werken.
-- ---------------------------------------------------------------------------
drop function if exists public.set_application_discord_message(uuid, text, text);

create or replace function public.set_application_discord_message(
  p_id                uuid,
  p_message_id        text default null,
  p_status_message_id text default null,
  p_clear             boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('role', true), '') not in ('service_role', 'postgres')
     and current_user not in ('service_role', 'postgres') then
    raise exception 'Niet geautoriseerd' using errcode = '42501';
  end if;

  if p_clear then
    update public.applications
       set discord_message_id        = null,
           discord_status_message_id = null
     where id = p_id;
    return;
  end if;

  update public.applications
     set discord_message_id        = coalesce(p_message_id, discord_message_id),
         discord_status_message_id = coalesce(p_status_message_id, discord_status_message_id)
   where id = p_id;
end;
$$;

revoke all on function public.set_application_discord_message(uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.set_application_discord_message(uuid, text, text, boolean)
  to service_role;

notify pgrst, 'reload schema';


-- ****************************************************************************
-- *  DEEL 16 VAN 16  —  0016_gangpot.sql
-- ****************************************************************************

-- =============================================================================
-- 0016 — De gangpot
--
-- Elke vrijdag legt ieder lid hetzelfde bedrag in, de Lead boekt de uitgaven,
-- en het saldo rolt eruit. Tot nu toe stond dat in een spreadsheet; vanaf nu
-- in de database, met dezelfde sloten als de rest van de site.
--
-- Drie keuzes die de rest verklaren:
--
--   1. Een rij in pot_contributions betekent "betaald". Geen rij betekent
--      "nog niet". Zo staan er geen honderden lege cellen in de tabel en
--      groeit het overzicht vanzelf mee met elke nieuwe week.
--
--   2. Het saldo wordt nergens opgeslagen. Het is altijd
--      beginsaldo + ontvangen + inkomsten - uitgaven, uitgerekend op het
--      moment dat je kijkt. Een opgeslagen saldo gaat vroeg of laat afwijken
--      van de regels eronder, en dan weet niemand meer welke van de twee
--      klopt.
--
--   3. member_id mag leeg worden, member_name niet. Verlaat iemand de
--      familie, dan haalt de nachtelijke rollen-sync hem uit members — maar
--      zijn betalingen blijven met naam in de boeken staan. De spreadsheet
--      waarschuwde daar zelf voor ("Verwijder geen leden met een
--      betaalhistorie"); hier kan het gewoon niet meer misgaan.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Instellingen van de pot
-- ---------------------------------------------------------------------------
create table if not exists public.pot_settings (
  id              smallint primary key default 1 check (id = 1),
  -- Wat er in de pot zat vóór deze administratie begon.
  opening_balance bigint      not null default 0,
  -- De vaste wekelijkse bijdrage per lid.
  weekly_amount   bigint      not null default 50000 check (weekly_amount > 0),
  -- De eerste vrijdag die meetelt.
  first_friday    date        not null default date '2026-09-04',
  updated_at      timestamptz not null default now()
);

insert into public.pot_settings (id) values (1) on conflict (id) do nothing;

comment on table public.pot_settings is
  'Eenmalige instellingen van de gangpot. Altijd precies één rij (id = 1).';

-- ---------------------------------------------------------------------------
-- 2. De wekelijkse bijdragen
--
--    De sleutel is (lid, vrijdag): twee keer afvinken maakt geen tweede rij.
--    Voor wie de familie verlaat regelt de index zichzelf: member_id wordt dan
--    null, en twee null-waarden botsen in Postgres nooit. Die oude rijen zitten
--    elkaar dus niet in de weg, zonder dat de index partieel hoeft te zijn —
--    en dat scheelt, want een partiële index kan Postgres niet afleiden bij een
--    upsert, waardoor afvinken zou stuklopen op "no unique constraint matching".
-- ---------------------------------------------------------------------------
create table if not exists public.pot_contributions (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid references public.members (id) on delete set null,
  -- Momentopname van de naam, zodat de boeken leesbaar blijven na vertrek.
  member_name text,
  week_friday date   not null check (extract(isodow from week_friday) = 5),
  amount      bigint not null check (amount > 0),
  marked_by   text,
  marked_at   timestamptz not null default now()
);

drop index if exists public.pot_contributions_unique_idx;

create unique index if not exists pot_contributions_unique_idx
  on public.pot_contributions (member_id, week_friday);

create index if not exists pot_contributions_week_idx
  on public.pot_contributions (week_friday);

comment on table public.pot_contributions is
  'Eén rij per betaalde week per lid. Geen rij = niet betaald.';

-- ---------------------------------------------------------------------------
-- 3. Uitgaven en overige inkomsten
--
--    Twee tabellen met dezelfde vorm in plaats van één tabel met een
--    plus/min-kolom: dan kan een tikfout in het teken nooit een uitgave in
--    een inkomst veranderen.
-- ---------------------------------------------------------------------------
create table if not exists public.pot_expenses (
  id          uuid primary key default gen_random_uuid(),
  spent_on    date   not null default current_date,
  description text   not null check (btrim(description) <> ''),
  -- Wie het uit eigen zak heeft voorgeschoten of uit de pot betaald heeft.
  paid_by     text,
  amount      bigint not null check (amount > 0),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists pot_expenses_date_idx on public.pot_expenses (spent_on desc);

create table if not exists public.pot_income (
  id          uuid primary key default gen_random_uuid(),
  received_on date   not null default current_date,
  description text   not null check (btrim(description) <> ''),
  -- Waar het vandaan kwam: een deal, een boete, een teruggave.
  source      text,
  amount      bigint not null check (amount > 0),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists pot_income_date_idx on public.pot_income (received_on desc);

comment on table public.pot_expenses is 'Geld dat uit de gangpot is betaald.';
comment on table public.pot_income  is 'Geld dat in de pot kwam buiten de wekelijkse bijdragen om.';

-- ---------------------------------------------------------------------------
-- 4. Wat de database zelf invult
--
--    Naam, bedrag en "wie vinkte af" komen niet uit de browser. Het bedrag
--    is de vaste bijdrage uit de instellingen — deelbetalingen kent dit
--    overzicht bewust niet, precies zoals in de spreadsheet.
-- ---------------------------------------------------------------------------
create or replace function public.pot_contributions_fill()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(new.member_name, '')), '') is null then
    select m.name into new.member_name from public.members m where m.id = new.member_id;
  end if;

  if nullif(btrim(coalesce(new.member_name, '')), '') is null then
    raise exception 'Onbekend lid' using errcode = '22023';
  end if;

  if new.amount is null then
    select s.weekly_amount into new.amount from public.pot_settings s where s.id = 1;
  end if;

  if nullif(btrim(coalesce(new.marked_by, '')), '') is null then
    new.marked_by := public.current_admin_name();
  end if;

  return new;
end;
$$;

drop trigger if exists pot_contributions_fill_trg on public.pot_contributions;
create trigger pot_contributions_fill_trg
  before insert on public.pot_contributions
  for each row execute function public.pot_contributions_fill();

create or replace function public.pot_entry_fill()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and nullif(btrim(coalesce(new.created_by, '')), '') is null then
    new.created_by := public.current_admin_name();
  end if;
  return new;
end;
$$;

drop trigger if exists pot_expenses_fill_trg on public.pot_expenses;
create trigger pot_expenses_fill_trg
  before insert on public.pot_expenses
  for each row execute function public.pot_entry_fill();

drop trigger if exists pot_income_fill_trg on public.pot_income;
create trigger pot_income_fill_trg
  before insert on public.pot_income
  for each row execute function public.pot_entry_fill();

drop trigger if exists pot_expenses_updated_at_trg on public.pot_expenses;
create trigger pot_expenses_updated_at_trg
  before update on public.pot_expenses
  for each row execute function public.set_updated_at();

drop trigger if exists pot_income_updated_at_trg on public.pot_income;
create trigger pot_income_updated_at_trg
  before update on public.pot_income
  for each row execute function public.set_updated_at();

drop trigger if exists pot_settings_updated_at_trg on public.pot_settings;
create trigger pot_settings_updated_at_trg
  before update on public.pot_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Geschiedenis
--
--    Kasboekhouding zonder logboek is een geloofskwestie. Elke afvink, elke
--    uitgave en elke wijziging aan de instellingen komt in dezelfde history
--    die de ledenlijst al gebruikt — geschreven door de database, dus ook
--    wanneer iemand rechtstreeks in de SQL-editor iets aanpast.
-- ---------------------------------------------------------------------------
create or replace function public.log_pot_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old  jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new  jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_both jsonb := coalesce(v_new, v_old);
  v_verb text;
begin
  -- Een aanraking die alleen updated_at verzette is geen geschiedenis.
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;

  v_verb := case tg_op
    when 'INSERT' then 'added'
    when 'DELETE' then 'removed'
    else 'updated'
  end;

  insert into public.audit_logs
    (admin_user_id, admin_name, member_id, member_name, action, old_value, new_value)
  values (
    auth.uid(),
    public.current_admin_name(),
    nullif(v_both ->> 'member_id', '')::uuid,
    v_both ->> 'member_name',
    tg_argv[0] || '.' || v_verb,
    v_old,
    v_new
  );

  -- AFTER-trigger: de retourwaarde doet niets, en bij DELETE bestaat new niet.
  return null;
end;
$$;

drop trigger if exists pot_contributions_audit_trg on public.pot_contributions;
create trigger pot_contributions_audit_trg
  after insert or update or delete on public.pot_contributions
  for each row execute function public.log_pot_change('pot.contribution');

drop trigger if exists pot_expenses_audit_trg on public.pot_expenses;
create trigger pot_expenses_audit_trg
  after insert or update or delete on public.pot_expenses
  for each row execute function public.log_pot_change('pot.expense');

drop trigger if exists pot_income_audit_trg on public.pot_income;
create trigger pot_income_audit_trg
  after insert or update or delete on public.pot_income
  for each row execute function public.log_pot_change('pot.income');

drop trigger if exists pot_settings_audit_trg on public.pot_settings;
create trigger pot_settings_audit_trg
  after update on public.pot_settings
  for each row execute function public.log_pot_change('pot.settings');

-- ---------------------------------------------------------------------------
-- 6. Rechten
--
--    anon krijgt niets — zelfs geen leesrecht. De gangpot is interne
--    administratie van een besloten familie en heeft op een openbare pagina
--    niets te zoeken. De grants hieronder zijn de eerste grendel; de policies
--    daarna versmallen ze verder tot "familie leest, Lead schrijft".
-- ---------------------------------------------------------------------------
revoke all on public.pot_settings      from anon, authenticated;
revoke all on public.pot_contributions from anon, authenticated;
revoke all on public.pot_expenses      from anon, authenticated;
revoke all on public.pot_income        from anon, authenticated;

grant select on public.pot_settings      to authenticated;
grant select on public.pot_contributions to authenticated;
grant select on public.pot_expenses      to authenticated;
grant select on public.pot_income        to authenticated;

grant update                 on public.pot_settings      to authenticated;
grant insert, delete         on public.pot_contributions to authenticated;
grant insert, update, delete on public.pot_expenses      to authenticated;
grant insert, update, delete on public.pot_income        to authenticated;

alter table public.pot_settings      enable row level security;
alter table public.pot_contributions enable row level security;
alter table public.pot_expenses      enable row level security;
alter table public.pot_income        enable row level security;

-- --- lezen: wie zelf op de ledenlijst staat, plus de Lead --------------------
drop policy if exists pot_settings_family_read on public.pot_settings;
create policy pot_settings_family_read
  on public.pot_settings for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

drop policy if exists pot_contributions_family_read on public.pot_contributions;
create policy pot_contributions_family_read
  on public.pot_contributions for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

drop policy if exists pot_expenses_family_read on public.pot_expenses;
create policy pot_expenses_family_read
  on public.pot_expenses for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

drop policy if exists pot_income_family_read on public.pot_income;
create policy pot_income_family_read
  on public.pot_income for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

-- --- schrijven: uitsluitend de Lead -----------------------------------------
drop policy if exists pot_settings_admin_update on public.pot_settings;
create policy pot_settings_admin_update
  on public.pot_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists pot_contributions_admin_insert on public.pot_contributions;
create policy pot_contributions_admin_insert
  on public.pot_contributions for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists pot_contributions_admin_delete on public.pot_contributions;
create policy pot_contributions_admin_delete
  on public.pot_contributions for delete
  to authenticated
  using (public.is_admin());

drop policy if exists pot_expenses_admin_insert on public.pot_expenses;
create policy pot_expenses_admin_insert
  on public.pot_expenses for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists pot_expenses_admin_update on public.pot_expenses;
create policy pot_expenses_admin_update
  on public.pot_expenses for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists pot_expenses_admin_delete on public.pot_expenses;
create policy pot_expenses_admin_delete
  on public.pot_expenses for delete
  to authenticated
  using (public.is_admin());

drop policy if exists pot_income_admin_insert on public.pot_income;
create policy pot_income_admin_insert
  on public.pot_income for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists pot_income_admin_update on public.pot_income;
create policy pot_income_admin_update
  on public.pot_income for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists pot_income_admin_delete on public.pot_income;
create policy pot_income_admin_delete
  on public.pot_income for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Welk lid ben ik zelf?
--
--    Nodig om op /gangpot "jij staat nog open" te kunnen tonen. De functie
--    geeft uitsluitend je eigen lid-ID terug en nooit dat van een ander, dus
--    er lekt niets: wie hem aanroept weet dat antwoord per definitie al.
-- ---------------------------------------------------------------------------
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.member_id
    from public.private_member_data p
   where p.discord_user_id = public.current_discord_user_id()
   limit 1;
$$;

revoke all on function public.current_member_id() from public, anon;
grant execute on function public.current_member_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Het wekelijkse bericht in Discord
--
--    Eén bericht per week dat zichzelf bijwerkt, in plaats van een melding
--    per afvink. Het ID wordt hier bewaard zodat de server weet welk bericht
--    hij moet bewerken. Niemand anders hoeft deze tabel te zien: hij bevat
--    geen gegevens, alleen een verwijzing.
-- ---------------------------------------------------------------------------
create table if not exists public.pot_week_messages (
  week_friday date primary key,
  message_id  text        not null,
  updated_at  timestamptz not null default now()
);

revoke all on public.pot_week_messages from anon, authenticated;
alter table public.pot_week_messages enable row level security;

notify pgrst, 'reload schema';

