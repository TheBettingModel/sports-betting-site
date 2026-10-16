import { describe, expect, it } from "vitest";
import { compareNflHistoricalFixtureCoverage as coverage, type NflKnownFixture } from "./nflHistoricalFixtureCoverage";
import { normalizeNflScheduleFixture, verifyNflScheduleEvidence } from "./nflHistoricalScheduleEvidence";
import { missingSeptember27Scenario, scheduleEvent, scheduleProof } from "../../test/nfl-offline/schedule-fixtures";

const asOf = "2026-09-28T18:00:00Z", observedAt = "2026-09-28T12:00:00Z";
const known = (event: unknown): NflKnownFixture => ({ observation: { event, observedAt } });
const request = (events = missingSeptember27Scenario(), rows: NflKnownFixture[] = []) => ({
  expected: events.map(e => scheduleProof(e)), known: rows, asOf,
  bounds: { seasons: [2026], weeks: [3, 4], fromInclusive: "2026-09-27T00:00:00Z",
    toExclusive: "2026-09-29T00:00:00Z", maxRecoveryCandidates: 32 },
});

describe("offline NFL missing-fixture coverage", () => {
  it("reports the synthetic September 27 Rams–Denver and Seattle–Washington gaps", () => {
    const out = coverage(request());
    expect(out.status).toBe("INCOMPLETE");
    expect(out.counts).toMatchObject({ regularSeasonExpected: 2, missing: 2, present: 0 });
    expect(out.games.map(g => g.eventId)).toEqual(["900000027", "900000028"]);
    expect(out.seasons[0]).toMatchObject({ season: 2026, counts: { missing: 2 },
      weeks: [{ week: 3, counts: { missing: 2 } }] });
    expect(out.recovery.candidates).toHaveLength(2);
    expect(out.recovery.candidates.every(c => !c.executionAuthorized && c.intent === "INSPECT_FIXTURE_ONLY")).toBe(true);
    expect(out.recovery.executionAuthorized).toBe(false);
  });
  it("separates fixture presence from verified final-result coverage", () => {
    const events = missingSeptember27Scenario();
    const out = coverage(request(events, events.map(known)));
    expect(out.status).toBe("COMPLETE");
    expect(out.counts).toMatchObject({ present: 2, missing: 0, verifiedResults: 0 });
    expect(out.games.every(g => g.status === "PRESENT_UNVERIFIED")).toBe(true);
    expect(out.recovery.candidates).toEqual([]);
  });
  it("reuses Step 3 to label a genuinely corroborated supplied final", () => {
    const e = scheduleEvent();
    e.status.type = { state: "post", completed: true, name: "STATUS_FINAL" };
    e.competitions[0]!.competitors[0]!.score = "17";
    e.competitions[0]!.competitors[1]!.score = "24";
    const proof = scheduleProof(e);
    const row: NflKnownFixture = {
      ...known(e), resultEvidence: { candidateEvidence: proof.primary, references: proof.references,
        policy: { ...proof.policy, captures: proof.policy.captures.map(m => ({ ...m, retrievedAt: observedAt })) } },
    };
    const out = coverage(request([scheduleEvent()], [row]));
    expect(out.games[0]!.status).toBe("PRESENT_VERIFIED");
    expect(out.counts.verifiedResults).toBe(1);
  });
  it("does not treat a known 0–0 final as a missing fixture", () => {
    const e = scheduleEvent(); e.status.type = { state: "post", completed: true, name: "STATUS_FINAL" };
    const out = coverage(request([scheduleEvent()], [known(e)]));
    expect(out.games[0]!.status).toBe("PRESENT_UNVERIFIED");
    expect(out.counts.missing).toBe(0);
    expect(out.recovery.candidates).toEqual([]);
  });
  it("collapses identical expected IDs without counting the fixture twice", () => {
    const e = scheduleEvent(), out = coverage(request([e, structuredClone(e)]));
    expect(out.counts.regularSeasonExpected).toBe(1);
    expect(out.games[0]!.expectedObservationCount).toBe(2);
    expect(out.games[0]!.reasons).toContain("DUPLICATE_EXPECTED_EVENT_ID");
    expect(out.recovery.candidates).toHaveLength(1);
  });
  it("reports repeated known event identities without counting them twice", () => {
    const e = scheduleEvent(), out = coverage(request([e], [known(e), known(structuredClone(e))]));
    expect(out.counts.present).toBe(1);
    expect(out.games[0]!.knownObservationCount).toBe(2);
    expect(out.games[0]!.reasons).toContain("DUPLICATE_KNOWN_EVENT_ID");
  });
  it("blocks conflicting expected assignments under one event ID", () => {
    const a = scheduleEvent(), b = scheduleEvent({ homeId: "17" });
    const out = coverage(request([a, b]));
    expect(out.games[0]!.status).toBe("CONFLICTING");
    expect(out.games[0]!.reasons).toContain("CONFLICTING_EXPECTED_IDENTITY");
    expect(out.recovery.candidates).toEqual([]);
  });
  it("blocks two expected IDs for the same teams and week", () => {
    const out = coverage(request([scheduleEvent(), scheduleEvent({ id: "900000099" })]));
    expect(out.games.every(g => g.status === "CONFLICTING")).toBe(true);
    expect(out.games.every(g => g.reasons.includes("EXPECTED_EVENT_ID_COLLISION"))).toBe(true);
    expect(out.recovery.candidates).toEqual([]);
  });
  it.each([
    ["team", "TEAM_ASSIGNMENT_CONFLICT"], ["kickoff", "KICKOFF_CONFLICT"],
    ["week", "SEASON_WEEK_PHASE_CONFLICT"], ["phase", "SEASON_WEEK_PHASE_CONFLICT"],
  ])("does not label an existing event with wrong %s as missing", (kind, reason) => {
    const expected = scheduleEvent(), e = structuredClone(expected);
    if (kind === "team") { e.competitions[0]!.competitors[0]!.id = "17"; e.competitions[0]!.competitors[0]!.team.id = "17"; }
    if (kind === "kickoff") { e.date = "2026-09-26T17:00:00Z"; e.competitions[0]!.date = e.date; }
    if (kind === "week") e.week.number = 5;
    if (kind === "phase") e.season.type = 1;
    const out = coverage(request([expected], [known(e)]));
    expect(out.games[0]!.status).toBe("CONFLICTING");
    expect(out.games[0]!.reasons).toContain(reason);
    expect(out.counts.missing).toBe(0);
    expect(out.recovery.candidates).toEqual([]);
  });
  it("detects a swapped home/away assignment under a different ID", () => {
    const e = scheduleEvent({ id: "900000099", homeId: "7", awayId: "12" });
    const out = coverage(request([scheduleEvent()], [known(e)]));
    expect(out.games[0]!.reasons).toEqual(expect.arrayContaining(["EVENT_ID_COLLISION", "TEAM_ASSIGNMENT_CONFLICT"]));
    expect(out.recovery.candidates).toEqual([]);
  });
  it("detects conflicting final scores in known observations", () => {
    const a = scheduleEvent(); a.status.type = { state: "post", completed: true, name: "STATUS_FINAL" };
    const b = structuredClone(a); b.competitions[0]!.competitors[0]!.score = "10";
    const out = coverage(request([scheduleEvent()], [known(a), known(b)]));
    expect(out.games[0]!.status).toBe("CONFLICTING");
    expect(out.games[0]!.reasons).toContain("CONFLICTING_FINAL_SCORES");
  });
  it.each([1, 3])("excludes corroborated season phase %i, not the month", seasonType => {
    const out = coverage(request([scheduleEvent({ seasonType })]));
    expect(out.games[0]!.status).toBe("EXCLUDED");
    expect(out.counts.regularSeasonExpected).toBe(0);
    expect(out.counts.excluded).toBe(1);
    expect(out.recovery.candidates).toEqual([]);
  });
  it("does not exclude an unverified preseason claim from the coverage audit silently", () => {
    const input = request([scheduleEvent({ seasonType: 1 })]), proof = input.expected[0]!;
    const out = coverage({ ...input, expected: [{ ...proof, references: [] }] });
    expect(out.games[0]!.status).toBe("QUARANTINED");
    expect(out.counts.excluded).toBe(0);
  });
  it("quarantines unknown phase metadata without inferring regular season from September", () => {
    const e = scheduleEvent();
    delete (e as { season?: unknown }).season;
    expect(coverage(request([e])).games[0]!.status).toBe("QUARANTINED");
  });
  it("requires explicit event-level week metadata", () => {
    const e = scheduleEvent(); delete (e as { week?: unknown }).week;
    expect(normalizeNflScheduleFixture({ event: e, observedAt }).reasons).toContain("INVALID_EVENT_WEEK");
    expect(coverage(request([e])).recovery.candidates).toEqual([]);
  });
  it.each([0, 19, 1.5, Number.NaN])("rejects invalid regular-season week %s", week => {
    expect(coverage(request([scheduleEvent({}, week)])).games[0]!.status).toBe("QUARANTINED");
  });
  it("quarantines disagreement between independently supplied schedules", () => {
    const e = scheduleEvent(), different = scheduleEvent({ homeId: "17" });
    const a = scheduleProof(e), b = scheduleProof(different);
    const proof = { ...a, references: b.references,
      policy: { ...a.policy, captures: [a.policy.captures[0]!, b.policy.captures[1]!] } };
    expect(verifyNflScheduleEvidence(proof, asOf).reasons).toContain("SCHEDULE_EVIDENCE_CONFLICT");
  });
  it("does not count a schedule mirror as independent evidence", () => {
    const input = request(), a = input.expected[0]!;
    const p = { ...a, policy: { ...a.policy, sources: a.policy.sources.map(s => ({ ...s, upstreamProviderId: "one-provider" })) } };
    expect(coverage({ ...input, expected: [p] }).games[0]!.reasons).toContain("INSUFFICIENT_INDEPENDENT_PROVIDERS");
  });
  it("quarantines tampered schedule bytes", () => {
    const input = request(), a = input.expected[0]!;
    const out = coverage({ ...input, expected: [{ ...a, primary: { ...a.primary!, rawEventJson: a.primary!.rawEventJson + " " } }] });
    expect(out.games[0]!.reasons).toContain("PAYLOAD_HASH_MISMATCH");
    expect(out.recovery.candidates).toEqual([]);
  });
  it("quarantines missing primary schedule evidence", () => {
    const input = request();
    expect(coverage({ ...input, expected: [{ ...input.expected[0]!, primary: null }] }).games[0]!.status).toBe("QUARANTINED");
  });
  it("blocks recovery when an unidentifiable known row could represent a supposed gap", () => {
    const out = coverage(request(missingSeptember27Scenario(), [known(null)]));
    expect(out.status).toBe("UNCERTAIN");
    expect(out.reasons).toContain("UNASSIGNABLE_KNOWN_FIXTURE");
    expect(out.games.every(g => g.status === "QUARANTINED")).toBe(true);
    expect(out.recovery.candidates).toEqual([]);
  });
  it("reports extra known regular-season fixtures absent from the supplied expected schedule", () => {
    const extra = scheduleEvent({ id: "900000099", homeId: "17", awayId: "19" });
    const out = coverage(request([scheduleEvent()], [known(extra)]));
    expect(out.status).toBe("UNCERTAIN");
    expect(out.unexpectedKnownEventIds).toEqual(["900000099"]);
  });
  it("reports duplicate/conflicting known identities even when not in the expected schedule", () => {
    const a = scheduleEvent({ id: "900000099", homeId: "17", awayId: "19" });
    const b = scheduleEvent({ id: "900000099", homeId: "20", awayId: "19" });
    const out = coverage(request([scheduleEvent()], [known(a), known(b)]));
    expect(out.knownIssues[0]).toMatchObject({ eventId: "900000099", observationCount: 2 });
    expect(out.knownIssues[0]!.reasons).toEqual(expect.arrayContaining(["DUPLICATE_KNOWN_EVENT_ID", "CONFLICTING_KNOWN_IDENTITY"]));
  });
  it("does not use known observations captured after the supplied audit cutoff", () => {
    const e = scheduleEvent(), row = known(e);
    const out = coverage(request([e], [{ ...row, observation: { ...row.observation, observedAt: "2026-09-29T12:00:00Z" } }]));
    expect(out.games[0]!.reasons).toContain("KNOWN_OBSERVATION_AFTER_AUDIT_CUTOFF");
    expect(out.counts.present).toBe(0);
    expect(out.recovery.candidates).toEqual([]);
  });
  it("partitions coverage into explicit week reports without guessing a week from the date", () => {
    const events = missingSeptember27Scenario();
    events[1]!.week.number = 4;
    const out = coverage(request(events, [known(events[0]!)]));
    expect(out.seasons[0]!.weeks.map(w => [w.week, w.counts.present, w.counts.missing])).toEqual([[3, 1, 0], [4, 0, 1]]);
  });
  it("detects capture IDs reused for different fixtures across schedule evidence sets", () => {
    const input = request(), first = input.expected[0]!, second = input.expected[1]!;
    const ids = [first.primary!.evidenceId, first.references[0]!.evidenceId];
    const changed = { ...second, primary: { ...second.primary!, evidenceId: ids[0]! },
      references: [{ ...second.references[0]!, evidenceId: ids[1]! }],
      policy: { ...second.policy, captures: second.policy.captures.map((m, i) => ({ ...m, evidenceId: ids[i]! })) } };
    const out = coverage({ ...input, expected: [first, changed] });
    expect(out.games.every(g => g.reasons.includes("SCHEDULE_CAPTURE_ID_REUSE"))).toBe(true);
    expect(out.recovery.candidates).toEqual([]);
  });
  it("does not plan recovery for future kickoffs", () => {
    const input = request();
    const out = coverage({ ...input, asOf: "2026-09-26T18:00:00Z" });
    expect(out.counts.notDue).toBe(2);
    expect(out.recovery.candidates).toEqual([]);
  });
  it("honors explicit season, week, and half-open kickoff bounds", () => {
    const input = request();
    for (const bounds of [
      { ...input.bounds, seasons: [2025] }, { ...input.bounds, weeks: [4] },
      { ...input.bounds, toExclusive: "2026-09-27T17:00:00Z" },
    ]) expect(coverage({ ...input, bounds }).games.every(g => g.status === "OUT_OF_SCOPE")).toBe(true);
  });
  it("bounds and deterministically truncates the review-only recovery list", () => {
    const input = request();
    const out = coverage({ ...input, bounds: { ...input.bounds, maxRecoveryCandidates: 1 } });
    expect(out.recovery).toMatchObject({ eligibleCount: 2, omittedCount: 1, limit: 1, executionAuthorized: false });
    expect(out.recovery.candidates[0]!.fixture.eventId).toBe("900000027");
    const zero = coverage({ ...input, bounds: { ...input.bounds, maxRecoveryCandidates: 0 } });
    expect(zero.recovery.candidates).toEqual([]);
    expect(zero.recovery.omittedCount).toBe(2);
  });
  it.each([-1, 33, 1.5, Number.NaN])("rejects invalid recovery limit %s", maxRecoveryCandidates => {
    const input = request();
    expect(coverage({ ...input, bounds: { ...input.bounds, maxRecoveryCandidates } }).status).toBe("INVALID_INPUT");
  });
  it("requires a valid cutoff and a window no longer than 35 days", () => {
    const input = request();
    expect(coverage({ ...input, asOf: "" }).status).toBe("INVALID_INPUT");
    expect(coverage({ ...input, bounds: { ...input.bounds, fromInclusive: "2026-08-01T00:00:00Z" } }).status).toBe("INVALID_INPUT");
  });
  it("does not claim completeness from an empty expected schedule", () => {
    const out = coverage(request([]));
    expect(out.status).toBe("UNCERTAIN");
    expect(out.reasons).toContain("EMPTY_EXPECTED_SCHEDULE");
    expect(out.recovery.candidates).toEqual([]);
  });
  it("caps supplied rows and per-game evidence before processing", () => {
    const input = request();
    expect(coverage({ ...input, expected: Array(2049).fill(input.expected[0]) }).reasons).toContain("INPUT_LIMIT_EXCEEDED");
    const p = input.expected[0]!;
    expect(verifyNflScheduleEvidence({ ...p, references: Array(8).fill(p.references[0]) }, asOf).reasons)
      .toContain("SCHEDULE_EVIDENCE_LIMIT_EXCEEDED");
  });
  it("requires an updated verified schedule for interrupted games", () => {
    const e = scheduleEvent(); e.status.type.name = "STATUS_POSTPONED";
    expect(coverage(request([e])).games[0]!.reasons).toContain("INTERRUPTED_SCHEDULE_STATUS");
  });
  it("normalizes equivalent kickoff instants across timezone offsets", () => {
    const e = scheduleEvent(); e.date = "2026-09-27T13:00:00-04:00"; e.competitions[0]!.date = e.date;
    expect(coverage(request([scheduleEvent()], [known(e)])).games[0]!.status).toBe("PRESENT_UNVERIFIED");
  });
  it("is deterministic, order-independent, and does not mutate inputs", () => {
    const input = request(), before = structuredClone(input), out = coverage(input);
    expect(coverage(input)).toEqual(out);
    expect(coverage({ ...input, expected: [...input.expected].reverse() })).toEqual(out);
    expect(input).toEqual(before);
  });
  it("keeps known-duplicate conflict reports independent of observation ordering", () => {
    const a = scheduleEvent(), b = scheduleEvent({ homeId: "17" });
    const input = request([a], [known(a), known(b)]);
    expect(coverage({ ...input, known: [...input.known].reverse() })).toEqual(coverage(input));
  });
});
