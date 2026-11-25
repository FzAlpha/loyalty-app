// Signed-in screens that sit above the tabs (no tab bar). Same guard as the tabs.
import { Redirect, Stack } from "expo-router";
import { useSessionStore } from "../../lib/session";
import { colors } from "../../theme";

export default function MemberLayout() {
  const session = useSessionStore((s) => s.session);
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
