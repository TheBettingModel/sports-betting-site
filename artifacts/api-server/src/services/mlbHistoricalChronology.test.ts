import { describe, expect, it } from "vitest";
import {
  canPriorGameInfluenceTarget,
  parseHistoricalMlbCompletionFeed,
  type ChronologyGame,
} from "./mlbHistoricalChronology";

function feed(options: {
  status?: string;
  code?: string;
  detailed?: string;
  firstStart?: string | null;
  lastStart?: string | null;
  lastEnd?: string | null;
  lastComplete?: boolean;
  gameEndDate?: string | null;
  inning?: number;
  resumeDate?: string | null;
} = {}) {
  const firstStart = options.firstStart === undefined ? "2024-07-04T17:10:12.100Z" : options.firstStart;
  const lastStart = options.lastStart === undefined ? "2024-07-04T20:44:03.010Z" : options.lastStart;
  const lastEnd = options.lastEnd === undefined ? "2024-07-04T20:45:11.345Z" : options.lastEnd;
  const allPlays = firstStart === null ? [] : [
    {
      about: {
        atBatIndex: 0,
        inning: 1,
        halfInning: "top",
        startTime: firstStart,
        endTime: "2024-07-04T17:12:01.000Z",
        isComplete: true,
      },
      result: { eventType: "field_out", awayScore: 0, homeScore: 0 },
    },
    {
      about: {
        atBatIndex: 76,
        inning: options.inning ?? 9,
        halfInning: "bottom",
        startTime: lastStart,
        endTime: lastEnd,
        isComplete: options.lastComplete ?? true,
      },
      result: { eventType: "field_out", awayScore: 2, homeScore: 4 },
    },
  ];
  return {
    gameData: {
      status: {
        abstractGameState: options.status ?? "Final",
        codedGameState: options.code ?? "F",
        detailedState: options.detailed ?? "Final",
      },
      datetime: {
        dateTime: "2024-07-04T17:10:00Z",
        officialDate: "2024-07-04",
        gameEndDate: options.gameEndDate,
        resumeDate: options.resumeDate,
      },
    },
    liveData: {
      linescore: { currentInning: options.inning ?? 9, scheduledInnings: 9 },
      plays: { allPlays },
    },
  };
}

function parse(payload: unknown) {
  return parseHistoricalMlbCompletionFeed(payload, {
    canonicalGameId: "mlbstats:746043",
    providerGameId: "746043",
    scheduledStartTime: "2024-07-04T17:10:00Z",
    retrievedAt: "2026-09-04T12:00:00Z",
  });
}

function chronology(
  id: string,
  completion: string | null,
  cutoff: string | null,
  overrides: Partial<ChronologyGame> = {},
): ChronologyGame {
  return {
    canonicalGameId: id,
    providerGameId: id,
    finalStatus: true,
    quarantined: false,
    canonicalCompletionTime: completion,
    featureCutoff: cutoff,
    ...overrides,
  };
}

describe("historical MLB completion chronology", () => {
  it("derives completion only from final status plus a complete terminal play", () => {
    const result = parse(feed());
    expect(result.completionTimeConfidence).toBe("HIGH_CONFIDENCE_DERIVED");
    expect(result.completionTimeMethod).toBe("OFFICIAL_FINAL_STATUS_PLUS_TERMINAL_PLAY_END");
    expect(result.canonicalCompletionTime).toBe("2024-07-04T20:45:11.345Z");
    expect(result.featureCutoff).toBe("2024-07-04T17:10:12.099Z");
    expect(result.quarantineReason).toBeNull();
  });

  it("prefers an explicit official game-end timestamp", () => {
    const result = parse(feed({ gameEndDate: "2024-07-04T20:46:00.000Z" }));
    expect(result.completionTimeConfidence).toBe("AUTHORITATIVE");
    expect(result.completionTimeSource).toBe("GAME_END_TIME");
    expect(result.canonicalCompletionTime).toBe("2024-07-04T20:46:00.000Z");
  });

  it("requires strict completion-before-cutoff and rejects equality", () => {
    const prior = chronology("prior", "2024-07-04T20:45:11.345Z", null);
    expect(canPriorGameInfluenceTarget(
      prior,
      chronology("later", null, "2024-07-04T20:45:11.346Z"),
    )).toEqual({ eligible: true, reason: "ELIGIBLE_COMPLETED_BEFORE_CUTOFF" });
    expect(canPriorGameInfluenceTarget(
      prior,
      chronology("equal", null, "2024-07-04T20:45:11.345Z"),
    )).toEqual({ eligible: false, reason: "COMPLETION_NOT_BEFORE_CUTOFF" });
  });

  it("uses timestamps—not doubleheader labels—for same-day ordering", () => {
    const gameOne = chronology("game-1", "2024-07-14T20:00:00.000Z", null);
    const gameTwo = chronology("game-2", null, "2024-07-14T19:59:59.999Z");
    expect(canPriorGameInfluenceTarget(gameOne, gameTwo).eligible).toBe(false);
    gameTwo.featureCutoff = "2024-07-14T20:30:00.000Z";
    expect(canPriorGameInfluenceTarget(gameOne, gameTwo).eligible).toBe(true);
  });

  it("does not treat suspended or postponed status as final completion", () => {
    expect(parse(feed({ status: "Live", code: "I", detailed: "Suspended" })).quarantineReason)
      .toBe("FINAL_STATUS_NOT_PROVEN");
    const postponed = parse(feed({ code: "D", detailed: "Postponed" }));
    expect(postponed.postponed).toBe(true);
    expect(postponed.canonicalCompletionTime).toBeNull();
  });

  it("quarantines rain-shortened advisory endings but accepts a completed resumed game", () => {
    const rainShortened = parse(feed({
      detailed: "Completed Early: Rain",
      lastComplete: false,
    }));
    expect(rainShortened.gameStatus).toBe("Completed Early: Rain");
    expect(rainShortened.canonicalCompletionTime).toBeNull();
    expect(rainShortened.quarantineReason).toBe("TERMINAL_PLAY_INCOMPLETE");

    const resumedFinal = parse(feed({
      detailed: "Final",
      resumeDate: "2024-07-05T17:00:00.000Z",
    }));
    expect(resumedFinal.resumed).toBe(true);
    expect(resumedFinal.completionTimeConfidence).toBe("HIGH_CONFIDENCE_DERIVED");
    expect(resumedFinal.quarantineReason).toBeNull();
  });

  it("uses the terminal event for extra innings without estimating duration", () => {
    const result = parse(feed({
      inning: 12,
      lastStart: "2024-07-05T00:01:00.000Z",
      lastEnd: "2024-07-05T00:02:03.456Z",
    }));
    expect(result.inningsPlayed).toBe(12);
    expect(result.canonicalCompletionTime).toBe("2024-07-05T00:02:03.456Z");
    expect(result.crossedMidnightUtc).toBe(true);
  });

  it("keeps missing terminal event and first-play timestamps unresolved", () => {
    const noPlay = parse(feed({ firstStart: null }));
    expect(noPlay.canonicalCompletionTime).toBeNull();
    expect(noPlay.featureCutoff).toBeNull();
    expect(noPlay.quarantineReason).toBe("TERMINAL_PLAY_INCOMPLETE");
  });

  it("does not use incomplete terminal plays", () => {
    const result = parse(feed({ lastComplete: false }));
    expect(result.canonicalCompletionTime).toBeNull();
    expect(result.quarantineReason).toBe("TERMINAL_PLAY_INCOMPLETE");
  });

  it("never substitutes provider retrieval time for historical completion", () => {
    const result = parse(feed({ lastEnd: null, lastComplete: false }));
    expect(result.providerFinalSeenAt).toBe("2026-09-04T12:00:00Z");
    expect(result.canonicalCompletionTime).toBeNull();
    expect(result.canonicalCompletionTime).not.toBe(result.providerFinalSeenAt);
  });

  it("rejects target outcomes, unresolved cutoffs, and later completions", () => {
    const target = chronology("target", null, "2024-07-04T17:10:12.099Z");
    expect(canPriorGameInfluenceTarget(target, target).reason).toBe("IDENTITY_MISMATCH");
    expect(canPriorGameInfluenceTarget(
      chronology("prior", "2024-07-04T16:00:00Z", null),
      chronology("unresolved", null, null),
    ).reason).toBe("TARGET_CUTOFF_UNRESOLVED");
    expect(canPriorGameInfluenceTarget(
      chronology("later", "2024-07-04T18:00:00Z", null),
      target,
    ).reason).toBe("COMPLETION_NOT_BEFORE_CUTOFF");
  });

  it("does not admit quarantined or non-final prior games", () => {
    const target = chronology("target", null, "2024-07-04T19:00:00Z");
    expect(canPriorGameInfluenceTarget(
      chronology("bad", "2024-07-04T18:00:00Z", null, { quarantined: true }),
      target,
    ).reason).toBe("PRIOR_QUARANTINED");
    expect(canPriorGameInfluenceTarget(
      chronology("live", "2024-07-04T18:00:00Z", null, { finalStatus: false }),
      target,
    ).reason).toBe("PRIOR_NOT_FINAL");
  });
});