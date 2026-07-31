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

const SKELETON_COUNT = 5;

const RATING_PRIORITY: Record<string, number> = { 'Strong Buy': 0, 'Buy': 1, 'Neutral': 2, 'Fade': 3 };
const RATING_COLORS: Record<string, string> = {
  'Strong Buy': '#FFFFFF',
  'Buy':        '#CBD5E1',
  'Neutral':    '#4B5563',
  'Fade':       '#EF4444',
};

type ListItem =
  | { type: 'game'; game: Game }
  | { type: 'divider'; rating: string; count: number; color: string };

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { selectedSport } = useSports();

  const { data, isLoading, refetch } = useGetGamesToday();
  const { mutate: triggerRefresh, isPending: isRefreshing } = useRefreshGames({
    mutation: { onSuccess: () => refetch() },
  });

  const allGames: Game[] = useMemo(() => {
    if (data?.games && data.games.length > 0) return data.games.map(mapApiGame);
    return [];
  }, [data]);

  const filteredGames = useMemo(
    () => (selectedSport === 'All' ? allGames : allGames.filter(g => g.sport === selectedSport)),
    [allGames, selectedSport],
  );

  // Always sort by rating priority first, then model score — so BUY floats above NEUTRAL/FADE
  const sortedGames = useMemo(() =>
    [...filteredGames].sort((a, b) => {
      const rDiff = (RATING_PRIORITY[a.projection.valueRating] ?? 2) - (RATING_PRIORITY[b.projection.valueRating] ?? 2);
      if (rDiff !== 0) return rDiff;
      return b.projection.modelScore - a.projection.modelScore;
    }),
    [filteredGames],
  );

  // When a sport filter is active, inject rating-group dividers so users see
  // the BUY / NEUTRAL / FADE boundary clearly instead of a confusing mix.
  const listItems: ListItem[] = useMemo(() => {
    if (selectedSport === 'All') {
      return sortedGames.map(game => ({ type: 'game' as const, game }));
    }
    const counts = sortedGames.reduce<Record<string, number>>((acc, g) => {
      acc[g.projection.valueRating] = (acc[g.projection.valueRating] ?? 0) + 1;
      return acc;
    }, {});
    const items: ListItem[] = [];
    let lastRating = '';
    for (const game of sortedGames) {
      const rating = game.projection.valueRating;
      if (rating !== lastRating) {
        items.push({ type: 'divider', rating, count: counts[rating] ?? 0, color: RATING_COLORS[rating] ?? '#6B7280' });
        lastRating = rating;
      }
      items.push({ type: 'game', game });
    }
    return items;
  }, [sortedGames, selectedSport]);

  const topPick = useMemo(() => {
    if (allGames.length === 0) return null;
    const unlocked = allGames.filter(g => !g.isLocked);
    const pool = unlocked.length > 0 ? unlocked : allGames;
    const RATING_PRIORITY: Record<string, number> = { 'Strong Buy': 0, 'Buy': 1, 'Neutral': 2, 'Fade': 3 };
    return [...pool].sort((a, b) => {
      const rDiff = (RATING_PRIORITY[a.projection.valueRating] ?? 2) - (RATING_PRIORITY[b.projection.valueRating] ?? 2);
      if (rDiff !== 0) return rDiff;
      return b.projection.modelScore - a.projection.modelScore;
    })[0] ?? null;
  }, [allGames]);

  const lastUpdated = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const liveGamesCount = data?.liveGamesCount ?? 0;
  const lockedCount = filteredGames.filter(g => g.isLocked).length;

  const ListHeader = () => (
    <View style={{ backgroundColor: colors.background }}>
      {/* App header */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.brandName, { color: colors.foreground }]}>TBM</Text>
            <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>PICKS ENGINE</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={[styles.date, { color: colors.mutedForeground }]}>
              {today.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Games count badge + in-progress pill */}
      {!isLoading && allGames.length > 0 && (
        <View style={styles.badgeRow}>
          <View style={[styles.gamesBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.gamesBadgeText, { color: colors.mutedForeground }]}>
              {allGames.length} GAMES TODAY
            </Text>
          </View>
          {liveGamesCount > 0 && (
            <View style={[styles.gamesBadge, { backgroundColor: '#EF444422', borderColor: '#EF444466', marginLeft: 8 }]}>
              <Text style={[styles.gamesBadgeText, { color: '#EF4444' }]}>
                ● {liveGamesCount} IN PROGRESS
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Sport filter */}
      <SportFilter />

      {/* Featured pick — only when data is ready */}
      {!isLoading && selectedSport === 'All' && topPick && (
        <View style={styles.section}>
          <View style={styles.sectionLabelRow}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TODAY'S MATCHUPS</Text>
            <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
          </View>
          <FeaturedPick game={topPick} />
        </View>
      )}

      {/* Locked picks banner */}
      {!isLoading && lockedCount > 0 && (
        <View style={[styles.lockedBanner, { backgroundColor: colors.goldBg, borderColor: colors.gold + '44' }]}>
          <Text style={[styles.lockedBannerText, { color: colors.gold }]}>
            🔒 {filteredGames.filter(g => !g.isLocked).length} of {filteredGames.length} picks shown — unlock all with Pro
          </Text>
        </View>
      )}

      {!isLoading && (
        <View style={[styles.sectionLabelRow, { marginHorizontal: 16, marginTop: 20 }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {selectedSport === 'All' ? 'ALL GAMES' : `${selectedSport} GAMES`}
            {filteredGames.length > 0 && ` · ${filteredGames.length}`}
          </Text>
          <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {isLoading ? (
        /* Skeleton loading state — replaces the spinner+empty experience */
        <FlatList
          data={Array.from({ length: SKELETON_COUNT })}
          keyExtractor={(_, i) => `skel-${i}`}
          renderItem={() => <GameCardSkeleton />}
          ListHeaderComponent={<ListHeader />}
          contentContainerStyle={{
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90,
          }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        />
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item, i) =>
            item.type === 'divider' ? `div-${item.rating}` : item.game.id
          }
          renderItem={({ item }: { item: ListItem }) => {
            if (item.type === 'divider') {
              return (
                <View style={[styles.ratingDivider, { borderLeftColor: item.color }]}>
                  <Text style={[styles.ratingLabel, { color: item.color }]}>
                    {item.rating.toUpperCase()}
                  </Text>
                  <View style={[styles.ratingBadge, { backgroundColor: item.color + '22', borderColor: item.color + '55' }]}>
                    <Text style={[styles.ratingCount, { color: item.color }]}>{item.count}</Text>
                  </View>
                  {(item.rating === 'Strong Buy' || item.rating === 'Buy') && (
                    <Text style={[styles.ratingHint, { color: item.color }]}>MODEL EDGE VS VEGAS</Text>
                  )}
                  {item.rating === 'Neutral' && (
                    <Text style={[styles.ratingHint, { color: '#6B7280' }]}>NO CLEAR EDGE</Text>
                  )}
                  {item.rating === 'Fade' && (
                    <Text style={[styles.ratingHint, { color: item.color }]}>BET THE OTHER SIDE</Text>
                  )}
                </View>
              );
            }
            return item.game.isLocked
              ? <LockedPickCard onUnlock={() => router.push('/membership')} hiddenCount={lockedCount} />
              : <GameCard game={item.game} />;
          }}
          ListHeaderComponent={<ListHeader />}
          contentContainerStyle={{
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => triggerRefresh()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={<EmptyState sport={selectedSport !== 'All' ? selectedSport : undefined} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  brandName: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -1, lineHeight: 32 },
  brandSub: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 3, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 2 },
  date: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1, textTransform: 'uppercase' },
  updated: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  badgeRow: { paddingHorizontal: 16, marginBottom: 4 },
  gamesBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  gamesBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  section: { paddingHorizontal: 16, marginTop: 4 },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionLine: { width: 28, height: 2, borderRadius: 1 },
  lockedBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  lockedBannerText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  ratingDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingLeft: 10,
    borderLeftWidth: 3,
  },
  ratingLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  ratingBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  ratingCount: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  ratingHint: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginLeft: 2 },
});
