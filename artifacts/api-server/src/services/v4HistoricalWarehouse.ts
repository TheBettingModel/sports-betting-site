import { stableHash, type TbmV4Sport } from "./v4Platform";

export type CompletionTimeKind = "SOURCE_REPORTED" | "CONSERVATIVE_BOUND" | "UNAVAILABLE";
export type WarehouseEligibility = "ELIGIBLE" | "QUARANTINED";

export type HistoricalSourceManifest = Readonly<{
  sourceKey: string;
  provider: string;
  retrievalMethod: string;
  retrievedAt: string;
  rawPayloadHash: string;
  rawRowCount: number;
  provenance: Readonly<Record<string, unknown>>;
}>;

export type HistoricalEventInput = Readonly<{
  sport: TbmV4Sport;
  league?: string | null;
  provider: string;
  providerEventId: string;
  season: string;
  eventStart: string;
  completionTime?: string | null;
  completionTimeKind: CompletionTimeKind;
  homeParticipantId?: string | null;
  awayParticipantId?: string | null;
  participantAId?: string | null;
  participantBId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  participantAWon?: boolean | null;
  targetAvailableAt?: string | null;
  rawEventHash: string;
}>;

export type CanonicalHistoricalEvent = HistoricalEventInput & Readonly<{
  canonicalEventId: string;
  canonicalEventHash: string;
  eligibility: WarehouseEligibility;
  quarantineReason: string | null;
}>;

const MARKET_KEY = /(?:^|_)(odds|moneyline|spread|total|implied_probability|consensus|clv|line_movement|sharp|edge)(?:$|_)/i;

function instant(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasMarketKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasMarketKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>)
    .some(([key, child]) => MARKET_KEY.test(key) || hasMarketKey(child));
}

function quarantineReason(input: HistoricalEventInput): string | null {
  const start = instant(input.eventStart);
  const completion = instant(input.completionTime);
  const target = instant(input.targetAvailableAt);
  if (start == null) return "INVALID_EVENT_START";
  const teamEvent = input.sport !== "UFC";
  if (teamEvent && (!input.homeParticipantId || !input.awayParticipantId)) return "UNRESOLVED_IDENTITY";
  if (!teamEvent && (!input.participantAId || !input.participantBId)) return "UNRESOLVED_IDENTITY";
  if (input.completionTimeKind === "UNAVAILABLE" || completion == null) return "COMPLETION_TIME_UNAVAILABLE";
  if (completion <= start) return "INVALID_COMPLETION_ORDER";
  if (target == null || target < completion) return "TARGET_AVAILABILITY_INVALID";
  if (teamEvent && (!Number.isInteger(input.homeScore) || !Number.isInteger(input.awayScore)
    || input.homeScore! < 0 || input.awayScore! < 0)) return "INVALID_SCORE";
  if (!teamEvent && typeof input.participantAWon !== "boolean") return "MISSING_OUTCOME";
  if (hasMarketKey(input)) return "MARKET_LEAKAGE";
  return null;
}

export function canonicalizeHistoricalEvent(input: HistoricalEventInput): CanonicalHistoricalEvent {
  const canonicalEventId = `${input.sport}:${input.provider}:${input.providerEventId}`;
  const reason = quarantineReason(input);
  const body = {
    ...input,
    canonicalEventId,
    eligibility: reason ? "QUARANTINED" as const : "ELIGIBLE" as const,
    quarantineReason: reason,
  };
  return { ...body, canonicalEventHash: stableHash(body) };
}

export function deduplicateHistoricalEvents(
  inputs: readonly HistoricalEventInput[],
): CanonicalHistoricalEvent[] {
  const exact = new Map<string, CanonicalHistoricalEvent>();
  for (const input of inputs) {
    const event = canonicalizeHistoricalEvent(input);
    const identity = `${event.sport}|${event.provider}|${event.providerEventId}`;
    const existing = exact.get(identity);
    if (!existing) {
      exact.set(identity, event);
      continue;
    }
    if (existing.canonicalEventHash !== event.canonicalEventHash) {
      exact.set(`${identity}|CONFLICT|${event.canonicalEventHash}`, {
        ...event,
        eligibility: "QUARANTINED",
        quarantineReason: "CONFLICTING_DUPLICATE_EVENT",
        canonicalEventHash: stableHash({ ...event, eligibility: "QUARANTINED", quarantineReason: "CONFLICTING_DUPLICATE_EVENT" }),
      });
    }
  }
  return [...exact.values()].sort((a, b) =>
    Date.parse(a.eventStart) - Date.parse(b.eventStart)
    || a.canonicalEventId.localeCompare(b.canonicalEventId));
}

export function freezeHistoricalCohort(input: {
  sport: TbmV4Sport;
  cohortId: string;
  cohortVersion: string;
  contractId: string;
  contractHash: string;
  sourceManifest: readonly HistoricalSourceManifest[];
  events: readonly CanonicalHistoricalEvent[];
  featureCount: number;
  trainingRows: number;
  validationRows: number;
  frozenAt: string;
}) {
  const eligible = input.events.filter((event) => event.eligibility === "ELIGIBLE");
  if (!eligible.length) throw new Error("EMPTY_ELIGIBLE_COHORT");
  const body = {
    sport: input.sport,
    cohortId: input.cohortId,
    cohortVersion: input.cohortVersion,
    contractId: input.contractId,
    contractHash: input.contractHash,
    sourceManifest: input.sourceManifest,
    dateStart: eligible[0]!.eventStart,
    dateEnd: eligible.at(-1)!.eventStart,
    rawRows: input.events.length,
    eligibleRows: eligible.length,
    quarantinedRows: input.events.length - eligible.length,
    featureCount: input.featureCount,
    trainingRows: input.trainingRows,
    validationRows: input.validationRows,
    frozenAt: input.frozenAt,
    eventHashes: input.events.map((event) => event.canonicalEventHash),
  };
  return { ...body, cohortHash: stableHash(body) };
}