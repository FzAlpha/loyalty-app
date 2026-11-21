-- Append-only. The audit_retention job (M8) will need its own controlled delete path.
drop trigger if exists block_update_delete on audit.audit_logs;
create trigger block_update_delete before update or delete on audit.audit_logs
  for each row execute function audit.block_change();

drop trigger if exists block_truncate on audit.audit_logs;
create trigger block_truncate before truncate on audit.audit_logs
  for each statement execute function audit.block_change();

-- Generic row audit for core tables (§11). Other modules attach their own.
drop trigger if exists audit_row on public.app_settings;
create trigger audit_row after insert or update or delete on public.app_settings
  for each row execute function audit.log_row_change('scope_business_id');
