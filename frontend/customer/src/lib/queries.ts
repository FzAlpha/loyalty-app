// TanStack Query wrappers around packages/api. A Result error is thrown as ApiCallError so screens
// can show errorMessage(e.error).
import { useQuery } from "@tanstack/react-query";
import type { ApiError, Result } from "@rewards/shared";
import { api } from "./api";

export class ApiCallError extends Error {
  constructor(public error: ApiError) {
    super(error.code);
  }
}

export async function unwrap<T>(p: Promise<Result<T>>): Promise<T> {
  const r = await p;
  if (r.error) throw new ApiCallError(r.error);
  return r.data as T;
}

export const apiErrorOf = (e: unknown): ApiError | null => (e instanceof ApiCallError ? e.error : null);

export const keys = {
  me: ["me"] as const,
  businesses: ["businesses"] as const,
  categories: ["offer-categories"] as const,
  offers: ["offers"] as const,
  partnerOffers: ["partner-offers"] as const,
  history: ["history"] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => unwrap(api.accounts.me()) });
export const useBusinesses = () => useQuery({ queryKey: keys.businesses, queryFn: () => unwrap(api.business.list()) });
export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => unwrap(api.offers.listCategories()) });
export const useOffers = () => useQuery({ queryKey: keys.offers, queryFn: () => unwrap(api.offers.listEligible()) });
export const usePartnerOffers = () =>
  useQuery({ queryKey: keys.partnerOffers, queryFn: () => unwrap(api.partners.listOffers()) });
export const useHistory = () => useQuery({ queryKey: keys.history, queryFn: () => unwrap(api.claims.listMine()) });
