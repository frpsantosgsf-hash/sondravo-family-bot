-- =============================================================================
-- 0017 — De beginstand uit de spreadsheet
--
-- Zet de gangpot op de stand van week 39 (25-09-2026), zodat de site verder
-- telt waar het bestand ophield in plaats van bij nul te beginnen.
--
-- Het beginsaldo is NUL. Alles wat in de pot zit komt uit de wekelijkse
-- bijdragen en uit het tabblad Inkomsten:
--
--     bijdragen        2.800.000   (56 betaalde weken x 50.000)
--   + inkomsten        8.482.319   (het tabblad Inkomsten)
--   - uitgaven         2.600.000
--   ------------------------------
--     saldo            8.682.319   = ACTUEEL SALDO in het bestand
--
-- Een eerdere versie van dit bestand zette hier 8.282.319 als beginsaldo neer.
-- Dat was een afgeleide uit een tijd dat het tabblad Inkomsten nog niet in
-- beeld was: het saldo klopte toen toevallig, maar de herkomst niet. Nu staan
-- de inkomsten waar ze horen, en is het beginsaldo weer wat het hoort te zijn.
-- Draai dit bestand gerust opnieuw; het zet dat oude getal netjes terug op nul.
--
-- Namen worden gekoppeld op de ledenlijst, niet overgetypt. Staat een naam
-- uit het bestand niet in het register, dan wordt die regel overgeslagen —
-- nooit geraden. De laatste query hieronder laat zien wat er is overgeslagen.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Instellingen
--
--    Het beginsaldo wordt alleen aangeraakt wanneer het nul is of nog op de
--    eerder foutief gezette 8.282.319 staat. Heb je het zelf op iets anders
--    gezet, dan blijft dat staan.
-- ---------------------------------------------------------------------------
update public.pot_settings
   set opening_balance = 0,
       weekly_amount   = 50000,
       first_friday    = date '2026-09-04'
 where id = 1
   and opening_balance in (0, 8282319);

-- ---------------------------------------------------------------------------
-- 2. De uitgaven van het tabblad Uitgaven
-- ---------------------------------------------------------------------------
insert into public.pot_expenses (spent_on, description, paid_by, amount, created_by)
select v.spent_on, v.description, v.paid_by, v.amount, 'Beginstand'
  from (values
    (date '2026-09-12', '5 x melee',            'Rick', 1000000::bigint),
    (date '2026-09-21', '6 x melee (1 gratis)', 'Rick', 1000000::bigint),
    (date '2026-09-23', '3 x melee',            'Rick',  600000::bigint)
  ) as v(spent_on, description, paid_by, amount)
 where not exists (
   select 1
     from public.pot_expenses e
    where e.spent_on = v.spent_on
      and e.description = v.description
      and e.amount = v.amount
 );

-- ---------------------------------------------------------------------------
-- 3. De inkomsten van het tabblad Inkomsten
--
--    Geld dat buiten de wekelijkse bijdragen om in de pot kwam. Dit is
--    verreweg het grootste deel van het saldo, dus zonder deze regels klopt
--    er niets van de kas.
-- ---------------------------------------------------------------------------
insert into public.pot_income (received_on, description, source, amount, created_by)
select v.received_on, v.description, v.source, v.amount, 'Beginstand'
  from (values
    (date '2026-09-12', 'Geript geld',    'groep (bij elkaar)', 3884010::bigint),
    (date '2026-09-17', 'Geript geld',    'groep',               500000::bigint),
    (date '2026-09-18', 'Geript geld',    'groep',              1798309::bigint),
    (date '2026-09-20', 'Geript geld',    'groep',               300000::bigint),
    (date '2026-09-23', 'Geript geld',    'groep',              1800000::bigint),
    (date '2026-09-25', 'Levy mes kwijt', null,                  200000::bigint)
  ) as v(received_on, description, source, amount)
 where not exists (
   select 1
     from public.pot_income i
    where i.received_on = v.received_on
      and i.description = v.description
      and i.amount = v.amount
 );

-- ---------------------------------------------------------------------------
-- 4. De betaalde weken
--
--    Per lid de weeknummers die op Betaald stonden. Week 36 is vrijdag
--    04-09-2026; elke volgende week is zeven dagen later.
--
--    Samen 56 betalingen: 17 in week 36, 15 in week 37, 16 in week 38 en 8 in
--    week 39 — precies de regel "Aantal betaald" uit het bestand.
-- ---------------------------------------------------------------------------
with betaald(naam, weken) as (values
  ('rick',     array[36, 37, 38]),
  ('vito',     array[36, 37, 38, 39]),
  ('ryan',     array[36, 37, 38, 39]),
  ('renzo',    array[36, 37, 38, 39]),
  ('levy',     array[36, 37, 38, 39]),
  ('dave',     array[36, 38]),
  ('dishway',  array[37, 38]),
  ('gonzalo',  array[36, 37, 38]),
  ('culms',    array[36, 37, 38]),
  ('bseah',    array[36, 37, 38, 39]),
  ('baksteen', array[37, 38]),
  ('thomas',   array[36, 37, 38]),
  ('rano',     array[36, 37, 38, 39]),
  ('rinnie',   array[36, 38]),
  ('santos',   array[36, 37, 38, 39]),
  ('ferry',    array[36, 38, 39]),
  ('jayden',   array[36]),
  ('zoef',     array[37]),
  ('xavier',   array[36, 37]),
  ('tarik',    array[36])
)
insert into public.pot_contributions (member_id, member_name, week_friday, amount, marked_by)
select m.id,
       m.name,
       date '2026-09-04' + (w.week_nr - 36) * 7,
       50000,
       'Beginstand'
  from betaald b
  cross join lateral unnest(b.weken) as w(week_nr)
  join public.members m
    on lower(btrim(regexp_replace(m.name, '^\s*sdf\s*\|\s*', '', 'i'))) = b.naam
on conflict (member_id, week_friday) do nothing;

-- ---------------------------------------------------------------------------
-- 5. De proef op de som
--
--    Eén regel met alles erin, en dat is geen opmaak: de SQL Editor van
--    Supabase toont alleen het resultaat van de láátste query. Stonden deze
--    controles los van elkaar, dan zou juist de belangrijkste — welke namen
--    niet gekoppeld konden worden — onzichtbaar blijven.
--
--    Verwacht bij een goede overzetting:
--
--      niet_gekoppeld        alles gekoppeld
--      verwachte_betalingen  80
--      geregistreerd         56
--      nog_te_betalen        1.200.000
--      saldo                 8.682.319
--
--    Staat er een naam bij niet_gekoppeld, dan heet die persoon in het
--    register anders dan in het oude bestand. Zijn betalingen zijn NIET
--    overgezet; vink die met de hand af op /gangpot.
-- ---------------------------------------------------------------------------
with s as (
  select * from public.pot_settings where id = 1
),
huidige as (
  -- De laatste vrijdag die gewéést is. Er wordt op vrijdag ingelegd en je hebt
  -- tot de volgende vrijdag de tijd, dus de week die nu loopt begon op de
  -- vrijdag achter ons — niet op de vrijdag die nog moet komen.
  select (current_date - ((extract(isodow from current_date)::int - 5 + 7) % 7))::date as vrijdag
),
weken as (
  select reeks::date as vrijdag
    from s, huidige, generate_series(s.first_friday, huidige.vrijdag, interval '7 day') as reeks
),
verwacht as (
  select m.id, w.vrijdag
    from public.members m
    cross join weken w
    cross join s
    -- De eerste vrijdag van dit lid: nooit vóór die van de pot zelf.
   where w.vrijdag >= greatest(
           s.first_friday,
           (
             coalesce(m.joined_at, s.first_friday)
             + ((5 - extract(isodow from coalesce(m.joined_at, s.first_friday))::int + 7) % 7)
           )::date
         )
),
uit_bestand(naam) as (values
  ('rick'), ('vito'), ('ryan'), ('renzo'), ('levy'), ('dave'), ('dishway'),
  ('gonzalo'), ('culms'), ('bseah'), ('baksteen'), ('thomas'), ('rano'),
  ('rinnie'), ('santos'), ('ferry'), ('jayden'), ('zoef'), ('xavier'), ('tarik')
),
zoek as (
  select string_agg(b.naam, ', ' order by b.naam) as namen
    from uit_bestand b
   where not exists (
     select 1
       from public.members m
      where lower(btrim(regexp_replace(m.name, '^\s*sdf\s*\|\s*', '', 'i'))) = b.naam
   )
)
select coalesce((select namen from zoek), 'alles gekoppeld')                       as niet_gekoppeld,
       (select count(*) from verwacht)                                            as verwachte_betalingen,
       (select count(*) from public.pot_contributions where member_id is not null) as geregistreerd,
       ((select count(*) from verwacht)
         - (select count(*) from public.pot_contributions where member_id is not null))
         * (select weekly_amount from s)                                          as nog_te_betalen,
       (select opening_balance from s)
         + coalesce((select sum(amount) from public.pot_contributions), 0)
         + coalesce((select sum(amount) from public.pot_income), 0)
         - coalesce((select sum(amount) from public.pot_expenses), 0)             as saldo;
