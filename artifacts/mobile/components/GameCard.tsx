import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { WinBar } from '@/components/WinBar';
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

  return (
    <Pressable
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      {/* Sport · Time · Value */}
      <View style={styles.topRow}>
        <View style={[styles.sportPill, { backgroundColor: sportColor + '22', borderColor: sportColor + '55' }]}>
          <Text style={[styles.sportText, { color: sportColor }]}>{sport}</Text>
        </View>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>{gameTime}</Text>
        <ValueBadge rating={projection.valueRating} compact />
      </View>

      {/* Teams + Model Score */}
      <View style={styles.teamsRow}>
        <View style={styles.team}>
          <Text style={[styles.abbr, { color: colors.foreground }]}>{homeTeam.abbr}</Text>
          <Text style={[styles.city, { color: colors.mutedForeground }]}>{homeTeam.city}</Text>
          <Text style={[styles.record, { color: colors.mutedForeground }]}>{homeTeam.record}</Text>
        </View>

        <View style={styles.middle}>
          <Text style={[styles.score, { color: colors.primary }]}>{projection.modelScore}</Text>
          <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>MODEL</Text>
          {projection.edge > 0 && (
            <Text style={[styles.edge, { color: colors.win }]}>+{projection.edge.toFixed(1)}%</Text>
          )}
          {projection.edge <= 0 && (
            <Text style={[styles.edge, { color: colors.loss }]}>{projection.edge.toFixed(1)}%</Text>
          )}
        </View>

        <View style={[styles.team, styles.teamRight]}>
          <Text style={[styles.abbr, { color: colors.foreground }]}>{awayTeam.abbr}</Text>
          <Text style={[styles.city, { color: colors.mutedForeground }]}>{awayTeam.city}</Text>
          <Text style={[styles.record, { color: colors.mutedForeground }]}>{awayTeam.record}</Text>
        </View>
      </View>

      {/* Win probability bar */}
      <WinBar
        homeWinPct={projection.homeWinPct}
        homeAbbr={homeTeam.abbr}
        awayAbbr={awayTeam.abbr}
      />

      {/* Vegas line */}
      <View style={[styles.vegasRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.vegasLabel, { color: colors.mutedForeground }]}>VEGAS</Text>
        <Text style={[styles.vegasVal, { color: colors.mutedForeground }]}>
          {fmtOdds(vegasLine.spread)} · O/U {vegasLine.total} · {fmtOdds(vegasLine.homeOdds)}/{fmtOdds(vegasLine.awayOdds)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sportPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  sportText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  time: { flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular' },
  teamsRow: { flexDirection: 'row', alignItems: 'center' },
  team: { flex: 1, gap: 2 },
  teamRight: { alignItems: 'flex-end' },
  abbr: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  city: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  record: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  middle: { flex: 1, alignItems: 'center' },
  score: { fontSize: 32, fontFamily: 'Inter_700Bold' },
  scoreLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginTop: -4 },
  edge: { fontSize: 10, fontFamily: 'Inter_700Bold', marginTop: 2 },
  vegasRow: {
    flexDirection: 'row',
    gap: 6,
    borderTopWidth: 1,
    paddingTop: 10,
    alignItems: 'center',
  },
  vegasLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  vegasVal: { fontSize: 11, fontFamily: 'Inter_400Regular', flex: 1 },
});
