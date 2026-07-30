import React, { useState } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useGetResultsSummary, type RecentPickResult } from '@workspace/api-client-react';
import { EmptyState } from '@/components/EmptyState';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'season' | 'week';

type SportStat = {
  sport: string;
  wins: number;
  losses: number;
  pushes: number;
  totalPicks: number;
  winRate: number;
  unitsWonLost: number;
  currentStreak: number;
  currentStreakDir: 'W' | 'L' | 'P';
};

type RecentResult = RecentPickResult;

type ListItem =
  | { type: 'header-summary' }
  | { type: 'header-sport' }
  | { type: 'sport-row'; stat: SportStat }
  | { type: 'date-header'; label: string }
  | { type: 'result-row'; item: RecentResult };

// ── Sport colors ──────────────────────────────────────────────────────────────

const SPORT_COLORS: Record<string, string> = {
  MLB:    '#2563EB',
  NBA:    '#EA580C',
  NFL:    '#4F46E5',
  WNBA:   '#EC4899',
  Soccer: '#10B981',
  NHL:    '#06B6D4',
};

function sportColor(sport: string): string {
  return SPORT_COLORS[sport] ?? '#6B7280';
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function WinRateBar({ winRate, color }: { winRate: number; color: string }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.min(winRate, 100)}%` as any, backgroundColor: color }]} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('season');

  const { data, isLoading, refetch, isRefetching } = useGetResultsSummary({ period });

  const overall = data?.overall;
  const bySport = data?.bySport ?? [];
  const recentResults = data?.recentResults ?? [];

  // ── Build flat list items ─────────────────────────────────────────────────

  const listItems: ListItem[] = [];

  listItems.push({ type: 'header-summary' });

  if (bySport.filter(s => s.wins + s.losses > 0).length > 0) {
    listItems.push({ type: 'header-sport' });
    for (const stat of bySport.filter(s => s.wins + s.losses > 0)) {
      listItems.push({ type: 'sport-row', stat });
    }
  }

  if (recentResults.length > 0) {
    // Group by gameDate and insert a date-header before each new date
    let lastDate = '';
    for (const item of recentResults) {
      const dateKey = item.gameDate ?? '';
      if (dateKey !== lastDate) {
        listItems.push({ type: 'date-header', label: formatDate(dateKey) });
        lastDate = dateKey;
      }
      listItems.push({ type: 'result-row', item });
    }
  }

  // ── Render items ─────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: ListItem }) => {
    switch (item.type) {
      case 'header-summary': {
        if (!overall) return null;
        const unitsPos = overall.unitsWonLost >= 0;
        return (
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.summaryRow}>
              {/* Record */}
              <View style={styles.summaryLeft}>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>OVERALL RECORD</Text>
                <Text style={[styles.recordText, { color: colors.foreground }]}>
                  {overall.wins}–{overall.losses}
                </Text>
                <View style={[styles.winRatePill, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.winRatePillText, { color: colors.primary }]}>
                    {overall.winRate}% WIN RATE
                  </Text>
                </View>
              </View>

              {/* Units */}
              <View style={styles.summaryRight}>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>UNITS</Text>
                <Text style={[styles.unitsText, { color: unitsPos ? colors.primary : '#EF4444' }]}>
                  {unitsPos ? '+' : ''}{overall.unitsWonLost.toFixed(1)}
                </Text>
                <Text style={[styles.picksGradedText, { color: colors.mutedForeground }]}>
                  {overall.totalPicks} picks graded
                </Text>
              </View>
            </View>
          </View>
        );
      }

      case 'header-sport':
        return (
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BY SPORT</Text>
        );

      case 'sport-row': {
        const { stat } = item;
        const color = sportColor(stat.sport);
        const streakColor = stat.currentStreakDir === 'W' ? colors.primary : '#EF4444';
        const unitsPos = stat.unitsWonLost >= 0;
        return (
          <View style={[styles.sportRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sportLeft}>
              <View style={[styles.sportDot, { backgroundColor: color }]} />
              <View>
                <Text style={[styles.sportName, { color: colors.foreground }]}>{stat.sport}</Text>
                <Text style={[styles.sportRecord, { color: colors.mutedForeground }]}>
                  {stat.wins}–{stat.losses}
                </Text>
              </View>
            </View>

            <View style={styles.sportMid}>
              <Text style={[styles.sportWinRate, { color: colors.foreground }]}>{stat.winRate}%</Text>
              <WinRateBar winRate={stat.winRate} color={color} />
            </View>

            <View style={styles.sportRight}>
              <View style={[styles.streakBadge, { backgroundColor: streakColor + '20' }]}>
                <Text style={[styles.streakText, { color: streakColor }]}>
                  {stat.currentStreakDir}{stat.currentStreak}
                </Text>
              </View>
              <Text style={[styles.sportUnits, { color: unitsPos ? colors.primary : '#EF4444' }]}>
                {unitsPos ? '+' : ''}{stat.unitsWonLost.toFixed(1)}u
              </Text>
            </View>
          </View>
        );
      }

      case 'date-header':
        return (
          <Text style={[styles.dateHeader, { color: colors.mutedForeground }]}>{item.label}</Text>
        );

      case 'result-row': {
        const { item: r } = item;
        const isWin = r.result === 'win';
        const isPush = r.result === 'push';
        const resultColor = isWin ? colors.primary : isPush ? '#F59E0B' : '#EF4444';
        const resultLabel = isWin ? 'W' : isPush ? 'P' : 'L';
        const unitsLabel = isWin
          ? `+${r.unitsWonLost.toFixed(1)}u`
          : isPush ? '±0u' : `${r.unitsWonLost.toFixed(1)}u`;
        const color = sportColor(r.sport);

        return (
          <View style={[styles.resultRow, { borderBottomColor: colors.border }]}>
            <View style={[styles.resultDot, { backgroundColor: color }]} />
            <View style={styles.resultMiddle}>
              <Text style={[styles.resultPick, { color: colors.foreground }]}>{r.pick}</Text>
              <Text style={[styles.resultMatchup, { color: colors.mutedForeground }]}>
                {r.awayTeamAbbr} @ {r.homeTeamAbbr}
              </Text>
            </View>
            <View style={styles.resultRight}>
              <View style={[styles.resultBadge, { backgroundColor: resultColor + '22' }]}>
                <Text style={[styles.resultBadgeText, { color: resultColor }]}>{resultLabel}</Text>
              </View>
              <Text style={[styles.resultUnits, { color: resultColor }]}>{unitsLabel}</Text>
            </View>
          </View>
        );
      }

      default:
        return null;
    }
  };

  // ── Header ───────────────────────────────────────────────────────────────

  const ListHeader = (
    <View style={{ backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.brandName, { color: colors.foreground }]}>TBM</Text>
            <Text style={[styles.brandSub, { color: colors.primary }]}>RESULTS</Text>
          </View>
        </View>
      </View>

      {/* Period toggle */}
      <View style={[styles.toggleContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(['season', 'week'] as Period[]).map((p) => {
          const active = period === p;
          return (
            <View
              key={p}
              style={[styles.toggleOption, active && { backgroundColor: colors.primary }]}
              // @ts-ignore — onStartShouldSetResponder pattern for pressable in FlatList header
              onStartShouldSetResponder={() => true}
              onResponderRelease={() => setPeriod(p)}
            >
              <Text style={[styles.toggleText, { color: active ? '#000000' : colors.mutedForeground }]}>
                {p === 'season' ? 'All Season' : 'This Week'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
          <Text style={[styles.brandName, { color: colors.foreground }]}>TBM</Text>
          <Text style={[styles.brandSub, { color: colors.primary }]}>RESULTS</Text>
        </View>
        <View style={styles.skeletonContainer}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.skeletonBlock, { backgroundColor: colors.card }]} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={listItems}
        keyExtractor={(item, i) => {
          if (item.type === 'result-row') return `result-${item.item.pickId}`;
          if (item.type === 'sport-row') return `sport-${item.stat.sport}`;
          return `${item.type}-${i}`;
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <EmptyState message="No graded picks yet. Check back after tonight's games." />
        }
      />
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (dateStr === today.toISOString().split('T')[0]) return 'Today';
  if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  brandName: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -1, lineHeight: 32 },
  brandSub: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 3, marginTop: 2 },

  toggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  toggleOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },

  // Summary card
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryLeft: { flex: 1 },
  summaryRight: { alignItems: 'flex-end' },
  summaryLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginBottom: 4 },
  recordText: { fontSize: 36, fontFamily: 'Inter_700Bold', letterSpacing: -1.5, lineHeight: 38 },
  winRatePill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  winRatePillText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  unitsText: { fontSize: 32, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  picksGradedText: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },

  // Sport rows
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  sportLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 80 },
  sportDot: { width: 8, height: 8, borderRadius: 2 },
  sportName: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  sportRecord: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  sportMid: { flex: 1 },
  sportWinRate: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  sportRight: { alignItems: 'flex-end', gap: 4, minWidth: 48 },
  streakBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  streakText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  sportUnits: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  barTrack: { height: 4, backgroundColor: '#222222', borderRadius: 2, marginTop: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },

  // Timeline date header
  dateHeader: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },

  // Result rows
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  resultDot: { width: 8, height: 8, borderRadius: 2, flexShrink: 0 },
  resultMiddle: { flex: 1 },
  resultPick: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  resultMatchup: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  resultRight: { alignItems: 'center', gap: 3, flexShrink: 0 },
  resultBadge: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  resultBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  resultUnits: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Skeleton
  skeletonContainer: { paddingHorizontal: 16, gap: 12, marginTop: 8 },
  skeletonBlock: { height: 100, borderRadius: 14 },
});
