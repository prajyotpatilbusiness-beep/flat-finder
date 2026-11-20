create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists profiles(
 id uuid primary key,
 role text not null default 'seeker' check(role in('seeker','owner','agent','admin')),
 display_name text,
 created_at timestamptz not null default now()
);

create table if not exists listings(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references profiles(id) on delete cascade,
 title text not null check(char_length(title) between 8 and 120),
 description text not null default '',
 purpose text not null check(purpose in('rent','sale')),
 property_type text not null,
 bedrooms integer not null default 0 check(bedrooms between 0 and 20),
 bathrooms integer not null default 0 check(bathrooms between 0 and 30),
 area_sqft integer not null check(area_sqft between 100 and 100000),
 furnishing text not null default 'Unspecified',
 rent_inr bigint check(rent_inr is null or rent_inr>0),
 sale_price_inr bigint check(sale_price_inr is null or sale_price_inr>0),
 deposit_inr bigint check(deposit_inr is null or deposit_inr>=0),
 available_from date,
 city text not null,
 state text not null,
 locality text not null,
 pincode text check(pincode is null or pincode ~ '^[0-9]{6}$'),
 location geography(point,4326) not null,
 amenities text[] not null default '{}',
 status text not null default 'draft' check(status in('draft','pending_review','approved','rejected','paused')),
 verification_status text not null default 'unverified' check(verification_status in('unverified','identity_checked','ownership_checked','verified')),
 verification_notes text,
 is_featured boolean not null default false,
 is_active boolean not null default true,
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists listings_location_gix on listings using gist(location);
create index if not exists listings_search_idx on listings(city,locality,purpose,status,is_active);
create index if not exists listings_price_idx on listings(purpose,rent_inr,sale_price_inr);

create table if not exists listing_photos(
 id uuid primary key default gen_random_uuid(),
 listing_id uuid not null references listings(id) on delete cascade,
 owner_id uuid not null references profiles(id) on delete cascade,
 object_path text not null unique,
 sort_order smallint not null default 0,
 created_at timestamptz not null default now()
);

create table if not exists saved_listings(
 user_id uuid not null references profiles(id) on delete cascade,
 listing_id uuid not null references listings(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,listing_id)
);

create table if not exists listing_reports(
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references profiles(id) on delete cascade,
 listing_id uuid not null references listings(id) on delete cascade,
 reason text not null,
 details text,
 status text not null default 'open' check(status in('open','reviewing','resolved','dismissed')),
 created_at timestamptz not null default now()
);

create table if not exists subscriptions(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references profiles(id) on delete cascade,
 plan_id text not null check(plan_id in('free','plus','pro')),
 billing_interval text not null check(billing_interval in('monthly','annual')),
 provider text not null default 'razorpay',
 provider_subscription_id text unique,
 status text not null default 'pending',
 current_period_end timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists payment_events(
 id uuid primary key default gen_random_uuid(),
 provider_event_id text not null unique,
 event_type text not null,
 payment_id text,
 subscription_id text,
 amount_inr numeric(14,2),
 currency text,
 status text,
 received_at timestamptz not null default now(),
 processed_at timestamptz
);

create table if not exists moderation_history(
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references profiles(id) on delete set null,
 listing_id uuid references listings(id) on delete cascade,
 action text not null,
 metadata jsonb not null default '{}',
 created_at timestamptz not null default now()
);

create index if not exists moderation_listing_idx on moderation_history(listing_id,created_at desc);
