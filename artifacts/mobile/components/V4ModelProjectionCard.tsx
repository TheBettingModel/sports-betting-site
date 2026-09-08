import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { V4PublicProjection } from '@workspace/api-client-react';

function percent(value: number | null | undefined): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}

export function V4ModelProjectionCard({ projection }: { projection: V4PublicProjection }) {
  const colors = useColors();
  const away = projection.awayParticipant ?? 'Away';
  const home = projection.homeParticipant ?? 'Home';
  const winner = projection.projectedWinner === 'HOME'
    ? home
    : projection.projectedWinner === 'AWAY'
      ? away
      : projection.projectedWinner === 'DRAW'
        ? 'Draw'
        : 'Unavailable';
  const startsAt = projection.eventStart ? new Date(projection.eventStart) : null;
  const failureReason = projection.officialFailureReason?.replaceAll('_', ' ');
  const status = projection.lifecycleStatus.replace('V4_', '').replace('_', ' ');

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.metaRow}>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: status === 'APPROVED' ? colors.primary : colors.mutedForeground }]} />
          <Text style={[styles.status, { color: colors.mutedForeground }]}>
            {projection.sport} · {status}
          </Text>
        </View>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {startsAt && !Number.isNaN(startsAt.getTime())
            ? startsAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : 'TBD'}
        </Text>
      </View>

      {projection.expectedAwayScore != null && projection.expectedHomeScore != null ? (
        <View style={[styles.scoreBlock, { backgroundColor: colors.surface }]}>
          <Text style={[styles.projectionLabel, { color: colors.primary }]}>V4 MODEL PROJECTION</Text>
          <Text style={[styles.scoreText, { color: colors.foreground }]}>
            Projected score: {away} {projection.expectedAwayScore.toFixed(1)} – {home} {projection.expectedHomeScore.toFixed(1)}
          </Text>
        </View>
      ) : (
        <View style={styles.matchupBlock}>
          <Text style={[styles.matchup, { color: colors.foreground }]}>{away} at {home}</Text>
          <Text style={[styles.projectionLabel, { color: colors.mutedForeground, marginTop: 14 }]}>
            V4 MODEL PROJECTION
          </Text>
          <Text style={[styles.winner, { color: colors.foreground }]}>{winner}</Text>
        </View>
      )}

      <View style={styles.probabilityRow}>
        <View style={[styles.probCol, { borderRightWidth: 1, borderRightColor: colors.border }]}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{away}</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{percent(projection.awayWinProbability)}</Text>
        </View>
        {projection.drawProbability != null && (
          <View style={[styles.probCol, { borderRightWidth: 1, borderRightColor: colors.border }]}>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Draw</Text>
            <Text style={[styles.metricValue, { color: colors.foreground }]}>{percent(projection.drawProbability)}</Text>
          </View>
        )}
        <View style={styles.probCol}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{home}</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{percent(projection.homeWinProbability)}</Text>
        </View>
      </View>

      <View style={[styles.boundary, { borderTopColor: colors.border }]}>
        <Text style={[styles.boundaryTitle, { color: colors.foreground }]}>
          PROJECTION ONLY · NOT AN OFFICIAL TBM PICK
        </Text>
        <Text style={[styles.boundaryCopy, { color: colors.mutedForeground }]}>
          {failureReason
            ? `No official V4 play: ${failureReason}. This projection does not count toward official picks, units, record, or ROI.`
            : 'This projection does not count toward Top Plays, units, record, or ROI.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 14, padding: 16, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  time: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },

  scoreBlock: { marginTop: 14, padding: 14, borderRadius: 10 },
  scoreText: { marginTop: 8, fontSize: 17, fontFamily: 'Inter_700Bold', letterSpacing: -0.3, lineHeight: 22 },

  matchupBlock: { marginTop: 10 },
  matchup: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  projectionLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  winner: { marginTop: 3, fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },

  probabilityRow: { flexDirection: 'row', marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1E1E1E', paddingTop: 12 },
  probCol: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  metricLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  metricValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },

  boundary: { marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  boundaryTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  boundaryCopy: { marginTop: 6, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});