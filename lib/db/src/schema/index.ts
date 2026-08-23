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
export * from "./pick-results";

// ── Feature store ─────────────────────────────────────────────────────────────
export * from "./feature-definitions";
export * from "./feature-snapshots";

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

// ── Push receipts (Expo delivery confirmation) ────────────────────────────────
export * from "./push-receipts";

// ── User preferences (sport filters, tier thresholds) ────────────────────────
export * from "./user-preferences";
