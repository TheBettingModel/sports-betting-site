import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { db, ncaafCfbdDomainEvidenceTable, ncaafCfbdTeamMappingsTable, ncaafTeamGamePerformanceTable } from "@workspace/db";

export const NCAAF_FOOTBALL_INTELLIGENCE_SNAPSHOT_SCHEMA_VERSION = "ncaaf-football-intelligence-v2";

export type IntelligenceState = "VALID" | "PARTIAL" | "MISSING" | "UNSUPPORTED" | "INVALID";
export type IntelligenceReadiness = "READY" | "PARTIAL" | "BLOCKED";

export interface NcaafIntelligenceTarget {
  provider: string;
  eventId: string;
  season: number;
  week?: number | null;
  kickoffAt: Date;
  homeTeamId: string | null;
  awayTeamId: string | null;
  venue?: Record<string, unknown> | null;
  /** Independently captured, sports-only evidence already normalized to the domain contract. */
  suppliedDomains?: Partial<Record<"home" | "away", Partial<Record<string, IntelligenceDomain>>>>;
}

/** The fields consumed from immutable ncaaf_team_game_performance evidence. */
export interface NcaafPerformanceEvidenceRow {
  id?: number;
  provider: string;
  providerEventId: string;
  providerTeamId: string;
  providerOpponentTeamId: string;
  season: number;
  week?: number | null;
  kickoffAt: Date | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  derivedMetrics?: unknown;
  quality?: number | null;
  reliability?: number | null;
  providerObservedAt?: Date | null;
  capturedAt: Date;
  payloadHash: string;
  provenance: unknown;
}

export interface IntelligenceDomain {
  state: IntelligenceState;
  evidence: Array<{ id: number | null; providerEventId: string; payloadHash: string; capturedAt: string }>;
  provider: string | null;
  provenance: unknown[];
  quality: number | null;
  reliability: number | null;
  sample: Record<string, number>;
  missingReason: string | null;
  payload: Record<string, unknown>;
}

export interface NcaafFootballIntelligenceSnapshotValue {
  schemaVersion: typeof NCAAF_FOOTBALL_INTELLIGENCE_SNAPSHOT_SCHEMA_VERSION;
  target: { provider: string; eventId: string; season: number; week: number | null; kickoffAt: string };
  teams: Record<string, Record<string, IntelligenceDomain>>;
  readiness: {
    state: IntelligenceReadiness;
    criticalDomains: string[];
    importantDomains: string[];
    blockedReasons: string[];
    partialReasons: string[];
  };
}

// A team cannot be evaluated without observed team performance. Quarterback
// identity is useful context, but is not universally available from a
// pregame, sports-only source and therefore must never prevent a snapshot.
const CRITICAL = ["teamPerformance"] as const;
const IMPORTANT = ["venue", "roster", "injury", "advanced"] as const;
const OPTIONAL = ["quarterback", "earlySeasonPrior", "offensiveLine", "skill", "defensePersonnel", "talent", "transfers", "coaching", "specialTeams", "weather", "restTravel"] as const;
const ALL_DOMAINS = [...CRITICAL, ...IMPORTANT, ...OPTIONAL] as const;

// This is deliberately an exact-key firewall, rather than a substring
// heuristic. Sports statistics legitimately contain names such as
// `pointsPerOpportunity`; broad matching is both lossy and unnecessary.
const MARKET_SHAPED_KEYS = new Set([
  "market", "markets", "odds", "sportsbook", "sportsbooks", "bookmaker", "bookmakers",
  "book", "books", "moneyline", "spread", "pointspread", "line", "total", "totals",
  "over", "under", "price", "marketprice", "markettotal", "openingline", "openingtotal",
  "closingline", "closingtotal", "wager", "wagers", "bet", "bets",
  "betting", "stake", "stakes", "unit", "units", "probability", "probabilities",
  "impliedprobability", "forecast", "projection", "projected", "recommendation", "expectedscore",
]);

function normalizedInputKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLocaleLowerCase("en-US");
}

function isVerifiedFootballPerformanceTotal(path: string, key: string): boolean {
  const normalizedKey = normalizedInputKey(key);
  if (normalizedKey !== "total" && normalizedKey !== "totals") return false;

  const directPerformancePath =
    /^suppliedDomains\.(home|away)\.(teamPerformance|earlySeasonPrior|advanced)\.payload\.(offense|defense)\.havoc$/u;
  const composedPriorPath =
    /^suppliedDomains\.(home|away)\.earlySeasonPrior\.payload(?:\.components\[\d+\]\.payload)+\.(offense|defense)\.havoc$/u;
  return directPerformancePath.test(path) || composedPriorPath.test(path);
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

/** Rejects market inputs at every nesting level, including opaque provider payloads. */
export function assertNoNcaafMarketShapedKeys(value: unknown, path = "payload"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNcaafMarketShapedKeys(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (
        MARKET_SHAPED_KEYS.has(normalizedInputKey(key))
        && !isVerifiedFootballPerformanceTotal(path, key)
      ) {
        throw new Error(`NCAAF intelligence rejects market-shaped key: ${path}.${key}`);
      }
      assertNoNcaafMarketShapedKeys(item, `${path}.${key}`);
    }
  }
}

function validDate(value: Date, label: string): void {
  if (!Number.isFinite(value.getTime())) throw new Error(`NCAAF intelligence ${label} must be a valid timestamp`);
}

function average(values: Array<number | null | undefined>): number | null {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return usable.length ? Math.round((usable.reduce((sum, value) => sum + value, 0) / usable.length) * 1000) / 1000 : null;
}

function unavailable(reason: string, state: IntelligenceState = "UNSUPPORTED"): IntelligenceDomain {
  return {
    state, evidence: [], provider: null, provenance: [], quality: null, reliability: null,
    sample: { observations: 0 }, missingReason: reason, payload: {},
  };
}

function references(rows: NcaafPerformanceEvidenceRow[]): IntelligenceDomain["evidence"] {
  return rows.map((row) => ({
    id: row.id ?? null, providerEventId: row.providerEventId, payloadHash: row.payloadHash,
    capturedAt: row.capturedAt.toISOString(),
  }));
}

function sportsProvenance(rows: NcaafPerformanceEvidenceRow[]): unknown[] {
  return rows.map((row) => {
    const value = row.provenance && typeof row.provenance === "object"
      ? row.provenance as Record<string, unknown>
      : {};
    return {
      provider: row.provider,
      providerEventId: row.providerEventId,
      payloadHash: row.payloadHash,
      source: value.source ?? null,
      summaryEndpoint: value.summaryEndpoint ?? null,
    };
  });
}

function performanceDomain(rows: NcaafPerformanceEvidenceRow[], prior = false): IntelligenceDomain {
  const scored = rows.filter((row) => row.pointsFor != null && row.pointsAgainst != null);
  if (!scored.length) return unavailable(
    prior ? "No completed prior-season scored team performance exists before the strict cutoff"
      : "No completed scored team performance exists before the strict cutoff",
    "MISSING",
  );
  const complete = scored.length === rows.length;
  return {
    state: complete ? "VALID" : "PARTIAL",
    evidence: references(scored),
    provider: scored[0]!.provider,
    provenance: sportsProvenance(scored),
    quality: average(scored.map((row) => row.quality)),
    reliability: average(scored.map((row) => row.reliability)),
    sample: { games: rows.length, scoredGames: scored.length },
    missingReason: complete ? null : "Some pre-cutoff team-game rows lack final scoring",
    payload: {
      observedPointsFor: average(scored.map((row) => row.pointsFor)),
      observedPointsAgainst: average(scored.map((row) => row.pointsAgainst)),
    },
  };
}

function advancedDomain(rows: NcaafPerformanceEvidenceRow[]): IntelligenceDomain {
  const supported = rows.filter((row) => row.derivedMetrics != null);
  if (!supported.length) return unavailable("No advanced team evidence is present in the selected performance rows");
  return {
    state: supported.length === rows.length ? "VALID" : "PARTIAL",
    evidence: references(supported), provider: supported[0]!.provider,
    provenance: sportsProvenance(supported),
    quality: average(supported.map((row) => row.quality)),
    reliability: average(supported.map((row) => row.reliability)),
    sample: { games: rows.length, advancedGames: supported.length },
    missingReason: supported.length === rows.length ? null : "Advanced evidence is absent for some selected games",
    payload: { observedMetrics: supported.map((row) => row.derivedMetrics) },
  };
}

function venueDomain(target: NcaafIntelligenceTarget): IntelligenceDomain {
  if (!target.venue || !Object.keys(target.venue).length) return unavailable("No verified pre-cutoff venue/context evidence was supplied", "MISSING");
  return {
    state: "VALID", evidence: [], provider: target.provider, provenance: [{ source: "supplied_target_context" }],
    quality: 1, reliability: 1, sample: { observations: 1 }, missingReason: null, payload: canonical(target.venue) as Record<string, unknown>,
  };
}

/**
 * Historical completed games and independently captured preseason priors are
 * complementary evidence. Keep both components instead of allowing a later
 * supplied CFBD row to erase the completed-game provenance.
 */
function composeEarlySeasonPrior(
  completedGames: IntelligenceDomain,
  supplied: IntelligenceDomain,
): IntelligenceDomain {
  const components = [
    ...(completedGames.state === "MISSING" ? [] : [{ source: "completed_games", payload: completedGames.payload }]),
    { source: "supplied_prior", payload: supplied.payload },
  ];
  return {
    ...supplied,
    state: supplied.state !== "VALID" ? supplied.state
      : completedGames.state === "PARTIAL" ? "PARTIAL" : "VALID",
    evidence: [...completedGames.evidence, ...supplied.evidence],
    provenance: [...completedGames.provenance, ...supplied.provenance],
    quality: average([completedGames.quality, supplied.quality]),
    reliability: average([completedGames.reliability, supplied.reliability]),
    sample: {
      completedGameObservations: completedGames.sample.scoredGames ?? 0,
      suppliedObservations: supplied.sample.observations ?? 0,
    },
    missingReason: completedGames.state === "PARTIAL" || supplied.state === "PARTIAL"
      ? "Some early-season prior components are incomplete" : null,
    payload: { components },
  };
}

function domainsForTeam(
  target: NcaafIntelligenceTarget, side: "home" | "away", teamId: string | null, rows: NcaafPerformanceEvidenceRow[],
) {
  const selected = teamId ? rows.filter((row) => row.providerTeamId === teamId) : [];
  const current = selected.filter((row) => row.season === target.season);
  const previous = selected.filter((row) => row.season === target.season - 1);
  const noIdentity = !teamId ? "Missing verified provider team identity" : "";
  const common = noIdentity ? unavailable(noIdentity, "INVALID") : undefined;
  const domains: Record<string, IntelligenceDomain> = {
    teamPerformance: common ?? performanceDomain(current),
    advanced: common ?? advancedDomain(current),
    quarterback: common ?? unavailable("No verified pre-cutoff quarterback identity or availability evidence was supplied"),
    roster: common ?? unavailable("No pre-cutoff roster evidence was supplied"),
    injury: common ?? unavailable("No pre-cutoff injury evidence was supplied"),
    offensiveLine: common ?? unavailable("No pre-cutoff offensive-line evidence was supplied"),
    skill: common ?? unavailable("No pre-cutoff skill-position evidence was supplied"),
    defensePersonnel: common ?? unavailable("No pre-cutoff defensive personnel evidence was supplied"),
    earlySeasonPrior: common ?? performanceDomain(previous, true),
    talent: common ?? unavailable("No pre-cutoff talent evidence was supplied"),
    transfers: common ?? unavailable("No pre-cutoff transfer evidence was supplied"),
    coaching: common ?? unavailable("No pre-cutoff coaching evidence was supplied"),
    specialTeams: common ?? unavailable("No pre-cutoff special-teams evidence was supplied"),
    venue: venueDomain(target),
    weather: unavailable("No pre-cutoff weather evidence was supplied"),
    restTravel: common ?? unavailable("No pre-cutoff rest/travel evidence was supplied"),
  };
  for (const [domain, supplied] of Object.entries(target.suppliedDomains?.[side] ?? {})) {
    if (!ALL_DOMAINS.includes(domain as typeof ALL_DOMAINS[number])) {
      throw new Error(`Unknown NCAAF intelligence domain: ${domain}`);
    }
    if (!supplied) continue;
    assertNoNcaafMarketShapedKeys(supplied, `suppliedDomains.${side}.${domain}`);
    domains[domain] = domain === "earlySeasonPrior" && !common
      ? composeEarlySeasonPrior(domains.earlySeasonPrior!, supplied)
      : supplied;
  }
  return domains;
}

export function buildNcaafFootballIntelligenceSnapshot(
  target: NcaafIntelligenceTarget,
  evidenceRows: readonly NcaafPerformanceEvidenceRow[],
  dataCutoffAt: Date,
): NcaafFootballIntelligenceSnapshotValue {
  validDate(target.kickoffAt, "kickoff");
  validDate(dataCutoffAt, "data cutoff");
  if (dataCutoffAt >= target.kickoffAt) throw new Error("NCAAF intelligence data cutoff must be strictly before kickoff");
  assertNoNcaafMarketShapedKeys({
    target: { ...target, venue: target.venue ?? null, suppliedDomains: undefined },
    evidenceRows: evidenceRows.map((row) => ({
      provider: row.provider, providerEventId: row.providerEventId,
      providerTeamId: row.providerTeamId, providerOpponentTeamId: row.providerOpponentTeamId,
      pointsFor: row.pointsFor, pointsAgainst: row.pointsAgainst,
      derivedMetrics: row.derivedMetrics ?? null,
    })),
  });
  const rows = evidenceRows.filter((row) => row.provider === target.provider
    && row.providerEventId !== target.eventId && row.kickoffAt != null && row.kickoffAt < dataCutoffAt
    && row.capturedAt < dataCutoffAt && (!row.providerObservedAt || row.providerObservedAt < dataCutoffAt))
    .sort((a, b) => a.kickoffAt!.getTime() - b.kickoffAt!.getTime() || a.providerEventId.localeCompare(b.providerEventId));
  const teams: Record<string, Record<string, IntelligenceDomain>> = {
    home: domainsForTeam(target, "home", target.homeTeamId, rows),
    away: domainsForTeam(target, "away", target.awayTeamId, rows),
  };
  const blockedReasons: string[] = [];
  const partialReasons: string[] = [];
  for (const [side, domains] of Object.entries(teams)) {
    for (const domain of CRITICAL) {
      const state = domains[domain]!.state;
      if (state === "MISSING" || state === "INVALID" || state === "UNSUPPORTED") {
        blockedReasons.push(`${side}.${domain}:${state}`);
      } else if (state === "PARTIAL") {
        partialReasons.push(`${side}.${domain}:PARTIAL`);
      }
    }
    for (const domain of IMPORTANT) if (domains[domain]!.state !== "VALID") partialReasons.push(`${side}.${domain}:${domains[domain]!.state}`);
  }
  return {
    schemaVersion: NCAAF_FOOTBALL_INTELLIGENCE_SNAPSHOT_SCHEMA_VERSION,
    target: { provider: target.provider, eventId: target.eventId, season: target.season, week: target.week ?? null, kickoffAt: target.kickoffAt.toISOString() },
    teams,
    readiness: {
      state: blockedReasons.length ? "BLOCKED" : partialReasons.length ? "PARTIAL" : "READY",
      criticalDomains: [...CRITICAL], importantDomains: [...IMPORTANT], blockedReasons, partialReasons,
    },
  };
}

export function ncaafFootballIntelligenceInputHash(
  target: NcaafIntelligenceTarget, rows: readonly NcaafPerformanceEvidenceRow[], dataCutoffAt: Date,
): string {
  return hash({ schemaVersion: NCAAF_FOOTBALL_INTELLIGENCE_SNAPSHOT_SCHEMA_VERSION, target, dataCutoffAt,
    rows: rows.map((row) => ({ id: row.id ?? null, payloadHash: row.payloadHash, capturedAt: row.capturedAt, providerObservedAt: row.providerObservedAt ?? null })) });
}

/** Loads only immutable performance evidence that was available before cutoff and kickoff. */
export function ncaafPerformanceHistoryScope(target: NcaafIntelligenceTarget): {
  seasons: number[];
  teamIds: string[];
} {
  return {
    seasons: [target.season, target.season - 1],
    teamIds: [...new Set(
      [target.homeTeamId, target.awayTeamId].filter((id): id is string => Boolean(id)),
    )],
  };
}

export async function loadPriorNcaafTeamPerformance(
  target: NcaafIntelligenceTarget, dataCutoffAt: Date,
): Promise<NcaafPerformanceEvidenceRow[]> {
  const scope = ncaafPerformanceHistoryScope(target);
  if (!scope.teamIds.length) return [];
  return db.select().from(ncaafTeamGamePerformanceTable).where(and(
    eq(ncaafTeamGamePerformanceTable.provider, target.provider),
    ne(ncaafTeamGamePerformanceTable.providerEventId, target.eventId),
    inArray(ncaafTeamGamePerformanceTable.season, scope.seasons),
    inArray(ncaafTeamGamePerformanceTable.providerTeamId, scope.teamIds),
    lt(ncaafTeamGamePerformanceTable.kickoffAt, dataCutoffAt),
    lt(ncaafTeamGamePerformanceTable.capturedAt, dataCutoffAt),
  )) as Promise<NcaafPerformanceEvidenceRow[]>;
}

/**
 * Persists the canonical snapshot with the table's unique identity. This is an
 * insert-only operation; conflict resolution merely returns the already-created row.
 */
export async function createNcaafFootballIntelligenceSnapshot(
  target: NcaafIntelligenceTarget, dataCutoffAt: Date,
): Promise<{
  id: number;
  snapshot: NcaafFootballIntelligenceSnapshotValue;
  inputHash: string;
  persistence: "inserted" | "deduped";
}> {
  const rows = await loadPriorNcaafTeamPerformance(target, dataCutoffAt);
  const suppliedDomains = await loadSafeCfbdDomains(target, dataCutoffAt);
  const enrichedTarget = { ...target, suppliedDomains: {
    ...target.suppliedDomains, home: { ...suppliedDomains.home, ...target.suppliedDomains?.home },
    away: { ...suppliedDomains.away, ...target.suppliedDomains?.away },
  } };
  const snapshot = buildNcaafFootballIntelligenceSnapshot(enrichedTarget, rows, dataCutoffAt);
  const inputHash = ncaafFootballIntelligenceInputHash(enrichedTarget, rows, dataCutoffAt);
  const suppliedCaptured = Object.values(suppliedDomains).flatMap((side) => Object.values(side ?? {}))
    .flatMap((domain) => domain?.evidence ?? []).map((reference) => new Date(reference.capturedAt));
  const latestCaptured = [...rows.map((row) => row.capturedAt), ...suppliedCaptured]
    .reduce<Date | null>((latest, value) => !latest || value > latest ? value : latest, null);
  const result = await db.execute(sql`
    INSERT INTO ncaaf_football_intelligence_snapshots
      (schema_version, target_provider, target_event_id, season, week, kickoff_at,
       home_provider_team_id, away_provider_team_id, data_cutoff_at, evidence_max_captured_at,
       evidence_max_modeled_at, input_hash, domain_payload, quality_readiness)
    VALUES
      (${NCAAF_FOOTBALL_INTELLIGENCE_SNAPSHOT_SCHEMA_VERSION}, ${target.provider}, ${target.eventId},
       ${target.season}, ${target.week ?? null}, ${target.kickoffAt}, ${target.homeTeamId}, ${target.awayTeamId},
       ${dataCutoffAt}, ${latestCaptured}, ${null}, ${inputHash},
       ${JSON.stringify(snapshot.teams)}::jsonb, ${JSON.stringify(snapshot.readiness)}::jsonb)
    ON CONFLICT (schema_version, target_provider, target_event_id, data_cutoff_at, input_hash) DO NOTHING
    RETURNING id`);
  const inserted = (result as unknown as { rows: Array<{ id: number }> }).rows[0];
  if (inserted) return { id: inserted.id, snapshot, inputHash, persistence: "inserted" };
  const existing = await db.execute(sql`
    SELECT id FROM ncaaf_football_intelligence_snapshots
    WHERE schema_version = ${NCAAF_FOOTBALL_INTELLIGENCE_SNAPSHOT_SCHEMA_VERSION}
      AND target_provider = ${target.provider} AND target_event_id = ${target.eventId}
      AND data_cutoff_at = ${dataCutoffAt} AND input_hash = ${inputHash} LIMIT 1`);
  const id = (existing as unknown as { rows: Array<{ id: number }> }).rows[0]?.id;
  if (id == null) throw new Error("Unable to idempotently persist NCAAF intelligence snapshot");
  return { id, snapshot, inputHash, persistence: "deduped" };
}

/**
 * Resolve CFBD through an explicit mapping ledger.  There is deliberately no
 * name fallback: an absent/ambiguous mapping simply leaves the domain missing.
 */
async function loadSafeCfbdDomains(target: NcaafIntelligenceTarget, cutoff: Date): Promise<NonNullable<NcaafIntelligenceTarget["suppliedDomains"]>> {
  const output: NonNullable<NcaafIntelligenceTarget["suppliedDomains"]> = { home: {}, away: {} };
  for (const [side, canonicalTeamId] of [["home", target.homeTeamId], ["away", target.awayTeamId]] as const) {
    if (!canonicalTeamId) continue;
    const mappings = await db.select().from(ncaafCfbdTeamMappingsTable).where(and(
      eq(ncaafCfbdTeamMappingsTable.season, target.season), eq(ncaafCfbdTeamMappingsTable.canonicalProvider, target.provider),
      eq(ncaafCfbdTeamMappingsTable.canonicalTeamId, canonicalTeamId), eq(ncaafCfbdTeamMappingsTable.state, "MAPPED"),
      lt(ncaafCfbdTeamMappingsTable.capturedAt, cutoff),
    ));
    const teamIds = mappings.map((row) => row.cfbdTeamId);
    if (!teamIds.length) continue;
    const evidence = await db.select().from(ncaafCfbdDomainEvidenceTable).where(and(
      inArray(ncaafCfbdDomainEvidenceTable.cfbdTeamId, teamIds),
      eq(ncaafCfbdDomainEvidenceTable.season, target.season),
      lt(ncaafCfbdDomainEvidenceTable.capturedAt, cutoff),
      sql`(${ncaafCfbdDomainEvidenceTable.providerEffectiveAt} IS NULL OR ${ncaafCfbdDomainEvidenceTable.providerEffectiveAt} < ${cutoff})`,
    )).orderBy(desc(ncaafCfbdDomainEvidenceTable.providerEffectiveAt), desc(ncaafCfbdDomainEvidenceTable.capturedAt), desc(ncaafCfbdDomainEvidenceTable.id));
    const domainMap: Record<string, string> = {
      advanced: "advanced", teamStats: "teamPerformance", roster: "roster", coaching: "coaching",
      talent: "talent", returningProduction: "earlySeasonPrior", recruiting: "earlySeasonPrior",
      sp: "earlySeasonPrior", elo: "earlySeasonPrior", srs: "earlySeasonPrior", fpi: "earlySeasonPrior",
      weather: "weather",
    };
    for (const row of evidence) {
      if (row.pitClassification === "C" || row.pitClassification === "D") continue;
      const domain = domainMap[row.domain]; if (!domain) continue;
      const current = output[side]![domain];
      const normalized: IntelligenceDomain = {
        state: "VALID", provider: "college_football_data", quality: null, reliability: null,
        evidence: [{ id: row.id, providerEventId: row.cfbdGameId ?? row.cfbdTeamId ?? "cfbd-domain", payloadHash: row.payloadHash, capturedAt: row.capturedAt.toISOString() }],
        provenance: [{ provider: "college_football_data", endpoint: row.endpoint, pitClassification: row.pitClassification, capturedAt: row.capturedAt.toISOString(), effectiveAt: row.providerEffectiveAt?.toISOString() ?? null }],
        sample: { observations: 1 }, missingReason: null, payload: row.payload as Record<string, unknown>,
      };
      // A prior is an evidence composition, not an arbitrary winner selected
      // by query order. Other domains retain their newest eligible observation.
      if (current && domain !== "earlySeasonPrior") continue;
      if (current) {
        output[side]![domain] = {
          ...current,
          evidence: [...current.evidence, ...normalized.evidence],
          provenance: [...current.provenance, ...normalized.provenance],
          sample: { observations: (current.sample.observations ?? 0) + 1 },
          payload: { components: [
            ...(Array.isArray(current.payload.components) ? current.payload.components : [{ source: "cfbd_prior", payload: current.payload }]),
            { source: "cfbd_prior", payload: normalized.payload },
          ] },
        };
      } else {
        output[side]![domain] = normalized;
      }
    }
  }
  return output;
}