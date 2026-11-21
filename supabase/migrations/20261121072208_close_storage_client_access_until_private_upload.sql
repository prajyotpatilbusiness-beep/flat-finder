-- Applied to the Flat Finder Supabase project as migration 20261121072208.
-- Supabase Storage has no buckets or policies yet. Attempt to remove client
-- table privileges while the private upload/read design is still pending.
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE storage.buckets FROM anon, authenticated;
