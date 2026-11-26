"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading } from "@/components/ui";
import { useSessionStore } from "@/lib/session";

export default function Index() {
  const router = useRouter();
  const { ready, session } = useSessionStore();
  useEffect(() => {
    if (ready) router.replace(session ? "/overview" : "/sign-in");
  }, [ready, session, router]);
  return <main className="p-8"><Loading /></main>;
}
