alter table public.staff enable row level security;

create policy staff_select_own on public.staff for select to authenticated
  using (user_id = (select auth.uid()));
create policy staff_select_manager on public.staff for select to authenticated
  using ((select api.has_permission('staff.manage', null)));
