import React, { useMemo } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useGetGamesToday, useRefreshGames } from '@workspace/api-client-react';
import { mapApiGame } from '@/utils/gameAdapter';
import { GameCard } from '@/components/GameCard';
import { GameCardSkeleton } from '@/components/GameCardSkeleton';
import { LockedPickCard } from '@/components/LockedPickCard';
import { ValueBadge } from '@/components/ValueBadge';
import { EmptyState } from '@/components/EmptyState';
import type { Game } from '@/data/mockGames';
import { useSubscription } from '@/lib/revenuecat';

const FREE_PICKS = 2;
const SKELETON_COUNT = 6;

const RATING_ORDER = ['Strong Buy', 'Buy', 'Neutral', 'Fade'] as const;
type Rating = typeof RATING_ORDER[number];

const RATING_COLORS: Record<Rating, string> = {
  'Strong Buy': '#84CC16',
  'Buy':        '#22C55E',
  'Neutral':    '#94A3B8',
  'Fade':       '#EF4444',
};

type ListItem =
  | { type: 'header'; rating: Rating; count: number }
  | { type: 'game'; game: Game; locked: boolean };

export default function PicksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSubscribed } = useSubscription();

  const { data, isLoading, refetch } = useGetGamesToday();
  const { mutate: triggerRefresh, isPending: isRefreshing } = useRefreshGames({
    mutation: { onSuccess: () => refetch() },
  });

  const allPicks: Game[] = useMemo(() => {
    if (data?.games && data.games.length > 0) {
      return data.games
        .map(mapApiGame)
        .sort((a, b) => {
          const ra = RATING_ORDER.indexOf(a.projection.valueRating as Rating);
          const rb = RATING_ORDER.indexOf(b.projection.valueRating as Rating);
          if (ra !== rb) return ra - rb;
          return b.projection.modelScore - a.projection.modelScore;
        });
    }
    return [];
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of allPicks) c[g.projection.valueRating] = (c[g.projection.valueRating] ?? 0) + 1;
    return c;
  }, [allPicks]);

  const lockedCount = allPicks.filter(g => g.isLocked === true).length;

  const listItems: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    let pickIndex = 0;
    for (const rating of RATING_ORDER) {
      const group = allPicks.filter(g => g.projection.valueRating === rating);
      if (group.length === 0) continue;
      items.push({ type: 'header', rating, count: group.length });
      for (const game of group) {
        const locked = game.isLocked ?? (pickIndex >= FREE_PICKS);
        items.push({ type: 'game', game, locked });
        pickIndex++;
      }
    }
    return items;
  }, [allPicks, isSubscribed]);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      const c = RATING_COLORS[item.rating];
      return (
        <View style={[styles.sectionHeader, { borderLeftColor: c }]}>
          <Text style={[styles.sectionTitle, { color: c }]}>
            {item.rating.toUpperCase()}
          </Text>
          <View style={[styles.sectionBadge, { backgroundColor: c + '22', borderColor: c + '55' }]}>
            <Text style={[styles.sectionCount, { color: c }]}>{item.count}</Text>
          </View>
        </View>
      );
    }
    if (item.locked) {
      return <LockedPickCard onUnlock={() => router.push('/membership')} hiddenCount={lockedCount} />;
    }
    return <GameCard game={item.game} />;
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const ListHeader = (
    <View style={{ backgroundColor: colors.background }}>
      {/* Sharp-style header */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.brandName, { color: colors.foreground }]}>TBM</Text>
            <Text style={[styles.brandSub, { color: colors.primary }]}>MODEL RATINGS</Text>
          </View>
          <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
            TODAY / {today.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Summary strip — only when data is ready */}
      {!isLoading && allPicks.length > 0 && (
        <View style={[styles.summaryStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {RATING_ORDER.map((r, i) => (
            <React.Fragment key={r}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              <View style={styles.summaryCell}>
                <Text style={[styles.summaryVal, { color: RATING_COLORS[r] }]}>
                  {counts[r] ?? 0}
                </Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
                  {r === 'Strong Buy' ? 'STR BUY' : r.toUpperCase()}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Section label */}
      {!isLoading && allPicks.length > 0 && (
        <View style={styles.sectionLabelRow}>
          <Text style={[styles.sectionLabelText, { color: colors.mutedForeground }]}>
            RANKED BY MODEL · {allPicks.length} GAMES
          </Text>
          <View style={[styles.sectionLine, { backgroundColor: colors.primary }]} />
        </View>
      )}

      {/* Locked picks banner */}
      {!isLoading && lockedCount > 0 && (
        <View style={[styles.lockedBanner, { backgroundColor: colors.goldBg, borderColor: colors.gold + '44' }]}>
          <Text style={[styles.lockedBannerText, { color: colors.gold }]}>
            🔒 Showing {FREE_PICKS} of {allPicks.length} picks today — unlock all with Pro
          </Text>
        </View>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <FlatList
          data={Array.from({ length: SKELETON_COUNT })}
          keyExtractor={(_, i) => `skel-${i}`}
          renderItem={() => <GameCardSkeleton />}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={{ paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={listItems}
        keyExtractor={(item, i) =>
          item.type === 'header' ? `hdr-${item.rating}` : item.game.id
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => triggerRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={<EmptyState message="No picks available yet today. Pull down to refresh." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  brandName: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -1, lineHeight: 32 },
  brandSub: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 3, marginTop: 2 },
  dateText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1, textTransform: 'uppercase' },
  sectionLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10,
  },
  sectionLabelText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  sectionLine: { width: 28, height: 2, borderRadius: 1 },
  summaryStrip: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 12, borderWidth: 1,
    flexDirection: 'row', paddingVertical: 14,
  },
  summaryCell: { flex: 1, alignItems: 'center', gap: 4 },
  summaryVal: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 8, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  divider: { width: 1, marginVertical: 4 },
  lockedBanner: {
    marginHorizontal: 16, marginBottom: 16,
    borderRadius: 10, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  lockedBannerText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10, marginTop: 4,
    paddingLeft: 10, borderLeftWidth: 3, borderRadius: 1,
  },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, flex: 1 },
  sectionBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  sectionCount: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});
