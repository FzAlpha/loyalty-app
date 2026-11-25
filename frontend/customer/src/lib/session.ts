// Auth session state (Zustand). supabase-js owns the session; this mirrors it for the UI.
import { useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "./api";

type SessionState = { ready: boolean; session: Session | null };
export const useSessionStore = create<SessionState>(() => ({ ready: false, session: null }));

export function useSessionListener() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      useSessionStore.setState({ ready: true, session: data.session });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      useSessionStore.setState({ ready: true, session });
    });
    return () => data.subscription.unsubscribe();
  }, []);
}
