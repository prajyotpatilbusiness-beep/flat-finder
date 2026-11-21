-- Applied to the Flat Finder Supabase project as migration 20261121070139.
-- Serialize membership activation and owner-contact unlocks under one per-user lock.
-- Remove anonymous access to future photo-path metadata until a reviewed delivery flow exists.

REVOKE SELECT (id, listing_id, owner_id, object_path, sort_order, created_at)
  ON TABLE public.listing_photos FROM anon;

DROP POLICY IF EXISTS listing_photos_read_approved_or_owned ON public.listing_photos;
CREATE POLICY listing_photos_read_approved_or_owned
  ON public.listing_photos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings AS l
      WHERE l.id = listing_photos.listing_id
        AND (
          (l.status = 'approved' AND l.is_active = true)
          OR l.owner_id = (SELECT auth.uid())
        )
    )
  );

CREATE OR REPLACE FUNCTION public.activate_paid_subscription(
  p_user_id uuid,
  p_plan_id text,
  p_billing_interval text,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_current_period_end timestamptz
)
RETURNS TABLE(id uuid, plan_id text, status text, billing_interval text,
              current_period_start timestamptz, current_period_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_previous public.subscriptions%rowtype;
  v_period_start timestamptz;
  v_new public.subscriptions%rowtype;
BEGIN
  IF p_user_id IS NULL
    OR p_plan_id NOT IN ('starter','plus','pro')
    OR p_billing_interval NOT IN ('monthly','annual')
    OR p_provider_order_id IS NULL OR btrim(p_provider_order_id) = ''
    OR p_provider_payment_id IS NULL OR btrim(p_provider_payment_id) = ''
    OR p_current_period_end IS NULL OR p_current_period_end <= now()
  THEN
    RAISE EXCEPTION USING errcode='22023', message='INVALID_SUBSCRIPTION_ARGUMENTS';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':membership-access', 0));

  SELECT s.* INTO v_new
  FROM public.subscriptions AS s
  WHERE s.provider_payment_id = p_provider_payment_id
     OR s.provider_order_id = p_provider_order_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_new.user_id <> p_user_id
      OR v_new.provider_payment_id <> p_provider_payment_id
      OR v_new.provider_order_id <> p_provider_order_id
    THEN
      RAISE EXCEPTION USING errcode='23505', message='PAYMENT_ALREADY_USED';
    END IF;
    RETURN QUERY SELECT v_new.id, v_new.plan_id, v_new.status, v_new.billing_interval,
                        v_new.current_period_start, v_new.current_period_end;
    RETURN;
  END IF;

  SELECT s.* INTO v_previous
  FROM public.subscriptions AS s
  WHERE s.user_id = p_user_id AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND AND v_previous.current_period_end > now() THEN
    v_period_start := v_previous.current_period_start;
    UPDATE public.subscriptions SET status = 'cancelled' WHERE id = v_previous.id;
  ELSE
    v_period_start := now();
    UPDATE public.subscriptions SET status = 'expired'
    WHERE user_id = p_user_id AND status = 'active';
  END IF;

  INSERT INTO public.subscriptions(
    user_id, plan_id, billing_interval, provider, provider_order_id,
    provider_payment_id, status, current_period_start, current_period_end
  ) VALUES (
    p_user_id, p_plan_id, p_billing_interval, 'razorpay', p_provider_order_id,
    p_provider_payment_id, 'active', v_period_start, p_current_period_end
  )
  RETURNING * INTO v_new;

  RETURN QUERY SELECT v_new.id, v_new.plan_id, v_new.status, v_new.billing_interval,
                      v_new.current_period_start, v_new.current_period_end;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reveal_owner_contact(p_listing_id uuid)
RETURNS TABLE(
  listing_id uuid, title text, description text, purpose text, property_type text,
  bedrooms integer, bathrooms integer, area_sqft integer, city text, state text,
  locality text, pincode text, rent_inr bigint, sale_price_inr bigint,
  deposit_inr bigint, furnishing text, amenities text[], owner_name text,
  owner_phone text, plan_id text, contacts_limit integer, contacts_used integer,
  current_period_end timestamptz, already_unlocked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING errcode='42501', message='SIGN_IN_REQUIRED';
  END IF;

  SELECT p.phone INTO v_user_phone
  FROM public.profiles AS p
  WHERE p.id = v_user_id AND p.phone_verified_at IS NOT NULL AND p.phone IS NOT NULL;

  IF v_user_phone IS NULL THEN
    RAISE EXCEPTION USING errcode='42501', message='PHONE_VERIFICATION_REQUIRED';
  END IF;

  SELECT l.* INTO v_listing
  FROM public.listings AS l
  WHERE l.id = p_listing_id AND l.status = 'approved' AND l.is_active = true
    AND (l.expires_at IS NULL OR l.expires_at > now()) AND l.owner_id <> v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode='P0002', message='LISTING_NOT_AVAILABLE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':membership-access', 0));

  SELECT s.* INTO v_subscription
  FROM public.subscriptions AS s
  WHERE s.user_id = v_user_id AND s.status = 'active'
    AND s.current_period_end IS NOT NULL AND s.current_period_end > now()
    AND s.plan_id IN ('starter','plus','pro')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode='P0001', message='SUBSCRIPTION_REQUIRED';
  END IF;

  v_limit := CASE v_subscription.plan_id
    WHEN 'starter' THEN 5 WHEN 'plus' THEN 15 WHEN 'pro' THEN 50 ELSE 0
  END;

  v_period_start := v_subscription.current_period_start;
  WHILE v_period_start + interval '1 month' <= now() LOOP
    v_period_start := v_period_start + interval '1 month';
  END LOOP;

  SELECT p.phone, p.display_name INTO v_owner_phone, v_owner_name
  FROM public.profiles AS p
  WHERE p.id = v_listing.owner_id AND p.phone_verified_at IS NOT NULL AND p.phone IS NOT NULL;

  IF v_owner_phone IS NULL THEN
    RAISE EXCEPTION USING errcode='P0001', message='OWNER_CONTACT_NOT_VERIFIED';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.owner_contact_unlocks AS u
    WHERE u.user_id = v_user_id AND u.owner_id = v_listing.owner_id
      AND u.period_start = v_period_start
  ) INTO v_already_unlocked;

  SELECT count(*)::integer INTO v_used
  FROM public.owner_contact_unlocks AS u
  WHERE u.user_id = v_user_id AND u.period_start = v_period_start;

  IF NOT v_already_unlocked AND v_used >= v_limit THEN
    RAISE EXCEPTION USING errcode='P0001', message='CONTACT_LIMIT_REACHED';
  END IF;

  IF NOT v_already_unlocked THEN
    INSERT INTO public.owner_contact_unlocks(
      user_id, owner_id, listing_id, subscription_id, period_start
    ) VALUES (
      v_user_id, v_listing.owner_id, v_listing.id, v_subscription.id, v_period_start
    ) ON CONFLICT (user_id, owner_id, period_start) DO NOTHING;

    SELECT count(*)::integer INTO v_used
    FROM public.owner_contact_unlocks AS u
    WHERE u.user_id = v_user_id AND u.period_start = v_period_start;
  END IF;

  RETURN QUERY SELECT v_listing.id, v_listing.title, v_listing.description,
    v_listing.purpose, v_listing.property_type, v_listing.bedrooms, v_listing.bathrooms,
    v_listing.area_sqft, v_listing.city, v_listing.state, v_listing.locality,
    v_listing.pincode, v_listing.rent_inr, v_listing.sale_price_inr,
    v_listing.deposit_inr, v_listing.furnishing, v_listing.amenities,
    v_owner_name, v_owner_phone, v_subscription.plan_id, v_limit, v_used,
    v_subscription.current_period_end, v_already_unlocked;
END;
$function$;

-- Keep the pre-existing EXECUTE grants unchanged:
-- reveal_owner_contact: authenticated only; activate_paid_subscription: service_role only.
