import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, insert, onConflictDoNothing } = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  onConflictDoNothing: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: { select, insert },
  dailyFreePicksTable: { easternDate: "date", publishedPickId: "pickId" },
  publishedPicksTable: { id: "id", gameId: "gameId", predictionId: "predictionId", market: "market", selection: "selection", isEffective: "effective", isPublic: "public", isPlayOfDay: "pod", recommendation: "recommendation", publicationStatus: "publicationStatus", approvedUnits: "approvedUnits" },
  modelPredictionsTable: { id: "predictionId", modelVersionId: "modelVersionId", cohort: "cohort", isChallenger: "isChallenger" },
  modelVersionsTable: { id: "modelVersionId", status: "modelStatus" },
  gamesTable: { id: "gameId", gameDate: "gameDate", status: "status", finalModelScore: "final", modelScore: "model" },
}));

import { getDailyFreePick } from "./freePick";

function query(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "orderBy"]) chain[method] = vi.fn(() => chain);
  chain["limit"] = vi.fn(async () => rows);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockReturnValue({ values: vi.fn(() => ({ onConflictDoNothing })) });
});

describe("getDailyFreePick", () => {
  it("reuses an eligible persisted selection", async () => {
    select.mockReturnValueOnce(query([{ publishedPickId: 7 }])).mockReturnValueOnce(query([{ publishedPickId: 7, gameId: "g7", market: "moneyline", selection: "home" }]));
    await expect(getDailyFreePick("2026-03-10")).resolves.toEqual({ publishedPickId: 7, gameId: "g7", market: "moneyline", selection: "home" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns the exact allowlisted free-card identity without model fields", async () => {
    const dto = {
      publishedPickId: 7, gameId: "g7", sport: "NFL", awayTeamName: "Away", awayTeamAbbr: "AWY", awayTeamLogo: null,
      homeTeamName: "Home", homeTeamAbbr: "HME", homeTeamLogo: null, gameDate: "2026-03-10", startTime: "8:00 PM",
      status: "upcoming", market: "moneyline", selection: "home", recommendation: "Buy",
    };
    select.mockReturnValueOnce(query([{ publishedPickId: 7 }])).mockReturnValueOnce(query([dto]));
    const result = await getDailyFreePick("2026-03-10");
    expect(result).toMatchObject({ publishedPickId: 7, market: "moneyline", selection: "home", recommendation: "Buy" });
    for (const protectedField of ["edge", "expectedValue", "units", "confidence", "modelScore", "finalModelScore", "podScore", "spreadMarket", "moneylineMarket"]) {
      expect(result).not.toHaveProperty(protectedField);
    }
  });

  it("returns null when no eligible non-Top-Pick candidate exists", async () => {
    select.mockReturnValueOnce(query([])).mockReturnValueOnce(query([]));
    await expect(getDailyFreePick("2026-03-10")).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("persists the highest-ranked eligible candidate rather than a Top Pick", async () => {
    select
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ publishedPickId: 12, gameId: "highest-non-pod", market: "moneyline", selection: "home" }]))
      .mockReturnValueOnce(query([{ publishedPickId: 12 }]))
      .mockReturnValueOnce(query([{ publishedPickId: 12, gameId: "highest-non-pod", market: "moneyline", selection: "home" }]));
    await expect(getDailyFreePick("2026-03-10")).resolves.toEqual({ publishedPickId: 12, gameId: "highest-non-pod", market: "moneyline", selection: "home" });
    expect(insert).toHaveBeenCalledOnce();
  });

  it("fails closed when the persisted row is no longer eligible", async () => {
    select.mockReturnValueOnce(query([{ publishedPickId: 7 }])).mockReturnValueOnce(query([]));
    await expect(getDailyFreePick("2026-03-10")).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns the persisted winner after a concurrent insert conflict", async () => {
    select
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ publishedPickId: 12, gameId: "candidate", market: "moneyline", selection: "home" }]))
      .mockReturnValueOnce(query([{ publishedPickId: 44 }]))
      .mockReturnValueOnce(query([{ publishedPickId: 44, gameId: "winner", market: "moneyline", selection: "home" }]));
    await expect(getDailyFreePick("2026-03-10")).resolves.toEqual({ publishedPickId: 44, gameId: "winner", market: "moneyline", selection: "home" });
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
  });
});