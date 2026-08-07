import { Platform } from "react-native";

// In-app purchases (points packs + subscriptions).
// iOS ships free-only until the Paid Apps Agreement is active on the
// App Store account — every purchase surface and plan/pack reference must
// stay hidden there (App Review 2.1(b): visible references to unsubmitted
// IAPs are themselves a rejection). Web keeps the Square checkout.
export const IAP_ENABLED = Platform.OS !== "ios";
