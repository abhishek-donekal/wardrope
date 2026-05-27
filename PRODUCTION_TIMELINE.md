# Wardrope — Production Readiness Timeline

**Prepared:** May 26, 2026  
**Current status:** Development build live at [wardrope-red.vercel.app](https://wardrope-red.vercel.app)

---

## What Is Already Built and Live

| Area | Status |
|---|---|
| Frontend (web app) | Live — all screens built and deployed |
| Backend API (FastAPI) | Live — deployed and connected to database |
| Database (MongoDB Atlas) | Live — user data persisting |
| Email/password auth | Working |
| Google sign-in | Built — needs end-to-end test |
| Digital wardrobe (add, view, delete items) | Built |
| AI clothing tagger (auto-labels photos) | Built — needs API key to activate |
| AI stylist (generates outfits from your wardrobe) | Built — needs API key to activate |
| Lookbooks (editorial inspo, recreate with your items) | Built |
| Camera roll bulk scan | Built |
| Outfit saving and favorites | Built |
| User onboarding flow | Built |

---

## What Is Still Needed Before Production

### Phase 1 — Make It Fully Functional (1–2 weeks)

These are blockers. The app is live but some core features are off until these are done.

| Task | Effort | Why It Matters |
|---|---|---|
| Add OpenAI API key to backend | 1 hour | Without it, AI tagging and the stylist return nothing. These are the app's core differentiators. |
| Set a real JWT secret | 1 hour | Currently using a default dev value. Must be changed before real users sign in. |
| Test Google sign-in end to end | 1 day | The flow is built but depends on a third-party OAuth proxy. Needs a verified pass on real devices. |
| Full QA pass on all screens | 3–4 days | Click through every screen on web (desktop + mobile browser) and log any broken flows. |

**End of Phase 1:** The app is feature-complete and usable by real users for a private beta.

---

### Phase 2 — Production Hardening (2–3 weeks)

The app works but is not safe or scalable at volume.

| Task | Effort | Why It Matters |
|---|---|---|
| Migrate image storage off MongoDB | 4–5 days | Images are currently stored as base64 text inside database records. MongoDB has a 16 MB document limit. A user with 50+ items will hit errors. Need to move to Cloudinary or S3. |
| Forgot password / password reset flow | 2–3 days | No way for users to recover their account right now. Requires email sending (SendGrid or similar). |
| Rate limiting on the API | 1 day | Without it, anyone can hammer the AI endpoints and run up OpenAI costs. |
| Error monitoring (Sentry) | 1 day | Currently errors are invisible unless you manually check Vercel logs. Need alerts when things break. |
| Brand recognition ("Identified" mode) | 3–5 days | The app has a toggle for identifying exact brand/product of a clothing item, but it currently returns nothing. Requires integration with a third-party service (e.g. Google Lens, Ximilar). |

**End of Phase 2:** The app is production-safe for a public launch on web.

---

### Phase 3 — Native Mobile App (4–6 weeks, if required)

If the client wants an iOS/Android app in the App Store, this is a separate workstream.

| Task | Effort |
|---|---|
| Set up Expo EAS Build (cloud build pipeline) | 2–3 days |
| iOS-specific fixes (camera permissions, image picker) | 3–5 days |
| Android-specific fixes | 2–3 days |
| Apple Developer account + App Store submission | 1–2 weeks (Apple review time) |
| Google Play account + submission | 3–5 days (faster review) |
| Push notifications (outfit reminders, new lookbooks) | 3–4 days |

**Note:** The codebase is already built in React Native (Expo), so native builds are achievable without rewriting anything. The above is configuration and platform compliance work, not new development.

---

## Summary Timeline

| Milestone | Target |
|---|---|
| AI features active, auth confirmed working | Week 1–2 |
| Private beta launch (invite only) | Week 2 |
| Image storage fixed, password reset, rate limiting | Week 3–4 |
| **Public web launch** | **Week 4–5** |
| Native iOS + Android apps submitted | Week 8–10 |
| App Store / Play Store approval | Week 9–12 |

---

## Key Risks

1. **Apple App Store review** — Apple typically takes 1–3 weeks and may reject the first submission. Budget 2 review cycles.
2. **OpenAI API costs** — The AI stylist and tagger call GPT-4o per request. With active users, costs can grow quickly. A usage cap per user per day should be built into Phase 2.
3. **Google OAuth dependency** — Google sign-in currently routes through a third-party proxy service (Emergent). If that service changes or goes down, Google login breaks. Replacing it with a direct OAuth integration is recommended before a large public launch.

---

## What Is NOT in Scope (Not Built, Not Planned)

- Shopping / e-commerce integration (buy the identified item)
- Social features (share outfits, follow users)
- Weather API integration for automatic outfit suggestions by weather
- Subscription / paywall
- Multi-language support

These can be scoped as a follow-on phase once the core app is stable.
