# backend/server — Python (FastAPI) server

Mirrors the Edge Functions (same routes `/functions/v1/<name>`, same `{data}` / `{error}` contract) against the
same Supabase Postgres. The Edge Functions stay deployed; the apps keep using them until a switch is decided.

## Run (dev)
```
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
copy .env.example .env   # fill in; never commit .env
.venv\Scripts\python -m uvicorn app.main:app --port 8787
```
Tests: `pytest` (offline, fakes) · `python -m tests.live_staging` (live, staging only, creates test data).

## Endpoints
- `GET /health` – liveness (no DB check).
- `GET /health/ready` – 200 when the database answers, else 503 (use for the host's readiness probe).
- `POST /functions/v1/*` – the nine functions. Unknown paths return JSON `NOT_FOUND`.
- Every response carries `x-request-id` (the caller's if safe, else generated); it is logged and sent to the DB.

## Production notes
- `DATABASE_URL`: use the Supavisor **transaction** pooler (port 6543). Prepared statements are off.
- Concurrency: each worker has `DB_POOL_MAX` connections and Starlette's thread pool (40 threads).
  Total DB connections = workers × `DB_POOL_MAX`; keep it under the pooler's client limit for your plan.
  Requests beyond the pool wait up to `DB_POOL_TIMEOUT` s, then get `INTERNAL_ERROR` (logged as unavailable).
- Run several workers behind the host's proxy, e.g.
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2 --proxy-headers --forwarded-allow-ips=<proxy ip>`.
- Client IP comes from the first `X-Forwarded-For` entry (as the Edge Functions do); only expose the server
  behind a proxy that sets it. Invalid values are ignored.
- Limits: `MAX_BODY_BYTES`, `DB_STATEMENT_TIMEOUT_MS`, `AUTH_HTTP_TIMEOUT`, `AUTH_HTTP_RETRIES` (connect errors only).
- Auth (GoTrue) outage → `AUTH_UNAVAILABLE` 503, not 401, so apps do not sign users out during an outage.
- `JOBS_RUNNER_SECRET` must equal the Vault secret `jobs_runner_secret`. Cron reaches this server only if the
  Vault `jobs_runner_url` points here (today it points at the Edge Function).
