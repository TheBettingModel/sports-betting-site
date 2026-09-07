type AnyGame = Record<string, unknown>;

/** Produces a locked card from an explicit schedule-only public allowlist. */
export function lockGame(game: AnyGame): AnyGame {
  return {
    id: game["id"], sport: game["sport"], league: game["league"],
    homeTeamId: game["homeTeamId"], awayTeamId: game["awayTeamId"],
    homeTeamAbbr: game["homeTeamAbbr"], homeTeamName: game["homeTeamName"],
    homeTeamRecord: game["homeTeamRecord"], homeTeamLogo: game["homeTeamLogo"],
    awayTeamAbbr: game["awayTeamAbbr"], awayTeamName: game["awayTeamName"],
    awayTeamRecord: game["awayTeamRecord"], awayTeamLogo: game["awayTeamLogo"],
    gameTime: game["gameTime"], gameDate: game["gameDate"], status: game["status"],
    homeScore: game["homeScore"], awayScore: game["awayScore"], isLocked: true,
  };
}

/** Only exposes the persisted market when the combined display chooses it. */
export function unlockExactFreeMarket(game: AnyGame, market: string, selection: string): AnyGame {
  const selected = game["selectedPick"] as Record<string, unknown> | null;
  if (!selected || selected["market"] !== market || selected["selection"] !== selection) return lockGame(game);
  return { ...lockGame(game), isLocked: false, selectedMarket: market, selectedPick: selected };
}