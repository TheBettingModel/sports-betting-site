import type { NcaafV4FrozenProspectivePrediction } from "./ncaafV4ProspectiveEvaluation";

export type NcaafFinalEvidenceCandidate = Readonly<{
  provider: string;
  evidenceStatus: string;
  gameStatus: string | null;
  payloadHash: string;
  homeScore: number | null;
  awayScore: number | null;
  kickoffAt: Date | null;
  capturedAt: Date;
}>;

export function verifyFrozenFbsVsFbsDomain(
  predictions: readonly NcaafV4FrozenProspectivePrediction[],
  frozenFbsIds: ReadonlySet<string>,
  expectedFbsUniverseSize: number,
) {
  if (frozenFbsIds.size !== expectedFbsUniverseSize) {
    throw new Error(`Frozen FBS universe mismatch: ${frozenFbsIds.size} != ${expectedFbsUniverseSize}`);
  }
  for (const prediction of predictions) {
    if (!frozenFbsIds.has(prediction.cfbdHomeTeamId) || !frozenFbsIds.has(prediction.cfbdAwayTeamId)) {
      throw new Error(`Out-of-domain prediction in frozen eligible ledger: ${prediction.gameId}`);
    }
  }
  return Object.freeze({ frozenFbsIds: frozenFbsIds.size, verifiedPredictions: predictions.length });
}

export function isAuthoritativeNcaafFinal(row: NcaafFinalEvidenceCandidate) {
  return row.provider === "espn"
    && row.evidenceStatus === "observed"
    && row.gameStatus?.toLowerCase() === "final"
    && row.payloadHash.length > 0
    && row.homeScore != null && Number.isInteger(row.homeScore) && row.homeScore >= 0
    && row.awayScore != null && Number.isInteger(row.awayScore) && row.awayScore >= 0
    && row.kickoffAt != null
    && Number.isFinite(row.kickoffAt.getTime())
    && Number.isFinite(row.capturedAt.getTime())
    && row.capturedAt >= row.kickoffAt;
}