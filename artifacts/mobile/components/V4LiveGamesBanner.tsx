import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { V4FullSlateProjectionResponseFixturesItem } from '@workspace/api-client-react';
import { TeamLogo } from '@/components/TeamLogo';
import { useColors } from '@/hooks/useColors';

function shortName(name: string, abbreviation: string | null): string {
  if (abbreviation) return abbreviation;
  const words = name.trim().split(/\s+/);
  return words[words.length - 1] ?? name;
}

export function V4LiveGamesBanner({
  fixtures,
}: {
  fixtures: V4FullSlateProjectionResponseFixturesItem[];
}) {
  const colors = useColors();
  if (!fixtures.length) return null;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${fixtures.length} ${fixtures.length === 1 ? 'game' : 'games'} live`}
      style={[styles.banner, { backgroundColor: colors.lossBg, borderColor: colors.destructive }]}
    >
      <View style={styles.headingRow}>
        <View style={[styles.liveDot, { backgroundColor: colors.destructive }]} />
        <Text style={[styles.heading, { color: colors.destructive }]}>LIVE GAMES</Text>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>{fixtures.length}</Text>
      </View>

      {fixtures.map((fixture, index) => {
        const away = shortName(fixture.awayParticipant.name, fixture.awayParticipant.abbreviation);
        const home = shortName(fixture.homeParticipant.name, fixture.homeParticipant.abbreviation);
        return (
          <View
            key={fixture.gameId}
            style={[
              styles.gameRow,
              index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
            ]}
          >
            <Text style={[styles.sport, { color: colors.mutedForeground }]}>{fixture.sport}</Text>
            <View style={styles.team}>
              <TeamLogo
                sport={fixture.sport}
                abbr={fixture.awayParticipant.abbreviation ?? away}
                logoUrl={fixture.awayParticipant.logo ?? undefined}
                size={18}
              />
              <Text style={[styles.teamName, { color: colors.foreground }]}>{away}</Text>
              <Text style={[styles.score, { color: colors.foreground }]}>{fixture.awayScore ?? '—'}</Text>
            </View>
            <Text style={[styles.divider, { color: colors.mutedForeground }]}>–</Text>
            <View style={styles.team}>
              <Text style={[styles.score, { color: colors.foreground }]}>{fixture.homeScore ?? '—'}</Text>
              <Text style={[styles.teamName, { color: colors.foreground }]}>{home}</Text>
              <TeamLogo
                sport={fixture.sport}
                abbr={fixture.homeParticipant.abbreviation ?? home}
                logoUrl={fixture.homeParticipant.logo ?? undefined}
                size={18}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  heading: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  count: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  gameRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 7,
    paddingTop: 7,
  },
  sport: { width: 44, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.4 },
  team: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  teamName: { fontSize: 11, fontFamily: 'Inter_700Bold', flexShrink: 1 },
  score: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  divider: { fontSize: 11, fontFamily: 'Inter_500Medium' },
});