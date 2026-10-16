import { describe, expect, it } from "vitest";
import { classifyNflSeason, providerId, timestamp } from "./nflHistoricalResultNormalization";
import { validateNflHistoricalResult as validate, validateNflHistoricalResults as batch, type NflObservation } from "./nflHistoricalResultValidation";
import { finalEvent, seattleNewEnglandEvent } from "../../test/nfl-offline/result-fixtures";

const observedAt = "2026-09-15T12:00:00Z";
const observation = (event: unknown): NflObservation => ({ event, observedAt });
const expected = { eventId: "900000001", homeTeamId: "12", awayTeamId: "7" };
const reasons = (event: unknown) => validate(observation(event)).reasons;

describe("pure NFL historical result validation", () => {
  it("normalizes Denver–Kansas City 31–10 without depending on competitor array order", () => {
    const e = finalEvent();
    const out = validate({ ...observation(e), expectedIdentity: expected });
    expect(out.decision).toBe("ACCEPTED");
    expect(out.normalized).toMatchObject({ homeTeamId: "12", awayTeamId: "7",
      homeScore: 31, awayScore: 10, seasonPhase: "REGULAR_SEASON", kickoff: "2026-09-14T00:20:00.000Z" });
    expect(out.warehouseEvent).toMatchObject({ eligibility: "ELIGIBLE",
      completionTimeKind: "CONSERVATIVE_BOUND", completionTime: "2026-09-15T12:00:00.000Z" });
    e.competitions[0]!.competitors.reverse();
    expect(validate(observation(e)).normalized?.homeScore).toBe(31);
  });

  it("quarantines the synthetic Denver–KC 0–0 discrepancy without replacing scores", () => {
    const out = validate({ ...observation(finalEvent({ homeScore: "0", awayScore: "0" })),
      referenceFinal: { ...expected, homeScore: 31, awayScore: 10 } });
    expect(out.decision).toBe("QUARANTINED");
    expect(out.reasons).toEqual(expect.arrayContaining(["SUSPICIOUS_ZERO_ZERO_FINAL", "REFERENCE_SCORE_CONFLICT"]));
    expect(out.normalized?.homeScore).toBe(0);
    expect(out.warehouseEvent).toBeNull();
  });

  it.each([[31, 0], [0, 10], [17, 17]])("accepts legitimate shutout/tie %i–%i", (homeScore, awayScore) => {
    expect(validate(observation(finalEvent({ homeScore, awayScore }))).decision).toBe("ACCEPTED");
  });

  it.each([null, "", " ", "10.5", -1, 2.5, "NaN", Number.NaN, Number.POSITIVE_INFINITY, "1e2"])(
    "quarantines missing or invalid final score %s", value => {
      expect(validate(observation(finalEvent({ homeScore: value }))).decision).toBe("QUARANTINED");
    });

  it("does not coerce a missing score to a shutout", () => {
    const e = finalEvent();
    delete (e.competitions[0]!.competitors[0] as { score?: unknown }).score;
    expect(reasons(e)).toContain("MISSING_FINAL_SCORE");
  });

  it("detects the Seattle–New England discrepancy only against explicit reference evidence", () => {
    const e = seattleNewEnglandEvent();
    expect(validate(observation(e)).decision).toBe("ACCEPTED");
    const out = validate({ ...observation(e), referenceFinal: {
      eventId: "900000002", homeTeamId: "17", awayTeamId: "26", homeScore: 17, awayScore: 24,
    } });
    expect(out.reasons).toContain("REFERENCE_SCORE_CONFLICT");
    expect(out.decision).toBe("QUARANTINED");
  });

  it("does not apply a reference result for different teams or event", () => {
    const out = validate({ ...observation(seattleNewEnglandEvent()),
      referenceFinal: { ...expected, homeScore: 31, awayScore: 10 } });
    expect(out.reasons).toContain("REFERENCE_IDENTITY_MISMATCH");
  });

  it("rejects swapped Seattle/New England identities even when names look right", () => {
    const e = seattleNewEnglandEvent();
    expect(validate({ ...observation(e), expectedIdentity: {
      eventId: e.id, homeTeamId: "26", awayTeamId: "17",
    } }).reasons).toContain("EXPECTED_IDENTITY_MISMATCH");
  });

  it.each([[1, "PRESEASON_EXCLUDED"], [3, "POSTSEASON_EXCLUDED"]] as const)(
    "rejects phase %i from regular-season evidence", (seasonType, reason) => {
      const out = validate(observation(finalEvent({ seasonType })));
      expect(out.decision).toBe("REJECTED");
      expect(out.reasons).toContain(reason);
    });

  it("uses event season metadata, never month, schedule defaults, or the current clock", () => {
    expect(validate(observation(finalEvent({ date: "2026-08-20T17:00:00Z" }))).decision).toBe("ACCEPTED");
    expect(classifyNflSeason({ year: 2026, type: 1 }).phase).toBe("PRESEASON");
    const e = finalEvent();
    delete (e as { season?: unknown }).season;
    expect(reasons(e)).toContain("UNKNOWN_SEASON_PHASE");
    expect(reasons(e)).toContain("MISSING_SEASON_YEAR");
  });

  it("quarantines conflicting or unknown phase metadata", () => {
    expect(classifyNflSeason({ year: 2026, type: 2, slug: "preseason" }).conflict).toBe(true);
    expect(classifyNflSeason({ year: 2026, type: 99, slug: "regular-season" }).phase).toBe("UNKNOWN");
    const e = finalEvent();
    Object.assign(e.season, { slug: "preseason" });
    expect(reasons(e)).toContain("SEASON_PHASE_CONFLICT");
  });

  it.each(["constructor", "__proto__", "toString"])("does not treat inherited property %s as season metadata", type => {
    expect(classifyNflSeason({ year: 2026, type }).phase).toBe("UNKNOWN");
    expect(classifyNflSeason({ year: 2026, slug: type }).phase).toBe("UNKNOWN");
  });

  it("rejects scheduled, in-progress, postponed, and canceled observations", () => {
    for (const [state, name] of [["pre", "STATUS_SCHEDULED"], ["in", "STATUS_IN_PROGRESS"],
      ["post", "STATUS_POSTPONED"], ["post", "STATUS_CANCELED"]]) {
      const e = finalEvent();
      Object.assign(e.status.type, { state, name, completed: false });
      expect(validate(observation(e)).decision).toBe("REJECTED");
    }
  });

  it("quarantines inconsistent status flags and competition/event disagreement", () => {
    const e = finalEvent();
    e.status.type.state = "in";
    expect(reasons(e)).toContain("UNKNOWN_COMPLETION_STATUS");
    Object.assign(e.competitions[0]!, { status: { type: { completed: false, state: "in", name: "STATUS_IN_PROGRESS" } } });
    e.status.type.state = "post";
    expect(reasons(e)).toContain("STATUS_METADATA_CONFLICT");
  });

  it("detects contradictory winner flags", () => {
    const e = finalEvent();
    Object.assign(e.competitions[0]!.competitors[0]!, { winner: true });
    expect(reasons(e)).toContain("WINNER_SCORE_MISMATCH");
  });

  it("quarantines mismatched competition and competitor IDs", () => {
    const e = finalEvent();
    e.competitions[0]!.id = "900000099";
    e.competitions[0]!.competitors[0]!.id = "17";
    expect(reasons(e)).toEqual(expect.arrayContaining(["COMPETITION_EVENT_ID_MISMATCH", "COMPETITOR_TEAM_ID_MISMATCH"]));
  });

  it("quarantines ambiguous home/away, missing teams, same-team games, and multiple competitions", () => {
    const e = finalEvent(); e.competitions[0]!.competitors[0]!.homeAway = "home";
    expect(reasons(e)).toContain("HOME_AWAY_IDENTITY_INVALID");
    const same = finalEvent({ homeId: "7" });
    expect(reasons(same)).toContain("SAME_TEAM_BOTH_SIDES");
    const missing = finalEvent(); missing.competitions[0]!.competitors[0]!.team.id = "";
    expect(reasons(missing)).toContain("INVALID_TEAM_ID");
    const multiple = finalEvent(); multiple.competitions.push(structuredClone(multiple.competitions[0]!));
    expect(reasons(multiple)).toContain("COMPETITION_COUNT_INVALID");
  });

  it.each(["2026-02-30T00:00:00Z", "2026-09-14", "2026-09-14T24:00:00Z", "2026-09-14T00:20:00"])(
    "rejects ambiguous or rolled-over kickoff %s", date => {
      expect(reasons(finalEvent({ date }))).toContain("INVALID_KICKOFF");
    });

  it("normalizes equivalent timezone instants and numeric provider IDs", () => {
    expect(timestamp("2026-09-13T20:20:00-04:00")).toBe("2026-09-14T00:20:00.000Z");
    expect(providerId(12)).toBe("12");
    expect(providerId(" 12 ")).toBe("12");
    expect(providerId("1e2")).toBeNull();
  });

  it("does not accept a final observed before kickoff or missing retrieval evidence", () => {
    expect(validate({ event: finalEvent(), observedAt: "2026-09-13T00:00:00Z" }).reasons).toContain("FINAL_OBSERVED_BEFORE_KICKOFF");
    expect(validate({ event: finalEvent(), observedAt: "" }).reasons).toContain("INVALID_OBSERVED_AT");
  });

  it("quarantines kickoff identity conflicts", () => {
    const e = finalEvent(); e.competitions[0]!.date = "2026-09-14T01:20:00Z";
    expect(reasons(e)).toContain("KICKOFF_METADATA_CONFLICT");
  });

  it("rejects malformed input without mutating callers", () => {
    expect(validate(observation(null)).decision).toBe("REJECTED");
    const e = finalEvent(), before = structuredClone(e);
    const a = validate(observation(e)), b = validate(observation(e));
    expect(a).toEqual(b); expect(e).toEqual(before);
  });

  it("deduplicates repeated results and retains earliest known final observation", () => {
    const e = finalEvent();
    const later = observation(e), earlier = { event: structuredClone(e), observedAt: "2026-09-14T05:00:00Z" };
    const out = batch([later, earlier]);
    expect(out.map(x => x.decision)).toEqual(["REJECTED", "ACCEPTED"]);
    expect(out[0]!.reasons).toEqual(["DUPLICATE_OBSERVATION"]);
    expect(batch([earlier, later]).map(x => x.decision)).toEqual(["ACCEPTED", "REJECTED"]);
  });

  it("quarantines every conflicting final, never first-wins or last-wins", () => {
    const a = observation(finalEvent()), b = observation(finalEvent({ homeScore: "0", awayScore: "0" }));
    for (const pair of [[a, b], [b, a]]) {
      const out = batch(pair);
      expect(out.every(x => x.decision === "QUARANTINED" && x.warehouseEvent === null)).toBe(true);
      expect(out.every(x => x.reasons.includes("CONFLICTING_FINAL_SCORES"))).toBe(true);
    }
  });

  it("quarantines event-ID reuse across incompatible teams or kickoffs", () => {
    const out = batch([observation(finalEvent()), observation(finalEvent({ homeId: "17", date: "2026-09-14T01:20:00Z" }))]);
    expect(out.every(x => x.reasons.includes("CONFLICTING_EVENT_IDENTITY"))).toBe(true);
  });

  it("quarantines different provider IDs claiming the exact same fixture", () => {
    const out = batch([observation(finalEvent()), observation(finalEvent({ id: "900000099" }))]);
    expect(out.every(x => x.decision === "QUARANTINED" && x.reasons.includes("FIXTURE_EVENT_ID_COLLISION"))).toBe(true);
    expect(out.every(x => x.warehouseEvent === null)).toBe(true);
  });

  it("keeps genuinely separate fixtures for the same teams", () => {
    const out = batch([observation(finalEvent()), {
      event: finalEvent({ id: "900000099", date: "2026-10-14T00:20:00Z" }),
      observedAt: "2026-10-15T12:00:00Z",
    }]);
    expect(out.every(x => x.decision === "ACCEPTED")).toBe(true);
  });

  it("does not infer an absent fixture or invent its score", () => {
    expect(batch([])).toEqual([]);
  });
});
