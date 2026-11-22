drop trigger if exists set_updated_at on public.deletion_requests;
create trigger set_updated_at before update on public.deletion_requests
  for each row execute function private.set_updated_at();

drop trigger if exists audit_row on public.deletion_requests;
create trigger audit_row after insert or update or delete on public.deletion_requests
  for each row execute function audit.log_row_change();
