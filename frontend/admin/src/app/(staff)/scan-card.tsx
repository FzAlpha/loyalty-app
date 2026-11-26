// Scan a membership card (api.scan_card). If a customer's link request is waiting, approve it after the
// in-store identity check (evidence required) or reject it with a reason. PDF §12 #1.
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { ApiError } from "@rewards/shared";
import { Text } from "@rewards/ui";
import { Scanner } from "../../components/Scanner";
import {
  Button, Checkbox, ErrorBox, Field, fmtDateTime, Header, InfoCard, InfoRow, Loading, Panel, Screen, SectionTitle,
} from "../../components/ui";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { useRecheckAccess } from "../../lib/queries";
import { useWorkplace } from "../../lib/workplace";
import { strings } from "../../strings";

type IdentityEvidence = Parameters<typeof api.cards.approve>[0]["evidence"][number];
type Scan = NonNullable<Awaited<ReturnType<typeof api.cards.scan>>["data"]>;
const EVIDENCE = Object.keys(strings.card.evidence) as IdentityEvidence[];

export default function ScanCard() {
  const businessId = useWorkplace((w) => w.businessId);
  const recheck = useRecheckAccess();
  const [checking, setChecking] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [evidence, setEvidence] = useState<IdentityEvidence[]>([]);
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const reset = () => {
    setScan(null); setError(null); setEvidence([]); setNote(""); setRejecting(false); setReason("");
    setFormError(null); setDone(null);
  };

  const fail = (e: ApiError) => { setError(e); recheck(e); };

  const onScan = async (data: string) => {
    if (!businessId) return;
    setChecking(true);
    setError(null);
    const r = await api.cards.scan({ qrPayload: data, businessId });
    setChecking(false);
    if (r.error) return fail(r.error);
    setScan(r.data);
  };

  const approve = async () => {
    if (!scan || !businessId) return;
    if (evidence.length === 0) return setFormError(strings.card.needEvidence);
    setFormError(null);
    setBusy(true);
    const r = await api.cards.approve({ cardId: scan.card_id, businessId, evidence, note: note.trim() || undefined });
    setBusy(false);
    if (r.error) return fail(r.error);
    setDone(strings.card.approved(scan.card_number));
  };

  const reject = async () => {
    if (!scan || !businessId) return;
    if (!reason.trim()) return setFormError(strings.card.needReason);
    setFormError(null);
    setBusy(true);
    const r = await api.cards.reject({ cardId: scan.card_id, businessId, reason: reason.trim() });
    setBusy(false);
    if (r.error) return fail(r.error);
    setDone(strings.card.rejected(scan.card_number));
  };

  const toggle = (k: IdentityEvidence) =>
    setEvidence((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  let body: React.ReactNode;
  if (!businessId) {
    body = <Panel tone="info" title={strings.home.chooseBusiness} body={strings.home.noBusiness} />;
  } else if (done) {
    body = (
      <Panel tone="success" title={done}>
        <Button label={strings.scanner.scanAgain} onPress={reset} icon="scan-outline" />
        <Button label={strings.common.done} variant="secondary" onPress={() => router.back()} />
      </Panel>
    );
  } else if (!scan) {
    body = (
      <>
        <Scanner hint={strings.card.scanning} onScan={onScan} paused={checking || !!error} />
        {checking && <Loading label={strings.card.checking} />}
        {error && (
          <View style={{ marginTop: 12, gap: 10 }}>
            <ErrorBox message={errorMessage(error)} />
            <Button label={strings.scanner.scanAgain} variant="secondary" onPress={reset} />
          </View>
        )}
      </>
    );
  } else {
    const c = scan.customer;
    body = (
      <>
        <InfoCard>
          <InfoRow label={strings.card.number} value={scan.card_number} />
          <InfoRow label={strings.card.status} value={strings.card.statuses[scan.status] ?? scan.status} />
          {c && <InfoRow label={strings.card.customer} value={c.full_name} />}
          {c?.phone_masked && <InfoRow label={strings.card.phone} value={c.phone_masked} />}
          {scan.pending_request && <InfoRow label={strings.card.requested} value={fmtDateTime(scan.pending_request.requested_at)} />}
        </InfoCard>
        {!c && <Text className="text-muted text-base mb-3">{strings.card.noCustomer}</Text>}

        {scan.pending_request ? (
          <>
            {!rejecting ? (
              <>
                <SectionTitle>{strings.card.evidenceTitle}</SectionTitle>
                <Text className="text-muted text-base mb-2">{strings.card.evidenceHint}</Text>
                {EVIDENCE.map((k) => (
                  <Checkbox key={k} label={strings.card.evidence[k] ?? k} checked={evidence.includes(k)} onToggle={() => toggle(k)} />
                ))}
                <Field label={`${strings.card.note} (${strings.common.optional})`} value={note} onChangeText={setNote} multiline />
                {formError && <ErrorBox message={formError} />}
                {error && <ErrorBox message={errorMessage(error)} />}
                <View style={{ gap: 10, marginTop: 4 }}>
                  <Button label={strings.card.approve} icon="checkmark" onPress={approve} loading={busy} />
                  <Button label={strings.card.reject} variant="danger" disabled={busy}
                    onPress={() => { setRejecting(true); setFormError(null); setError(null); }} />
                </View>
              </>
            ) : (
              <>
                <Field label={strings.card.rejectReason} value={reason} onChangeText={setReason} multiline autoFocus />
                {formError && <ErrorBox message={formError} />}
                {error && <ErrorBox message={errorMessage(error)} />}
                <View style={{ gap: 10, marginTop: 4 }}>
                  <Button label={strings.card.confirmReject} variant="danger" onPress={reject} loading={busy} />
                  <Button label={strings.common.cancel} variant="secondary" disabled={busy}
                    onPress={() => { setRejecting(false); setFormError(null); setError(null); }} />
                </View>
              </>
            )}
          </>
        ) : (
          <Panel tone="info" title={strings.card.notPending}>
            <Button label={strings.scanner.scanAgain} onPress={reset} icon="scan-outline" />
          </Panel>
        )}
      </>
    );
  }

  return (
    <Screen>
      <Header back title={strings.card.title} />
      {body}
    </Screen>
  );
}
