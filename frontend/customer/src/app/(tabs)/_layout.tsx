import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useSessionStore } from "../../lib/session";
import { strings } from "../../strings";
import { colors, fonts } from "../../theme";

type Icon = ComponentProps<typeof Ionicons>["name"];
const tab = (title: string, icon: Icon) => ({
  title,
  tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} color={color as string} size={size} />,
});

export default function TabsLayout() {
  const session = useSessionStore((s) => s.session);
  if (!session) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.regular },
        tabBarStyle: { backgroundColor: "#000", borderTopColor: colors.line },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="home" options={tab(strings.tabs.home, "home")} />
      <Tabs.Screen name="offers" options={tab(strings.tabs.offers, "gift")} />
      <Tabs.Screen name="card" options={tab(strings.tabs.scan, "qr-code")} />
      <Tabs.Screen name="account" options={tab(strings.tabs.account, "person-circle")} />
      <Tabs.Screen name="more" options={tab(strings.tabs.more, "ellipsis-horizontal")} />
    </Tabs>
  );
}
