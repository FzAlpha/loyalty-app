alter table public.offers enable row level security;
alter table public.offer_schedules enable row level security;
alter table public.customer_groups enable row level security;
alter table public.customer_group_members enable row level security;
alter table public.offer_eligible_groups enable row level security;
alter table public.offer_usage enable row level security;
alter table public.offer_categories enable row level security;

-- §5: signed-in users read active offers inside their dates; offer managers read all of their
-- business's offers. No write policies: RPCs only.
create policy offers_select_active on public.offers for select to authenticated
  using (status = 'active' and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy offers_select_manager on public.offers for select to authenticated
  using ((select api.has_permission('offer.manage', business_id)));
-- Child rows follow the visibility of their offer (offers RLS applies inside the subquery).
create policy offer_schedules_select on public.offer_schedules for select to authenticated
  using (exists (select 1 from public.offers o where o.id = offer_id));
create policy offer_eligible_groups_select on public.offer_eligible_groups for select to authenticated
  using (exists (select 1 from public.offers o where o.id = offer_id));
create policy offer_categories_select_active on public.offer_categories for select to authenticated
  using (is_active);
create policy offer_categories_select_manager on public.offer_categories for select to authenticated
  using ((select api.has_any_permission('offer.manage')));
create policy customer_groups_select_staff on public.customer_groups for select to authenticated
  using ((select api.has_any_permission('customer.view')) or (select api.has_any_permission('offer.manage')));
create policy customer_group_members_select_own on public.customer_group_members for select to authenticated
  using (customer_id = (select auth.uid()));
create policy customer_group_members_select_staff on public.customer_group_members for select to authenticated
  using ((select api.has_any_permission('customer.view')));
create policy offer_usage_select_own on public.offer_usage for select to authenticated
  using (customer_id = (select auth.uid()));
create policy offer_usage_select_staff on public.offer_usage for select to authenticated
  using ((select api.has_any_permission('report.view')));

-- §10 storage: buckets are public for reads (bucket flag); writes go through api.storage_can_write.
-- Buckets themselves are created by database/seed/reference/storage_buckets.sql from settings.
do $$
begin
  if to_regclass('storage.objects') is null then
    raise exception 'storage.objects missing: Supabase Storage schema is required';
  end if;
  drop policy if exists rewards_assets_insert on storage.objects;
  drop policy if exists rewards_assets_update on storage.objects;
  drop policy if exists rewards_assets_delete on storage.objects;
  drop policy if exists rewards_assets_select on storage.objects;
  create policy rewards_assets_insert on storage.objects for insert to authenticated
    with check (api.storage_can_write(bucket_id, name));
  create policy rewards_assets_update on storage.objects for update to authenticated
    using (api.storage_can_write(bucket_id, name)) with check (api.storage_can_write(bucket_id, name));
  create policy rewards_assets_delete on storage.objects for delete to authenticated
    using (api.storage_can_write(bucket_id, name));
  -- Writers can read/list through the API too (needed for upsert); public reads use the public URL.
  create policy rewards_assets_select on storage.objects for select to authenticated
    using (api.storage_can_write(bucket_id, name));
end;
$$;
