
-- Expire abandoned phone-change requests so Supabase cannot match an old phone_change
-- value to the wrong account during OTP verification.
update auth.users
set phone_change = null,
    phone_change_token = null,
    phone_change_sent_at = null
where coalesce(phone_change, '') <> ''
  and phone_change_sent_at < now() - interval '2 hours';

-- There must never be two accounts waiting to verify the same phone number.
create unique index if not exists auth_users_pending_phone_change_uidx
  on auth.users (phone_change)
  where phone_change is not null and phone_change <> '';

create or replace function public.prepare_phone_change(p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'SIGN_IN_REQUIRED';
  end if;

  if p_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception using errcode = '22023', message = 'INVALID_INDIAN_MOBILE_NUMBER';
  end if;

  -- Clear only expired requests for this requested number. Supabase's OTP lifetime
  -- is shorter than this grace period; active requests remain reserved.
  update auth.users
  set phone_change = null,
      phone_change_token = null,
      phone_change_sent_at = null
  where phone_change = p_phone
    and phone_change_sent_at < now() - interval '2 hours';

  if exists (
    select 1
    from auth.users u
    where u.id <> v_user_id
      and u.phone_change = p_phone
  ) then
    raise exception using errcode = 'P0001', message = 'PHONE_CHANGE_IN_PROGRESS';
  end if;
end;
$function$;

revoke all on function public.prepare_phone_change(text) from public, anon;
grant execute on function public.prepare_phone_change(text) to authenticated;
