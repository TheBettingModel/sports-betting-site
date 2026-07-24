---
name: Admin & Push Upgrades
description: Admin secret key lockout, win-rate charts, push receipt retry, notification preferences
---

# Admin & Push Upgrades (Tasks 5, 6, 25, 26)

## Admin Secret Key Lockout (Task 5)
- Already validated against `MASTER_API_KEY` env var — no hardcoded fallback
- Added per-IP `failedAttempts` module-level map; after 3 failures, 5-second lockout (HTTP 429)
- Both 401 and 429 return identical `{ error: "Invalid key" }` body (no info leakage)
- `createSession` in `api.ts` treats 429 same as 401 (returns null, shows generic error)

## Win-Rate Trends + ROI Charts (Task 6)
- New endpoint: `GET /api/model-stats/history` in `model-stats.ts`
- Queries `pick_results` → `published_picks` joined by week (`date_trunc('week', graded_at)`)
- Returns 8 weeks of wins/losses/pushes/unitsWon per sport + "ALL" aggregate
- `Models.tsx` fully rewritten: sport selector tabs, line chart (win rate), bar chart (units P&L), tier table
- `WeeklyHistoryEntry` and `ModelStatsHistoryResult` types added to `api.ts`

## Push Receipt Retry (Task 25)
- New table: `push_receipts` (receipt_id unique, user_id, token, checked bool, status, error_details jsonb)
- `storePushReceipts()` inserts with `checked=false`; `checkPendingPushReceipts()` calls Expo API for unchecked rows >15min old
- `DeviceNotRegistered` / `InvalidCredentials` → deactivates token; `MessageTooBig` → logs warning
- Rows >24h old marked `status=expired` (Expo TTL)
- Scheduler: runs at :05 and :35 every hour (every 30 min)

## Sport-Specific Notification Preferences (Task 26)
- New table: `user_preferences` (user_id unique, notif_sports jsonb, notif_min_tier text, notif_enabled bool)
- Endpoints: `GET /api/preferences` (auth), `PUT /api/preferences` (Pro required)
- Push service: fetches prefs per user batch; skips if notif_enabled=false, sport not in list, or tier below minimum
- Falls back to legacy `notification_preferences` table for users without a `user_preferences` row
- Mobile: `useUserPreferences` hook; profile.tsx sports toggle + tier chip selector ("Playable / Strong / Elite")
