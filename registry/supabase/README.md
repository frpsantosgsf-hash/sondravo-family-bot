# Supabase — database setup

Run these three files **in order** in the Supabase SQL Editor
(*Dashboard → SQL Editor → New query* → paste → **Run**).

| # | File | What it does |
|---|------|--------------|
| 1 | `migrations/0001_schema.sql` | Tables, helper functions, slug/updated_at/audit triggers |
| 2 | `migrations/0002_rls_policies.sql` | Row Level Security, grants, policies, admin RPCs |
| 3 | `migrations/0003_seed.sql` | Rank ladder + the current 20 members + capacity |

All three are **idempotent** — re-running any of them is safe and will not
create duplicate members.

## Making yourself an admin

Visitors never log in. Only rows in `public.admins` can write anything.

1. Log in once on the site with Discord (button top right).
2. In Supabase: **Authentication → Users**, copy the UUID of your user.
3. Run, with your own UUID:

```sql
insert into public.admins (user_id, label)
values ('00000000-0000-0000-0000-000000000000', 'Lahaye')
on conflict (user_id) do nothing;
```

4. Reload the site — the admin controls appear.

There is deliberately **no policy that allows inserting into `admins` through
the API**. Promoting someone is a manual SQL action, so a compromised session
can never create a new admin.

## Verifying the security setup

`verify_rls.sql` contains read-only checks: every table has RLS on, `anon` has
no write grants anywhere, and the private tables are unreachable for `anon`.
