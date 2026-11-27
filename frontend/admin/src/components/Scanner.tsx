// QR camera with permission handling. Calls onScan once per QR; the parent shows the result and
// remounts (or sets paused=false) to scan again. Android only: the web build shows a notice.
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useIsFocused } from "expo-router";
import { useEffect, useRef } from "react";
import { Linking, Platform, View } from "react-native";
import { colors, Text } from "@rewards/ui";
import { strings } from "../strings";
import { Button, Loading, Panel } from "./ui";

const FRAME = 240;

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

export function Scanner({ hint, onScan, paused }: { hint: string; onScan: (data: string) => void; paused: boolean }) {
  const [permission, requestPermission] = useCameraPermissions();
  // The camera runs only while this screen is visible: a screen left in the stack would otherwise keep
  // the camera and QR decoder busy (battery and CPU on low-end phones).
  const focused = useIsFocused();
  const locked = useRef(false); // the camera fires many events per QR; handle only the first
  useEffect(() => { if (!paused) locked.current = false; }, [paused]);

  if (Platform.OS === "web") return <Panel tone="info" title={strings.scanner.permissionTitle} body={strings.scanner.webUnsupported} />;
  if (!permission) return <Loading />;
  if (!permission.granted) {
    return (
      <Panel tone="info" title={strings.scanner.permissionTitle} body={strings.scanner.permissionBody}>
        {permission.canAskAgain
          ? <Button label={strings.scanner.allow} onPress={requestPermission} icon="camera-outline" />
          : <Button label={strings.scanner.openSettings} onPress={() => Linking.openSettings()} />}
      </Panel>
    );
  }

  const handle = ({ data }: BarcodeScanningResult) => {
    if (locked.current || paused) return;
    locked.current = true;
    onScan(data);
  };

  return (
    <View>
      <View style={{ height: FRAME + 60, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}>
        {!paused && focused ? (
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={handle} />
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.surface }} />
        )}
        <Corners />
      </View>
      {!paused && <Text className="text-muted text-base text-center mt-3">{hint}</Text>}
    </View>
  );
}
