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
  const isTopPlay = pick.role === 'TOP_PLAY';
  const role = isTopPlay ? 'TBM OFFICIAL TOP PLAY' : 'TBM OFFICIAL PLAY';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: isTopPlay ? colors.primary + '80' : colors.border }]}>
      <View style={styles.metaRow}>
        <View style={styles.badgeRow}>
          {isTopPlay && (
            <View style={[styles.topPlayBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.topPlayText}>TOP PLAY</Text>
            </View>
          )}
          <Text style={[styles.status, { color: isTopPlay ? colors.foreground : colors.primary }]}>{pick.sport} · {role}</Text>
        </View>
        <Text style={[styles.rank, { color: colors.mutedForeground }]}>#{pick.rank}</Text>
      </View>
      <Text style={[styles.matchup, { color: colors.foreground }]}>{away} at {home}</Text>

      <View style={[styles.selectionBlock, { backgroundColor: colors.surface }]}>
        <Text style={[styles.market, { color: colors.mutedForeground }]}>{pick.market.toUpperCase()}</Text>
        <Text style={[styles.selection, { color: colors.foreground }]} numberOfLines={1}>{selectionLabel(pick)}</Text>
        <Text style={[styles.price, { color: colors.primary }]}>{odds(pick.odds)} · {pick.units}U</Text>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Model Edge</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{percent(pick.modelProbability)}</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>Fair Prob</Text>
          <Text style={[styles.metricValue, { color: colors.foreground }]}>{percent(pick.fairProbability)}</Text>
        </View>
      </View>

      <View style={[styles.boundary, { borderTopColor: colors.border }]}>
        <Text style={[styles.official, { color: colors.foreground }]}>{role} · PERSISTED · {pick.units}U</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 14, padding: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topPlayBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  topPlayText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#000', letterSpacing: 0.5 },
  status: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: .8 },
  rank: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  matchup: { marginTop: 12, fontSize: 14, fontFamily: 'Inter_700Bold' },

  selectionBlock: { marginTop: 12, padding: 12, borderRadius: 10 },
  market: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  selection: { marginTop: 4, fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -.7 },
  price: { marginTop: 4, fontSize: 14, fontFamily: 'Inter_700Bold' },

  metrics: { flexDirection: 'row', gap: 24, marginTop: 14, paddingHorizontal: 4 },
  metricItem: { gap: 2 },
  metricLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  metricValue: { fontSize: 13, fontFamily: 'Inter_700Bold' },

  boundary: { marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  official: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: .7 },
});