import { describe, expect, it } from "vitest";
import {
  APPROVED_STAKE_UNITS,
  decideDownstreamPublication,
  easternDateForPublication,
  FAIL_CLOSED_STAKE_POLICY_VERSION,
  selectedSideEdgePercentagePoints,
  type DownstreamPublicationCandidate,
} from "./downstreamPublicationPolicy";

const candidate = (id: string, overrides: Partial<DownstreamPublicationCandidate> = {}): DownstreamPublicationCandidate => ({
  id, recommendation: "Buy", requestedUnits: 2.5,
  productionModelApproved: true, performanceEligible: true,
  market: "moneyline", selection: "home", odds: -110,
  modelProbability: 0.55, marketProbability: 0.52,
  gameStart: "2026-07-02T23:00:00.000Z", selectedSideEdge: 3,
  finalRating: 70, podScore: 40, ...overrides,
});
const now = new Date("2026-07-02T04:30:00.000Z");

describe("downstream publication policy", () => {
  it("uses Eastern calendar dates, including the UTC date boundary", () => {
    expect(easternDateForPublication(now)).toBe("2026-07-02");
    expect(easternDateForPublication(new Date("2026-07-02T03:30:00.000Z"))).toBe("2026-07-01");
  });

  it("requires a positive edge for the selected side rather than absolute edge", () => {
    const slate = decideDownstreamPublication([
      candidate("negative", { selectedSideEdge: -8 }),
      candidate("positive", { selectedSideEdge: 1 }),
    ], now);
    expect(slate.decisions.map(({ candidateId, status, isPublic }) => ({ candidateId, status, isPublic }))).toEqual([
      { candidateId: "negative", status: "SAFETY_BLOCKED", isPublic: false },
      { candidateId: "positive", status: "PUBLISHED", isPublic: true },
    ]);
  });

  it("fails closed on market and production gates and preserves stake provenance", () => {
    const [decision] = decideDownstreamPublication([
      candidate("blocked", { odds: null, productionModelApproved: false }),
    ], now).decisions;
    expect(decision).toMatchObject({
      status: "SAFETY_BLOCKED", approvedStakeUnits: 0, requestedUnits: 2.5,
      stakePolicyVersion: FAIL_CLOSED_STAKE_POLICY_VERSION,
      reason: "MODEL_NOT_PRODUCTION_APPROVED",
    });
  });

  it("ranks before applying the top-six cap and selects POTD only from public eligible picks", () => {
    const slate = decideDownstreamPublication([
      ...Array.from({ length: 7 }, (_, index) => candidate(`id-${index + 1}`, {
        finalRating: 80 - index, podScore: 50 - index, selectedSideEdge: 7 - index,
      })),
      candidate("invalid-high", { finalRating: 99, selectedSideEdge: -10 }),
    ], now);
    const publicPicks = slate.decisions.filter((decision) => decision.isPublic);
    expect(publicPicks).toHaveLength(6);
    expect(slate.decisions.find((x) => x.candidateId === "id-7")).toMatchObject({
      status: "CAP_EXCLUDED", reason: "CAP_EXCLUDED", eligibleRank: 7, isPlayOfTheDay: false,
    });
    expect(slate.decisions.find((x) => x.candidateId === "id-1")).toMatchObject({
      isPlayOfTheDay: true, approvedStakeUnits: APPROVED_STAKE_UNITS, requestedUnits: 2.5,
    });
    expect(slate.decisions.find((x) => x.candidateId === "invalid-high")?.isPlayOfTheDay).toBe(false);
  });

  it("normalizes away selected-side edge without using the home-edge absolute value", () => {
    expect(selectedSideEdgePercentagePoints(0.61, 0.56)).toBeCloseTo(5);
    expect(selectedSideEdgePercentagePoints(0.44, 0.48)).toBeCloseTo(-4);
  });

  it.each([
    [{ odds: 0 }, "INVALID_ODDS"],
    [{ modelProbability: 1.2 }, "INVALID_MODEL_PROBABILITY"],
    [{ marketProbability: 0 }, "INVALID_MARKET_PROBABILITY"],
    [{ gameStart: "2026-07-02T04:29:59.000Z" }, "GAME_STARTED"],
    [{ market: "spread" }, "INVALID_MARKET_IDENTITY"],
    [{ selection: "draw" }, "INVALID_SELECTION_IDENTITY"],
  ] as const)("fails closed for invalid market boundary %j", (override, reason) => {
    expect(decideDownstreamPublication([candidate("invalid", override)], now).decisions[0]).toMatchObject({
      status: "SAFETY_BLOCKED", reason, isPublic: false, approvedStakeUnits: 0,
    });
  });

  it("is deterministic across processing order, including stable-id ties", () => {
    const inputs = [candidate("20"), candidate("3"), candidate("a", { finalRating: 71 })];
    const first = decideDownstreamPublication(inputs, now).decisions
      .slice().sort((a, b) => String(a.candidateId).localeCompare(String(b.candidateId)));
    const second = decideDownstreamPublication(inputs.slice().reverse(), now).decisions
      .slice().sort((a, b) => String(a.candidateId).localeCompare(String(b.candidateId)));
    expect(second).toEqual(first);
    expect(first.find((x) => x.candidateId === "3")?.eligibleRank).toBe(2);
    expect(first.find((x) => x.candidateId === "20")?.eligibleRank).toBe(3);
  });

  it("recomputes a complete sequential pool so a later sport displaces the prior sixth pick", () => {
    const firstBatch = Array.from({ length: 6 }, (_, index) => candidate(`MLB-${index + 1}`, {
      finalRating: 70 - index,
      podScore: 40 - index,
    }));
    const laterBatch = [
      candidate("NFL-best", { finalRating: 90, podScore: 80 }),
      candidate("Soccer-low", { finalRating: 10, podScore: 10 }),
    ];

    const first = decideDownstreamPublication(firstBatch, now);
    expect(first.decisions.filter((decision) => decision.isPublic)).toHaveLength(6);

    const combined = decideDownstreamPublication([...firstBatch, ...laterBatch], now);
    const reordered = decideDownstreamPublication([...laterBatch].reverse().concat(firstBatch.slice().reverse()), now);
    const publicIds = (slate: typeof combined) => slate.decisions
      .filter((decision) => decision.isPublic)
      .map((decision) => String(decision.candidateId))
      .sort();
    expect(publicIds(combined)).toEqual(publicIds(reordered));
    expect(publicIds(combined)).toContain("NFL-best");
    expect(publicIds(combined)).not.toContain("MLB-6");
    expect(new Set(combined.decisions.flatMap((decision) =>
      decision.eligibleRank == null ? [] : [decision.eligibleRank],
    )).size).toBe(8);
    expect(combined.decisions.filter((decision) => decision.isPlayOfTheDay)).toHaveLength(1);
  });

  it("keeps one stable rank sequence independent of historical locked rank values", () => {
    const candidates = [
      candidate("locked-old-rank-6", { finalRating: 98 }),
      candidate("upcoming-a", { finalRating: 95 }),
      candidate("locked-old-rank-1", { finalRating: 92 }),
      candidate("upcoming-b", { finalRating: 89 }),
      candidate("locked-old-rank-3", { finalRating: 86 }),
      candidate("upcoming-c", { finalRating: 83 }),
      candidate("upcoming-d", { finalRating: 80 }),
    ];
    const ranks = decideDownstreamPublication(candidates, now).decisions
      .map((decision) => decision.eligibleRank);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});