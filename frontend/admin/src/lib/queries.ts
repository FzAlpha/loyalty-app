// TanStack Query wrappers around packages/api. A Result error is thrown as ApiCallError so screens
// can show errorMessage(e.error).
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError, Result } from "@rewards/shared";
import { api } from "./api";
import { isAccessLost } from "./errors";

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
  staff: ["staff-me"] as const,
  businesses: ["businesses"] as const,
  managedBusinesses: ["managed-businesses"] as const,
  today: (businessId: string) => ["today", businessId] as const,
};

// Staff context, used for routing only. The server checks permissions on every call.
export const useStaff = (enabled: boolean) =>
  useQuery({ queryKey: keys.staff, queryFn: () => unwrap(api.staff.me()), enabled, retry: false });

export const useBusinesses = () =>
  useQuery({ queryKey: keys.businesses, queryFn: () => unwrap(api.business.list()) });

// Owner: every business, active or not.
export const useManagedBusinesses = () =>
  useQuery({ queryKey: keys.managedBusinesses, queryFn: () => unwrap(api.business.listManaged()) });

// Pages of the caller's redemptions today. The page size is the server's (setting staff.today.page_max);
// the next page starts before the oldest row shown. An empty page ends the list.
export const useToday = (businessId: string) =>
  useInfiniteQuery({
    queryKey: keys.today(businessId),
    queryFn: ({ pageParam }) => unwrap(api.claims.listMineToday({ businessId, before: pageParam })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last, pages) => {
      const first = pages[0]?.length ?? 0;
      if (last.length === 0 || last.length < first) return undefined;
      return last[last.length - 1]?.redeemed_at;
    },
  });

// After a privileged call is refused with FORBIDDEN/UNAUTHENTICATED, re-check the staff context so the
// staff layout can show "disabled" or "session ended" if that is the cause (PDF §12 #7).
export function useRecheckAccess() {
  const qc = useQueryClient();
  return (error: ApiError | null | undefined) => {
    if (isAccessLost(error)) qc.invalidateQueries({ queryKey: keys.staff });
  };
}
