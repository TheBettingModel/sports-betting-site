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

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.metaRow}>
        <Text style={[styles.status, { color: colors.primary }]}>
          {projection.sport} · {projection.lifecycleStatus.replaceAll('_', ' ')}
        </Text>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>
          {startsAt && !Number.isNaN(startsAt.getTime())
            ? startsAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : 'TBD'}
        </Text>
      </View>
      <Text style={[styles.matchup, { color: colors.foreground }]}>{away} at {home}</Text>
      <Text style={[styles.projectionLabel, { color: colors.mutedForeground }]}>
        V4 MODEL PROJECTION
      </Text>
      <Text style={[styles.winner, { color: colors.foreground }]}>{winner}</Text>
      <View style={styles.probabilityRow}>
        <Text style={[styles.metric, { color: colors.mutedForeground }]}>{away} {percent(projection.awayWinProbability)}</Text>
        {projection.drawProbability != null && (
          <Text style={[styles.metric, { color: colors.mutedForeground }]}>Draw {percent(projection.drawProbability)}</Text>
        )}
        <Text style={[styles.metric, { color: colors.mutedForeground }]}>{home} {percent(projection.homeWinProbability)}</Text>
      </View>
      {projection.expectedAwayScore != null && projection.expectedHomeScore != null && (
        <Text style={[styles.score, { color: colors.mutedForeground }]}>
          Projected score: {away} {projection.expectedAwayScore.toFixed(1)} – {home} {projection.expectedHomeScore.toFixed(1)}
        </Text>
      )}
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
  card: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 14, padding: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  status: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  time: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  matchup: { marginTop: 10, fontSize: 14, fontFamily: 'Inter_700Bold' },
  projectionLabel: { marginTop: 14, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  winner: { marginTop: 3, fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  probabilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  metric: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  score: { marginTop: 8, fontSize: 11, fontFamily: 'Inter_500Medium' },
  boundary: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  boundaryTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  boundaryCopy: { marginTop: 4, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
});