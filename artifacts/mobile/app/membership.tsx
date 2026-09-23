import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSubscription } from '@/lib/revenuecat';

const C = {
  bg: '#000000',
  card: '#111111',
  primary: '#84CC16',
  primaryFg: '#000000',
  border: '#2A2A2A',
  fg: '#FFFFFF',
  muted: '#6B7280',
  error: '#EF4444',
  gold: '#84CC16',
  goldBg: '#1A2600',
};

const BASE_FEATURES = [
  'Unlimited daily picks — all ratings unlocked',
  'AI model edge scores for every game',
  'Strong Buy / Buy / Fade signals',
  'Real-time odds movement alerts',
];

function getTrialLabel(
  pkg:
    | {
        product: {
          introPrice: {
            price: number;
            periodUnit: string;
            periodNumberOfUnits: number;
          } | null;
        };
      }
    | undefined,
): string {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price !== 0) return '';
  const n = intro.periodNumberOfUnits;
  const unit = intro.periodUnit.toLowerCase();
  return `${n}-${unit}`;
}

function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)}`;
  }
}

export default function MembershipScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { offerings, purchase, restore, isPurchasing, isRestoring } =
    useSubscription();
  const [selected, setSelected] = useState<'monthly' | 'annual'>('annual');
  const [restoreMsg, setRestoreMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const currentOffering = offerings?.current;
  const monthlyPkg = currentOffering?.availablePackages.find(
    (p) => p.packageType === 'MONTHLY' || p.identifier === '$rc_monthly',
  );
  const annualPkg = currentOffering?.availablePackages.find(
    (p) => p.packageType === 'ANNUAL' || p.identifier === '$rc_annual',
  );

  const monthlyPrice = monthlyPkg?.product.priceString ?? '$14.99';
  const annualPrice = annualPkg?.product.priceString ?? '$119.00';
  const annualMonthly = annualPkg
    ? `${(annualPkg.product.price / 12).toFixed(2)}/mo`
    : '$9.92/mo';

  const annualPerDay = annualPkg
    ? `${formatCurrency(annualPkg.product.price / 365, annualPkg.product.currencyCode)}/day`
    : null;
  const monthlyPerWeek = monthlyPkg?.product.pricePerWeekString
    ? `${monthlyPkg.product.pricePerWeekString}/week`
    : null;

  const annualTrialLabel = getTrialLabel(annualPkg);
  const monthlyTrialLabel = getTrialLabel(monthlyPkg);
  const badgeTrialLabel = annualTrialLabel || monthlyTrialLabel || '7-day';

  const trialFeature = badgeTrialLabel
    ? `${badgeTrialLabel} free trial — cancel anytime`
    : 'Free trial — cancel anytime';
  const FEATURES = [...BASE_FEATURES, trialFeature];

  const savingsPct =
    monthlyPkg && annualPkg
      ? Math.round(
          (1 - annualPkg.product.price / (monthlyPkg.product.price * 12)) *
            100,
        )
      : 33;

  const handlePurchase = async () => {
    const pkg = selected === 'monthly' ? monthlyPkg : annualPkg;
    if (!pkg) {
      setErrorMsg('Subscription options are unavailable. Please check your connection and try again.');
      return;
    }
    setErrorMsg('');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await purchase(pkg);
      router.back();
    } catch (err: any) {
      if (!err?.userCancelled) {
        setErrorMsg(err?.message ?? 'Purchase failed. Please try again.');
      }
    }
  };

  const handleRestore = async () => {
    setRestoreMsg('');
    setErrorMsg('');
    try {
      await restore();
      setRestoreMsg('Purchases restored!');
      setTimeout(() => {
        setRestoreMsg('');
        router.back();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Unable to restore purchases. Please check your connection and try again.');
    }
  };

  const isLoading = isPurchasing || isRestoring;

  return (
    <View
      style={[
        s.root,
        {
          paddingTop: insets.top + (Platform.OS === 'android' ? 12 : 0),
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      {/* Header */}
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={22} color={C.muted} />
        </Pressable>
        <Text style={s.headerTitle}>Membership</Text>
        <View style={[s.trialBadge, { backgroundColor: C.goldBg, borderColor: C.gold + '44' }]}>
          <Text style={[s.trialBadgeText, { color: C.gold }]}>
            {badgeTrialLabel.toUpperCase()} FREE TRIAL
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Text style={s.heroTitle}>Unlock TBM Pro</Text>
        <Text style={s.heroSubtitle}>
          AI-powered picks from a model that learns every day.{'\n'}
          {badgeTrialLabel
            ? `Try free for ${badgeTrialLabel}.`
            : 'Start with a free trial.'}
        </Text>

        {/* Feature list */}
        <View style={[s.featureCard, { backgroundColor: C.card, borderColor: C.border }]}>
          {FEATURES.map((feat, i) => (
            <View key={i} style={s.featureRow}>
              <View style={[s.featureCheck, { backgroundColor: C.goldBg }]}>
                <Feather name="check" size={13} color={C.gold} />
              </View>
              <Text style={s.featureText}>{feat}</Text>
            </View>
          ))}
        </View>

        {/* Plan selector */}
        <View style={s.planRow}>
          {/* Annual */}
          <Pressable
            style={[
              s.planCard,
              {
                borderColor: selected === 'annual' ? C.primary : C.border,
                backgroundColor: C.card,
              },
              selected === 'annual' && s.planCardSelected,
            ]}
            onPress={() => {
              setSelected('annual');
              Haptics.selectionAsync();
            }}
          >
            <View style={s.planBestRow}>
              <View style={[s.bestBadge, { backgroundColor: C.primary }]}>
                <Text style={[s.bestBadgeText, { color: C.primaryFg }]}>
                  BEST VALUE
                </Text>
              </View>
              <View style={[s.savingsBadge, { backgroundColor: C.goldBg }]}>
                <Text style={[s.savingsText, { color: C.gold }]}>
                  Save {savingsPct}%
                </Text>
              </View>
            </View>
            <Text style={[s.planName, { color: C.fg }]}>Annual</Text>
            <Text
              style={[
                s.planPrice,
                { color: selected === 'annual' ? C.primary : C.fg },
              ]}
            >
              {annualPrice}
            </Text>
            <Text style={[s.planMonthly, { color: C.muted }]}>
              {annualMonthly} billed yearly
            </Text>
            {annualPerDay && (
              <Text style={[s.planPerPeriod, { color: C.gold }]}>
                {annualPerDay}
              </Text>
            )}
          </Pressable>

          {/* Monthly */}
          <Pressable
            style={[
              s.planCard,
              {
                borderColor: selected === 'monthly' ? C.primary : C.border,
                backgroundColor: C.card,
              },
              selected === 'monthly' && s.planCardSelected,
            ]}
            onPress={() => {
              setSelected('monthly');
              Haptics.selectionAsync();
            }}
          >
            <View style={{ height: 22 }} />
            <Text style={[s.planName, { color: C.fg }]}>Monthly</Text>
            <Text
              style={[
                s.planPrice,
                { color: selected === 'monthly' ? C.primary : C.fg },
              ]}
            >
              {monthlyPrice}
            </Text>
            <Text style={[s.planMonthly, { color: C.muted }]}>
              billed monthly
            </Text>
            {monthlyPerWeek && (
              <Text style={[s.planPerPeriod, { color: C.gold }]}>
                {monthlyPerWeek}
              </Text>
            )}
          </Pressable>
        </View>

        {/* Error / restore messages */}
        {!!errorMsg && (
          <Text style={[s.errorMsg, { color: C.error }]}>{errorMsg}</Text>
        )}
        {!!restoreMsg && (
          <Text style={[s.errorMsg, { color: C.primary }]}>{restoreMsg}</Text>
        )}

        {/* CTA */}
        <Pressable
          style={[s.cta, !isLoading && s.ctaActive]}
          onPress={handlePurchase}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={C.primaryFg} />
          ) : (
            <Text style={[s.ctaText, { color: C.primaryFg }]}>
              Start Free Trial
            </Text>
          )}
        </Pressable>

        <Text style={s.legalText}>
          {selected === 'annual'
            ? `${annualPrice}/year after ${annualTrialLabel || '7-day'} free trial. Cancel anytime.`
            : `${monthlyPrice}/month after ${monthlyTrialLabel || '7-day'} free trial. Cancel anytime.`}
        </Text>

        {/* Restore */}
        <Pressable
          onPress={handleRestore}
          disabled={isLoading}
          style={s.restoreBtn}
        >
          <Text style={[s.restoreText, { color: C.muted }]}>
            Restore Purchases
          </Text>
        </Pressable>

        {/* Legal links */}
        <View style={s.legalRow}>
          <Pressable
            onPress={() =>
              Linking.openURL('https://thebettingmodel.replit.app/api/privacy')
            }
            style={s.legalLink}
          >
            <Text style={[s.legalLinkText, { color: C.muted }]}>
              Privacy Policy
            </Text>
          </Pressable>
          <Text style={[s.legalDivider, { color: C.muted }]}>·</Text>
          <Pressable
            onPress={() =>
              Linking.openURL('https://thebettingmodel.replit.app/api/terms')
            }
            style={s.legalLink}
          >
            <Text style={[s.legalLinkText, { color: C.muted }]}>
              Terms of Use
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: C.fg,
  },
  trialBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  trialBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  heroTitle: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: C.fg,
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: C.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  featureCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    color: C.fg,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  planRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  planCard: { flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 4 },
  planCardSelected: { borderWidth: 2 },
  planBestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  bestBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  bestBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  savingsBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  savingsText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  planName: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  planPrice: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  planMonthly: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  planPerPeriod: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  errorMsg: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginBottom: 12,
  },
  cta: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 10,
    opacity: 0.5,
  },
  ctaActive: { opacity: 1 },
  ctaText: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  legalText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: C.muted,
    textAlign: 'center',
    marginBottom: 20,
  },
  restoreBtn: { alignItems: 'center', paddingVertical: 8 },
  restoreText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  legalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  legalDivider: { fontSize: 12, paddingHorizontal: 6 },
  legalLink: { alignItems: 'center', paddingVertical: 6 },
  legalLinkText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textDecorationLine: 'underline',
  },
});
