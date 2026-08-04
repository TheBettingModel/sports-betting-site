import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useSports } from '@/context/SportsContext';
import { useGetGamesToday, useRefreshGames } from '@workspace/api-client-react';
import { mapApiGame } from '@/utils/gameAdapter';
import { GameCard } from '@/components/GameCard';
import { GameCardSkeleton } from '@/components/GameCardSkeleton';
import { LockedPickCard } from '@/components/LockedPickCard';
import { FeaturedPick } from '@/components/FeaturedPick';
import { SportFilter } from '@/components/SportFilter';
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

const RATING_HINT: Record<Rating, string> = {
  'Strong Buy': 'MODEL EDGE VS VEGAS',
  'Buy':        'MODEL EDGE VS VEGAS',
  'Neutral':    'NO CLEAR EDGE',
  'Fade':       'BET THE OTHER SIDE',
};

type ListItem =
  | { type: 'header'; rating: Rating; count: number }
  | { type: 'game'; game: Game; locked: boolean };

export default function PicksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSubscribed } = useSubscription();
  const { selectedSport } = useSports();

  const { data, isLoading, refetch } = useGetGamesToday();
  const { mutate: triggerRefresh, isPending: isRefreshing } = useRefreshGames({
    mutation: { onSuccess: () => refetch() },
  });

  const allGames: Game[] = useMemo(() => {
    if (data?.games && data.games.length > 0) return data.games.map(mapApiGame);
    return [];
  }, [data]);

  // Apply sport filter
  const filteredGames = useMemo(
    () => (selectedSport === 'All' ? allGames : allGames.filter(g => g.sport === selectedSport)),
    [allGames, selectedSport],
  );

  // Sort by rating priority then model score
  const sortedGames = useMemo(
    () => [...filteredGames].sort((a, b) => {
      const ra = RATING_ORDER.indexOf(a.projection.valueRating as Rating);
      const rb = RATING_ORDER.indexOf(b.projection.valueRating as Rating);
      if (ra !== rb) return ra - rb;
      return b.projection.modelScore - a.projection.modelScore;
    }),
    [filteredGames],
  );

  // Rating counts for summary strip (reflect current sport filter)
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of sortedGames) c[g.projection.valueRating] = (c[g.projection.valueRating] ?? 0) + 1;
    return c;
  }, [sortedGames]);

  // Featured top pick — always from ALL games regardless of sport filter
  const topPick = useMemo(() => {
    if (allGames.length === 0) return null;
    const unlocked = allGames.filter(g => !g.isLocked);
    const pool = unlocked.length > 0 ? unlocked : allGames;
    return [...pool].sort((a, b) => {
      const ra = RATING_ORDER.indexOf(a.projection.valueRating as Rating);
      const rb = RATING_ORDER.indexOf(b.projection.valueRating as Rating);
      if (ra !== rb) return ra - rb;
      return b.projection.modelScore - a.projection.modelScore;
    })[0] ?? null;
  }, [allGames]);

  const lockedCount = filteredGames.filter(g => g.isLocked === true).length;

  // Per-sport game counts — drives the count badge on each sport pill
  const sportGameCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of allGames) c[g.sport] = (c[g.sport] ?? 0) + 1;
    return c;
  }, [allGames]);
  const liveGamesCount = data?.liveGamesCount ?? 0;

  // Build list with rating section headers.
  // On the All tab: respect the Plays/All toggle (default: Plays only).
  // On a specific sport tab: always show every rating — users drilling into a sport
  // want the full picture, not just qualifying plays.
  const PLAYS_RATINGS: Rating[] = ['Strong Buy', 'Buy'];
  // All tab shows only playable picks; sport-specific tabs show every rating.
  const activeRatings = selectedSport === 'All' ? PLAYS_RATINGS : [...RATING_ORDER];

  const listItems: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    let pickIndex = 0;
    for (const rating of activeRatings) {
      const group = sortedGames.filter(g => g.projection.valueRating === rating);
      if (group.length === 0) continue;
      items.push({ type: 'header', rating, count: group.length });
      for (const game of group) {
        const locked = game.isLocked ?? (!isSubscribed && pickIndex >= FREE_PICKS);
        items.push({ type: 'game', game, locked });
        pickIndex++;
      }
    }
    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedGames, isSubscribed]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  const ListHeader = (
    <View style={{ backgroundColor: colors.background }}>
      {/* App header */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.brandName, { color: colors.foreground }]}>TBM</Text>
            <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>PICKS ENGINE</Text>
          </View>
          <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
            {today.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Games count badge + live indicator */}
      {!isLoading && allGames.length > 0 && (
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
              {allGames.length} GAMES TODAY
            </Text>
          </View>
          {liveGamesCount > 0 && (
            <View style={[styles.badge, { backgroundColor: '#EF444422', borderColor: '#EF444466', marginLeft: 8 }]}>
              <Text style={[styles.badgeText, { color: '#EF4444' }]}>
                ● {liveGamesCount} IN PROGRESS
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Sport filter pills */}
      <SportFilter gameCounts={sportGameCounts} />

      {/* Summary strip + Plays/All toggle */}
      {!isLoading && sortedGames.length > 0 && (
        <View style={styles.stripRow}>
          <View style={[styles.summaryStrip, { backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]}>
            {RATING_ORDER.map((r, i) => (
              <React.Fragment key={r}>
                {i > 0 && <View style={[styles.stripDivider, { backgroundColor: colors.border }]} />}
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
        </View>
      )}

      {/* Featured pick — only when viewing all sports */}
      {!isLoading && selectedSport === 'All' && topPick && (
        <View style={styles.featuredSection}>
          <View style={styles.sectionLabelRow}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TODAY'S TOP PICK</Text>
            <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
          </View>
          <FeaturedPick game={topPick} />
        </View>
      )}

      {/* Section label */}
      {!isLoading && (
        <View style={[styles.sectionLabelRow, { marginHorizontal: 16, marginTop: 20, marginBottom: 4 }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {selectedSport === 'All' ? 'ALL GAMES' : `${selectedSport} GAMES`}
            {sortedGames.length > 0 && ` · ${sortedGames.length}`}
          </Text>
          <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
        </View>
      )}

      {/* Locked picks banner */}
      {!isLoading && lockedCount > 0 && (
        <View style={[styles.lockedBanner, { backgroundColor: colors.goldBg, borderColor: colors.gold + '44' }]}>
          <Text style={[styles.lockedBannerText, { color: colors.gold }]}>
            🔒 Showing {filteredGames.filter(g => !g.isLocked).length} of {filteredGames.length} picks — unlock all with Pro
          </Text>
        </View>
      )}
    </View>
  );

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      const c = RATING_COLORS[item.rating];
      return (
        <View style={[styles.ratingHeader, { borderLeftColor: c }]}>
          <Text style={[styles.ratingTitle, { color: c }]}>
            {item.rating.toUpperCase()}
          </Text>
          <View style={[styles.ratingBadge, { backgroundColor: c + '22', borderColor: c + '55' }]}>
            <Text style={[styles.ratingCount, { color: c }]}>{item.count}</Text>
          </View>
          <Text style={[styles.ratingHint, { color: c }]}>{RATING_HINT[item.rating]}</Text>
        </View>
      );
    }
    if (item.locked) {
      return <LockedPickCard onUnlock={() => router.push('/membership')} hiddenCount={lockedCount} />;
    }
    return <GameCard game={item.game} />;
  };

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
        keyExtractor={(item) =>
          item.type === 'header' ? `hdr-${item.rating}` : item.game.id
        }
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <EmptyState
            sport={selectedSport !== 'All' ? selectedSport : undefined}
            message={selectedSport === 'All' ? 'No picks available yet today. Pull down to refresh.' : undefined}
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => triggerRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  brandName: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -1, lineHeight: 32 },
  brandSub: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 3, marginTop: 2 },
  dateText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1, textTransform: 'uppercase' },
  badgeRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4 },
  badge: {
    alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  badgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  stripRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginTop: 4, marginBottom: 4, gap: 8,
  },
  summaryStrip: {
    borderRadius: 12, borderWidth: 1,
    flexDirection: 'row', paddingVertical: 14,
  },
  summaryCell: { flex: 1, alignItems: 'center', gap: 4 },
  summaryVal: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 8, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  stripDivider: { width: 1, marginVertical: 4 },
  featuredSection: { paddingHorizontal: 16, marginTop: 12 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, textTransform: 'uppercase' },
  sectionLine: { width: 28, height: 2, borderRadius: 1 },
  lockedBanner: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    borderRadius: 10, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  lockedBannerText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  ratingHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 16, marginBottom: 8,
    paddingLeft: 10, borderLeftWidth: 3,
  },
  ratingTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, flex: 1 },
  ratingBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  ratingCount: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  ratingHint: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
});
