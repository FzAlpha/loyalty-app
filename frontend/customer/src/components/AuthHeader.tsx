import { View } from "react-native";
import { BrandBadge, GoldDivider } from "./Brand";
import { Text } from "./Text";
import { FadeContent } from "../fx/FadeContent";
import { ShinyText } from "../fx/ShinyText";

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <FadeContent style={{ alignItems: "center", marginTop: 24, marginBottom: 24 }}>
      <BrandBadge size={96} />
      <View style={{ marginTop: 16 }}>
        <ShinyText style={{ fontSize: 22, textAlign: "center" }} accessibilityRole="header">{title}</ShinyText>
      </View>
      <Text className="text-muted text-sm mt-2 text-center">{subtitle}</Text>
      <GoldDivider style={{ width: 160, marginTop: 16 }} />
    </FadeContent>
  );
}
