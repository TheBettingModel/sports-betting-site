import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { ValueBadge } from '@/components/ValueBadge';
import type { Game } from '@/data/mockGames';

const SPORT_COLORS: Record<string, string> = {
  NFL: '#4F46E5',
  NBA: '#EA580C',
  MLB: '#0EA5E9',
  NHL: '#8B5CF6',
  Soccer: '#22C55E',
  UFC: '#DC2626',
  WNBA: '#FF6900',
};

function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

interface GameCardProps {
  game: Game;
}

export function GameCard({ game }: GameCardProps) {
  const colors = useColors();
  const { homeTeam, awayTeam, gameTime, sport, projection, vegasLine } = game;
  const sportColor = SPORT_COLORS[sport] ?? colors.primary;

  const isNeutral = projection.valueRating === 'Neutral';
  const isFade = projection.valueRating === 'Fade';
  const showEdge = !isNeutral && !isFade;
  const edgeTeam = projection.edge >= 0 ? homeTeam : awayTeam;

  return (
    <Pressable
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderBottomColor: colors.border,
          borderRightColor: colors.border,
          borderLeftColor: sportColor,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      {/* Top row: matchup + sport/time */}
      <View style={styles.topRow}>
        <Text style={[styles.matchup, { color: colors.foreground }]}>
          {homeTeam.abbr}{' '}
          <Text style={[styles.vs, { color: colors.mutedForeground }]}>vs</Text>
          {' '}{awayTeam.abbr}
        </Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {sport} · {gameTime}
        </Text>
      </View>

      {/* Bottom row: score + badge + edge */}
      <View style={styles.bottomRow}>
        <View style={styles.scoreInline}>
          <Text style={[
            styles.score,
            { color: showEdge ? colors.foreground : colors.mutedForeground },
          ]}>
            {projection.modelScore}
          </Text>
          <Text style={[
            styles.scoreDenom,
            { color: showEdge ? colors.primary : colors.mutedForeground },
          ]}>
            /100
          </Text>
        </View>

        <ValueBadge rating={projection.valueRating} compact />

        {showEdge ? (
          <Text style={[styles.edge, { color: colors.primary }]}>
            {edgeTeam.abbr} +{Math.abs(projection.edge).toFixed(1)}%
          </Text>
        ) : (
          <Text style={[styles.noEdge, { color: colors.mutedForeground }]}>NO EDGE</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderLeftWidth: 4,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  matchup: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.3, lineHeight: 26 },
  vs: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  meta: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textAlign: 'right', marginTop: 2 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scoreInline: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  score: { fontSize: 30, fontFamily: 'Inter_700Bold', lineHeight: 34, letterSpacing: -0.5 },
  scoreDenom: { fontSize: 13, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  edge: { marginLeft: 'auto', fontSize: 13, fontFamily: 'Inter_700Bold' },
  noEdge: { marginLeft: 'auto', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
