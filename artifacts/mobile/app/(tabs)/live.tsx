import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import Svg, { Line, Polyline } from 'react-native-svg';
import {
  getV4FullSlateProjections,
  type GetV4FullSlateProjectionsSport,
  type GamesMarketAnalyticsResponseGamesItem,
  type MarketHistoryPoint,
  type V4FullSlateProjectionResponse,
  type V4FullSlateProjectionResponseFixturesItem,
  type V4PublicProjection,
  useGetGamesMarketAnalytics,
} from '@workspace/api-client-react';
import { EmptyState } from '@/components/EmptyState';
import { LockedPickCard } from '@/components/LockedPickCard';
import { TeamLogo } from '@/components/TeamLogo';
import { useColors } from '@/hooks/useColors';
import { useSubscription } from '@/lib/revenuecat';

const SPORTS: GetV4FullSlateProjectionsSport[] = [
  'MLB', 'NFL', 'NCAAF', 'NBA', 'NCAAMB', 'NHL', 'WNBA', 'SOCCER',
];
const AMBER = '#F59E0B';

type Direction = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'UNAVAILABLE';
type BoardItem = {
  fixture: V4FullSlateProjectionResponseFixturesItem;
  projection: V4PublicProjection;
  evidence?: GamesMarketAnalyticsResponseGamesItem;
  selectedSide: 'home' | 'away' | null;
  selectedName: string;
  sharpDirection: Direction;
  clvDirection: Direction;
  clvHistory: MarketHistoryPoint[];
  sharpHistory: MarketHistoryPoint[];
};

function easternDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function displaySport(sport: string): string {
  if (sport === 'NCAAMB') return 'NCAAB';
  if (sport === 'SOCCER') return 'Soccer';
  return sport;
}

function americanImplied(price: number): number {
  return price < 0 ? Math.abs(price) / (Math.abs(price) + 100) : 100 / (price + 100);
}

function movementDirection(first: number, last: number): Direction {
  const delta = americanImplied(last) - americanImplied(first);
  if (delta > 0.0025) return 'POSITIVE';
  if (delta < -0.0025) return 'NEGATIVE';
  return 'NEUTRAL';
}

function comparableHistory(
  points: MarketHistoryPoint[],
  selection: 'home' | 'away' | null,
  forecastTimestamp?: string,
): MarketHistoryPoint[] {
  if (!selection) return [];
  const grouped = new Map<string, MarketHistoryPoint[]>();
  for (const point of points) {
    if (point.selection !== selection || !point.sportsbook) continue;
    const rows = grouped.get(point.sportsbook) ?? [];
    rows.push(point);
    grouped.set(point.sportsbook, rows);
  }
  const groups = [...grouped.values()]
    .map((rows) => rows.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)))
    .filter((rows) => rows.length >= 2)
    .sort((a, b) => {
      const aLast = a[a.length - 1]?.capturedAt ?? '';
      const bLast = b[b.length - 1]?.capturedAt ?? '';
      return bLast.localeCompare(aLast);
    });
  const chosen = groups[0] ?? [];
  if (!forecastTimestamp || chosen.length < 2) return chosen;
  const forecastMs = new Date(forecastTimestamp).getTime();
  const atForecast = chosen.filter((point) => new Date(point.capturedAt).getTime() <= forecastMs);
  const afterForecast = chosen.filter((point) => new Date(point.capturedAt).getTime() >= forecastMs);
  const baseline = atForecast[atForecast.length - 1];
  const latest = afterForecast[afterForecast.length - 1];
  if (!baseline || !latest || baseline.capturedAt === latest.capturedAt) return [];
  return [baseline, ...afterForecast.filter((point) => point.capturedAt !== baseline.capturedAt)];
}

function buildBoardItem(
  fixture: V4FullSlateProjectionResponseFixturesItem,
  projection: V4PublicProjection,
  evidence?: GamesMarketAnalyticsResponseGamesItem,
): BoardItem {
  const selectedSide = projection.projectedWinner === 'HOME'
    ? 'home'
    : projection.projectedWinner === 'AWAY'
      ? 'away'
      : null;
  const selectedName = selectedSide === 'home'
    ? fixture.homeParticipant.name
    : selectedSide === 'away'
      ? fixture.awayParticipant.name
      : projection.projectedWinner === 'DRAW' ? 'Draw' : 'Unavailable';
  const sharpHistory = comparableHistory(evidence?.sharpMoneyHistory ?? [], selectedSide);
  const clvHistory = comparableHistory(
    evidence?.marketHistory ?? [],
    selectedSide,
    projection.forecastTimestamp,
  );
  return {
    fixture,
    projection,
    evidence,
    selectedSide,
    selectedName,
    sharpDirection: sharpHistory.length >= 2
      ? movementDirection(sharpHistory[0]!.price, sharpHistory[sharpHistory.length - 1]!.price)
      : 'UNAVAILABLE',
    clvDirection: clvHistory.length >= 2
      ? movementDirection(clvHistory[0]!.price, clvHistory[clvHistory.length - 1]!.price)
      : 'UNAVAILABLE',
    clvHistory,
    sharpHistory,
  };
}

function directionColor(direction: Direction, colors: ReturnType<typeof useColors>): string {
  if (direction === 'POSITIVE') return colors.primary;
  if (direction === 'NEGATIVE') return AMBER;
  return colors.mutedForeground;
}

function formatTime(value: string | null): string {
  if (!value) return 'TBD';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function directionCopy(item: BoardItem): string {
  if (item.sharpDirection === 'UNAVAILABLE') return 'NO VERIFIED SHARP SNAPSHOT';
  if (item.sharpDirection === 'NEUTRAL') return 'NO MATERIAL SHARP MOVE';
  return item.sharpDirection === 'POSITIVE'
    ? `TOWARD ${item.selectedName.toUpperCase()}`
    : `AWAY FROM ${item.selectedName.toUpperCase()}`;
}

function MarketSparkline({ points, color }: { points: MarketHistoryPoint[]; color: string }) {
  const values = points.map((point) => americanImplied(point.price));
  if (values.length < 2) {
    return (
      <View style={styles.chartUnavailable}>
        <Text style={styles.microMuted}>MARKET HISTORY UNAVAILABLE</Text>
      </View>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.01);
  const coords = values.map((value, index) => {
    const x = 8 + (index / Math.max(values.length - 1, 1)) * 302;
    const y = 50 - ((value - min) / range) * 34;
    return `${x},${y}`;
  }).join(' ');
  return (
    <Svg width="100%" height={62} viewBox="0 0 318 62">
      <Line x1="8" y1="50" x2="310" y2="50" stroke="#292929" strokeWidth="1" />
      <Line x1="8" y1="16" x2="310" y2="16" stroke="#1C1C1C" strokeWidth="1" strokeDasharray="3 4" />
      <Polyline points={coords} fill="none" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

function MarketCard({ item, onPress }: { item: BoardItem; onPress: () => void }) {
  const colors = useColors();
  const sharpColor = directionColor(item.sharpDirection, colors);
  const clvColor = directionColor(item.clvDirection, colors);
  const fixture = item.fixture;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open analytics for ${fixture.awayParticipant.name} at ${fixture.homeParticipant.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: pressed ? colors.mutedForeground : colors.border, opacity: pressed ? 0.82 : 1 },
      ]}
    >
      <View style={styles.cardMeta}>
        <Text style={[styles.micro, { color: colors.mutedForeground }]}>
          {displaySport(fixture.sport).toUpperCase()} · {formatTime(fixture.eventStart)}
        </Text>
        <View style={[styles.statusBadge, { borderColor: sharpColor + '55', backgroundColor: sharpColor + '12' }]}>
          <Text style={[styles.badgeText, { color: sharpColor }]}>{item.sharpDirection}</Text>
        </View>
      </View>

      <View style={styles.matchupRow}>
        <View style={styles.team}>
          <TeamLogo
            sport={fixture.sport}
            abbr={fixture.awayParticipant.abbreviation ?? ''}
            logoUrl={fixture.awayParticipant.logo ?? undefined}
            size={28}
          />
          <Text numberOfLines={1} style={[styles.teamName, { color: colors.foreground }]}>{fixture.awayParticipant.name}</Text>
        </View>
        <Text style={[styles.at, { color: colors.mutedForeground }]}>@</Text>
        <View style={[styles.team, styles.teamRight]}>
          <Text numberOfLines={1} style={[styles.teamName, styles.teamNameRight, { color: colors.foreground }]}>{fixture.homeParticipant.name}</Text>
          <TeamLogo
            sport={fixture.sport}
            abbr={fixture.homeParticipant.abbreviation ?? ''}
            logoUrl={fixture.homeParticipant.logo ?? undefined}
            size={28}
          />
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.signalRow}>
        <View style={styles.signalPrimary}>
          <Text style={[styles.micro, { color: colors.mutedForeground }]}>SHARP MONEY DIRECTION</Text>
          <Text numberOfLines={1} style={[styles.direction, { color: sharpColor }]}>{directionCopy(item)}</Text>
        </View>
        <View style={styles.clvBlock}>
          <Text style={[styles.micro, { color: colors.mutedForeground }]}>
            {fixture.eventStatus === 'FINAL' ? 'FINAL CLV' : 'CLV DIRECTION'}
          </Text>
          <Text style={[styles.clvDirection, { color: clvColor }]}>{item.clvDirection}</Text>
        </View>
      </View>
      <View style={styles.detailsRow}>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          {item.sharpDirection === 'UNAVAILABLE'
            ? 'Verified sharp-book history has not arrived.'
            : item.sharpDirection === 'POSITIVE'
              ? 'Verified sharp movement supports the model side.'
              : 'Verified sharp movement does not support the model side.'}
        </Text>
        <View style={styles.viewDetails}>
          <Text style={[styles.micro, { color: colors.mutedForeground }]}>VIEW ANALYTICS</Text>
          <Feather name="chevron-right" size={13} color={colors.mutedForeground} />
        </View>
      </View>
    </Pressable>
  );
}

function AnalyticsDrawer({ item, onClose }: { item: BoardItem | null; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  if (!item) return null;
  const { fixture, projection } = item;
  const winProbability = item.selectedSide === 'home'
    ? projection.homeWinProbability
    : item.selectedSide === 'away'
      ? projection.awayWinProbability
      : projection.drawProbability;
  const chartColor = directionColor(item.clvDirection, colors);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close analytics" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.drawer, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.handle} />
          <View style={styles.drawerHeader}>
            <View style={styles.drawerTitleWrap}>
              <Text style={[styles.micro, { color: colors.primary }]}>
                {displaySport(fixture.sport).toUpperCase()} · {formatTime(fixture.eventStart)}
              </Text>
              <Text numberOfLines={1} style={[styles.drawerTitle, { color: colors.foreground }]}>
                {fixture.awayParticipant.name} <Text style={{ color: colors.mutedForeground }}>@</Text> {fixture.homeParticipant.name}
              </Text>
            </View>
            <Pressable accessibilityLabel="Close analytics" onPress={onClose} style={[styles.closeButton, { borderColor: colors.border }]}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <View style={styles.metricGrid}>
            <View style={[styles.metric, { borderColor: colors.border }]}>
              <Text style={[styles.micro, { color: colors.mutedForeground }]}>PROJECTED SCORE</Text>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>
                {projection.expectedAwayScore != null && projection.expectedHomeScore != null
                  ? `${fixture.awayParticipant.abbreviation ?? 'AWAY'} ${projection.expectedAwayScore.toFixed(1)} — ${fixture.homeParticipant.abbreviation ?? 'HOME'} ${projection.expectedHomeScore.toFixed(1)}`
                  : 'Unavailable'}
              </Text>
              <Text style={[styles.metricHint, { color: colors.mutedForeground }]}>TBM model output · not a betting line</Text>
            </View>
            <View style={[styles.metric, { borderColor: colors.border }]}>
              <Text style={[styles.micro, { color: colors.mutedForeground }]}>WIN PROBABILITY</Text>
              <Text style={[styles.probability, { color: colors.primary }]}>
                {winProbability != null ? `${Math.round(winProbability * 100)}%` : '—'}
              </Text>
              <Text style={[styles.metricHint, { color: colors.mutedForeground }]}>{item.selectedName} favored</Text>
            </View>
          </View>
          <View style={[styles.totalMetric, { borderColor: colors.border }]}>
            <Text style={[styles.micro, { color: colors.mutedForeground }]}>PROJECTED TOTAL</Text>
            <Text style={[styles.totalValue, { color: colors.foreground }]}>
              {projection.expectedTotal != null ? projection.expectedTotal.toFixed(1) : 'Unavailable'}
              {projection.expectedTotal != null ? ` ${fixture.sport === 'MLB' ? 'runs' : fixture.sport === 'SOCCER' || fixture.sport === 'NHL' ? 'goals' : 'points'}` : ''}
            </Text>
            <Text style={[styles.metricHint, { color: colors.mutedForeground }]}>Expected scoring from TBM’s projection</Text>
          </View>

          <View style={[styles.historyPanel, { borderColor: colors.border }]}>
            <View style={styles.historyHeader}>
              <View>
                <Text style={[styles.micro, { color: colors.mutedForeground }]}>
                  {fixture.eventStatus === 'FINAL' ? 'FINAL CLV · MARKET HISTORY' : 'PROJECTED CLV · MARKET HISTORY'}
                </Text>
                <Text style={[styles.historyBook, { color: colors.mutedForeground }]}>
                  {item.clvHistory[0]?.sportsbook ?? 'No comparable snapshot'}
                </Text>
              </View>
              <Text style={[styles.direction, { color: chartColor }]}>{item.clvDirection}</Text>
            </View>
            <MarketSparkline points={item.clvHistory} color={chartColor} />
          </View>

          <View style={[styles.drawerSignals, { borderTopColor: colors.border }]}>
            <View>
              <Text style={[styles.micro, { color: colors.mutedForeground }]}>SHARP MONEY DIRECTION</Text>
              <Text style={[styles.direction, { color: directionColor(item.sharpDirection, colors) }]}>{directionCopy(item)}</Text>
            </View>
            <View style={styles.drawerClv}>
              <Text style={[styles.micro, { color: colors.mutedForeground }]}>CLV DIRECTION</Text>
              <Text style={[styles.direction, { color: chartColor }]}>{item.clvDirection}</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function AnalyticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const router = useRouter();
  const {
    hasServerEntitlement,
    isLoading: isSubscriptionLoading,
    serverEntitlementError,
  } = useSubscription();
  const [activeSport, setActiveSport] = useState<string>('All');
  const [selected, setSelected] = useState<BoardItem | null>(null);
  const slateDate = easternDate();

  const projectionQueries = useQueries({
    queries: SPORTS.map((sport) => ({
      queryKey: ['/api/model/v4/projections', { sport, date: slateDate, viewerId: userId ?? 'signed-out', entitled: hasServerEntitlement }],
      queryFn: () => getV4FullSlateProjections({ sport, date: slateDate }),
      enabled: Boolean(userId) && hasServerEntitlement,
      staleTime: 2 * 60 * 1000,
    })),
  });
  const analyticsQuery = useGetGamesMarketAnalytics(
    { date: slateDate },
    {
      query: {
        enabled: Boolean(userId) && hasServerEntitlement,
        queryKey: ['/api/games/market-analytics', { date: slateDate, viewerId: userId ?? 'signed-out', entitled: hasServerEntitlement }],
        staleTime: 2 * 60 * 1000,
      },
    },
  );

  const boards = projectionQueries.map((query) => query.data)
    .filter((board): board is V4FullSlateProjectionResponse => Boolean(board));
  const evidenceByGame = new Map((analyticsQuery.data?.games ?? []).map((game) => [game.gameId, game]));
  const items = useMemo(() => {
    const rows: BoardItem[] = [];
    for (const board of boards) {
      const projections = new Map(board.projections.map((projection) => [projection.eventId, projection]));
      for (const fixture of board.fixtures) {
        const projection = projections.get(fixture.gameId);
        if (!projection || fixture.eventStatus === 'LIVE') continue;
        rows.push(buildBoardItem(fixture, projection, evidenceByGame.get(fixture.gameId)));
      }
    }
    return rows.sort((a, b) => {
      const aAvailable = a.sharpDirection === 'UNAVAILABLE' ? 1 : 0;
      const bAvailable = b.sharpDirection === 'UNAVAILABLE' ? 1 : 0;
      return aAvailable - bAvailable || (a.fixture.eventStart ?? '').localeCompare(b.fixture.eventStart ?? '');
    });
  }, [boards, analyticsQuery.data]);
  const visibleItems = activeSport === 'All'
    ? items
    : items.filter((item) => displaySport(item.fixture.sport) === activeSport);
  const positiveClv = items.filter((item) => item.clvDirection === 'POSITIVE').length;
  const availableSports = ['All', ...new Set(items.map((item) => displaySport(item.fixture.sport)))];
  const isLoading = hasServerEntitlement && (
    analyticsQuery.isLoading || projectionQueries.some((query) => query.isLoading)
  );
  const isRefetching = analyticsQuery.isRefetching || projectionQueries.some((query) => query.isRefetching);
  const allFailed = projectionQueries.length > 0 && projectionQueries.every((query) => query.isError);
  const refetch = useCallback(async () => {
    await Promise.all([
      analyticsQuery.refetch(),
      ...projectionQueries.map((query) => query.refetch()),
    ]);
  }, [analyticsQuery.refetch, projectionQueries]);

  if (!hasServerEntitlement && (isSubscriptionLoading || serverEntitlementError)) {
    return (
      <View style={[styles.gate, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.gateTitle, { color: colors.foreground }]}>
          {serverEntitlementError ? 'Unable to verify Pro access' : 'Loading your account…'}
        </Text>
        <Text style={[styles.gateCopy, { color: colors.mutedForeground }]}>
          Analytics remains locked until access is securely confirmed.
        </Text>
      </View>
    );
  }
  if (!hasServerEntitlement) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
        <View style={styles.lockedHeader}>
          <Text style={[styles.brand, { color: colors.foreground }]}>TBM / ANALYTICS</Text>
          <Text style={[styles.micro, { color: colors.mutedForeground }]}>MARKET INTELLIGENCE</Text>
        </View>
        <LockedPickCard onUnlock={() => router.push('/membership')} hiddenCount={0} />
        <Text style={[styles.gateCopy, { color: colors.mutedForeground }]}>
          An active subscription is required to view verified market movement and CLV analytics.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.fixture.gameId}
        renderItem={({ item }) => <MarketCard item={item} onPress={() => setSelected(item)} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 104 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={[styles.headerWrap, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 12) }]}>
            <View style={styles.topBar}>
              <View>
                <Text style={[styles.brand, { color: colors.foreground }]}>TBM / ANALYTICS</Text>
                <Text style={[styles.micro, { color: colors.mutedForeground }]}>MARKET DESK · {slateDate}</Text>
              </View>
              <Pressable accessibilityLabel="Refresh analytics" onPress={() => void refetch()} style={[styles.iconButton, { borderColor: colors.border }]}>
                <Feather name="refresh-cw" size={15} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={styles.titleBlock}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>MARKET INTELLIGENCE</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Sharp Movement & CLV</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Track verified market movement relative to TBM’s forecast price.
              </Text>
            </View>
            <View style={[styles.pulse, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.pulseCell}>
                <Text style={[styles.pulseValue, { color: colors.foreground }]}>{items.length}</Text>
                <Text style={[styles.micro, { color: colors.mutedForeground }]}>TRACKED</Text>
              </View>
              <View style={[styles.pulseCell, styles.pulseDivider, { borderColor: colors.border }]}>
                <Text style={[styles.pulseValue, { color: colors.foreground }]}>{items.length}</Text>
                <Text style={[styles.micro, { color: colors.mutedForeground }]}>WITH MODEL</Text>
              </View>
              <View style={styles.pulseCell}>
                <Text style={[styles.pulseValue, { color: colors.primary }]}>{positiveClv}</Text>
                <Text style={[styles.micro, { color: colors.mutedForeground }]}>POSITIVE CLV</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {availableSports.map((sport) => {
                const active = activeSport === sport;
                return (
                  <Pressable
                    key={sport}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setActiveSport(sport)}
                    style={[
                      styles.filter,
                      { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border },
                    ]}
                  >
                    <Text style={[styles.filterText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                      {sport === 'All' ? 'ALL MOVES' : sport.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.sectionHeader}>
              <Text style={[styles.micro, { color: colors.mutedForeground }]}>TODAY’S MOVEMENT</Text>
              <Text style={[styles.micro, { color: colors.mutedForeground }]}>PULL TO REFRESH</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator style={styles.loader} color={colors.primary} />
            : <EmptyState message={allFailed ? 'Analytics are unavailable right now. Pull down to try again.' : 'No model projections are available for this filter.'} />
        }
      />
      <AnalyticsDrawer item={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  gateTitle: { marginTop: 16, fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  gateCopy: { marginTop: 8, marginHorizontal: 24, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  lockedHeader: { paddingHorizontal: 16, paddingBottom: 22, gap: 5 },
  headerWrap: { paddingHorizontal: 16 },
  topBar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  brand: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  micro: { fontSize: 8, lineHeight: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.25 },
  microMuted: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1.1, color: '#5A5A5A' },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 4 },
  titleBlock: { marginTop: 23, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  eyebrow: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.6 },
  title: { marginTop: 6, fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 },
  subtitle: { marginTop: 8, fontSize: 11, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  pulse: { marginTop: 16, flexDirection: 'row', borderWidth: 1, borderRadius: 5, paddingVertical: 11 },
  pulseCell: { flex: 1, paddingHorizontal: 11 },
  pulseDivider: { borderLeftWidth: 1, borderRightWidth: 1 },
  pulseValue: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  filters: { gap: 7, paddingVertical: 12 },
  filter: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8 },
  filterText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2, paddingBottom: 10 },
  loader: { marginTop: 50 },
  card: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderWidth: 1, borderRadius: 5 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText: { fontSize: 8, fontFamily: 'Inter_700Bold' },
  matchupRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  team: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamRight: { justifyContent: 'flex-end' },
  teamName: { flexShrink: 1, fontSize: 14, fontFamily: 'Inter_700Bold' },
  teamNameRight: { textAlign: 'right' },
  at: { width: 24, textAlign: 'center', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  divider: { height: 1, marginTop: 12 },
  signalRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 10, gap: 12 },
  signalPrimary: { flex: 1, minWidth: 0 },
  direction: { marginTop: 5, fontSize: 10, fontFamily: 'Inter_700Bold' },
  clvBlock: { alignItems: 'flex-end' },
  clvDirection: { marginTop: 5, fontSize: 17, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  detailsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10 },
  note: { flex: 1, fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular' },
  viewDetails: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.74)' },
  drawer: { maxHeight: '83%', borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16 },
  handle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 3, backgroundColor: '#4B5563', marginBottom: 14 },
  drawerHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  drawerTitleWrap: { flex: 1 },
  drawerTitle: { marginTop: 6, fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  closeButton: { width: 34, height: 34, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  metricGrid: { flexDirection: 'row', gap: 8, marginTop: 18 },
  metric: { flex: 1, minHeight: 100, borderWidth: 1, borderRadius: 5, padding: 11 },
  metricValue: { marginTop: 12, fontSize: 15, fontFamily: 'Inter_700Bold' },
  metricHint: { marginTop: 8, fontSize: 9, lineHeight: 13, fontFamily: 'Inter_400Regular' },
  probability: { marginTop: 8, fontSize: 30, fontFamily: 'Inter_500Medium', letterSpacing: -1 },
  totalMetric: { marginTop: 8, borderWidth: 1, borderRadius: 5, padding: 11 },
  totalValue: { marginTop: 8, fontSize: 21, fontFamily: 'Inter_700Bold' },
  historyPanel: { marginTop: 12, borderWidth: 1, borderRadius: 5, padding: 11 },
  historyHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  historyBook: { marginTop: 5, fontSize: 9, fontFamily: 'Inter_400Regular' },
  chartUnavailable: { height: 62, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#1E1E1E' },
  drawerSignals: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  drawerClv: { alignItems: 'flex-end' },
});