-- =============================================================================
-- 0016 — De gangpot
--
-- Elke vrijdag legt ieder lid hetzelfde bedrag in, de Lead boekt de uitgaven,
-- en het saldo rolt eruit. Tot nu toe stond dat in een spreadsheet; vanaf nu
-- in de database, met dezelfde sloten als de rest van de site.
--
-- Drie keuzes die de rest verklaren:
--
--   1. Een rij in pot_contributions betekent "betaald". Geen rij betekent
--      "nog niet". Zo staan er geen honderden lege cellen in de tabel en
--      groeit het overzicht vanzelf mee met elke nieuwe week.
--
--   2. Het saldo wordt nergens opgeslagen. Het is altijd
--      beginsaldo + ontvangen + inkomsten - uitgaven, uitgerekend op het
--      moment dat je kijkt. Een opgeslagen saldo gaat vroeg of laat afwijken
--      van de regels eronder, en dan weet niemand meer welke van de twee
--      klopt.
--
--   3. member_id mag leeg worden, member_name niet. Verlaat iemand de
--      familie, dan haalt de nachtelijke rollen-sync hem uit members — maar
--      zijn betalingen blijven met naam in de boeken staan. De spreadsheet
--      waarschuwde daar zelf voor ("Verwijder geen leden met een
--      betaalhistorie"); hier kan het gewoon niet meer misgaan.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Instellingen van de pot
-- ---------------------------------------------------------------------------
create table if not exists public.pot_settings (
  id              smallint primary key default 1 check (id = 1),
  -- Wat er in de pot zat vóór deze administratie begon.
  opening_balance bigint      not null default 0,
  -- De vaste wekelijkse bijdrage per lid.
  weekly_amount   bigint      not null default 50000 check (weekly_amount > 0),
  -- De eerste vrijdag die meetelt.
  first_friday    date        not null default date '2026-09-04',
  updated_at      timestamptz not null default now()
);

insert into public.pot_settings (id) values (1) on conflict (id) do nothing;

comment on table public.pot_settings is
  'Eenmalige instellingen van de gangpot. Altijd precies één rij (id = 1).';

-- ---------------------------------------------------------------------------
-- 2. De wekelijkse bijdragen
--
--    De sleutel is (lid, vrijdag): twee keer afvinken maakt geen tweede rij.
--    Voor wie de familie verlaat regelt de index zichzelf: member_id wordt dan
--    null, en twee null-waarden botsen in Postgres nooit. Die oude rijen zitten
--    elkaar dus niet in de weg, zonder dat de index partieel hoeft te zijn —
--    en dat scheelt, want een partiële index kan Postgres niet afleiden bij een
--    upsert, waardoor afvinken zou stuklopen op "no unique constraint matching".
-- ---------------------------------------------------------------------------
create table if not exists public.pot_contributions (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid references public.members (id) on delete set null,
  -- Momentopname van de naam, zodat de boeken leesbaar blijven na vertrek.
  member_name text,
  week_friday date   not null check (extract(isodow from week_friday) = 5),
  amount      bigint not null check (amount > 0),
  marked_by   text,
  marked_at   timestamptz not null default now()
);

drop index if exists public.pot_contributions_unique_idx;

create unique index if not exists pot_contributions_unique_idx
  on public.pot_contributions (member_id, week_friday);

create index if not exists pot_contributions_week_idx
  on public.pot_contributions (week_friday);

comment on table public.pot_contributions is
  'Eén rij per betaalde week per lid. Geen rij = niet betaald.';

-- ---------------------------------------------------------------------------
-- 3. Uitgaven en overige inkomsten
--
--    Twee tabellen met dezelfde vorm in plaats van één tabel met een
--    plus/min-kolom: dan kan een tikfout in het teken nooit een uitgave in
--    een inkomst veranderen.
-- ---------------------------------------------------------------------------
create table if not exists public.pot_expenses (
  id          uuid primary key default gen_random_uuid(),
  spent_on    date   not null default current_date,
  description text   not null check (btrim(description) <> ''),
  -- Wie het uit eigen zak heeft voorgeschoten of uit de pot betaald heeft.
  paid_by     text,
  amount      bigint not null check (amount > 0),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists pot_expenses_date_idx on public.pot_expenses (spent_on desc);

create table if not exists public.pot_income (
  id          uuid primary key default gen_random_uuid(),
  received_on date   not null default current_date,
  description text   not null check (btrim(description) <> ''),
  -- Waar het vandaan kwam: een deal, een boete, een teruggave.
  source      text,
  amount      bigint not null check (amount > 0),
  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists pot_income_date_idx on public.pot_income (received_on desc);

comment on table public.pot_expenses is 'Geld dat uit de gangpot is betaald.';
comment on table public.pot_income  is 'Geld dat in de pot kwam buiten de wekelijkse bijdragen om.';

-- ---------------------------------------------------------------------------
-- 4. Wat de database zelf invult
--
--    Naam, bedrag en "wie vinkte af" komen niet uit de browser. Het bedrag
--    is de vaste bijdrage uit de instellingen — deelbetalingen kent dit
--    overzicht bewust niet, precies zoals in de spreadsheet.
-- ---------------------------------------------------------------------------
create or replace function public.pot_contributions_fill()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(new.member_name, '')), '') is null then
    select m.name into new.member_name from public.members m where m.id = new.member_id;
  end if;

  if nullif(btrim(coalesce(new.member_name, '')), '') is null then
    raise exception 'Onbekend lid' using errcode = '22023';
  end if;

  if new.amount is null then
    select s.weekly_amount into new.amount from public.pot_settings s where s.id = 1;
  end if;

  if nullif(btrim(coalesce(new.marked_by, '')), '') is null then
    new.marked_by := public.current_admin_name();
  end if;

  return new;
end;
$$;

drop trigger if exists pot_contributions_fill_trg on public.pot_contributions;
create trigger pot_contributions_fill_trg
  before insert on public.pot_contributions
  for each row execute function public.pot_contributions_fill();

create or replace function public.pot_entry_fill()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and nullif(btrim(coalesce(new.created_by, '')), '') is null then
    new.created_by := public.current_admin_name();
  end if;
  return new;
end;
$$;

drop trigger if exists pot_expenses_fill_trg on public.pot_expenses;
create trigger pot_expenses_fill_trg
  before insert on public.pot_expenses
  for each row execute function public.pot_entry_fill();

drop trigger if exists pot_income_fill_trg on public.pot_income;
create trigger pot_income_fill_trg
  before insert on public.pot_income
  for each row execute function public.pot_entry_fill();

drop trigger if exists pot_expenses_updated_at_trg on public.pot_expenses;
create trigger pot_expenses_updated_at_trg
  before update on public.pot_expenses
  for each row execute function public.set_updated_at();

drop trigger if exists pot_income_updated_at_trg on public.pot_income;
create trigger pot_income_updated_at_trg
  before update on public.pot_income
  for each row execute function public.set_updated_at();

drop trigger if exists pot_settings_updated_at_trg on public.pot_settings;
create trigger pot_settings_updated_at_trg
  before update on public.pot_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Geschiedenis
--
--    Kasboekhouding zonder logboek is een geloofskwestie. Elke afvink, elke
--    uitgave en elke wijziging aan de instellingen komt in dezelfde history
--    die de ledenlijst al gebruikt — geschreven door de database, dus ook
--    wanneer iemand rechtstreeks in de SQL-editor iets aanpast.
-- ---------------------------------------------------------------------------
create or replace function public.log_pot_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old  jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new  jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_both jsonb := coalesce(v_new, v_old);
  v_verb text;
begin
  -- Een aanraking die alleen updated_at verzette is geen geschiedenis.
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;

  v_verb := case tg_op
    when 'INSERT' then 'added'
    when 'DELETE' then 'removed'
    else 'updated'
  end;

  insert into public.audit_logs
    (admin_user_id, admin_name, member_id, member_name, action, old_value, new_value)
  values (
    auth.uid(),
    public.current_admin_name(),
    nullif(v_both ->> 'member_id', '')::uuid,
    v_both ->> 'member_name',
    tg_argv[0] || '.' || v_verb,
    v_old,
    v_new
  );

  -- AFTER-trigger: de retourwaarde doet niets, en bij DELETE bestaat new niet.
  return null;
end;
$$;

drop trigger if exists pot_contributions_audit_trg on public.pot_contributions;
create trigger pot_contributions_audit_trg
  after insert or update or delete on public.pot_contributions
  for each row execute function public.log_pot_change('pot.contribution');

drop trigger if exists pot_expenses_audit_trg on public.pot_expenses;
create trigger pot_expenses_audit_trg
  after insert or update or delete on public.pot_expenses
  for each row execute function public.log_pot_change('pot.expense');

drop trigger if exists pot_income_audit_trg on public.pot_income;
create trigger pot_income_audit_trg
  after insert or update or delete on public.pot_income
  for each row execute function public.log_pot_change('pot.income');

drop trigger if exists pot_settings_audit_trg on public.pot_settings;
create trigger pot_settings_audit_trg
  after update on public.pot_settings
  for each row execute function public.log_pot_change('pot.settings');

-- ---------------------------------------------------------------------------
-- 6. Rechten
--
--    anon krijgt niets — zelfs geen leesrecht. De gangpot is interne
--    administratie van een besloten familie en heeft op een openbare pagina
--    niets te zoeken. De grants hieronder zijn de eerste grendel; de policies
--    daarna versmallen ze verder tot "familie leest, Lead schrijft".
-- ---------------------------------------------------------------------------
revoke all on public.pot_settings      from anon, authenticated;
revoke all on public.pot_contributions from anon, authenticated;
revoke all on public.pot_expenses      from anon, authenticated;
revoke all on public.pot_income        from anon, authenticated;

grant select on public.pot_settings      to authenticated;
grant select on public.pot_contributions to authenticated;
grant select on public.pot_expenses      to authenticated;
grant select on public.pot_income        to authenticated;

grant update                 on public.pot_settings      to authenticated;
grant insert, delete         on public.pot_contributions to authenticated;
grant insert, update, delete on public.pot_expenses      to authenticated;
grant insert, update, delete on public.pot_income        to authenticated;

alter table public.pot_settings      enable row level security;
alter table public.pot_contributions enable row level security;
alter table public.pot_expenses      enable row level security;
alter table public.pot_income        enable row level security;

-- --- lezen: wie zelf op de ledenlijst staat, plus de Lead --------------------
drop policy if exists pot_settings_family_read on public.pot_settings;
create policy pot_settings_family_read
  on public.pot_settings for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

drop policy if exists pot_contributions_family_read on public.pot_contributions;
create policy pot_contributions_family_read
  on public.pot_contributions for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

drop policy if exists pot_expenses_family_read on public.pot_expenses;
create policy pot_expenses_family_read
  on public.pot_expenses for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

drop policy if exists pot_income_family_read on public.pot_income;
create policy pot_income_family_read
  on public.pot_income for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

-- --- schrijven: uitsluitend de Lead -----------------------------------------
drop policy if exists pot_settings_admin_update on public.pot_settings;
create policy pot_settings_admin_update
  on public.pot_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists pot_contributions_admin_insert on public.pot_contributions;
create policy pot_contributions_admin_insert
  on public.pot_contributions for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists pot_contributions_admin_delete on public.pot_contributions;
create policy pot_contributions_admin_delete
  on public.pot_contributions for delete
  to authenticated
  using (public.is_admin());

drop policy if exists pot_expenses_admin_insert on public.pot_expenses;
create policy pot_expenses_admin_insert
  on public.pot_expenses for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists pot_expenses_admin_update on public.pot_expenses;
create policy pot_expenses_admin_update
  on public.pot_expenses for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists pot_expenses_admin_delete on public.pot_expenses;
create policy pot_expenses_admin_delete
  on public.pot_expenses for delete
  to authenticated
  using (public.is_admin());

drop policy if exists pot_income_admin_insert on public.pot_income;
create policy pot_income_admin_insert
  on public.pot_income for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists pot_income_admin_update on public.pot_income;
create policy pot_income_admin_update
  on public.pot_income for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists pot_income_admin_delete on public.pot_income;
create policy pot_income_admin_delete
  on public.pot_income for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Welk lid ben ik zelf?
--
--    Nodig om op /gangpot "jij staat nog open" te kunnen tonen. De functie
--    geeft uitsluitend je eigen lid-ID terug en nooit dat van een ander, dus
--    er lekt niets: wie hem aanroept weet dat antwoord per definitie al.
-- ---------------------------------------------------------------------------
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.member_id
    from public.private_member_data p
   where p.discord_user_id = public.current_discord_user_id()
   limit 1;
$$;

revoke all on function public.current_member_id() from public, anon;
grant execute on function public.current_member_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Het wekelijkse bericht in Discord
--
--    Eén bericht per week dat zichzelf bijwerkt, in plaats van een melding
--    per afvink. Het ID wordt hier bewaard zodat de server weet welk bericht
--    hij moet bewerken. Niemand anders hoeft deze tabel te zien: hij bevat
--    geen gegevens, alleen een verwijzing.
-- ---------------------------------------------------------------------------
create table if not exists public.pot_week_messages (
  week_friday date primary key,
  message_id  text        not null,
  updated_at  timestamptz not null default now()
);

revoke all on public.pot_week_messages from anon, authenticated;
alter table public.pot_week_messages enable row level security;

notify pgrst, 'reload schema';
