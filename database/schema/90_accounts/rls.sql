-- Internal: RLS on, no policies (deny by default). Read and written only by the RPCs below.
alter table public.deletion_requests enable row level security;
