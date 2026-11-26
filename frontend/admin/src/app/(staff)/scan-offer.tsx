// Scan a customer's offer QR: preview (api.preview_claim), then confirm (api.redeem_claim). PDF §12 #4, #5.
// Never offline: the offer counts only when the server returns data. One idempotency key per scanned QR,
// reused when a confirm is retried after a lost connection, so a retry cannot redeem twice.
import { useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { ApiError } from "@rewards/shared";
import { Text } from "@rewards/ui";
import { Scanner } from "../../components/Scanner";
import {
  Button, ErrorBox, Field, fmtAmount, fmtTime, Header, InfoCard, InfoRow, Loading, Panel, Screen,
} from "../../components/ui";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { keys, useBusinesses, useRecheckAccess } from "../../lib/queries";
import { strings } from "../../strings";

type Preview = NonNullable<Awaited<ReturnType<typeof api.claims.preview>>["data"]>;
// Answers after which this QR can never be redeemed: only a new scan helps.
const FINAL = new Set(["ALREADY_REDEEMED", "CLAIM_EXPIRED", "CLAIM_REVOKED", "WRONG_BUSINESS", "INVALID_CLAIM", "IDEMPOTENCY_KEY_REUSED", "BUSINESS_INACTIVE"]);

export default function ScanOffer() {
  const qc = useQueryClient();
  const recheck = useRecheckAccess();
  const businesses = useBusinesses();
  const [qr, setQr] = useState<string | null>(null);
  const [key, setKey] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [billNumber, setBillNumber] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unsure, setUnsure] = useState(false); // sent, but no answer arrived: retry with the same key only
  const [redeemed, setRedeemed] = useState<string | null>(null);

  const reset = () => {
    setQr(null); setKey(""); setPreview(null); setError(null); setBillNumber(""); setBillAmount("");
    setFormError(null); setUnsure(false); setRedeemed(null);
  };

  const onScan = async (data: string) => {
    setQr(data);
    setKey(Crypto.randomUUID());
    setChecking(true);
    setError(null);
    const r = await api.claims.preview({ qrPayload: data });
    setChecking(false);
    if (r.error) { setError(r.error); recheck(r.error); return; }
    setPreview(r.data);
  };

  const confirm = async () => {
    if (!qr || !preview) return;
    const number = billNumber.trim();
    const amountText = billAmount.trim();
    const amount = amountText ? Number(amountText) : undefined;
    if (preview.bill_number_required && !number) return setFormError(strings.offer.required(strings.offer.billNumber));
    if (preview.bill_amount_required && !amountText) return setFormError(strings.offer.required(strings.offer.billAmount));
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) return setFormError(strings.offer.invalidAmount);
    setFormError(null);
    setError(null);
    setBusy(true);
    const r = await api.claims.redeem({
      qrPayload: qr, idempotencyKey: key, billNumber: number || undefined, billAmount: amount,
    });
    setBusy(false);
    if (r.error) {
      if (r.error.code === "NETWORK_ERROR") { setUnsure(true); setError(r.error); return; }
      // The server answered "no", so nothing was redeemed: a corrected attempt gets a fresh key.
      setUnsure(false);
      setKey(Crypto.randomUUID());
      setError(r.error);
      recheck(r.error);
      return;
    }
    setUnsure(false);
    setRedeemed(preview.offer?.title ?? "");
    qc.invalidateQueries({ queryKey: keys.today(r.data.business_id) });
  };

  const businessName = (id?: string) => (id ? businesses.data?.find((b) => b.id === id)?.name : undefined);

  let body: React.ReactNode;
  if (redeemed !== null) {
    body = (
      <Panel tone="success" title={strings.offer.redeemedTitle} body={redeemed ? strings.offer.redeemedBody(redeemed) : undefined}>
        <Button label={strings.scanner.scanAgain} onPress={reset} icon="scan-outline" />
        <Button label={strings.common.done} variant="secondary" onPress={() => router.back()} />
      </Panel>
    );
  } else if (!preview) {
    body = (
      <>
        <Scanner hint={strings.offer.scanning} onScan={onScan} paused={checking || !!error} />
        {checking && <Loading label={strings.offer.checking} />}
        {error && (
          <View style={{ marginTop: 12, gap: 10 }}>
            <ErrorBox message={errorMessage(error)} />
            <Button label={strings.scanner.scanAgain} variant="secondary" onPress={reset} />
          </View>
        )}
      </>
    );
  } else if (preview.flags.length > 0) {
    body = (
      <Panel tone="danger" title={strings.offer.cannotRedeem}
        body={preview.flags.map((f) => strings.offer.flags[f] ?? f).join("\n")}>
        <Button label={strings.scanner.scanAgain} onPress={reset} icon="scan-outline" />
      </Panel>
    );
  } else {
    const o = preview.offer;
    const c = preview.customer;
    const biz = businessName(preview.business_id);
    const final = error && FINAL.has(error.code);
    body = (
      <>
        <InfoCard>
          {o && <InfoRow label={strings.offer.offer} value={o.title} />}
          {c && <InfoRow label={strings.offer.customer} value={c.full_name} />}
          {c?.phone_masked && <InfoRow label={strings.offer.phone} value={c.phone_masked} />}
          {biz && <InfoRow label={strings.offer.business} value={biz} />}
          {o?.min_purchase_amount != null && <InfoRow label={strings.offer.minPurchase} value={fmtAmount(o.min_purchase_amount)} />}
          {o?.max_discount_amount != null && <InfoRow label={strings.offer.maxDiscount} value={fmtAmount(o.max_discount_amount)} />}
          {preview.expires_at && <InfoRow label={strings.offer.expires} value={fmtTime(preview.expires_at)} />}
        </InfoCard>

        {!final && (
          <>
            <Field label={preview.bill_number_required ? strings.offer.billNumber : `${strings.offer.billNumber} (${strings.common.optional})`}
              value={billNumber} onChangeText={setBillNumber} editable={!unsure && !busy} autoCapitalize="characters" />
            <Field label={preview.bill_amount_required ? strings.offer.billAmount : `${strings.offer.billAmount} (${strings.common.optional})`}
              value={billAmount} onChangeText={setBillAmount} editable={!unsure && !busy} keyboardType="decimal-pad" />
          </>
        )}
        {formError && <ErrorBox message={formError} />}
        {error && <ErrorBox message={unsure ? strings.offer.networkRetry : errorMessage(error)} />}
        {busy && <Text className="text-muted text-base text-center my-2">{strings.offer.confirming}</Text>}
        <View style={{ gap: 10, marginTop: 4 }}>
          {final ? (
            <Button label={strings.scanner.scanAgain} onPress={reset} icon="scan-outline" />
          ) : (
            <>
              <Button label={unsure ? strings.common.retry : strings.offer.confirm} icon="checkmark" onPress={confirm} loading={busy} />
              {!unsure && <Button label={strings.common.cancel} variant="secondary" disabled={busy} onPress={reset} />}
            </>
          )}
        </View>
      </>
    );
  }

  return (
    <Screen>
      <Header back title={strings.offer.title} />
      {body}
    </Screen>
  );
}
