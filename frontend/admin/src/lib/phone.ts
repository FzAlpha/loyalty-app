import { PhoneE164 } from "@rewards/shared";
import { env } from "./env";

// Turns what the user typed into E.164, adding the configured dial code when none was typed.
export function toE164(raw: string): string | null {
  const t = raw.replace(/[\s-()]/g, "");
  const full = t.startsWith("+") ? t : `${env.defaultDialCode}${t.replace(/^0+/, "")}`;
  return PhoneE164.safeParse(full).success ? full : null;
}
