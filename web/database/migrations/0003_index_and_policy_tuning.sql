-- Cover foreign-key lookups and merge listing SELECT policies to reduce policy overhead.
create index if not exists listing_photos_owner_idx on public.listing_photos(owner_id);
create index if not exists listing_reports_listing_idx on public.listing_reports(listing_id);
create index if not exists listing_reports_reporter_idx on public.listing_reports(reporter_id);
create index if not exists moderation_history_actor_idx on public.moderation_history(actor_id);

drop policy if exists listings_public_read_approved on public.listings;
drop policy if exists listings_owner_read_own on public.listings;
create policy listings_public_or_owner_read on public.listings
  for select to anon, authenticated
  using (
    (status = 'approved' and is_active = true and (expires_at is null or expires_at > now()))
    or (select auth.uid()) = owner_id
  );
