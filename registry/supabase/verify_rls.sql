-- ============================================================================
-- Read-only security verification. Run in the Supabase SQL Editor after the
-- three migrations. Nothing here changes data.
-- ============================================================================

-- 1. Every table in `public` must have RLS enabled.
select
  c.relname                                   as table_name,
  c.relrowsecurity                            as rls_enabled,
  case when c.relrowsecurity then 'OK' else 'FAIL — RLS IS OFF' end as verdict
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 2. `anon` must hold no INSERT/UPDATE/DELETE anywhere, and no privilege at
--    all on private_member_data, admins or audit_logs.
select
  table_name,
  privilege_type,
  'FAIL — anon should not have this' as verdict
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
  and (
    privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES')
    or table_name in ('private_member_data', 'admins', 'audit_logs')
  )
order by table_name;
-- Expected result: 0 rows.

-- 3. What `anon` *is* allowed: SELECT on ranks, members and settings only.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
order by table_name, privilege_type;

-- 4. Full policy listing, so every rule is visible in one place.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5. The public registry, exactly as an anonymous visitor sees it.
set local role anon;
select id, name, rank, discord_username, phone, avatar_url from public.members order by name;
select id, family_name, member_limit from public.settings;
-- Each of the next three must fail or return 0 rows:
--   select * from public.private_member_data;  -> permission denied
--   select * from public.audit_logs;           -> permission denied
--   select * from public.admins;               -> permission denied
reset role;
