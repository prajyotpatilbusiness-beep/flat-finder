
grant select (
  id, title, purpose, property_type, bedrooms, city, state, rent_inr, sale_price_inr,
  status, is_active, expires_at, locality, area_sqft
) on table public.listings to anon, authenticated;

create or replace view public.listing_explore
with (security_invoker = true)
as
select
  id,
  title,
  purpose,
  property_type,
  bedrooms,
  city,
  state,
  rent_inr,
  sale_price_inr,
  locality,
  area_sqft
from public.listings
where status = 'approved'
  and is_active = true
  and (expires_at is null or expires_at > now());

grant select on public.listing_explore to anon, authenticated;
