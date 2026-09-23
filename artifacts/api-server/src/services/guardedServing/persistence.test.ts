import { describe, expect, it } from "vitest";
import type { AdaptedPublication } from "./publicationAdapter";
import { validateOfficialPersistenceContext } from "./persistence";
import { getCurrentNcaafCandidateIdentity } from "./candidateRegistry";

const canonical = getCurrentNcaafCandidateIdentity();
const predictionAt = new Date("2026-09-01T12:00:00.000Z");
const publication: AdaptedPublication = {
  adapterVersion: "guarded-publication-adapter-v1",
  universalAdapterVersion: "universal-pipeline-adapter-v1",
  gameId: "NCAAF-1", sport: "NCAAF", market: "moneyline", selection: "home",
  line: null, odds: -115, sportsbook: "Pinnacle",
  modelProbability: .6, impliedProbability: 115 / 215, edge: .065116279,
  confidence: "High", recommendation: "Buy", units: 1,
  identity: {
    sport: "NCAAF", engine: canonical.modelId, modelFamily: canonical.modelFamily,
    modelVersion: canonical.modelVersion, artifactId: canonical.artifactId,
    artifactHash: canonical.artifactHash, configurationHash: canonical.configurationHash,
    parameterHash: canonical.parameterHash, inputVersion: canonical.inputContractVersion,
    servingMode: "nextgen_guarded", approvalStatus: "GUARDED_APPROVED",
    fallbackUsed: false, fallbackFrom: null, fallbackReason: null,
    predictionTimestamp: predictionAt.toISOString(), snapshotId: "input-1", marketSnapshotId: "7",
  },
  universal: {
    marketIntelligence: { status: "AVAILABLE", value: {}, reason: null },
    finalRating: { status: "AVAILABLE", value: 72, reason: null },
    podScore: { status: "AVAILABLE", value: 66, reason: null },
    sportsbookComparison: { status: "AVAILABLE", value: {}, reason: null },
    sharpBookAnalysis: { status: "AVAILABLE", value: {}, reason: null },
    lineShopping: { status: "AVAILABLE", value: {}, reason: null },
    marketIntelligenceGrade: { status: "AVAILABLE", value: "A", reason: null },
    finalModelTier: { status: "AVAILABLE", value: "Tier 1", reason: null },
    finalRecommendation: { status: "AVAILABLE", value: "Buy", reason: null },
  },
  rawEvidenceReference: {},
};
const prediction = {
  gameId: publication.gameId, sport: publication.sport, market: publication.market,
  selection: publication.selection, odds: publication.odds, sportsbookId: 3,
  sportsbook: publication.sportsbook, modelProbability: publication.modelProbability,
  impliedProbability: publication.impliedProbability, edge: publication.edge,
  confidence: publication.confidence, recommendation: publication.recommendation,
  units: publication.units, podScore: 66, finalRating: 72, marketIntelligenceGrade: "A",
  predictionTimestamp: predictionAt, dataCutoffTimestamp: new Date("2026-09-01T11:59:00.000Z"),
  cohort: "official", isChallenger: false, modelId: canonical.modelId,
  candidateModelVersion: canonical.modelVersion, candidateArtifactId: canonical.artifactId,
  candidateArtifactHash: canonical.artifactHash,
  candidateConfigurationHash: canonical.configurationHash ?? null,
  candidateParameterHash: canonical.parameterHash ?? null,
  candidateInputContractVersion: canonical.inputContractVersion,
};
const market = {
  id: 7, gameId: publication.gameId, market: publication.market, selection: publication.selection,
  odds: publication.odds!, sportsbookId: 3, sportsbook: publication.sportsbook,
  source: "odds-api", providerEventId: "provider-1", capturedAt: new Date("2026-09-01T11:58:00.000Z"),
  isAvailable: true, isStale: false, marketStatus: "open",
  group: [
    { selection: "home", odds: -115, isAvailable: true, isStale: false, marketStatus: "open" },
    { selection: "away", odds: 105, isAvailable: true, isStale: false, marketStatus: "open" },
  ],
};
const valid = {
  publication, canonical, configuredMode: "nextgen_guarded",
  approval: { state: "GUARDED_APPROVED" as const, approved: true },
  prediction, market, now: new Date("2026-09-01T12:01:00.000Z"),
};

describe("official guarded persistence gate", () => {
  it("accepts only an exact server-approved publication and bindings", () => {
    expect(validateOfficialPersistenceContext(valid)).toBe("guarded");
  });

  it("rejects a caller-forged approval when the server ledger is unapproved", () => {
    expect(() => validateOfficialPersistenceContext({
      ...valid, approval: { state: "UNVALIDATED", approved: false },
    })).toThrow(/exact production approval/);
  });

  it("rejects safe-mode, identity, prediction, and market mismatches", () => {
    expect(() => validateOfficialPersistenceContext({ ...valid, configuredMode: "legacy" }))
      .toThrow(/identity or configured mode/);
    expect(() => validateOfficialPersistenceContext({
      ...valid, publication: { ...publication, identity: { ...publication.identity, artifactHash: "forged" } },
    })).toThrow(/identity or configured mode/);
    expect(() => validateOfficialPersistenceContext({
      ...valid, prediction: { ...prediction, edge: prediction.edge + .01 },
    })).toThrow(/model prediction binding/);
    expect(() => validateOfficialPersistenceContext({
      ...valid, market: { ...market, providerEventId: null },
    })).toThrow(/market snapshot binding/);
    expect(() => validateOfficialPersistenceContext({
      ...valid, market: { ...market, group: market.group.slice(0, 1) },
    })).toThrow(/market snapshot binding/);
    expect(() => validateOfficialPersistenceContext({
      ...valid, market: { ...market, marketStatus: "closed" },
    })).toThrow(/market snapshot binding/);
  });

  it("rejects an incomplete universal rating pipeline", () => {
    expect(() => validateOfficialPersistenceContext({
      ...valid,
      publication: {
        ...publication,
        universal: {
          ...publication.universal,
          finalRating: { status: "UNAVAILABLE", value: null, reason: "NO_POLICY" },
        },
      },
    })).toThrow(/complete production rating pipeline/);
  });
});