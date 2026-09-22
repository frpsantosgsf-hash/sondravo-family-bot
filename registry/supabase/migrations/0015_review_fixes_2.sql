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
