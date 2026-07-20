import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { ValueRating } from '@/data/mockGames';

interface ValueBadgeProps {
  rating: ValueRating;
  compact?: boolean;
}

export function ValueBadge({ rating, compact = false }: ValueBadgeProps) {
  const colors = useColors();

  const config: Record<ValueRating, { bg: string; text: string }> = {
    'Strong Buy': { bg: colors.gold, text: colors.primaryForeground },
    'Buy': { bg: colors.win, text: '#FFFFFF' },
    'Neutral': { bg: colors.muted, text: colors.mutedForeground },
    'Fade': { bg: colors.loss, text: '#FFFFFF' },
  };

  const { bg, text } = config[rating];

  return (
    <View style={[styles.badge, { backgroundColor: bg }, compact && styles.compact]}>
      <Text style={[styles.text, { color: text }, compact && styles.compactText]}>
        {rating.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  compact: { paddingHorizontal: 7, paddingVertical: 3 },
  text: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  compactText: { fontSize: 10 },
});
