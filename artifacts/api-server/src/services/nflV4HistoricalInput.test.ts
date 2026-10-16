import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prepareNflV4HistoricalInput, type NflV4HistoricalInput } from "./nflV4HistoricalInput";
import { materializeNflV4 } from "./nflV4";
import { missingSeptember27Scenario, scheduleEvent, scheduleProof } from "../../test/nfl-offline/schedule-fixtures";

type Event = ReturnType<typeof scheduleEvent>;
const observedAt = "2026-09-28T12:00:00Z";
const asOf = "2026-09-28T18:00:00Z";
function capture(event: Event, role: string, retrievedAt: string) {
  const proof = scheduleProof(event, role);
  return {
    primary: { ...proof.primary!, evidenceId: `${role}:${proof.primary!.evidenceId}` },
    references: proof.references.map(r => ({ ...r, evidenceId: `${role}:${r.evidenceId}` })),
    sources: proof.policy.sources.map(s => ({ ...s })),
    captures: proof.policy.captures.map(c => ({ ...c, evidenceId: `${role}:${c.evidenceId}`, retrievedAt })),
  };
}
function fixture(events = [scheduleEvent()], editFinal: (e: Event) => void = () => {}) {
  const entries = events.map(event => {
    const final = structuredClone(event);
    final.status.type = { state: "post", completed: true, name: "STATUS_FINAL" };
    final.competitions[0]!.competitors.forEach(c => { c.score = c.homeAway === "home" ? "31" : "10"; });
    editFinal(final);
    const scheduled = capture(event, "fixture", "2026-09-20T12:00:00Z");
    const result = capture(final, "result", observedAt);
    return { scheduled, result, final };
  });
  return {
    observations: entries.map(e => ({
      observation: { event: e.final, observedAt },
      candidateEvidence: e.result.primary as { evidenceId: string; rawEventJson: string } | null,
      references: e.result.references,
    })),
    schedule: entries.map(e => ({ primary: e.scheduled.primary, references: e.scheduled.references })),
    catalogs: {
      sources: [...new Map(entries.flatMap(e => e.result.sources).map(s => [s.sourceId, s])).values()],
      captures: entries.flatMap(e => [...e.scheduled.captures, ...e.result.captures]),
    },
    targetKickoff: "2026-10-04T17:00:00Z",
    frozenSeedBoundary: "2026-09-07T12:00:00Z",
    verificationAsOf: asOf,
    bounds: { seasons: [2026], weeks: [3], fromInclusive: "2026-09-27T00:00:00Z",
      toExclusive: "2026-09-29T00:00:00Z", maxObservations: 16, maxScheduleFixtures: 16, maxInputBytes: 1024 * 1024 },
  } satisfies NflV4HistoricalInput;
}
type Fixture = ReturnType<typeof fixture>;
function rewrite(input: Fixture, record: { evidenceId: string; rawEventJson: string }, edit: (e: Event) => void) {
  const event = JSON.parse(record.rawEventJson) as Event;
  edit(event); record.rawEventJson = JSON.stringify(event);
  const index = input.catalogs.captures.findIndex(c => c.evidenceId === record.evidenceId);
  input.catalogs.captures[index] = { ...input.catalogs.captures[index]!,
    sha256: createHash("sha256").update(record.rawEventJson).digest("hex") };
}
const reasons = (input: NflV4HistoricalInput) =>
  prepareNflV4HistoricalInput(input).decisions.flatMap(d => d.reasons);
function noHistory(input: NflV4HistoricalInput) {
  const result = prepareNflV4HistoricalInput(input);
  expect(result.history).toEqual([]);
  expect(result.decisions.every(d => d.decision !== "ELIGIBLE")).toBe(true);
  return result;
}

describe("NFL V4 pure historical input adapter", () => {
  it("returns existing V4 rows with explicit conservative availability, not kickoff plus 12h", () => {
    const input = fixture(), output = prepareNflV4HistoricalInput(input);
    expect(output.status).toBe("PROCESSED");
    expect(output.history).toEqual([{
      gameId: "900000001", eventStart: "2026-09-27T17:00:00.000Z",
      completedAt: "2026-09-28T18:00:00.000Z", homeTeamId: "12", awayTeamId: "7",
      homeScore: 31, awayScore: 10,
    }]);
    expect(output.decisions[0]).toMatchObject({ decision: "ELIGIBLE", completionTimeKind: "CONSERVATIVE_BOUND",
      evidenceAvailableAt: "2026-09-28T18:00:00.000Z", independentUpstreamProviders: ["schedule-a", "schedule-b"] });
    expect(output.decisions[0]!.resultEvidenceIds).toHaveLength(2);
    expect(output.decisions[0]!.scheduleEvidenceIds).toHaveLength(2);
  });
  it("is compatible with the unchanged pure V4 materializer", () => {
    const history = prepareNflV4HistoricalInput(fixture()).history;
    const parameters = { carryover: 0.65, kFactor: 20, homeAdvantageElo: 40, scoreRecencyAlpha: 0.2, leaguePointsPrior: 21 };
    const expected = [{ gameId: "900000001", eventStart: "2026-09-27T17:00:00.000Z",
      completedAt: "2026-09-28T18:00:00.000Z", homeTeamId: "12", awayTeamId: "7", homeScore: 31, awayScore: 10 }];
    expect(materializeNflV4(history, parameters)).toEqual(materializeNflV4(expected, parameters));
  });
  it("is deterministic across observations, schedule and catalog permutations without mutating frozen inputs", () => {
    const input = fixture(missingSeptember27Scenario()), before = structuredClone(input);
    const deepFreeze = (value: unknown): void => {
      if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
    };
    deepFreeze(input);
    const reverse = structuredClone(before);
    reverse.observations.reverse(); reverse.schedule.reverse();
    reverse.catalogs.sources.reverse(); reverse.catalogs.captures.reverse();
    reverse.observations.forEach(o => o.references.reverse());
    expect(prepareNflV4HistoricalInput(input)).toEqual(prepareNflV4HistoricalInput(reverse));
    expect(input).toEqual(before);
    expect(prepareNflV4HistoricalInput(input).history.map(h => h.gameId)).toEqual(["900000027", "900000028"]);
  });
  it("retains one result for exact duplicates, deterministically", () => {
    const input = fixture(); input.observations.push(structuredClone(input.observations[0]!));
    const output = prepareNflV4HistoricalInput(input);
    expect(output.history).toHaveLength(1);
    expect(output.decisions.filter(d => d.decision === "EXCLUDED")[0]!.reasons).toEqual(["DUPLICATE_OBSERVATION"]);
    input.observations.reverse();
    expect(prepareNflV4HistoricalInput(input)).toEqual(output);
  });
  it.each([[31, 0], [0, 10], [17, 17]])("accepts independently corroborated legitimate score %i–%i", (home, away) => {
    const input = fixture(undefined, e => e.competitions[0]!.competitors.forEach(c => { c.score = c.homeAway === "home" ? home : away; }));
    expect(prepareNflV4HistoricalInput(input).history[0]).toMatchObject({ homeScore: home, awayScore: away });
  });
  it.each([1, 3])("excludes season phase %i rather than inferring eligibility from September", seasonType => {
    const output = noHistory(fixture([scheduleEvent({ seasonType })]));
    expect(output.decisions[0]!.decision).toBe("EXCLUDED");
    expect(output.decisions[0]!.reasons).toContain(seasonType === 1 ? "PRESEASON_EXCLUDED" : "POSTSEASON_EXCLUDED");
  });
  it.each([undefined, null, "", -1, 1.5])("quarantines missing/invalid final scores (%s)", score => {
    const input = fixture(undefined, e => {
      const competitor = e.competitions[0]!.competitors[0]!;
      if (score === undefined) Reflect.deleteProperty(competitor, "score");
      else competitor.score = score;
    });
    noHistory(input);
  });
  it("quarantines suspicious 0–0 finals without using reference scores as corrections", () => {
    const input = fixture(undefined, e => e.competitions[0]!.competitors.forEach(c => { c.score = "0"; }));
    rewrite(input, input.observations[0]!.references[0]!, e => { e.competitions[0]!.competitors[0]!.score = "10"; });
    noHistory(input);
    expect(reasons(input)).toContain("SUSPICIOUS_ZERO_ZERO_FINAL");
    expect(input.observations[0]!.observation.event.competitions[0]!.competitors[0]!.score).toBe("0");
  });
  it("does not allow a verified final to hide an invalid matching final", () => {
    const input = fixture(), bad = structuredClone(input.observations[0]!);
    bad.observation.event.competitions[0]!.competitors[0]!.score = null;
    input.observations.push(bad);
    noHistory(input);
    expect(reasons(input)).toContain("UNRESOLVED_KNOWN_FINAL");
  });
  it.each(["score", "identity"])("blocks all conflicting observations (%s), independent of order", kind => {
    const input = fixture(), bad = structuredClone(input.observations[0]!);
    const competitor = bad.observation.event.competitions[0]!.competitors[0]!;
    if (kind === "score") competitor.score = "22";
    else { competitor.id = "17"; competitor.team.id = "17"; }
    input.observations.push(bad);
    const output = noHistory(input); input.observations.reverse();
    expect(prepareNflV4HistoricalInput(input)).toEqual(output);
    expect(reasons(input)).toContain(kind === "score" ? "CONFLICTING_FINAL_SCORES" : "CONFLICTING_EVENT_IDENTITY");
  });
  it("blocks different event IDs claiming the same fixture", () => {
    noHistory(fixture([scheduleEvent(), scheduleEvent({ id: "900000099" })]));
  });
  it("does not admit nonfinal results or unknown phases", () => {
    noHistory(fixture(undefined, e => { e.status.type = { state: "pre", completed: false, name: "STATUS_SCHEDULED" }; }));
    noHistory(fixture(undefined, e => { e.season.type = 99; }));
  });
  it("quarantines an unassignable observation rather than silently treating the batch as safe", () => {
    const input = fixture(), bad = structuredClone(input.observations[0]!);
    bad.observation.event.id = ""; input.observations.push(bad);
    noHistory(input);
    expect(reasons(input)).toContain("UNASSIGNABLE_BATCH_OBSERVATION");
  });
  it.each(["candidate", "references", "schedule"])("does not accept missing %s evidence", missing => {
    const input = fixture();
    if (missing === "candidate") input.observations[0]!.candidateEvidence = null;
    if (missing === "references") input.observations[0]!.references = [];
    if (missing === "schedule") input.schedule = [];
    noHistory(input);
  });
  it("does not count mirrored upstream records as independent verification", () => {
    const input = fixture();
    input.catalogs.sources.forEach(s => { s.upstreamProviderId = "same-upstream"; });
    noHistory(input); expect(reasons(input)).toContain("INSUFFICIENT_INDEPENDENT_PROVIDERS");
  });
  it("quarantines different scores in supplied source evidence", () => {
    const input = fixture();
    rewrite(input, input.observations[0]!.references[0]!, e => { e.competitions[0]!.competitors[0]!.score = "21"; });
    noHistory(input); expect(reasons(input)).toContain("FINAL_SCORE_CONFLICT");
  });
  it("requires result references to corroborate schedule week too", () => {
    const input = fixture();
    rewrite(input, input.observations[0]!.references[0]!, e => { e.week.number = 4; });
    noHistory(input); expect(reasons(input)).toContain("SCHEDULE_OR_BATCH_NOT_VERIFIED");
  });
  it.each(["week", "kickoff", "teams"])("blocks conflicting schedule %s evidence", kind => {
    const input = fixture();
    rewrite(input, input.schedule[0]!.references[0]!, e => {
      if (kind === "week") e.week.number = 4;
      if (kind === "kickoff") { e.date = "2026-09-28T17:00:00Z"; e.competitions[0]!.date = e.date; }
      if (kind === "teams") { e.competitions[0]!.competitors[0]!.id = "17"; e.competitions[0]!.competitors[0]!.team.id = "17"; }
    });
    noHistory(input);
  });
  it.each(["source", "capture"])("requires approved %s catalog entries", kind => {
    const input = fixture();
    if (kind === "source") input.catalogs.sources[0]!.reviewStatus = "UNREVIEWED";
    else input.catalogs.captures.find(c => c.evidenceId.startsWith("result:"))!.reviewStatus = "UNREVIEWED";
    noHistory(input);
  });
  it("does not accept altered bytes or byte-identical cross-provider copies", () => {
    const changed = fixture(); changed.observations[0]!.references[0]!.rawEventJson += " ";
    noHistory(changed); expect(reasons(changed)).toContain("PAYLOAD_HASH_MISMATCH");
    const reused = fixture(), reference = reused.observations[0]!.references[0]!;
    reference.rawEventJson = reused.observations[0]!.candidateEvidence!.rawEventJson;
    rewrite(reused, reference, () => {});
    noHistory(reused); expect(reasons(reused)).toContain("CROSS_PROVIDER_PAYLOAD_REUSE");
  });
  it.each(["targetKickoff", "frozenSeedBoundary", "verificationAsOf"] as const)("rejects invalid %s", field => {
    const input = fixture(); input[field] = "not-an-instant";
    expect(noHistory(input).status).toBe("INVALID_INPUT");
  });
  it.each(["2026-09-27T17:00:00Z", "2026-09-27T17:00:00.001Z"])("excludes kickoff at/before frozen boundary %s", boundary => {
    const input = fixture(); input.frozenSeedBoundary = boundary;
    expect(noHistory(input).decisions[0]!.reasons).toContain("AT_OR_BEFORE_FROZEN_SEED");
  });
  it("admits a kickoff strictly after the frozen boundary", () => {
    const input = fixture(); input.frozenSeedBoundary = "2026-09-27T16:59:59.999Z";
    expect(prepareNflV4HistoricalInput(input).history).toHaveLength(1);
  });
  it.each([0, 1])("rejects verification at/after target kickoff (+%i ms)", delta => {
    const input = fixture(); input.verificationAsOf = new Date(Date.parse(input.targetKickoff) + delta).toISOString();
    expect(noHistory(input).reasons).toContain("VERIFICATION_NOT_BEFORE_TARGET");
  });
  it("accepts verification one millisecond before target without backdating it", () => {
    const input = fixture(); input.verificationAsOf = "2026-10-04T16:59:59.999Z";
    expect(prepareNflV4HistoricalInput(input).history[0]!.completedAt).toBe(input.verificationAsOf);
  });
  it.each(["fixture:", "result:"])("blocks captures arriving after the verification cutoff (%s)", prefix => {
    const input = fixture();
    input.catalogs.captures.filter(c => c.evidenceId.startsWith(prefix)).forEach(c => { c.retrievedAt = input.targetKickoff; });
    noHistory(input);
  });
  it("blocks an observation arriving after the audit cutoff", () => {
    const input = fixture(); input.observations[0]!.observation.observedAt = input.targetKickoff;
    noHistory(input);
  });
  it("excludes target/future kickoff even if a supplied payload calls it final", () => {
    const input = fixture(); input.targetKickoff = "2026-09-27T17:00:00Z"; input.verificationAsOf = "2026-09-27T16:59:59Z";
    expect(noHistory(input).decisions[0]!.reasons).toContain("KICKOFF_NOT_BEFORE_TARGET");
  });
  it("rejects reversed seed/verification boundaries", () => {
    const input = fixture(); input.frozenSeedBoundary = input.targetKickoff;
    expect(noHistory(input).reasons).toContain("SEED_NOT_BEFORE_TARGET");
    input.frozenSeedBoundary = "2026-09-29T00:00:00Z";
    expect(noHistory(input).reasons).toContain("VERIFICATION_BEFORE_SEED");
  });
  it("excludes observations outside explicit processing scope", () => {
    const input = fixture(); input.bounds.weeks = [4];
    expect(noHistory(input).decisions[0]!.reasons).toContain("OUTSIDE_EXPLICIT_SCOPE");
  });
  it.each(["window", "week", "season", "count", "bytes", "invalidLimit", "evidence"])("fails closed on invalid/exceeded %s bounds", kind => {
    const input = fixture();
    if (kind === "window") input.bounds.toExclusive = "2026-11-10T00:00:00Z";
    if (kind === "week") input.bounds.weeks = [0];
    if (kind === "season") input.bounds.seasons = [];
    if (kind === "count") { input.bounds.maxObservations = 1; input.observations.push(structuredClone(input.observations[0]!)); }
    if (kind === "bytes") input.bounds.maxInputBytes = 1;
    if (kind === "invalidLimit") input.bounds.maxObservations = 2049;
    if (kind === "evidence") input.observations[0]!.references = Array(8).fill(input.observations[0]!.references[0]);
    expect(noHistory(input).status).toBe("INVALID_INPUT");
  });
  it("rejects duplicate trusted catalog IDs instead of choosing a source definition", () => {
    const input = fixture(); input.catalogs.sources.push({ ...input.catalogs.sources[0]! });
    expect(noHistory(input).reasons).toContain("INVALID_POLICY");
  });
  it.each(["schedule", "sources", "captures"])("enforces the %s collection bound before verification", collection => {
    const input = fixture();
    if (collection === "schedule") { input.bounds.maxScheduleFixtures = 1; input.schedule.push(input.schedule[0]!); }
    if (collection === "sources") input.catalogs.sources = Array(65).fill(input.catalogs.sources[0]);
    if (collection === "captures") input.catalogs.captures = Array(16385).fill(input.catalogs.captures[0]);
    expect(noHistory(input).reasons).toContain("INPUT_LIMIT_EXCEEDED");
  });
  it("rejects non-JSON cyclic input before hashing or validation", () => {
    const input = fixture();
    Object.assign(input.observations[0]!.observation.event, { syntheticCycle: input });
    expect(noHistory(input).reasons).toContain("NON_JSON_INPUT");
  });
  it("never authorizes persistence, recovery, or live integration, including empty input", () => {
    const input = fixture(); input.observations = [];
    const output = prepareNflV4HistoricalInput(input);
    expect(output.history).toEqual([]);
    expect(output).toMatchObject({ status: "PROCESSED", persistenceAuthorized: false, executionAuthorized: false, liveIntegrationEnabled: false });
    expect(output.coverage!.counts.missing).toBe(1);
    expect(output.coverage!.recovery.candidates).toEqual([]);
    expect(output.coverage!.recovery.executionAuthorized).toBe(false);
  });
});
