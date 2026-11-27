/// <reference types="jest" />
// Low-end phone guards: work that is skipped or bounded so slow devices stay responsive.
import { render, renderHook, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Text } from "react-native";

const mockReduced = { value: false };
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated/mock");
  const { View } = jest.requireActual("react-native");
  // Tag animated views so tests can count them.
  const AnimatedView = (p: object) => <View testID="animated-view" {...p} />;
  const Animated = { ...actual.default, View: AnimatedView };
  return { ...actual, __esModule: true, default: Animated, useReducedMotion: () => mockReduced.value };
});
jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), back: jest.fn() },
}));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: ({ children }: { children?: ReactNode }) => children ?? null }));
jest.mock("react-native-qrcode-svg", () => () => null);

const mockOffers = { data: [] as unknown[] };
jest.mock("../lib/queries", () => {
  const actual = jest.requireActual("../lib/queries");
  return {
    ...actual,
    useOffers: () => ({ data: mockOffers.data, isPending: false, error: null, refetch: jest.fn() }),
    useCategories: () => ({ data: [], isPending: false, error: null }),
  };
});
jest.mock("../lib/api", () => ({ api: {} }));

import { FadeContent, MAX_ANIMATED_ITEMS } from "../fx/FadeContent";
import { ShinyText } from "../fx/ShinyText";
import { cacheTimes, keys, useBusinessNames } from "../lib/queries";
import Offers from "../app/(tabs)/offers";

// Query cache already holding the business list (fresh for cacheTimes.reference, so no fetch).
function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(keys.businesses, [{ id: "b1", name: "Biz One", kind: "group" }]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const offer = (i: number) => ({
  id: `o${i}`, business_id: "b1", title: `Offer ${i}`, description: null, terms: null, category_key: "member_discounts",
  ends_at: null, min_purchase_amount: null, max_discount_amount: null,
});

describe("FadeContent", () => {
  it("animates only the first items of a list", async () => {
    await render(
      <>
        {Array.from({ length: 30 }, (_, i) => (
          <FadeContent key={i} index={i}><Text>row {i}</Text></FadeContent>
        ))}
      </>,
    );
    expect(screen.queryAllByTestId("animated-view")).toHaveLength(MAX_ANIMATED_ITEMS);
    expect(screen.getByText("row 29")).toBeTruthy();
  });
});

describe("ShinyText", () => {
  it("draws plain text with no mask or animation when reduced motion is on", async () => {
    mockReduced.value = true;
    await render(<ShinyText>Gold</ShinyText>);
    expect(screen.getByText("Gold")).toBeTruthy();
    expect(screen.queryAllByTestId("animated-view")).toHaveLength(0);
    mockReduced.value = false;
  });

  it("runs the sweep through a focus effect (paused when the tab is not visible)", async () => {
    const { useFocusEffect } = jest.requireMock("expo-router");
    useFocusEffect.mockClear();
    await render(<ShinyText>Gold</ShinyText>);
    expect(useFocusEffect).toHaveBeenCalled();
  });
});

describe("queries", () => {
  it("keeps rarely-changing lists cached longer than the default", () => {
    expect(cacheTimes.reference).toBeGreaterThan(30_000);
  });

  it("looks business names up by id", async () => {
    const { result } = await renderHook(() => useBusinessNames(), { wrapper: Providers });
    expect(result.current("b1")).toBe("Biz One");
    expect(result.current("nope")).toBeUndefined();
  });
});

describe("Offers screen", () => {
  it("mounts only a window of a long offer list", async () => {
    mockOffers.data = Array.from({ length: 300 }, (_, i) => offer(i));
    await render(<Offers />, { wrapper: Providers });
    const shown = screen.queryAllByText(/^Offer \d+$/).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(50);
  });

  it("shows the empty message with no offers", async () => {
    mockOffers.data = [];
    await render(<Offers />, { wrapper: Providers });
    expect(screen.getByText(require("../strings").strings.offers.none)).toBeTruthy();
  });
});
