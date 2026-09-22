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
