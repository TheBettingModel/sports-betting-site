import React, { useMemo } from 'react';
import {
  FlatList,
  Image,
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

  const lockedCount = filteredGames.filter(g => g.isLocked).length;

  const ListHeader = () => (
    <View style={{ backgroundColor: colors.background }}>
      {/* App header */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
        <View style={styles.headerRow}>
          <View style={styles.logoRow}>
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.date, { color: colors.mutedForeground }]}>{today}</Text>
          </View>
          {lastUpdated && (
            <Text style={[styles.updated, { color: colors.mutedForeground }]}>
              Updated {lastUpdated}
            </Text>
          )}
        </View>
      </View>

      {/* Sport filter */}
      <SportFilter />

      {/* Featured pick — only when data is ready */}
      {!isLoading && selectedSport === 'All' && topPick && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TOP PICK TODAY</Text>
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
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginHorizontal: 16, marginTop: 20 }]}>
          {selectedSport === 'All' ? 'ALL GAMES' : `${selectedSport} GAMES`}
          {filteredGames.length > 0 && ` · ${filteredGames.length}`}
        </Text>
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
          data={filteredGames}
          keyExtractor={item => item.id}
          renderItem={({ item }: { item: Game }) =>
            item.isLocked
              ? <LockedPickCard onUnlock={() => router.push('/membership')} hiddenCount={lockedCount} />
              : <GameCard game={item} />
          }
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
  header: { paddingHorizontal: 16, paddingBottom: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoRow: { flexDirection: 'column', alignItems: 'flex-start' },
  logo: { width: 120, height: 40, borderRadius: 8 },
  date: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 3 },
  updated: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  section: { paddingHorizontal: 16, marginTop: 4 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  lockedBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  lockedBannerText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
