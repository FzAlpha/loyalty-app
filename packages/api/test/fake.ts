// Minimal stand-in for the parts of SupabaseClient that packages/api uses.
import type { Client } from "../src/index.ts";

export type Call = { kind: "rpc" | "fn" | "auth" | "storage"; name: string; args: unknown; schema?: string };
type PgRes = { data: unknown; error: { message: string; details: string | null; code: string; hint?: string } | null; status: number };
type FnRes = { data: unknown; error: unknown };
type AuthRes = { data?: unknown; error: unknown };

export function fake(opts: {
  rpc?: (name: string, args: unknown) => PgRes | Promise<PgRes>;
  fn?: (name: string, body: unknown) => FnRes | Promise<FnRes>;
  auth?: Partial<Record<"setSession" | "updateUser" | "signOut", (a: unknown) => AuthRes>>;
  // Storage: list(dir) returns the folder's items (folders have id null); remove(paths) may fail.
  storage?: { list?: (dir: string, offset: number) => { data: unknown[] | null; error: unknown };
    remove?: (paths: string[]) => { error: unknown } };
} = {}) {
  const calls: Call[] = [];
  const authCall = (name: "setSession" | "updateUser" | "signOut") => async (a: unknown) => {
    calls.push({ kind: "auth", name, args: a });
    return opts.auth?.[name]?.(a) ?? { data: {}, error: null };
  };
  const client = {
    schema(schema: string) {
      return {
        rpc: async (name: string, args: unknown) => {
          calls.push({ kind: "rpc", name, args, schema });
          return opts.rpc ? opts.rpc(name, args) : { data: null, error: null, status: 200 };
        },
      };
    },
    functions: {
      invoke: async (name: string, o: { body: unknown }) => {
        calls.push({ kind: "fn", name, args: o.body });
        return opts.fn ? opts.fn(name, o.body) : { data: { data: null }, error: null };
      },
    },
    storage: {
      from: (bucket: string) => ({
        list: async (dir: string, o: { limit: number; offset: number }) => {
          calls.push({ kind: "storage", name: "list", args: { bucket, dir, ...o } });
          return opts.storage?.list?.(dir, o.offset) ?? { data: [], error: null };
        },
        remove: async (paths: string[]) => {
          calls.push({ kind: "storage", name: "remove", args: { bucket, paths } });
          return opts.storage?.remove?.(paths) ?? { data: [], error: null };
        },
      }),
    },
    auth: { setSession: authCall("setSession"), updateUser: authCall("updateUser"), signOut: authCall("signOut") },
  };
  return { calls, client: client as unknown as Client };
}

export const ok = (data: unknown): PgRes => ({ data, error: null, status: 200 });
export const pgError = (status: number, code: string, message: string, details: string | null = null): PgRes =>
  ({ data: null, error: { message, details, code, hint: "" }, status });
