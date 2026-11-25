create trigger set_updated_at before update on public.partners
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.partner_offers
  for each row execute function private.set_updated_at();
