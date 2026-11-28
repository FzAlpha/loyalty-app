import { View } from "react-native";
import { BrandBadge } from "./Brand";
import { Text } from "./Text";
import { FadeContent } from "../fx/FadeContent";
import { ShinyText } from "../fx/ShinyText";
import { strings } from "../strings";

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <FadeContent style={{ alignItems: "center", marginTop: 32, marginBottom: 28 }}>
      <BrandBadge size={92} />
      <Text className="text-gold text-xs font-bold mt-5" style={{ letterSpacing: 3 }}>
        {strings.brand.group.toUpperCase()}
      </Text>
      <View style={{ marginTop: 8 }}>
        <ShinyText style={{ fontSize: 30, fontWeight: "800", textAlign: "center" }} accessibilityRole="header">{title}</ShinyText>
      </View>
      <Text className="text-muted text-sm mt-2 text-center">{subtitle}</Text>
    </FadeContent>
  );
}
