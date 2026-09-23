import React, { useState, useEffect, useCallback } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useClerk, useUser } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { useSubscription } from '@/lib/revenuecat';
import PaywallModal from '@/app/paywall';
import Purchases from 'react-native-purchases';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNotificationPreferences, ALL_SPORTS } from '@/hooks/useNotificationPreferences';
import { useUserPreferences, TIER_LABELS, VALID_TIERS } from '@/hooks/useUserPreferences';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { isSubscribed, restore } = useSubscription();
  const { enableNotifications, disableNotifications, getNotificationsEnabled } = usePushNotifications();
  const { prefs: notifPrefs, saving: notifPrefsSaving, toggleSport } = useNotificationPreferences();
  const { prefs: userPrefs, saving: userPrefsSaving, setMinTier } = useUserPreferences();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

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
              : { backgroundColor: colors.secondary, borderColor: colors.border },
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

        {/* Sport alert preferences — shown when notifications are enabled and user is Pro */}
        {notificationsEnabled && isSubscribed && Platform.OS !== 'web' && (
          <>
            <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />
            <View style={[styles.sportPrefsSection]}>
              <Text style={[styles.sportPrefsTitle, { color: colors.mutedForeground }]}>
                ALERT ME FOR THESE SPORTS
              </Text>
              <View style={styles.sportChipsGrid}>
                {ALL_SPORTS.map((sport) => {
                  const enabled = notifPrefs.enabledSports === null || notifPrefs.enabledSports.includes(sport);
                  return (
                    <Pressable
                      key={sport}
                      disabled={notifPrefsSaving || userPrefsSaving}
                      onPress={async () => { await Haptics.selectionAsync(); await toggleSport(sport); }}
                      style={[
                        styles.sportChip,
                        {
                          backgroundColor: enabled ? colors.primary + '22' : colors.card,
                          borderColor: enabled ? colors.primary : colors.border,
                          opacity: (notifPrefsSaving || userPrefsSaving) ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.sportChipText, { color: enabled ? colors.primary : colors.mutedForeground }]}>
                        {sport}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Minimum tier selector */}
              <Text style={[styles.sportPrefsTitle, { color: colors.mutedForeground, marginTop: 14 }]}>
                MINIMUM PICK TIER
              </Text>
              <View style={styles.tierRow}>
                {VALID_TIERS.map((tier) => {
                  const selected = (userPrefs.notifMinTier ?? 'Playable') === tier;
                  return (
                    <Pressable
                      key={tier}
                      disabled={userPrefsSaving}
                      onPress={async () => { await Haptics.selectionAsync(); await setMinTier(tier); }}
                      style={[
                        styles.tierChip,
                        {
                          backgroundColor: selected ? colors.primary + '22' : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                          opacity: userPrefsSaving ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.tierChipText, { color: selected ? colors.primary : colors.mutedForeground }]}>
                        {TIER_LABELS[tier] ?? tier}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        )}

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

        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

        <Pressable
          onPress={() => Linking.openURL('https://thebettingmodel.replit.app/api/terms')}
          style={styles.settingsRow}
        >
          <View style={styles.settingsLeft}>
            <Feather name="file-text" size={16} color={colors.mutedForeground} />
            <Text style={[styles.settingsLabel, { color: colors.foreground }]}>Terms of Use</Text>
          </View>
          <Feather name="external-link" size={14} color={colors.mutedForeground} />
        </Pressable>

        <View style={[styles.rowDivider, { backgroundColor: colors.border }]} />

        {/* Account deletion — required by App Store Guideline 5.1.1(v) */}
        <Pressable
          onPress={() => Linking.openURL(
            'mailto:support@thebettingmodel.com?subject=Account%20Deletion%20Request&body=Please%20delete%20my%20TheBettingModel%20account%20and%20all%20associated%20data.'
          )}
          style={styles.settingsRow}
        >
          <View style={styles.settingsLeft}>
            <Feather name="trash-2" size={16} color={colors.destructive ?? '#EF4444'} />
            <Text style={[styles.settingsLabel, { color: colors.destructive ?? '#EF4444' }]}>Delete Account</Text>
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
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 20, overflow: 'hidden' },
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
  sportPrefsSection: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  sportPrefsTitle: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  sportChipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sportChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  sportChipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  tierRow: { flexDirection: 'column', gap: 8 },
  tierChip: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
    alignItems: 'center',
  },
  tierChipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
