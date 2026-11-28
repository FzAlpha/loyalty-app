import Constants from "expo-constants";
import { router } from "expo-router";
import { View } from "react-native";
import { BrandBadge, GoldDivider, PageHeader } from "../../components/Brand";
import { Text } from "../../components/Text";
import { MenuGroup, MenuRow, Muted, Screen, SectionTitle } from "../../components/ui";
import { useMe } from "../../lib/queries";
import { strings } from "../../strings";

export default function More() {
  const me = useMe();
  const showLink = !!me.data && !me.data.card;
  return (
    <Screen tabBar>
      <PageHeader title={strings.more.title} />
      <View style={{ marginTop: 8 }}>
        <MenuGroup>
          <MenuRow icon="storefront" label={strings.more.partners} hint={strings.more.partnersHint}
            onPress={() => router.push("/partners")} last={!showLink} />
          {showLink ? (
            <MenuRow icon="qr-code-outline" label={strings.more.linkCard} hint={strings.more.linkHint}
              onPress={() => router.push("/link-card")} last />
          ) : null}
        </MenuGroup>
      </View>

      <SectionTitle>{strings.more.account}</SectionTitle>
      <MenuGroup>
        <MenuRow icon="key-outline" label={strings.account.changePassword} hint={strings.more.passwordHint}
          onPress={() => router.push("/change-password")} last />
      </MenuGroup>

      <SectionTitle>{strings.more.about.toUpperCase()}</SectionTitle>
      <View className="bg-surface rounded-3xl p-6 border border-lineSoft items-center">
        <BrandBadge size={64} />
        <Text className="text-goldLight text-base font-bold mt-3 text-center">{strings.brand.program}</Text>
        <GoldDivider style={{ width: 120, marginVertical: 12 }} />
        <Text className="text-muted text-sm text-center">{strings.more.aboutBody}</Text>
      </View>
      <View style={{ marginTop: 20, alignItems: "center" }}>
        <Muted>{strings.more.version(Constants.expoConfig?.version ?? "")}</Muted>
      </View>
    </Screen>
  );
}
