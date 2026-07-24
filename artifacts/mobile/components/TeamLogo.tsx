import React, { useState } from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import { getTeamLogoUrl } from '@/utils/teamLogos';

interface TeamLogoProps {
  sport: string;
  abbr: string;
  /** Stored ESPN CDN URL (future use). When present, preferred over the constructed URL. */
  logoUrl?: string;
  size?: number;
}

/**
 * Renders an ESPN team logo image.
 *
 * URL priority:
 *   1. logoUrl — explicitly stored URL captured at ingestion (future path)
 *   2. Abbreviation-based ESPN CDN URL — constructed from team abbr, always current
 *   3. Text abbreviation fallback — shown if the sport has no logos (UFC) or image errors
 */
export function TeamLogo({ sport, abbr, logoUrl, size = 40 }: TeamLogoProps) {
  const [failed, setFailed] = useState(false);
  const uri = logoUrl ?? getTeamLogoUrl(sport, abbr);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    );
  }

  // Fallback: abbr text centred in the same footprint
  return (
    <View style={[styles.fallback, { width: size, height: size }]}>
      <Text style={[styles.fallbackText, { fontSize: Math.round(size * 0.32) }]}>
        {abbr}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontFamily: 'Inter_700Bold',
    color: '#888888',
    letterSpacing: -0.3,
  },
});
