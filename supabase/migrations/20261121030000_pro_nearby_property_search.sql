-- Premium radius discovery is exclusive to the Pro subscription.

-- Public Explore exposes only the safe fields needed for property cards and filters.
grant select (
  bathrooms, furnishing, amenities, verification_status, is_featured, available_from, created_at
) on table public.listings to anon, authenticated;

drop view if exists public.listing_explore;
create view public.listing_explore
with (security_invoker = true)
as
select
  id,
  title,
  purpose,
  property_type,
  bedrooms,
  bathrooms,
  city,
  state,
  locality,
  area_sqft,
  furnishing,
  amenities,
  rent_inr,
  sale_price_inr,
  verification_status,
  is_featured,
  available_from,
  created_at
from public.listings
where status = 'approved'
  and is_active = true
  and (expires_at is null or expires_at > now());

grant select on public.listing_explore to anon, authenticated;


-- Exact user coordinates are provided by the browser after an explicit click and are not stored.
create or replace function public.search_nearby_listings(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km integer default 5,
  p_limit integer default 300
)
returns table (
  id uuid,
  title text,
  purpose text,
  property_type text,
  bedrooms integer,
  bathrooms integer,
  area_sqft integer,
  furnishing text,
  amenities text[],
  city text,
  state text,
  locality text,
  rent_inr bigint,
  sale_price_inr bigint,
  lat double precision,
  lng double precision,
  distance_m double precision,
  verification_status text,
  is_featured boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_point extensions.geography;
  v_radius_m double precision;
  v_has_pro boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'SIGN_IN_REQUIRED';
  end if;

  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'INVALID_COORDINATES';
  end if;

  if p_radius_km is null or p_radius_km not between 1 and 25 then
    raise exception using errcode = '22023', message = 'INVALID_RADIUS';
  end if;

  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = v_user_id
      and s.status = 'active'
      and s.current_period_end is not null
      and s.current_period_end > now()
      and s.plan_id = 'pro'
  ) into v_has_pro;

  if not v_has_pro then
    raise exception using errcode = 'P0001', message = 'PRO_PLAN_REQUIRED';
  end if;

  v_point := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude), 4326
  )::extensions.geography;
  v_radius_m := p_radius_km * 1000.0;

  return query
  select
    l.id,
    l.title,
    l.purpose,
    l.property_type,
    l.bedrooms,
    l.bathrooms,
    l.area_sqft,
    l.furnishing,
    l.amenities,
    l.city,
    l.state,
    l.locality,
    l.rent_inr,
    l.sale_price_inr,
    extensions.st_y(l.location::extensions.geometry) as lat,
    extensions.st_x(l.location::extensions.geometry) as lng,
    extensions.st_distance(l.location, v_point) as distance_m,
    l.verification_status,
    l.is_featured,
    l.created_at
  from public.listings l
  where l.status = 'approved'
    and l.is_active = true
    and (l.expires_at is null or l.expires_at > now())
    and l.owner_id <> v_user_id
    and extensions.st_dwithin(l.location, v_point, v_radius_m)
  order by extensions.st_distance(l.location, v_point), l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 300), 500));
end;
$function$;

revoke all on function public.search_nearby_listings(double precision, double precision, integer, integer) from public, anon;
grant execute on function public.search_nearby_listings(double precision, double precision, integer, integer) to authenticated;
