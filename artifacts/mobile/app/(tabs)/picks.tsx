import React, { useMemo } from 'react';
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
import { useGetGamesToday, useRefreshGames } from '@workspace/api-client-react';
import { mapApiGame } from '@/utils/gameAdapter';
import { getBestPicks } from '@/data/mockGames';
import { GameCard } from '@/components/GameCard';
import type { Game } from '@/data/mockGames';

export default function PicksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch } = useGetGamesToday();
  const { mutate: triggerRefresh, isPending: isRefreshing } = useRefreshGames({
    mutation: { onSuccess: () => refetch() },
  });

  const picks: Game[] = useMemo(() => {
    if (data?.games && data.games.length > 0) {
      return data.games
        .map(mapApiGame)
        .filter(g => g.projection.valueRating === 'Strong Buy' || g.projection.valueRating === 'Buy')
        .sort((a, b) => b.projection.modelScore - a.projection.modelScore);
    }
    if (!isLoading) return getBestPicks();
    return [];
  }, [data, isLoading]);

  const strongBuys = picks.filter(p => p.projection.valueRating === 'Strong Buy');
  const buys = picks.filter(p => p.projection.valueRating === 'Buy');
  const avgScore =
    picks.length > 0
      ? Math.round(picks.reduce((s, p) => s + p.projection.modelScore, 0) / picks.length)
      : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={picks}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 90,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => triggerRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderItem={({ item }: { item: Game }) => <GameCard game={item} />}
        ListHeaderComponent={
          <View style={{ backgroundColor: colors.background }}>
            {/* Page header */}
            <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
              <Text style={[styles.title, { color: colors.foreground }]}>Model Picks</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                {isLoading ? 'Loading…' : `Best value bets today · ${picks.length} picks`}
              </Text>
            </View>

            {isLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                  Fetching live picks…
                </Text>
              </View>
            )}

            {/* Summary strip */}
            <View style={[styles.summaryStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: colors.gold }]}>{strongBuys.length}</Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>STRONG BUY</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: colors.win }]}>{buys.length}</Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>BUY</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: colors.foreground }]}>{avgScore}</Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>AVG SCORE</Text>
              </View>
            </View>

            {strongBuys.length > 0 && (
              <Text style={[styles.sectionLabel, { color: colors.gold }]}>
                STRONG BUY · {strongBuys.length}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No strong picks identified today
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
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 8 },
  loadingText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  summaryStrip: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    paddingVertical: 14,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryVal: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  summaryLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  summaryDivider: { width: 1 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.5,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
});
