-- Applied to the Flat Finder Supabase project as migration 20261121070512.
-- Enforce phone-wide daily OTP caps and atomic verification-attempt accounting.

CREATE INDEX IF NOT EXISTS phone_verification_requests_phone_sent_idx
  ON public.phone_verification_requests (phone_hash, sent_at DESC);
CREATE INDEX IF NOT EXISTS phone_verification_requests_user_sent_idx
  ON public.phone_verification_requests (user_id, sent_at DESC);

CREATE OR REPLACE FUNCTION public.reserve_phone_otp_send(
  p_user_id uuid, p_phone_hash text, p_phone_last_four text, p_now timestamptz
)
RETURNS TABLE(request_id uuid, sent_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_phone_count integer;
  v_user_count integer;
  v_last_phone timestamptz;
  v_last_user timestamptz;
  v_request_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR p_now IS NULL
    OR coalesce(p_phone_hash, '') !~ '^[a-f0-9]{64}$'
    OR coalesce(p_phone_last_four, '') !~ '^[0-9]{4}$'
  THEN
    RAISE EXCEPTION USING errcode='22023', message='INVALID_OTP_RESERVATION';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_phone_hash || ':otp-phone-send', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':otp-user-send', 0));

  SELECT count(*)::integer, max(r.sent_at)
    INTO v_phone_count, v_last_phone
  FROM public.phone_verification_requests AS r
  WHERE r.phone_hash = p_phone_hash
    AND r.sent_at >= p_now - interval '24 hours';

  IF v_phone_count >= 5 THEN
    RAISE EXCEPTION USING errcode='P0001', message='OTP_PHONE_DAILY_LIMIT_REACHED';
  END IF;
  IF v_last_phone IS NOT NULL AND v_last_phone > p_now - interval '60 seconds' THEN
    RAISE EXCEPTION USING errcode='P0001', message='OTP_PHONE_COOLDOWN_ACTIVE';
  END IF;

  SELECT count(*)::integer, max(r.sent_at)
    INTO v_user_count, v_last_user
  FROM public.phone_verification_requests AS r
  WHERE r.user_id = p_user_id
    AND r.sent_at >= p_now - interval '24 hours';

  IF v_user_count >= 5 THEN
    RAISE EXCEPTION USING errcode='P0001', message='OTP_DAILY_LIMIT_REACHED';
  END IF;
  IF v_last_user IS NOT NULL AND v_last_user > p_now - interval '60 seconds' THEN
    RAISE EXCEPTION USING errcode='P0001', message='OTP_COOLDOWN_ACTIVE';
  END IF;

  v_expires_at := p_now + interval '10 minutes';
  INSERT INTO public.phone_verification_requests(
    user_id, phone_hash, phone_last_four, status, attempts, sent_at, expires_at
  ) VALUES (
    p_user_id, p_phone_hash, p_phone_last_four, 'pending', 0, p_now, v_expires_at
  )
  RETURNING id INTO v_request_id;

  RETURN QUERY SELECT v_request_id, p_now, v_expires_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_phone_otp_attempt(
  p_user_id uuid, p_phone_hash text, p_now timestamptz
)
RETURNS TABLE(request_id uuid, attempts integer, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_request public.phone_verification_requests%rowtype;
BEGIN
  IF p_user_id IS NULL OR p_now IS NULL
    OR coalesce(p_phone_hash, '') !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION USING errcode='22023', message='INVALID_OTP_ATTEMPT';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_phone_hash || ':otp-verify', 0)
  );

  SELECT r.* INTO v_request
  FROM public.phone_verification_requests AS r
  WHERE r.user_id = p_user_id AND r.phone_hash = p_phone_hash
    AND r.status = 'pending' AND r.expires_at > p_now
  ORDER BY r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode='P0001', message='OTP_EXPIRED_OR_NOT_FOUND';
  END IF;
  IF v_request.attempts >= 5 THEN
    RAISE EXCEPTION USING errcode='P0001', message='OTP_ATTEMPT_LIMIT_REACHED';
  END IF;

  UPDATE public.phone_verification_requests AS r
  SET attempts = v_request.attempts + 1
  WHERE r.id = v_request.id;

  RETURN QUERY SELECT v_request.id, v_request.attempts + 1, v_request.expires_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_phone_otp_send(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_phone_otp_send(uuid, text, text, timestamptz)
  TO service_role;
REVOKE ALL ON FUNCTION public.claim_phone_otp_attempt(uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_phone_otp_attempt(uuid, text, timestamptz)
  TO service_role;
