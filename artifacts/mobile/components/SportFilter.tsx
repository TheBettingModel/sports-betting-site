import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useSports, SPORTS } from '@/context/SportsContext';

interface SportFilterProps {
  /** Total game count per sport key. Positive counts are shown as badges. */
  gameCounts?: Record<string, number>;
  restrictIndividualSports?: boolean;
  onRestrictedPress?: () => void;
}

export function SportFilter({ gameCounts, restrictIndividualSports = false, onRestrictedPress }: SportFilterProps) {
  const colors = useColors();
  const { selectedSport, setSelectedSport } = useSports();

  // Sport tabs are permanent navigation, not a reflection of today's slate.
  // UFC is absent from the typed SPORTS release scope.
  const allSports = ['All', ...SPORTS];

  return (
    <ScrollView
      horizontal
      style={styles.scroller}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {allSports.map(sport => {
        const active = selectedSport === sport;
        const sportCount = sport !== 'All' && gameCounts ? gameCounts[sport] : undefined;
        const count = sportCount != null && sportCount > 0 ? sportCount : undefined;
        return (
          <Pressable
            key={sport}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (restrictIndividualSports && sport !== 'All') {
                onRestrictedPress?.();
                return;
              }
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
  scroller: { flexGrow: 0 },
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
