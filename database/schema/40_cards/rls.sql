alter table public.card_batches enable row level security;
alter table public.cards enable row level security;
alter table public.card_assignments enable row level security;

-- Customers see their own card and assignments; staff with card.view see all (cards are not
-- business-owned). Batches only for card.batch.create holders. No write policies: RPCs only.
create policy cards_select_own on public.cards for select to authenticated
  using (current_customer_id = (select auth.uid()));
create policy cards_select_staff on public.cards for select to authenticated
  using ((select api.has_any_permission('card.view')));
create policy card_assignments_select_own on public.card_assignments for select to authenticated
  using (customer_id = (select auth.uid()));
create policy card_assignments_select_staff on public.card_assignments for select to authenticated
  using ((select api.has_any_permission('card.view')));
create policy card_batches_select_owner on public.card_batches for select to authenticated
  using ((select api.has_permission('card.batch.create', null)));

-- card_passes: no policies (deny all). Read and written only by api.create_card_pass / api.scan_card.
alter table public.card_passes enable row level security;
