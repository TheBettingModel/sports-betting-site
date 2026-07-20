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
    <Pressable style={s.card} onPress={handlePress}>
      {/* Blurred content ghost */}
      <View style={s.ghostContent}>
        <View style={s.ghostLine} />
        <View style={[s.ghostLine, { width: '60%' }]} />
        <View style={[s.ghostLine, { width: '45%', marginTop: 8 }]} />
      </View>

      {/* Lock overlay */}
      <View style={s.overlay}>
        <View style={s.lockCircle}>
          <Feather name="lock" size={22} color="#84CC16" />
        </View>
        <Text style={s.lockTitle}>Pro Pick</Text>
        <Text style={s.lockSub}>Subscribe to unlock all picks</Text>
        <View style={s.unlockBtn}>
          <Feather name="zap" size={13} color="#000000" />
          <Text style={s.unlockBtnText}>Subscribe to unlock</Text>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#0A0A0A',
    overflow: 'hidden',
    minHeight: 110,
  },
  ghostContent: {
    padding: 16,
    gap: 8,
    opacity: 0.12,
  },
  ghostLine: {
    height: 14,
    width: '80%',
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  lockCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A2600',
    borderWidth: 1,
    borderColor: '#84CC16' + '44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
  },
  unlockBtnText: {
    color: '#000000',
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
});
