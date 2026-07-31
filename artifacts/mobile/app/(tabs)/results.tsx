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
import { useGetResultsSummary } from '@workspace/api-client-react';
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

type ListItem =
  | { type: 'header-summary' }
  | { type: 'header-sport' }
  | { type: 'sport-row'; stat: SportStat };

import { getSportColor } from '@/constants/sportColors';

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

  // ── Build flat list items ─────────────────────────────────────────────────

  const listItems: ListItem[] = [];

  listItems.push({ type: 'header-summary' });

  if (bySport.filter(s => s.wins + s.losses > 0).length > 0) {
    listItems.push({ type: 'header-sport' });
    for (const stat of bySport.filter(s => s.wins + s.losses > 0)) {
      listItems.push({ type: 'sport-row', stat });
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
        const color = getSportColor(stat.sport);
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
            <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>RECORD</Text>
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
          <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>RECORD</Text>
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
    borderRadius: 14,
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

  barTrack: { height: 4, backgroundColor: '#1E1E1E', borderRadius: 2, marginTop: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },

  // Skeleton
  skeletonContainer: { paddingHorizontal: 16, gap: 12, marginTop: 8 },
  skeletonBlock: { height: 100, borderRadius: 14 },
});
