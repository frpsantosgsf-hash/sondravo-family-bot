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
