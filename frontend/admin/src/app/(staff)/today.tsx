// The signed-in staff member's confirmed redemptions today at the current business
// (api.list_my_redemptions_today; "today" is the business's time zone, decided by the server).
import { View } from "react-native";
import { Text } from "@rewards/ui";
import { Button, ErrorBox, fmtAmount, fmtTime, Header, Loading, Panel, Screen } from "../../components/ui";
import { errorMessage } from "../../lib/errors";
import { apiErrorOf, useToday } from "../../lib/queries";
import { useWorkplace } from "../../lib/workplace";
import { strings } from "../../strings";

function TodayList({ businessId, businessName }: { businessId: string; businessName: string }) {
  const q = useToday(businessId);
  const rows = q.data?.pages.flat() ?? [];
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching && !q.isFetchingNextPage}>
      <Header back title={strings.today.title} subtitle={strings.today.subtitle(businessName)} />
      {q.isPending ? <Loading /> : q.isError ? (
        <ErrorBox message={errorMessage(apiErrorOf(q.error))} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <Text className="text-muted text-base">{strings.today.empty}</Text>
      ) : (
        <>
          {rows.map((r) => (
            <View key={r.id} className="bg-surface rounded-2xl p-4 mb-3 border border-line">
              <View className="flex-row justify-between">
                <Text className="text-text text-lg font-bold flex-1">{r.offer_title ?? "—"}</Text>
                <Text className="text-gold text-base ml-3">{fmtTime(r.redeemed_at)}</Text>
              </View>
              {(r.customer_name || r.phone_masked) && (
                <Text className="text-muted text-base mt-1">{[r.customer_name, r.phone_masked].filter(Boolean).join(" · ")}</Text>
              )}
              {(r.bill_number || r.bill_amount != null) && (
                <Text className="text-muted text-base mt-1">
                  {[r.bill_number ? strings.today.bill(r.bill_number) : null, r.bill_amount != null ? fmtAmount(r.bill_amount) : null]
                    .filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
          ))}
          {q.hasNextPage && (
            <Button label={strings.today.loadMore} variant="secondary" onPress={() => q.fetchNextPage()} loading={q.isFetchingNextPage} />
          )}
        </>
      )}
    </Screen>
  );
}

export default function Today() {
  const { businessId, businessName } = useWorkplace();
  if (!businessId) {
    return (
      <Screen>
        <Header back title={strings.today.title} />
        <Panel tone="info" title={strings.home.chooseBusiness} body={strings.home.noBusiness} />
      </Screen>
    );
  }
  return <TodayList businessId={businessId} businessName={businessName ?? ""} />;
}
