-- Flat Finder marketplace schema.
-- RLS is enabled on every public table. Only approved active listings are public.
-- Profile roles, moderation fields and payment state are server-managed.

create extension if not exists postgis with schema extensions;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  role text not null default 'seeker'
    check (role in ('seeker', 'owner', 'agent', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 8 and 120),
  description text not null default '',
  purpose text not null check (purpose in ('rent', 'sale')),
  property_type text not null,
  bedrooms integer not null default 0 check (bedrooms between 0 and 20),
  bathrooms integer not null default 0 check (bathrooms between 0 and 30),
  area_sqft integer not null check (area_sqft between 100 and 100000),
  furnishing text not null default 'Unspecified',
  rent_inr bigint check (rent_inr is null or rent_inr > 0),
  sale_price_inr bigint check (sale_price_inr is null or sale_price_inr > 0),
  deposit_inr bigint check (deposit_inr is null or deposit_inr >= 0),
  available_from date,
  city text not null,
  state text not null,
  locality text not null,
  pincode text check (pincode is null or pincode ~ '^[0-9]{6}$'),
  location extensions.geography(Point,4326) not null,
  amenities text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'approved', 'rejected', 'paused')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'identity_checked', 'ownership_checked', 'verified')),
  verification_notes text,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_location_gix on public.listings using gist (location);
create index listings_search_idx on public.listings (city, locality, purpose, status, is_active);
create index listings_rent_price_idx on public.listings (rent_inr) where purpose = 'rent';
create index listings_sale_price_idx on public.listings (sale_price_inr) where purpose = 'sale';
create index listings_owner_idx on public.listings (owner_id, created_at desc);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);
create index listing_photos_listing_idx on public.listing_photos (listing_id, sort_order);

create table public.saved_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index saved_listings_listing_idx on public.saved_listings (listing_id);

create table public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  reason text not null check (reason in ('fraud', 'inaccurate', 'duplicate', 'inappropriate', 'other')),
  details text check (details is null or char_length(details) <= 2000),
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);
create index listing_reports_status_idx on public.listing_reports (status, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null check (plan_id in ('free', 'plus', 'pro')),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  provider text not null default 'razorpay',
  provider_subscription_id text unique,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'halted', 'cancelled', 'expired', 'failed')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text not null,
  payment_id text,
  subscription_id text,
  amount_inr numeric(14,2),
  currency text not null default 'INR',
  status text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.moderation_history (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  listing_id uuid references public.listings(id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index moderation_history_listing_idx on public.moderation_history (listing_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.saved_listings enable row level security;
alter table public.listing_reports enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_events enable row level security;
alter table public.moderation_history enable row level security;

create policy profiles_read_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_own_name on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy listings_public_read_approved on public.listings
  for select to anon, authenticated
  using (
    status = 'approved'
    and is_active = true
    and (expires_at is null or expires_at > now())
  );
create policy listings_owner_read_own on public.listings
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy listing_photos_read_approved_or_owned on public.listing_photos
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_photos.listing_id
        and (
          (l.status = 'approved' and l.is_active = true)
          or l.owner_id = (select auth.uid())
        )
    )
  );

create policy saved_listings_manage_own on public.saved_listings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy listing_reports_insert_own on public.listing_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1 from public.listings l
      where l.id = listing_reports.listing_id
        and l.status = 'approved'
        and l.is_active = true
    )
  );

create policy subscriptions_read_own on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy payment_events_deny_client_access on public.payment_events
  for all to anon, authenticated using (false) with check (false);
create policy moderation_history_deny_client_access on public.moderation_history
  for all to anon, authenticated using (false) with check (false);

revoke all on table public.profiles, public.listings, public.listing_photos,
  public.saved_listings, public.listing_reports, public.subscriptions,
  public.payment_events, public.moderation_history
  from public, anon, authenticated;

grant select (id, display_name, created_at), update (display_name)
  on public.profiles to authenticated;
grant select (
  id, title, description, purpose, property_type, bedrooms, bathrooms,
  area_sqft, furnishing, rent_inr, sale_price_inr, deposit_inr, available_from,
  city, state, locality, pincode, location, amenities, status,
  verification_status, is_featured, created_at, updated_at
) on public.listings to anon, authenticated;
grant select (id, listing_id, object_path, sort_order, created_at)
  on public.listing_photos to anon, authenticated;
grant select, insert, delete on public.saved_listings to authenticated;
grant insert (reporter_id, listing_id, reason, details)
  on public.listing_reports to authenticated;
grant select (id, plan_id, billing_interval, status, current_period_end, created_at)
  on public.subscriptions to authenticated;

grant all privileges on table public.profiles, public.listings, public.listing_photos,
  public.saved_listings, public.listing_reports, public.subscriptions,
  public.payment_events, public.moderation_history to service_role;

grant usage on schema extensions to anon, authenticated, service_role;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    'seeker'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function app_private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
