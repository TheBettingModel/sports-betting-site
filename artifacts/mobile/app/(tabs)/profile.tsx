import React from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useGetModelStats, useGetGamesToday } from '@workspace/api-client-react';
import { mapApiGame } from '@/utils/gameAdapter';
import { MOCK_GAMES } from '@/data/mockGames';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: statsData } = useGetModelStats();
  const { data: gamesData } = useGetGamesToday();

  // Real or mock games for today's stats
  const todayGames = React.useMemo(() => {
    if (gamesData?.games && gamesData.games.length > 0) return gamesData.games.map(mapApiGame);
    return MOCK_GAMES;
  }, [gamesData]);

  const strongBuys = todayGames.filter(g => g.projection.valueRating === 'Strong Buy').length;
  const avgEdge = (
    todayGames.reduce((s, g) => s + Math.max(g.projection.edge, 0), 0) / todayGames.length
  ).toFixed(1);

  // Model learning stats
  const overall = statsData?.overallAccuracy ?? 0;
  const totalPredictions = statsData?.totalPredictions ?? 0;
  const isCalibrating = totalPredictions === 0;

  const strongBuyAcc = statsData?.stats
    ? Math.round(
        (statsData.stats.reduce((s, w) => s + w.strongBuyAccuracy, 0) / Math.max(statsData.stats.length, 1)) * 100,
      )
    : null;

  const topSport = statsData?.stats.length
    ? [...statsData.stats].sort((a, b) => b.accuracyRate - a.accuracyRate)[0]
    : null;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16),
        paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Brand header */}
      <View style={styles.brandRow}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <View style={styles.brandText}>
          <Text style={[styles.brandName, { color: colors.foreground }]}>TheBettingModel</Text>
          <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>AI-Powered Sports Analytics</Text>
        </View>
      </View>

      {/* Sign in CTA */}
      <Pressable
        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
        style={({ pressed }) => [
          styles.signInBtn,
          { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1, borderRadius: colors.radius },
        ]}
      >
        <Feather name="user" size={18} color={colors.primaryForeground} />
        <Text style={[styles.signInText, { color: colors.primaryForeground }]}>Sign In to Sync Picks</Text>
      </Pressable>

      {/* Model Learning */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MODEL LEARNING</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {isCalibrating ? (
          <View style={styles.calibratingBox}>
            <View style={[styles.calibDot, { backgroundColor: colors.gold }]} />
            <Text style={[styles.calibText, { color: colors.foreground }]}>Calibrating…</Text>
            <Text style={[styles.calibSub, { color: colors.mutedForeground }]}>
              Model learns automatically as games complete each day.
            </Text>
          </View>
        ) : (
          <View style={styles.perfRow}>
            <View style={styles.perfStat}>
              <Text style={[styles.perfVal, { color: colors.win }]}>
                {Math.round(overall * 100)}%
              </Text>
              <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>ACCURACY</Text>
            </View>
            <View style={[styles.perfDivider, { backgroundColor: colors.border }]} />
            <View style={styles.perfStat}>
              <Text style={[styles.perfVal, { color: colors.gold }]}>
                {strongBuyAcc != null ? `${strongBuyAcc}%` : '—'}
              </Text>
              <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>STRONG BUY</Text>
            </View>
            <View style={[styles.perfDivider, { backgroundColor: colors.border }]} />
            <View style={styles.perfStat}>
              <Text style={[styles.perfVal, { color: colors.foreground }]}>{totalPredictions}</Text>
              <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>PREDICTIONS</Text>
            </View>
          </View>
        )}

        {/* Per-sport accuracy rows */}
        {(statsData?.stats ?? []).length > 0 && (
          <>
            <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
            {statsData!.stats.map((w, i, arr) => (
              <View key={w.sport}>
                <View style={styles.sportStatRow}>
                  <Text style={[styles.statLabel, { color: colors.foreground }]}>{w.sport}</Text>
                  <View style={styles.sportStatRight}>
                    <Text style={[styles.statValue, { color: colors.mutedForeground }]}>
                      {w.correctPredictions}/{w.totalPredictions}
                    </Text>
                    <Text
                      style={[
                        styles.statAccuracy,
                        {
                          color:
                            w.accuracyRate >= 0.6
                              ? colors.win
                              : w.accuracyRate >= 0.5
                                ? colors.gold
                                : colors.loss,
                        },
                      ]}
                    >
                      {Math.round(w.accuracyRate * 100)}%
                    </Text>
                  </View>
                </View>
                {i < arr.length - 1 && (
                  <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
                )}
              </View>
            ))}
          </>
        )}

        {topSport && !isCalibrating && (
          <View style={[styles.topSportBanner, { backgroundColor: colors.goldBg }]}>
            <Text style={[styles.topSportText, { color: colors.gold }]}>
              🏆 Best sport: {topSport.sport} — {Math.round(topSport.accuracyRate * 100)}% accuracy
            </Text>
          </View>
        )}
      </View>

      {/* Today's stats */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>TODAY'S MODEL</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {[
          { label: 'Total Games Analyzed', value: `${todayGames.length}` },
          { label: 'Strong Buy Picks', value: `${strongBuys}` },
          { label: 'Avg Model Edge', value: `+${avgEdge}%` },
          { label: 'Sports Covered', value: '7' },
          { label: 'Data Source', value: 'ESPN (live)' },
        ].map((row, i, arr) => (
          <View key={row.label}>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{row.value}</Text>
            </View>
            {i < arr.length - 1 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
          </View>
        ))}
      </View>

      {/* Settings */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SETTINGS</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {[
          { icon: 'bell' as const, label: 'Notifications', value: 'On' },
          { icon: 'dollar-sign' as const, label: 'Odds Format', value: 'American' },
          { icon: 'info' as const, label: 'App Version', value: '1.0.0' },
        ].map((row, i, arr) => (
          <View key={row.label}>
            <Pressable onPress={() => Haptics.selectionAsync()} style={styles.settingsRow}>
              <View style={styles.settingsLeft}>
                <Feather name={row.icon} size={16} color={colors.mutedForeground} />
                <Text style={[styles.settingsLabel, { color: colors.foreground }]}>{row.label}</Text>
              </View>
              <View style={styles.settingsRight}>
                <Text style={[styles.settingsVal, { color: colors.mutedForeground }]}>{row.value}</Text>
                <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
              </View>
            </Pressable>
            {i < arr.length - 1 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  logoImage: { width: 56, height: 56, borderRadius: 12 },
  brandText: { flex: 1, gap: 2 },
  brandName: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  brandSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginBottom: 28,
  },
  signInText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 4,
  },
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
  calibratingBox: { padding: 20, alignItems: 'center', gap: 8 },
  calibDot: { width: 8, height: 8, borderRadius: 4 },
  calibText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  calibSub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  perfRow: { flexDirection: 'row', paddingVertical: 16 },
  perfStat: { flex: 1, alignItems: 'center', gap: 4 },
  perfVal: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  perfLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  perfDivider: { width: 1 },
  sportStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  sportStatRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statAccuracy: { fontSize: 15, fontFamily: 'Inter_700Bold', minWidth: 38, textAlign: 'right' },
  topSportBanner: { paddingVertical: 10, paddingHorizontal: 16 },
  topSportText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  statValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowDivider: { height: 1, marginHorizontal: 16 },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsLabel: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  settingsRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingsVal: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
