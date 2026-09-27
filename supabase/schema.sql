-- ============================================================
-- ReviewKaro by KnownLabs — Supabase schema
-- Tumhare EXISTING project me chalao (SQL Editor → New query → Run).
-- Tables: rk_businesses, rk_events, rk_profiles
-- ============================================================

-- ---------- businesses ----------
create table if not exists rk_businesses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null default 'General',
  city text default '',
  google_review_url text not null default '',
  owner_phone text default '',
  owner_email text default '',
  plan text not null default 'trial'
    check (plan in ('trial','monthly','quarterly')),
  expires_at timestamptz not null default now() + interval '3 days',
  created_at timestamptz default now()
);

-- ---------- tracking events ----------
create table if not exists rk_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references rk_businesses(id) on delete cascade,
  type text not null
    check (type in ('scan','like','dislike','generated','copied','google_click','feedback')),
  meta jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists rk_events_business_idx on rk_events(business_id);
create index if not exists rk_events_created_idx on rk_events(created_at);

-- ---------- roles (superadmin = tum) ----------
create table if not exists rk_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'superadmin' check (role in ('superadmin'))
);

-- helper: kya logged-in user superadmin hai?
create or replace function rk_is_superadmin()
returns boolean language sql security definer stable
as $$ select exists (select 1 from rk_profiles where user_id = auth.uid()) $$;

-- ============================================================
-- RLS
-- ============================================================
alter table rk_businesses enable row level security;
alter table rk_events enable row level security;
alter table rk_profiles enable row level security;

-- businesses: public page (anon) padh sakta hai
drop policy if exists "rk anon read businesses" on rk_businesses;
create policy "rk anon read businesses"
  on rk_businesses for select to anon using (true);

-- businesses: owner apna business dekhe, superadmin sab
drop policy if exists "rk owner read businesses" on rk_businesses;
create policy "rk owner read businesses"
  on rk_businesses for select to authenticated
  using (rk_is_superadmin() or owner_email = (auth.jwt() ->> 'email'));

drop policy if exists "rk superadmin all businesses" on rk_businesses;
create policy "rk superadmin all businesses"
  on rk_businesses for all to authenticated
  using (rk_is_superadmin()) with check (rk_is_superadmin());

-- events: public page bhej sakta hai (tracking)
drop policy if exists "rk anon insert events" on rk_events;
create policy "rk anon insert events"
  on rk_events for insert to anon with check (true);

-- events: owner apne business ke events dekhe, superadmin sab
drop policy if exists "rk owner read events" on rk_events;
create policy "rk owner read events"
  on rk_events for select to authenticated
  using (
    rk_is_superadmin()
    or business_id in (select id from rk_businesses where owner_email = (auth.jwt() ->> 'email'))
  );

drop policy if exists "rk superadmin all events" on rk_events;
create policy "rk superadmin all events"
  on rk_events for all to authenticated
  using (rk_is_superadmin()) with check (rk_is_superadmin());

-- profiles: khud ki row + superadmin
drop policy if exists "rk read profiles" on rk_profiles;
create policy "rk read profiles"
  on rk_profiles for select to authenticated
  using (user_id = auth.uid() or rk_is_superadmin());

drop policy if exists "rk superadmin manage profiles" on rk_profiles;
create policy "rk superadmin manage profiles"
  on rk_profiles for all to authenticated
  using (rk_is_superadmin()) with check (rk_is_superadmin());

-- businesses: owner apni details edit kar sakta hai (setup wizard)
-- lekin plan / expires_at / owner_email / slug nahi badal sakta (trigger guard)
drop policy if exists "rk owner update businesses" on rk_businesses;
create policy "rk owner update businesses"
  on rk_businesses for update to authenticated
  using (owner_email = (auth.jwt() ->> 'email'))
  with check (owner_email = (auth.jwt() ->> 'email'));

create or replace function rk_guard_business_update()
returns trigger language plpgsql as $$
begin
  if rk_is_superadmin() then return NEW; end if;
  if NEW.plan is distinct from OLD.plan
     or NEW.expires_at is distinct from OLD.expires_at
     or NEW.owner_email is distinct from OLD.owner_email
     or NEW.slug is distinct from OLD.slug then
    raise exception 'Not allowed: only a superadmin can change this';
  end if;
  return NEW;
end; $$;

drop trigger if exists rk_guard_business_update on rk_businesses;
create trigger rk_guard_business_update before update on rk_businesses
  for each row execute function rk_guard_business_update();

-- events: owner apne business ka feedback delete kar sakta hai
drop policy if exists "rk owner delete events" on rk_events;
create policy "rk owner delete events"
  on rk_events for delete to authenticated
  using (
    rk_is_superadmin()
    or business_id in (select id from rk_businesses where owner_email = (auth.jwt() ->> 'email'))
  );
