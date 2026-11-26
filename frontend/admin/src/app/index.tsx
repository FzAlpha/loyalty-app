import { Redirect } from "expo-router";
import { useSessionStore } from "../lib/session";

export default function Index() {
  const session = useSessionStore((s) => s.session);
  return <Redirect href={session ? "/home" : "/sign-in"} />;
}
