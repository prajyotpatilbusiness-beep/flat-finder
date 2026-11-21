-- Applied to the Flat Finder Supabase project as migration 20261121072313.
-- Storage currently has no buckets. The managed Storage table owner retains
-- default table grants, so explicit restrictive policies ensure anon and
-- authenticated roles remain denied even if a permissive policy is later added.
DROP POLICY IF EXISTS flat_finder_client_storage_closed ON storage.objects;
CREATE POLICY flat_finder_client_storage_closed
  ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS flat_finder_client_buckets_closed ON storage.buckets;
CREATE POLICY flat_finder_client_buckets_closed
  ON storage.buckets AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
