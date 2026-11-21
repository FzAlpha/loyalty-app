alter table public.businesses enable row level security;

-- Business directory is public (shown before sign-in). Inactive ones only to business managers.
create policy businesses_select_active on public.businesses for select to anon, authenticated
  using (is_active);
create policy businesses_select_manager on public.businesses for select to authenticated
  using (api.has_permission('business.manage', id));
