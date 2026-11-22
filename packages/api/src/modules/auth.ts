// Customer and staff sign-up / sign-in / recovery (plan §7). Edge Functions own the lockout and
// rate limits; supabase-js holds the session afterwards.
import { z } from "zod";
import {
  ChangePasswordInput, RecoverInput, RecoverOutput, RegisterInput, RegisterOutput, SignInInput, SignInOutput,
  type Result,
} from "@rewards/shared";
import { withInput, type Ctx } from "../client.ts";
import { fromAuthError, fromThrown } from "../result.ts";

// RPCs returning void come back as null.
const Void = z.null().optional().transform(() => null);

export function authModule(ctx: Ctx) {
  return {
    register: (input: z.input<typeof RegisterInput>) => withInput(RegisterInput, input, (v) =>
      ctx.fn("auth-register", {
        phone: v.phone, password: v.password, full_name: v.fullName, date_of_birth: v.dateOfBirth,
      }, RegisterOutput)),

    // Signs in through auth-sign-in, then stores the session in the supabase client.
    signIn: (input: z.input<typeof SignInInput>) => withInput(SignInInput, input,
      async (v): Promise<Result<{ userId: string }>> => {
        const r = await ctx.fn("auth-sign-in", { phone: v.phone, password: v.password }, SignInOutput);
        if (r.error) return r;
        try {
          const { error } = await ctx.supabase.auth.setSession({
            access_token: r.data.access_token, refresh_token: r.data.refresh_token,
          });
          if (error) return fromAuthError(error);
        } catch (e) {
          return fromThrown(e);
        }
        return { data: { userId: r.data.user_id } };
      }),

    recover: (input: z.input<typeof RecoverInput>) => withInput(RecoverInput, input, (v) =>
      ctx.fn("auth-recover", { phone: v.phone, code: v.code, new_password: v.newPassword }, RecoverOutput)),

    // Signed-in password change through Supabase Auth (the password authority, CLAUDE.md rule 8).
    changePassword: (input: z.input<typeof ChangePasswordInput>) => withInput(ChangePasswordInput, input,
      async (v): Promise<Result<null>> => {
        try {
          const { error } = await ctx.supabase.auth.updateUser({ password: v.newPassword });
          return error ? fromAuthError(error) : { data: null };
        } catch (e) {
          return fromThrown(e);
        }
      }),

    // Staff only: clears must_change_password after changePassword succeeds.
    staffPasswordChanged: () => ctx.rpc("staff_password_changed", {}, Void),

    signOut: async (): Promise<Result<null>> => {
      try {
        const { error } = await ctx.supabase.auth.signOut();
        return error ? fromAuthError(error) : { data: null };
      } catch (e) {
        return fromThrown(e);
      }
    },
  };
}
