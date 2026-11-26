// Signed-in owner pages. Routing only: who you are comes from api.get_my_staff, and the server checks
// permission on every call anyway. Handles not-staff, not-owner, disabled and ended sessions and the
// forced first password change.
"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button, ErrorBox, Loading } from "@/components/ui";
import { errorMessage, isAccessLost } from "@/lib/errors";
import { apiErrorOf, signOutOwner, useStaff } from "@/lib/queries";
import { useSessionStore } from "@/lib/session";
import { strings } from "@/lib/strings";

const NAV = [
  { href: "/overview", label: strings.nav.overview },
  { href: "/reports", label: strings.nav.reports },
  { href: "/offers", label: strings.nav.offers },
  { href: "/executives", label: strings.nav.executives },
  { href: "/businesses", label: strings.nav.businesses },
  { href: "/audit", label: strings.nav.audit },
];

function SignOutButton() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Button tone="plain" loading={busy} onClick={async () => { setBusy(true); await signOutOwner(qc); setBusy(false); }}>
      {strings.common.signOut}
    </Button>
  );
}

function Blocked({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-danger/60 bg-panel p-6">
        <h1 className="text-xl font-semibold text-danger">{title}</h1>
        <p className="text-sm text-muted">{body}</p>
        <SignOutButton />
      </div>
    </main>
  );
}

const Centered = ({ children }: { children: ReactNode }) => <main className="p-8">{children}</main>;

export default function OwnerLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, session } = useSessionStore();
  const staff = useStaff(!!session);
  const me = staff.data;
  const mustChange = !!me?.must_change_password;

  useEffect(() => {
    if (ready && !session) router.replace("/sign-in");
  }, [ready, session, router]);
  useEffect(() => {
    if (mustChange && pathname !== "/change-password") router.replace("/change-password");
  }, [mustChange, pathname, router]);

  if (!ready || !session || staff.isPending) return <Centered><Loading /></Centered>;
  if (staff.isError) {
    const e = apiErrorOf(staff.error);
    if (e?.code === "NOT_FOUND") return <Blocked title={strings.auth.notStaffTitle} body={strings.auth.notStaffBody} />;
    if (isAccessLost(e)) return <Blocked title={strings.auth.sessionEndedTitle} body={strings.auth.sessionEndedBody} />;
    return <Centered><ErrorBox message={errorMessage(e)} onRetry={() => staff.refetch()} /></Centered>;
  }
  if (!staff.data.is_active) return <Blocked title={strings.auth.disabledTitle} body={strings.auth.disabledBody} />;
  if (staff.data.role !== "owner") return <Blocked title={strings.auth.notOwnerTitle} body={strings.auth.notOwnerBody} />;
  if (mustChange) {
    return pathname === "/change-password" ? <Centered>{children}</Centered> : <Centered><Loading /></Centered>;
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-panel md:min-h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="p-4">
          <div className="text-sm font-semibold text-gold">{strings.brand.app}</div>
          <div className="text-xs text-muted">{strings.brand.sub}</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {NAV.map((n) => {
            const on = pathname === n.href;
            return (
              <Link key={n.href} href={n.href}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${on ? "bg-gold text-black" : "text-fg hover:bg-line"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden p-4 md:block">
          <div className="mb-2 truncate text-xs text-muted">{staff.data.display_name}</div>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mb-4 flex justify-end md:hidden"><SignOutButton /></div>
        {children}
      </main>
    </div>
  );
}
