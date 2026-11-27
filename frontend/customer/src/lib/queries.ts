// TanStack Query wrappers around packages/api. A Result error is thrown as ApiCallError so screens
// can show errorMessage(e.error).
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
  history: ["history"] as const,
};

// Client cache tuning (not business rules). Businesses and categories rarely change, so refetch them less
// often: fewer requests and re-renders on slow phones and networks. Pull-to-refresh / focus still refetch stale data.
export const cacheTimes = { reference: 5 * 60_000 } as const;

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => unwrap(api.accounts.me()) });
export const useBusinesses = () => useQuery({ queryKey: keys.businesses, queryFn: () => unwrap(api.business.list()), staleTime: cacheTimes.reference });
export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => unwrap(api.offers.listCategories()), staleTime: cacheTimes.reference });
export const useOffers = () => useQuery({ queryKey: keys.offers, queryFn: () => unwrap(api.offers.listEligible()) });
/** id → name lookup, built once per businesses fetch instead of a linear search per rendered card. */
export function useBusinessNames(): (id: string) => string | undefined {
  const { data } = useBusinesses();
  return useMemo(() => {
    const m = new Map((data ?? []).map((b) => [b.id, b.name] as const));
    return (id: string) => m.get(id);
  }, [data]);
}

export const useHistory = () => useQuery({ queryKey: keys.history, queryFn: () => unwrap(api.claims.listMine()) });
