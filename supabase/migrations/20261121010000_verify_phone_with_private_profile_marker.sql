
-- Store buyer/owner mobile verification in the private profile table.
-- Phone verification is performed by the authenticated verify-phone Edge Function,
-- not by Supabase Auth's phone_change field.

alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

-- Existing profile.phone values came from signup metadata and are not verified.
update public.profiles
set phone = null, phone_verified_at = null
where phone_verified_at is null;

create unique index if not exists profiles_verified_phone_uidx
  on public.profiles (phone)
  where phone is not null and phone_verified_at is not null;

-- Browser users can read their own phone status but cannot self-assert verification.
revoke update (phone, phone_verified_at) on table public.profiles from authenticated;
grant select (phone_verified_at) on table public.profiles to authenticated;
grant select (phone) on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- Signup metadata is untrusted. Do not copy it into the verified phone field.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    'seeker'
  )
  on conflict (id) do update
  set display_name = coalesce(public.profiles.display_name, excluded.display_name);

  return new;
end;
$function$;

create table if not exists public.phone_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_hash text not null,
  phone_last_four text not null,
  status text not null default 'pending'
    check (status in ('pending','verified','expired','failed')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 10),
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists phone_verification_requests_user_time_idx
  on public.phone_verification_requests (user_id, created_at desc);
create index if not exists phone_verification_requests_hash_time_idx
  on public.phone_verification_requests (phone_hash, created_at desc);

alter table public.phone_verification_requests enable row level security;
drop policy if exists phone_verification_requests_deny_client_access
  on public.phone_verification_requests;
create policy phone_verification_requests_deny_client_access
  on public.phone_verification_requests
  for all to anon, authenticated
  using (false) with check (false);
revoke all on table public.phone_verification_requests from anon, authenticated;

-- Phone contact release now depends on the server-verified profile marker.
create or replace function public.reveal_owner_contact(p_listing_id uuid)
returns table(
  listing_id uuid,title text,description text,purpose text,property_type text,bedrooms integer,
  bathrooms integer,area_sqft integer,city text,state text,locality text,pincode text,
  rent_inr bigint,sale_price_inr bigint,deposit_inr bigint,furnishing text,amenities text[],
  owner_name text,owner_phone text,plan_id text,contacts_limit integer,contacts_used integer,
  current_period_end timestamptz,already_unlocked boolean
)
language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_listing public.listings%rowtype;
  v_subscription public.subscriptions%rowtype;
  v_user_phone text;
  v_owner_phone text;
  v_owner_name text;
  v_limit integer := 0;
  v_used integer := 0;
  v_period_start timestamptz;
  v_already_unlocked boolean := false;
begin
  if v_user_id is null then raise exception using errcode='42501', message='SIGN_IN_REQUIRED'; end if;

  select p.phone into v_user_phone
  from public.profiles p
  where p.id=v_user_id and p.phone_verified_at is not null and p.phone is not null;
  if v_user_phone is null then
    raise exception using errcode='42501', message='PHONE_VERIFICATION_REQUIRED';
  end if;

  select l.* into v_listing from public.listings l
    where l.id=p_listing_id and l.status='approved' and l.is_active=true
      and (l.expires_at is null or l.expires_at>now()) and l.owner_id<>v_user_id;
  if not found then raise exception using errcode='P0002', message='LISTING_NOT_AVAILABLE'; end if;

  select s.* into v_subscription from public.subscriptions s
    where s.user_id=v_user_id and s.status='active'
      and s.current_period_end is not null and s.current_period_end>now()
      and s.plan_id in ('starter','plus','pro')
    order by s.created_at desc limit 1;
  if not found then raise exception using errcode='P0001', message='SUBSCRIPTION_REQUIRED'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || v_subscription.id::text, 0)
  );

  select s.* into v_subscription from public.subscriptions s
    where s.id=v_subscription.id and s.user_id=v_user_id and s.status='active'
      and s.current_period_end is not null and s.current_period_end>now()
      and s.plan_id in ('starter','plus','pro');
  if not found then raise exception using errcode='P0001', message='SUBSCRIPTION_REQUIRED'; end if;

  v_limit := case v_subscription.plan_id
    when 'starter' then 5
    when 'plus' then 15
    when 'pro' then 50
    else 0
  end;

  v_period_start := v_subscription.created_at;
  while v_period_start + interval '1 month' <= now() loop
    v_period_start := v_period_start + interval '1 month';
  end loop;

  select p.phone, p.display_name
    into v_owner_phone, v_owner_name
  from public.profiles p
  where p.id=v_listing.owner_id
    and p.phone_verified_at is not null
    and p.phone is not null;
  if v_owner_phone is null then
    raise exception using errcode='P0001', message='OWNER_CONTACT_NOT_VERIFIED';
  end if;

  select exists(
    select 1 from public.owner_contact_unlocks u
    where u.user_id=v_user_id
      and u.subscription_id=v_subscription.id
      and u.owner_id=v_listing.owner_id
      and u.period_start=v_period_start
  ) into v_already_unlocked;

  select count(*)::integer into v_used
    from public.owner_contact_unlocks u
    where u.user_id=v_user_id
      and u.subscription_id=v_subscription.id
      and u.period_start=v_period_start;

  if not v_already_unlocked and v_used>=v_limit then
    raise exception using errcode='P0001', message='CONTACT_LIMIT_REACHED';
  end if;

  if not v_already_unlocked then
    insert into public.owner_contact_unlocks(user_id,owner_id,listing_id,subscription_id,period_start)
      values(v_user_id,v_listing.owner_id,v_listing.id,v_subscription.id,v_period_start)
      on conflict(user_id,subscription_id,owner_id,period_start) do nothing;
    select count(*)::integer into v_used
      from public.owner_contact_unlocks u
      where u.user_id=v_user_id
        and u.subscription_id=v_subscription.id
        and u.period_start=v_period_start;
  end if;

  return query select v_listing.id,v_listing.title,v_listing.description,v_listing.purpose,
    v_listing.property_type,v_listing.bedrooms,v_listing.bathrooms,v_listing.area_sqft,
    v_listing.city,v_listing.state,v_listing.locality,v_listing.pincode,v_listing.rent_inr,
    v_listing.sale_price_inr,v_listing.deposit_inr,v_listing.furnishing,v_listing.amenities,
    v_owner_name,v_owner_phone,v_subscription.plan_id,v_limit,v_used,
    v_subscription.current_period_end,v_already_unlocked;
end;
$function$;
revoke all on function public.reveal_owner_contact(uuid) from public, anon;
grant execute on function public.reveal_owner_contact(uuid) to authenticated;
