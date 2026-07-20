import React, { useMemo } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useSports } from '@/context/SportsContext';
import { getTopPick, MOCK_GAMES } from '@/data/mockGames';
import { GameCard } from '@/components/GameCard';
import { FeaturedPick } from '@/components/FeaturedPick';
import { SportFilter } from '@/components/SportFilter';
import type { Game } from '@/data/mockGames';

export default function TodayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selectedSport } = useSports();

  const topPick = useMemo(() => getTopPick(), []);

  const filteredGames = useMemo(
    () => (selectedSport === 'All' ? MOCK_GAMES : MOCK_GAMES.filter(g => g.sport === selectedSport)),
    [selectedSport],
  );

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
          {
            paddingTop:
              insets.top + (Platform.OS === 'web' ? 67 : 16),
          },
        ]}
      >
        <Text style={[styles.appName, { color: colors.primary }]}>THE BETTING MODEL</Text>
        <Text style={[styles.date, { color: colors.mutedForeground }]}>{today}</Text>
      </View>

      {/* Sport filter */}
      <SportFilter />

      {/* Featured pick */}
      {selectedSport === 'All' && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TOP PICK TODAY</Text>
          <FeaturedPick game={topPick} />
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginHorizontal: 16, marginTop: 20 }]}>
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
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No games today for this sport
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 4 },
  appName: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  date: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
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
