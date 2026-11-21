alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.identity_checks enable row level security;
alter table public.phone_release_requests enable row level security;

-- Read side only. No insert/update/delete policies: writes go through api.* (§5).
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_staff on public.profiles for select to authenticated
  using ((select api.has_any_permission('customer.view')));

create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

create policy user_roles_select_own on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_roles_select_staff_admin on public.user_roles for select to authenticated
  using ((select api.has_permission('staff.manage', null)));

create policy identity_checks_select_staff on public.identity_checks for select to authenticated
  using (api.has_permission('customer.view', business_id));

create policy phone_release_select_requester on public.phone_release_requests for select to authenticated
  using (api.has_permission('customer.release_phone.request', requested_business_id));
create policy phone_release_select_approver on public.phone_release_requests for select to authenticated
  using ((select api.has_permission('customer.release_phone.approve', null)));
