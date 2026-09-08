import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { TeamLogo } from '@/components/TeamLogo';
import type { V4PublicProjection } from '@workspace/api-client-react';

const TWO_WORD_NICKNAMES = [
  'Red Sox', 'White Sox', 'Blue Jays', 'Maple Leafs', 'Golden Knights',
  'Blue Jackets', 'Red Wings', 'Trail Blazers', 'Fighting Irish',
  'Nittany Lions', 'Demon Deacons', 'Horned Frogs', 'Yellow Jackets',
  'Sun Devils', 'Ragin\' Cajuns', 'Scarlet Knights', 'Mean Green',
  'Green Wave', 'Golden Hurricane', 'Golden Eagles', 'Golden Flashes',
  'Golden Panthers', 'Golden Bears', 'Bald Eagles', 'Salukis',
  'Raging Bulls', 'Thundering Herd', 'Red Wolves', 'Red Raiders',
  'Black Knights', 'Black Bears', 'Blackbirds', 'Blue Raiders',
  'Blue Demons', 'Blue Hens', 'Blue Devils', 'Blue Hose',
  'Great Danes', 'Minutemen', 'Tar Heels', 'Golden Gophers'
];

function nickname(fullName: string): string {
  if (!fullName) return '';
  const lower = fullName.toLowerCase();
  for (const nick of TWO_WORD_NICKNAMES) {
    if (lower.endsWith(nick.toLowerCase())) {
      return nick;
    }
  }
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1] ?? fullName;
}

function percent(value: number | null | undefined): string {
  return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function selection(projection: V4PublicProjection, away: string, home: string): string {
  if (projection.projectedWinner === 'HOME') return `${nickname(home)} ML`;
  if (projection.projectedWinner === 'AWAY') return `${nickname(away)} ML`;
  if (projection.projectedWinner === 'DRAW') return 'Draw';
  return 'Unavailable';
}

export function V4ModelProjectionCard({ projection }: { projection: V4PublicProjection }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const away = projection.awayParticipant ?? 'Away';
  const home = projection.homeParticipant ?? 'Home';
  const awayAbbr = projection.awayParticipantAbbr;
  const homeAbbr = projection.homeParticipantAbbr;
  const expectedAwayScore = projection.expectedAwayScore;
  const expectedHomeScore = projection.expectedHomeScore;
  const status = projection.lifecycleStatus.replace('V4_', '').replaceAll('_', ' ');
  const startsAt = projection.eventStart ? new Date(projection.eventStart) : null;
  const time = startsAt && !Number.isNaN(startsAt.getTime())
    ? startsAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'TBD';
  const modelSelection = selection(projection, away, home);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.meta, { borderBottomColor: colors.border }]}>
        <View style={styles.metaLeft}>
          <Text style={[styles.sport, { color: colors.foreground }]}>{projection.sport}</Text>
          <View style={[styles.dot, { backgroundColor: status === 'APPROVED' ? colors.primary : colors.mutedForeground }]} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{status}</Text>
        </View>
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{time}</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.matchupRow}>
          {awayAbbr && <TeamLogo sport={projection.sport} abbr={awayAbbr} logoUrl={projection.awayParticipantLogo ?? undefined} size={24} />}
          <Text style={[styles.matchup, { color: colors.foreground }]} numberOfLines={1}>{nickname(away)}</Text>
          <Text style={[styles.vs, { color: colors.mutedForeground }]}>vs.</Text>
          {homeAbbr && <TeamLogo sport={projection.sport} abbr={homeAbbr} logoUrl={projection.homeParticipantLogo ?? undefined} size={24} />}
          <Text style={[styles.matchup, { color: colors.foreground }]} numberOfLines={1}>{nickname(home)}</Text>
        </View>

        <View style={styles.pickBlock}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>PICK</Text>
          <Text style={[styles.selectionText, { color: colors.foreground }]}>{modelSelection}</Text>
        </View>

        <View style={styles.stateRow}>
          <View style={[styles.stateDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.stateText, { color: colors.primary }]}>MODEL PROJECTION</Text>
          <Text style={[styles.stateSecondary, { color: colors.mutedForeground }]}>Not an Official Play</Text>
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
            <Text style={[styles.analysisHeading, { color: colors.foreground }]}>Model Projection</Text>
            <View style={styles.detailGrid}>
              <Detail label="Projected score" value={`${nickname(away)} ${expectedAwayScore == null ? '—' : expectedAwayScore.toFixed(1)} – ${nickname(home)} ${expectedHomeScore == null ? '—' : expectedHomeScore.toFixed(1)}`} colors={colors} />
              <Detail label="Win probability" value={`${nickname(away)} ${percent(projection.awayWinProbability)} · ${nickname(home)} ${percent(projection.homeWinProbability)}`} colors={colors} />
              {projection.drawProbability != null && (
                <Detail label="Draw probability" value={percent(projection.drawProbability)} colors={colors} />
              )}
              <Detail label="Projected winner" value={projection.projectedWinner ?? 'Unavailable'} colors={colors} />
              <Detail label="Expected margin" value={projection.expectedMargin == null ? '—' : projection.expectedMargin.toFixed(1)} colors={colors} />
              <Detail label="Expected total" value={projection.expectedTotal == null ? '—' : projection.expectedTotal.toFixed(1)} colors={colors} />
              <Detail label="Model version" value={projection.modelVersion} colors={colors} />
            </View>
            {(projection.awayStarterName || projection.homeStarterName) && (
              <View style={styles.pitchers}>
                <Text style={[styles.analysisHeading, { color: colors.foreground }]}>Pitcher Matchup</Text>
                <View style={styles.pitcherRow}>
                  <Pitcher
                    side={away}
                    name={projection.awayStarterName}
                    era={projection.awayStarterEra}
                    whip={projection.awayStarterWhip}
                    colors={colors}
                  />
                  <Pitcher
                    side={home}
                    name={projection.homeStarterName}
                    era={projection.homeStarterEra}
                    whip={projection.homeStarterWhip}
                    colors={colors}
                  />
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function Pitcher({
  side,
  name,
  era,
  whip,
  colors,
}: {
  side: string;
  name?: string | null;
  era?: number | null;
  whip?: number | null;
  colors: ReturnType<typeof useColors>;
}) {
  if (!name) return null;
  return (
    <View style={styles.pitcher}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{side}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
      {era != null && <Text style={[styles.pitcherStat, { color: colors.mutedForeground }]}>ERA <Text style={{ color: colors.foreground }}>{era.toFixed(2)}</Text></Text>}
      {whip != null && <Text style={[styles.pitcherStat, { color: colors.mutedForeground }]}>WHIP <Text style={{ color: colors.foreground }}>{whip.toFixed(2)}</Text></Text>}
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
  meta: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sport: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  metaText: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  content: { padding: 14 },
  matchupRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  matchup: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: -0.4, flexShrink: 1 },
  vs: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  pickBlock: { marginTop: 17 },
  label: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  selectionText: { fontSize: 24, fontFamily: 'Inter_700Bold', marginTop: 3, lineHeight: 28 },
  stateRow: { marginTop: 13, flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateDot: { width: 5, height: 5, borderRadius: 3 },
  stateText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  stateSecondary: { fontSize: 10, fontFamily: 'Inter_500Medium', marginLeft: 2 },
  analysisButton: { marginTop: 14, minHeight: 38, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  analysisText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.4 },
  chevron: { fontSize: 19, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  analysis: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  analysisHeading: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 11 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detail: { width: '46%' },
  detailLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  detailValue: { fontSize: 12, fontFamily: 'Inter_700Bold', marginTop: 3 },
  pitchers: { marginTop: 18 },
  pitcherRow: { flexDirection: 'row', gap: 12 },
  pitcher: { flex: 1 },
  pitcherStat: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
});