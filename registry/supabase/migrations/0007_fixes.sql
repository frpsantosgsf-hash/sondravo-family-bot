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
