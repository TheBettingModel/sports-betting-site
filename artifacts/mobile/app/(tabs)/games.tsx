import React, { useMemo } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useSports, SPORTS } from '@/context/SportsContext';
import { MOCK_GAMES } from '@/data/mockGames';
import { GameCard } from '@/components/GameCard';
import { SportFilter } from '@/components/SportFilter';
import type { Game, Sport } from '@/data/mockGames';

export default function GamesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedSport } = useSports();

  const filtered = useMemo(
    () => (selectedSport === 'All' ? MOCK_GAMES : MOCK_GAMES.filter(g => g.sport === selectedSport)),
    [selectedSport],
  );

  // Group by sport when showing all
  const sections = useMemo(() => {
    if (selectedSport !== 'All') return null;
    return SPORTS.map(sport => ({
      sport,
      games: MOCK_GAMES.filter(g => g.sport === sport),
    })).filter(s => s.games.length > 0);
  }, [selectedSport]);

  const ListHeader = () => (
    <View style={{ backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Games</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {filtered.length} games · Model projections
        </Text>
      </View>
      <SportFilter />
    </View>
  );

  if (sections) {
    // All sports – render sections manually
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <FlatList
          data={sections}
          keyExtractor={item => item.sport}
          ListHeaderComponent={<ListHeader />}
          showsVerticalScrollIndicator={false}
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
              {item.games.map((game: Game) => (
                <GameCard key={game.id} game={game} />
              ))}
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
        renderItem={({ item }: { item: Game }) => <GameCard game={item} />}
        ListHeaderComponent={<ListHeader />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90,
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No games for this sport
            </Text>
          </View>
        }
      />
    </View>
  );
}

function sportColor(sport: Sport): string {
  const map: Record<Sport, string> = {
    NFL: '#4F46E5',
    NBA: '#EA580C',
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
