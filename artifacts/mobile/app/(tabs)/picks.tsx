import React, { useEffect, useMemo } from 'react';
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

type ForecastState = 'model-lean' | 'no-bet' | 'awaiting-data' | 'locked';

type Forecast = {
  game: Game;
  state: ForecastState;
  projectedTeam?: string;
  modelProbability?: number;
  marketOdds?: number;
  edge?: number;
  leanRank?: number;
  awaitingReason?: string;
};

function getForecast(game: Game): Forecast {
  const validPrice = (odds: number) =>
    Number.isFinite(odds) && Math.abs(odds) >= 100 && Math.abs(odds) <= 2000;
  const hasNamedStarter = (name: string | undefined) => Boolean(name?.trim());

  if (game.isLocked) {
    return { game, state: 'locked' };
  }

  const hasMlbStarters =
    hasNamedStarter(game.projection.homeStarterName) &&
    hasNamedStarter(game.projection.awayStarterName);
  const hasMarket =
    validPrice(game.vegasLine.homeOdds) &&
    validPrice(game.vegasLine.awayOdds);

  if (!hasMarket || (game.sport === 'MLB' && !hasMlbStarters)) {
    return {
      game,
      state: 'awaiting-data',
      awaitingReason: !hasMarket ? 'MARKET LINE PENDING' : 'PROBABLE STARTERS PENDING',
    };
  }

  const projectedHome = game.projection.homeWinPct >= 50;
  const edgeSideIsHome = game.projection.edge >= 0;
  const edgeSideOdds = edgeSideIsHome
    ? game.vegasLine.homeOdds
    : game.vegasLine.awayOdds;
  const hasModelLean =
    game.projection.valueRating === 'Neutral' &&
    game.projection.edge !== 0 &&
    // MLB retains its existing short-price rule. Other sports do not inherit
    // that baseball-specific gate merely to display a forecast.
    (game.sport !== 'MLB' || edgeSideOdds > -160);

  return {
    game,
    state: hasModelLean ? 'model-lean' : 'no-bet',
    projectedTeam: projectedHome ? game.homeTeam.abbr : game.awayTeam.abbr,
    modelProbability: projectedHome
      ? game.projection.homeWinPct
      : 100 - game.projection.homeWinPct,
    marketOdds: projectedHome ? game.vegasLine.homeOdds : game.vegasLine.awayOdds,
    edge: Math.abs(game.projection.edge),
  };
}

const FORECAST_STATE_ORDER: Record<ForecastState, number> = {
  'model-lean': 0,
  'no-bet': 1,
  'awaiting-data': 2,
  locked: 3,
};

function compareForecasts(a: Forecast, b: Forecast): number {
  const stateOrder = FORECAST_STATE_ORDER[a.state] - FORECAST_STATE_ORDER[b.state];
  if (stateOrder !== 0) return stateOrder;

  const edgeOrder = (b.edge ?? -1) - (a.edge ?? -1);
  if (edgeOrder !== 0) return edgeOrder;

  return b.game.projection.modelScore - a.game.projection.modelScore;
}

type ListItem =
  | { type: 'header'; rating: Rating; count: number }
  | { type: 'game'; game: Game; locked: boolean }
  | { type: 'projection-header'; count: number }
  | { type: 'projection'; forecast: Forecast };

export default function PicksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSubscribed } = useSubscription();
  const { selectedSport } = useSports();

  const { data, isLoading, refetch } = useGetGamesToday();
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

  // The All tab stays curated across the full slate. Each sport tab keeps
  // wagers separate from the complete upcoming forecast slate.
  const actionableGames = useMemo(
    () => sortedGames.filter(g =>
      ACTIONABLE_RATINGS.includes(g.projection.valueRating as Rating),
    ),
    [sortedGames],
  );
  const forecasts = useMemo(() => {
    if (selectedSport === 'All') return [];

    const ranked = sortedGames
      .filter(game =>
        game.status === 'upcoming' &&
        !ACTIONABLE_RATINGS.includes(game.projection.valueRating as Rating),
      )
      .map(getForecast)
      .sort(compareForecasts);

    let leanRank = 0;
    return ranked.map(forecast => ({
      ...forecast,
      leanRank: forecast.state === 'model-lean' ? ++leanRank : undefined,
    }));
  }, [selectedSport, sortedGames]);
  const displayedGames = useMemo(
    () => selectedSport === 'All' ? actionableGames.slice(0, ALL_PLAYS_LIMIT) : actionableGames,
    [actionableGames, selectedSport],
  );
  const lockedCount = displayedGames.filter(g => g.isLocked === true).length;

  // Per-sport game counts — drives the count badge on each sport pill
  const sportGameCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of allGames) c[g.sport] = (c[g.sport] ?? 0) + 1;
    return c;
  }, [allGames]);
  const liveGamesCount = data?.liveGamesCount ?? 0;
  const allTabHasNoQualifiedPlays =
    selectedSport === 'All' && allGames.length > 0 && displayedGames.length === 0;

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

  // Build the recommended plays list. On a sport tab, every remaining upcoming
  // game receives a compact forecast row after the actual wagers.
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
    if (selectedSport !== 'All' && forecasts.length > 0) {
      items.push({ type: 'projection-header', count: forecasts.length });
      for (const forecast of forecasts) {
        items.push({ type: 'projection', forecast });
      }
    }
    return items;
  }, [displayedGames, forecasts, isSubscribed, selectedSport]);

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
              : displayedGames.length > 0
                ? `RECOMMENDED PLAYS · ${displayedGames.length}`
                : 'NO QUALIFIED PLAYS TODAY'}
          </Text>
          <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
        </View>
      )}

      {!isLoading && selectedSport !== 'All' && sortedGames.length > 0 && displayedGames.length === 0 && (
        <View style={[styles.forecastNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.forecastNoticeTitle, { color: colors.foreground }]}>
            NOTHING CLEARED THE BUY THRESHOLD
          </Text>
          <Text style={[styles.forecastNoticeText, { color: colors.mutedForeground }]}>
            Forecasts below are ranked by model edge. A higher win probability does not necessarily mean better betting value.
          </Text>
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
    if (item.type === 'projection-header') {
      return (
        <View style={[styles.forecastHeader, { borderTopColor: colors.border }]}>
          <View>
            <Text style={[styles.forecastTitle, { color: colors.foreground }]}>
              ALL {selectedSport.toUpperCase()} PROJECTIONS
            </Text>
            <Text style={[styles.forecastSubtitle, { color: colors.mutedForeground }]}>
              {item.count} upcoming {item.count === 1 ? 'game' : 'games'}
            </Text>
            <Text style={[styles.forecastOrderNote, { color: colors.primary }]}>
              RANKED BY VALUE EDGE · HIGHEST FIRST
            </Text>
          </View>
          <View style={[styles.forecastBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={[styles.forecastBadgeText, { color: colors.mutedForeground }]}>
              {item.count}
            </Text>
          </View>
        </View>
      );
    }
    if (item.type === 'projection') {
      const { forecast } = item;
      const isLockedForecast = forecast.state === 'locked';
      const statusLabel = forecast.state === 'model-lean'
        ? `PICK · #${forecast.leanRank}`
        : forecast.state === 'no-bet'
          ? 'NO BET'
          : forecast.state === 'awaiting-data'
            ? 'AWAITING DATA'
            : 'PRO FORECAST';
      const statusColor = forecast.state === 'model-lean'
        ? colors.primary
        : forecast.state === 'awaiting-data'
          ? colors.gold
          : colors.mutedForeground;
      const rowContent = (
        <>
          <View style={styles.forecastMatchup}>
            <Text style={[styles.forecastTeams, { color: colors.foreground }]}>
              {forecast.game.awayTeam.abbr} <Text style={{ color: colors.mutedForeground }}>@</Text> {forecast.game.homeTeam.abbr}
            </Text>
            <Text style={[styles.forecastTime, { color: colors.mutedForeground }]}>
              {forecast.game.gameTime}
            </Text>
          </View>
          <View style={styles.forecastDetails}>
            <Text style={[styles.forecastStatus, { color: statusColor }]}>
              {statusLabel}
            </Text>
            {forecast.state === 'awaiting-data' ? (
              <Text style={[styles.forecastDataNote, { color: colors.mutedForeground }]}>
                {forecast.awaitingReason}
              </Text>
            ) : isLockedForecast ? (
              <Text style={[styles.forecastDataNote, { color: colors.mutedForeground }]}>
                UNLOCK TO VIEW
              </Text>
            ) : (
              <>
                <Text style={[styles.forecastProjection, { color: colors.foreground }]}>
                  {forecast.projectedTeam} · {forecast.state === 'model-lean' ? 'PICK' : 'NO BET'}
                </Text>
                <Text style={[styles.forecastMarket, { color: colors.mutedForeground }]}>
                  TBM {forecast.modelProbability?.toFixed(1)}% · EDGE +{forecast.edge!.toFixed(1)}% · MARKET {formatOdds(forecast.marketOdds!)}
                </Text>
              </>
            )}
          </View>
        </>
      );

      return isLockedForecast ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unlock the ${forecast.game.awayTeam.abbr} at ${forecast.game.homeTeam.abbr} ${selectedSport} forecast`}
          onPress={() => router.push('/membership')}
          style={({ pressed }) => [
            styles.forecastRow,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.78 : 1 },
          ]}
        >
          {rowContent}
        </Pressable>
      ) : (
        <View style={[styles.forecastRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {rowContent}
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
        keyExtractor={(item) => {
          if (item.type === 'header') return `hdr-${item.rating}`;
          if (item.type === 'projection-header') return `hdr-${selectedSport}-projections`;
          if (item.type === 'projection') return `forecast-${item.forecast.game.id}`;
          return item.game.id;
        }}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <EmptyState
            sport={selectedSport !== 'All' ? selectedSport : undefined}
            title={selectedSport !== 'All' && sortedGames.length > 0
              ? `No ${selectedSport} bets today`
              : allTabHasNoQualifiedPlays
                ? 'No Qualified Plays Today'
                : undefined}
            message={selectedSport === 'All'
              ? allTabHasNoQualifiedPlays
                ? `${allGames.length} games analyzed. No Strong Buy or Buy plays met the model threshold. Tap a sport above to explore additional picks.`
                : 'No qualified plays available today. Pull down to refresh.'
              : 'No qualified plays in this sport today.'}
          />
        }
        ListFooterComponent={
          noEdgeSports.length > 0 ? (
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
  // ── Forecasts ────────────────────────────────────────────────────────────────
  forecastHeader: {
    marginHorizontal: 16, marginTop: 28, marginBottom: 8, paddingTop: 18,
    borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  forecastTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  forecastSubtitle: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 4 },
  forecastOrderNote: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.7, marginTop: 5 },
  forecastBadge: {
    minWidth: 26, height: 26, borderRadius: 13, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  forecastBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  forecastRow: {
    marginHorizontal: 16, marginBottom: 8, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center',
  },
  forecastMatchup: { flex: 1, marginRight: 12 },
  forecastTeams: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  forecastTime: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 4 },
  forecastDetails: { alignItems: 'flex-end', maxWidth: '61%' },
  forecastStatus: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  forecastProjection: { fontSize: 12, fontFamily: 'Inter_700Bold', marginTop: 4 },
  forecastMarket: { fontSize: 8.5, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.3, marginTop: 2 },
  forecastDataNote: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, marginTop: 4 },
  forecastNotice: {
    marginHorizontal: 16, marginTop: 4, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 11,
  },
  forecastNoticeTitle: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  forecastNoticeText: { fontSize: 11, fontFamily: 'Inter_500Medium', lineHeight: 16, marginTop: 5 },
  // ── No-edge footer ────────────────────────────────────────────────────────────
  noEdgeFooter: {
    marginTop: 24, marginHorizontal: 16, paddingTop: 20,
    borderTopWidth: 1,
  },
  noEdgeTitle: {
    fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5,
    marginBottom: 10,
  },
  noEdgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  noEdgeChip: {
    borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 2,
  },
  noEdgeChipSport: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  noEdgeChipCount: { fontSize: 10, fontFamily: 'Inter_500Medium' },
});
