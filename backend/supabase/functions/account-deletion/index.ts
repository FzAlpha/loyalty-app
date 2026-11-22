// Customer self-service account deletion (plan §5, §12). The RPC runs as the caller, so only the
// caller's own account can be deleted. The profile is anonymised at once; the auth user is
// removed later by the process_deletions job (jobs-runner).
import { z } from "npm:zod@3.23.8";
import { bearer, handle } from "../_shared/http/index.ts";
import { unwrap } from "../_shared/errors/index.ts";
import { userClient } from "../_shared/supabase/index.ts";

const Body = z.object({}).strict();

Deno.serve(handle(Body, async (_b, req) => {
  const jwt = bearer(req);
  return unwrap(await userClient(jwt).schema("api").rpc("request_account_deletion"));
}));
