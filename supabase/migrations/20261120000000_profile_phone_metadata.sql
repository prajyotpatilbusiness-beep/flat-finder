-- Keep the user's Indian mobile number in their private profile when their auth account is created.
-- public.profiles.phone is protected by the existing profiles_read_own and profiles_update_own_name RLS policies.

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, display_name, phone, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'seeker'
  )
  on conflict (id) do update
  set
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    phone = coalesce(public.profiles.phone, excluded.phone);

  return new;
end;
$function$;
