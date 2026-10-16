import { describe, expect, it } from "vitest";
import { validateNflHistoricalResult } from "../../src/services/nflHistoricalResultValidation";
import { verifyNflHistoricalEvidence } from "../../src/services/nflHistoricalEvidenceVerification";
import { compareNflHistoricalFixtureCoverage, type NflKnownFixture } from "../../src/services/nflHistoricalFixtureCoverage";
import { missingSeptember27Scenario, scheduleProof, scheduleEvent } from "./schedule-fixtures";

const observedAt = "2026-09-28T12:00:00Z", asOf = "2026-09-28T18:00:00Z";
function completed(event = scheduleEvent(), homeScore = "31", awayScore = "10") {
  const copy = structuredClone(event);
  copy.status.type = { state: "post", completed: true, name: "STATUS_FINAL" };
  copy.competitions[0]!.competitors.find(c => c.homeAway === "home")!.score = homeScore;
  copy.competitions[0]!.competitors.find(c => c.homeAway === "away")!.score = awayScore;
  return copy;
}
function resultEvidence(event: ReturnType<typeof scheduleEvent>, reference = event) {
  const a = scheduleProof(event), b = scheduleProof(reference);
  return {
    candidateEvidence: a.primary, references: b.references,
    policy: { ...a.policy, captures: [a.policy.captures[0]!, b.policy.captures[1]!]
      .map(m => ({ ...m, retrievedAt: observedAt })) },
  };
}
function coverage(events: ReturnType<typeof scheduleEvent>[], known: NflKnownFixture[] = []) {
  return compareNflHistoricalFixtureCoverage({
    expected: events.map(e => scheduleProof(e)), known, asOf,
    bounds: { seasons: [2026], weeks: [3], fromInclusive: "2026-09-27T00:00:00Z",
      toExclusive: "2026-09-29T00:00:00Z", maxRecoveryCandidates: 2 },
  });
}

describe("NFL Phase A cross-component offline workflow", () => {
  it("moves supplied evidence from missing to present/verified without executing recovery", () => {
    const expected = missingSeptember27Scenario();
    const before = structuredClone(expected);
    expect(coverage(expected).recovery.candidates).toHaveLength(2);
    const event = completed(expected[0]!);
    const observation = { event, observedAt };
    expect(validateNflHistoricalResult(observation).decision).toBe("ACCEPTED");
    const evidence = resultEvidence(event);
    const verified = verifyNflHistoricalEvidence({ ...evidence, candidate: observation, asOf });
    expect(verified.decision).toBe("VERIFIED");
    expect(verified.persistenceAuthorized).toBe(false);
    const after = coverage(expected, [{ observation, resultEvidence: evidence }]);
    expect(after.counts).toMatchObject({ regularSeasonExpected: 2, present: 1, verifiedResults: 1, missing: 1 });
    expect(after.recovery.candidates.map(c => c.fixture.eventId)).toEqual(["900000028"]);
    expect(after.recovery.executionAuthorized).toBe(false);
    expect(expected).toEqual(before);
  });
  it("keeps suspect finals present but quarantines conflicting supplied scores", () => {
    const schedule = scheduleEvent(), bad = completed(schedule, "0", "0"), good = completed(schedule);
    const candidate = { event: bad, observedAt };
    expect(validateNflHistoricalResult(candidate).reasons).toContain("SUSPICIOUS_ZERO_ZERO_FINAL");
    expect(verifyNflHistoricalEvidence({ ...resultEvidence(bad, good), candidate, asOf }).verifiedResult).toBeNull();
    expect(coverage([schedule], [{ observation: candidate }]).games[0]!.status).toBe("PRESENT_UNVERIFIED");
    const conflicting = coverage([schedule], [{ observation: candidate }, { observation: { event: good, observedAt } }]);
    expect(conflicting.games[0]!.status).toBe("CONFLICTING");
    expect(conflicting.recovery.candidates).toEqual([]);
    expect(bad.competitions[0]!.competitors.find(c => c.homeAway === "home")!.score).toBe("0");
  });
  it("does not mistake an existing event outside the kickoff window for an absent game", () => {
    const expected = scheduleEvent(), moved = scheduleEvent({ date: "2026-10-01T17:00:00Z" });
    const out = coverage([expected], [{ observation: { event: moved, observedAt } }]);
    expect(out.games[0]!.reasons).toContain("KICKOFF_CONFLICT");
    expect(out.counts.missing).toBe(0);
    expect(out.recovery.candidates).toEqual([]);
  });
  it("requires independent source corroboration before trusting a final in coverage", () => {
    const schedule = scheduleEvent(), event = completed(schedule), proof = resultEvidence(event);
    const mirror = { ...proof, policy: { ...proof.policy,
      sources: proof.policy.sources.map(s => ({ ...s, upstreamProviderId: "same-upstream" })) } };
    const candidate = { event, observedAt };
    expect(verifyNflHistoricalEvidence({ ...mirror, candidate, asOf }).decision).toBe("QUARANTINED");
    expect(coverage([schedule], [{ observation: candidate, resultEvidence: mirror }]).games[0]!.status).toBe("PRESENT_UNVERIFIED");
  });
  it("does not infer missing games from unassignable historical records", () => {
    const out = coverage(missingSeptember27Scenario(), [{ observation: { event: null, observedAt } }]);
    expect(out.status).toBe("UNCERTAIN");
    expect(out.recovery.candidates).toEqual([]);
    expect(out.games.every(g => g.status === "QUARANTINED")).toBe(true);
  });
  it("does not label results verified when their source snapshots disagree on schedule week", () => {
    const schedule = scheduleEvent(), event = completed(schedule), otherWeek = structuredClone(event);
    otherWeek.week.number = 4;
    const out = coverage([schedule], [{
      observation: { event, observedAt }, resultEvidence: resultEvidence(event, otherWeek),
    }]);
    expect(out.games[0]!.status).not.toBe("PRESENT_VERIFIED");
    expect(out.counts.verifiedResults).toBe(0);
  });
  it("blocks ambiguous replacement IDs across weeks without merging proven repeat matchups", () => {
    const expected = scheduleEvent();
    for (const date of [expected.date, "2026-10-04T17:00:00Z"]) {
      const replacement = scheduleEvent({ id: "900000099", date }, 4);
      const out = coverage([expected], [{ observation: { event: replacement, observedAt } }]);
      expect(out.games[0]!.status).toBe("CONFLICTING");
      expect(out.counts.missing).toBe(0);
      expect(out.recovery.candidates).toEqual([]);
    }
    // A separate corroborated expectation proves this is another fixture.
    const repeat = scheduleEvent({ id: "900000099", date: "2026-10-04T17:00:00Z" }, 4);
    const out = coverage([expected, repeat], [{ observation: { event: repeat, observedAt } }]);
    expect(out.games.find(g => g.eventId === expected.id)!.status).toBe("MISSING");
    expect(out.recovery.candidates.map(c => c.fixture.eventId)).toEqual([expected.id]);
  });
  it("does not let one verified final hide a matching final with an invalid score", () => {
    const schedule = scheduleEvent(), event = completed(schedule);
    for (const score of [null, "invalid"]) {
      const bad = structuredClone(event);
      bad.competitions[0]!.competitors[0]!.score = score;
      const rows = [
        { observation: { event, observedAt }, resultEvidence: resultEvidence(event) },
        { observation: { event: bad, observedAt } },
      ];
      const out = coverage([schedule], rows);
      expect(out.games[0]!.status).toBe("PRESENT_UNVERIFIED");
      expect(out.games[0]!.reasons).toContain("UNRESOLVED_KNOWN_FINAL");
      expect(out.counts.verifiedResults).toBe(0);
      expect(out.recovery.candidates).toEqual([]);
      expect(coverage([schedule], [...rows].reverse())).toEqual(out);
    }
  });
});
