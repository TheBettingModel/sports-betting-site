import { and, eq } from "drizzle-orm";
import { db, ncaafCfbdGameMappingsTable, ncaafCfbdTeamMappingsTable, ncaafGameEvidenceTable } from "@workspace/db";
import { cfbdPayloadHash } from "./collegeFootballData";
import { decideCfbdGameMapping, decideCfbdTeamMapping } from "./ncaafCfbdIdentity";

/** Reconciles only explicit provider IDs and exact supplied school names. */
export async function materializeCurrentCfbdMappings(season: number, capturedAt = new Date()): Promise<{ teams: number; games: number }> {
  const rows = await db.select().from(ncaafGameEvidenceTable).where(eq(ncaafGameEvidenceTable.season, season));
  const espn = [...new Map(rows.filter((row) => row.provider === "espn" && row.kickoffAt && row.homeProviderTeamId && row.awayProviderTeamId)
    .map((row) => [`${row.providerEventId}:${row.kickoffAt!.toISOString()}`, row])).values()];
  const cfbd = [...new Map(rows.filter((row) => row.provider === "college_football_data")
    .map((row) => [row.providerEventId, row])).values()];
  let teams = 0; let games = 0;
  for (const game of cfbd) {
    for (const side of [
      { id: game.homeProviderTeamId, name: game.homeTeamName },
      { id: game.awayProviderTeamId, name: game.awayTeamName },
    ]) {
      if (!side.id) continue;
      const candidates = [...new Map(espn.flatMap((candidate) => [
        candidate.homeProviderTeamId && candidate.homeTeamName ? { provider: "espn", teamId: candidate.homeProviderTeamId, school: candidate.homeTeamName } : null,
        candidate.awayProviderTeamId && candidate.awayTeamName ? { provider: "espn", teamId: candidate.awayProviderTeamId, school: candidate.awayTeamName } : null,
      ]).filter((candidate): candidate is { provider: string; teamId: string; school: string } => candidate != null)
        .map((candidate) => [`${candidate.provider}:${candidate.teamId}`, candidate])).values()];
      const decision = decideCfbdTeamMapping({ id: side.id, school: side.name ?? undefined }, candidates);
      const evidence = { cfbdTeamId: side.id, school: side.name ?? null, decision };
      const inserted = await db.insert(ncaafCfbdTeamMappingsTable).values({
        cfbdTeamId: side.id, season, canonicalProvider: decision.canonicalProvider, canonicalTeamId: decision.canonicalTeamId,
        state: decision.state, reason: decision.reason, evidence, payloadHash: cfbdPayloadHash(evidence), capturedAt,
      }).onConflictDoNothing().returning({ id: ncaafCfbdTeamMappingsTable.id });
      teams += inserted.length;
    }
    const mappingRows = await db.select().from(ncaafCfbdTeamMappingsTable).where(and(
      eq(ncaafCfbdTeamMappingsTable.season, season), eq(ncaafCfbdTeamMappingsTable.state, "MAPPED"),
    ));
    const home = mappingRows.find((row) => row.cfbdTeamId === game.homeProviderTeamId)?.canonicalTeamId;
    const away = mappingRows.find((row) => row.cfbdTeamId === game.awayProviderTeamId)?.canonicalTeamId;
    const decision = decideCfbdGameMapping({ id: game.providerEventId, homeCanonicalTeamId: home, awayCanonicalTeamId: away, kickoffAt: game.kickoffAt, neutralSite: game.neutralSite },
      espn.map((candidate) => ({ provider: "espn", eventId: candidate.providerEventId, homeTeamId: candidate.homeProviderTeamId!, awayTeamId: candidate.awayProviderTeamId!, kickoffAt: candidate.kickoffAt!, neutralSite: candidate.neutralSite })));
    const evidence = { cfbdGameId: game.providerEventId, homeCfbdTeamId: game.homeProviderTeamId, awayCfbdTeamId: game.awayProviderTeamId, decision };
    const inserted = await db.insert(ncaafCfbdGameMappingsTable).values({
      cfbdGameId: game.providerEventId, season, canonicalProvider: decision.canonicalProvider, canonicalEventId: decision.canonicalEventId,
      state: decision.state, reason: decision.reason, evidence, payloadHash: cfbdPayloadHash(evidence), capturedAt,
    }).onConflictDoNothing().returning({ id: ncaafCfbdGameMappingsTable.id });
    games += inserted.length;
  }
  return { teams, games };
}