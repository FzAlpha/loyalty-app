// Sign out and forget everything cached for this staff member.
import type { QueryClient } from "@tanstack/react-query";
import { api, supabase } from "./api";
import { setWorkplace } from "./workplace";

export async function signOutStaff(qc: QueryClient) {
  const r = await api.auth.signOut();
  // A revoked or disabled session can make the server call fail; still drop the session on this device.
  if (r.error) await supabase.auth.signOut({ scope: "local" });
  setWorkplace(null, null);
  qc.clear();
}
