-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migratie 0008: rechten voor de service-role
--
-- WAT ER MIS WAS
-- Staat "Automatically expose new tables" uit in Supabase (aan te raden), dan
-- krijgen nieuwe tabellen géén standaardrechten. Migratie 0002 deelde daarna
-- wel expliciet rechten uit aan anon en authenticated, maar niet aan
-- service_role — die zou ze immers "toch al hebben". Zonder die standaard
-- klopte die aanname niet en hield service_role nul rechten over.
--
-- Gevolg: server-side taken die met de service-role werken konden niets. De
-- Leader-rol uit Discord werd wel herkend, maar de beheerrechten konden niet
-- worden weggeschreven.
--
-- Uitvoeren NA 0007. Idempotent.
-- ============================================================================

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute       on all functions  in schema public to service_role;

-- Ook voor tabellen die later nog bijkomen.
alter default privileges in schema public grant all     on tables    to service_role;
alter default privileges in schema public grant all     on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- ---------------------------------------------------------------------------
-- Controle
-- ---------------------------------------------------------------------------
do $$
declare
  v_zonder_rechten text;
begin
  select string_agg(c.relname, ', ')
    into v_zonder_rechten
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not has_table_privilege('service_role', c.oid, 'INSERT');

  if v_zonder_rechten is null then
    raise notice 'Service-role heeft nu toegang tot alle tabellen.';
  else
    raise notice 'LET OP: nog steeds geen toegang tot: %', v_zonder_rechten;
  end if;
end;
$$;
