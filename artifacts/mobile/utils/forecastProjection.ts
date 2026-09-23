interface ForecastGame {
  projection: { homeWinPct: number };
  homeTeam: { abbr: string };
  awayTeam: { abbr: string };
  vegasLine: { homeOdds: number; awayOdds: number };
}

export interface ForecastMoneylineIdentity {
  selection: 'home' | 'away';
  teamAbbr: string;
  probability: number;
  marketOdds: number;
  fairPrice: number;
}

export function fairAmericanOdds(probability: number): number {
  const decimalProbability = Math.min(Math.max(probability, 0.01), 99.99) / 100;
  return decimalProbability >= 0.5
    ? Math.round(-(decimalProbability / (1 - decimalProbability)) * 100)
    : Math.round(((1 - decimalProbability) / decimalProbability) * 100);
}

export function getForecastMoneylineIdentity(game: ForecastGame): ForecastMoneylineIdentity {
  const selection = game.projection.homeWinPct >= 50 ? 'home' : 'away';
  const probability = selection === 'home'
    ? game.projection.homeWinPct
    : 100 - game.projection.homeWinPct;

  return {
    selection,
    teamAbbr: selection === 'home' ? game.homeTeam.abbr : game.awayTeam.abbr,
    probability,
    marketOdds: selection === 'home' ? game.vegasLine.homeOdds : game.vegasLine.awayOdds,
    fairPrice: fairAmericanOdds(probability),
  };
}