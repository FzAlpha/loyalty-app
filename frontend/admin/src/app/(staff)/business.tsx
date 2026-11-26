// Owner only: pick the business being served. A UI choice; every call is still checked by the server.
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, Text } from "@rewards/ui";
import { ErrorBox, Header, Loading, Screen } from "../../components/ui";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, useBusinesses } from "../../lib/queries";
import { setWorkplace, useWorkplace } from "../../lib/workplace";
import { strings } from "../../strings";

export default function Business() {
  const list = useBusinesses();
  const current = useWorkplace((w) => w.businessId);

  return (
    <Screen onRefresh={() => list.refetch()} refreshing={list.isRefetching}>
      <Header back title={strings.business.title} subtitle={strings.business.subtitle} />
      {list.isPending ? <Loading /> : list.isError ? (
        <ErrorBox message={errorMessage(apiErrorOf(list.error))} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <Text className="text-muted text-base">{strings.business.empty}</Text>
      ) : (
        list.data.map((b) => (
          <Pressable key={b.id} accessibilityRole="radio" accessibilityState={{ selected: b.id === current }}
            onPress={() => { setWorkplace(b.id, b.name); router.back(); }}
            className="bg-surface rounded-2xl p-4 mb-3 border border-line flex-row items-center" style={{ minHeight: 64 }}>
            <View className="flex-1">
              <Text className="text-text text-lg font-bold">{b.name}</Text>
              {b.category ? <Text className="text-muted text-sm">{b.category}</Text> : null}
            </View>
            <Ionicons name={b.id === current ? "radio-button-on" : "radio-button-off"} size={24}
              color={b.id === current ? colors.gold : colors.muted} />
          </Pressable>
        ))
      )}
    </Screen>
  );
}
