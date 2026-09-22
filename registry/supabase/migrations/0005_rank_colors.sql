-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migratie 0005: rangkleuren uit Discord
--
-- Elke rang krijgt de kleur van zijn Discord-rol. De site toont die kleur
-- bewust gedempt: herkenbaar in de rangkop en de badge, maar nooit zo fel als
-- in Discord zelf — anders wordt de ledenlijst een kleurenfestival.
--
-- Uitvoeren NA 0004_bot_bridge.sql. Idempotent.
-- ============================================================================

alter table public.ranks
  add column if not exists color text not null default '#8b8f8a';

-- Alleen echte hexkleuren toestaan; de UI rekent daarop.
do $$
begin
  alter table public.ranks
    add constraint ranks_color_format check (color ~ '^#[0-9a-fA-F]{6}$');
exception
  when duplicate_object then null;
end;
$$;

update public.ranks as r
   set color = v.color
  from (values
    ('mpitarika',  '#1e00ff'),  -- blauw
    ('lefitra',    '#b7ff00'),  -- lime
    ('mpanoro',    '#00f52d'),  -- fel groen
    ('mpifehy',    '#00f52d'),  -- fel groen
    ('hery',       '#2ecc71'),  -- emerald
    ('mpiady',     '#ddf80c'),  -- geel-lime
    ('zoky',       '#f1c40f'),  -- goud
    ('mpikambana', '#ff0000'),  -- rood
    ('zazavao',    '#ff0000')   -- rood
  ) as v(key, color)
 where r.key = v.key
   and r.color is distinct from v.color;
