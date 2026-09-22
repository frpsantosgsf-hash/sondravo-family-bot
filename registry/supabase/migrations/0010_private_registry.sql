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
