import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  getV4FullSlateProjections,
  type GetV4FullSlateProjectionsSport,
  type V4PublicProjection,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { TeamLogo } from '@/components/TeamLogo';
import { useAuth } from '@clerk/expo';
import { useSubscription } from '@/lib/revenuecat';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/EmptyState';

const TWO_WORD_NICKNAMES = [
  'Red Sox', 'White Sox', 'Blue Jays', 'Maple Leafs', 'Golden Knights',
  'Blue Jackets', 'Red Wings', 'Trail Blazers', 'Fighting Irish',
  'Nittany Lions', 'Demon Deacons', 'Horned Frogs', 'Yellow Jackets',
  'Sun Devils', 'Ragin\' Cajuns', 'Scarlet Knights', 'Mean Green',
  'Green Wave', 'Golden Hurricane', 'Golden Eagles', 'Golden Flashes',
  'Golden Panthers', 'Golden Bears', 'Bald Eagles', 'Salukis',
  'Raging Bulls', 'Thundering Herd', 'Red Wolves', 'Red Raiders',
  'Black Knights', 'Black Bears', 'Blackbirds', 'Blue Raiders',
  'Blue Demons', 'Blue Hens', 'Blue Devils', 'Blue Hose',
  'Great Danes', 'Minutemen', 'Tar Heels', 'Golden Gophers'
];

function nickname(fullName: string): string {
  if (!fullName) return '';
  const lower = fullName.toLowerCase();
  for (const nick of TWO_WORD_NICKNAMES) {
    if (lower.endsWith(nick.toLowerCase())) {
      return nick;
    }
  }
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1] ?? fullName;
}

function percent(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value <= 1 ? value * 100 : value).toFixed(1)}%`;
}

function projectedWinnerName(projection: V4PublicProjection, away: string, home: string): string {
  if (projection.projectedWinner === 'HOME') return nickname(home);
  if (projection.projectedWinner === 'AWAY') return nickname(away);
  if (projection.projectedWinner === 'DRAW') return 'Draw';
  return 'Unavailable';
}

function scoreMargin(away: string, home: string, expectedAwayScore?: number | null, expectedHomeScore?: number | null): string {
  if (expectedAwayScore == null || expectedHomeScore == null) return '—';
  const margin = Math.abs(expectedHomeScore - expectedAwayScore);
  if (margin < 0.05) return 'Even';
  return `${nickname(expectedHomeScore > expectedAwayScore ? home : away)} by ${margin.toFixed(1)}`;
}

export default function GameDetailScreen() {
  const params = useLocalSearchParams<{ gameId?: string | string[], sport?: string | string[], slateDate?: string | string[] }>();
  const gameId = Array.isArray(params.gameId) ? params.gameId[0] : params.gameId;
  const sport = Array.isArray(params.sport) ? params.sport[0] : params.sport;
  const slateDate = Array.isArray(params.slateDate) ? params.slateDate[0] : params.slateDate;
  const supportedSports: GetV4FullSlateProjectionsSport[] = ['NFL', 'NCAAF', 'NBA', 'NCAAMB', 'MLB', 'NHL', 'SOCCER', 'WNBA'];
  const querySport = supportedSports.includes(sport as GetV4FullSlateProjectionsSport)
    ? sport as GetV4FullSlateProjectionsSport
    : null;
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const {
    hasServerEntitlement,
    isLoading: isSubscriptionLoading,
    serverEntitlementError,
  } = useSubscription();

  const { data: board, isLoading, isError } = useQuery({
    queryKey: ['/api/model/v4/projections', { sport, date: slateDate, viewerId: userId ?? 'signed-out', entitled: hasServerEntitlement }],
    queryFn: () => getV4FullSlateProjections({ sport: querySport!, date: slateDate! }),
    enabled: Boolean(userId) && hasServerEntitlement && Boolean(querySport) && Boolean(slateDate),
    staleTime: 2 * 60 * 1000,
  });

  const fixture = useMemo(() => board?.fixtures.find(f => f.gameId === gameId), [board, gameId]);
  const projection = useMemo(() => board?.projections.find(p => p.eventId === gameId), [board, gameId]);
  if (!hasServerEntitlement && (isSubscriptionLoading || serverEntitlementError)) {
    return (
      <View style={[styles.root, styles.gateState, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.gateTitle, { color: colors.foreground }]}>
          {serverEntitlementError ? 'Unable to verify Pro access' : 'Loading your account…'}
        </Text>
        <Text style={[styles.gateCopy, { color: colors.mutedForeground }]}>
          {serverEntitlementError
            ? 'Your access has not changed. Please wait a moment and reopen this matchup.'
            : 'Checking your subscription securely.'}
        </Text>
      </View>
    );
  }

  if (!hasServerEntitlement) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomWidth: 0 }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <EmptyState message="An active subscription is required to view deep analytics." />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (isError || !board || !fixture) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Feather name="chevron-left" size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <EmptyState message="Failed to load game details or game not found." />
      </View>
    );
  }

  const away = fixture.awayParticipant.name || 'Away';
  const home = fixture.homeParticipant.name || 'Home';
  const startsAt = fixture.eventStart ? new Date(fixture.eventStart) : null;
  const time = startsAt && !Number.isNaN(startsAt.getTime())
    ? startsAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'TBD';

  const expectedAwayScore = projection?.expectedAwayScore;
  const expectedHomeScore = projection?.expectedHomeScore;
  const scoreWinner = expectedHomeScore == null || expectedAwayScore == null
    ? null
    : expectedHomeScore > expectedAwayScore
      ? 'HOME'
      : expectedAwayScore > expectedHomeScore
        ? 'AWAY'
        : 'DRAW';
  const signalsDisagree = scoreWinner !== null
    && projection?.projectedWinner != null
    && scoreWinner !== projection.projectedWinner;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Matchup Analysis</Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={[styles.scoreboard, { borderBottomColor: colors.border }]}>
          <View style={styles.teamCol}>
            {fixture.awayParticipant.abbreviation && <TeamLogo sport={fixture.sport} abbr={fixture.awayParticipant.abbreviation} logoUrl={fixture.awayParticipant.logo ?? undefined} size={50} />}
            <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={1}>{nickname(away)}</Text>
            {fixture.awayScore != null && <Text style={[styles.score, { color: colors.foreground }]}>{fixture.awayScore}</Text>}
          </View>
          <View style={styles.centerCol}>
            <Text style={[styles.statusText, { color: colors.mutedForeground }]}>{fixture.eventStatus}</Text>
            {(fixture.eventStatus === 'UPCOMING' || fixture.eventStatus === 'LIVE') && (
              <Text style={[styles.timeText, { color: colors.foreground }]}>{time}</Text>
            )}
            <Text style={[styles.sportLabel, { color: colors.mutedForeground }]}>{fixture.sport}</Text>
          </View>
          <View style={styles.teamCol}>
            {fixture.homeParticipant.abbreviation && <TeamLogo sport={fixture.sport} abbr={fixture.homeParticipant.abbreviation} logoUrl={fixture.homeParticipant.logo ?? undefined} size={50} />}
            <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={1}>{nickname(home)}</Text>
            {fixture.homeScore != null && <Text style={[styles.score, { color: colors.foreground }]}>{fixture.homeScore}</Text>}
          </View>
        </View>

        {fixture.availability === 'AVAILABLE' && projection ? (
          <View style={[styles.verdict, { backgroundColor: colors.card, borderColor: colors.border }]}>
             <View style={styles.verdictHeader}>
               <View style={[styles.dot, { backgroundColor: colors.primary }]} />
               <Text style={[styles.verdictTitle, { color: colors.primary }]}>PROJECTED OUTCOME</Text>
             </View>
             <Text style={[styles.verdictValue, { color: colors.foreground }]}>{projectedWinnerName(projection, away, home).toUpperCase()}</Text>
             <Text style={[styles.verdictSub, { color: colors.mutedForeground }]}>Model forecast for this matchup</Text>
          </View>
        ) : (
          <View style={[styles.verdict, { backgroundColor: colors.card, borderColor: colors.border }]}>
             <Text style={[styles.verdictTitle, { color: colors.mutedForeground }]}>UNAVAILABLE</Text>
             <Text style={[styles.verdictSub, { color: colors.mutedForeground, marginTop: 6 }]}>{fixture.unavailableReason || 'No legitimate projection is available.'}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Matchup Analytics</Text>
          {projection ? (
            <View style={styles.grid}>
              <Detail label="Projected score" value={`${nickname(away)} ${expectedAwayScore == null ? '—' : expectedAwayScore.toFixed(1)} – ${nickname(home)} ${expectedHomeScore == null ? '—' : expectedHomeScore.toFixed(1)}`} colors={colors} fullWidth />
              <Detail label="Win probability" value={`${nickname(away)} ${percent(projection.awayWinProbability)} · ${nickname(home)} ${percent(projection.homeWinProbability)}`} colors={colors} fullWidth />
              <Detail label="Expected margin" value={scoreMargin(away, home, expectedAwayScore, expectedHomeScore)} colors={colors} />
              <Detail label="Expected total" value={projection.expectedTotal == null ? '—' : projection.expectedTotal.toFixed(1)} colors={colors} />
              <Detail label="Projected winner" value={projectedWinnerName(projection, away, home)} colors={colors} fullWidth />
              {signalsDisagree && (
                <Text style={[styles.note, { color: colors.mutedForeground }]}>
                  Projected score and win probability point in different directions. The projected winner follows win probability.
                </Text>
              )}
              <Detail label="Forecast status" value={projection.lifecycleStatus.replaceAll('_', ' ')} colors={colors} fullWidth />
            </View>
          ) : (
            <EmptyState message="Analytics are not available for this matchup." />
          )}
        </View>

        {projection && (projection.awayStarterName || projection.homeStarterName) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Pitcher Matchup</Text>
            <View style={styles.grid}>
              <Pitcher side={away} name={projection.awayStarterName} era={projection.awayStarterEra} whip={projection.awayStarterWhip} colors={colors} />
              <Pitcher side={home} name={projection.homeStarterName} era={projection.homeStarterEra} whip={projection.homeStarterWhip} colors={colors} />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Pitcher({ side, name, era, whip, colors }: any) {
  if (!name) return <View style={[styles.detailCard, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]} />;
  return (
    <View style={[styles.detailCard, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{side}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
      {era != null && <Text style={[styles.pitcherStat, { color: colors.mutedForeground }]}>ERA <Text style={{ color: colors.foreground }}>{era.toFixed(2)}</Text></Text>}
      {whip != null && <Text style={[styles.pitcherStat, { color: colors.mutedForeground }]}>WHIP <Text style={{ color: colors.foreground }}>{whip.toFixed(2)}</Text></Text>}
    </View>
  );
}

function Detail({ label, value, colors, fullWidth }: any) {
  return (
    <View style={[styles.detailCard, fullWidth && { width: '100%' }, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { padding: 4, marginLeft: -4 },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  scoreboard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, borderBottomWidth: StyleSheet.hairlineWidth },
  teamCol: { flex: 1, alignItems: 'center', gap: 8 },
  centerCol: { flex: 1, alignItems: 'center', gap: 4 },
  teamName: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  score: { fontSize: 32, fontFamily: 'Inter_700Bold', marginTop: 4 },
  statusText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  timeText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  sportLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  verdict: { margin: 16, padding: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  verdictHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  verdictTitle: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  verdictValue: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  verdictSub: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 4, textAlign: 'center' },
  section: { paddingHorizontal: 16, marginTop: 12 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detailCard: { width: '47.5%', padding: 12, borderRadius: 8, borderWidth: 1 },
  detailLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  detailValue: { fontSize: 14, fontFamily: 'Inter_700Bold', marginTop: 4 },
  pitcherStat: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 4 },
  note: { fontSize: 11, fontFamily: 'Inter_500Medium', lineHeight: 16, marginTop: 4, width: '100%' },
  gateState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  gateTitle: { marginTop: 16, fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  gateCopy: { marginTop: 8, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});