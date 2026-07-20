import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { MOCK_GAMES } from '@/data/mockGames';

// Mock season stats
const SEASON_RECORD = { wins: 38, losses: 22, pushes: 4 };
const WIN_RATE = Math.round((SEASON_RECORD.wins / (SEASON_RECORD.wins + SEASON_RECORD.losses)) * 100);
const ROI = 12.4;

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const strongBuys = MOCK_GAMES.filter(g => g.projection.valueRating === 'Strong Buy').length;
  const avgEdge = (
    MOCK_GAMES.reduce((s, g) => s + Math.max(g.projection.edge, 0), 0) / MOCK_GAMES.length
  ).toFixed(1);

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
        <View style={[styles.logoBox, { backgroundColor: colors.gold, borderRadius: colors.radius }]}>
          <Text style={[styles.logoText, { color: colors.primaryForeground }]}>TBM</Text>
        </View>
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

      {/* Model performance */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>MODEL PERFORMANCE · 2025–26</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        <View style={styles.perfRow}>
          <View style={styles.perfStat}>
            <Text style={[styles.perfVal, { color: colors.win }]}>
              {SEASON_RECORD.wins}-{SEASON_RECORD.losses}
            </Text>
            <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>SEASON RECORD</Text>
          </View>
          <View style={[styles.perfDivider, { backgroundColor: colors.border }]} />
          <View style={styles.perfStat}>
            <Text style={[styles.perfVal, { color: colors.gold }]}>{WIN_RATE}%</Text>
            <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>WIN RATE</Text>
          </View>
          <View style={[styles.perfDivider, { backgroundColor: colors.border }]} />
          <View style={styles.perfStat}>
            <Text style={[styles.perfVal, { color: colors.win }]}>+{ROI}%</Text>
            <Text style={[styles.perfLabel, { color: colors.mutedForeground }]}>ROI</Text>
          </View>
        </View>
      </View>

      {/* Today's stats */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>TODAY'S MODEL</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {[
          { label: 'Total Games Analyzed', value: `${MOCK_GAMES.length}` },
          { label: 'Strong Buy Picks', value: `${strongBuys}` },
          { label: 'Avg Model Edge', value: `+${avgEdge}%` },
          { label: 'Sports Covered', value: '5' },
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
            <Pressable
              onPress={() => Haptics.selectionAsync()}
              style={styles.settingsRow}
            >
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
  logoBox: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
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
  perfRow: { flexDirection: 'row', paddingVertical: 16 },
  perfStat: { flex: 1, alignItems: 'center', gap: 4 },
  perfVal: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  perfLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  perfDivider: { width: 1 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
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
