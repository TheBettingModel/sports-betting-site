import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useGetGamesToday, useRefreshGames } from '@workspace/api-client-react';
import { mapApiGame } from '@/utils/gameAdapter';
import { getBestPicks, MOCK_GAMES } from '@/data/mockGames';
import { GameCard } from '@/components/GameCard';
import { LockedPickCard } from '@/components/LockedPickCard';
import { ValueBadge } from '@/components/ValueBadge';
import type { Game } from '@/data/mockGames';
import { useSubscription } from '@/lib/revenuecat';
import PaywallModal from '@/app/paywall';

const FREE_PICKS = 2; // non-subscribers see this many picks unlocked

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
  const { isSubscribed } = useSubscription();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const { data, isLoading, refetch } = useGetGamesToday();
  const { mutate: triggerRefresh, isPending: isRefreshing } = useRefreshGames({
    mutation: { onSuccess: () => refetch() },
  });

  // All today's games sorted by model score high → low
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
    if (!isLoading) {
      return [...MOCK_GAMES].sort((a, b) => {
        const ra = RATING_ORDER.indexOf(a.projection.valueRating as Rating);
        const rb = RATING_ORDER.indexOf(b.projection.valueRating as Rating);
        if (ra !== rb) return ra - rb;
        return b.projection.modelScore - a.projection.modelScore;
      });
    }
    return [];
  }, [data, isLoading]);

  // Summary counts
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of allPicks) c[g.projection.valueRating] = (c[g.projection.valueRating] ?? 0) + 1;
    return c;
  }, [allPicks]);

  // Build flat list with section headers.
  // Lock state is authoritative from the server (game.isLocked). Fall back to
  // index-based locking when the API does not return isLocked (e.g. mock data).
  const listItems: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    let pickIndex = 0;
    for (const rating of RATING_ORDER) {
      const group = allPicks.filter(g => g.projection.valueRating === rating);
      if (group.length === 0) continue;
      items.push({ type: 'header', rating, count: group.length });
      for (const game of group) {
        // Prefer server-side isLocked; fall back to index gate for mock data
        const locked = game.isLocked ?? (!isSubscribed && pickIndex >= FREE_PICKS);
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
      return <LockedPickCard onUnlock={() => setPaywallOpen(true)} />;
    }
    return <GameCard game={item.game} />;
  };

  const lockedCount = allPicks.length > FREE_PICKS && !isSubscribed
    ? allPicks.length - FREE_PICKS
    : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={listItems}
        keyExtractor={(item, i) =>
          item.type === 'header' ? `hdr-${item.rating}` : item.game.id
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => triggerRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={{ backgroundColor: colors.background }}>
            {/* Page header */}
            <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
              <Text style={[styles.title, { color: colors.foreground }]}>Today's Picks</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {isLoading ? 'Loading…' : `${allPicks.length} games · ranked by model rating`}
              </Text>
            </View>

            {isLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                  Fetching live picks…
                </Text>
              </View>
            )}

            {/* Summary strip */}
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

            {/* Locked picks banner for non-subscribers */}
            {!isSubscribed && lockedCount > 0 && (
              <View style={[styles.lockedBanner, { backgroundColor: colors.goldBg, borderColor: colors.gold + '44' }]}>
                <Text style={[styles.lockedBannerText, { color: colors.gold }]}>
                  🔒 {lockedCount} more picks unlocked with Pro — first {FREE_PICKS} shown free
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No picks available yet today
              </Text>
            </View>
          ) : null
        }
      />

      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 4, marginBottom: 8,
  },
  loadingText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
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
  sectionBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, borderWidth: 1,
  },
  sectionCount: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
});
