-- Additional access hardening after the initial marketplace schema.
-- Client users can read only their own subscription summary.
-- Payment events and moderation history remain server-only.
grant select (id, plan_id, billing_interval, status, current_period_end, created_at)
  on public.subscriptions to authenticated;

create policy subscriptions_read_own on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy payment_events_deny_client_access on public.payment_events
  for all to anon, authenticated
  using (false)
  with check (false);

create policy moderation_history_deny_client_access on public.moderation_history
  for all to anon, authenticated
  using (false)
  with check (false);

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
