import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TeamLogo } from '@/components/TeamLogo';
import { useColors } from '@/hooks/useColors';
import type { V4FullSlateProjectionResponseFixturesItem } from '@workspace/api-client-react';

export function V4UnavailableProjectionCard({ fixture }: { fixture: V4FullSlateProjectionResponseFixturesItem }) {
  const colors = useColors();
  const startsAt = fixture.eventStart ? new Date(fixture.eventStart) : null;
  const time = startsAt && !Number.isNaN(startsAt.getTime())
    ? startsAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'TBD';
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.meta, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sport, { color: colors.foreground }]}>{fixture.sport}</Text>
        <Text style={[styles.time, { color: colors.mutedForeground }]}>{time}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.matchup}>
          {fixture.awayParticipant.abbreviation && <TeamLogo sport={fixture.sport} abbr={fixture.awayParticipant.abbreviation} logoUrl={fixture.awayParticipant.logo ?? undefined} size={24} />}
          <Text style={[styles.team, { color: colors.foreground }]} numberOfLines={1}>{fixture.awayParticipant.name || 'Away'}</Text>
          <Text style={[styles.vs, { color: colors.mutedForeground }]}>vs.</Text>
          {fixture.homeParticipant.abbreviation && <TeamLogo sport={fixture.sport} abbr={fixture.homeParticipant.abbreviation} logoUrl={fixture.homeParticipant.logo ?? undefined} size={24} />}
          <Text style={[styles.team, { color: colors.foreground }]} numberOfLines={1}>{fixture.homeParticipant.name || 'Home'}</Text>
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>Projection unavailable</Text>
        <Text style={[styles.reason, { color: colors.mutedForeground }]} numberOfLines={2}>
          {fixture.unavailableReason ?? 'A legitimate pregame projection is unavailable.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  meta: { paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  sport: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  time: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  content: { padding: 14 },
  matchup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  team: { fontSize: 15, fontFamily: 'Inter_700Bold', flexShrink: 1 },
  vs: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  title: { marginTop: 17, fontSize: 16, fontFamily: 'Inter_700Bold' },
  reason: { marginTop: 4, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
});