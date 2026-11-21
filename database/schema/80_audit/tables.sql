-- audit module (BACKEND_PLAN.md §4 audit, §11). Append-only.
create table if not exists audit.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  business_id uuid,
  action text not null check (action <> ''),
  entity_type text not null check (entity_type <> ''),
  entity_id uuid,
  before jsonb,
  after jsonb,
  request_id text,
  ip inet,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on audit.audit_logs (created_at);
create index if not exists audit_logs_business_idx on audit.audit_logs (business_id, created_at desc);
create index if not exists audit_logs_entity_idx on audit.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_idx on audit.audit_logs (actor_id, created_at desc);
