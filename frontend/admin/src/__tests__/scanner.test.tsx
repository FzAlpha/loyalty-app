/// <reference types="jest" />
// Low-end phone guard: the camera (and QR decoder) runs only while the scan screen is visible and not paused.
import { render, screen } from "@testing-library/react-native";

const mockFocused = { value: true };
jest.mock("expo-router", () => ({ useIsFocused: () => mockFocused.value }));
jest.mock("expo-camera", () => {
  const { View } = jest.requireActual("react-native");
  return {
    CameraView: (p: object) => <View testID="camera" {...p} />,
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});

import { Scanner } from "../components/Scanner";

describe("Scanner", () => {
  beforeEach(() => { mockFocused.value = true; });

  it("runs the camera while focused and not paused, scanning QR codes only", async () => {
    await render(<Scanner hint="Scan" onScan={jest.fn()} paused={false} />);
    const cam = screen.getByTestId("camera");
    expect(cam.props.barcodeScannerSettings).toEqual({ barcodeTypes: ["qr"] });
  });

  it("stops the camera when the screen is not visible", async () => {
    mockFocused.value = false;
    await render(<Scanner hint="Scan" onScan={jest.fn()} paused={false} />);
    expect(screen.queryByTestId("camera")).toBeNull();
  });

  it("stops the camera while paused", async () => {
    await render(<Scanner hint="Scan" onScan={jest.fn()} paused />);
    expect(screen.queryByTestId("camera")).toBeNull();
  });

  it("handles only the first scan of a QR", async () => {
    const onScan = jest.fn();
    await render(<Scanner hint="Scan" onScan={onScan} paused={false} />);
    const cam = screen.getByTestId("camera");
    cam.props.onBarcodeScanned({ data: "a" });
    cam.props.onBarcodeScanned({ data: "a" });
    expect(onScan).toHaveBeenCalledTimes(1);
  });
});
