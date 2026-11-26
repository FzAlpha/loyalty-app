// TanStack Query wrappers around packages/api (same pattern as frontend/admin). A Result error is
// thrown as ApiCallError so pages can show errorMessage(e.error).
"use client";
import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ApiError, Result } from "@rewards/shared";
import { api, supabase } from "./api";
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

export type Range = { businessId: string | null; from: string; to: string };
export type GroupBy = "day" | "month" | "business" | "offer" | "executive";
export type AuditFilter = { action?: string; entityType?: string; businessId?: string; from?: string; to?: string };

export const keys = {
  staff: ["staff-me"] as const,
  managedBusinesses: ["managed-businesses"] as const,
  categories: ["offer-categories"] as const,
  summary: (r: Range) => ["report-summary", r] as const,
  redemptions: (r: Range, g: GroupBy) => ["report-redemptions", r, g] as const,
  signups: (from: string, to: string) => ["report-signups", from, to] as const,
  birthdays: (month: number) => ["report-birthdays", month] as const,
  audit: (f: AuditFilter) => ["audit", f] as const,
};

// Staff context, used for routing only. The server checks permissions on every call.
export const useStaff = (enabled: boolean) =>
  useQuery({ queryKey: keys.staff, queryFn: () => unwrap(api.staff.me()), enabled, retry: false });

// Owner: every business, active or not.
export const useManagedBusinesses = () =>
  useQuery({ queryKey: keys.managedBusinesses, queryFn: () => unwrap(api.business.listManaged()) });

export const useOfferCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: () => unwrap(api.offers.listCategories()) });

export const useSummary = (r: Range) =>
  useQuery({ queryKey: keys.summary(r), queryFn: () => unwrap(api.reports.summary(r)) });

export const useRedemptions = (r: Range, groupBy: GroupBy) =>
  useQuery({
    queryKey: keys.redemptions(r, groupBy),
    queryFn: () => unwrap(api.reports.redemptions({ ...r, groupBy })),
  });

export const useSignups = (from: string, to: string) =>
  useQuery({ queryKey: keys.signups(from, to), queryFn: () => unwrap(api.reports.signups({ from, to })) });

export const useBirthdays = (month: number) =>
  useQuery({ queryKey: keys.birthdays(month), queryFn: () => unwrap(api.reports.birthdays({ month })) });

// Keyset paging: the next page starts before the last row shown. The page size is the server's default
// (capped by setting audit.page_size_max); a page shorter than the first ends the list.
export const useAudit = (f: AuditFilter) =>
  useInfiniteQuery({
    queryKey: keys.audit(f),
    queryFn: ({ pageParam }) => unwrap(api.audit.list({ ...f, ...pageParam })),
    initialPageParam: {} as { beforeAt?: string; beforeId?: string },
    getNextPageParam: (last, pages) => {
      const first = pages[0]?.length ?? 0;
      const tail = last[last.length - 1];
      if (!tail || last.length < first) return undefined;
      return { beforeAt: tail.created_at, beforeId: tail.id };
    },
  });

// After a call is refused with FORBIDDEN/UNAUTHENTICATED, re-check the staff context so the layout can
// show "disabled" or "session ended" if that is the cause.
export function useRecheckAccess() {
  const qc = useQueryClient();
  return (error: ApiError | null | undefined) => {
    if (isAccessLost(error)) qc.invalidateQueries({ queryKey: keys.staff });
  };
}

export async function signOutOwner(qc: QueryClient) {
  const r = await api.auth.signOut();
  // A revoked or disabled session can make the server call fail; still drop the local session.
  if (r.error) await supabase.auth.signOut({ scope: "local" });
  qc.clear();
}
