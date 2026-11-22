// Edge Functions auth-register, auth-sign-in, auth-recover (plan §6, §7).
import { z } from "zod";
import { DateOnly, Name, Password, PhoneE164, Uuid } from "./common.ts";

export const RegisterInput = z.object({
  phone: PhoneE164,
  password: Password,
  fullName: Name,
  dateOfBirth: DateOnly,
});
export const RegisterOutput = z.object({ user_id: Uuid });

export const SignInInput = z.object({ phone: PhoneE164, password: Password });
export const SignInOutput = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().nullable().optional(),
  user_id: Uuid,
});

export const RecoverInput = z.object({
  phone: PhoneE164,
  code: z.string().trim().min(4).max(32),
  newPassword: Password,
});
export const RecoverOutput = z.object({ recovered: z.literal(true) });

export const ChangePasswordInput = z.object({ newPassword: Password });
