import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

function ShimmerBlock({
  width,
  height,
  borderRadius = 6,
  opacity,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  opacity: Animated.AnimatedInterpolation<number>;
}) {
  const colors = useColors();
  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: colors.border, opacity },
      ]}
    />
  );
}

export function GameCardSkeleton() {
  const colors = useColors();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 850, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* top row: sport pill · time · badge */}
      <View style={s.topRow}>
        <ShimmerBlock width={42} height={20} borderRadius={5} opacity={opacity} />
        <ShimmerBlock width={70} height={13} opacity={opacity} />
        <ShimmerBlock width={52} height={20} borderRadius={10} opacity={opacity} />
      </View>

      {/* teams + model score */}
      <View style={s.teamsRow}>
        <View style={s.teamBlock}>
          <ShimmerBlock width={44} height={44} borderRadius={22} opacity={opacity} />
          <ShimmerBlock width={38} height={22} opacity={opacity} />
          <ShimmerBlock width={58} height={11} opacity={opacity} />
        </View>
        <View style={s.middle}>
          <ShimmerBlock width={44} height={34} borderRadius={4} opacity={opacity} />
          <ShimmerBlock width={36} height={10} opacity={opacity} />
        </View>
        <View style={[s.teamBlock, s.teamRight]}>
          <ShimmerBlock width={44} height={44} borderRadius={22} opacity={opacity} />
          <ShimmerBlock width={38} height={22} opacity={opacity} />
          <ShimmerBlock width={58} height={11} opacity={opacity} />
        </View>
      </View>

      {/* win bar */}
      <ShimmerBlock width="100%" height={8} borderRadius={4} opacity={opacity} />

      {/* vegas row */}
      <View style={s.vegasRow}>
        <ShimmerBlock width={38} height={11} opacity={opacity} />
        <ShimmerBlock width={140} height={11} opacity={opacity} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamsRow: { flexDirection: 'row', alignItems: 'center' },
  teamBlock: { flex: 1, gap: 6 },
  teamRight: { alignItems: 'flex-end' },
  middle: { flex: 1, alignItems: 'center', gap: 6 },
  vegasRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
});
