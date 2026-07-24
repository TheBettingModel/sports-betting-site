import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { ValueBadge } from '@/components/ValueBadge';
import { TeamLogo } from '@/components/TeamLogo';
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
  const { homeTeam, awayTeam, gameTime, sport, projection } = game;
  const sportColor = SPORT_COLORS[sport] ?? colors.primary;

  const isNeutral = projection.valueRating === 'Neutral';
  const isFade = projection.valueRating === 'Fade';
  const showEdge = !isNeutral && !isFade;
  const edgeTeam = projection.edge >= 0 ? homeTeam : awayTeam;

  const units = projection.units;
  const stars = projection.finalModelStars;
  const showUnits = showEdge && units != null && units > 0;

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
      {/* Top row: logos + matchup + meta */}
      <View style={styles.topRow}>
        {/* Logo matchup block */}
        <View style={styles.matchupBlock}>
          <TeamLogo sport={sport} espnId={homeTeam.espnId} abbr={homeTeam.abbr} size={36} />
          <View style={styles.matchupCenter}>
            <Text style={[styles.vs, { color: colors.mutedForeground }]}>vs</Text>
            <Text style={[styles.records, { color: colors.mutedForeground }]}>
              {homeTeam.record} · {awayTeam.record}
            </Text>
          </View>
          <TeamLogo sport={sport} espnId={awayTeam.espnId} abbr={awayTeam.abbr} size={36} />
        </View>

        {/* Sport + time */}
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {sport}{'\n'}{gameTime}
        </Text>
      </View>

      {/* Team abbrs below logos */}
      <View style={styles.abbrRow}>
        <Text style={[styles.abbr, { color: colors.foreground }]}>{homeTeam.abbr}</Text>
        <View style={styles.abbrSpacer} />
        <Text style={[styles.abbr, { color: colors.foreground }]}>{awayTeam.abbr}</Text>
      </View>

      {/* Bottom row: score + badge + units + edge */}
      <View style={styles.bottomRow}>
        <View style={styles.scoreBlock}>
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
          {stars != null && stars >= 4 && (
            <Text style={styles.starBadge}>{'★'.repeat(stars)}</Text>
          )}
        </View>

        <ValueBadge rating={projection.valueRating} compact />

        {showUnits && (
          <View style={[styles.unitsPill, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.unitsText, { color: colors.primary }]}>
              {units!.toFixed(1)}u
            </Text>
          </View>
        )}

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
    gap: 8,
  },

  // Top row
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchupBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  matchupCenter: {
    alignItems: 'center',
    gap: 2,
  },
  vs: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  records: {
    fontSize: 9,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.2,
  },
  meta: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'right',
    lineHeight: 14,
  },

  // Abbr row beneath logos
  abbrRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  abbr: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
    width: 36,
    textAlign: 'center',
  },
  abbrSpacer: { flex: 1 },

  // Bottom row
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  scoreBlock: { gap: 1 },
  scoreInline: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  score: { fontSize: 28, fontFamily: 'Inter_700Bold', lineHeight: 32, letterSpacing: -0.5 },
  scoreDenom: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  starBadge: { fontSize: 10, color: '#84CC16', letterSpacing: 0.5 },
  unitsPill: {
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unitsText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  edge: { marginLeft: 'auto', fontSize: 13, fontFamily: 'Inter_700Bold' },
  noEdge: { marginLeft: 'auto', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
