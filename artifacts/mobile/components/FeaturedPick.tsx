import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ValueBadge } from '@/components/ValueBadge';
import type { Game } from '@/data/mockGames';

function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

interface FeaturedPickProps {
  game: Game;
}

export function FeaturedPick({ game }: FeaturedPickProps) {
  const colors = useColors();
  const { homeTeam, awayTeam, gameTime, sport, projection, vegasLine, insights } = game;
  const isFade = projection.valueRating === 'Fade';
  const isNeutral = projection.valueRating === 'Neutral';
  const pickTeam = projection.edge >= 0 ? homeTeam : awayTeam;
  const edgeAbs = Math.abs(projection.edge);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Lime gradient header band */}
      <View style={styles.gradientBand}>
        <Text style={styles.bandLeft}>
          {sport} · ⭐ TOP PICK
        </Text>
        <Text style={styles.bandRight}>{gameTime}</Text>
      </View>

      <View style={styles.body}>
        {/* Matchup heading */}
        <View style={styles.matchupRow}>
          <Text style={[styles.matchupText, { color: colors.foreground }]}>
            {homeTeam.abbr}{' '}
            <Text style={[styles.vsText, { color: colors.mutedForeground }]}>vs</Text>
            {' '}{awayTeam.abbr}
          </Text>
          <Text style={[styles.matchupFull, { color: colors.mutedForeground }]}>
            {homeTeam.city} {homeTeam.name} vs {awayTeam.city} {awayTeam.name}
          </Text>
        </View>

        {/* Model score + badge */}
        <View style={[styles.scoreRow, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>MODEL SCORE</Text>
            <View style={styles.scoreInline}>
              <Text style={[styles.scoreNum, { color: colors.foreground }]}>
                {projection.modelScore}
              </Text>
              <Text style={[styles.scoreDenom, { color: colors.primary }]}>/100</Text>
            </View>
          </View>
          <ValueBadge rating={projection.valueRating} />
        </View>

        {/* Win probability + edge */}
        {!isFade && !isNeutral && (
          <View style={styles.winRow}>
            <View>
              <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>WIN PROBABILITY</Text>
              <Text style={[styles.winPct, { color: colors.foreground }]}>
                {projection.homeWinPct}%{' '}
                <Text style={[styles.winSub, { color: colors.mutedForeground }]}>HOME WIN</Text>
              </Text>
            </View>
            <View style={[styles.edgeChip, { backgroundColor: colors.primary + '1A' }]}>
              <Text style={[styles.edgeText, { color: colors.primary }]}>
                EDGE: {pickTeam.abbr} +{edgeAbs.toFixed(1)}%
              </Text>
            </View>
          </View>
        )}

        {/* Vegas row */}
        <View style={[styles.vegasRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.vegasItem, { color: colors.mutedForeground }]}>
            VEGAS · {fmtOdds(vegasLine.homeOdds)}
          </Text>
          <Text style={[styles.vegasDivider, { color: colors.border }]}>|</Text>
          <Text style={[styles.vegasItem, { color: colors.mutedForeground }]}>
            O/U · {vegasLine.total}
          </Text>
          <Text style={[styles.vegasDivider, { color: colors.border }]}>|</Text>
          <Text style={[styles.vegasItem, { color: colors.mutedForeground }]}>
            SPREAD · {vegasLine.spread > 0 ? '+' : ''}{vegasLine.spread}
          </Text>
        </View>

        {/* Model signals — kept as a compact chip row */}
        {insights && insights.length > 0 && (
          <View style={styles.insightsRow}>
            {insights.slice(0, 2).map((text, i) => (
              <View
                key={i}
                style={[styles.insightChip, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <Text style={[styles.insightText, { color: colors.mutedForeground }]}>{text}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // Gradient band — simulated with solid lime (RN doesn't support CSS gradients; LinearGradient optional)
  gradientBand: {
    backgroundColor: '#84CC16',
    paddingVertical: 9,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bandLeft: {
    color: '#000000',
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
  },
  bandRight: {
    color: 'rgba(0,0,0,0.65)',
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },

  body: { padding: 16, gap: 16 },

  // Matchup
  matchupRow: { gap: 2 },
  matchupText: { fontSize: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.5, lineHeight: 32 },
  vsText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  matchupFull: { fontSize: 12, fontFamily: 'Inter_400Regular' },

  // Score
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    paddingBottom: 16,
  },
  scoreLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  scoreInline: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  scoreNum: { fontSize: 56, fontFamily: 'Inter_700Bold', lineHeight: 60, letterSpacing: -1 },
  scoreDenom: { fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 6 },

  // Win prob
  winRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  winPct: { fontSize: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  winSub: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  edgeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-end',
  },
  edgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },

  // Vegas
  vegasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  vegasItem: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5, textTransform: 'uppercase' },
  vegasDivider: { fontSize: 14 },

  // Insights
  insightsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  insightChip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  insightText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
});
