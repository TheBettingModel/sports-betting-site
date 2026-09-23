import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import type { V4OfficialPick, V4FullSlateProjectionResponseFixturesItem } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { TeamLogo } from '@/components/TeamLogo';

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

export function V4OfficialPickCard({ 
  pick, 
  fixture, 
  slateDate 
}: { 
  pick: V4OfficialPick, 
  fixture: V4FullSlateProjectionResponseFixturesItem, 
  slateDate: string 
}) {
  const colors = useColors();
  const away = fixture.awayParticipant.name || 'Away';
  const home = fixture.homeParticipant.name || 'Home';
  const awayAbbr = fixture.awayParticipant.abbreviation;
  const homeAbbr = fixture.homeParticipant.abbreviation;
  
  const startsAt = fixture.eventStart ? new Date(fixture.eventStart) : null;
  const time = startsAt && !Number.isNaN(startsAt.getTime())
    ? startsAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'TBD';
    
  const isLiveOrFinal = fixture.eventStatus === 'LIVE' || fixture.eventStatus === 'FINAL';
  const statusLabel = fixture.eventStatus === 'POSTPONED'
    ? 'POSTPONED'
    : fixture.eventStatus === 'LIVE'
      ? 'LIVE'
      : fixture.eventStatus === 'FINAL'
        ? 'FINAL'
        : time;
  const isTopPlay = pick.role === 'TOP_PLAY';

  return (
    <Link href={`/game/${fixture.gameId}?sport=${fixture.sport}&slateDate=${slateDate}`} asChild>
      <Pressable style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: isTopPlay ? colors.primary : colors.border, opacity: pressed ? 0.65 : 1 }]}>
        <View style={styles.content}>
          <View style={styles.teams}>
            <View style={styles.teamRow}>
              {awayAbbr && <TeamLogo sport={fixture.sport} abbr={awayAbbr} logoUrl={fixture.awayParticipant.logo ?? undefined} size={20} />}
              <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={1}>{nickname(away)}</Text>
              {isLiveOrFinal && fixture.awayScore != null && <Text style={[styles.score, { color: colors.foreground }]}>{fixture.awayScore}</Text>}
            </View>
            <View style={styles.teamRow}>
              {homeAbbr && <TeamLogo sport={fixture.sport} abbr={homeAbbr} logoUrl={fixture.homeParticipant.logo ?? undefined} size={20} />}
              <Text style={[styles.teamName, { color: colors.foreground }]} numberOfLines={1}>{nickname(home)}</Text>
              {isLiveOrFinal && fixture.homeScore != null && <Text style={[styles.score, { color: colors.foreground }]}>{fixture.homeScore}</Text>}
            </View>
          </View>
          
          <View style={styles.meta}>
            <Text style={[styles.time, { color: isLiveOrFinal ? colors.primary : colors.mutedForeground }]}>
              {statusLabel}
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.badgeText, { color: colors.background }]}>TBM PLAY</Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  content: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, alignItems: 'center' },
  teams: { flex: 1, gap: 10 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamName: { fontSize: 15, fontFamily: 'Inter_700Bold', flex: 1 },
  score: { fontSize: 16, fontFamily: 'Inter_700Bold', width: 30, textAlign: 'right' },
  meta: { alignItems: 'flex-end', justifyContent: 'center', gap: 8, paddingLeft: 16 },
  time: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  badge: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 },
  badgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
});