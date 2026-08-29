import { describe, expect, it } from "vitest";
import {
  assertNcaafFeatureCutoff,
  computeNcaafFeatures,
  ncaafFeatureInputHash,
  NCAAF_FEATURE_CONFIG,
  type NcaafEntityEvidence,
  type NcaafEvidenceGame,
  type NcaafFeatureTarget,
} from "./ncaafFeatures";

const cutoff = new Date("2025-09-20T12:00:00Z");
const target: NcaafFeatureTarget = {
  provider: "espn",
  eventId: "target",
  season: 2025,
  kickoffAt: cutoff,
  homeTeamId: "A",
  awayTeamId: "B",
  homeTeamName: "Alpha",
  awayTeamName: "Beta",
};

function game(
  id: number,
  season: number,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  date: string,
  overrides: Partial<NcaafEvidenceGame> = {},
): NcaafEvidenceGame {
  return {
    id,
    payloadHash: `hash-${id}`,
    provider: "espn",
    providerEventId: `g${id}`,
    season,
    homeProviderTeamId: home,
    awayProviderTeamId: away,
    homeTeamName: home,
    awayTeamName: away,
    homeScore,
    awayScore,
    kickoffAt: new Date(date),
    modeledAsOf: new Date(date),
    capturedAt: new Date(date),
    gameStatus: "final",
    neutralSite: false,
    ...overrides,
  };
}

describe("market-free NCAAF features", () => {
  it("blocks missing and one-sided independent evidence", () => {
    const missing = computeNcaafFeatures(target, [], [], cutoff);
    expect(missing.forecast.status).toBe("blocked");
    const oneSided = computeNcaafFeatures(target, [
      game(1, 2025, "A", "X", 28, 7, "2025-09-01T00:00:00Z"),
      game(2, 2025, "A", "Y", 21, 14, "2025-09-08T00:00:00Z"),
    ], [], cutoff);
    expect(oneSided.quality.blockedReasons).toContain("insufficient_away_independent_evidence");
  });

  it("uses a full previous-season prior before the first game", () => {
    const rows = [
      game(1, 2024, "A", "X", 30, 10, "2024-09-01T00:00:00Z"),
      game(2, 2024, "A", "Y", 27, 14, "2024-09-08T00:00:00Z"),
      game(3, 2024, "A", "Z", 24, 17, "2024-09-15T00:00:00Z"),
      game(4, 2024, "B", "X", 14, 21, "2024-09-22T00:00:00Z"),
      game(5, 2024, "B", "Y", 17, 20, "2024-09-29T00:00:00Z"),
      game(6, 2024, "B", "Z", 10, 13, "2024-10-06T00:00:00Z"),
    ];
    const snapshot = computeNcaafFeatures(target, rows, [], cutoff);
    expect(snapshot.teams.home.currentWeight).toBe(0);
    expect(snapshot.teams.home.priorWeight).toBe(1);
    expect(snapshot.forecast.status).toBe("ready");
  });

  it("documents and applies the deterministic midseason blend", () => {
    const rows = [
      game(1, 2024, "A", "X", 20, 10, "2024-09-01T00:00:00Z"),
      game(2, 2025, "A", "X", 30, 10, "2025-09-01T00:00:00Z"),
      game(3, 2025, "A", "Y", 24, 10, "2025-09-08T00:00:00Z"),
    ];
    const snapshot = computeNcaafFeatures(target, rows, [], cutoff);
    expect(snapshot.teams.home.currentWeight + snapshot.teams.home.priorWeight).toBeCloseTo(1, 3);
    expect(snapshot.teams.home.currentWeight).toBeGreaterThan(2 / 6);
    expect(snapshot.methodology.decay).toContain("half-life=28");
  });

  it("keeps transfers, roster identity, and QB uncertainty typed null", () => {
    const entity: NcaafEntityEvidence = {
      id: 50,
      payloadHash: "entity-hash",
      provider: "espn",
      providerEntityId: "A",
      entityType: "player",
      observationType: "player",
      capturedAt: new Date("2025-09-10T00:00:00Z"),
      modeledAsOf: new Date("2025-09-10T00:00:00Z"),
      missingFields: ["players", "starter_probability"],
      missingReasons: {
        players: "ESPN did not provide historical players",
        starter_probability: "No historical starter provider",
      },
    };
    const snapshot = computeNcaafFeatures(target, [], [entity], cutoff);
    expect(snapshot.teams.home.unsupported.transfers.value).toBeNull();
    expect(snapshot.teams.home.unsupported.transfers.missingReason).toMatch(/provider/);
    expect(snapshot.teams.home.unsupported.quarterback.value).toBeNull();
    expect(snapshot.teams.home.unsupported.quarterback.provider).toBe("espn");
    expect(snapshot.teams.home.unsupported.quarterback.evidence).toEqual({
      id: 50,
      payloadHash: "entity-hash",
    });
    expect(snapshot.teams.away.unsupported.quarterback.evidence).toBeNull();
  });

  it("strictly excludes post-cutoff observations and all market keys", () => {
    const rows = [
      game(1, 2025, "A", "X", 100, 0, "2025-09-01T00:00:00Z", {
        modeledAsOf: new Date("2025-09-21T00:00:00Z"),
      }),
    ];
    const snapshot = computeNcaafFeatures(target, rows, [], cutoff);
    expect(snapshot.quality.evidenceCount).toBe(0);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/moneyline|sportsbook|marketKey|odds/i);
    expect(snapshot.forecast.projectedTotal).toBeNull();
    expect(snapshot.forecast.projectedTotalMissingReason).toMatch(/pace/);
  });

  it("is deterministic for identical evidence and isolated from non-NCAAF data", () => {
    const rows = [game(1, 2025, "A", "X", 21, 7, "2025-09-01T00:00:00Z")];
    expect(computeNcaafFeatures(target, rows, [], cutoff))
      .toEqual(computeNcaafFeatures(target, rows, [], cutoff));
    expect(computeNcaafFeatures(target, rows, [], cutoff).schemaVersion).toBe("ncaaf-features-v1");
  });

  it("decays previous-season strength and effective sample through the offseason", () => {
    const rows = [
      game(1, 2024, "A", "X", 35, 7, "2024-09-01T00:00:00Z"),
      game(2, 2024, "A", "Y", 28, 7, "2024-09-08T00:00:00Z"),
      game(3, 2024, "A", "Z", 24, 3, "2024-09-15T00:00:00Z"),
    ];
    const early = computeNcaafFeatures(
      { ...target, kickoffAt: new Date("2025-08-01T00:00:00Z") },
      rows,
      [],
      new Date("2025-08-01T00:00:00Z"),
    );
    const late = computeNcaafFeatures(target, rows, [], cutoff);
    expect(late.teams.home.previousSeasonDecay).toBeLessThan(early.teams.home.previousSeasonDecay);
    expect(late.teams.home.effectiveSampleSize).toBeLessThan(early.teams.home.effectiveSampleSize);
    expect(NCAAF_FEATURE_CONFIG.previousSeasonHalfLifeDays).toBe(365);
  });

  it("hashes selected entity IDs and payload hashes", () => {
    const base: NcaafEntityEvidence = {
      id: 1,
      payloadHash: "entity-a",
      provider: "espn",
      providerEntityId: "A",
      entityType: "roster",
      observationType: "roster",
      capturedAt: new Date("2025-09-10T00:00:00Z"),
      modeledAsOf: new Date("2025-09-10T00:00:00Z"),
      missingFields: ["roster"],
      missingReasons: { roster: "unsupported" },
    };
    expect(ncaafFeatureInputHash(target, [], [base], cutoff))
      .not.toBe(ncaafFeatureInputHash(target, [], [{ ...base, id: 2, payloadHash: "entity-b" }], cutoff));
  });

  it("rejects a cutoff at or after kickoff", () => {
    expect(() => assertNcaafFeatureCutoff(cutoff, cutoff)).toThrow(/strictly before/);
    expect(() => assertNcaafFeatureCutoff(new Date(cutoff.getTime() + 1), cutoff)).toThrow();
  });

  it("excludes the target event and unmapped name-only evidence", () => {
    const rows = [
      game(1, 2025, "A", "B", 70, 0, "2025-09-01T00:00:00Z", { providerEventId: "target" }),
      game(2, 2025, "A", "X", 40, 0, "2025-09-02T00:00:00Z", {
        homeProviderTeamId: null,
        homeTeamName: "Alpha",
      }),
    ];
    const snapshot = computeNcaafFeatures(target, rows, [], cutoff);
    expect(snapshot.teams.home.currentGames).toBe(0);
    expect(snapshot.forecast.status).toBe("blocked");
  });

  it("provider-qualifies event IDs, team IDs, and entity observations", () => {
    const collisions = [
      game(1, 2025, "A", "X", 70, 0, "2025-09-01T00:00:00Z", { provider: "other" }),
      game(2, 2025, "A", "Y", 70, 0, "2025-09-02T00:00:00Z", {
        provider: "other",
        providerEventId: "target",
      }),
    ];
    const otherEntity: NcaafEntityEvidence = {
      id: 90,
      payloadHash: "other-entity",
      provider: "other",
      providerEntityId: "A",
      entityType: "player",
      observationType: "player",
      capturedAt: new Date("2025-09-10T00:00:00Z"),
      modeledAsOf: new Date("2025-09-10T00:00:00Z"),
      missingFields: ["players"],
      missingReasons: { players: "other provider reason" },
    };
    const snapshot = computeNcaafFeatures(target, collisions, [otherEntity], cutoff);
    expect(snapshot.teams.home.currentGames).toBe(0);
    expect(snapshot.quality.gameEvidence).toEqual([]);
    expect(snapshot.quality.entityEvidence).toEqual([]);
    expect(snapshot.teams.home.unsupported.quarterback.provider).toBeNull();
  });

  it("blends prior exactly once using its visible decayed pseudo-count weight", () => {
    const priorRows = [
      game(1, 2024, "A", "X", 30, 10, "2024-09-01T00:00:00Z"),
      game(2, 2024, "A", "Y", 24, 10, "2024-09-08T00:00:00Z"),
    ];
    const currentRows = [
      game(3, 2025, "A", "X", 10, 20, "2025-09-01T00:00:00Z"),
      game(4, 2025, "A", "Y", 14, 20, "2025-09-08T00:00:00Z"),
    ];
    const priorOnly = computeNcaafFeatures(target, priorRows, [], cutoff).teams.home;
    const currentOnly = computeNcaafFeatures(target, currentRows, [], cutoff).teams.home;
    const blended = computeNcaafFeatures(target, [...priorRows, ...currentRows], [], cutoff).teams.home;
    const expected = currentOnly.overall! * blended.currentWeight
      + priorOnly.overall! * blended.priorWeight;
    expect(blended.overall).toBeCloseTo(expected, 3);
    expect(blended.currentWeight + blended.priorWeight).toBeCloseTo(1, 3);
    expect(priorOnly.overall).toBe(priorOnly.previousSeasonPrior.overall);
  });
});