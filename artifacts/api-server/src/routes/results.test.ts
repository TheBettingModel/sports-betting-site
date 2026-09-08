import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Application } from "express";
import request from "supertest";

type ResultRow = {
  pickId: number;
  sport: string;
  market: string;
  selection: string;
  odds: number;
  units: number;
  recommendation: string;
  result: string;
  unitsWonLost: number | null;
  unitsRisked: number | null;
  gradedAt: Date;
  awayTeamAbbr: string;
  homeTeamAbbr: string;
  awayScore: number;
  homeScore: number;
  gameDate: string;
  gameSport: string;
  isEffective: boolean;
  isPublic: boolean;
  cohort: string | null;
  isChallenger: boolean;
  modelStatus: string;
  performanceEligible: boolean;
  predictionId: number;
  modelVersionId: number;
  modelId: string;
  publicationReasonCode: string | null;
  featureSnapshot: Record<string, unknown> | null;
  v4MappedModelVersionId: number | null;
};

const { select } = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("../middleware/requireSubscriber", () => ({
  rejectInvalidToken: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn() },
}));
vi.mock("@workspace/db", () => ({
  db: { select },
  pickResultsTable: {
    pickId: "pickId", result: "result", unitsWonLost: "unitsWonLost",
    unitsRisked: "unitsRisked", gradedAt: "gradedAt",
  },
  publishedPicksTable: {
    id: "pickId", sport: "sport", market: "market", selection: "selection",
    odds: "odds", units: "units", recommendation: "recommendation",
    gameId: "gameId", isEffective: "isEffective", isPublic: "isPublic",
    predictionId: "predictionId", publicationReasonCode: "publicationReasonCode",
  },
  modelPredictionsTable: {
    id: "predictionId", modelVersionId: "modelVersionId", cohort: "cohort",
    isChallenger: "isChallenger", featureSnapshot: "featureSnapshot",
  },
  modelVersionsTable: {
    id: "modelVersionId", modelId: "modelId", status: "modelStatus",
  },
  v4ArtifactModelVersionMappingsTable: {
    modelVersionId: "v4MappedModelVersionId",
  },
  publishedPickPerformanceClassificationsTable: {
    id: "classificationId", publishedPickId: "classifiedPickId",
    performanceEligible: "performanceEligible",
  },
  gamesTable: {
    id: "gameId", awayTeamAbbr: "awayTeamAbbr", homeTeamAbbr: "homeTeamAbbr",
    awayScore: "awayScore", homeScore: "homeScore", gameDate: "gameDate",
    sport: "gameSport",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown) => ({ op: "eq", column, value }),
  ne: (column: string, value: unknown) => ({ op: "ne", column, value }),
  gte: (column: string, value: unknown) => ({ op: "gte", column, value }),
  inArray: (column: string, values: unknown[]) => ({ op: "in", column, values }),
  isNull: (column: string) => ({ op: "isNull", column }),
  and: (...conditions: Condition[]) => ({ op: "and", conditions }),
  or: (...conditions: Condition[]) => ({ op: "or", conditions }),
  notExists: () => ({ op: "notExists" }),
  desc: (column: string) => ({ op: "desc", column }),
}));

import resultsRouter from "./results";

type Condition =
  | { op: "eq" | "ne" | "gte"; column: keyof ResultRow; value: unknown }
  | { op: "in"; column: keyof ResultRow; values: unknown[] }
  | { op: "isNull"; column: keyof ResultRow }
  | { op: "and" | "or"; conditions: Condition[] }
  | { op: "notExists" }
  | { op: "desc"; column: keyof ResultRow };

function matches(row: ResultRow, condition: Condition): boolean {
  switch (condition.op) {
    case "eq": return row[condition.column] === condition.value;
    case "ne": return row[condition.column] !== condition.value;
    case "gte": return String(row[condition.column]) >= String(condition.value);
    case "in": return condition.values.includes(row[condition.column]);
    case "isNull": return row[condition.column] == null;
    case "and": return condition.conditions.every((item) => matches(row, item));
    case "or": return condition.conditions.some((item) => matches(row, item));
    case "notExists": return row.performanceEligible !== false;
    case "desc": return true;
  }
}

function query(rows: ResultRow[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    where: vi.fn((condition: Condition) => {
      chain.then = (resolve: (value: ResultRow[]) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(rows.filter((row) => matches(row, condition))).then(resolve, reject);
      return chain;
    }),
  };
  return chain;
}

function row(overrides: Partial<ResultRow> = {}): ResultRow {
  return {
    pickId: 1,
    sport: "MLB",
    market: "moneyline",
    selection: "home",
    odds: -110,
    units: 1,
    recommendation: "Buy",
    result: "win",
    unitsWonLost: 0.91,
    unitsRisked: 1,
    gradedAt: new Date("2026-10-01T00:00:00.000Z"),
    awayTeamAbbr: "AWY",
    homeTeamAbbr: "HOM",
    awayScore: 2,
    homeScore: 3,
    gameDate: `${new Date().getFullYear()}-10-01`,
    gameSport: "MLB",
    isEffective: true,
    isPublic: true,
    cohort: "official",
    isChallenger: false,
    modelStatus: "production",
    performanceEligible: true,
    predictionId: 101,
    modelVersionId: 201,
    modelId: "legacy-model",
    publicationReasonCode: null,
    featureSnapshot: null,
    v4MappedModelVersionId: null,
    ...overrides,
  };
}

function app(): Application {
  const value = express();
  value.use("/api", resultsRouter);
  return value;
}

async function ledgers(rows: ResultRow[]) {
  select.mockImplementation(() => query(rows));
  const value = app();
  const [summary, roi] = await Promise.all([
    request(value).get("/api/results/summary"),
    request(value).get("/api/results/roi"),
  ]);
  return { summary, roi };
}

describe("results effective-pick ledger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts an effective published pick in both ledgers", async () => {
    const { summary, roi } = await ledgers([row()]);

    expect(summary.body.overall).toMatchObject({ wins: 1, totalPicks: 1, unitsWonLost: 0.91 });
    expect(roi.body.bySport).toMatchObject([{ sport: "MLB", wins: 1, totalPicks: 1 }]);
  });

  it("excludes a superseded void row while retaining it in query input", async () => {
    const supersededVoid = row({ isEffective: false, result: "void", unitsWonLost: 0 });
    const { summary, roi } = await ledgers([supersededVoid]);

    expect(summary.body.overall).toMatchObject({ totalPicks: 0, wins: 0, losses: 0 });
    expect(roi.body.bySport).toEqual([]);
  });

  it("counts only the final effective pick across multiple revisions", async () => {
    const { summary, roi } = await ledgers([
      row({ pickId: 1, isEffective: false, result: "loss", unitsWonLost: -1 }),
      row({ pickId: 2, isEffective: false, result: "win", unitsWonLost: 0.91 }),
      row({ pickId: 3, isEffective: true, result: "win", unitsWonLost: 0.91 }),
    ]);

    expect(summary.body.overall).toMatchObject({ wins: 1, losses: 0, totalPicks: 1 });
    expect(roi.body.byRating).toMatchObject([{ recommendation: "Buy", wins: 1, totalPicks: 1 }]);
  });

  it.each([
    ["nonpublic", { isPublic: false }],
    ["performance-ineligible", { performanceEligible: false }],
    ["retired model", { modelStatus: "retired" }],
    ["shadow prediction", { cohort: "shadow" }],
    ["research prediction", { cohort: "research" }],
    ["superseded pick", { isEffective: false }],
    ["pending result", { result: "pending" }],
  ] as const)("excludes a %s row from both ledgers", async (_name, overrides) => {
    const { summary, roi } = await ledgers([row(overrides)]);

    expect(summary.body.overall).toMatchObject({ totalPicks: 0, wins: 0, losses: 0 });
    expect(roi.body.bySport).toEqual([]);
  });

  it("retains the NFL preseason exclusion while including regular-season results", async () => {
    const year = new Date().getFullYear();
    const preseason = row({ sport: "NFL", gameSport: "NFL", gameDate: `${year}-09-10` });
    const regularSeason = row({
      pickId: 2, sport: "NFL", gameSport: "NFL", gameDate: `${year}-09-11`,
    });
    const { summary, roi } = await ledgers([preseason, regularSeason]);

    expect(summary.body.overall).toMatchObject({ wins: 1, totalPicks: 1 });
    expect(roi.body.bySport).toMatchObject([{ sport: "NFL", wins: 1, totalPicks: 1 }]);
  });

  it("segments exact persisted V4 official provenance while preserving historical official rows", async () => {
    const legacy = row({ pickId: 1, result: "loss", unitsWonLost: -1 });
    const v4 = row({
      pickId: 2, predictionId: 102, modelVersionId: 202, modelId: "tbm-v4-mlb",
      publicationReasonCode: "V4_EXACT_APPROVED",
      featureSnapshot: { v4PredictionId: "v4-forecast-102" },
      v4MappedModelVersionId: 202,
    });
    const { summary } = await ledgers([legacy, v4]);

    expect(summary.body.recordSegments.v4Official).toMatchObject({
      wins: 1, losses: 0, totalPicks: 1, unitsWonLost: 0.91, unitsRisked: 1,
    });
    expect(summary.body.recordSegments.preCutoverOfficial).toMatchObject({
      wins: 0, losses: 1, totalPicks: 1, unitsWonLost: -1, unitsRisked: 1,
    });
    expect(summary.body.recentResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ pickId: 2, modelId: "tbm-v4-mlb", modelVersionId: 202, provenance: "v4Official" }),
      expect.objectContaining({ pickId: 1, provenance: "preCutoverOfficial" }),
    ]));
  });

  it("does not classify raw V4 projections or unpublished forecasts as official results", async () => {
    const rawProjection = row({
      pickId: 2, predictionId: 102, modelVersionId: 202,
      featureSnapshot: { v4PredictionId: "raw-v4-projection" },
      v4MappedModelVersionId: 202,
      publicationReasonCode: null,
    });
    const unpublished = row({
      pickId: 3, predictionId: 103, modelVersionId: 203,
      featureSnapshot: { v4PredictionId: "never-published" },
      v4MappedModelVersionId: 203,
      publicationReasonCode: "V4_EXACT_APPROVED",
      isPublic: false,
    });
    const { summary } = await ledgers([rawProjection, unpublished]);

    expect(summary.body.overall.totalPicks).toBe(0);
    expect(summary.body.recordSegments.v4Official.totalPicks).toBe(0);
    expect(summary.body.recordSegments.preCutoverOfficial.totalPicks).toBe(0);
  });
});