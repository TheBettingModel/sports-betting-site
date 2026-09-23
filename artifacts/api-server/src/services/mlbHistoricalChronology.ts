import { createHash } from "node:crypto";
import { MLB_HISTORICAL_CHRONOLOGY_V3_SCHEMA_VERSION } from "@workspace/db/schema";
import { stableHistoricalJson } from "./mlbHistoricalSource";

export const MLB_HISTORICAL_COMPLETION_RESOLVER_VERSION = "mlb-official-pbp-completion-v3";
export const MLB_HISTORICAL_CHRONOLOGY_ARTIFACT_KEY =
  "mlb-historical-2023-2026-completion-v3-raw-bound";
export const MLB_HISTORICAL_CHRONOLOGY_SCHEMA_VERSION =
  MLB_HISTORICAL_CHRONOLOGY_V3_SCHEMA_VERSION;
export const MLB_HISTORICAL_CHRONOLOGY_RULE =
  "prior.final && prior.canonicalCompletionTime < target.featureCutoff";

export type CompletionConfidence =
  | "AUTHORITATIVE"
  | "HIGH_CONFIDENCE_DERIVED"
  | "DATE_ONLY"
  | "UNRESOLVED";

export type PriorInfluenceReason =
  | "ELIGIBLE_COMPLETED_BEFORE_CUTOFF"
  | "PRIOR_NOT_FINAL"
  | "PRIOR_QUARANTINED"
  | "PRIOR_COMPLETION_UNRESOLVED"
  | "TARGET_CUTOFF_UNRESOLVED"
  | "COMPLETION_NOT_BEFORE_CUTOFF"
  | "IDENTITY_MISMATCH";

export interface HistoricalCompletionEvidence {
  canonicalGameId: string;
  providerGameId: string;
  endpoint: string;
  retrievedAt: string;
  scheduledStartTime: string;
  actualStartTime: string | null;
  firstPlayStartTime: string | null;
  lastPlayStartTime: string | null;
  lastPlayEndTime: string | null;
  gameEndTime: string | null;
  finalStatusTime: string | null;
  providerFinalSeenAt: string;
  canonicalCompletionTime: string | null;
  completionTimeSource: "GAME_END_TIME" | "TERMINAL_PLAY_END_TIME" | "NONE";
  completionTimeMethod:
    | "EXPLICIT_OFFICIAL_GAME_END"
    | "OFFICIAL_FINAL_STATUS_PLUS_TERMINAL_PLAY_END"
    | "UNRESOLVED";
  completionTimeConfidence: CompletionConfidence;
  completionTimePrecision: "MILLISECOND" | "SECOND" | "UNKNOWN";
  featureCutoff: string | null;
  featureCutoffSource: "OFFICIAL_FIRST_PLAY_START_MINUS_1MS" | "UNRESOLVED";
  featureCutoffConfidence: "HIGH_CONFIDENCE_DERIVED" | "UNRESOLVED";
  completionDateEt: string | null;
  gameStatus: string;
  statusCode: string;
  finalStatus: boolean;
  terminalPlayComplete: boolean;
  playCount: number;
  inningsPlayed: number | null;
  postponed: boolean;
  suspended: boolean;
  resumed: boolean;
  crossedMidnightUtc: boolean;
  quarantineReason: string | null;
  evidencePayload: Record<string, unknown>;
  rawPayloadHash: string;
  evidenceHash: string;
  resolverVersion: typeof MLB_HISTORICAL_COMPLETION_RESOLVER_VERSION;
}

interface CompletionParseInput {
  canonicalGameId: string;
  providerGameId: string;
  scheduledStartTime: string;
  retrievedAt: string;
  endpoint?: string;
}

function hash(value: unknown): string {
  return createHash("sha256").update(stableHistoricalJson(value)).digest("hex");
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function validIso(value: unknown): string | null {
  const text = stringOrNull(value);
  if (!text || !Number.isFinite(new Date(text).getTime())) return null;
  return new Date(text).toISOString();
}

function precision(value: string | null): "MILLISECOND" | "SECOND" | "UNKNOWN" {
  if (!value) return "UNKNOWN";
  return /\.\d{3}Z$/.test(value) ? "MILLISECOND" : "SECOND";
}

function easternDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function parseHistoricalMlbCompletionFeed(
  payload: unknown,
  input: CompletionParseInput,
): HistoricalCompletionEvidence {
  const root = object(payload);
  const gameData = object(root.gameData);
  const status = object(gameData.status);
  const datetime = object(gameData.datetime);
  const liveData = object(root.liveData);
  const playsRoot = object(liveData.plays);
  const linescore = object(liveData.linescore);
  const rawPlays = Array.isArray(playsRoot.allPlays) ? playsRoot.allPlays : [];
  const plays = rawPlays.map((entry) => {
    const play = object(entry);
    const about = object(play.about);
    const result = object(play.result);
    return {
      atBatIndex: integerOrNull(about.atBatIndex),
      inning: integerOrNull(about.inning),
      halfInning: stringOrNull(about.halfInning),
      startTime: validIso(about.startTime),
      endTime: validIso(about.endTime),
      isComplete: about.isComplete === true,
      eventType: stringOrNull(result.eventType),
      awayScore: integerOrNull(result.awayScore),
      homeScore: integerOrNull(result.homeScore),
    };
  });
  const firstPlay = plays.find((play) => play.startTime !== null) ?? null;
  const lastPlay = plays.at(-1) ?? null;
  const abstractStatus = stringOrNull(status.abstractGameState) ?? "UNKNOWN";
  const detailedStatus = stringOrNull(status.detailedState) ?? "UNKNOWN";
  const statusCode = stringOrNull(status.codedGameState)
    ?? stringOrNull(status.statusCode)
    ?? "UNKNOWN";
  const postponed = /postpon|cancel/i.test(`${detailedStatus} ${statusCode}`);
  const suspended = /suspend/i.test(detailedStatus);
  const resumed = validIso(datetime.resumeDate) !== null
    || validIso(datetime.resumedFromDate) !== null
    || /resume/i.test(detailedStatus);
  const finalStatus = abstractStatus === "Final"
    && !postponed
    && !suspended
    && /^(F|O)$/.test(statusCode);
  const terminalPlayComplete = lastPlay?.isComplete === true;
  const gameEndTime = validIso(datetime.gameEndDate);
  const lastPlayEndTime = lastPlay?.endTime ?? null;
  const canonicalCompletionTime = finalStatus && gameEndTime
    ? gameEndTime
    : finalStatus && terminalPlayComplete ? lastPlayEndTime : null;
  const completionTimeSource = finalStatus && gameEndTime
    ? "GAME_END_TIME"
    : finalStatus && terminalPlayComplete && lastPlayEndTime ? "TERMINAL_PLAY_END_TIME" : "NONE";
  const completionTimeMethod = completionTimeSource === "GAME_END_TIME"
    ? "EXPLICIT_OFFICIAL_GAME_END"
    : completionTimeSource === "TERMINAL_PLAY_END_TIME"
      ? "OFFICIAL_FINAL_STATUS_PLUS_TERMINAL_PLAY_END"
      : "UNRESOLVED";
  const completionTimeConfidence: CompletionConfidence = completionTimeSource === "GAME_END_TIME"
    ? "AUTHORITATIVE"
    : completionTimeSource === "TERMINAL_PLAY_END_TIME"
      ? "HIGH_CONFIDENCE_DERIVED"
      : "UNRESOLVED";
  const firstPlayStartTime = firstPlay?.startTime ?? null;
  const featureCutoff = firstPlayStartTime
    ? new Date(new Date(firstPlayStartTime).getTime() - 1).toISOString()
    : null;
  const actualStartTime = validIso(datetime.actualStartTime);
  const scheduledStart = validIso(input.scheduledStartTime) ?? input.scheduledStartTime;
  const quarantineReason = !finalStatus
    ? "FINAL_STATUS_NOT_PROVEN"
    : !terminalPlayComplete
      ? "TERMINAL_PLAY_INCOMPLETE"
      : !canonicalCompletionTime
        ? "COMPLETION_TIME_UNRESOLVED"
        : !featureCutoff
          ? "FEATURE_CUTOFF_UNRESOLVED"
          : new Date(canonicalCompletionTime).getTime() < new Date(featureCutoff).getTime()
            ? "COMPLETION_BEFORE_OWN_CUTOFF_IMPOSSIBLE"
            : null;
  const evidencePayload = {
    status,
    datetime: {
      dateTime: stringOrNull(datetime.dateTime),
      originalDate: stringOrNull(datetime.originalDate),
      officialDate: stringOrNull(datetime.officialDate),
      gameEndDate: stringOrNull(datetime.gameEndDate),
      resumeDate: stringOrNull(datetime.resumeDate),
      resumedFromDate: stringOrNull(datetime.resumedFromDate),
    },
    linescore: {
      currentInning: integerOrNull(linescore.currentInning),
      scheduledInnings: integerOrNull(linescore.scheduledInnings),
    },
    plays,
  };
  return {
    canonicalGameId: input.canonicalGameId,
    providerGameId: input.providerGameId,
    endpoint: input.endpoint ?? `https://statsapi.mlb.com/api/v1.1/game/${input.providerGameId}/feed/live`,
    retrievedAt: input.retrievedAt,
    scheduledStartTime: scheduledStart,
    actualStartTime,
    firstPlayStartTime,
    lastPlayStartTime: lastPlay?.startTime ?? null,
    lastPlayEndTime,
    gameEndTime,
    finalStatusTime: null,
    providerFinalSeenAt: input.retrievedAt,
    canonicalCompletionTime,
    completionTimeSource,
    completionTimeMethod,
    completionTimeConfidence,
    completionTimePrecision: precision(canonicalCompletionTime),
    featureCutoff,
    featureCutoffSource: featureCutoff ? "OFFICIAL_FIRST_PLAY_START_MINUS_1MS" : "UNRESOLVED",
    featureCutoffConfidence: featureCutoff ? "HIGH_CONFIDENCE_DERIVED" : "UNRESOLVED",
    completionDateEt: easternDate(canonicalCompletionTime),
    gameStatus: detailedStatus,
    statusCode,
    finalStatus,
    terminalPlayComplete,
    playCount: plays.length,
    inningsPlayed: integerOrNull(linescore.currentInning),
    postponed,
    suspended,
    resumed,
    crossedMidnightUtc: Boolean(
      firstPlayStartTime
      && canonicalCompletionTime
      && firstPlayStartTime.slice(0, 10) !== canonicalCompletionTime.slice(0, 10)
    ),
    quarantineReason,
    evidencePayload,
    rawPayloadHash: hash(payload),
    evidenceHash: hash(evidencePayload),
    resolverVersion: MLB_HISTORICAL_COMPLETION_RESOLVER_VERSION,
  };
}

export interface ChronologyGame {
  canonicalGameId: string;
  providerGameId: string;
  finalStatus: boolean;
  quarantined: boolean;
  canonicalCompletionTime: string | null;
  featureCutoff: string | null;
}

export function canPriorGameInfluenceTarget(
  prior: ChronologyGame,
  target: ChronologyGame,
): { eligible: boolean; reason: PriorInfluenceReason } {
  if (prior.canonicalGameId === target.canonicalGameId) {
    return { eligible: false, reason: "IDENTITY_MISMATCH" };
  }
  if (!prior.finalStatus) return { eligible: false, reason: "PRIOR_NOT_FINAL" };
  if (prior.quarantined) return { eligible: false, reason: "PRIOR_QUARANTINED" };
  if (!prior.canonicalCompletionTime) {
    return { eligible: false, reason: "PRIOR_COMPLETION_UNRESOLVED" };
  }
  if (!target.featureCutoff) return { eligible: false, reason: "TARGET_CUTOFF_UNRESOLVED" };
  return new Date(prior.canonicalCompletionTime).getTime() < new Date(target.featureCutoff).getTime()
    ? { eligible: true, reason: "ELIGIBLE_COMPLETED_BEFORE_CUTOFF" }
    : { eligible: false, reason: "COMPLETION_NOT_BEFORE_CUTOFF" };
}