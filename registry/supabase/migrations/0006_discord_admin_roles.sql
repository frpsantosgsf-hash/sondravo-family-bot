-- ============================================================================
-- THE SONDRAVO FAMILY — Official Family Registry
-- Migratie 0006: beheerrechten via een Discord-rol
--
-- Tot nu toe werd elke admin met de hand toegevoegd. Daar komt een tweede weg
-- bij: wie in Discord de Leader-rol heeft, krijgt bij het inloggen automatisch
-- beheerrechten op de site.
--
-- De kolom `source` houdt de twee wegen uit elkaar:
--   'manual'   met de hand toegevoegd in de SQL-editor. Blijft altijd staan.
--   'discord'  automatisch toegekend op basis van een rol. Verdwijnt weer
--              zodra iemand die rol in Discord kwijtraakt.
--
-- Die scheiding is met opzet: als het bot-token ooit stuk is of de Discord API
-- plat ligt, mag dat nooit de handmatige admins buitensluiten. Er is altijd een
-- sleutel die niet van Discord afhangt.
--
-- Uitvoeren NA 0005_rank_colors.sql. Idempotent.
-- ============================================================================

alter table public.admins
  add column if not exists source text not null default 'manual';

do $$
begin
  alter table public.admins
    add constraint admins_source_check check (source in ('manual', 'discord'));
exception
  when duplicate_object then null;
end;
$$;

comment on column public.admins.source is
  'manual = met de hand toegevoegd (blijft staan); discord = via rol toegekend (wordt gesynchroniseerd).';

-- Rijen die er al waren, zijn met de hand gezet.
update public.admins set source = 'manual' where source is null;

create index if not exists admins_source_idx on public.admins (source);
