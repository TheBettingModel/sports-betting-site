import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { TeamLogo } from '@/components/TeamLogo';
import type { Game } from '@/data/mockGames';

function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function signedLine(line: number): string {
  return line > 0 ? `+${line}` : `${line}`;
}

interface FeaturedPickProps {
  game: Game;
}

export function FeaturedPick({ game }: FeaturedPickProps) {
  const colors = useColors();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const { homeTeam, awayTeam, gameTime, sport, projection, vegasLine, insights } = game;
  const selectedPick = game.selectedPick;
  const pickIsHome = selectedPick?.selection
    ? selectedPick.selection === 'home'
    : projection.edge >= 0;
  const pickTeam = pickIsHome ? homeTeam : awayTeam;
  const selectedMarket = selectedPick?.market ?? game.selectedMarket ?? 'moneyline';
  const pickOdds = selectedPick?.odds
    ?? (pickIsHome ? vegasLine.homeOdds : vegasLine.awayOdds);
  const pickLine = selectedPick?.line
    ?? (selectedMarket === 'spread'
      ? (pickIsHome ? vegasLine.spread : -vegasLine.spread)
      : null);
  const edgeAbs = selectedPick?.edge ?? Math.abs(projection.edge);
  const tier = selectedPick?.recommendation
    ?? projection.finalModelTier
    ?? projection.valueRating;
  const stars = projection.finalModelStars ?? 0;
  const units = selectedPick?.units ?? projection.units;

  const homeStarter = projection.homeStarterName
    ? { name: projection.homeStarterName, era: projection.homeStarterRecentEra ?? projection.homeStarterEra }
    : null;
  const awayStarter = projection.awayStarterName
    ? { name: projection.awayStarterName, era: projection.awayStarterRecentEra ?? projection.awayStarterEra }
    : null;
  const hasPitchers = sport === 'MLB' && (homeStarter || awayStarter);
  const hasBestLine = projection.bestLineBook != null && projection.bestLineOdds != null;
  const pickMarketLabel = selectedMarket === 'spread'
    ? `${pickLine != null ? `${signedLine(pickLine)} ` : ''}Spread`
    : 'ML';

  const toggleAnalysis = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAnalysisOpen(open => !open);
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderLeftColor: colors.primary,
        },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerMeta}>
            <Text style={[styles.headerSport, { color: colors.primary }]}>{sport}</Text>
            <Text style={[styles.headerSeparator, { color: colors.mutedForeground }]}>·</Text>
            <Text style={[styles.headerTier, { color: colors.mutedForeground }]}>TOP PICK</Text>
          </View>
          <Text style={[styles.headerTime, { color: colors.foreground }]}>{gameTime}</Text>
        </View>

        <View style={styles.matchupRow}>
          <View style={styles.team}>
            <TeamLogo sport={sport} abbr={awayTeam.abbr} logoUrl={awayTeam.logoUrl} size={48} />
            <Text numberOfLines={1} style={[styles.teamAbbr, { color: colors.foreground }]}>{awayTeam.abbr}</Text>
            <Text numberOfLines={1} style={[styles.teamRecord, { color: colors.mutedForeground }]}>
              {awayTeam.record} · AWAY
            </Text>
          </View>

          <View style={styles.matchupCenter}>
            <Text style={[styles.at, { color: colors.foreground }]}>AT</Text>
            <Text numberOfLines={2} style={[styles.fullNames, { color: colors.mutedForeground }]}>
              {awayTeam.city} {awayTeam.name}{'\n'}{homeTeam.city} {homeTeam.name}
            </Text>
          </View>

          <View style={styles.team}>
            <TeamLogo sport={sport} abbr={homeTeam.abbr} logoUrl={homeTeam.logoUrl} size={48} />
            <Text numberOfLines={1} style={[styles.teamAbbr, { color: colors.foreground }]}>{homeTeam.abbr}</Text>
            <Text numberOfLines={1} style={[styles.teamRecord, { color: colors.mutedForeground }]}>
              {homeTeam.record} · HOME
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.pickPanel,
            {
              backgroundColor: colors.winBg,
              borderColor: colors.primary + '47',
            },
          ]}
        >
          <Text style={[styles.pickLabel, { color: colors.primary }]}>TBM PICK</Text>
          <View style={styles.pickRow}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.pickName, { color: colors.foreground }]}>
              {pickTeam.abbr} {pickMarketLabel}
            </Text>
            <Text style={[styles.pickOdds, { color: colors.primary }]}>{fmtOdds(pickOdds)}</Text>
          </View>
          <View style={styles.recommendationRow}>
            <Text style={[styles.recommendation, { color: colors.primary }]}>
              {tier.toUpperCase()}
            </Text>
            {units != null && units > 0 && (
              <>
                <Text style={[styles.recommendationSeparator, { color: colors.mutedForeground }]}>·</Text>
                <Text style={[styles.units, { color: colors.foreground }]}>{units.toFixed(1)}U</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.analysisActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={analysisOpen ? 'Hide top pick analysis' : 'View top pick analysis'}
            accessibilityState={{ expanded: analysisOpen }}
            testID="featured-pick-analysis"
            onPress={toggleAnalysis}
            hitSlop={8}
            style={({ pressed }) => [styles.analysisButton, pressed && styles.analysisButtonPressed]}
          >
            {({ pressed }) => (
              <Text style={[styles.analysisButtonText, { color: pressed || analysisOpen ? colors.primary : colors.mutedForeground }]}>
                {analysisOpen ? 'HIDE ANALYSIS  −' : 'VIEW ANALYSIS  +'}
              </Text>
            )}
          </Pressable>
        </View>

        {analysisOpen && (
          <View style={[styles.analysis, { borderTopColor: colors.border }]}>
            <Text style={[styles.analysisTitle, { color: colors.foreground }]}>
              WHY TBM LIKES {pickTeam.name.toUpperCase()}
            </Text>

            <AnalysisRow
              label="Model score"
              value={`${projection.finalModelScore ?? projection.modelScore}/100${stars > 0 ? ` · ${'★'.repeat(stars)}` : ''}`}
              colors={colors}
            />
            <AnalysisRow label="Model edge" value={`+${edgeAbs.toFixed(1)}%`} colors={colors} accent />
            <AnalysisRow label="Recommendation" value={tier} colors={colors} accent />
            {units != null && units > 0 && (
              <AnalysisRow label="Units" value={`${units.toFixed(1)}U`} colors={colors} />
            )}

            {hasPitchers && (
              <View style={[styles.analysisGroup, { borderTopColor: colors.border }]}>
                <Text style={[styles.analysisGroupTitle, { color: colors.mutedForeground }]}>STARTING PITCHERS</Text>
                {awayStarter && (
                  <AnalysisRow
                    label={awayTeam.abbr}
                    value={`${awayStarter.name}${awayStarter.era != null ? ` · ${awayStarter.era.toFixed(2)} ERA` : ''}`}
                    colors={colors}
                  />
                )}
                {homeStarter && (
                  <AnalysisRow
                    label={homeTeam.abbr}
                    value={`${homeStarter.name}${homeStarter.era != null ? ` · ${homeStarter.era.toFixed(2)} ERA` : ''}`}
                    colors={colors}
                  />
                )}
              </View>
            )}

            <View style={[styles.analysisGroup, { borderTopColor: colors.border }]}>
              <Text style={[styles.analysisGroupTitle, { color: colors.mutedForeground }]}>MARKET</Text>
              <AnalysisRow label="Vegas" value={fmtOdds(pickOdds)} colors={colors} />
              <AnalysisRow label="Total" value={`${vegasLine.total}`} colors={colors} />
              <AnalysisRow label="Spread" value={signedLine(vegasLine.spread)} colors={colors} />
              {hasBestLine && (
                <AnalysisRow
                  label="Best line"
                  value={`${fmtOdds(projection.bestLineOdds!)} at ${projection.bestLineBook}`}
                  colors={colors}
                  accent
                />
              )}
            </View>

            {insights && insights.length > 0 && (
              <View style={[styles.insights, { borderTopColor: colors.border }]}>
                {insights.slice(0, 2).map((insight, index) => (
                  <Text key={`${insight}-${index}`} style={[styles.insight, { color: colors.mutedForeground }]}>
                    <Text style={{ color: colors.primary }}>— </Text>{insight}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function AnalysisRow({
  label,
  value,
  colors,
  accent = false,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  accent?: boolean;
}) {
  return (
    <View style={styles.analysisRow}>
      <Text style={[styles.analysisLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.analysisValue, { color: accent ? colors.primary : colors.foreground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 14,
    overflow: 'hidden',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.26,
          shadowRadius: 11,
          shadowOffset: { width: 0, height: 5 },
        }
      : { elevation: 5 }),
  },
  header: {
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerSport: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  headerSeparator: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  headerTier: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  headerTime: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.55,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  team: {
    width: 82,
    alignItems: 'center',
    gap: 3,
  },
  teamAbbr: {
    marginTop: 2,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
  },
  teamRecord: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  matchupCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  at: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.3,
  },
  fullNames: {
    marginTop: 5,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 8,
  },
  pickPanel: {
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 12,
    borderWidth: 1,
    borderRadius: 9,
  },
  pickLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.25,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
  },
  pickName: {
    flex: 1,
    fontSize: 25,
    lineHeight: 29,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
  },
  pickOdds: {
    flexShrink: 0,
    fontSize: 27,
    lineHeight: 30,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1.15,
  },
  recommendationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
  },
  recommendation: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  recommendationSeparator: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  units: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
    opacity: 0.78,
  },
  analysisActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 3,
  },
  analysisButton: {
    minHeight: 42,
    minWidth: 124,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  analysisButtonPressed: {
    opacity: 0.7,
  },
  analysisButtonText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.95,
  },
  analysis: {
    borderTopWidth: 1,
    paddingTop: 13,
    paddingBottom: 10,
  },
  analysisTitle: {
    marginBottom: 8,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.9,
  },
  analysisRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 7,
  },
  analysisLabel: {
    flexShrink: 0,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.75,
  },
  analysisValue: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'right',
  },
  analysisGroup: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  analysisGroupTitle: {
    marginBottom: 2,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  insights: {
    marginTop: 14,
    paddingTop: 11,
    borderTopWidth: 1,
    gap: 6,
  },
  insight: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Inter_500Medium',
  },
});