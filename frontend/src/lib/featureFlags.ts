import { Platform } from "react-native";

// In-app purchases (points packs + subscriptions).
// iOS ships free-only until the Paid Apps Agreement is active on the
// App Store account — every purchase surface and plan/pack reference must
// stay hidden there (App Review 2.1(b): visible references to unsubmitted
// IAPs are themselves a rejection). Web keeps the Square checkout.
export const IAP_ENABLED = Platform.OS !== "ios";

// Nearby-services directories (groomers, organizers, dry cleaners) depend on a
// Google Places API key that is not configured in production — without it the
// screens are empty shells, which App Review treats as placeholder content.
// Re-enable once GOOGLE_PLACES_API_KEY is set on the backend.
export const SERVICES_DIRECTORY_ENABLED = false;

// The vlog screen is a static "Coming soon" teaser — placeholder content that
// App Review rejects under guideline 2.1. Hide until real content exists.
export const VLOG_ENABLED = false;
