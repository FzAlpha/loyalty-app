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

-- M2 modules (10_identity, 20_businesses). staff and ops tables are audited explicitly in their RPCs.
drop trigger if exists audit_row on public.profiles;
create trigger audit_row after insert or update or delete on public.profiles
  for each row execute function audit.log_row_change();
drop trigger if exists audit_row on public.user_roles;
create trigger audit_row after insert or update or delete on public.user_roles
  for each row execute function audit.log_row_change('business_id');
drop trigger if exists audit_row on public.identity_checks;
create trigger audit_row after insert or update or delete on public.identity_checks
  for each row execute function audit.log_row_change('business_id');
drop trigger if exists audit_row on public.phone_release_requests;
create trigger audit_row after insert or update or delete on public.phone_release_requests
  for each row execute function audit.log_row_change('requested_business_id');
drop trigger if exists audit_row on public.businesses;
create trigger audit_row after insert or update or delete on public.businesses
  for each row execute function audit.log_row_change('id');
drop trigger if exists audit_row on public.role_permissions;
create trigger audit_row after insert or update or delete on public.role_permissions
  for each row execute function audit.log_row_change();

-- M3 (40_cards).
drop trigger if exists audit_row on public.cards;
create trigger audit_row after insert or update or delete on public.cards
  for each row execute function audit.log_row_change();
drop trigger if exists audit_row on public.card_assignments;
create trigger audit_row after insert or update or delete on public.card_assignments
  for each row execute function audit.log_row_change('decision_business_id');
drop trigger if exists audit_row on public.card_batches;
create trigger audit_row after insert or update or delete on public.card_batches
  for each row execute function audit.log_row_change();
