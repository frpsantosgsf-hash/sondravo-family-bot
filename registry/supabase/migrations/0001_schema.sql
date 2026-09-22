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
  if tg_op = 'UPDATE' and new.slug is not null and new.slug = old.slug then
    return new;
  end if;

  base_slug := coalesce(public.slugify(new.slug), public.slugify(new.name), 'lid');
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
