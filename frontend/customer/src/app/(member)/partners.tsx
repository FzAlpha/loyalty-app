// Travel / partner privileges. Info only: no claim QR, no redemption tracking.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Linking, View } from "react-native";
import { PageHeader } from "../../components/Brand";
import { Text } from "../../components/Text";
import { ErrorBox, Loading, Muted, Screen, fmtDate } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, usePartnerOffers } from "../../lib/queries";
import { strings } from "../../strings";
import { colors } from "../../theme";

export default function Partners() {
  const q = usePartnerOffers();
  return (
    <Screen>
      <PageHeader back title={strings.partners.title} subtitle={strings.partners.subtitle} />
      <View className="flex-row items-center mb-1">
        <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
        <Text className="text-muted text-xs ml-1.5 flex-1">{strings.partners.infoOnly}</Text>
      </View>
      {q.isPending ? <Loading /> : q.error ? (
        <ErrorBox message={errorMessage(apiErrorOf(q.error))} onRetry={() => q.refetch()} />
      ) : (q.data?.length ?? 0) === 0 ? <Muted>{strings.partners.none}</Muted> : (
        q.data!.map((p, i) => (
          <FadeContent key={p.id} index={i} className="bg-surface rounded-2xl p-4 mt-3 border border-line">
            <View className="flex-row items-center">
              <View className="rounded-full items-center justify-center bg-surface2 border border-line"
                style={{ width: 32, height: 32 }}>
                <Ionicons name="airplane" size={16} color={colors.gold} />
              </View>
              <Text className="text-goldLight text-xs ml-2 flex-1">{p.partner_name}</Text>
              {p.discount_text ? (
                <View className="bg-gold rounded-full px-2.5 py-1"><Text className="text-onGold text-xs font-bold">{p.discount_text}</Text></View>
              ) : null}
            </View>
            <Text className="text-text text-lg font-bold mt-1">{p.title}</Text>
            {p.description ? <Text className="text-muted text-sm mt-2">{p.description}</Text> : null}
            {p.claim_code ? (
              <View className="self-start border border-dashed border-gold rounded-lg px-3 py-1.5 mt-3">
                <Text className="text-goldLight text-sm tracking-widest" selectable>{strings.partners.code(p.claim_code)}</Text>
              </View>
            ) : null}
            {p.ends_at ? <Text className="text-muted text-xs mt-2">{strings.offers.validTill(fmtDate(p.ends_at))}</Text> : null}
            {p.terms ? <Text className="text-muted text-xs mt-2">{p.terms}</Text> : null}
            {(p.claim_url ?? p.partner_website_url) ? (
              <View style={{ marginTop: 12 }}>
                <StarBorder label={strings.partners.open} variant="dark"
                  onPress={() => Linking.openURL((p.claim_url ?? p.partner_website_url)!)} />
              </View>
            ) : null}
          </FadeContent>
        ))
      )}
    </Screen>
  );
}
