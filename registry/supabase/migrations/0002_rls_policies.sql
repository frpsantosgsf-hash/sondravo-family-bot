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
