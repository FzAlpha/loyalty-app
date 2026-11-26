// The business the signed-in staff member is serving. Executives: their own business (from
// get_my_staff). Owners: picked in the app. A UI choice only; the server checks every call.
import { create } from "zustand";

type Workplace = { businessId: string | null; businessName: string | null };
export const useWorkplace = create<Workplace>(() => ({ businessId: null, businessName: null }));
export const setWorkplace = (businessId: string | null, businessName: string | null) =>
  useWorkplace.setState({ businessId, businessName });
