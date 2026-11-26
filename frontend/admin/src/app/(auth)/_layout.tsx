import { Redirect, Stack } from "expo-router";
import { colors } from "@rewards/ui";
import { useSessionStore } from "../../lib/session";

export default function AuthLayout() {
  const session = useSessionStore((s) => s.session);
  if (session) return <Redirect href="/home" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
