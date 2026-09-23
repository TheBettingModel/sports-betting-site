/**
 * Read-only MLB pitcher integrity audit.
 *
 * Compares the API's current MLB game cards with the official MLB schedule and
 * player-stat responses. It exits non-zero when a displayed starter, season ERA,
 * or recent ERA differs from the verified source.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run audit:mlb-pitchers
 *   TBM_API_URL=https://example.com pnpm --filter @workspace/api-server run audit:mlb-pitchers
 */

const API_BASE_URL = (process.env.TBM_API_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const MLB_API_BASE_URL = "https://statsapi.mlb.com/api/v1";
const START_TIME_TOLERANCE_MS = 90 * 60 * 1_000;
const VALUE_TOLERANCE = 0.0051;

const TEAM_IDS = {
  ARI: 109, ATH: 133, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CHW: 145,
  CIN: 113, CLE: 114, COL: 115, DET: 116, HOU: 117, KC: 118, LAA: 108,
  LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, PHI: 143,
  PIT: 134, SD: 135, SF: 137, SEA: 136, STL: 138, TB: 139, TEX: 140,
  TOR: 141, WSH: 120,
};

async function getJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "TheBettingModel-pitcher-audit/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response.json();
}

function finiteNumber(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function equalWithinTolerance(actual, expected) {
  return actual != null && expected != null && Math.abs(actual - expected) <= VALUE_TOLERANCE;
}

function recentEra(gameLogSplits) {
  const recent = gameLogSplits
    .filter((split) => Number.isFinite(Date.parse(split.date ?? "")))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 3);
  if (recent.length === 0) return null;
  const eras = recent.map((split) => finiteNumber(split.stat?.era));
  return eras.every((era) => era != null)
    ? eras.reduce((total, era) => total + era, 0) / eras.length
    : null;
}

async function main() {
  const gamesPayload = await getJson(`${API_BASE_URL}/api/games/today`);
  const allGames = Array.isArray(gamesPayload) ? gamesPayload : gamesPayload.games ?? [];
  const games = allGames.filter((game) => game.sport === "MLB");
  if (games.length === 0) {
    console.log("No MLB games were returned by the API; nothing to audit.");
    return;
  }

  const schedules = new Map();
  for (const date of [...new Set(games.map((game) => game.gameDate))]) {
    const schedule = await getJson(
      `${MLB_API_BASE_URL}/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=probablePitcher,team&gameType=R`,
    );
    schedules.set(date, (schedule.dates ?? []).flatMap((day) => day.games ?? []));
  }

  const statsByPitcherId = new Map();
  const failures = [];
  let verifiedStarters = 0;
  let unavailableStarters = 0;

  for (const game of games) {
    const homeId = TEAM_IDS[game.homeTeamAbbr];
    const awayId = TEAM_IDS[game.awayTeamAbbr];
    const scheduleGame = (schedules.get(game.gameDate) ?? []).find((candidate) =>
      candidate.teams?.home?.team?.id === homeId
      && candidate.teams?.away?.team?.id === awayId,
    );

    if (!scheduleGame) {
      failures.push(`${game.awayTeamAbbr} @ ${game.homeTeamAbbr}: official schedule matchup not found`);
      continue;
    }
    const startDifference = Math.abs(
      Date.parse(scheduleGame.gameDate) - Date.parse(game.startsAt),
    );
    if (!Number.isFinite(startDifference) || startDifference > START_TIME_TOLERANCE_MS) {
      failures.push(`${game.awayTeamAbbr} @ ${game.homeTeamAbbr}: scheduled start does not match official MLB game`);
      continue;
    }

    for (const side of ["away", "home"]) {
      const label = `${game.awayTeamAbbr} @ ${game.homeTeamAbbr} (${side})`;
      const officialPitcher = scheduleGame.teams?.[side]?.probablePitcher;
      const appPrefix = side === "home" ? "home" : "away";
      const appName = game[`${appPrefix}StarterName`];
      const appSeasonEra = finiteNumber(game[`${appPrefix}StarterEra`]);
      const appRecentEra = finiteNumber(game[`${appPrefix}StarterRecentEra`]);

      if (!officialPitcher) {
        unavailableStarters++;
        if (appName != null || appSeasonEra != null || appRecentEra != null) {
          failures.push(`${label}: app shows pitcher data but MLB has no probable starter`);
        } else {
          console.log(`UNAVAILABLE ${label}: MLB has not published a probable starter`);
        }
        continue;
      }

      if (!statsByPitcherId.has(officialPitcher.id)) {
        const statsPayload = await getJson(
          `${MLB_API_BASE_URL}/people/${officialPitcher.id}/stats?stats=season,gameLog&group=pitching&season=${game.gameDate.slice(0, 4)}&gameType=R`,
        );
        const seasonGroup = statsPayload.stats?.find((group) => group.type?.displayName === "season");
        const gameLogGroup = statsPayload.stats?.find((group) => group.type?.displayName === "gameLog");
        const seasonSplit = seasonGroup?.splits?.[0];
        const seasonEra = finiteNumber(seasonSplit?.stat?.era);
        const recent = recentEra(gameLogGroup?.splits ?? []);
        statsByPitcherId.set(officialPitcher.id, {
          name: officialPitcher.fullName,
          identityMatches: seasonSplit?.player?.id === officialPitcher.id,
          seasonEra,
          recentEra: recent,
        });
      }

      const official = statsByPitcherId.get(officialPitcher.id);
      if (
        !official.identityMatches
        || official.seasonEra == null
        || official.recentEra == null
        || appName !== official.name
        || !equalWithinTolerance(appSeasonEra, official.seasonEra)
        || !equalWithinTolerance(appRecentEra, official.recentEra)
      ) {
        failures.push(
          `${label}: app=${appName ?? "none"} ${appSeasonEra ?? "none"}/${appRecentEra ?? "none"} `
          + `official=${official.name} ${official.seasonEra ?? "none"}/${official.recentEra ?? "none"}`,
        );
        continue;
      }

      verifiedStarters++;
      console.log(`VERIFIED ${label}: ${official.name} ${official.seasonEra.toFixed(2)}/${official.recentEra.toFixed(2)}`);
    }
  }

  console.log(`\nAudit summary: ${verifiedStarters} verified starter records, ${unavailableStarters} unavailable starters, ${failures.length} discrepancy(s).`);
  if (failures.length > 0) {
    console.error("\nDiscrepancies:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Pitcher audit failed:", error);
  process.exitCode = 1;
});