import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

/**
 * IP-safe team logo badge.
 *
 * Renders the team abbreviation inside a sport-coloured circular badge.
 * No external CDN images are fetched — all rendering is local, eliminating
 * any third-party intellectual-property concerns for App Store review.
 */

interface TeamLogoProps {
  sport: string;
  abbr: string;
  /** Accepted but intentionally ignored — kept for API compatibility. */
  logoUrl?: string;
  size?: number;
}

/** Accent colour per sport, used for the badge border ring. */
const SPORT_ACCENT: Record<string, string> = {
  MLB:   '#1473E6',
  NFL:   '#B22222',
  NBA:   '#E0431C',
  NHL:   '#005EB8',
  WNBA:  '#FF6900',
  NCAAF: '#CC5500',
  NCAAB: '#1D3557',
  Soccer:'#2E8B57',
  UFC:   '#C8102E',
};

const DEFAULT_ACCENT = '#4B5563';

export function TeamLogo({ sport, abbr, size = 40 }: TeamLogoProps) {
  const accent = SPORT_ACCENT[sport] ?? DEFAULT_ACCENT;
  const fontSize = Math.round(size * 0.33);
  const borderWidth = size >= 36 ? 2 : 1.5;

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: accent,
          borderWidth,
        },
      ]}
    >
      <Text
        style={[styles.abbr, { fontSize, color: accent }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {abbr.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D0D0D',
  },
  abbr: {
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
});
