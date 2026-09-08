import React, { useCallback, useEffect, useMemo } from 'react';
import { FlatList, Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import {
  getV4FullSlateProjections,
  type GetV4FullSlateProjectionsSport,
  type V4FullSlateProjectionResponse,
  type V4OfficialPick,
  type V4PublicProjection,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useSports } from '@/context/SportsContext';
import { useSubscription } from '@/lib/revenuecat';
import { LockedPickCard } from '@/components/LockedPickCard';
import { SportFilter } from '@/components/SportFilter';
import { EmptyState } from '@/components/EmptyState';
import { V4ModelProjectionCard } from '@/components/V4ModelProjectionCard';
import { V4OfficialPickCard } from '@/components/V4OfficialPickCard';
import { splitV4Picks } from '@/utils/v4PicksHierarchy';

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

type ListItem =
  | { type: 'section'; title: string; count: number }
  | { type: 'official-pick'; pick: V4OfficialPick }
  | { type: 'projection'; projection: V4PublicProjection }
  | { type: 'unavailable-group'; sports: { sport: string; reason: string }[] };

export default function PicksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const router = useRouter();
  const { hasServerEntitlement } = useSubscription();
  const { selectedSport } = useSports();
  const requestedSports = selectedSport === 'All'
    ? [...V4_SPORTS]
    : [toV4Sport(selectedSport)].filter((sport): sport is GetV4FullSlateProjectionsSport => sport !== null);

  // The V4 board is the sole current-day Picks source. In particular, do not
  // substitute the retired games/today feed when this board is unavailable.
  const queries = useQueries({
    queries: requestedSports.map((sport) => ({
      queryKey: ['/api/model/v4/projections', { sport, viewerId: userId ?? 'signed-out', entitled: hasServerEntitlement }],
      queryFn: () => getV4FullSlateProjections({ sport }),
      enabled: Boolean(userId) && hasServerEntitlement,
      staleTime: 2 * 60 * 1000,
    })),
  });
  const boards = queries.map((query) => query.data).filter((board): board is V4FullSlateProjectionResponse => Boolean(board));
  const isLoading = hasServerEntitlement && queries.some((query) => query.isLoading);
  const isRefetching = queries.some((query) => query.isRefetching);
  const hasError = hasServerEntitlement && queries.length > 0 && queries.every((query) => query.isError);
  const refetch = useCallback(() => Promise.all(queries.map((query) => query.refetch())), [queries]);

  useEffect(() => {
    const refreshId = setInterval(() => { void refetch(); }, 5 * 60 * 1000);
    return () => clearInterval(refreshId);
  }, [refetch]);

  const projections = useMemo(() => boards.flatMap((board) => board.projections), [boards]);
  const officialPicks = useMemo(() => boards.flatMap((board) => board.officialPicks), [boards]);
  const hierarchy = useMemo(() => splitV4Picks(officialPicks, projections), [officialPicks, projections]);
  const { topPlays, qualifiedPlays, projectionsOnly: remainingProjections } = hierarchy;
  const sportGameCounts = useMemo(() => Object.fromEntries(
    boards.map((board) => [displaySport(board.sport), board.coverage.scheduledEvents]),
  ), [boards]);

  const hasExactlyOneTopPlay = hierarchy.topPlayIsAvailable;
  const listItems: ListItem[] = useMemo(() => {
    const items: ListItem[] = [];
    if (hasExactlyOneTopPlay) {
      items.push({ type: 'section', title: 'V4 TOP PLAY', count: 1 });
      topPlays.forEach((pick) => items.push({ type: 'official-pick', pick }));
    }
    if (qualifiedPlays.length) {
      items.push({ type: 'section', title: 'V4 QUALIFIED PLAYS', count: qualifiedPlays.length });
      qualifiedPlays.forEach((pick) => items.push({ type: 'official-pick', pick }));
    }
    if (remainingProjections.length) {
      items.push({ type: 'section', title: 'V4 PROJECTIONS', count: remainingProjections.length });
      remainingProjections.forEach((projection) => items.push({ type: 'projection', projection }));
    }

    const unavailableList: { sport: string; reason: string }[] = [];
    for (const board of boards) {
      // A dormant sport is not an unavailable board. Surface this state only
      // when scheduled events existed and every forecast genuinely failed.
      if (board.coverage.scheduledEvents > 0 && board.coverage.failedEvents > 0
        && board.projections.length === 0 && board.officialPicks.length === 0) {
        const failure = board.coverage.failures[0]?.reason ?? 'No legitimate V4 projection is available right now.';
        unavailableList.push({ sport: board.sport, reason: failure.replaceAll('_', ' ') });
      }
    }
    if (unavailableList.length > 0) {
      items.push({ type: 'unavailable-group', sports: unavailableList });
    }
    return items;
  }, [boards, hasExactlyOneTopPlay, qualifiedPlays, remainingProjections, topPlays]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  if (!hasServerEntitlement) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
        <View style={styles.header}><Text style={[styles.brand, { color: colors.foreground }]}>TBM</Text><Text style={[styles.sub, { color: colors.mutedForeground }]}>PICKS ENGINE</Text></View>
        <SportFilter gameCounts={{}} />
        <LockedPickCard onUnlock={() => router.push('/membership')} hiddenCount={0} />
        <Text style={[styles.entitlementCopy, { color: colors.mutedForeground }]}>An active subscription is required before V4 picks are requested or shown.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={listItems}
        keyExtractor={(item, index) =>
          item.type === 'official-pick'
            ? `official-${item.pick.eventId}-${item.pick.market}`
            : item.type === 'projection'
              ? `projection-${item.projection.eventId}`
              : `${item.type}-${index}`
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          <View>
            <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
              <Text style={[styles.brand, { color: colors.foreground }]}>TBM</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>V4 PICKS · {today}</Text>
            </View>
            <SportFilter gameCounts={sportGameCounts} />
            {!isLoading && hasError && <EmptyState message="V4 Picks are unavailable right now. No legacy picks are shown." />}
            {!isLoading && !hasError && hierarchy.topCandidateCount > 1 && (
              <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.noticeTitle, { color: colors.foreground }]}>TOP PLAY UNAVAILABLE</Text>
                <Text style={[styles.noticeCopy, { color: colors.mutedForeground }]}>The V4 board did not provide exactly one persisted Top Play. No Top Play is shown.</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === 'section') {
            return <View style={styles.section}><Text style={[styles.sectionText, { color: colors.mutedForeground }]}>{item.title} · {item.count}</Text></View>;
          }
          if (item.type === 'unavailable-group') {
            return (
              <View style={styles.unavailableGroup}>
                {item.sports.map(u => (
                  <View key={u.sport} style={[styles.unavailableRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.unavailableTitle, { color: colors.mutedForeground }]}>{displaySport(u.sport)} V4 UNAVAILABLE</Text>
                    <Text style={[styles.unavailableCopy, { color: colors.mutedForeground }]} numberOfLines={1}>{u.reason}</Text>
                  </View>
                ))}
              </View>
            );
          }
          if (item.type === 'official-pick') return <V4OfficialPickCard pick={item.pick} />;
          return <V4ModelProjectionCard projection={item.projection} />;
        }}
        ListEmptyComponent={!isLoading && !hasError
          ? <EmptyState message={selectedSport === 'All'
            ? 'No V4 games or legitimate projections are available today.'
            : `No ${selectedSport} games, projections, or official plays today.`} />
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
  section: { marginHorizontal: 16, marginTop: 18, marginBottom: 8 },
  sectionText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.3 },
  notice: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 14, borderWidth: 1, borderRadius: 8 },
  noticeTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: .8 },
  noticeCopy: { marginTop: 5, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  entitlementCopy: { marginHorizontal: 20, marginTop: 12, fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular' },

  unavailableGroup: { marginHorizontal: 16, marginTop: 12, marginBottom: 8, gap: 8 },
  unavailableRow: { padding: 12, borderWidth: 1, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unavailableTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: .5 },
  unavailableCopy: { fontSize: 11, fontFamily: 'Inter_500Medium', flex: 1, marginLeft: 12, textAlign: 'right' },
});