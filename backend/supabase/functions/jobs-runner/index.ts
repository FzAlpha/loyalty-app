// Called by pg_cron through pg_net (99_jobs) for jobs that need the Auth Admin API (plan §9).
// No user JWT (verify_jwt = false): the caller must present the shared secret JOBS_RUNNER_SECRET
// in x-jobs-secret. The same value is stored in Vault as 'jobs_runner_secret'.
import { z } from "npm:zod@3.23.8";
import { handle } from "../_shared/http/index.ts";
import { AppError, unwrap } from "../_shared/errors/index.ts";
import { adminClient } from "../_shared/supabase/index.ts";
import { config } from "../_shared/config/index.ts";

const Body = z.object({ job: z.literal("process_deletions") });

async function digest(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

// Compares fixed-length digests so the time taken does not depend on where the inputs differ.
async function secretMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Profile photos (plan §10): removes every object in '<uid>/' of the private avatar bucket.
// Best effort: failures are logged and never undo the deletion (avatar_path was already cleared).
async function removeAvatars(admin: ReturnType<typeof adminClient>, bucket: string, uid: string, requestId: string) {
  const page = 100; // storage-js default list size
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(uid, { limit: page });
    if (error) return console.error("avatar list failed", requestId, error.message);
    const paths = (data ?? []).filter((o) => o.id).map((o) => `${uid}/${o.name}`);
    if (paths.length === 0) return;
    const removed = await admin.storage.from(bucket).remove(paths);
    if (removed.error) return console.error("avatar remove failed", requestId, removed.error.message);
    if (paths.length < page) return;
  }
}

Deno.serve(handle(Body, async (_b, req) => {
  const expected = config().JOBS_RUNNER_SECRET;
  if (!expected || expected.length < 32) throw new AppError("JOBS_NOT_CONFIGURED");
  if (!(await secretMatches(req.headers.get("x-jobs-secret") ?? "", expected))) throw new AppError("FORBIDDEN");

  const admin = adminClient();
  const api = admin.schema("api");
  const limit = Number(unwrap(await api.rpc("svc_get_setting", { p_key: "jobs.process_deletions.batch_size" })));
  const due = unwrap(await api.rpc("svc_claim_due_deletions", { p_limit: limit })) as
    { request_id: string; user_id: string }[];

  let avatarBucket: string | null = null;
  let completed = 0;
  let failed = 0;
  for (const r of due) {
    // Soft delete: the auth user is marked deleted and anonymised by Auth, and the row stays, so
    // the profile and its redemptions (foreign keys without cascade) remain valid.
    const { error } = await admin.auth.admin.deleteUser(r.user_id, true);
    const message = error ? `${error.status ?? ""} ${error.code ?? error.message}`.trim() : null;
    if (error) console.error("deleteUser failed", r.request_id, message);
    else {
      avatarBucket ??= String(unwrap(await api.rpc("svc_get_setting", { p_key: "storage.bucket.customer_avatars" })));
      await removeAvatars(admin, avatarBucket, r.user_id, r.request_id);
    }
    unwrap(await api.rpc("svc_complete_deletion", { p_request_id: r.request_id, p_error: message }));
    if (error) failed++;
    else completed++;
  }
  return { job: "process_deletions", claimed: due.length, completed, failed };
}));
