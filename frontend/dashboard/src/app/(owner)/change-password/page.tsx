// Forced password change: Supabase Auth sets the password, then api.staff_password_changed clears
// must_change_password (same flow as frontend/admin).
"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ErrorBox, Field, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { keys } from "@/lib/queries";
import { strings } from "@/lib/strings";

export default function ChangePassword() {
  const qc = useQueryClient();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setFor, setSetFor] = useState<string | null>(null); // the password Auth already accepted

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || !confirm) return setError(strings.auth.required);
    if (password !== confirm) return setError(strings.password.mismatch);
    setBusy(true);
    setError(null);
    // If the password was set but clearing the flag failed, a retry only repeats the flag call.
    if (setFor !== password) {
      const r = await api.auth.changePassword({ newPassword: password });
      if (r.error) {
        setBusy(false);
        const err = r.error;
        if (err.code === "VALIDATION_FAILED" && err.detail?.split(",").includes("password")) return setError(strings.password.weak);
        if (err.code === "UNKNOWN_ERROR_CODE" && err.detail === "same_password") return setError(strings.password.same);
        return setError(errorMessage(err));
      }
      setSetFor(password);
    }
    const done = await api.auth.staffPasswordChanged();
    setBusy(false);
    if (done.error) return setError(errorMessage(done.error));
    await qc.invalidateQueries({ queryKey: keys.staff });
    router.replace("/overview");
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-4">
      <PageHeader title={strings.password.forcedTitle} subtitle={strings.password.forcedSubtitle} />
      <Field label={strings.password.newPassword} type="password" autoComplete="new-password"
        value={password} onChange={(e) => setPassword(e.target.value)} />
      <Field label={strings.password.confirm} type="password" autoComplete="new-password"
        value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error && <ErrorBox message={error} />}
      <Button type="submit" loading={busy} className="w-full">{strings.password.save}</Button>
    </form>
  );
}
