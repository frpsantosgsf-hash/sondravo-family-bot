-- =============================================================================
-- 0012 — Leden stemmen over een sollicitatie
--
-- Een sollicitatie die binnenkomt is voortaan ook voor de leden zichtbaar,
-- zolang hij openstaat. Iedereen die op de ledenlijst staat mag één keer een
-- duim omhoog of omlaag geven; de Lead beslist uiteindelijk.
--
-- Afgehandelde sollicitaties verdwijnen weer uit beeld voor de leden. Wie is
-- afgewezen hoeft dat niet voor altijd in de familie te laten rondslingeren.
--
-- Idempotent: twee keer draaien verandert niets.
-- =============================================================================

create table if not exists public.application_votes (
  application_id uuid not null references public.applications(id) on delete cascade,
  voter_id       uuid not null,
  vote           text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  primary key (application_id, voter_id),
  constraint application_votes_vote_check check (vote in ('ja', 'nee'))
);

create index if not exists application_votes_application_idx
  on public.application_votes (application_id);

create or replace function public.application_votes_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists application_votes_touch_trg on public.application_votes;
create trigger application_votes_touch_trg
  before update on public.application_votes
  for each row execute function public.application_votes_touch();

-- ---------------------------------------------------------------------------
-- Leden mogen een openstaande sollicitatie zien
--
-- Alleen zolang hij open is. Zodra de Lead hem aanneemt of afwijst, valt hij
-- weer uit beeld bij de leden; de Lead houdt de volledige geschiedenis.
-- ---------------------------------------------------------------------------
drop policy if exists "applications family read" on public.applications;
create policy "applications family read"
  on public.applications for select
  to authenticated
  using (
    public.is_family_member()
    and status in ('nieuw', 'in_behandeling')
  );

-- ---------------------------------------------------------------------------
-- De stemmen zelf
-- ---------------------------------------------------------------------------
alter table public.application_votes enable row level security;

revoke all on public.application_votes from anon, authenticated;
grant select, insert, update, delete on public.application_votes to authenticated;

-- Leden en Leads zien de stand. Dat iedereen elkaars stem kan tellen is de
-- bedoeling: het gaat om een gezamenlijk oordeel, niet om een geheime stemming.
drop policy if exists "application_votes read" on public.application_votes;
create policy "application_votes read"
  on public.application_votes for select
  to authenticated
  using (public.is_admin() or public.is_family_member());

-- Stemmen doe je op je eigen naam, en alleen als je bij de familie hoort.
drop policy if exists "application_votes insert" on public.application_votes;
create policy "application_votes insert"
  on public.application_votes for insert
  to authenticated
  with check (
    voter_id = auth.uid()
    and (public.is_admin() or public.is_family_member())
  );

-- Van gedachten veranderen mag, maar alleen over je eigen stem.
drop policy if exists "application_votes update" on public.application_votes;
create policy "application_votes update"
  on public.application_votes for update
  to authenticated
  using (voter_id = auth.uid())
  with check (
    voter_id = auth.uid()
    and (public.is_admin() or public.is_family_member())
  );

drop policy if exists "application_votes delete" on public.application_votes;
create policy "application_votes delete"
  on public.application_votes for delete
  to authenticated
  using (voter_id = auth.uid());

grant all privileges on public.application_votes to service_role;

notify pgrst, 'reload schema';
