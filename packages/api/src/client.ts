// Shared call helpers. Every module goes through rpc() or fn() so error mapping lives in one place.
import type { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Result } from "@rewards/shared";
import { fromFunction, fromPostgrest, fromThrown, parseOutput, validate, type PostgrestLike } from "./result.ts";

export type Client = SupabaseClient<Database>;
type ApiFns = Database["api"]["Functions"];
export type RpcName = keyof ApiFns;

// Edge Function names (backend/supabase/functions). jobs-runner is server-only and not exposed.
export type FunctionName =
  | "auth-register" | "auth-sign-in" | "auth-recover" | "card-batches" | "reports-export" | "staff-admin"
  | "account-deletion" | "partner-apply";

export type Ctx = {
  rpc<O extends z.ZodTypeAny, N extends RpcName>(name: N, args: ApiFns[N]["Args"], out: O): Promise<Result<z.output<O>>>;
  fn<O extends z.ZodTypeAny>(name: FunctionName, body: unknown, out: O): Promise<Result<z.output<O>>>;
  supabase: Client;
};

export function makeCtx(supabase: Client): Ctx {
  return {
    supabase,
    async rpc(name, args, out) {
      try {
        // Arguments are typed per RPC by the generated contract; the response is checked with Zod.
        const pg = supabase.schema("api");
        const call = pg.rpc as (n: string, a: unknown) => PromiseLike<PostgrestLike>;
        const res = await call.call(pg, name, args);
        const r = fromPostgrest(res);
        return r.error ? r : parseOutput(out, r.data);
      } catch (e) {
        return fromThrown(e);
      }
    },
    async fn(name, body, out) {
      try {
        const res = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
        const r = await fromFunction(res);
        return r.error ? r : parseOutput(out, r.data);
      } catch (e) {
        return fromThrown(e);
      }
    },
  };
}

// validate input, then run the call with the parsed value.
export async function withInput<I extends z.ZodTypeAny, T>(
  schema: I, input: z.input<I>, call: (v: z.output<I>) => Promise<Result<T>>,
): Promise<Result<T>> {
  const v = validate(schema, input);
  return v.error ? v : call(v.data);
}
