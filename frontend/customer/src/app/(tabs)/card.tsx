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
    <Screen tabBar>
      <PageHeader title={strings.card.title} subtitle={strings.card.subtitle} />

      {me.isPending ? <Loading /> : !hasCard ? (
        <FadeContent className="bg-surface border border-lineSoft rounded-3xl p-6 mt-4 items-center">
          <View className="rounded-full items-center justify-center"
            style={{ width: 76, height: 76, backgroundColor: colors.goldSoft }}>
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
        <FadeContent style={{ marginTop: 8 }}>
          {/* Gold-foil frame, dark panel, white QR: the pass reads as part of the member card. */}
          <LinearGradient colors={gradients.goldFoil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ padding: 2, borderRadius: 32 }}>
            <LinearGradient colors={gradients.panel} style={{ borderRadius: 30, padding: 22, alignItems: "center" }}>
              <Text className="text-gold text-xs font-bold" style={{ letterSpacing: 2.5 }}>{strings.brand.member}</Text>
              <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 22, marginTop: 14 }}
                accessible accessibilityLabel={`${strings.card.title} ${pass.card_number}`}>
                <QRCode value={pass.qr_payload} size={216} color="#000" backgroundColor="#fff" />
              </View>
              <Text className="font-bold" style={{ color: colors.goldLight, fontSize: 20, letterSpacing: 3, marginTop: 18, fontVariant: ["tabular-nums"] }}>
                {pass.card_number}
              </Text>
              <Text className="text-muted text-sm text-center mt-1">{strings.card.hint}</Text>
            </LinearGradient>
          </LinearGradient>
          <View className="flex-row items-center self-center rounded-full px-4 py-2 mt-4" style={{ backgroundColor: colors.goldSoft }}>
            <Ionicons name="time-outline" size={14} color={colors.gold} />
            <Text className="text-goldLight text-xs font-semibold ml-1.5" accessibilityLiveRegion="polite">
              {strings.card.expiresIn(left)}
            </Text>
          </View>
        </FadeContent>
      )}

      {me.data && hasCard && (
        <FadeContent index={1} className="bg-surface border border-lineSoft rounded-3xl p-5 mt-6">
          <Text className="text-gold text-xs font-bold" style={{ letterSpacing: 2 }}>{strings.card.status}</Text>
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
