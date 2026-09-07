// ── Existing tables (preserved) ──────────────────────────────────────────────
export * from "./games";
export * from "./model-weights";

// ── Canonical reference tables ────────────────────────────────────────────────
export * from "./sports";
export * from "./leagues";
export * from "./seasons";
export * from "./teams";
export * from "./players";
export * from "./sportsbooks";
export * from "./markets";
export * from "./provider-mappings";

// ── Game lifecycle ────────────────────────────────────────────────────────────
export * from "./game-results";

// ── Odds history ──────────────────────────────────────────────────────────────
export * from "./odds-snapshots";
export * from "./closing-lines";

// ── Model registry & predictions ─────────────────────────────────────────────
export * from "./model-versions";
export * from "./mlb-policy-revisions";
export * from "./model-prediction-duplicate-archive";
export * from "./model-predictions";
export * from "./published-picks";
export * from "./publication-decision-history";
export * from "./published-pick-performance-classifications";
export * from "./daily-free-picks";
export * from "./pick-results";
export * from "./forecast-reviews";
export * from "./spread-model-configs";
export * from "./spread-predictions";
export * from "./spread-prediction-results";
export * from "./market-approval-decisions";
export * from "./guarded-serving";

// ── Feature store ─────────────────────────────────────────────────────────────
export * from "./feature-definitions";
export * from "./feature-snapshots";
export * from "./ncaaf-evidence-ledger";
export * from "./ncaaf-college-football-data-evidence";
export * from "./ncaaf-cfbd-advanced-intelligence";
export * from "./ncaaf-feature-snapshots";
export * from "./ncaaf-validation";
export * from "./ncaaf-team-game-performance";
export * from "./ncaaf-pregame-cohorts";
export * from "./ncaaf-football-intelligence-snapshots";
export * from "./ncaaf-v4-game-day-evidence";
export * from "./ncaaf-historical-training-rows";
export * from "./mlb-point-in-time";
export * from "./mlb-historical-pit";
export * from "./mlb-starter-evidence-224c";
export * from "./mlb-v4-live-foundation";
export * from "./v4-platform";

// ── Training & evaluation ─────────────────────────────────────────────────────
export * from "./training-datasets";
export * from "./training-runs";
export * from "./backtest-runs";
export * from "./model-comparisons";
export * from "./deployment-history";

// ── Operations & monitoring ───────────────────────────────────────────────────
export * from "./automation-runs";
export * from "./data-quality-alerts";
export * from "./model-drift-alerts";
export * from "./performance-metrics";

// ── Subscribers (RevenueCat entitlement cache) ────────────────────────────────
export * from "./subscribers";

// ── Push notifications ────────────────────────────────────────────────────────
export * from "./push-tokens";

// ── Alert snoozes ─────────────────────────────────────────────────────────────
export * from "./sport-snoozes";

// ── User notification preferences ─────────────────────────────────────────────
export * from "./notification-preferences";
export * from "./chat-messages";

// ── Push receipts (Expo delivery confirmation) ────────────────────────────────
export * from "./push-receipts";

// ── User preferences (sport filters, tier thresholds) ────────────────────────
export * from "./user-preferences";
