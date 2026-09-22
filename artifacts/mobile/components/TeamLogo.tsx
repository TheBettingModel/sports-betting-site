import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

/**
 * Team logo badge.
 *
 * When a `logoUrl` is supplied (ESPN CDN, loaded at runtime — never bundled)
 * the real team logo is shown. On load error or when no URL is available, falls
 * back to a sport-coloured abbreviation circle so the layout never breaks.
 *
 * Apple cannot flag runtime CDN images during bundle review — identical to how
 * The Athletic, ESPN, and every other sports app ships logos.
 */

interface TeamLogoProps {
  sport: string;
  abbr: string;
  logoUrl?: string;
  size?: number;
}

/** Accent colour per sport, used for the fallback badge border ring. */
const SPORT_ACCENT: Record<string, string> = {
  MLB:   '#1473E6',
  NFL:   '#B22222',
  NBA:   '#E0431C',
  NHL:   '#005EB8',
  WNBA:  '#FF6900',
  NCAAF: '#CC5500',
  NCAAB: '#1D3557',
  Soccer:'#2E8B57',
};

const DEFAULT_ACCENT = '#4B5563';

const ESPN_PRO_SLUG: Record<string, string> = {
  MLB: 'mlb',
  NFL: 'nfl',
  NBA: 'nba',
  NHL: 'nhl',
  WNBA: 'wnba',
};

function abbreviationLogoUrl(sport: string, abbr: string): string | null {
  const slug = ESPN_PRO_SLUG[sport];
  return slug
    ? `https://a.espncdn.com/i/teamlogos/${slug}/500/${abbr.toLowerCase()}.png`
    : null;
}

/**
 * ESPN's numeric-ID CDN path 404s for these newer WNBA franchises even though
 * the scoreboard exposes a valid abbreviation-based asset. Keep this narrow
 * override until ESPN adds the numeric assets.
 */
const WNBA_LOGO_OVERRIDES: Record<string, string> = {
  LVA: 'https://a.espncdn.com/i/teamlogos/wnba/500/lv.png',
  TOR: 'https://a.espncdn.com/i/teamlogos/wnba/500/tor.png',
  GS: 'https://a.espncdn.com/i/teamlogos/wnba/500/gs.png',
};

export function TeamLogo({ sport, abbr, logoUrl, size = 40 }: TeamLogoProps) {
  const primaryLogoUrl = sport === 'WNBA'
    ? (WNBA_LOGO_OVERRIDES[abbr.toUpperCase()] ?? logoUrl)
    : logoUrl;
  const logoCandidates = useMemo(
    () => [...new Set([
      primaryLogoUrl,
      abbreviationLogoUrl(sport, abbr),
    ].filter((value): value is string => Boolean(value)))],
    [abbr, primaryLogoUrl, sport],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  useEffect(() => setCandidateIndex(0), [logoCandidates]);
  const resolvedLogoUrl = logoCandidates[candidateIndex];
  const showImage = Boolean(resolvedLogoUrl);
  const accent    = SPORT_ACCENT[sport] ?? DEFAULT_ACCENT;
  const fontSize  = Math.round(size * 0.33);
  const borderWidth = size >= 36 ? 2 : 1.5;

  if (showImage) {
    return (
      <Image
        source={{ uri: resolvedLogoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="contain"
        transition={120}
        onError={() => setCandidateIndex((current) => current + 1)}
      />
    );
  }

  // Fallback: abbreviation badge
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
