import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useSports, SPORTS } from '@/context/SportsContext';

export function SportFilter() {
  const colors = useColors();
  const { selectedSport, setSelectedSport } = useSports();
  const allSports = ['All', ...SPORTS];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {allSports.map(sport => {
        const active = selectedSport === sport;
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
                backgroundColor: active ? colors.primary : colors.card,
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
  },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
