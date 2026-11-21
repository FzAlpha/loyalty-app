-- ops tables are internal: RLS on, no policies, no grants (deny by default).
alter table ops.login_attempts enable row level security;
alter table ops.recovery_codes enable row level security;
alter table ops.rate_limit_buckets enable row level security;
