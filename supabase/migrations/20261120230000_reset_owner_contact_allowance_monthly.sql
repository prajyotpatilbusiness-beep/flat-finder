
alter table public.owner_contact_unlocks
  add column if not exists period_start timestamptz;

update public.owner_contact_unlocks
  set period_start = created_at
  where period_start is null;

alter table public.owner_contact_unlocks
  alter column period_start set default now(),
  alter column period_start set not null;

alter table public.owner_contact_unlocks
  drop constraint if exists owner_contact_unlocks_one_owner_per_subscription;

alter table public.owner_contact_unlocks
  add constraint owner_contact_unlocks_one_owner_per_month
  unique (user_id, subscription_id, owner_id, period_start);

create or replace function public.get_my_contact_usage()
returns table(plan_id text, contacts_limit integer, contacts_used integer, current_period_end timestamptz)
language plpgsql security definer set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_subscription public.subscriptions%rowtype;
  v_limit integer := 0;
  v_used integer := 0;
  v_period_start timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='SIGN_IN_REQUIRED';
  end if;

  select s.* into v_subscription
  from public.subscriptions s
  where s.user_id=v_user_id and s.status='active'
    and s.current_period_end is not null and s.current_period_end>now()
  order by s.created_at desc
  limit 1;

  if not found then
    return query select 'free'::text,0,0,null::timestamptz;
    return;
  end if;

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

  select count(*)::integer into v_used
  from public.owner_contact_unlocks u
  where u.user_id=v_user_id
    and u.subscription_id=v_subscription.id
    and u.period_start=v_period_start;

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
  v_period_start timestamptz;
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

  select u.phone,p.display_name into v_owner_phone,v_owner_name
    from auth.users u left join public.profiles p on p.id=u.id
    where u.id=v_listing.owner_id and u.phone_confirmed_at is not null;
  if v_owner_phone is null then raise exception using errcode='P0001', message='OWNER_CONTACT_NOT_VERIFIED'; end if;

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
