import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { V4OfficialPick } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { TeamLogo } from '@/components/TeamLogo';

function percent(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value <= 1 ? value * 100 : value).toFixed(1)}%`;
}

function odds(value: number | null | undefined): string {
  if (value == null) return '—';
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
  const [expanded, setExpanded] = useState(false);
  const away = pick.awayParticipant ?? 'Away';
  const home = pick.homeParticipant ?? 'Home';
  const isTopPlay = pick.role === 'TOP_PLAY';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: isTopPlay ? colors.primary : colors.border }]}>
      <View style={[styles.meta, { borderBottomColor: isTopPlay ? colors.primary + '33' : colors.border, backgroundColor: isTopPlay ? colors.primary + '0D' : 'transparent' }]}>
        <View style={styles.metaLeft}>
          <Text style={[styles.sport, { color: isTopPlay ? colors.primary : colors.foreground }]}>{pick.sport}</Text>
          <View style={[styles.dot, { backgroundColor: isTopPlay ? colors.primary : colors.mutedForeground }]} />
          <Text style={[styles.state, { color: isTopPlay ? colors.primary : colors.mutedForeground }]}>OFFICIAL TBM PLAY</Text>
        </View>
        <Text style={[styles.rankHint, { color: colors.mutedForeground }]}>#{pick.rank}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.matchupRow}>
          {pick.awayParticipantAbbr && <TeamLogo sport={pick.sport} abbr={pick.awayParticipantAbbr} logoUrl={pick.awayParticipantLogo ?? undefined} size={30} />}
          <Text style={[styles.matchup, { color: colors.foreground }]} numberOfLines={1}>{away} vs. {home}</Text>
          {pick.homeParticipantAbbr && <TeamLogo sport={pick.sport} abbr={pick.homeParticipantAbbr} logoUrl={pick.homeParticipantLogo ?? undefined} size={30} />}
        </View>

        <View style={styles.pickBlock}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>PICK · {pick.market.toUpperCase()}</Text>
          <Text style={[styles.selection, { color: colors.foreground }]} numberOfLines={1}>{selectionLabel(pick)}</Text>
        </View>

        <View style={styles.stateRow}>
          <View style={[styles.stateDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.stateText, { color: colors.primary }]}>OFFICIAL TBM PLAY</Text>
          <Text style={[styles.units, { color: colors.foreground }]}>{pick.units} Unit</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? 'Hide analysis' : 'View analysis'}
          onPress={() => setExpanded(value => !value)}
          style={({ pressed }) => [styles.analysisButton, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
        >
          <Text style={[styles.analysisText, { color: colors.foreground }]}>{expanded ? 'Hide Analysis' : 'View Analysis'}</Text>
          <Text style={[styles.chevron, { color: colors.primary }]}>{expanded ? '−' : '+'}</Text>
        </Pressable>

        {expanded && (
          <View style={[styles.analysis, { borderTopColor: colors.border }]}>
            <Text style={[styles.analysisHeading, { color: colors.foreground }]}>Analysis</Text>
            <View style={styles.detailGrid}>
              <Detail label="Model probability" value={percent(pick.modelProbability)} colors={colors} />
              <Detail label="Fair probability" value={percent(pick.fairProbability)} colors={colors} />
              <Detail label="Odds" value={odds(pick.odds)} colors={colors} />
              <Detail label="Rank" value={`#${pick.rank}`} colors={colors} />
              {pick.modelVersion && <Detail label="Model version" value={pick.modelVersion} colors={colors} />}
              {pick.artifactId && <Detail label="Artifact identity" value={pick.artifactId} colors={colors} />}
              {pick.artifactHash && <Detail label="Artifact hash" value={pick.artifactHash} colors={colors} />}
              {pick.marketEvidenceId && <Detail label="Market evidence" value={pick.marketEvidenceId} colors={colors} />}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function Detail({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.detail}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  meta: { paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  sport: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  state: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5, flexShrink: 1 },
  rankHint: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  content: { padding: 14 },
  matchupRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  matchup: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  pickBlock: { marginTop: 17 },
  label: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  selection: { fontSize: 23, fontFamily: 'Inter_700Bold', marginTop: 3 },
  stateRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateDot: { width: 5, height: 5, borderRadius: 3 },
  stateText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  units: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginLeft: 2 },
  analysisButton: { marginTop: 14, minHeight: 38, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  analysisText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.4 },
  chevron: { fontSize: 19, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  analysis: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  analysisHeading: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 11 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detail: { width: '46%' },
  detailLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  detailValue: { fontSize: 12, fontFamily: 'Inter_700Bold', marginTop: 3 },
});