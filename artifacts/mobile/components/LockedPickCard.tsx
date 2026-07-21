import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface Props {
  onUnlock: () => void;
}

export function LockedPickCard({ onUnlock }: Props) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onUnlock();
  };

  return (
    <Pressable
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
      onPress={handlePress}
    >
      {/* Ghost rows behind the overlay */}
      <View style={s.ghost} pointerEvents="none">
        <View style={s.ghostTopRow}>
          <View style={[s.ghostPill]} />
          <View style={[s.ghostLine, { width: 60 }]} />
          <View style={[s.ghostPill, { width: 50 }]} />
        </View>
        <View style={s.ghostTeamsRow}>
          <View style={s.ghostTeam}>
            <View style={s.ghostCircle} />
            <View style={[s.ghostLine, { width: 40, height: 20 }]} />
            <View style={[s.ghostLine, { width: 56, height: 11 }]} />
          </View>
          <View style={s.ghostMiddle}>
            <View style={[s.ghostLine, { width: 44, height: 32 }]} />
            <View style={[s.ghostLine, { width: 36, height: 10, marginTop: 2 }]} />
          </View>
          <View style={[s.ghostTeam, { alignItems: 'flex-end' }]}>
            <View style={s.ghostCircle} />
            <View style={[s.ghostLine, { width: 40, height: 20 }]} />
            <View style={[s.ghostLine, { width: 56, height: 11 }]} />
          </View>
        </View>
        <View style={[s.ghostLine, { width: '100%', height: 8, borderRadius: 4 }]} />
      </View>

      {/* Lock overlay — sits on top, doesn't affect layout */}
      <View style={s.overlay}>
        <View style={s.lockCircle}>
          <Feather name="lock" size={20} color="#84CC16" />
        </View>
        <Text style={s.lockTitle}>Pro Pick</Text>
        <Text style={s.lockSub}>Subscribe to unlock all picks</Text>
        <View style={s.unlockBtn}>
          <Feather name="zap" size={13} color="#000" />
          <Text style={s.unlockBtnTxt}>Unlock with Pro</Text>
        </View>
      </View>
    </Pressable>
  );
}

const GHOST = 'rgba(255,255,255,0.08)';

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#84CC1622',
    backgroundColor: '#0A0A0A',
    overflow: 'hidden',
    // Fixed height matches a real GameCard so there's no collapse/overlap
    height: 170,
  },

  // ── Ghost (blurred skeleton) ──────────────────────────────────────────────
  ghost: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    padding: 14,
    gap: 12,
    opacity: 0.15,
  },
  ghostTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ghostPill: {
    height: 20,
    width: 36,
    borderRadius: 5,
    backgroundColor: GHOST,
  },
  ghostLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: GHOST,
  },
  ghostTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  ghostTeam: {
    flex: 1,
    gap: 4,
  },
  ghostCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GHOST,
    marginBottom: 4,
  },
  ghostMiddle: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },

  // ── Lock overlay ──────────────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.78)',
    paddingVertical: 16,
  },
  lockCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1A2600',
    borderWidth: 1,
    borderColor: '#84CC1655',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  lockTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  lockSub: {
    color: '#6B7280',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#84CC16',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 6,
  },
  unlockBtnTxt: {
    color: '#000',
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
});
