-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migration 0003: seed data (ranks + the current 20 members)
-- Run this AFTER 0002_rls_policies.sql.
--
-- IDEMPOTENT: every member is keyed on a unique slug, so running this file
-- a second (or tenth) time never creates duplicates and never overwrites a
-- change an admin made in the app.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Rank ladder, high to low. sort_order 1 is the top of the family.
-- This order is fixed and is never sorted alphabetically.
-- ---------------------------------------------------------------------------
insert into public.ranks (key, label, glyph, tone, sort_order) values
  ('mpitarika',  'Mpitarika',  '♛', 'gold',    1),
  ('lefitra',    'Lefitra',    '✦', 'red',     2),
  ('mpanoro',    'Mpanoro',    '✦', 'red',     3),
  ('mpifehy',    'Mpifehy',    '✦', 'red',     4),
  ('hery',       'Hery',       '◆', 'green',   5),
  ('mpiady',     'Mpiady',     '◆', 'green',   6),
  ('zoky',       'Zoky',       '◈', 'stone',   7),
  ('mpikambana', 'Mpikambana', '●', 'neutral', 8),
  ('zazavao',    'Zazavao',    '○', 'muted',   9)
on conflict (key) do update
  set label      = excluded.label,
      glyph      = excluded.glyph,
      tone       = excluded.tone,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Current roster — 20 members.
--
-- Deze lijst vult ALLEEN een leeg register. Dat is geen detail: sinds de
-- rollen-sync bestaat wordt de ledenlijst gelijkgetrokken met Discord, en dan
-- verdwijnt er soms iemand. Zou dit bestand daarna nog een keer draaien, dan
-- stond die persoon er zo weer bij — met zijn oude rang, zonder dat iemand
-- daarom vroeg. `on conflict (slug)` vangt dat niet af, want zijn rij is dan
-- juist wég.
--
-- Staat er al iemand in het register, dan doet dit blok dus niets, en is
-- setup.sql werkelijk zo veilig om opnieuw te draaien als hij belooft.
-- ---------------------------------------------------------------------------
insert into public.members (slug, name, rank)
select v.slug, v.name, v.rank
  from (values
    -- Mpitarika
    ('lahaye',   'Lahaye',   'mpitarika'),
    -- Lefitra
    ('vito',     'Vito',     'lefitra'),
    -- Mpanoro
    ('ryan',     'Ryan',     'mpanoro'),
    -- Mpifehy, Hery, Mpiady and Zoky have no members yet. Those ranks stay
    -- hidden on the public page until somebody is placed in them.
    -- Mpikambana
    ('renzo',    'Renzo',    'mpikambana'),
    ('levy',     'Levy',     'mpikambana'),
    ('dave',     'Dave',     'mpikambana'),
    ('gonzalo',  'Gonzalo',  'mpikambana'),
    ('culms',    'Culms',    'mpikambana'),
    ('bseah',    'Bseah',    'mpikambana'),
    ('thomas',   'Thomas',   'mpikambana'),
    ('rano',     'Rano',     'mpikambana'),
    ('santos',   'Santos',   'mpikambana'),
    ('baksteen', 'Baksteen', 'mpikambana'),
    ('dishway',  'Dishway',  'mpikambana'),
    -- Zazavao
    ('ferry',    'Ferry',    'zazavao'),
    ('rinnie',   'Rinnie',   'zazavao'),
    ('jayden',   'Jayden',   'zazavao'),
    ('tarik',    'Tarik',    'zazavao'),
    ('zoef',     'Zoef',     'zazavao'),
    ('xavier',   'Xavier',   'zazavao')
) as v(slug, name, rank)
 where not exists (select 1 from public.members)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Capacity. The counter on the site reads this value — it is never hardcoded
-- in the front-end — and an admin can change it from the Settings modal.
-- ---------------------------------------------------------------------------
insert into public.settings (id, family_name, member_limit)
values (1, 'The Sondravo Family', 20)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Sanity check: should report 20 members against a limit of 20.
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_limit integer;
begin
  select count(*) into v_count from public.members;
  select member_limit into v_limit from public.settings where id = 1;
  raise notice 'Sondravo registry seeded: % / % members', v_count, v_limit;
end;
$$;
