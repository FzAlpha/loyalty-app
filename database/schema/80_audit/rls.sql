-- Deny by default. Read access for audit.view is added in M8 through an api.* RPC.
alter table audit.audit_logs enable row level security;
