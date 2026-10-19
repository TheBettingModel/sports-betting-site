import { stableHash, type V4ArtifactIdentity } from "./v4Platform";

export const PASS_MS = 24 * 60 * 60 * 1000;
export function isPassActive(pass: { expiresAt: Date } | null | undefined, now: Date): boolean {
  return !!pass && pass.expiresAt.getTime() > now.getTime();
}
export function canClaimGame(game: { status: string; startsAt: Date | null; gameDate: string }, now: Date): boolean {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return game.status === "upcoming" && !!game.startsAt
    && game.startsAt.getTime() > now.getTime() && game.gameDate === today;
}

/** Whitelist, never serialize model internals or arbitrary forecast payloads. */
export function passProjection(
  row: { forecastPayload: Record<string, unknown>; forecastHash: string; predictedAt: Date; dataCutoff: Date;
    eventStart: Date; createdAt: Date; modelId: string; artifactHash: string },
  gameId: string, startsAt: Date, now: Date, identity: V4ArtifactIdentity,
) {
  const p = row.forecastPayload;
  if (row.forecastHash !== stableHash(p) || p.gameId !== gameId
    || row.eventStart.getTime() !== startsAt.getTime()
    || row.predictedAt >= startsAt || row.dataCutoff > row.predictedAt || row.createdAt > now
    || typeof p.predictionTimestamp !== "string" || Date.parse(p.predictionTimestamp) !== row.predictedAt.getTime()
    || typeof p.dataCutoff !== "string" || Date.parse(p.dataCutoff) !== row.dataCutoff.getTime()
    || p.modelId !== row.modelId || p.artifactHash !== row.artifactHash
    || ["sport", "modelId", "modelVersion", "artifactId", "artifactHash", "inputContractVersion",
      "configurationHash", "parameterHash", "contractId", "contractHash"]
      .some(key => p[key] !== (identity as unknown as Record<string, unknown>)[key])) return null;
  const { expectedHomeScore: home, expectedAwayScore: away, homeWinProbability: hp,
    awayWinProbability: ap, drawProbability: dp } = p;
  if (![home, away, hp, ap].every(x => typeof x === "number" && Number.isFinite(x))
    || (home as number) < 0 || (away as number) < 0
    || (hp as number) < 0 || (hp as number) > 1 || (ap as number) < 0 || (ap as number) > 1
    || (dp != null && (typeof dp !== "number" || !Number.isFinite(dp) || dp < 0 || dp > 1))
    || Math.abs((hp as number) + (ap as number) + (typeof dp === "number" ? dp : 0) - 1) > 0.001) return null;
  return {
    expectedHomeScore: home as number, expectedAwayScore: away as number,
    homeWinProbability: hp as number, awayWinProbability: ap as number,
    drawProbability: typeof dp === "number" ? dp : null,
    projectedWinner: typeof dp === "number" && dp >= (hp as number) && dp >= (ap as number)
      ? "DRAW" as const : (hp as number) >= (ap as number) ? "HOME" as const : "AWAY" as const,
    forecastTimestamp: row.predictedAt.toISOString(),
  };
}
