import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useSports } from '@/context/SportsContext';
import { useGetGamesToday, useRefreshGames } from '@workspace/api-client-react';
import { mapApiGame } from '@/utils/gameAdapter';
import { getTopPick, MOCK_GAMES } from '@/data/mockGames';
import { GameCard } from '@/components/GameCard';
import { FeaturedPick } from '@/components/FeaturedPick';
import { SportFilter } from '@/components/SportFilter';
import type { Game } from '@/data/mockGames';

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedSport } = useSports();

  const { data, isLoading, refetch } = useGetGamesToday();
  const { mutate: triggerRefresh, isPending: isRefreshing } = useRefreshGames({
    mutation: { onSuccess: () => refetch() },
  });

  const allGames: Game[] = useMemo(() => {
    if (data?.games && data.games.length > 0) return data.games.map(mapApiGame);
    if (!isLoading) return MOCK_GAMES; // fallback when ESPN has no games today
    return [];
  }, [data, isLoading]);

  const filteredGames = useMemo(
    () => (selectedSport === 'All' ? allGames : allGames.filter(g => g.sport === selectedSport)),
    [allGames, selectedSport],
  );

  const topPick = useMemo(() => {
    if (allGames.length > 0) {
      return [...allGames].sort((a, b) => b.projection.modelScore - a.projection.modelScore)[0] ?? getTopPick();
    }
    return getTopPick();
  }, [allGames]);

  const lastUpdated = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const ListHeader = () => (
    <View style={{ backgroundColor: colors.background }}>
      {/* App header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) },
        ]}
      >
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

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Fetching live data…
          </Text>
        </View>
      )}

      {/* Featured pick */}
      {selectedSport === 'All' && topPick && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TOP PICK TODAY</Text>
          <FeaturedPick game={topPick} />
        </View>
      )}

      <Text
        style={[
          styles.sectionLabel,
          { color: colors.mutedForeground, marginHorizontal: 16, marginTop: 20 },
        ]}
      >
        {selectedSport === 'All' ? 'ALL GAMES' : `${selectedSport} GAMES`} · {filteredGames.length}
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredGames}
        keyExtractor={item => item.id}
        renderItem={({ item }: { item: Game }) => <GameCard game={item} />}
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
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No games today for this sport
              </Text>
            </View>
          ) : null
        }
      />
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
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  loadingText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  section: { paddingHorizontal: 16, marginTop: 4 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
});
