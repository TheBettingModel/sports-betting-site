import React, { useState } from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import { getTeamLogoUrl } from '@/utils/teamLogos';

interface TeamLogoProps {
  sport: string;
  espnId?: string;
  abbr: string;
  size?: number;
}

/**
 * Renders an ESPN team logo image. Falls back to the text abbreviation
 * if the sport has no logo URL (UFC) or if the image fails to load.
 */
export function TeamLogo({ sport, espnId, abbr, size = 40 }: TeamLogoProps) {
  const [failed, setFailed] = useState(false);
  const uri = getTeamLogoUrl(sport, espnId);

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
