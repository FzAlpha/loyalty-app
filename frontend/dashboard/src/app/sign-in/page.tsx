// Owner sign-in: phone + password through the auth-sign-in Edge Function (lockout + rate limits),
// then supabase-js holds the session. Accounts are created by an owner; there is no self sign-up.
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, ErrorBox, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { toE164 } from "@/lib/phone";
import { useSessionStore } from "@/lib/session";
import { strings } from "@/lib/strings";

export default function SignIn() {
  const router = useRouter();
  const session = useSessionStore((s) => s.session);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace("/overview");
  }, [session, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const e164 = toE164(phone);
    if (!e164) return setError(strings.auth.invalidPhone);
    if (!password) return setError(strings.auth.required);
    setBusy(true);
    setError(null);
    const r = await api.auth.signIn({ phone: e164, password });
    setBusy(false);
    if (r.error) setError(errorMessage(r.error));
    // On success the session listener updates the store and the effect above redirects.
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-panel p-6">
        <div>
          <p className="text-sm text-gold">{strings.brand.app}</p>
          <h1 className="mt-1 text-2xl font-semibold text-gold-light">{strings.auth.signInTitle}</h1>
          <p className="mt-1 text-sm text-muted">{strings.auth.signInSubtitle}</p>
        </div>
        <Field label={strings.auth.phone} value={phone} onChange={(e) => setPhone(e.target.value)}
          type="tel" autoComplete="tel" placeholder="+91…" />
        <Field label={strings.auth.password} value={password} onChange={(e) => setPassword(e.target.value)}
          type="password" autoComplete="current-password" />
        {error && <ErrorBox message={error} />}
        <Button type="submit" loading={busy} className="w-full">{strings.auth.signIn}</Button>
      </form>
    </main>
  );
}
