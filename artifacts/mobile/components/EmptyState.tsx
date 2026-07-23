import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const SPORT_MESSAGES: Record<string, { icon: string; title: string; sub: string }> = {
  NFL:   { icon: 'wind',      title: 'No NFL games today',    sub: 'Check back on game days — September through February.' },
  NCAAF: { icon: 'wind',      title: 'No NCAAF games today',  sub: 'College football runs September through January.' },
  NBA:   { icon: 'activity',  title: 'No NBA games today',    sub: 'The season runs October through June.' },
  NCAAB: { icon: 'activity',  title: 'No NCAAB games today',  sub: 'College hoops runs November through March.' },
  NHL:   { icon: 'thermometer', title: 'No NHL games today',  sub: 'The season runs October through June.' },
  Soccer:{ icon: 'globe',     title: 'No soccer matches today', sub: 'International leagues follow their own calendars.' },
  UFC:   { icon: 'zap',       title: 'No UFC events today',   sub: 'Events are typically held on Saturdays.' },
  WNBA:  { icon: 'activity',  title: 'No WNBA games today',   sub: 'The season runs May through September.' },
  MLB:   { icon: 'sun',       title: 'No MLB games today',    sub: 'The season runs April through October.' },
};

const DEFAULT_MESSAGE = {
  icon: 'calendar',
  title: 'No games today',
  sub: 'Pull down to refresh or check back later.',
};

interface EmptyStateProps {
  sport?: string;
  message?: string;
}

export function EmptyState({ sport, message }: EmptyStateProps) {
  const colors = useColors();
  const cfg = (sport && SPORT_MESSAGES[sport]) ?? DEFAULT_MESSAGE;

  return (
    <View style={s.container}>
      <View style={[s.iconCircle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
        <Feather name={cfg.icon as any} size={26} color={colors.mutedForeground} />
      </View>
      <Text style={[s.title, { color: colors.foreground }]}>{cfg.title}</Text>
      <Text style={[s.sub, { color: colors.mutedForeground }]}>
        {message ?? cfg.sub}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingVertical: 48, paddingHorizontal: 32, alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  sub:   { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
});
