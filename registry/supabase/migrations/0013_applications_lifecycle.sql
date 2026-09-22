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
