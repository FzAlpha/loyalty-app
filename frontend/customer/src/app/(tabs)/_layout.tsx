import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSessionStore } from "../../lib/session";
import { strings } from "../../strings";
import { colors, gradients } from "../../theme";

type Icon = ComponentProps<typeof Ionicons>["name"];
const tab = (title: string, icon: Icon, iconOff: Icon) => ({
  title,
  tabBarAccessibilityLabel: title,
  tabBarIcon: ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? icon : iconOff} color={color as string} size={22} />
  ),
});

// The card tab is a raised gold-foil button in the middle of the bar.
const cardTab = {
  title: strings.tabs.scan,
  tabBarAccessibilityLabel: strings.tabs.scan,
  tabBarIcon: ({ focused }: { focused: boolean }) => (
    <LinearGradient colors={gradients.goldFoil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginTop: -22,
        borderWidth: 3, borderColor: colors.bg, opacity: focused ? 1 : 0.92 }}>
      <Ionicons name="qr-code" size={24} color={colors.onGold} />
    </LinearGradient>
  ),
};

export default function TabsLayout() {
  const session = useSessionStore((s) => s.session);
  const insets = useSafeAreaInsets();
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        // Icons only; each tab sets tabBarAccessibilityLabel so screen readers still name it.
        tabBarShowLabel: false,
        // Floating rounded bar; screens add bottom padding (TAB_BAR_SPACE) so content clears it.
        tabBarStyle: {
          position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 12),
          height: 66, borderRadius: 33, paddingTop: 0, paddingBottom: 0,
          backgroundColor: colors.surface, borderTopWidth: 0, borderWidth: 1, borderColor: colors.lineSoft,
          elevation: 0,
        },
        // Without labels the tab still pins its icon to the top; let the icon box fill the tab so it centres.
        tabBarIconStyle: { flex: 1 },
        tabBarBackground: () => <View style={{ flex: 1, borderRadius: 33, overflow: "hidden" }} />,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="home" options={tab(strings.tabs.home, "home", "home-outline")} />
      <Tabs.Screen name="offers" options={tab(strings.tabs.offers, "gift", "gift-outline")} />
      <Tabs.Screen name="card" options={cardTab} />
      <Tabs.Screen name="account" options={tab(strings.tabs.account, "person-circle", "person-circle-outline")} />
      <Tabs.Screen name="more" options={tab(strings.tabs.more, "grid", "grid-outline")} />
    </Tabs>
  );
}
