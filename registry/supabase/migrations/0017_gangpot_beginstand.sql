-- =============================================================================
-- 0017 — De beginstand uit de spreadsheet
--
-- Zet de gangpot op de stand van week 39 (25-09-2026), zodat de site verder
-- telt waar het bestand ophield in plaats van bij nul te beginnen.
--
-- Het beginsaldo is geen overgeschreven getal maar een afgeleide, en dat is
-- maar goed ook: het stond niet zichtbaar in het bestand.
--
--     actueel saldo   8.182.319
--   - ontvangen       2.500.000
--   + uitgegeven      2.600.000
--   ------------------------------
--     beginsaldo      8.282.319
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
--    Alleen wanneer het beginsaldo nog op nul staat. Heb je het later met de
--    hand bijgesteld, dan zet dit bestand dat niet stilletjes terug.
-- ---------------------------------------------------------------------------
update public.pot_settings
   set opening_balance = 8282319,
       weekly_amount   = 50000,
       first_friday    = date '2026-09-04'
 where id = 1
   and opening_balance = 0;

-- ---------------------------------------------------------------------------
-- 2. De drie uitgaven van het tabblad Uitgaven
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
-- 3. De betaalde weken
--
--    Per lid de weeknummers die op Betaald stonden. Week 36 is vrijdag
--    04-09-2026; elke volgende week is zeven dagen later.
-- ---------------------------------------------------------------------------
with betaald(naam, weken) as (values
  ('rick',     array[36, 37, 38]),
  ('vito',     array[36, 37, 38]),
  ('ryan',     array[36, 37, 38, 39]),
  ('renzo',    array[36, 37, 38]),
  ('levy',     array[36, 37, 38]),
  ('dave',     array[36, 38]),
  ('dishway',  array[37, 38]),
  ('gonzalo',  array[36, 37, 38]),
  ('culms',    array[36, 37, 38]),
  ('bseah',    array[36, 37, 38, 39]),
  ('baksteen', array[37, 38]),
  ('thomas',   array[36, 37]),
  ('rano',     array[36, 37, 38, 39]),
  ('rinnie',   array[36, 38]),
  ('santos',   array[36, 37, 38]),
  ('ferry',    array[36, 38]),
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
-- 4. Controle
--
--    Levert dit rijen op, dan staan die namen anders in het register dan in
--    de spreadsheet en zijn hun betalingen NIET overgezet. Hernoem het lid of
--    vink die weken met de hand af op /gangpot.
-- ---------------------------------------------------------------------------
select b.naam as niet_gevonden_in_ledenlijst
  from (values
    ('rick'), ('vito'), ('ryan'), ('renzo'), ('levy'), ('dave'), ('dishway'),
    ('gonzalo'), ('culms'), ('bseah'), ('baksteen'), ('thomas'), ('rano'),
    ('rinnie'), ('santos'), ('ferry'), ('jayden'), ('zoef'), ('xavier'), ('tarik')
  ) as b(naam)
 where not exists (
   select 1
     from public.members m
    where lower(btrim(regexp_replace(m.name, '^\s*sdf\s*\|\s*', '', 'i'))) = b.naam
 );

-- ---------------------------------------------------------------------------
-- 5. De proef op de som
--
--    Rekent "nog te betalen" precies zo uit als de site doet. Klopt dit getal
--    met het bedrag uit je oude bestand, dan staat alles goed. Wijkt het af,
--    dan is er een naam niet gekoppeld (zie de query hierboven) of telt er een
--    lid mee vanaf een andere week dan je verwacht.
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
)
select (select count(*) from verwacht)                                        as verwachte_betalingen,
       (select count(*) from public.pot_contributions where member_id is not null) as geregistreerd,
       ((select count(*) from verwacht)
         - (select count(*) from public.pot_contributions where member_id is not null))
         * (select weekly_amount from s)                                      as nog_te_betalen,
       (select opening_balance from s)
         + coalesce((select sum(amount) from public.pot_contributions), 0)
         + coalesce((select sum(amount) from public.pot_income), 0)
         - coalesce((select sum(amount) from public.pot_expenses), 0)         as saldo;
