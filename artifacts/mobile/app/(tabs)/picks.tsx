import React, { useEffect, useMemo, useState } from 'react';
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
const ACTIONABLE_RATINGS: Rating[] = ['Strong Buy', 'Buy'];
const ALL_PLAYS_LIMIT = 6;
const SPORT_PLAYS_LIMIT = 5;

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

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function neutralMarketLabel(game: Game): string {
  const { awayOdds, homeOdds } = game.vegasLine;
  const isValidPrice = (odds: number) =>
    Number.isFinite(odds) && Math.abs(odds) >= 100 && Math.abs(odds) <= 2000;

  if (!isValidPrice(awayOdds) || !isValidPrice(homeOdds)) {
    return 'MARKET LINE UNAVAILABLE';
  }

  return `ML ${formatOdds(awayOdds)} / ${formatOdds(homeOdds)}`;
}

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
  const [showNoEdgeGames, setShowNoEdgeGames] = useState(false);

  useEffect(() => {
    // Keep an open Picks screen current without relying on a manual
    // pull-to-refresh. The API performs the heavier model refresh at most
    // once per ten minutes across callers.
    const refreshId = setInterval(() => {
      void refetch();
    }, 5 * 60 * 1000);
    return () => clearInterval(refreshId);
  }, [refetch]);
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

  // Featured top pick — always from the strongest actionable games across all
  // sports, regardless of the selected sport filter. Neutral games should
  // never be promoted as the day's top play.
  const topPick = useMemo(() => {
    const actionable = allGames.filter(g =>
      ACTIONABLE_RATINGS.includes(g.projection.valueRating as Rating),
    );
    if (actionable.length === 0) return null;
    const unlocked = actionable.filter(g => !g.isLocked);
    const pool = unlocked.length > 0 ? unlocked : actionable;
    return [...pool].sort((a, b) => {
      const ra = RATING_ORDER.indexOf(a.projection.valueRating as Rating);
      const rb = RATING_ORDER.indexOf(b.projection.valueRating as Rating);
      if (ra !== rb) return ra - rb;
      return b.projection.modelScore - a.projection.modelScore;
    })[0] ?? null;
  }, [allGames]);

  // The feed is intentionally concise: six qualified plays across the full
  // slate, or five when drilling into a sport. This is a display limit only;
  // all games remain available to the model and the full analyzed count stays
  // visible in the summary/footer.
  const actionableGames = useMemo(
    () => sortedGames.filter(g =>
      ACTIONABLE_RATINGS.includes(g.projection.valueRating as Rating),
    ),
    [sortedGames],
  );
  const neutralGames = useMemo(
    () => sortedGames.filter(g => g.projection.valueRating === 'Neutral'),
    [sortedGames],
  );
  const displayedGames = useMemo(
    () => actionableGames.slice(0, selectedSport === 'All' ? ALL_PLAYS_LIMIT : SPORT_PLAYS_LIMIT),
    [actionableGames, selectedSport],
  );
  const lockedCount = displayedGames.filter(g => g.isLocked === true).length;

  useEffect(() => {
    setShowNoEdgeGames(false);
  }, [selectedSport]);

  // Per-sport game counts — drives the count badge on each sport pill
  const sportGameCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of allGames) c[g.sport] = (c[g.sport] ?? 0) + 1;
    return c;
  }, [allGames]);
  const liveGamesCount = data?.liveGamesCount ?? 0;

  // Sports that have games today but zero qualifying picks (Strong Buy / Buy) on
  // the All tab — shown as a muted footer so subscribers know the model ran on
  // those games and found no edge, rather than wondering if coverage is broken.
  const noEdgeSports = useMemo(() => {
    if (selectedSport !== 'All') return [];
    const stats: Record<string, { total: number; qualifying: number }> = {};
    for (const g of allGames) {
      if (!stats[g.sport]) stats[g.sport] = { total: 0, qualifying: 0 };
      stats[g.sport].total++;
      if (g.projection.valueRating === 'Strong Buy' || g.projection.valueRating === 'Buy') {
        stats[g.sport].qualifying++;
      }
    }
    return Object.entries(stats)
      .filter(([, s]) => s.total > 0 && s.qualifying === 0)
      .map(([sport, s]) => ({ sport, total: s.total }));
  }, [allGames, selectedSport]);

  // Build the capped list with rating section headers. Neutral and Fade games
  // remain part of the analyzed dataset, but never appear as recommendations.
  const listItems: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    let pickIndex = 0;
    for (const rating of ACTIONABLE_RATINGS) {
      const group = displayedGames.filter(g => g.projection.valueRating === rating);
      if (group.length === 0) continue;
      items.push({ type: 'header', rating, count: group.length });
      for (const game of group) {
        const locked = game.isLocked ?? (!isSubscribed && pickIndex >= FREE_PICKS);
        items.push({ type: 'game', game, locked });
        pickIndex++;
      }
    }
    return items;
  }, [displayedGames, isSubscribed]);

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
            {selectedSport === 'All'
              ? `TOP PLAYS${displayedGames.length > 0 ? ` · ${displayedGames.length}` : ''}`
              : `${displayedGames.length} PICKS · ${sortedGames.length} GAMES ANALYZED`}
          </Text>
          <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
        </View>
      )}

      {/* Locked picks banner */}
      {!isLoading && lockedCount > 0 && (
        <View style={[styles.lockedBanner, { backgroundColor: colors.goldBg, borderColor: colors.gold + '44' }]}>
          <Text style={[styles.lockedBannerText, { color: colors.gold }]}>
            🔒 Showing {displayedGames.filter(g => !g.isLocked).length} of {displayedGames.length} plays — unlock all with Pro
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
            title={selectedSport !== 'All' && sortedGames.length > 0
              ? `No ${selectedSport} bets today`
              : undefined}
            message={selectedSport === 'All'
              ? 'No qualified plays available today. Pull down to refresh.'
              : 'No qualified plays in this sport today.'}
          />
        }
        ListFooterComponent={
          selectedSport !== 'All' && neutralGames.length > 0 ? (
            <View style={[styles.noEdgeFooter, { borderTopColor: colors.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${neutralGames.length} games analyzed with no betting edge`}
                onPress={() => setShowNoEdgeGames(current => !current)}
                style={({ pressed }) => [
                  styles.noEdgeToggle,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.78 : 1 },
                ]}
              >
                <View style={styles.noEdgeToggleCopy}>
                  <Text style={[styles.noEdgeTitle, { color: colors.mutedForeground }]}>
                    {neutralGames.length} {neutralGames.length === 1 ? 'GAME' : 'GAMES'} ANALYZED · NO EDGE
                  </Text>
                  <Text style={[styles.noEdgeSubtitle, { color: colors.mutedForeground }]}>
                    No qualified play on these matchups
                  </Text>
                </View>
                <Text style={[styles.noEdgeAction, { color: colors.primary }]}>
                  {showNoEdgeGames ? 'HIDE' : 'VIEW GAMES'}
                </Text>
              </Pressable>
              {showNoEdgeGames && (
                <View style={styles.noEdgeGameList}>
                  {neutralGames.map(game => (
                    <View
                      key={game.id}
                      style={[styles.noEdgeGameRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={styles.noEdgeGameMatchup}>
                        <Text style={[styles.noEdgeGameTeams, { color: colors.foreground }]}>
                          {game.awayTeam.abbr} <Text style={{ color: colors.mutedForeground }}>@</Text> {game.homeTeam.abbr}
                        </Text>
                        <Text style={[styles.noEdgeGameTime, { color: colors.mutedForeground }]}>
                          {game.gameTime}
                        </Text>
                      </View>
                      <View style={styles.noEdgeGameMeta}>
                        <Text style={[styles.noEdgeGameRating, { color: colors.mutedForeground }]}>NEUTRAL</Text>
                        <Text style={[styles.noEdgeGameLine, { color: colors.mutedForeground }]}>
                          {neutralMarketLabel(game)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : noEdgeSports.length > 0 ? (
            <View style={[styles.noEdgeFooter, { borderTopColor: colors.border }]}>
              <Text style={[styles.noEdgeTitle, { color: colors.mutedForeground }]}>
                ANALYZED · NO EDGE FOUND
              </Text>
              <View style={styles.noEdgeRow}>
                {noEdgeSports.map(({ sport, total }) => (
                  <View key={sport} style={[styles.noEdgeChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <Text style={[styles.noEdgeChipSport, { color: colors.mutedForeground }]}>{sport}</Text>
                    <Text style={[styles.noEdgeChipCount, { color: colors.mutedForeground }]}>
                      {total} {total === 1 ? 'game' : 'games'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null
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
  // ── No-edge footer ────────────────────────────────────────────────────────────
  noEdgeFooter: {
    marginTop: 24, marginHorizontal: 16, paddingTop: 20,
    borderTopWidth: 1,
  },
  noEdgeToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
  },
  noEdgeToggleCopy: { flex: 1, marginRight: 12 },
  noEdgeTitle: {
    fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5,
    marginBottom: 10,
  },
  noEdgeSubtitle: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  noEdgeAction: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  noEdgeGameList: { gap: 8, marginTop: 8 },
  noEdgeGameRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
  },
  noEdgeGameMatchup: { flex: 1, marginRight: 12 },
  noEdgeGameTeams: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  noEdgeGameTime: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 3 },
  noEdgeGameMeta: { alignItems: 'flex-end' },
  noEdgeGameRating: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  noEdgeGameLine: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 3 },
  noEdgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  noEdgeChip: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 2,
  },
  noEdgeChipSport: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  noEdgeChipCount: { fontSize: 10, fontFamily: 'Inter_500Medium' },
});
