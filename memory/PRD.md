# What's In My Wardrobe — PRD

## Product
A premium, AI-powered closet cataloger + personal stylist for iOS, Android (React Native Expo) and web preview.

## Scope (Phase 1 MVP)
- **Lean Pilot** flow: onboarding → single-item photo capture → GPT-5.2 vision tagging → closet grid → AI Stylist chat
- **Premium-leaning** additions: Camera roll multi-select scan, curated Lookbooks with "Recreate from your closet"
- **Mocked**: "Identified" mode (brand/product lookup via Ximilar/Google Lens) — UI toggle present, backend stub only

## Auth
- JWT email/password (FastAPI + bcrypt + MongoDB)
- Emergent-managed Google OAuth (Expo WebBrowser + session_token via demobackend.emergentagent.com)
- Both methods coexist; `/api/auth/me` accepts either as Bearer token

## Backend (`/app/backend/server.py`)
All routes under `/api` prefix.

| Endpoint | Method | Purpose |
|---|---|---|
| /auth/register | POST | Email register, returns JWT |
| /auth/login | POST | Email login, returns JWT |
| /auth/google/session | POST | Exchanges Emergent session_id → session_token |
| /auth/me | GET | Current user (Bearer token) |
| /auth/logout | POST | Invalidate session |
| /users/me/profile | PUT | Update DOB, gender, lifestyle, style_preferences, fidelity_mode, onboarding_complete |
| /items | POST | Create item (image_base64 → AI tags) |
| /items | GET | List items (filters: category, color, season, occasion, favorite) |
| /items/{id} | GET / PUT / DELETE | Item CRUD |
| /ai/tag-item | POST | Run GPT-5.2 vision on a single image, returns ItemTags |
| /ai/stylist | POST | Conversational stylist; returns up to N outfits chosen from user's catalog |
| /outfits | GET / POST | Save & list outfits |
| /outfits/{id}/favorite | PUT | Toggle favorite |
| /outfits/{id} | DELETE | Remove |
| /lookbooks | GET | Static curated trend lookbooks |
| /lookbooks/{id} | GET | Lookbook detail |
| /lookbooks/{id}/recreate | POST | GPT picks items from user's closet that match the look |
| /scan/camera-roll | POST | Batch tag & ingest up to 10 photos |

## AI Provider
- **GPT-5.2** via `emergentintegrations.llm.chat.LlmChat` with `EMERGENT_LLM_KEY`
- Tagging schema enforced; JSON-only outputs parsed defensively
- Stylist constrained to choose only from real item_ids in user's catalog

## Frontend (Expo Router)
- `app/index.tsx` — auth-aware splash → routes to login / onboarding / closet
- `app/auth/login.tsx`, `app/auth/register.tsx`
- `app/onboarding/index.tsx` — 5-step wizard (DOB → gender → lifestyle → style prefs → fidelity)
- `app/(tabs)/_layout.tsx` — translucent blur bottom tab bar
  - `closet.tsx` — grid + category filters + add CTA
  - `stylist.tsx` — chat with outfit cards (horizontal scroll), save look
  - `looks.tsx` — Trends (lookbooks) + Saved (user outfits)
  - `profile.tsx` — hero header, stats, settings, fidelity toggle, sign out
- `app/add-item.tsx` — camera or library → AI tagging → confirm → save
- `app/item/[id].tsx` — full-bleed image + tag pills + delete
- `app/lookbook/[id].tsx` — editorial cover + "Recreate from my closet"
- `app/scan/camera-roll.tsx` — multi-select → batch scan

## Design (`/app/design_guidelines.json`)
Dark luxury / editorial: pure black backgrounds, gold (#C5A059) accent, serif headings (Georgia fallback), Outfit/system body. 8pt spacing, sharp corners (2-4px radius), generous 24-32px gaps.

## Storage
- Images: base64 stored on item documents (sufficient for MVP / works on Expo Go without cloud storage)
- Tokens: `expo-secure-store` (mobile) / `AsyncStorage` (web) via `@/src/utils/storage`
- MongoDB collections: `users`, `user_sessions`, `items`, `outfits`

## Business enhancement built-in
- **Sharing-led growth hook**: Outfit cards saved via Stylist become the seed for the planned share-a-look feature; lookbook "Recreate from your closet" is a viral magnet — every recreation can be screenshot/shared organically.

## Known limitations (deferred)
- Guided real-time video walkthrough → MVP uses single-shot capture + camera roll batch
- Identified mode (Ximilar / Google Lens) → mocked, requires user API keys
- Shared closets, push notifications, subscription billing → post-MVP
