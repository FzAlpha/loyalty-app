create trigger set_updated_at before update on public.staff
  for each row execute function private.set_updated_at();
