-- Public exploration is teaser-only. Full listing details and owner contacts require the authenticated RPC.
alter table public.subscriptions drop constraint if exists subscriptions_plan_id_check;
alter table public.subscriptions add constraint subscriptions_plan_id_check
  check (plan_id = any (array['free'::text, 'starter'::text, 'plus'::text, 'pro'::text]));
alter table public.subscriptions
  add column if not exists provider_order_id text,
  add column if not exists provider_payment_id text;
create unique index if not exists subscriptions_provider_order_id_uidx
  on public.subscriptions (provider_order_id) where provider_order_id is not null;
create unique index if not exists subscriptions_provider_payment_id_uidx
  on public.subscriptions (provider_payment_id) where provider_payment_id is not null;

create table if not exists public.owner_contact_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint owner_contact_unlocks_one_owner_per_subscription unique (user_id, subscription_id, owner_id)
);
create index if not exists owner_contact_unlocks_usage_idx
  on public.owner_contact_unlocks (user_id, subscription_id, created_at);
alter table public.owner_contact_unlocks enable row level security;
drop policy if exists owner_contact_unlocks_deny_client_access on public.owner_contact_unlocks;
create policy owner_contact_unlocks_deny_client_access on public.owner_contact_unlocks
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.owner_contact_unlocks from anon, authenticated;

revoke select on table public.listings from anon, authenticated;
revoke select (
  id, owner_id, title, description, purpose, property_type, bedrooms, bathrooms, area_sqft,
  furnishing, rent_inr, sale_price_inr, deposit_inr, available_from, city, state, locality,
  pincode, location, amenities, status, verification_status, verification_notes, is_featured,
  is_active, expires_at, created_at, updated_at
) on table public.listings from anon, authenticated;
grant select (id, title, purpose, property_type, bedrooms, city, state, rent_inr, sale_price_inr)
  on table public.listings to anon, authenticated;
drop view if exists public.listing_explore;
create view public.listing_explore with (security_invoker = true) as
select id,title,purpose,property_type,bedrooms,city,state,rent_inr,sale_price_inr
from public.listings
where status='approved' and is_active=true and (expires_at is null or expires_at>now());
grant select on public.listing_explore to anon, authenticated;

create or replace function public.get_my_contact_usage()
returns table(plan_id text, contacts_limit integer, contacts_used integer, current_period_end timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_subscription public.subscriptions%rowtype;
  v_limit integer := 0;
  v_used integer := 0;
begin
  if v_user_id is null then raise exception using errcode='42501', message='SIGN_IN_REQUIRED'; end if;
  select s.* into v_subscription from public.subscriptions s
  where s.user_id=v_user_id and s.status='active'
    and s.current_period_end is not null and s.current_period_end>now()
  order by s.created_at desc limit 1;
  if not found then return query select 'free'::text,0,0,null::timestamptz; return; end if;
  v_limit := case v_subscription.plan_id when 'starter' then 5 when 'plus' then 15 when 'pro' then 50 else 0 end;
  select count(*)::integer into v_used from public.owner_contact_unlocks u
  where u.user_id=v_user_id and u.subscription_id=v_subscription.id;
  return query select v_subscription.plan_id,v_limit,v_used,v_subscription.current_period_end;
end;
$function$;
revoke all on function public.get_my_contact_usage() from public, anon;
grant execute on function public.get_my_contact_usage() to authenticated;

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
  v_already_unlocked boolean := false;
begin
  if v_user_id is null then raise exception using errcode='42501', message='SIGN_IN_REQUIRED'; end if;
  select u.phone into v_user_phone from auth.users u
    where u.id=v_user_id and u.phone_confirmed_at is not null;
  if v_user_phone is null then raise exception using errcode='42501', message='PHONE_VERIFICATION_REQUIRED'; end if;

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

  v_limit := case v_subscription.plan_id when 'starter' then 5 when 'plus' then 15 when 'pro' then 50 else 0 end;
  select u.phone,p.display_name into v_owner_phone,v_owner_name
    from auth.users u left join public.profiles p on p.id=u.id
    where u.id=v_listing.owner_id and u.phone_confirmed_at is not null;
  if v_owner_phone is null then raise exception using errcode='P0001', message='OWNER_CONTACT_NOT_VERIFIED'; end if;

  select exists(select 1 from public.owner_contact_unlocks u
    where u.user_id=v_user_id and u.subscription_id=v_subscription.id and u.owner_id=v_listing.owner_id)
    into v_already_unlocked;
  select count(*)::integer into v_used from public.owner_contact_unlocks u
    where u.user_id=v_user_id and u.subscription_id=v_subscription.id;
  if not v_already_unlocked and v_used>=v_limit then
    raise exception using errcode='P0001', message='CONTACT_LIMIT_REACHED';
  end if;
  if not v_already_unlocked then
    insert into public.owner_contact_unlocks(user_id,owner_id,listing_id,subscription_id)
      values(v_user_id,v_listing.owner_id,v_listing.id,v_subscription.id)
      on conflict(user_id,subscription_id,owner_id) do nothing;
    v_used:=v_used+1;
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
revoke insert, update, delete on table public.subscriptions from anon, authenticated;
