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
