// The one Supabase client and the typed API. Screens call `api.*` only, never supabase.rpc (FRONTEND_PLAN §2).
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { createApi, type Client } from "@rewards/api";
import type { Database } from "@rewards/shared";
import { env } from "./env";

export const supabase: Client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    // Known limitation: AsyncStorage is not encrypted. See frontend/admin/README.md.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is in the foreground (Supabase React Native guidance).
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const api = createApi(supabase);
