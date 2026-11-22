-- 90_accounts: account deletion requests (BACKEND_PLAN.md §4 accounts, §5, §9).
create type public.deletion_status as enum ('requested', 'processing', 'completed', 'failed');
create type public.deletion_reason as enum ('customer_request', 'unchecked_account');

-- One row per account. The profile is anonymised when the row is created; the auth user is
-- removed by the process_deletions job (jobs-runner, Auth Admin API) once process_after passes.
create table if not exists public.deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references public.profiles (id),
  reason        public.deletion_reason not null,
  status        public.deletion_status not null default 'requested',
  requested_by  uuid references public.profiles (id),
  requested_at  timestamptz not null default now(),
  process_after timestamptz not null,
  attempts      integer not null default 0 check (attempts >= 0),
  completed_at  timestamptz,
  error         text check (error is null or char_length(error) <= 1000),
  updated_at    timestamptz not null default now(),
  constraint deletion_completed_at check ((status = 'completed') = (completed_at is not null))
);
create index if not exists deletion_requests_due on public.deletion_requests (process_after)
  where status in ('requested', 'failed');
