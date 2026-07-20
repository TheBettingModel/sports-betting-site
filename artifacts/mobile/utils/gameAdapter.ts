import type { GameProjection } from '@workspace/api-client-react';
import type { Game } from '@/data/mockGames';

/**
 * Maps a flat API GameProjection to the nested Game shape
 * expected by all existing components.
 */
export function mapApiGame(g: GameProjection): Game {
  const homeWords = g.homeTeamName.split(' ');
  const awayWords = g.awayTeamName.split(' ');

  return {
    id: g.id,
    sport: g.sport as Game['sport'],
    homeTeam: {
      name: homeWords[homeWords.length - 1] ?? g.homeTeamName,
      abbr: g.homeTeamAbbr,
      record: g.homeTeamRecord,
      city: homeWords.slice(0, -1).join(' ') || g.homeTeamName,
    },
    awayTeam: {
      name: awayWords[awayWords.length - 1] ?? g.awayTeamName,
      abbr: g.awayTeamAbbr,
      record: g.awayTeamRecord,
      city: awayWords.slice(0, -1).join(' ') || g.awayTeamName,
    },
    gameTime: g.gameTime,
    status: (g.status ?? 'upcoming') as Game['status'],
    projection: {
      homeWinPct: g.homeWinPct,
      confidence: g.confidence as 'High' | 'Medium' | 'Low',
      projectedSpread: g.projectedSpread,
      projectedTotal: g.projectedTotal,
      valueRating: g.valueRating as 'Strong Buy' | 'Buy' | 'Neutral' | 'Fade',
      modelScore: g.modelScore,
      edge: g.edge,
    },
    vegasLine: {
      spread: g.vegasSpread,
      total: g.vegasTotal,
      homeOdds: g.vegasHomeOdds,
      awayOdds: g.vegasAwayOdds,
    },
  };
}
