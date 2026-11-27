// Partner businesses (businesses.kind = 'partner') and their offers. Partner offers are ordinary offers
// from api.list_eligible_offers, so they are claimed and redeemed like group offers (offers tab).
import { router } from "expo-router";
import { View } from "react-native";
import { PageHeader } from "../../components/Brand";
import { OfferCard } from "../../components/OfferCard";
import { Text } from "../../components/Text";
import { ErrorBox, Loading, Muted, Screen } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, useBusinesses, useOffers } from "../../lib/queries";
import { strings } from "../../strings";
import { colors } from "../../theme";

export default function Partners() {
  const businesses = useBusinesses();
  const offers = useOffers();
  const failed = businesses.error ?? offers.error;
  const partners = (businesses.data ?? []).filter((b) => b.kind === "partner");

  return (
    <Screen>
      <PageHeader back title={strings.partners.title} subtitle={strings.partners.subtitle} />
      {businesses.isPending || offers.isPending ? <Loading /> : failed ? (
        <ErrorBox message={errorMessage(apiErrorOf(failed))}
          onRetry={() => { void businesses.refetch(); void offers.refetch(); }} />
      ) : partners.length === 0 ? <Muted>{strings.partners.noBusinesses}</Muted> : (
        partners.map((b, i) => {
          const own = (offers.data ?? []).filter((o) => o.business_id === b.id);
          return (
            <FadeContent key={b.id} index={i} className="mt-4">
              <View className="flex-row items-center mb-2">
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: b.brand_color ?? colors.goldDark,
                  alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.onGold, fontWeight: "700", fontSize: 16 }}>{b.name.slice(0, 1)}</Text>
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-text text-base font-bold">{b.name}</Text>
                  {b.category ? <Text className="text-muted text-xs">{b.category}</Text> : null}
                </View>
              </View>
              {own.length === 0 ? <Muted>{strings.partners.noOffers}</Muted> : own.map((o) => (
                <OfferCard key={o.id} offer={o} businessName={b.name}
                  onPress={() => router.push({ pathname: "/(tabs)/offers", params: { offer: o.id } })} />
              ))}
            </FadeContent>
          );
        })
      )}
    </Screen>
  );
}
