import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  getV4FullSlateProjections,
  type GetV4FullSlateProjectionsSport,
  type V4FullSlateProjectionResponse,
  type V4PublicProjection,
  type V4FullSlateProjectionResponseFixturesItem,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useSports } from '@/context/SportsContext';
import { useSubscription } from '@/lib/revenuecat';
import { RecoverableErrorState } from '@/components/RecoverableErrorState';
import { SportFilter } from '@/components/SportFilter';
import { EmptyState } from '@/components/EmptyState';
import { V4ModelProjectionCard } from '@/components/V4ModelProjectionCard';
import { V4UnavailableProjectionCard } from '@/components/V4UnavailableProjectionCard';
import { FreeProjectionPassGames } from '@/components/FreeProjectionPass';
import { fixtureMatchesTeamSearch } from '@/utils/matchupSearch';
import { nextSlateDate, projectionQueryKey, PROJECTION_REFRESH_MS, retryProjectionQuery } from '@/lib/projection-query-policy';
import { API_BASE_URL } from '@/lib/api-config';

const V4_SPORTS = ['NFL', 'NCAAF', 'NBA', 'NCAAMB', 'MLB', 'NHL', 'SOCCER', 'WNBA'] as const;

function toV4Sport(sport: string): GetV4FullSlateProjectionsSport | null {
  if (sport === 'NCAAB') return 'NCAAMB';
  if (sport === 'Soccer') return 'SOCCER';
  return V4_SPORTS.includes(sport as typeof V4_SPORTS[number])
    ? sport as GetV4FullSlateProjectionsSport
    : null;
}

function displaySport(sport: string) {
  return sport === 'NCAAMB' ? 'NCAAB' : sport === 'SOCCER' ? 'Soccer' : sport;
}

function easternDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftSlateDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00`);
  shifted.setDate(shifted.getDate() + days);
  return easternDate(shifted);
}

type ListItem =
  | { type: 'section'; title: string; count: number }
  | { type: 'projection'; projection: V4PublicProjection; fixture: V4FullSlateProjectionResponseFixturesItem; slateDate: string }
  | { type: 'unavailable'; fixture: V4FullSlateProjectionResponseFixturesItem; slateDate: string };

export default function PicksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    hasServerEntitlement,
    isLoading: isSubscriptionLoading,
    serverEntitlementError,
    serverEntitlementFetching,
    retryServerEntitlement,
    serverEntitlementFailure,
  } = useSubscription();
  const { selectedSport } = useSports();
  const [slateDate, setSlateDate] = useState(() => easternDate());
  const [searchQuery, setSearchQuery] = useState('');
  const currentEasternDate = useRef(easternDate());
  const warmedDay = useRef({ key: '', completed: new Set<string>() });
  const apiSource = API_BASE_URL;
  const requestedSports = selectedSport === 'All'
    ? [...V4_SPORTS]
    : [toV4Sport(selectedSport)].filter((sport): sport is GetV4FullSlateProjectionsSport => sport !== null);

  const queries = useQueries({
    queries: requestedSports.map((sport) => ({
      queryKey: projectionQueryKey(sport, slateDate, userId, hasServerEntitlement, apiSource),
      queryFn: ({ signal }: { signal: AbortSignal }) => getV4FullSlateProjections({ sport, date: slateDate }, { signal }),
      enabled: Boolean(userId) && hasServerEntitlement,
      staleTime: PROJECTION_REFRESH_MS,
      refetchInterval: PROJECTION_REFRESH_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: retryProjectionQuery,
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000),
    })),
  });
  
  const boards = queries.map((query) => query.data).filter((board): board is V4FullSlateProjectionResponse => Boolean(board));
  const isLoading = hasServerEntitlement && queries.some((query) => query.isLoading);
  const isRefetching = queries.some((query) => query.isRefetching);
  const hasError = hasServerEntitlement && queries.some((query) => query.isError);
  const latestQueries = useRef(queries);
  latestQueries.current = queries;
  // Keep the rollover timer/resume subscription stable across query updates.
  const refetch = useCallback(() => Promise.all(latestQueries.current.map((query) => query.refetch())), []);

  useEffect(() => {
    const refreshId = setInterval(() => {
      const currentDate = easternDate();
      if (currentDate !== currentEasternDate.current && slateDate === currentEasternDate.current) {
        setSlateDate(currentDate);
      }
      currentEasternDate.current = currentDate;
    }, 60 * 1000);
    return () => clearInterval(refreshId);
  }, [refetch, slateDate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && hasServerEntitlement) void refetch();
    });
    return () => subscription.remove();
  }, [hasServerEntitlement, refetch]);

  // Once per signed-in day, warm tomorrow's normal projection reads after the
  // visible board settles. Two workers bound load; this is not a heavy refresh
  // pipeline or a backfill. The live API only saves legitimate pregame output.
  const visibleBoardBusy = queries.some((query) => query.isFetching);
  useEffect(() => {
    const today = easternDate();
    const key = `${userId}:${today}:${apiSource}`;
    if (!userId || !hasServerEntitlement || serverEntitlementFetching || serverEntitlementError
      || slateDate !== today || visibleBoardBusy) return;
    if (warmedDay.current.key !== key) warmedDay.current = { key, completed: new Set() };
    const warming = warmedDay.current;
    if (warming.completed.size === V4_SPORTS.length) return;
    let cancelled = false;
    let cursor = 0;
    const tomorrow = nextSlateDate(today);
    const worker = async () => {
      while (!cancelled && cursor < V4_SPORTS.length) {
        const sport = V4_SPORTS[cursor++]!;
        if (warming.completed.has(sport)) continue;
        const queryKey = projectionQueryKey(sport, tomorrow, userId, true, apiSource);
        await queryClient.prefetchQuery({
          queryKey,
          queryFn: ({ signal }) => getV4FullSlateProjections({ sport, date: tomorrow }, { signal }),
          staleTime: PROJECTION_REFRESH_MS,
          retry: retryProjectionQuery,
        });
        if (queryClient.getQueryState(queryKey)?.status === 'success') warming.completed.add(sport);
      }
    };
    void Promise.all([worker(), worker()]);
    return () => { cancelled = true; };
  }, [userId, hasServerEntitlement, serverEntitlementFetching, serverEntitlementError,
    slateDate, visibleBoardBusy, apiSource, queryClient]);

  const sportGameCounts = useMemo(() => Object.fromEntries(
    boards.map((board) => [
      displaySport(board.sport),
      board.fixtures.length,
    ]),
  ), [boards]);

  const listItems: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    
    for (const board of boards) {
      const matchingFixtures = board.fixtures.filter((fixture) => fixtureMatchesTeamSearch(fixture, searchQuery));
      if (!matchingFixtures.length) continue;
      items.push({ type: 'section', title: `${displaySport(board.sport)} SLATE`, count: matchingFixtures.length });
      
      const projectionsByGameId = new Map(board.projections.map((projection) => [projection.eventId, projection]));
      
      matchingFixtures.forEach((fixture) => {
        const projection = projectionsByGameId.get(fixture.gameId);
        
        if (fixture.availability === 'AVAILABLE' && projection) {
          items.push({ type: 'projection', projection, fixture, slateDate });
        } else {
          items.push({ type: 'unavailable', fixture, slateDate });
        }
      });
    }
    return items;
  }, [boards, searchQuery, slateDate]);

  const dateLabel = new Date(`${slateDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  const isToday = slateDate === easternDate();
  
  if (!hasServerEntitlement && serverEntitlementError) {
    return (
      <View style={[styles.root, styles.gateState, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
        <RecoverableErrorState
          title="Unable to verify Pro access"
          message="Your access has not changed. Check your connection and try again."
          error={serverEntitlementFailure}
          isRetrying={serverEntitlementFetching}
          onRetry={retryServerEntitlement}
        />
      </View>
    );
  }
  if (!hasServerEntitlement && isSubscriptionLoading) {
    return (
      <View style={[styles.root, styles.gateState, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.gateTitle, { color: colors.foreground }]}>Loading your account…</Text>
        <Text style={[styles.gateCopy, { color: colors.mutedForeground }]}>
          Checking your subscription securely.
        </Text>
      </View>
    );
  }
  if (!hasServerEntitlement) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16), paddingBottom: insets.bottom + 90 }}>
          <View style={styles.header}><Text style={[styles.brand, { color: colors.foreground }]}>TBM</Text><Text style={[styles.sub, { color: colors.mutedForeground }]}>GAMES · TODAY'S SLATE</Text></View>
          {userId
            ? <FreeProjectionPassGames viewerId={userId} />
            : <EmptyState message="Sign in to browse today's slate." />}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={listItems}
        keyExtractor={(item, index) =>
          item.type === 'projection' ? `proj-${item.fixture.gameId}` :
          item.type === 'unavailable' ? `unavail-${item.fixture.gameId}` :
          `${item.type}-${index}`
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          <View>
            <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
              <Text style={[styles.brand, { color: colors.foreground }]}>TBM</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>GAMES · DAILY MODEL BOARD</Text>
            </View>
            <View style={[styles.dateNavigator, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Pressable
                accessibilityLabel="Previous day"
                onPress={() => setSlateDate((date) => shiftSlateDate(date, -1))}
                style={({ pressed }) => [styles.dateButton, { opacity: pressed ? 0.55 : 1 }]}
              >
                <Feather name="chevron-left" size={20} color={colors.foreground} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Return to today's games"
                onPress={() => setSlateDate(easternDate())}
                style={styles.dateCenter}
              >
                <Text style={[styles.dateLabel, { color: colors.foreground }]}>{dateLabel}</Text>
                <Text style={[styles.dateHint, { color: colors.mutedForeground }]}>{isToday ? 'TODAY' : 'TAP FOR TODAY'}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Next day"
                onPress={() => setSlateDate((date) => shiftSlateDate(date, 1))}
                style={({ pressed }) => [styles.dateButton, { opacity: pressed ? 0.55 : 1 }]}
              >
                <Feather name="chevron-right" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <SportFilter gameCounts={sportGameCounts} />
            <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="search" size={17} color={colors.mutedForeground} />
              <TextInput
                accessibilityLabel="Search games by team"
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search teams or matchups"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="never"
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {searchQuery.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear team search"
                  hitSlop={10}
                  onPress={() => setSearchQuery('')}
                  style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
                >
                  <Feather name="x-circle" size={18} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
            {!isLoading && hasError && <EmptyState message="Some projections could not refresh. Retrying automatically; saved results remain visible. Pull to retry now." />}
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'section') {
            return <View style={styles.section}><Text style={[styles.sectionText, { color: colors.mutedForeground }]}>{item.title} · {item.count}</Text></View>;
          }
          if (item.type === 'projection') return <V4ModelProjectionCard projection={item.projection} fixture={item.fixture} slateDate={item.slateDate} />;
          if (item.type === 'unavailable') return <V4UnavailableProjectionCard fixture={item.fixture} slateDate={item.slateDate} />;
          return null;
        }}
        ListEmptyComponent={!isLoading && !hasError
          ? <EmptyState message={searchQuery.trim()
            ? `No matchups found for “${searchQuery.trim()}” on ${dateLabel}.`
            : selectedSport === 'All'
              ? 'No games or projections are available today.'
              : `No ${selectedSport} games today.`} />
          : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  brand: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  sub: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginTop: 2 },
  dateNavigator: { marginHorizontal: 16, marginBottom: 4, minHeight: 58, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  dateButton: { width: 52, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  dateCenter: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: .5 },
  dateHint: { marginTop: 3, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  searchBox: { minHeight: 46, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 13, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, minHeight: 44, paddingVertical: 0, fontSize: 14, fontFamily: 'Inter_400Regular' },
  section: { marginHorizontal: 16, marginTop: 18, marginBottom: 8 },
  sectionText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.3 },
  entitlementCopy: { marginHorizontal: 20, marginTop: 12, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  gateState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  gateTitle: { marginTop: 16, fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  gateCopy: { marginTop: 8, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});