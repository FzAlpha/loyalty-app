-- 99_jobs: pg_cron registration (BACKEND_PLAN.md §9). Both extensions are available on the Free plan.
-- pg_cron creates its own "cron" schema; pg_net creates "net".
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
