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

    insert into public.private_member_data (member_id, discord_user_id, updated_at)
    values (v_id, p_discord_user_id, now())
    on conflict (member_id) do update
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
