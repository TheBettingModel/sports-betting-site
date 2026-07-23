import React, { useState, useEffect, useCallback } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useClerk, useUser } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { useGetModelStats, useGetGamesToday } from '@workspace/api-client-react';
import { mapApiGame } from '@/utils/gameAdapter';
import { useRouter } from 'expo-router';
import { useSubscription } from '@/lib/revenuecat';
import PaywallModal from '@/app/paywall';
import Purchases from 'react-native-purchases';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { isSubscribed, restore } = useSubscription();
  const { enableNotifications, disableNotifications, getNotificationsEnabled } = usePushNotifications();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const { data: statsData } = useGetModelStats();
  const { data: gamesData } = useGetGamesToday();

  const todayGames = React.useMemo(() => {
    if (gamesData?.games && gamesData.games.length > 0) return gamesData.games.map(mapApiGame);
    return [];
  }, [gamesData]);

  const strongBuys = todayGames.filter(g => g.projection.valueRating === 'Strong Buy').length;
  const avgEdge = (
    todayGames.reduce((s, g) => s + Math.max(g.projection.edge, 0), 0) / todayGames.length
  ).toFixed(1);

  const overall = statsData?.overallAccuracy ?? 0;
  const totalPredictions = statsData?.totalPredictions ?? 0;
  const isCalibrating = totalPredictions === 0;

  const strongBuyAcc = statsData?.stats
    ? Math.round(
        (statsData.stats.reduce((s, w) => s + w.strongBuyAccuracy, 0) / Math.max(statsData.stats.length, 1)) * 100,
      )
    : null;

  // Require at least 10 graded picks before a sport qualifies as "best sport".
  // This prevents tiny off-season samples (e.g. 1-for-1 NCAAB) from topping the list.
  const MIN_PICKS_FOR_BEST = 10;
  const topSport = statsData?.stats.length
    ? (() => {
        const qualified = statsData.stats.filter(s => s.totalPredictions >= MIN_PICKS_FOR_BEST);
        if (qualified.length === 0) return null;
        return [...qualified].sort((a, b) => b.accuracyRate - a.accuracyRate)[0];
      })()
    : null;

  // User display name / initials
  const displayName = user?.fullName ?? user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ?? 'User';
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  const initials = displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  // Load current notification state
  useEffect(() => {
    if (Platform.OS === 'web') return;
    getNotificationsEnabled().then(setNotificationsEnabled);
  }, [getNotificationsEnabled]);

  // Auto-enable notifications after subscription (prompt on Pro upgrade)
  useEffect(() => {
    if (!isSubscribed || Platform.OS === 'web') return;
    getNotificationsEnabled().then((enabled) => {
      if (!enabled) {
        // Silently attempt to enable; the system permission prompt will appear
        enableNotifications()
          .then((granted) => setNotificationsEnabled(granted))
          .catch(() => {/* non-fatal */});
      }
    });
  }, [isSubscribed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNotificationsToggle = useCallback(async (value: boolean) => {
    if (!isSubscribed) {
      setPaywallOpen(true);
      return;
    }
    setNotificationsLoading(true);
    await Haptics.selectionAsync();
    try {
      if (value) {
        const granted = await enableNotifications();
        setNotificationsEnabled(granted);
      } else {
        await disableNotifications();
        setNotificationsEnabled(false);
      }
    } catch {
      // Non-fatal — leave toggle state as-is
    } finally {
      setNotificationsLoading(false);
    }
  }, [isSubscribed, enableNotifications, disableNotifications]);

  const handleSignOut = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Deregister push token on sign-out so we don't notify a signed-out device
    if (Platform.OS !== 'web') {
      try { await disableNotifications(); } catch { /* non-fatal */ }
    }
    await signOut();
    router.replace('/(auth)/sign-in');
  };

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
      {/* User header */}
      <View style={styles.userRow}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{initials}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.foreground }]}>{displayName}</Text>
          {!!email && <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{email}</Text>}
          {/* Subscription badge */}
          <View style={[
            styles.subBadge,
            isSubscribed
              ? { backgroundColor: '#1A2600', borderColor: '#84CC16' + '66' }
              : { backgroundColor: '#1A1A1A', borderColor: colors.border },
          ]}>
            <Feather name={isSubscribed ? 'zap' : 'lock'} size={10} color={isSubscribed ? '#84CC16' : colors.mutedForeground} />
            <Text style={[styles.subBadgeText, { color: isSubscribed ? '#84CC16' : colors.mutedForeground }]}>
              {isSubscribed ? 'Pro Member' : 'Free Plan'}
            </Text>
          </View>
        </View>
      </View>

      {/* Subscription card */}
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SUBSCRIPTION</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {isSubscribed ? (
          <Pressable
            style={styles.settingsRow}
            onPress={async () => {
              await Haptics.selectionAsync();
              try {
                await Purchases.showManageSubscriptions();
              } catch {
                // showManagementInterface not available in Expo Go; open web fallback
              }
            }}
          >
            <View style={styles.settingsLeft}>
              <Feather name="credit-card" size={16} color={colors.primary} />
              <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Manage Subscription</Text>
            </View>
            <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          </Pressable>
        ) : (
          <>
            <Pressable
              style={[styles.upgradeBtn, { backgroundColor: '#84CC16' }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setPaywallOpen(true); }}
            >
              <Feather name="zap" size={16} color="#000000" />
              <Text style={[styles.upgradeBtnText]}>Upgrade to Pro — 7-Day Free Trial</Text>
            </Pressable>
            <Pressable
              style={styles.settingsRow}
              onPress={async () => { await restore(); }}
            >
              <View style={styles.settingsLeft}>
                <Feather name="rotate-ccw" size={16} color={colors.mutedForeground} />
                <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Restore Purchases</Text>
              </View>
              <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
            </Pressable>
          </>
        )}
      </View>

      {/* Sign out */}
      <Pressable
        onPress={handleSignOut}
        style={({ pressed }) => [
          styles.signOutBtn,
          { borderColor: colors.border, opacity: pressed ? 0.7 : 1, borderRadius: colors.radius },
        ]}
      >
        <Feather name="log-out" size={16} color={colors.mutedForeground} />
        <Text style={[styles.signOutText, { color: colors.mutedForeground }]}>Sign Out</Text>
      </Pressable>

      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />

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
              <Text style={[styles.perfVal, { color: colors.win }]}>{Math.round(overall * 100)}%</Text>
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

        {(statsData?.stats ?? []).filter(w => w.totalPredictions > 0).length > 0 && (
          <>
            <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
            <Text style={[styles.statSectionLabel, { color: colors.mutedForeground }]}>ALL-TIME BY SPORT</Text>
            {statsData!.stats.filter(w => w.totalPredictions > 0).map((w, i, arr) => (
              <View key={w.sport}>
                <View style={styles.sportStatRow}>
                  <Text style={[styles.statLabel, { color: colors.foreground }]}>{w.sport}</Text>
                  <View style={styles.sportStatRight}>
                    <Text style={[styles.statValue, { color: colors.mutedForeground }]}>
                      {w.correctPredictions}/{w.totalPredictions}
                    </Text>
                    <Text style={[styles.statAccuracy, {
                      color: w.accuracyRate >= 0.6 ? colors.win : w.accuracyRate >= 0.5 ? colors.gold : colors.loss,
                    }]}>
                      {Math.round(w.accuracyRate * 100)}%
                    </Text>
                  </View>
                </View>
                {i < arr.length - 1 && <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />}
              </View>
            ))}
          </>
        )}

        {topSport && !isCalibrating && (
          <View style={[styles.topSportBanner, { backgroundColor: colors.goldBg }]}>
            <Text style={[styles.topSportText, { color: colors.gold }]}>
              🏆 Best sport: {topSport.sport} — {Math.round(topSport.accuracyRate * 100)}% ({topSport.totalPredictions} picks)
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
        {/* Notifications toggle — interactive */}
        <View style={styles.settingsRow}>
          <View style={styles.settingsLeft}>
            <Feather name="bell" size={16} color={notificationsEnabled ? colors.primary : colors.mutedForeground} />
            <View>
              <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Daily Pick Alerts</Text>
              {Platform.OS !== 'web' && (
                <Text style={[styles.settingsSubLabel, { color: colors.mutedForeground }]}>
                  {isSubscribed
                    ? 'Notify when Strong Buy picks drop'
                    : 'Pro feature'}
                </Text>
              )}
            </View>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationsToggle}
            disabled={notificationsLoading || Platform.OS === 'web'}
            trackColor={{ false: colors.border, true: colors.primary + 'AA' }}
            thumbColor={notificationsEnabled ? colors.primary : colors.mutedForeground}
            ios_backgroundColor={colors.border}
          />
        </View>

        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

        {[
          { icon: 'dollar-sign' as const, label: 'Odds Format', value: 'American', onPress: () => Haptics.selectionAsync() },
          { icon: 'info' as const, label: 'App Version', value: '1.0.0', onPress: () => Haptics.selectionAsync() },
        ].map((row, i, arr) => (
          <View key={row.label}>
            <Pressable onPress={row.onPress} style={styles.settingsRow}>
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

        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

        {/* Legal links */}
        <Pressable
          onPress={() => Linking.openURL('https://thebettingmodel.replit.app/api/privacy')}
          style={styles.settingsRow}
        >
          <View style={styles.settingsLeft}>
            <Feather name="shield" size={16} color={colors.mutedForeground} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Privacy Policy</Text>
          </View>
          <Feather name="external-link" size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  userInfo: { flex: 1, gap: 3 },
  userName: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  userEmail: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  subBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
    alignSelf: 'flex-start', marginTop: 4,
  },
  subBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, margin: 12, borderRadius: 10,
  },
  upgradeBtnText: { color: '#000000', fontSize: 14, fontFamily: 'Inter_700Bold' },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, paddingVertical: 12, marginBottom: 28,
  },
  signOutText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  sectionTitle: {
    fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5,
    marginBottom: 10, marginTop: 4,
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 16,
  },
  sportStatRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statSectionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  statAccuracy: { fontSize: 15, fontFamily: 'Inter_700Bold', minWidth: 38, textAlign: 'right' },
  topSportBanner: { paddingVertical: 10, paddingHorizontal: 16 },
  topSportText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16,
  },
  statLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  statValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowDivider: { height: 1, marginHorizontal: 16 },
  settingsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
  },
  settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsLabel: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  settingsSubLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  settingsRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingsVal: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
