/**
 * NCAAF provider inventory.
 *
 * This is deliberately declarative: it performs no provider requests and does
 * not infer capabilities from credentials or a provider's public product
 * catalogue.  Each entry describes behavior wired into this repository.
 */

export const NCAAF_CAPABILITY_STATES = [
  "AVAILABLE_NOW",
  "AVAILABLE_BUT_NOT_CAPTURED",
  "PARTIAL",
  "REQUIRES_PROVIDER",
  "NOT_SUPPORTED",
] as const;

export type NcaafCapabilityState = typeof NCAAF_CAPABILITY_STATES[number];

export type NcaafProvider = "espn_scoreboard" | "espn_summary" | "odds_api" | "open_meteo" | "college_football_data";

export type NcaafCapability =
  | "schedule"
  | "game_identity"
  | "team_ids"
  | "conferences"
  | "venue"
  | "neutral_site"
  | "status"
  | "scores"
  | "team_boxscore"
  | "player_stats"
  | "qb_performance"
  | "play_by_play"
  | "current_market_evidence"
  | "opening_market_evidence"
  | "closing_market_evidence"
  | "player"
  | "roster"
  | "injury"
  | "depth_chart"
  | "play_level_epa"
  | "play_level_success"
  | "play_level_explosiveness"
  | "play_level_havoc"
  | "drive"
  | "recruiting"
  | "transfer"
  | "coaching"
  | "special_teams"
  | "current_weather"
  | "historical_point_in_time";

export interface NcaafProviderCapability {
  readonly provider: NcaafProvider;
  readonly capability: NcaafCapability;
  readonly state: NcaafCapabilityState;
  /** What the current implementation does (not an assertion about vendor APIs). */
  readonly evidence: string;
  /** Whether the currently wired code can supply a pre-kickoff historical value. */
  readonly pointInTimeState: NcaafCapabilityState;
  /** Provider or implementation needed to make this capability fully usable. */
  readonly requiredProvider?: string;
}

function freezeInventory(
  entries: readonly NcaafProviderCapability[],
): readonly NcaafProviderCapability[] {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

/**
 * Current NCAAF behavior only.  ESPN's scoreboard is the game/context source;
 * Odds API rows are market evidence and must never be treated as football
 * intelligence.
 */
export const NCAAF_PROVIDER_CAPABILITIES = freezeInventory([
  ...([
    "schedule", "game_identity", "team_ids", "conferences", "venue", "status", "scores",
  ] as const).map((capability) => ({
    provider: "college_football_data" as const, capability, state: "AVAILABLE_NOW" as const,
    pointInTimeState: "PARTIAL" as const,
     evidence: "The server-only CFBD client captures bounded current-season games and runs an explicit exact-name/ordered-kickoff CFBD-to-ESPN mapping ledger; ambiguous identities remain unmapped.",
  } satisfies NcaafProviderCapability)),
  ...([
    "team_boxscore", "player_stats", "play_by_play", "player", "roster", "recruiting",
    "transfer", "coaching", "special_teams", "play_level_epa", "play_level_success",
    "play_level_explosiveness", "play_level_havoc", "drive", "current_weather",
  ] as const).map((capability) => ({
     provider: "college_football_data" as const, capability, state: "PARTIAL" as const,
    pointInTimeState: "PARTIAL" as const,
     evidence: "A rate-aware CFBD domain materializer schedules these endpoint families by game, daily, or weekly cadence and preserves raw payload before normalized evidence. Actual availability and PIT semantics remain explicitly audited per captured response.",
  } satisfies NcaafProviderCapability)),
  {
    provider: "college_football_data", capability: "historical_point_in_time", state: "PARTIAL",
    pointInTimeState: "NOT_SUPPORTED",
    requiredProvider: "Timestamped CFBD captures retained before each target kickoff",
    evidence: "CFBD responses are timestamped at capture; current bounded capture does not reconstruct values that were unavailable before historical kickoffs.",
  },
  ...([
    "schedule", "game_identity", "team_ids", "conferences", "venue",
    "neutral_site", "status", "scores",
  ] as const).map((capability) => ({
    provider: "espn_scoreboard" as const,
    capability,
    state: "AVAILABLE_NOW" as const,
    pointInTimeState: "PARTIAL" as const,
    evidence: "The NCAAF ESPN scoreboard mapping persists game IDs, team IDs, conference IDs, venue/neutral-site context, status, and scores; date backfill fetches the same scoreboard endpoint.",
  } satisfies NcaafProviderCapability)),
  ...([
    "player", "roster", "injury", "depth_chart", "play_level_epa",
    "play_level_success", "play_level_explosiveness", "play_level_havoc",
    "drive", "recruiting", "transfer", "coaching", "special_teams",
  ] as const).map((capability) => ({
    provider: "espn_scoreboard" as const,
    capability,
    state: "NOT_SUPPORTED" as const,
    pointInTimeState: "NOT_SUPPORTED" as const,
    requiredProvider: "A NCAAF football-data provider with this entity or play-level feed",
    evidence: "The configured ESPN scoreboard endpoint does not supply reliable NCAAF football-intelligence evidence for this capability.",
  } satisfies NcaafProviderCapability)),
  {
    provider: "espn_summary",
    capability: "team_boxscore",
    state: "AVAILABLE_NOW",
    pointInTimeState: "AVAILABLE_NOW",
    evidence: "Completed-game ESPN summaries are captured prospectively with team yards, pass/rush splits, turnovers, third downs, penalties, possession, drives, and immutable provider provenance.",
  },
  {
    provider: "espn_summary",
    capability: "drive",
    state: "AVAILABLE_NOW",
    pointInTimeState: "AVAILABLE_NOW",
    evidence: "Completed-game ESPN summaries expose drive identity, possession team, start/end context, elapsed time, plays, yards, result, and scoring state.",
  },
  {
    provider: "espn_summary",
    capability: "player_stats",
    state: "AVAILABLE_NOW",
    pointInTimeState: "AVAILABLE_NOW",
    evidence: "Completed-game ESPN boxscores expose provider player IDs and structured category statistics.",
  },
  {
    provider: "espn_summary",
    capability: "qb_performance",
    state: "AVAILABLE_NOW",
    pointInTimeState: "AVAILABLE_NOW",
    evidence: "Completed-game ESPN passing rows provide provider player/team IDs, completions, attempts, yards, touchdowns, and interceptions; this is performance history, not pregame starter state.",
  },
  {
    provider: "espn_summary",
    capability: "play_by_play",
    state: "PARTIAL",
    pointInTimeState: "AVAILABLE_BUT_NOT_CAPTURED",
    requiredProvider: "A stable play-level feed with documented historical/PIT semantics",
    evidence: "The observed summary endpoint reliably exposes drives but did not expose a complete play list for every tested event, so play-level metrics remain blocked.",
  },
  {
    provider: "espn_scoreboard",
    capability: "historical_point_in_time",
    state: "NOT_SUPPORTED",
    pointInTimeState: "NOT_SUPPORTED",
    requiredProvider: "A timestamped NCAAF historical pregame-data provider",
    evidence: "Date-based scoreboard backfill can recover game context/results, but it cannot reconstruct reliable pre-kickoff player, roster, injury, or play-level history.",
  },
  {
    provider: "odds_api",
    capability: "current_market_evidence",
    state: "AVAILABLE_NOW",
    pointInTimeState: "AVAILABLE_BUT_NOT_CAPTURED",
    evidence: "The configured americanfootball_ncaaf endpoint returns current h2h, spreads, and totals and the evidence ledger stores raw current market observations. It is market-only evidence, never football intelligence.",
  },
  ...(["opening_market_evidence", "closing_market_evidence"] as const).map((capability) => ({
    provider: "odds_api" as const,
    capability,
    state: "PARTIAL" as const,
    pointInTimeState: "NOT_SUPPORTED" as const,
    requiredProvider: "A timestamped opening/closing NCAAF market-history provider or capture process",
    evidence: "The configured Odds API call is current-only; it does not provide historical opening or closing NCAAF market evidence.",
  } satisfies NcaafProviderCapability)),
  {
    provider: "open_meteo",
    capability: "current_weather",
    state: "REQUIRES_PROVIDER",
    pointInTimeState: "NOT_SUPPORTED",
    requiredProvider: "NCAAF venue coordinates/roof data plus an NCAAF weather capture integration",
    evidence: "An Open-Meteo weather service exists, but its venue map and scheduler use are limited to MLB and NFL; no NCAAF venue lookup or capture path is wired.",
  },
  {
    provider: "open_meteo",
    capability: "historical_point_in_time",
    state: "NOT_SUPPORTED",
    pointInTimeState: "NOT_SUPPORTED",
    requiredProvider: "Timestamped NCAAF weather observations/forecasts captured before kickoff",
    evidence: "The repository's Open-Meteo service is a current forecast integration and does not retain reliable NCAAF point-in-time weather history.",
  },
]);

export interface NcaafReadinessBlocker {
  readonly capability: NcaafCapability;
  readonly provider: NcaafProvider;
  readonly state: NcaafCapabilityState;
  readonly pointInTimeState: NcaafCapabilityState;
  readonly reason: string;
  readonly requiredProvider?: string;
}

/**
 * Return deduplicated blockers for capabilities a caller requires.  A
 * capability is ready only when both its current and PIT state are
 * AVAILABLE_NOW; callers that only need current data can omit PIT-only
 * capabilities from `requiredCapabilities`.
 */
export function getNcaafReadinessBlockers(
  requiredCapabilities: readonly NcaafCapability[] = NCAAF_PROVIDER_CAPABILITIES.map(
    (entry) => entry.capability,
  ),
): readonly NcaafReadinessBlocker[] {
  const requested = new Set<NcaafCapability>(requiredCapabilities);
  return NCAAF_PROVIDER_CAPABILITIES
    .filter((entry) => requested.has(entry.capability))
    .filter((entry) =>
      entry.state !== "AVAILABLE_NOW" || entry.pointInTimeState !== "AVAILABLE_NOW",
    )
    .map((entry) => Object.freeze({
      capability: entry.capability,
      provider: entry.provider,
      state: entry.state,
      pointInTimeState: entry.pointInTimeState,
      reason: entry.evidence,
      requiredProvider: entry.requiredProvider,
    }));
}