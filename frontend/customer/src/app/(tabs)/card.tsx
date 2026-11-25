// Digital card: short-lived card pass QR (create_card_pass). Refreshes itself before expires_at.
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PageHeader } from "../../components/Brand";
import { Text } from "../../components/Text";
import QRCode from "react-native-qrcode-svg";
import { ErrorBox, Loading, Screen } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { useMe } from "../../lib/queries";
import { strings } from "../../strings";
import { colors, gradients } from "../../theme";
import type { ApiError } from "@rewards/shared";

type Pass = { qr_payload: string; expires_at: string; card_number: string; card_status: string };

export default function Card() {
  const me = useMe();
  const [pass, setPass] = useState<Pass | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [left, setLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasCard = !!me.data?.card;

  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    // A wrong phone clock could make every pass look expired; never ask more than every 30 s.
    if (Date.now() - lastLoad.current < 30_000) {
      timer.current = setTimeout(load, 30_000 - (Date.now() - lastLoad.current));
      return;
    }
    lastLoad.current = Date.now();
    const r = await api.cards.createPass();
    if (r.error) return setError(r.error);
    setError(null);
    setPass(r.data);
  }, []);

  // Only fetch while this tab is visible; ask again a few seconds before the server expiry.
  useFocusEffect(useCallback(() => {
    if (hasCard) load();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [hasCard, load]));

  useEffect(() => {
    if (!pass) return;
    const tick = () => {
      const ms = new Date(pass.expires_at).getTime() - Date.now();
      setLeft(Math.max(0, Math.floor(ms / 1000)));
      if (ms <= 5000) load();
      else timer.current = setTimeout(tick, 1000);
    };
    tick();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [pass, load]);

  const pending = (me.data?.card?.status ?? pass?.card_status) === "pending";

  return (
    <Screen>
      <PageHeader title={strings.card.title} subtitle={strings.card.subtitle} />

      {me.isPending ? <Loading /> : !hasCard ? (
        <FadeContent className="bg-surface border border-line rounded-3xl p-6 mt-4 items-center">
          <View className="rounded-full items-center justify-center bg-surface2 border border-line"
            style={{ width: 72, height: 72 }}>
            <Ionicons name="qr-code-outline" size={34} color={colors.gold} />
          </View>
          <Text className="text-muted text-sm text-center mt-4">{strings.card.noCard}</Text>
          <View style={{ alignSelf: "stretch", marginTop: 18 }}>
            <StarBorder label={strings.card.linkCta} onPress={() => router.push("/link-card")} />
          </View>
        </FadeContent>
      ) : error ? (
        <ErrorBox message={errorMessage(error)} onRetry={load} />
      ) : !pass ? <Loading /> : (
        <FadeContent style={{ alignItems: "center", marginTop: 12 }}>
          {/* Gold frame around the white QR so it reads as part of the card. */}
          <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ padding: 3, borderRadius: 24 }}>
            <View style={{ backgroundColor: "#fff", padding: 18, borderRadius: 21 }}
              accessible accessibilityLabel={`${strings.card.title} ${pass.card_number}`}>
              <QRCode value={pass.qr_payload} size={220} color="#000" backgroundColor="#fff" />
            </View>
          </LinearGradient>
          <Text style={{ color: colors.goldLight, fontSize: 22, letterSpacing: 3, marginTop: 18, fontVariant: ["tabular-nums"] }}>
            {pass.card_number}
          </Text>
          <Text className="text-muted text-sm text-center mt-2">{strings.card.hint}</Text>
          <View className="flex-row items-center bg-surface border border-line rounded-full px-3 py-1.5 mt-3">
            <Ionicons name="time-outline" size={14} color={colors.gold} />
            <Text className="text-muted text-xs ml-1.5" accessibilityLiveRegion="polite">
              {strings.card.expiresIn(left)}
            </Text>
          </View>
        </FadeContent>
      )}

      {me.data && hasCard && (
        <FadeContent index={1} className="bg-surface border border-line rounded-2xl p-4 mt-6">
          <Text className="text-goldLight text-xs font-bold tracking-widest">{strings.card.status}</Text>
          <View className="flex-row items-center mt-2">
            <View style={{ width: 10, height: 10, borderRadius: 5,
              backgroundColor: pending ? colors.gold : me.data.card?.status === "active" ? colors.success : colors.danger }} />
            <Text className="text-text text-lg font-bold ml-2 capitalize">
              {pending ? strings.card.pendingTitle : me.data.card?.status ?? me.data.membership_status}
            </Text>
          </View>
          {pending ? <Text className="text-muted text-sm mt-1">{strings.card.pendingBody}</Text> : null}
          <View className="flex-row items-center mt-2">
            <Ionicons name={me.data.identity_checked_at ? "shield-checkmark" : "shield-outline"} size={16}
              color={me.data.identity_checked_at ? colors.success : colors.muted} />
            <Text className="text-muted text-sm ml-1.5">
              {me.data.identity_checked_at ? strings.card.identityChecked : strings.card.identityNotChecked}
            </Text>
          </View>
        </FadeContent>
      )}
    </Screen>
  );
}
