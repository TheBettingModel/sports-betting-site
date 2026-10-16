import { stableHash } from "./v4Platform";
import { timestamp } from "./nflHistoricalResultNormalization";
import { validateNflHistoricalResult, validateNflHistoricalResults, type NflObservation } from "./nflHistoricalResultValidation";
import { verifyNflHistoricalEvidence, type NflEvidenceVerificationInput } from "./nflHistoricalEvidenceVerification";
import {
  compareScheduleText as compare, normalizeNflScheduleFixture, scheduleIdentity, scheduleTeamPair,
  verifyNflScheduleEvidence, type NflScheduleEvidence, type NflScheduleFixture,
} from "./nflHistoricalScheduleEvidence";

export type NflKnownFixture = Readonly<{
  observation: NflObservation;
  resultEvidence?: Omit<NflEvidenceVerificationInput, "candidate" | "asOf">;
}>;
export type NflCoverageBounds = Readonly<{
  seasons: readonly number[]; weeks: readonly number[];
  fromInclusive: string; toExclusive: string; maxRecoveryCandidates: number;
}>;
export type NflGameCoverage = {
  eventId: string; fixture: NflScheduleFixture | null;
  status: "PRESENT_VERIFIED" | "PRESENT_UNVERIFIED" | "MISSING" | "CONFLICTING"
    | "QUARANTINED" | "EXCLUDED" | "OUT_OF_SCOPE" | "NOT_DUE";
  reasons: string[]; expectedObservationCount: number; knownObservationCount: number;
  scheduleEvidenceIds: string[];
  regularSeasonExpected: boolean;
};
export type NflCoverageCounts = {
  regularSeasonExpected: number; present: number; verifiedResults: number; missing: number;
  conflicting: number; quarantined: number; excluded: number; outOfScope: number; notDue: number;
};
export type NflRecoveryCandidate = Readonly<{
  fixture: NflScheduleFixture; scheduleEvidenceIds: readonly string[];
  reason: "MISSING_FROM_SUPPLIED_FIXTURES"; intent: "INSPECT_FIXTURE_ONLY";
  executionAuthorized: false;
}>;
export type NflFixtureCoverageReport = Readonly<{
  status: "COMPLETE" | "INCOMPLETE" | "UNCERTAIN" | "INVALID_INPUT";
  asOf: string | null; reasons: readonly string[];
  counts: NflCoverageCounts; games: readonly NflGameCoverage[];
  seasons: readonly { season: number; counts: NflCoverageCounts;
    weeks: readonly { week: number; counts: NflCoverageCounts; eventIds: readonly string[] }[] }[];
  unexpectedKnownEventIds: readonly string[];
  knownIssues: readonly { eventId: string | null; observationCount: number; reasons: readonly string[] }[];
  recovery: { candidates: readonly NflRecoveryCandidate[]; eligibleCount: number; omittedCount: number;
    limit: number; executionAuthorized: false };
}>;
const emptyCounts = (): NflCoverageCounts => ({
  regularSeasonExpected: 0, present: 0, verifiedResults: 0, missing: 0,
  conflicting: 0, quarantined: 0, excluded: 0, outOfScope: 0, notDue: 0,
});
function counts(games: readonly NflGameCoverage[]): NflCoverageCounts {
  const c = emptyCounts();
  for (const g of games) {
    if (g.regularSeasonExpected) c.regularSeasonExpected++;
    if (g.status === "PRESENT_VERIFIED" || g.status === "PRESENT_UNVERIFIED") c.present++;
    if (g.status === "PRESENT_VERIFIED") c.verifiedResults++;
    if (g.status === "MISSING") c.missing++;
    if (g.status === "CONFLICTING") c.conflicting++;
    if (g.status === "QUARANTINED") c.quarantined++;
    if (g.status === "EXCLUDED") c.excluded++;
    if (g.status === "OUT_OF_SCOPE") c.outOfScope++;
    if (g.status === "NOT_DUE") c.notDue++;
  }
  return c;
}
function boundsValid(b: NflCoverageBounds): boolean {
  const from = timestamp(b.fromInclusive), to = timestamp(b.toExclusive);
  return Boolean(from && to && from < to && Date.parse(to) - Date.parse(from) <= 35 * 86400000
    && b.seasons.length > 0 && b.seasons.length <= 3
    && b.seasons.every(s => Number.isInteger(s) && s >= 1920 && s <= 9999)
    && b.weeks.length > 0 && b.weeks.length <= 18 && b.weeks.every(w => Number.isInteger(w) && w >= 1 && w <= 18)
    && Number.isInteger(b.maxRecoveryCandidates) && b.maxRecoveryCandidates >= 0 && b.maxRecoveryCandidates <= 32);
}
const pairWeek = (f: NflScheduleFixture) => `${f.season}:${f.week}:${scheduleTeamPair(f)}`;
const unique = (xs: readonly string[]) => [...new Set(xs)].sort(compare);

/** Coverage of supplied evidence only, not proof of an exhaustive NFL schedule.
 * No recovery executor, final-score inference, provider call, or persistence.
 */
export function compareNflHistoricalFixtureCoverage(input: Readonly<{
  expected: readonly NflScheduleEvidence[]; known: readonly NflKnownFixture[];
  bounds: NflCoverageBounds; asOf: string;
}>): NflFixtureCoverageReport {
  const asOf = timestamp(input.asOf), reasons = new Set<string>();
  const safeBounds = boundsValid(input.bounds);
  if (!asOf) reasons.add("INVALID_VERIFICATION_TIME");
  if (!safeBounds) reasons.add("INVALID_COVERAGE_BOUNDS");
  if (input.expected.length > 2048 || input.known.length > 2048) reasons.add("INPUT_LIMIT_EXCEEDED");
  if (reasons.size) return {
    status: "INVALID_INPUT", asOf, reasons: [...reasons].sort(compare), counts: emptyCounts(), games: [], seasons: [],
    unexpectedKnownEventIds: [], knownIssues: [],
    recovery: { candidates: [], eligibleCount: 0, omittedCount: 0, limit: 0, executionAuthorized: false },
  };
  const b = input.bounds, from = timestamp(b.fromInclusive)!, to = timestamp(b.toExclusive)!;
  const scope = (f: NflScheduleFixture) => b.seasons.includes(f.season) && b.weeks.includes(f.week)
    && f.kickoff >= from && f.kickoff < to;
  const known = input.known.map(k => {
    let parsed = normalizeNflScheduleFixture(k.observation);
    const observed = timestamp(k.observation.observedAt);
    if (observed && observed > asOf!) parsed = { fixture: null, reasons: [...parsed.reasons, "KNOWN_OBSERVATION_AFTER_AUDIT_CUTOFF"] };
    return { ...k, parsed, result: validateNflHistoricalResult(k.observation) };
  });
  const knownDecisions = validateNflHistoricalResults(input.known.map(k => k.observation));
  const knownGroups = new Map<string, number[]>();
  known.forEach((_, i) => {
    const id = knownDecisions[i]!.normalized?.eventId ?? `unassigned:${i}`;
    const group = knownGroups.get(id) ?? []; group.push(i); knownGroups.set(id, group);
  });
  const knownIssues = [...knownGroups.values()].flatMap(indices => {
    const eventId = knownDecisions[indices[0]!]!.normalized?.eventId ?? null;
    const issues = indices.flatMap(i => [
      ...known[i]!.parsed.reasons,
      ...knownDecisions[i]!.reasons.filter(r => ["CONFLICTING_EVENT_IDENTITY", "CONFLICTING_FINAL_SCORES", "FIXTURE_EVENT_ID_COLLISION"].includes(r)),
    ]);
    if (eventId && indices.length > 1) issues.push("DUPLICATE_KNOWN_EVENT_ID");
    const identities = new Set(indices.flatMap(i => known[i]!.parsed.fixture ? [scheduleIdentity(known[i]!.parsed.fixture!)] : []));
    if (identities.size > 1) issues.push("CONFLICTING_KNOWN_IDENTITY");
    return issues.length ? [{ eventId, observationCount: indices.length, reasons: unique(issues) }] : [];
  }).sort((a, z) => compare(a.eventId ?? "", z.eventId ?? "") || compare(stableHash(a), stableHash(z)));
  const unassignable = known.some(k => !k.parsed.fixture);
  if (unassignable) reasons.add("UNASSIGNABLE_KNOWN_FIXTURE");
  const groups = new Map<string, ReturnType<typeof verifyNflScheduleEvidence>[]>();
  const expectedProofs = input.expected.map(e => verifyNflScheduleEvidence(e, asOf!));
  const corroboratedExpectations = new Set(expectedProofs.flatMap(p =>
    p.status === "OFFLINE_CORROBORATED" && p.fixture ? [scheduleIdentity(p.fixture)] : []));
  const captureHashes = new Map<string, Set<string>>();
  for (const proof of expectedProofs) for (const c of proof.captures) {
    const hashes = captureHashes.get(c.evidenceId) ?? new Set(); hashes.add(c.sha256); captureHashes.set(c.evidenceId, hashes);
  }
  for (const original of expectedProofs) {
    const reused = original.captures.some(c => captureHashes.get(c.evidenceId)!.size > 1);
    const proof = reused ? { ...original, status: "QUARANTINED" as const,
      reasons: [...original.reasons, "SCHEDULE_CAPTURE_ID_REUSE"] } : original;
    const key = proof.fixture?.eventId ?? `unresolved:${stableHash([proof.evidenceIds, proof.captures, proof.reasons])}`;
    const group = groups.get(key) ?? []; group.push(proof); groups.set(key, group);
  }
  const games: NflGameCoverage[] = [];
  const usedKnown = new Set<number>();
  for (const [eventId, proofs] of groups) {
    const fixtures = proofs.flatMap(p => p.fixture ? [p.fixture] : []);
    const f = fixtures.sort((a, z) => compare(scheduleIdentity(a), scheduleIdentity(z)))[0] ?? null;
    const why: string[] = [];
    if (proofs.length > 1) why.push("DUPLICATE_EXPECTED_EVENT_ID");
    const report: NflGameCoverage = {
      eventId, fixture: f, status: "QUARANTINED", reasons: why,
      expectedObservationCount: proofs.length, knownObservationCount: 0,
      scheduleEvidenceIds: unique(proofs.flatMap(p => [...p.evidenceIds])), regularSeasonExpected: false,
    };
    games.push(report);
    if (new Set(fixtures.map(scheduleIdentity)).size > 1) {
      report.status = "CONFLICTING"; why.push("CONFLICTING_EXPECTED_IDENTITY", ...proofs.flatMap(p => [...p.reasons])); continue;
    }
    if (proofs.some(p => p.status !== "OFFLINE_CORROBORATED") || !f) {
      why.push(...proofs.flatMap(p => [...p.reasons])); continue;
    }
    if (f.phase !== "REGULAR_SEASON") {
      report.status = "EXCLUDED"; why.push(`${f.phase}_EXCLUDED`); continue;
    }
    if (!scope(f)) { report.status = "OUT_OF_SCOPE"; why.push("OUTSIDE_EXPLICIT_SCOPE"); continue; }
    report.regularSeasonExpected = true;
    // Match before scope-filtering known data: an erroneous date must not turn
    // an existing event into a missing event and create a duplicate candidate.
    const matches = known.flatMap((k, i) => {
      const x = k.parsed.fixture;
      const rawId = knownDecisions[i]!.normalized?.eventId;
      const possibleReplacement = x && x.season === f.season && scheduleTeamPair(x) === scheduleTeamPair(f)
        && !corroboratedExpectations.has(scheduleIdentity(x));
      return rawId === f.eventId || (x && pairWeek(x) === pairWeek(f)) || possibleReplacement ? [i] : [];
    });
    matches.forEach(i => usedKnown.add(i));
    report.knownObservationCount = matches.length;
    if (matches.length > 1) why.push("DUPLICATE_KNOWN_EVENT_ID");
    for (const i of matches) {
      const x = known[i]!.parsed.fixture;
      if (!x) { why.push("UNASSIGNABLE_MATCHING_FIXTURE", ...known[i]!.parsed.reasons); continue; }
      if (x.eventId !== f.eventId && x.week !== f.week) why.push("POSSIBLE_REPLACEMENT_FIXTURE");
      if (x.eventId !== f.eventId) why.push("EVENT_ID_COLLISION");
      if (x.homeTeamId !== f.homeTeamId || x.awayTeamId !== f.awayTeamId) why.push("TEAM_ASSIGNMENT_CONFLICT");
      if (x.kickoff !== f.kickoff) why.push("KICKOFF_CONFLICT");
      if (x.season !== f.season || x.week !== f.week || x.phase !== f.phase) why.push("SEASON_WEEK_PHASE_CONFLICT");
      if (knownDecisions[i]!.reasons.includes("CONFLICTING_FINAL_SCORES")) why.push("CONFLICTING_FINAL_SCORES");
    }
    if (why.some(r => !["DUPLICATE_KNOWN_EVENT_ID", "DUPLICATE_EXPECTED_EVENT_ID"].includes(r))) {
      report.status = "CONFLICTING"; continue;
    }
    if (matches.length) {
      let unresolvedFinal = false;
      const verifiedRows = matches.map(i => {
        const k = known[i]!;
        if (k.result.normalized?.completion !== "FINAL") return false;
        if (k.result.decision !== "ACCEPTED") unresolvedFinal = true;
        if (!k.resultEvidence) return false;
        const evidence = k.resultEvidence;
        if (evidence.references.length > 7) { unresolvedFinal = true; return false; }
        const resultProof = verifyNflHistoricalEvidence({ ...evidence, candidate: k.observation, asOf: asOf! });
        const scheduleProof = verifyNflScheduleEvidence({
          primary: evidence.candidateEvidence, references: evidence.references, policy: evidence.policy,
        }, asOf!);
        const valid = resultProof.decision === "VERIFIED" && scheduleProof.status === "OFFLINE_CORROBORATED"
          && scheduleProof.fixture !== null && scheduleIdentity(scheduleProof.fixture) === scheduleIdentity(f);
        if (!valid) unresolvedFinal = true;
        return valid;
      });
      const verified = !unresolvedFinal && verifiedRows.some(Boolean);
      report.status = verified ? "PRESENT_VERIFIED" : "PRESENT_UNVERIFIED";
      if (unresolvedFinal) why.push("UNRESOLVED_KNOWN_FINAL");
      if (!verified) why.push("FINAL_RESULT_NOT_VERIFIED");
    } else if (f.kickoff >= asOf!) {
      report.status = "NOT_DUE"; why.push("KICKOFF_NOT_BEFORE_AUDIT_CUTOFF");
    } else if (unassignable) {
      report.status = "QUARANTINED"; why.push("UNASSIGNABLE_KNOWN_FIXTURE");
    } else {
      report.status = "MISSING"; why.push("MISSING_FROM_SUPPLIED_FIXTURES");
    }
  }
  // Different IDs claiming the same pair/week are ambiguous even if both absent.
  const expectedPairs = new Map<string, NflGameCoverage[]>();
  for (const g of games) {
    if (!g.fixture || !g.regularSeasonExpected) continue;
    const key = pairWeek(g.fixture), group = expectedPairs.get(key) ?? [];
    group.push(g); expectedPairs.set(key, group);
  }
  for (const group of expectedPairs.values()) {
    if (new Set(group.map(g => g.eventId)).size > 1) for (const g of group) {
      g.status = "CONFLICTING"; g.reasons.push("EXPECTED_EVENT_ID_COLLISION");
    }
  }
  games.forEach(g => { g.reasons = unique(g.reasons); });
  games.sort((a, z) => compare(a.fixture?.kickoff ?? "", z.fixture?.kickoff ?? "") || compare(a.eventId, z.eventId));
  const totals = counts(games);
  if (!input.expected.length) reasons.add("EMPTY_EXPECTED_SCHEDULE");
  if (!totals.regularSeasonExpected) reasons.add("NO_SCOPED_REGULAR_EXPECTATIONS");
  const eligible = games.filter(g => g.status === "MISSING");
  const candidates = eligible.slice(0, b.maxRecoveryCandidates).map(g => ({
    fixture: g.fixture!, scheduleEvidenceIds: g.scheduleEvidenceIds,
    reason: "MISSING_FROM_SUPPLIED_FIXTURES" as const, intent: "INSPECT_FIXTURE_ONLY" as const, executionAuthorized: false as const,
  }));
  if (eligible.length > candidates.length) reasons.add("RECOVERY_CANDIDATE_LIMIT_REACHED");
  const seasons = [...new Set(games.flatMap(g => g.fixture ? [g.fixture.season] : []))].sort((a, z) => a - z)
    .map(season => {
      const seasonGames = games.filter(g => g.fixture?.season === season);
      return { season, counts: counts(seasonGames),
        weeks: [...new Set(seasonGames.map(g => g.fixture!.week))].sort((a, z) => a - z).map(week => {
          const weekGames = seasonGames.filter(g => g.fixture!.week === week);
          return { week, counts: counts(weekGames), eventIds: weekGames.map(g => g.eventId).sort(compare) };
        }) };
    });
  const unexpectedKnownEventIds = unique(known.flatMap((k, i) => !usedKnown.has(i) && k.parsed.fixture
    && k.parsed.fixture.phase === "REGULAR_SEASON" && scope(k.parsed.fixture) ? [k.parsed.fixture.eventId] : []));
  if (unexpectedKnownEventIds.length) reasons.add("UNEXPECTED_KNOWN_FIXTURE");
  return {
    status: totals.conflicting || totals.quarantined || unassignable || !totals.regularSeasonExpected || unexpectedKnownEventIds.length
      ? "UNCERTAIN" : totals.missing ? "INCOMPLETE" : "COMPLETE",
    asOf, reasons: [...reasons].sort(compare), counts: totals, games, seasons,
    unexpectedKnownEventIds, knownIssues,
    recovery: { candidates, eligibleCount: eligible.length, omittedCount: eligible.length - candidates.length,
      limit: b.maxRecoveryCandidates, executionAuthorized: false },
  };
}
