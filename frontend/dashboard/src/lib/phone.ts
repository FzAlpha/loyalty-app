import { PhoneE164 } from "@rewards/shared";

// The dashboard asks for the full international number (+ and country code); there is no default dial code.
export function toE164(raw: string): string | null {
  const t = raw.replace(/[\s\-()]/g, "");
  return PhoneE164.safeParse(t).success ? t : null;
}
