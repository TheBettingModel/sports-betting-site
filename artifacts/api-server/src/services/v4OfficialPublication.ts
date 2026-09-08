import type { CanonicalV4Forecast } from "./v4Platform";

/** The only roles a public client may render.  Rank is server-owned. */
export type OfficialV4Role = "TOP_PLAY" | "QUALIFIED_PLAY" | "PROJECTION";

/** Required independently-captured market proof for any official V4 decision. */
export type V4ActionableMarketEvidence = Readonly<{
  market: string;
  selection: string;
  line: number | null;
  odds: number;
  fairProbability: number;
  sportsbook: string;
  source: string;
  capturedAt: string;
  snapshotId: string;
  providerIdentity: string;
  eventStart: string;
}>;

/**
 * Market evidence is deliberately separate from model evidence: it can contain
 * odds without contaminating model features. Its absence is never recoverable
 * by consulting a current market row.
 */
export function validateActionableV4MarketEvidence(
  evidence: V4ActionableMarketEvidence | null | undefined,
  forecast: CanonicalV4Forecast,
): string | null {
  if (!evidence) return "ACTIONABLE_MARKET_EVIDENCE_MISSING";
  if (!evidence.market || !evidence.selection || !evidence.sportsbook || !evidence.source
    || !evidence.snapshotId || !evidence.providerIdentity) return "ACTIONABLE_MARKET_IDENTITY_MISSING";
  const captured = Date.parse(evidence.capturedAt);
  const start = Date.parse(evidence.eventStart);
  const prediction = Date.parse(forecast.predictionTimestamp);
  if (!Number.isFinite(captured) || !Number.isFinite(start) || !Number.isFinite(prediction)
    || captured >= start || prediction >= start) return "ACTIONABLE_MARKET_PIT_INVALID";
  if (!Number.isFinite(evidence.odds) || !Number.isFinite(evidence.fairProbability)
    || evidence.fairProbability < 0 || evidence.fairProbability > 1) return "ACTIONABLE_MARKET_VALUES_INVALID";
  return null;
}

export type V4PublicationCandidate = Readonly<{
  forecast: CanonicalV4Forecast;
  /** Exact model/artifact/contract approval ledger result, never inferred. */
  exactApproval: boolean;
  /** Market, slot, PIT and transaction safety gates. */
  publicationEligible: boolean;
  rankScore: number;
}>;

export type OfficialV4Decision = Readonly<{
  predictionId: string;
  role: OfficialV4Role;
  rank: number | null;
  units: 0 | 1;
  failureReason: string | null;
}>;

/**
 * Deterministically assigns public roles after all eligibility checks.  Callers
 * must provide the complete locked slate; this deliberately has no legacy
 * ProjectionResult input and therefore cannot become a legacy fallback seam.
 */
export function rankOfficialV4Candidates(
  candidates: readonly V4PublicationCandidate[],
): OfficialV4Decision[] {
  const eligible = candidates
    .filter((candidate) => candidate.forecast.approvalState === "PRODUCTION_APPROVED"
      && candidate.exactApproval
      && candidate.publicationEligible
      && Number.isFinite(candidate.rankScore))
    .slice()
    .sort((a, b) => b.rankScore - a.rankScore
      || a.forecast.predictionTimestamp.localeCompare(b.forecast.predictionTimestamp)
      || a.forecast.predictionId.localeCompare(b.forecast.predictionId));
  const rankById = new Map(eligible.map((candidate, index) => [
    candidate.forecast.predictionId, index + 1,
  ]));
  return candidates.map((candidate) => {
    const rank = rankById.get(candidate.forecast.predictionId) ?? null;
    const failureReason = rank != null ? null
      : candidate.forecast.approvalState !== "PRODUCTION_APPROVED"
        ? "V4_NOT_PRODUCTION_APPROVED"
        : !candidate.exactApproval
          ? "EXACT_V4_APPROVAL_MISSING"
          : !candidate.publicationEligible
            ? "V4_PUBLICATION_SAFETY_GATE_BLOCKED"
            : "V4_RANKING_INPUT_INVALID";
    return {
      predictionId: candidate.forecast.predictionId,
      role: rank === 1 ? "TOP_PLAY" : rank != null ? "QUALIFIED_PLAY" : "PROJECTION",
      rank,
      // Flat staking is enforced at the authoritative role assignment point.
      units: rank == null ? 0 : 1,
      failureReason,
    };
  });
}