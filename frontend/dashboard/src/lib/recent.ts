// Interim: the backend has no owner list RPC for offers or staff yet, so the dashboard remembers the
// offers/accounts created or edited in this tab (memory only; gone on reload). Replace with a server list.
"use client";
import type { z } from "zod";
import type { UpsertOfferInput } from "@rewards/shared";
import { create } from "zustand";

export type RecentOffer = z.infer<typeof UpsertOfferInput> & { id: string; status: string };
export type RecentStaff = { userId: string; displayName: string; role: "executive" | "owner"; businessId: string | null; isActive: boolean };

type State = {
  offers: Record<string, RecentOffer>;
  staff: Record<string, RecentStaff>;
  putOffer: (o: RecentOffer) => void;
  putStaff: (s: RecentStaff) => void;
};

export const useRecent = create<State>((set) => ({
  offers: {},
  staff: {},
  putOffer: (o) => set((s) => ({ offers: { ...s.offers, [o.id]: o } })),
  putStaff: (st) => set((s) => ({ staff: { ...s.staff, [st.userId]: st } })),
}));
