create trigger set_updated_at before update on public.card_batches
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.cards
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.card_assignments
  for each row execute function private.set_updated_at();
