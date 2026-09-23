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

  // Lime is reserved for wins and primary CTAs — not for rating labels.
  // Strong Buy and Buy use a bordered, non-filled treatment to stay readable
  // without competing with win colours elsewhere on the card.
  const config: Record<ValueRating, { bg: string; border: string; text: string }> = {
    'Strong Buy': {
      bg:     'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.22)',
      text:   '#FFFFFF',
    },
    'Buy': {
      bg:     'rgba(203,213,225,0.08)',
      border: 'rgba(203,213,225,0.20)',
      text:   '#CBD5E1',
    },
    'Neutral': {
      bg:     colors.muted,
      border: colors.border,
      text:   colors.mutedForeground,
    },
    'Fade': {
      bg:     colors.loss + '22',
      border: colors.loss + '55',
      text:   colors.loss,
    },
  };

  const { bg, border, text } = config[rating];

  return (
    <View style={[
      styles.badge,
      { backgroundColor: bg, borderColor: border },
      compact && styles.compact,
    ]}>
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
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  compact: { paddingHorizontal: 7, paddingVertical: 3 },
  text: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  compactText: { fontSize: 10 },
});
