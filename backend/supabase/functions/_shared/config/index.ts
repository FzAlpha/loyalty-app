// Env loader (plan §3.1). Fails fast when a required variable is missing.
import { z } from "npm:zod@3.23.8";

const Env = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Comma-separated list of allowed browser origins. Empty = no browser origin allowed.
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  // Shared secret for jobs-runner (pg_cron -> pg_net). Optional: unset = jobs-runner refuses all calls.
  // Length is checked in jobs-runner so a bad value cannot break the other functions.
  JOBS_RUNNER_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof Env>;

let cached: Config | undefined;

export function config(): Config {
  if (!cached) {
    const parsed = Env.safeParse(Deno.env.toObject());
    if (!parsed.success) {
      const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid environment: ${names}`);
    }
    cached = parsed.data;
  }
  return cached;
}
