import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { WinBar } from '@/components/WinBar';
import { ValueBadge } from '@/components/ValueBadge';
import { getTeamLogoUrl } from '@/utils/teamLogo';
import type { Game } from '@/data/mockGames';

function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

interface FeaturedPickProps {
  game: Game;
}

export function FeaturedPick({ game }: FeaturedPickProps) {
  const colors = useColors();
  const { homeTeam, awayTeam, gameTime, sport, projection, vegasLine } = game;
  const diff = projection.projectedSpread - vegasLine.spread;
  const isFade = projection.valueRating === 'Fade';
  const isNeutral = projection.valueRating === 'Neutral';
  const pickTeam = projection.edge >= 0 ? homeTeam : awayTeam;
  const edgeAbs = Math.abs(projection.edge);

  const homeLogo = getTeamLogoUrl(sport, homeTeam.abbr, homeTeam.espnId);
  const awayLogo = getTeamLogoUrl(sport, awayTeam.abbr, awayTeam.espnId);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.gold }]}>
      {/* Header bar */}
      <View style={[styles.goldBar, { backgroundColor: colors.gold }]}>
        <Text style={[styles.goldBarText, { color: colors.primaryForeground }]}>
          MODEL CONFIDENCE: {projection.confidence.toUpperCase()} · {projection.modelScore}/100
        </Text>
      </View>

      <View style={styles.body}>
        {/* Sport + time + badge */}
        <View style={styles.headerRow}>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            {sport} · {gameTime}
          </Text>
          <ValueBadge rating={projection.valueRating} />
        </View>

        {/* Model pick banner */}
        {!isFade && !isNeutral && (
          <View style={[styles.pickBanner, { backgroundColor: colors.goldBg, borderColor: colors.gold + '55' }]}>
            <Text style={[styles.pickLabel, { color: colors.mutedForeground }]}>MODEL PICK</Text>
            <Text style={[styles.pickTeam, { color: colors.gold }]}>
              {pickTeam.city} {pickTeam.name}
            </Text>
            <Text style={[styles.pickEdge, { color: colors.gold }]}>
              · +{edgeAbs.toFixed(1)}% EDGE
            </Text>
          </View>
        )}

        {/* Teams with logos */}
        <View style={styles.teamsRow}>
          {/* Home */}
          <View style={styles.teamBlock}>
            {homeLogo && (
              <Image
                source={{ uri: homeLogo }}
                style={styles.logo}
                resizeMode="contain"
                defaultSource={require('@/assets/images/icon.png')}
              />
            )}
            <Text style={[styles.abbr, { color: colors.foreground }]}>{homeTeam.abbr}</Text>
            <Text style={[styles.teamFull, { color: colors.mutedForeground }]}>
              {homeTeam.city} {homeTeam.name}
            </Text>
            <Text style={[styles.record, { color: colors.mutedForeground }]}>{homeTeam.record}</Text>
          </View>

          <View style={styles.vsBlock}>
            <Text style={[styles.vs, { color: colors.mutedForeground }]}>VS</Text>
          </View>

          {/* Away */}
          <View style={[styles.teamBlock, styles.teamRight]}>
            {awayLogo && (
              <Image
                source={{ uri: awayLogo }}
                style={styles.logo}
                resizeMode="contain"
                defaultSource={require('@/assets/images/icon.png')}
              />
            )}
            <Text style={[styles.abbr, { color: colors.foreground }]}>{awayTeam.abbr}</Text>
            <Text style={[styles.teamFull, { color: colors.mutedForeground }]}>
              {awayTeam.city} {awayTeam.name}
            </Text>
            <Text style={[styles.record, { color: colors.mutedForeground }]}>{awayTeam.record}</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={[styles.statsRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: colors.win }]}>
              {pickTeam.abbr} +{edgeAbs.toFixed(1)}%
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>EDGE</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: colors.foreground }]}>
              {projection.homeWinPct}%
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>WIN PROB</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: colors.foreground }]}>
              {fmtOdds(vegasLine.homeOdds)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>ML ODDS</Text>
          </View>
        </View>

        {/* Win bar */}
        <WinBar
          homeWinPct={projection.homeWinPct}
          homeAbbr={homeTeam.abbr}
          awayAbbr={awayTeam.abbr}
        />

        {/* Model vs Vegas spread comparison */}
        <View style={styles.compRow}>
          <View style={[styles.compBlock, { backgroundColor: colors.goldBg, borderColor: colors.gold + '55' }]}>
            <Text style={[styles.compLabel, { color: colors.gold }]}>MODEL LINE</Text>
            <Text style={[styles.compVal, { color: colors.foreground }]}>
              {projection.projectedSpread > 0 ? '+' : ''}{projection.projectedSpread}
            </Text>
          </View>
          <View style={[styles.compBlock, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.compLabel, { color: colors.mutedForeground }]}>VEGAS LINE</Text>
            <Text style={[styles.compVal, { color: colors.foreground }]}>
              {vegasLine.spread > 0 ? '+' : ''}{vegasLine.spread}
            </Text>
          </View>
          <View style={[
            styles.compBlock,
            {
              backgroundColor: diff > 0 ? colors.winBg : colors.lossBg,
              borderColor: (diff > 0 ? colors.win : colors.loss) + '55',
            },
          ]}>
            <Text style={[styles.compLabel, { color: diff > 0 ? colors.win : colors.loss }]}>DISCREPANCY</Text>
            <Text style={[styles.compVal, { color: diff > 0 ? colors.win : colors.loss }]}>
              {diff > 0 ? '+' : ''}{diff.toFixed(1)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1.5, overflow: 'hidden' },
  goldBar: { paddingVertical: 8, paddingHorizontal: 14 },
  goldBarText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  body: { padding: 16, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  teamsRow: { flexDirection: 'row', alignItems: 'center' },
  teamBlock: { flex: 1, gap: 2 },
  teamRight: { alignItems: 'flex-end' },
  logo: { width: 64, height: 64, marginBottom: 6 },
  abbr: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  teamFull: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  record: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  vsBlock: { paddingHorizontal: 12, alignSelf: 'center' },
  vs: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  divider: { width: 1, marginVertical: 2 },
  compRow: { flexDirection: 'row', gap: 8 },
  compBlock: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center', gap: 4 },
  compLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  compVal: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  pickBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pickLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  pickTeam: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  pickEdge: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});
