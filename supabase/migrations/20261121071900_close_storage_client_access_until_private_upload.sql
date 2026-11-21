-- Applied as Supabase migration 202611210719xx.
-- There are currently no buckets or storage policies. Keep client object access
-- revoked until a private owner-photo upload/download flow is built.
REVOKE ALL PRIVILEGES ON TABLE storage.objects FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE storage.buckets FROM anon, authenticated;
