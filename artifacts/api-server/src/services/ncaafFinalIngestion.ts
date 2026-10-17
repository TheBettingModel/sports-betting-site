import {
  ncaaObject, ncaafIntegrityHash, validNcaafIdentity, sameNcaafIdentity, verifyNcaafFinalEvidence,
  type NcaafIdentity, type NcaafSourceCapture, type NcaafEvidenceDecision,
} from "./ncaafHistoricalIntegrity";

export type NcaafFinalInput = Readonly<{
  sport: string; espnId: string; homeTeamId?: string | null; awayTeamId?: string | null;
  commenceTimeISO: string; homeScore?: number; awayScore?: number; ncaafFinalCapture?: unknown;
}>;
export type NcaafStoredFinal = {
  game: { id: string; sport: string; status: string; homeTeamId: string | null; awayTeamId: string | null;
    startsAt: Date | null; homeScore: number | null; awayScore: number | null };
  result: { homeScore: number; awayScore: number; rawResultJson: unknown } | null;
};
export interface NcaafFinalTransaction {
  read(): Promise<NcaafStoredFinal | null>;
  ensureFixture(pending: boolean): Promise<boolean>;
  writeGame(homeScore: number, awayScore: number): Promise<void>;
  writeResult(homeScore: number, awayScore: number, raw: Record<string, unknown>, insert: boolean): Promise<void>;
}
export interface NcaafFinalStore {
  transaction<T>(id: string, work: (tx: NcaafFinalTransaction) => Promise<T>): Promise<T>;
}
export type NcaafFinalOutcome = Readonly<{
  outcome: "INSERTED" | "UPDATED" | "DUPLICATE" | "QUARANTINED"; reasons: readonly string[];
}>;
const expectedIdentity = (input: NcaafFinalInput): NcaafIdentity => ({
  gameId: input.espnId, homeTeamId: input.homeTeamId ?? "", awayTeamId: input.awayTeamId ?? "",
  kickoffAt: input.commenceTimeISO,
});
export function prepareNcaafFinal(
  input: NcaafFinalInput, asOf: string, references: readonly NcaafSourceCapture[] = [],
): NcaafEvidenceDecision {
  if (input.sport !== "NCAAF" || !validNcaafIdentity(expectedIdentity(input))) {
    return { decision: "REJECTED", reasons: ["INVALID_NCAAF_IDENTITY"], fact: null, verification: "NONE", evidenceHashes: [] };
  }
  const captured = ncaaObject(input.ncaafFinalCapture);
  if (captured.provider !== "ESPN") return { decision: "QUARANTINED", reasons: ["MISSING_PRIMARY_ESPN_CAPTURE"],
    fact: null, verification: "NONE", evidenceHashes: [] };
  const evidence = verifyNcaafFinalEvidence(expectedIdentity(input), [captured as NcaafSourceCapture, ...references], asOf);
  if (evidence.fact && (evidence.fact.homeScore !== input.homeScore || evidence.fact.awayScore !== input.awayScore)) {
    return { decision: "QUARANTINED", reasons: ["FETCHED_SCORE_BINDING_MISMATCH"],
      fact: null, verification: "NONE", evidenceHashes: [] };
  }
  return evidence;
}
/** Pure preflight: a conflicting duplicate cannot win by being first/last. */
export function conflictingNcaafFinalIds(inputs: readonly NcaafFinalInput[]): ReadonlySet<string> {
  const signatures = new Map<string, string>(), conflicts = new Set<string>();
  for (const input of inputs) {
    if (input.sport !== "NCAAF") continue;
    const plan = prepareNcaafFinal(input, String(ncaaObject(input.ncaafFinalCapture).capturedAt));
    const signature = ncaafIntegrityHash({
      home: input.homeTeamId, away: input.awayTeamId, kickoff: input.commenceTimeISO,
      homeScore: input.homeScore, awayScore: input.awayScore,
      decision: plan.decision, reasons: plan.reasons,
      normalized: plan.fact && { season: plan.fact.season, phase: plan.fact.phase,
        homeScore: plan.fact.homeScore, awayScore: plan.fact.awayScore },
    });
    if (signatures.has(input.espnId) && signatures.get(input.espnId) !== signature) conflicts.add(input.espnId);
    signatures.set(input.espnId, signature);
  }
  return conflicts;
}
/** Proposed writer. A locked fixture/result pair is reconciled atomically.
 * Current live ESPN finals are single-source observations, not independently
 * certified corrections. Replacing an existing result needs independent proof. */
export async function reconcileNcaafFinal(
  store: NcaafFinalStore, input: NcaafFinalInput, asOf: string,
  options: { batchConflict?: boolean; references?: readonly NcaafSourceCapture[] } = {},
): Promise<NcaafFinalOutcome> {
  const quarantine = (reasons: readonly string[]): NcaafFinalOutcome => ({ outcome: "QUARANTINED", reasons });
  if (input.sport !== "NCAAF" || !validNcaafIdentity(expectedIdentity(input))) return quarantine(["INVALID_NCAAF_IDENTITY"]);
  const plan = prepareNcaafFinal(input, asOf, options.references);
  if (options.batchConflict) return quarantine(["CONFLICTING_DUPLICATE_OBSERVATIONS"]);
  return store.transaction(input.espnId, async tx => {
    let stored = await tx.read();
    if (stored && stored.game.sport !== "NCAAF") return quarantine(["STORED_FIXTURE_WRONG_SPORT"]);
    if (plan.decision !== "ACCEPTED" || !plan.fact) {
      // New, invalid finals may stay visible as NULL-score fixtures, never 0–0.
      if (!stored) await tx.ensureFixture(true);
      return quarantine(plan.reasons);
    }
    const fact = plan.fact;
    const identity = expectedIdentity(input);
    if (stored && !sameNcaafIdentity(identity, {
      gameId: stored.game.id, homeTeamId: stored.game.homeTeamId ?? "", awayTeamId: stored.game.awayTeamId ?? "",
      kickoffAt: stored.game.startsAt?.toISOString() ?? "",
    })) return quarantine(["STORED_FIXTURE_IDENTITY_CONFLICT"]);
    const resultDiffers = stored?.result && (stored.result.homeScore !== fact.homeScore || stored.result.awayScore !== fact.awayScore);
    const gameDiffers = stored?.game.status === "final" && stored.game.homeScore != null && stored.game.awayScore != null
      && (stored.game.homeScore !== fact.homeScore || stored.game.awayScore !== fact.awayScore);
    if ((resultDiffers || !stored?.result && gameDiffers) && plan.verification !== "INDEPENDENTLY_CORROBORATED") {
      return quarantine(["STORED_FINAL_CONFLICT_REQUIRES_INDEPENDENT_EVIDENCE"]);
    }
    const oldRaw = stored?.result?.rawResultJson;
    const oldObject = ncaaObject(oldRaw), priorProof = ncaaObject(oldObject.tbmNcaafIntegrity);
    const priorPhase = priorProof.phase;
    const phaseConflict = typeof priorPhase === "string" && priorPhase !== fact.phase
      && !(priorPhase === "POSTSEASON" && ["POSTSEASON", "BOWL", "CFP"].includes(fact.phase))
      && !(fact.phase === "POSTSEASON" && ["POSTSEASON", "BOWL", "CFP"].includes(priorPhase));
    if (priorProof.season != null && (priorProof.season !== fact.season
      || phaseConflict)) {
      return quarantine(["STORED_SEASON_PHASE_CONFLICT"]);
    }
    const gameMatches = stored?.game.status === "final" && stored.game.homeScore === fact.homeScore && stored.game.awayScore === fact.awayScore;
    if (gameMatches && stored?.result && !resultDiffers && priorProof.schemaVersion === "ncaaf-final-integrity-v1"
      && (priorProof.verification === "INDEPENDENTLY_CORROBORATED" || plan.verification === "SINGLE_UPSTREAM")) {
      return { outcome: "DUPLICATE", reasons: ["EXISTING_FINAL_PRESERVED"] };
    }
    if (!stored) {
      if (!await tx.ensureFixture(false)) throw new Error("NCAAF_FINAL_FIXTURE_NOT_FOUND");
      stored = await tx.read();
      if (!stored || stored.game.sport !== "NCAAF" || stored.result || !sameNcaafIdentity(identity, {
        gameId: stored.game.id, homeTeamId: stored.game.homeTeamId ?? "", awayTeamId: stored.game.awayTeamId ?? "",
        kickoffAt: stored.game.startsAt?.toISOString() ?? "",
      })) throw new Error("NCAAF_FINAL_FIXTURE_BINDING_CHANGED");
    }
    const insert = !stored.result;
    const previous = {
      game: { status: stored.game.status, homeScore: stored.game.homeScore, awayScore: stored.game.awayScore },
      result: stored.result ? { homeScore: stored.result.homeScore, awayScore: stored.result.awayScore } : null,
    };
    const raw: Record<string, unknown> = {
      ...oldObject,
      ...(oldRaw != null && !Object.keys(oldObject).length ? { tbmNcaafPriorRawResult: oldRaw } : {}),
      tbmNcaafIntegrity: {
        schemaVersion: "ncaaf-final-integrity-v1", season: fact.season,
        phase: fact.phase === "POSTSEASON" && ["BOWL", "CFP"].includes(String(priorPhase)) ? priorPhase : fact.phase,
        verification: priorProof.verification === "INDEPENDENTLY_CORROBORATED" && !resultDiffers
          ? "INDEPENDENTLY_CORROBORATED" : plan.verification,
        evidenceHashes: [...new Set([
          ...(Array.isArray(priorProof.evidenceHashes) && !resultDiffers ? priorProof.evidenceHashes : []),
          ...plan.evidenceHashes,
        ])],
        availableAt: typeof priorProof.availableAt === "string" && !resultDiffers ? priorProof.availableAt : asOf,
        capturedEvidence: [input.ncaafFinalCapture, ...(options.references ?? [])],
        previous, priorProof: Object.keys(priorProof).length ? priorProof : null,
      },
    };
    await tx.writeGame(fact.homeScore, fact.awayScore);
    await tx.writeResult(fact.homeScore, fact.awayScore, raw, insert);
    return { outcome: insert ? "INSERTED" : "UPDATED", reasons: ["ATOMIC_NCAAF_FINAL_RECONCILED"] };
  });
}
