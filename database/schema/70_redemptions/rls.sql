alter table public.redemptions enable row level security;

-- Customers see their own; staff see their business's (claim.redeem or report.view). RPC writes only.
create policy redemptions_select_own on public.redemptions for select to authenticated
  using (customer_id = (select auth.uid()));
create policy redemptions_select_staff on public.redemptions for select to authenticated
  using ((select api.has_permission('claim.redeem', business_id))
         or (select api.has_permission('report.view', business_id)));
