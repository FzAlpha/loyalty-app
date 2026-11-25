import "../../global.css";
// Import the weight by subpath so only this .ttf file is bundled.
import { Delius_400Regular } from "@expo-google-fonts/delius/400Regular";
import { useFonts } from "expo-font";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { AppState, Platform, View } from "react-native";

// On native, "window focus" means the app returning to the foreground: refetch stale data then.
if (Platform.OS !== "web") {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener("change", (s) => setFocused(s === "active"));
    return () => sub.remove();
  });
}
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "../components/ui";
import { useSessionListener, useSessionStore } from "../lib/session";
import { colors, fonts } from "../theme";

export default function RootLayout() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }));
  useSessionListener();
  const sessionReady = useSessionStore((s) => s.ready);
  // Keys are the family names used in theme.fonts. If loading fails, carry on with the system font.
  const [fontsLoaded, fontError] = useFonts({ [fonts.regular]: Delius_400Regular });
  const ready = sessionReady && (fontsLoaded || !!fontError);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <StatusBar style="light" />
        {ready ? (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
            <Loading />
          </View>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
