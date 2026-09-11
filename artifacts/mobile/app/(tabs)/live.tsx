import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import {
  getV4FullSlateProjections,
  type GetV4FullSlateProjectionsSport,
  type V4FullSlateProjectionResponse,
} from '@workspace/api-client-react';
import { EmptyState } from '@/components/EmptyState';
import { LockedPickCard } from '@/components/LockedPickCard';
import { V4LiveGamesBanner } from '@/components/V4LiveGamesBanner';
import { useColors } from '@/hooks/useColors';
import { useSubscription } from '@/lib/revenuecat';

const V4_SPORTS: GetV4FullSlateProjectionsSport[] = [
  'NFL', 'NCAAF', 'NBA', 'NCAAMB', 'MLB', 'NHL', 'SOCCER', 'WNBA',
];

function easternDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default function LiveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useAuth();
  const { hasServerEntitlement } = useSubscription();
  const [slateDate, setSlateDate] = useState(() => easternDate());

  const queries = useQueries({
    queries: V4_SPORTS.map((sport) => ({
      queryKey: ['/api/model/v4/projections', { sport, date: slateDate, viewerId: userId ?? 'signed-out', entitled: hasServerEntitlement }],
      queryFn: () => getV4FullSlateProjections({ sport, date: slateDate }),
      enabled: Boolean(userId) && hasServerEntitlement,
      staleTime: 2 * 60 * 1000,
    })),
  });
  const boards = queries
    .map((query) => query.data)
    .filter((board): board is V4FullSlateProjectionResponse => Boolean(board));
  const isLoading = hasServerEntitlement && queries.some((query) => query.isLoading);
  const isRefetching = queries.some((query) => query.isRefetching);
  const hasError = hasServerEntitlement && queries.length > 0 && queries.every((query) => query.isError);
  const refetch = useCallback(() => Promise.all(queries.map((query) => query.refetch())), [queries]);

  useEffect(() => {
    const refreshId = setInterval(() => {
      const currentDate = easternDate();
      if (currentDate !== slateDate) {
        setSlateDate(currentDate);
        return;
      }
      void refetch();
    }, 5 * 60 * 1000);
    return () => clearInterval(refreshId);
  }, [refetch, slateDate]);

  const liveFixtures = useMemo(
    () => boards
      .flatMap((board) => board.fixtures)
      .filter((fixture) => fixture.eventStatus === 'LIVE')
      .sort((a, b) => (a.eventStart ?? '').localeCompare(b.eventStart ?? '')),
    [boards],
  );
  const today = new Date(`${slateDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase();

  if (!hasServerEntitlement) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
        <View style={styles.header}>
          <Text style={[styles.brand, { color: colors.foreground }]}>TBM</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>LIVE SCORES</Text>
        </View>
        <LockedPickCard onUnlock={() => router.push('/membership')} hiddenCount={0} />
        <Text style={[styles.entitlementCopy, { color: colors.mutedForeground }]}>
          An active subscription is required to view the live scoreboard.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
          <Text style={[styles.brand, { color: colors.foreground }]}>TBM</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>LIVE SCORES · {today}</Text>
        </View>

        {!isLoading && hasError ? (
          <EmptyState message="Live scores are unavailable right now. Pull down to try again." />
        ) : !isLoading && liveFixtures.length === 0 ? (
          <EmptyState message="No games are live right now. Upcoming games remain in Picks." />
        ) : (
          <V4LiveGamesBanner fixtures={liveFixtures} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  brand: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  sub: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 2, marginTop: 2 },
  entitlementCopy: {
    marginHorizontal: 20,
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
});