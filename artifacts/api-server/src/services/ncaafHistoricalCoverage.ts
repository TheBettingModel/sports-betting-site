import {
  ncaafIntegrityHash, validNcaafIdentity, sameNcaafIdentity,
  type NcaafFinalFact, type NcaafIdentity,
} from "./ncaafHistoricalIntegrity";

/** An offline coverage plan, never a recovery executor or a source fetcher.
 * Callers must supply an independently reviewed schedule corpus; coverage of
 * that corpus does not prove that the corpus itself is complete. */
export function planNcaafHistoricalCoverage(
  expected: readonly NcaafFinalFact[], known: readonly NcaafIdentity[],
  bounds: { from: string; to: string; asOf: string; limit?: number },
) {
  const from = Date.parse(bounds.from), to = Date.parse(bounds.to), asOf = Date.parse(bounds.asOf);
  const limit = bounds.limit ?? 64;
  if (![from, to, asOf].every(Number.isFinite) || to <= from || to > asOf
    || to - from > 31 * 86_400_000 || !Number.isInteger(limit) || limit < 1 || limit > 64) {
    throw new Error("INVALID_NCAAF_RECOVERY_BOUNDS");
  }
  const expectedById = new Map<string, NcaafFinalFact[]>(), knownById = new Map<string, NcaafIdentity[]>();
  for (const fact of expected) {
    const time = Date.parse(fact.identity.kickoffAt);
    if (!validNcaafIdentity(fact.identity) || time < from || time >= to
      || fact.phase === "UNKNOWN" || fact.phase === "EXHIBITION") continue;
    expectedById.set(fact.identity.gameId, [...(expectedById.get(fact.identity.gameId) ?? []), fact]);
  }
  for (const identity of known) {
    if (!validNcaafIdentity(identity)) continue;
    knownById.set(identity.gameId, [...(knownById.get(identity.gameId) ?? []), identity]);
  }
  const rows = [...expectedById.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([gameId, facts]) => {
    const fact = facts[0]!, observed = knownById.get(gameId) ?? [];
    const expectedConflict = new Set(facts.map(f => ncaafIntegrityHash({
      identity: f.identity, season: f.season, phase: f.phase, homeScore: f.homeScore, awayScore: f.awayScore,
    }))).size > 1;
    const status = expectedConflict ? "CONFLICTING_EXPECTED_FIXTURE"
      : observed.length > 1 ? "DUPLICATE_KNOWN_EVENT"
      : observed.length === 1 && !sameNcaafIdentity(fact.identity, observed[0]!) ? "CONFLICTING_KNOWN_IDENTITY"
      : observed.length === 1 ? "COVERED" : "MISSING";
    return { gameId, season: fact.season, phase: fact.phase, kickoffAt: fact.identity.kickoffAt, status };
  });
  const missing = rows.filter(r => r.status === "MISSING");
  return {
    scope: "SUPPLIED_CORPUS_ONLY" as const, expected: rows.length, covered: rows.filter(r => r.status === "COVERED").length,
    missing: missing.length, quarantined: rows.filter(r => !["COVERED", "MISSING"].includes(r.status)).length,
    recoveryCandidates: missing.slice(0, limit), remainingCandidates: Math.max(0, missing.length - limit),
    bySeason: Object.fromEntries([...new Set(rows.map(r => r.season))].sort().map(season => [
      season, rows.filter(r => r.season === season),
    ])),
    rows,
  };
}
