import { stableHash } from "./v4Platform";
import { record, providerId, timestamp, kickoffTimestamp } from "./nflHistoricalResultNormalization";
import { validateNflHistoricalResult, type NflNormalizedResult } from "./nflHistoricalResultValidation";

export type NflFinalInput = Readonly<{
  espnId: string; sport: string; homeTeamId?: string | null; awayTeamId?: string | null;
  commenceTimeISO: string; homeScore?: number; awayScore?: number;
  nflFinalCapture?: unknown;
}>;
export type NflFinalCapture = Readonly<{
  provider: "ESPN"; upstreamProvider: "ESPN"; captureType: "STABLE_PARSED_ESPN_EVENT_JSON";
  sourceUrl: string; capturedAt: string; eventPayloadHash: string; event: unknown;
}>;
export type NflFinalPlan = Readonly<{
  decision: "ACCEPTED" | "QUARANTINED"; reasons: readonly string[];
  normalized: NflNormalizedResult | null; capture: NflFinalCapture | null;
}>;

/** Snapshot parsed event JSON, not raw response bytes. No clock, fetch or DB access. */
export function captureNflFinalEvent(event: unknown, sourceUrl: string, capturedAt: string): NflFinalCapture | null {
  try {
    const json = JSON.stringify(event);
    if (!json || Buffer.byteLength(json, "utf8") > 256_000) return null;
    const snapshot: unknown = JSON.parse(json);
    return {
      provider: "ESPN", upstreamProvider: "ESPN", captureType: "STABLE_PARSED_ESPN_EVENT_JSON",
      sourceUrl, capturedAt, eventPayloadHash: stableHash(snapshot), event: snapshot,
    };
  } catch { return null; }
}

/** Event-level year/type are mandatory. Scoreboard-level season defaults are never used. */
export function prepareNflFinal(input: NflFinalInput, asOf: string): NflFinalPlan {
  const raw = record(input.nflFinalCapture);
  const fail = (reason: string): NflFinalPlan => ({
    decision: "QUARANTINED", reasons: [reason], normalized: null, capture: null,
  });
  if (input.sport !== "NFL" || !/^NFL-[1-9]\d*$/.test(input.espnId)) return fail("INVALID_NFL_EVENT_ID");
  if (raw.provider !== "ESPN" || raw.upstreamProvider !== "ESPN"
    || raw.captureType !== "STABLE_PARSED_ESPN_EVENT_JSON") return fail("MISSING_ESPN_EVENT_CAPTURE");
  let url: URL;
  try { url = new URL(String(raw.sourceUrl)); } catch { return fail("INVALID_ESPN_SOURCE_URL"); }
  if (url.origin !== "https://site.api.espn.com" || url.username || url.password || url.hash
    || url.pathname !== "/apis/site/v2/sports/football/nfl/scoreboard"
    || !/^\d{8}$/.test(url.searchParams.get("dates") ?? "")
    || url.searchParams.get("limit") !== "100"
    || [...url.searchParams.keys()].length !== 2) return fail("INVALID_ESPN_SOURCE_URL");
  const date = url.searchParams.get("dates")!;
  if (!timestamp(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T00:00:00Z`)) {
    return fail("INVALID_ESPN_SOURCE_URL");
  }
  const capturedAt = timestamp(raw.capturedAt), cutoff = timestamp(asOf);
  if (!capturedAt || !cutoff || capturedAt > cutoff) return fail("CAPTURE_NOT_AVAILABLE");
  const capture = captureNflFinalEvent(raw.event, String(raw.sourceUrl), capturedAt);
  if (!capture || capture.eventPayloadHash !== raw.eventPayloadHash) return fail("CAPTURE_HASH_MISMATCH");
  const homeId = providerId(input.homeTeamId), awayId = providerId(input.awayTeamId);
  if (!homeId || !awayId || homeId === awayId || !kickoffTimestamp(input.commenceTimeISO)) return fail("INVALID_EXPECTED_IDENTITY");
  const checked = validateNflHistoricalResult({
    event: capture.event, observedAt: capturedAt,
    expectedIdentity: {
      eventId: input.espnId.slice(4), homeTeamId: homeId, awayTeamId: awayId, kickoff: input.commenceTimeISO,
    },
  });
  const n = checked.normalized;
  // Archive valid PRE/POST finals too, but never admit them to regular-season evidence.
  const blocking = checked.reasons.filter(r => ![
    "VALID_REGULAR_SEASON_FINAL", "PRESEASON_EXCLUDED", "POSTSEASON_EXCLUDED",
  ].includes(r));
  if (!n || blocking.length) return { decision: "QUARANTINED", reasons: blocking.length ? blocking : checked.reasons, normalized: n, capture };
  const start = Date.parse(n.kickoff!);
  if (start < Date.UTC(n.seasonYear!, 6, 1) || start >= Date.UTC(n.seasonYear! + 1, 6, 1)) {
    return { decision: "QUARANTINED", reasons: ["SEASON_YEAR_KICKOFF_MISMATCH"], normalized: n, capture };
  }
  if (n.homeScore !== input.homeScore || n.awayScore !== input.awayScore) {
    return { decision: "QUARANTINED", reasons: ["FETCHED_SCORE_BINDING_MISMATCH"], normalized: n, capture };
  }
  if (n.homeScore! > 2_147_483_647 || n.awayScore! > 2_147_483_647) {
    return { decision: "QUARANTINED", reasons: ["SCORE_OUTSIDE_DATABASE_RANGE"], normalized: n, capture };
  }
  return { decision: "ACCEPTED", reasons: ["VALID_SINGLE_PROVIDER_FINAL"], normalized: n, capture };
}

/** Batch preflight prevents input ordering from choosing among conflicting duplicates. */
export function conflictingNflFinalIds(inputs: readonly NflFinalInput[]): ReadonlySet<string> {
  const signatures = new Map<string, string>(), conflicts = new Set<string>();
  for (const input of inputs) {
    if (input.sport !== "NFL") continue;
    const prepared = prepareNflFinal(input, String(record(input.nflFinalCapture).capturedAt));
    const n = prepared.normalized;
    const signature = stableHash({
      home: input.homeTeamId, away: input.awayTeamId, kickoff: input.commenceTimeISO,
      homeScore: input.homeScore, awayScore: input.awayScore,
      decision: prepared.decision, reasons: prepared.reasons,
      normalized: n && { eventId: n.eventId, homeTeamId: n.homeTeamId, awayTeamId: n.awayTeamId,
        kickoff: n.kickoff, phase: n.seasonPhase, year: n.seasonYear,
        completion: n.completion, homeScore: n.homeScore, awayScore: n.awayScore },
    });
    if (signatures.has(input.espnId) && signatures.get(input.espnId) !== signature) conflicts.add(input.espnId);
    signatures.set(input.espnId, signature);
  }
  return conflicts;
}

export type NflStoredFinal = Readonly<{
  game: { id: string; sport: string; status: string; homeTeamId: string | null; awayTeamId: string | null;
    startsAt: Date | null; homeScore: number | null; awayScore: number | null };
  result: { homeScore: number; awayScore: number; rawResultJson: unknown } | null;
}>;
export interface NflFinalTransaction {
  read(): Promise<NflStoredFinal | null>;
  /** The refresh supplies an insert/upsert callback; recovery may only use existing fixtures. */
  ensureFixture(pending: boolean): Promise<boolean>;
  quarantineFixture(): Promise<void>;
  writeGame(homeScore: number, awayScore: number): Promise<void>;
  writeResult(homeScore: number, awayScore: number, rawResultJson: unknown, insert: boolean): Promise<void>;
  writeQuarantine(rawResultJson: unknown): Promise<void>;
}
export interface NflFinalStore {
  transaction<T>(id: string, work: (tx: NflFinalTransaction) => Promise<T>): Promise<T>;
}
export type NflFinalOutcome = Readonly<{
  outcome: "INSERTED" | "UPDATED" | "DUPLICATE" | "QUARANTINED"; reasons: readonly string[];
}>;
function mergeRaw(raw: unknown, key: string, value: unknown): Record<string, unknown> {
  const existing = record(raw);
  return { ...(Object.keys(existing).length ? existing : raw == null ? {} : { tbmNflPriorRawResult: raw }), [key]: value };
}

/** All accepted score/status/evidence writes share one caller-supplied transaction. */
export async function reconcileNflFinal(
  store: NflFinalStore, input: NflFinalInput, asOf: string, batchConflict = false,
): Promise<NflFinalOutcome> {
  if (input.sport !== "NFL" || !/^NFL-[1-9]\d*$/.test(input.espnId)) {
    return { outcome: "QUARANTINED", reasons: ["INVALID_NFL_EVENT_ID"] };
  }
  const plan = prepareNflFinal(input, asOf);
  return store.transaction(input.espnId, async tx => {
    let stored = await tx.read();
    if (stored && stored.game.sport !== "NFL") {
      return { outcome: "QUARANTINED", reasons: ["STORED_FIXTURE_WRONG_SPORT"] };
    }
    const quarantine = async (reasons: readonly string[], blocking = false): Promise<NflFinalOutcome> => {
      if (stored?.result) {
        const observationKey = stableHash({ reasons, blocking, eventPayloadHash: plan.capture?.eventPayloadHash ?? null });
        const pending = { status: "QUARANTINED", reasons, blocking, capture: plan.capture, observedAt: asOf, observationKey };
        const prior = record(record(stored.result.rawResultJson).tbmNflPendingObservation);
        if (prior.observationKey !== observationKey) {
          await tx.writeQuarantine(mergeRaw(stored.result.rawResultJson, "tbmNflPendingObservation", pending));
        }
      } else if (stored && stored.game.status !== "final") {
        await tx.quarantineFixture();
      } else if (!stored && providerId(input.homeTeamId) && providerId(input.awayTeamId)
        && input.homeTeamId !== input.awayTeamId && kickoffTimestamp(input.commenceTimeISO)) {
        // A pending fixture remains visible but has NULL scores and no accepted result.
        // The history reader consequently fails closed rather than omitting it.
        await tx.ensureFixture(true);
      }
      return { outcome: "QUARANTINED", reasons };
    };
    if (batchConflict) return quarantine(["CONFLICTING_DUPLICATE_OBSERVATIONS"], true);
    if (plan.decision !== "ACCEPTED") return quarantine(plan.reasons);
    const n = plan.normalized!;
    const storedKickoff = stored?.game.startsAt instanceof Date && Number.isFinite(stored.game.startsAt.getTime())
      ? stored.game.startsAt.toISOString() : null;
    if (stored && (stored.game.sport !== "NFL" || stored.game.homeTeamId !== n.homeTeamId
      || stored.game.awayTeamId !== n.awayTeamId || storedKickoff !== n.kickoff)) {
      return quarantine(["STORED_FIXTURE_IDENTITY_CONFLICT"], true);
    }
    if (stored?.result && (stored.result.homeScore !== n.homeScore || stored.result.awayScore !== n.awayScore)) {
      return quarantine(["STORED_FINAL_SCORE_CONFLICT"], true);
    }
    if (!stored?.result && stored?.game.status === "final" && stored.game.homeScore !== null
      && stored.game.awayScore !== null && stored.game.homeScore + stored.game.awayScore > 0
      && (stored.game.homeScore !== n.homeScore || stored.game.awayScore !== n.awayScore)) {
      return quarantine(["STORED_FINAL_SCORE_CONFLICT"], true);
    }
    const oldRaw = stored?.result?.rawResultJson;
    const official = record(record(oldRaw).tbmNflIntegrity);
    const prior = record(record(oldRaw).tbmNflProviderFinal);
    const previous = prior.schemaVersion === "nfl-provider-final-v1"
      ? prepareNflFinal({ ...input, nflFinalCapture: prior.capture }, asOf) : null;
    if ((official.status === "CORROBORATED"
      && (official.seasonPhase !== n.seasonPhase || official.seasonYear !== n.seasonYear))
      || (previous?.normalized && (previous.normalized.seasonPhase !== n.seasonPhase
        || previous.normalized.seasonYear !== n.seasonYear))) {
      return quarantine(["STORED_SEASON_PHASE_CONFLICT"], true);
    }
    const sameGame = stored?.game.status === "final" && stored.game.homeScore === n.homeScore
      && stored.game.awayScore === n.awayScore;
    // A duplicate cannot erase a quarantine or advance the original availability time.
    if (sameGame && stored?.result && (official.status === "CORROBORATED"
      || previous?.decision === "ACCEPTED")) {
      return { outcome: "DUPLICATE", reasons: ["EXISTING_FINAL_PRESERVED"] };
    }
    if (!stored) {
      if (!await tx.ensureFixture(false)) throw new Error("NFL_FINAL_FIXTURE_NOT_FOUND");
      stored = await tx.read();
      if (!stored || stored.game.sport !== "NFL" || stored.game.homeTeamId !== n.homeTeamId
        || stored.game.awayTeamId !== n.awayTeamId || stored.game.startsAt?.toISOString() !== n.kickoff
        || stored.result) throw new Error("NFL_FINAL_FIXTURE_WRITE_BINDING_CHANGED");
    }
    await tx.writeGame(n.homeScore!, n.awayScore!);
    await tx.writeResult(n.homeScore!, n.awayScore!, mergeRaw(oldRaw, "tbmNflProviderFinal", {
      schemaVersion: "nfl-provider-final-v1", verificationStatus: "SINGLE_PROVIDER_OBSERVATION",
      independentlyVerified: false, capture: plan.capture,
    }), !stored.result);
    return { outcome: stored.result ? "UPDATED" : "INSERTED", reasons: ["ATOMIC_SINGLE_PROVIDER_FINAL"] };
  });
}
