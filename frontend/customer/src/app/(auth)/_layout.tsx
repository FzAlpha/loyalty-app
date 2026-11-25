import { Redirect, Stack } from "expo-router";
import { useSessionStore } from "../../lib/session";
import { colors } from "../../theme";

export default function AuthLayout() {
  const session = useSessionStore((s) => s.session);
  if (session) return <Redirect href="/(tabs)/home" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
