import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { V4OfficialPick } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

function percent(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value <= 1 ? value * 100 : value).toFixed(1)}%`;
}

function odds(value: number | null | undefined): string {
  if (value == null) return 'Odds unavailable';
  return value > 0 ? `+${value}` : `${value}`;
}

function selectionLabel(pick: V4OfficialPick): string {
  const selection = pick.selection.toLowerCase();
  if (selection === 'home') return pick.homeParticipant ?? 'Home';
  if (selection === 'away') return pick.awayParticipant ?? 'Away';
  if (selection === 'over') return 'Over';
  if (selection === 'under') return 'Under';
  if (selection === 'draw') return 'Draw';
  return pick.selection;
}

export function V4OfficialPickCard({ pick }: { pick: V4OfficialPick }) {
  const colors = useColors();
  const away = pick.awayParticipant ?? 'Away';
  const home = pick.homeParticipant ?? 'Home';
  const role = pick.role === 'TOP_PLAY' ? 'TBM OFFICIAL TOP PLAY' : 'TBM OFFICIAL PLAY';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.metaRow}>
        <Text style={[styles.status, { color: colors.primary }]}>{pick.sport} · {role}</Text>
        <Text style={[styles.rank, { color: colors.mutedForeground }]}>#{pick.rank}</Text>
      </View>
      <Text style={[styles.matchup, { color: colors.foreground }]}>{away} at {home}</Text>
      <Text style={[styles.market, { color: colors.mutedForeground }]}>{pick.market.toUpperCase()}</Text>
      <Text style={[styles.selection, { color: colors.foreground }]}>{selectionLabel(pick)}</Text>
      <Text style={[styles.price, { color: colors.primary }]}>{odds(pick.odds)} · {pick.units}U</Text>
      <View style={styles.metrics}>
        <Text style={[styles.metric, { color: colors.mutedForeground }]}>Model {percent(pick.modelProbability)}</Text>
        <Text style={[styles.metric, { color: colors.mutedForeground }]}>Fair {percent(pick.fairProbability)}</Text>
      </View>
      <View style={[styles.boundary, { borderTopColor: colors.border }]}>
        <Text style={[styles.official, { color: colors.foreground }]}>{role} · PERSISTED · {pick.units}U</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 14, padding: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  status: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: .8 },
  rank: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  matchup: { marginTop: 10, fontSize: 14, fontFamily: 'Inter_700Bold' },
  market: { marginTop: 14, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  selection: { marginTop: 3, fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -.7 },
  price: { marginTop: 5, fontSize: 14, fontFamily: 'Inter_700Bold' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  metric: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  boundary: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  official: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: .7 },
});