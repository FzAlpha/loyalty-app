create trigger set_updated_at before update on public.partner_applications
  for each row execute function private.set_updated_at();
