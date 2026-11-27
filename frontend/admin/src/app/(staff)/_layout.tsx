// Signed-in staff screens. Routing only: who you are comes from api.get_my_staff, and the server
// checks permission on every call anyway. Handles not-staff, disabled and ended sessions (PDF §12 #7)
// the forced first password change, and partner businesses waiting for (or refused) approval.
import { useQueryClient } from "@tanstack/react-query";
import { Redirect, Stack, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { colors } from "@rewards/ui";
import { Button, ErrorBox, Loading, Panel, Screen } from "../../components/ui";
import { errorMessage, isAccessLost } from "../../lib/errors";
import { apiErrorOf, useStaff } from "../../lib/queries";
import { useSessionStore } from "../../lib/session";
import { signOutStaff } from "../../lib/signout";
import { setWorkplace, useWorkplace } from "../../lib/workplace";
import { strings } from "../../strings";

function Blocked({ title, body }: { title: string; body: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <Panel tone="danger" title={title} body={body}>
        <Button label={strings.common.signOut} loading={busy}
          onPress={async () => { setBusy(true); await signOutStaff(qc); setBusy(false); }} />
      </Panel>
    </Screen>
  );
}

// Partner business not (or no longer) approved: application status, the owner's note, and sign out.
function PartnerWaiting({ me, onCheck, checking }: {
  me: { business_name: string | null; partner_status?: string | null; decision_note?: string | null };
  onCheck: () => void; checking: boolean;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const p = strings.partner;
  const name = me.business_name ?? "";
  const [tone, title, body] =
    me.partner_status === "rejected" ? (["danger", p.rejectedTitle, p.rejectedBody(name)] as const)
    : me.partner_status === "revoked" ? (["danger", p.revokedTitle, p.revokedBody(name)] as const)
    : (["info", p.pendingTitle, p.pendingBody(name)] as const);
  const note = me.decision_note ? `\n\n${p.ownerNote(me.decision_note)}` : "";
  return (
    <Screen onRefresh={onCheck} refreshing={checking}>
      <Panel tone={tone} title={title} body={body + note}>
        <Button label={p.checkAgain} variant="secondary" icon="refresh-outline" loading={checking} onPress={onCheck} />
        <Button label={strings.common.signOut} loading={busy}
          onPress={async () => { setBusy(true); await signOutStaff(qc); setBusy(false); }} />
      </Panel>
    </Screen>
  );
}

export default function StaffLayout() {
  const session = useSessionStore((s) => s.session);
  const staff = useStaff(!!session);
  const pathname = usePathname();
  const workplaceId = useWorkplace((w) => w.businessId);

  // Executives and partners always serve their own business; owners pick one (business screen).
  const me = staff.data;
  useEffect(() => {
    if (me?.business_id && workplaceId !== me.business_id) setWorkplace(me.business_id, me.business_name);
  }, [me?.business_id, me?.business_name, workplaceId]);

  if (!session) return <Redirect href="/sign-in" />;
  if (staff.isPending) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}><Loading /></View>;
  }
  if (staff.isError) {
    const e = apiErrorOf(staff.error);
    if (e?.code === "NOT_FOUND") return <Blocked title={strings.auth.notStaffTitle} body={strings.auth.notStaffBody} />;
    if (isAccessLost(e)) return <Blocked title={strings.auth.sessionEndedTitle} body={strings.auth.sessionEndedBody} />;
    return <Screen><ErrorBox message={errorMessage(e)} onRetry={() => staff.refetch()} /></Screen>;
  }
  if (!staff.data.is_active) return <Blocked title={strings.auth.disabledTitle} body={strings.auth.disabledBody} />;
  if (staff.data.role === "partner" && staff.data.partner_status !== "approved") {
    return <PartnerWaiting me={staff.data} onCheck={() => staff.refetch()} checking={staff.isRefetching} />;
  }
  if (staff.data.must_change_password && pathname !== "/change-password") return <Redirect href="/change-password" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
