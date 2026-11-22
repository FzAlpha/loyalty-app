alter table public.claim_tokens enable row level security;

-- Customers see their own tokens (Realtime status); staff with claim.preview see their business's.
-- No write policies: RPCs only. secret_hash is not granted (grants.sql).
create policy claim_tokens_select_own on public.claim_tokens for select to authenticated
  using (customer_id = (select auth.uid()));
create policy claim_tokens_select_staff on public.claim_tokens for select to authenticated
  using ((select api.has_permission('claim.preview', business_id)));
