// Link a physical membership card by scanning its QR (link_card). The card then waits for staff approval.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import type { ApiError } from "@rewards/shared";
import { PageHeader } from "../../components/Brand";
import { Text } from "../../components/Text";
import { ErrorBox, Loading, Screen } from "../../components/ui";
import { FadeContent } from "../../fx/FadeContent";
import { StarBorder } from "../../fx/StarBorder";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { keys } from "../../lib/queries";
import { strings } from "../../strings";
import { colors } from "../../theme";

const FRAME = 240;

function Panel({ icon, title, body, children }: {
  icon: "camera-outline" | "checkmark-circle" | "phone-portrait-outline"; title: string; body: string; children?: React.ReactNode;
}) {
  return (
    <FadeContent className="bg-surface border border-line rounded-3xl p-6 mt-4 items-center">
      <Ionicons name={icon} size={44} color={icon === "checkmark-circle" ? colors.success : colors.gold} />
      <Text className="text-text text-lg font-bold mt-3 text-center">{title}</Text>
      <Text className="text-muted text-sm mt-2 text-center">{body}</Text>
      {children ? <View style={{ alignSelf: "stretch", marginTop: 18, gap: 10 }}>{children}</View> : null}
    </FadeContent>
  );
}

// Gold corner marks over the camera, showing where to hold the QR.
function Corners() {
  const c = { position: "absolute", width: 36, height: 36, borderColor: colors.gold } as const;
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: FRAME, height: FRAME, alignSelf: "center", top: 30 }}>
      <View style={[c, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 }]} />
      <View style={[c, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 }]} />
      <View style={[c, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 }]} />
      <View style={[c, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 }]} />
    </View>
  );
}

export default function LinkCard() {
  const [permission, requestPermission] = useCameraPermissions();
  const qc = useQueryClient();
  const locked = useRef(false); // the camera fires many events per QR; handle only the first
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [linked, setLinked] = useState<string | null>(null);

  const onScan = async ({ data }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    setLinking(true);
    setError(null);
    const r = await api.cards.link({ qrPayload: data });
    setLinking(false);
    if (r.error) return setError(r.error);
    setLinked(r.data.card_number);
    qc.invalidateQueries({ queryKey: keys.me });
  };

  const scanAgain = () => { setError(null); locked.current = false; };
  const message = (e: ApiError) =>
    e.code === "INVALID_QR" || e.code === "VALIDATION_FAILED" ? strings.link.invalidQr : errorMessage(e);

  let body: React.ReactNode;
  if (Platform.OS === "web") {
    body = <Panel icon="phone-portrait-outline" title={strings.link.title} body={strings.link.webUnsupported} />;
  } else if (linked) {
    body = (
      <Panel icon="checkmark-circle" title={strings.link.doneTitle} body={strings.link.doneBody(linked)}>
        <StarBorder label={strings.link.done} onPress={() => router.replace("/(tabs)/card")} />
      </Panel>
    );
  } else if (!permission) {
    body = <Loading />;
  } else if (!permission.granted) {
    body = (
      <Panel icon="camera-outline" title={strings.link.permissionTitle} body={strings.link.permissionBody}>
        {permission.canAskAgain
          ? <StarBorder label={strings.link.allow} onPress={requestPermission} />
          : <StarBorder label={strings.link.openSettings} onPress={() => Linking.openSettings()} />}
      </Panel>
    );
  } else {
    body = (
      <FadeContent style={{ marginTop: 16 }}>
        <View style={{ height: FRAME + 60, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}>
          {!error && !linking ? (
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={onScan} />
          ) : (
            <View style={{ flex: 1, backgroundColor: colors.surface }} />
          )}
          <Corners />
        </View>
        {linking ? (
          <View className="items-center mt-4"><Loading /><Text className="text-muted text-sm">{strings.link.linking}</Text></View>
        ) : error ? (
          <View style={{ marginTop: 12 }}>
            <ErrorBox message={message(error)} />
            <StarBorder label={strings.link.scanAgain} onPress={scanAgain} variant="dark" />
          </View>
        ) : (
          <Text className="text-muted text-sm text-center mt-4">{strings.link.scanning}</Text>
        )}
      </FadeContent>
    );
  }

  return (
    <Screen>
      <PageHeader back title={strings.link.title} subtitle={strings.link.subtitle} />
      {body}
    </Screen>
  );
}
