create trigger set_updated_at before update on public.offers
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.offer_categories
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.customer_groups
  for each row execute function private.set_updated_at();
