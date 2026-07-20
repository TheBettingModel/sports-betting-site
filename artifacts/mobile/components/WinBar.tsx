import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface WinBarProps {
  homeWinPct: number; // 0–100
  homeAbbr: string;
  awayAbbr: string;
}

export function WinBar({ homeWinPct, homeAbbr, awayAbbr }: WinBarProps) {
  const colors = useColors();
  const awayWinPct = 100 - homeWinPct;
  const homeColor =
    homeWinPct >= 55 ? colors.win : homeWinPct <= 45 ? colors.loss : colors.primary;

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <Text style={[styles.abbr, { color: colors.foreground }]}>{homeAbbr}</Text>
        <Text style={[styles.pct, { color: colors.mutedForeground }]}>
          {homeWinPct}% — {awayWinPct}%
        </Text>
        <Text style={[styles.abbr, { color: colors.foreground }]}>{awayAbbr}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        <View
          style={[
            styles.fill,
            // eslint-disable-next-line react-native/no-inline-styles
            { width: `${homeWinPct}%`, backgroundColor: homeColor },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 5 },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  abbr: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  pct: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
