import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { db, gamesTable, projectionPassesTable, v4ForecastVersionsTable } from "@workspace/db";
import { bootstrapTask241V4Engines } from "./v4EngineBootstrap241";
import { canonicalV4EngineRegistry, type TbmV4Sport } from "./v4Platform";
import { canClaimGame, isPassActive, passProjection, PASS_MS } from "./projectionPassPolicy";

export class ProjectionPassError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
type Game = typeof gamesTable.$inferSelect;
export function passGame(game: Game) {
  return {
    id: game.id, sport: game.sport, homeTeamName: game.homeTeamName,
    awayTeamName: game.awayTeamName, homeTeamAbbr: game.homeTeamAbbr,
    awayTeamAbbr: game.awayTeamAbbr, homeTeamLogo: game.homeTeamLogo,
    awayTeamLogo: game.awayTeamLogo, status: game.status,
    gameDate: game.gameDate, gameTime: game.gameTime, startsAt: game.startsAt?.toISOString() ?? null,
  };
}
export async function getProjectionPassView(userId: string) {
  return db.transaction(async tx => {
    const { rows: [clock] } = await tx.execute<{ now: string }>(sql`SELECT clock_timestamp() AS now`);
    const now = new Date(clock!.now);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const [pass] = await tx.select().from(projectionPassesTable).where(eq(projectionPassesTable.userId, userId));
    const games = await tx.select().from(gamesTable).where(eq(gamesTable.gameDate, today))
      .orderBy(asc(gamesTable.startsAt), asc(gamesTable.id));
    const active = isPassActive(pass, now);
    return {
      serverTime: now.toISOString(), canClaim: !active,
      gameId: active ? pass!.gameId : null,
      claimedAt: active ? pass!.claimedAt.toISOString() : null,
      expiresAt: active ? pass!.expiresAt.toISOString() : null,
      games: games.map(passGame),
      selectedGame: active ? pass!.snapshot.game : null,
      projection: active ? pass!.snapshot.projection : null,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

/** No provider fetch, scoring, forecasts, or scheduler imports are executed. */
export async function claimProjectionPass(userId: string, gameId: string) {
  bootstrapTask241V4Engines();
  await db.transaction(async tx => {
    // Pooled Neon connections: the lock belongs to this transaction, never a session.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"projection-pass:" + userId}, 0))`);
    const { rows: [clock] } = await tx.execute<{ now: string }>(sql`SELECT clock_timestamp() AS now`);
    const now = new Date(clock!.now);
    const [existing] = await tx.select().from(projectionPassesTable)
      .where(eq(projectionPassesTable.userId, userId)).for("update");
    if (isPassActive(existing, now)) {
      if (existing!.gameId === gameId) return; // Idempotent, including after kickoff.
      throw new ProjectionPassError("PASS_ALREADY_USED", "Your next free Projection Pass is available when the current 24-hour period ends.");
    }
    const [game] = await tx.select().from(gamesTable).where(eq(gamesTable.id, gameId)).for("update");
    if (!game || !canClaimGame(game, now)) {
      throw new ProjectionPassError("GAME_NOT_UPCOMING", "This game is no longer available for a free unlock. Your pass has not been used.");
    }
    const sport = (game.sport === "Soccer" ? "SOCCER" : game.sport === "NCAAB" ? "NCAAMB" : game.sport) as TbmV4Sport;
    const engine = canonicalV4EngineRegistry.get(sport);
    if (!engine || String(engine.approvalState) === "SUSPENDED") {
      throw new ProjectionPassError("PROJECTION_UNAVAILABLE", "No saved projection is available for this game. Your pass has not been used.");
    }
    const rows = await tx.select().from(v4ForecastVersionsTable).where(and(
      eq(v4ForecastVersionsTable.gameId, gameId), eq(v4ForecastVersionsTable.sport, sport),
      eq(v4ForecastVersionsTable.artifactHash, engine.identity.artifactHash),
      eq(v4ForecastVersionsTable.modelId, engine.identity.modelId),
      lte(v4ForecastVersionsTable.createdAt, now),
    )).orderBy(desc(v4ForecastVersionsTable.predictedAt), desc(v4ForecastVersionsTable.version)).limit(5);
    const projection = rows.map(row => passProjection(row, gameId, game.startsAt!, now, engine.identity)).find(Boolean);
    if (!projection) throw new ProjectionPassError("PROJECTION_UNAVAILABLE", "No verified saved projection is available. Your pass has not been used.");
    // Re-check real DB time AFTER waiting for locks and loading evidence. Conditional
    // INSERT also closes the confirmation/kickoff race without ever charging a credit.
    const { rows: [freshClock] } = await tx.execute<{ now: string }>(sql`SELECT clock_timestamp() AS now`);
    const claimedAt = new Date(freshClock!.now);
    if (!canClaimGame(game, claimedAt)) throw new ProjectionPassError("GAME_STARTED", "This game has started. Your pass has not been used.");
    const expiresAt = new Date(claimedAt.getTime() + PASS_MS);
    const snapshot = { game: passGame(game), projection };
    const written = await tx.execute(sql`
      INSERT INTO projection_passes (user_id, game_id, claimed_at, expires_at, snapshot)
      SELECT ${userId}, ${gameId}, ${claimedAt.toISOString()}::timestamptz,
        ${expiresAt.toISOString()}::timestamptz, ${JSON.stringify(snapshot)}::jsonb
      WHERE clock_timestamp() < ${game.startsAt!.toISOString()}::timestamptz
      ON CONFLICT (user_id) DO UPDATE SET game_id = EXCLUDED.game_id,
        claimed_at = EXCLUDED.claimed_at, expires_at = EXCLUDED.expires_at, snapshot = EXCLUDED.snapshot
      WHERE projection_passes.expires_at <= clock_timestamp()
      RETURNING user_id`);
    if (!written.rows.length) throw new ProjectionPassError("GAME_STARTED", "This game can no longer be unlocked. Your pass has not been used.");
  });
  return getProjectionPassView(userId);
}
