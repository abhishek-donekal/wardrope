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

// "Identified" cataloguing fidelity (brand + product lookup) is still mocked on
// the backend — it stores no brand or product, so every surface offering it is a
// promise the app does not keep, which App Review rejects under guideline 2.1.
// Re-enable once a real brand-recognition provider is wired into item creation.
export const BRAND_ID_ENABLED = false;

// Closet sharing was never finished: `is_shared` is read by the friend-profile
// endpoint but no API or screen can ever set it, so "Shared Closets" is empty
// for every user forever. Hide the section until sharing actually ships, rather
// than showing a permanently empty promise (guideline 2.1).
export const SHARED_CLOSETS_ENABLED = false;
