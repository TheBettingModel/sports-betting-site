import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { TeamLogo } from '@/components/TeamLogo';
import type { GameProjection } from '@workspace/api-client-react';

function nickname(name: string): string {
  const parts = name.trim().split(' ');
  return parts[parts.length - 1] ?? name;
}

export function FreeGameProjectionCard({ game, slateDate }: { game: GameProjection; slateDate: string }) {
  const colors = useColors();
  const isLiveOrFinal = game.status === 'live' || game.status === 'final' || game.status === 'completed';
  const projected = game.homeWinPct >= 50 ? nickname(game.homeTeamName) : nickname(game.awayTeamName);

  return (
    <Link href={`/game/${game.id}?sport=${game.sport}&slateDate=${slateDate}`} asChild>
      <Pressable
        testID={`free-game-${game.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Open ${game.awayTeamName} at ${game.homeTeamName} projected outcome`}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.62 : 1 }]}
      >
        <View style={styles.teams}>
          <View style={styles.teamRow}>
            <TeamLogo sport={game.sport} abbr={game.awayTeamAbbr} logoUrl={game.awayTeamLogo ?? undefined} size={22} />
            <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={1}>{nickname(game.awayTeamName)}</Text>
            {isLiveOrFinal && game.awayScore != null && <Text style={[styles.score, { color: colors.foreground }]}>{game.awayScore}</Text>}
          </View>
          <View style={styles.teamRow}>
            <TeamLogo sport={game.sport} abbr={game.homeTeamAbbr} logoUrl={game.homeTeamLogo ?? undefined} size={22} />
            <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={1}>{nickname(game.homeTeamName)}</Text>
            {isLiveOrFinal && game.homeScore != null && <Text style={[styles.score, { color: colors.foreground }]}>{game.homeScore}</Text>}
          </View>
        </View>
        <View style={styles.meta}>
          <Text style={[styles.time, { color: isLiveOrFinal ? colors.primary : colors.mutedForeground }]}>
            {game.status === 'live' ? 'LIVE' : isLiveOrFinal ? 'FINAL' : game.gameTime}
          </Text>
          <View style={[styles.badge, { backgroundColor: colors.primary + '18' }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>{projected.toUpperCase()} PROJECTED</Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: { marginHorizontal: 16, marginBottom: 4, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teams: { flex: 1, gap: 10 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  teamName: { flex: 1, fontSize: 16, fontFamily: 'Inter_700Bold' },
  score: { width: 28, textAlign: 'right', fontSize: 16, fontFamily: 'Inter_700Bold' },
  meta: { alignItems: 'flex-end', gap: 8, paddingLeft: 14 },
  time: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  badge: { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 4 },
  badgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.45 },
});