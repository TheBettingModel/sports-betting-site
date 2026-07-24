import type { GameProjection } from '@workspace/api-client-react';
import type { Game } from '@/data/mockGames';

/**
 * Derives 1–2 short insight strings from existing projection fields.
 * No extra API data needed — everything is already in GameProjection.
 *
 * Priority order:
 *   1. Large model-vs-Vegas spread discrepancy (clearest signal of value)
 *   2. High market edge %
 *   3. Implied probability gap (model win% vs Vegas moneyline)
 *   4. Dominant win probability (≥70%)
 */
function computeInsights(g: GameProjection): string[] {
  const insights: string[] = [];
  const edgeAbs = Math.abs(g.edge);
  const pickIsHome = g.edge >= 0;
  const pickAbbr = pickIsHome ? g.homeTeamAbbr : g.awayTeamAbbr;
  const favoredWinPct = Math.max(g.homeWinPct, 100 - g.homeWinPct);
  const favoredAbbr = g.homeWinPct >= 50 ? g.homeTeamAbbr : g.awayTeamAbbr;

  // 1. Spread discrepancy
  const spreadDiff = Math.abs(g.projectedSpread - g.vegasSpread);
  if (spreadDiff >= 2.0) {
    insights.push(`Model line ${spreadDiff.toFixed(1)} pts off Vegas spread`);
  }

  // 2. Strong edge vs market
  if (edgeAbs >= 12) {
    insights.push(`${pickAbbr} +${edgeAbs.toFixed(1)}% edge vs market`);
  } else if (edgeAbs >= 7 && insights.length === 0) {
    insights.push(`+${edgeAbs.toFixed(1)}% edge vs market`);
  }

  // 3. Implied probability gap (model win% vs moneyline implied odds)
  if (insights.length < 2) {
    const ml = g.vegasHomeOdds;
    const vegasImplied = ml < 0
      ? (Math.abs(ml) / (Math.abs(ml) + 100)) * 100
      : (100 / (ml + 100)) * 100;
    const impliedGap = Math.abs(g.homeWinPct - vegasImplied);
    if (impliedGap >= 9) {
      insights.push(`${impliedGap.toFixed(0)}% gap vs Vegas implied odds`);
    }
  }

  // 4. Dominant win probability
  if (favoredWinPct >= 70 && insights.length < 2) {
    insights.push(`${favoredAbbr} ${favoredWinPct}% model win probability`);
  }

  return insights.slice(0, 2);
}

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
    league: g.league ?? undefined,
    isLocked: g.isLocked ?? false,
    insights: g.isLocked ? undefined : computeInsights(g),
    homeTeam: {
      name: homeWords[homeWords.length - 1] ?? g.homeTeamName,
      abbr: g.homeTeamAbbr,
      espnId: g.homeTeamId ?? undefined,
      logoUrl: g.homeTeamLogo ?? undefined,
      record: g.homeTeamRecord,
      city: homeWords.slice(0, -1).join(' ') || g.homeTeamName,
    },
    awayTeam: {
      name: awayWords[awayWords.length - 1] ?? g.awayTeamName,
      abbr: g.awayTeamAbbr,
      espnId: g.awayTeamId ?? undefined,
      logoUrl: g.awayTeamLogo ?? undefined,
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
      // Phase 1
      confidenceNum: g.confidenceNum ?? undefined,
      units: g.units ?? undefined,
      sharpScore: g.sharpScore ?? undefined,
      sharpSignal: g.sharpSignal ?? undefined,
      finalModelScore: g.finalModelScore ?? undefined,
      finalModelTier: g.finalModelTier ?? undefined,
      finalModelStars: g.finalModelStars ?? undefined,
      podScore: g.podScore ?? undefined,
    },
    vegasLine: {
      spread: g.vegasSpread,
      total: g.vegasTotal,
      homeOdds: g.vegasHomeOdds,
      awayOdds: g.vegasAwayOdds,
      drawOdds: g.vegasDrawOdds || undefined,
    },
  };
}
