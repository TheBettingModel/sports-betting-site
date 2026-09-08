import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useSports, SPORTS } from '@/context/SportsContext';

interface SportFilterProps {
  /** Total game count per sport key. Used to show a count badge and hide sports with 0 games. */
  gameCounts?: Record<string, number>;
}

export function SportFilter({ gameCounts }: SportFilterProps) {
  const colors = useColors();
  const { selectedSport, setSelectedSport } = useSports();

  // Only show active sports that have games today; always show "All".
  // UFC is absent from the typed SPORTS release scope.
  const availableSports = gameCounts
    ? SPORTS.filter(s => (gameCounts[s] ?? 0) > 0)
    : SPORTS;
  const allSports = ['All', ...availableSports];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {allSports.map(sport => {
        const active = selectedSport === sport;
        const count = sport !== 'All' && gameCounts ? gameCounts[sport] : undefined;
        return (
          <Pressable
            key={sport}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedSport(sport as typeof selectedSport);
            }}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.primary : 'transparent',
                borderColor: active ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {sport}
            </Text>
            {count !== undefined && (
              <View style={[
                styles.countBadge,
                { backgroundColor: active ? colors.primaryForeground + '30' : colors.border },
              ]}>
                <Text style={[
                  styles.countText,
                  { color: active ? colors.primaryForeground : colors.mutedForeground },
                ]}>
                  {count}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  countBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  countText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});
