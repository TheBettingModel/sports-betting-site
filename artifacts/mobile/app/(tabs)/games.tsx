import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useSports, SPORTS } from '@/context/SportsContext';
import { useGetGamesToday, useRefreshGames } from '@workspace/api-client-react';
import { mapApiGame } from '@/utils/gameAdapter';
import { MOCK_GAMES } from '@/data/mockGames';
import { GameCard } from '@/components/GameCard';
import { LockedPickCard } from '@/components/LockedPickCard';
import { SportFilter } from '@/components/SportFilter';
import PaywallModal from '@/app/paywall';
import type { Game, Sport } from '@/data/mockGames';

export default function GamesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedSport } = useSports();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const { data, isLoading, refetch } = useGetGamesToday();
  const { mutate: triggerRefresh, isPending: isRefreshing } = useRefreshGames({
    mutation: { onSuccess: () => refetch() },
  });

  const allGames: Game[] = useMemo(() => {
    if (data?.games && data.games.length > 0) return data.games.map(mapApiGame);
    if (!isLoading) return MOCK_GAMES;
    return [];
  }, [data, isLoading]);

  const filtered = useMemo(
    () => (selectedSport === 'All' ? allGames : allGames.filter(g => g.sport === selectedSport)),
    [allGames, selectedSport],
  );

  // Group by sport when showing all
  const sections = useMemo(() => {
    if (selectedSport !== 'All') return null;
    return SPORTS.map(sport => ({
      sport,
      games: allGames.filter(g => g.sport === sport),
    })).filter(s => s.games.length > 0);
  }, [allGames, selectedSport]);

  const refreshControl = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={() => triggerRefresh()}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  );

  const ListHeader = () => (
    <View style={{ backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Games</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {isLoading ? 'Loading…' : `${filtered.length} games · Model projections`}
        </Text>
      </View>
      <SportFilter />
      {isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Fetching live data…</Text>
        </View>
      )}
    </View>
  );

  if (sections) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <FlatList
          data={sections}
          keyExtractor={item => item.sport}
          ListHeaderComponent={<ListHeader />}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          contentContainerStyle={{
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90,
          }}
          renderItem={({ item }) => (
            <View>
              <View style={[styles.sportHeader, { borderLeftColor: sportColor(item.sport) }]}>
                <Text style={[styles.sportLabel, { color: sportColor(item.sport) }]}>
                  {item.sport}
                </Text>
                <Text style={[styles.sportCount, { color: colors.mutedForeground }]}>
                  {item.games.length} games
                </Text>
              </View>
              {item.games.map((game: Game) =>
                game.isLocked
                  ? <LockedPickCard key={game.id} onUnlock={() => setPaywallOpen(true)} />
                  : <GameCard key={game.id} game={game} />
              )}
            </View>
          )}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }: { item: Game }) =>
          item.isLocked
            ? <LockedPickCard onUnlock={() => setPaywallOpen(true)} />
            : <GameCard game={item} />
        }
        ListHeaderComponent={<ListHeader />}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        contentContainerStyle={{
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90,
        }}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No games for this sport
              </Text>
            </View>
          ) : null
        }
      />

      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </View>
  );
}

function sportColor(sport: Sport): string {
  const map: Record<Sport, string> = {
    NFL: '#4F46E5',
    NCAAF: '#7C3AED',
    NBA: '#EA580C',
    NCAAB: '#B45309',
    MLB: '#0EA5E9',
    NHL: '#8B5CF6',
    Soccer: '#22C55E',
    UFC: '#DC2626',
    WNBA: '#FF6900',
  };
  return map[sport];
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 4 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  loadingText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  sportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderLeftWidth: 3,
    paddingLeft: 10,
    gap: 8,
  },
  sportLabel: { fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  sportCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
});
