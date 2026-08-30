import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { TeamLogo } from '@/components/TeamLogo';
import type { Game } from '@/data/mockGames';

function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function impliedProbability(odds: number): number {
  return odds < 0 ? (Math.abs(odds) / (Math.abs(odds) + 100)) * 100 : (100 / (odds + 100)) * 100;
}

function fairAmericanOdds(probability: number): number {
  const decimalProbability = Math.min(Math.max(probability, 0.01), 99.99) / 100;
  return decimalProbability >= 0.5
    ? Math.round(-(decimalProbability / (1 - decimalProbability)) * 100)
    : Math.round(((1 - decimalProbability) / decimalProbability) * 100);
}

function clvShift(opening: number, current: number): number {
  return -(impliedProbability(current) - impliedProbability(opening));
}

function signedLine(line: number): string {
  return line > 0 ? `+${line}` : `${line}`;
}

interface GameCardProps {
  game: Game;
}

export function GameCard({ game }: GameCardProps) {
  const colors = useColors();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const { homeTeam, awayTeam, gameTime, sport, projection, vegasLine } = game;
  const isFinal = game.status === 'final' || game.status === 'completed';
  const hasScores = isFinal && game.homeScore != null && game.awayScore != null;
  const isNeutral = projection.valueRating === 'Neutral';
  const isFade = projection.valueRating === 'Fade';
  const selectedPick = game.selectedPick;
  const hasEdge = selectedPick != null || (!isNeutral && !isFade);
  const pickIsHome = selectedPick?.selection ? selectedPick.selection === 'home' : projection.edge >= 0;
  const pickTeam = pickIsHome ? homeTeam : awayTeam;
  const selectedMarket = selectedPick?.market ?? game.selectedMarket ?? 'moneyline';
  const pickOdds = selectedPick?.odds ?? (pickIsHome ? vegasLine.homeOdds : vegasLine.awayOdds);
  const openingOdds = pickIsHome ? vegasLine.openingHomeOdds : vegasLine.openingAwayOdds;
  const selectedWinPct = selectedPick?.modelProbability ?? (pickIsHome ? projection.homeWinPct : 100 - projection.homeWinPct);
  const fairOdds = selectedPick?.fairPrice ?? fairAmericanOdds(selectedWinPct);
  const probabilityEdge = selectedPick?.edge ?? Math.abs(projection.edge);
  const clv = openingOdds != null && openingOdds !== pickOdds ? clvShift(openingOdds, pickOdds) : null;
  const pickLine = selectedPick?.line
    ?? (selectedMarket === 'spread' ? (pickIsHome ? vegasLine.spread : -vegasLine.spread) : null);
  const showStarters = sport === 'MLB' && (projection.homeStarterName || projection.awayStarterName);
  const isUFC = sport === 'UFC';
  const homeDisplay = isUFC ? homeTeam.name : homeTeam.abbr;
  const awayDisplay = isUFC ? awayTeam.name : awayTeam.abbr;
  const tier = selectedPick?.recommendation ?? projection.valueRating;
  const selectedUnits = selectedPick?.units ?? projection.units;
  const showUnits = hasEdge && selectedUnits != null && selectedUnits > 0;
  const insightText = game.insights?.length ? game.insights.join(' · ') : null;

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
        <View style={styles.headerTopRow}>
          <View style={styles.boardMeta}>
            <Text style={[styles.boardLabel, { color: colors.primary }]}>MODEL BOARD</Text>
            <Text style={[styles.boardSlash, { color: colors.mutedForeground }]}>/</Text>
            <Text style={[styles.boardSport, { color: colors.mutedForeground }]}>{sport}</Text>
          </View>
          <Text style={[styles.gameTime, { color: colors.mutedForeground }]}>{isFinal ? 'FINAL' : gameTime}</Text>
        </View>
        <View style={styles.matchupRow}>
          <View style={styles.team}>
            <TeamLogo sport={sport} logoUrl={awayTeam.logoUrl} abbr={awayTeam.abbr} size={40} />
            <View style={styles.teamCopy}>
              <Text numberOfLines={1} style={[styles.teamName, { color: colors.foreground }]}>{awayDisplay}</Text>
              <Text numberOfLines={1} style={[styles.record, { color: colors.mutedForeground }]}>
                {awayTeam.record} · AWAY
              </Text>
            </View>
          </View>
          <View style={styles.atWrap}>
            <Text style={[styles.at, { color: colors.mutedForeground }]}>AT</Text>
            <View style={[styles.atRule, { backgroundColor: colors.border }]} />
          </View>
          <View style={[styles.team, styles.homeTeam]}>
            <View style={[styles.teamCopy, styles.homeCopy]}>
              <Text numberOfLines={1} style={[styles.teamName, { color: colors.foreground }]}>{homeDisplay}</Text>
              <Text numberOfLines={1} style={[styles.record, { color: colors.mutedForeground }]}>
                {homeTeam.record} · HOME
              </Text>
            </View>
            <TeamLogo sport={sport} logoUrl={homeTeam.logoUrl} abbr={homeTeam.abbr} size={40} />
          </View>
        </View>
      </View>

      {hasScores && (
        <View style={[styles.finalRow, { backgroundColor: colors.muted, borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>FINAL</Text>
          <Text style={[styles.finalScore, { color: colors.foreground }]}>{awayTeam.abbr} {game.awayScore} – {game.homeScore} {homeTeam.abbr}</Text>
        </View>
      )}

      <View style={styles.content}>
        {hasEdge ? (
          <>
            <Text style={[styles.pickLabel, { color: colors.primary }]}>TBM PICK</Text>
            <View style={styles.pickRow}>
              <Text numberOfLines={1} style={[styles.pickName, { color: colors.foreground }]}>
                {pickTeam.name}{pickLine != null ? ` ${signedLine(pickLine)}` : ''} {selectedMarket === 'spread' ? 'Spread' : 'ML'}
              </Text>
              <Text style={[styles.odds, { color: colors.foreground }]}>{fmtOdds(pickOdds)}</Text>
            </View>
            <View style={styles.recommendationRow}>
              <Text style={[styles.tier, { color: colors.primary }]}>{tier.toUpperCase()}</Text>
              {showUnits && (
                <>
                  <Text style={[styles.recommendationSeparator, { color: colors.mutedForeground }]}>·</Text>
                  <Text style={[styles.units, { color: colors.foreground }]}>{selectedUnits!.toFixed(1)}U</Text>
                </>
              )}
            </View>
            <View style={styles.analysisActionRow}>
              <AnalysisButton open={analysisOpen} onPress={toggleAnalysis} color={colors.foreground} activeColor={colors.primary} />
            </View>
          </>
        ) : (
          <View style={styles.noEdgeRow}>
            <View>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>MODEL STATUS</Text>
              <Text style={[styles.noEdgeTitle, { color: colors.foreground }]}>{isFade ? 'FADE' : 'NO ACTIONABLE EDGE'}</Text>
            </View>
            <AnalysisButton open={analysisOpen} onPress={toggleAnalysis} color={colors.foreground} activeColor={colors.primary} />
          </View>
        )}

        {analysisOpen && (
          <View style={[styles.analysis, { borderTopColor: colors.border }]}>
            <Text style={[styles.analysisTitle, { color: colors.foreground }]}>
              {hasEdge ? `WHY TBM LIKES ${pickTeam.name.toUpperCase()}` : 'MODEL ANALYSIS'}
            </Text>
            <AnalysisRow label="Model score" value={`${projection.finalModelScore ?? projection.modelScore}/100`} colors={colors} />
            <AnalysisRow label="Confidence" value={`${projection.confidence}${projection.finalModelStars ? ` · ${'★'.repeat(projection.finalModelStars)}` : ''}`} colors={colors} />
            {hasEdge && <AnalysisRow label="Model edge" value={`+${probabilityEdge.toFixed(1)}%`} colors={colors} />}
            {insightText && <Text style={[styles.insight, { color: colors.mutedForeground }]}>{insightText}</Text>}
            {showStarters && <StarterRow game={game} pickIsHome={pickIsHome} colors={colors} />}
            {(clv != null || projection.bestLineOdds != null || projection.sharpSignal) && (
              <View style={styles.analysisGroup}>
                {clv != null && <AnalysisRow label="Line movement" value={`${fmtOdds(openingOdds!)} → ${fmtOdds(pickOdds)} (${clv >= 0 ? '▲' : '▼'} ${Math.abs(clv).toFixed(1)}%)`} colors={colors} />}
                {projection.bestLineOdds != null && <AnalysisRow label="Best line" value={`${fmtOdds(projection.bestLineOdds)}${projection.bestLineBook ? ` · ${projection.bestLineBook}` : ''}`} colors={colors} />}
                {projection.sharpSignal && <AnalysisRow label="Market signal" value={projection.sharpSignal} colors={colors} />}
              </View>
            )}
            <View style={styles.analysisGroup}>
              <AnalysisRow label="Model pricing" value={`${selectedWinPct.toFixed(1)}% · fair ${fmtOdds(fairOdds)} · market ${fmtOdds(pickOdds)}`} colors={colors} />
              <AnalysisRow label="Risk" value={clv != null && clv < 0 ? 'Current price has moved against the selected side.' : 'Review current market price before placing a wager.'} colors={colors} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function AnalysisButton({ open, onPress, color, activeColor }: { open: boolean; onPress: () => void; color: string; activeColor: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? 'Hide game analysis' : 'View game analysis'}
      accessibilityState={{ expanded: open }}
      testID="game-card-analysis"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.analysisButtonHitArea, pressed && styles.analysisButtonPressed]}
    >
      {({ pressed }) => (
        <Text style={[styles.analysisButton, { color: pressed || open ? activeColor : color }]}>
          {open ? 'HIDE ANALYSIS  −' : 'VIEW ANALYSIS  +'}
        </Text>
      )}
    </Pressable>
  );
}

function AnalysisRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.analysisRow}><Text style={[styles.analysisLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text><Text style={[styles.analysisValue, { color: colors.foreground }]}>{value}</Text></View>;
}

function StarterRow({ game, pickIsHome, colors }: { game: Game; pickIsHome: boolean; colors: ReturnType<typeof useColors> }) {
  const { projection } = game;
  const awayEra = projection.awayStarterRecentEra ?? projection.awayStarterEra;
  const homeEra = projection.homeStarterRecentEra ?? projection.homeStarterEra;
  return <View style={styles.analysisGroup}>
    <Text style={[styles.analysisLabel, { color: colors.mutedForeground }]}>STARTING PITCHERS</Text>
    <AnalysisRow label={game.awayTeam.abbr} value={`${projection.awayStarterHand ?? ''}HP ${projection.awayStarterName ?? '—'}${awayEra != null ? ` · ${awayEra.toFixed(2)} ERA` : ''}`} colors={colors} />
    <AnalysisRow label={game.homeTeam.abbr} value={`${projection.homeStarterHand ?? ''}HP ${projection.homeStarterName ?? '—'}${homeEra != null ? ` · ${homeEra.toFixed(2)} ERA` : ''}`} colors={colors} />
  </View>;
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderLeftWidth: 3, borderRadius: 14, overflow: 'hidden', ...(Platform.OS === 'ios' ? { shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } } : { elevation: 4 }) },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  boardLabel: { fontSize: 9, lineHeight: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.15 },
  boardSlash: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  boardSport: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.05 },
  gameTime: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.75 },
  label: { fontSize: 9, lineHeight: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  matchupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13 },
  team: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  homeTeam: { justifyContent: 'flex-end' },
  teamCopy: { flexShrink: 1, minWidth: 0 },
  homeCopy: { alignItems: 'flex-end' },
  teamName: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  record: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.55, marginTop: 3 },
  atWrap: { width: 30, alignItems: 'center', marginHorizontal: 4 },
  at: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 },
  atRule: { width: 14, height: StyleSheet.hairlineWidth, marginTop: 4 },
  finalRow: { paddingVertical: 7, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, borderBottomWidth: 1 },
  finalScore: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  content: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 8 },
  pickLabel: { fontSize: 9, lineHeight: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  pickRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 5 },
  pickName: { flex: 1, fontSize: 27, lineHeight: 30, fontFamily: 'Inter_700Bold', letterSpacing: -1.15 },
  odds: { flexShrink: 0, fontSize: 20, lineHeight: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.45 },
  recommendationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  tier: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  recommendationSeparator: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  units: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.55, opacity: 0.78 },
  analysisActionRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 3 },
  analysisButtonHitArea: { minHeight: 38, minWidth: 118, alignItems: 'flex-end', justifyContent: 'center' },
  analysisButtonPressed: { opacity: 0.74 },
  analysisButton: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.95, textAlign: 'right' },
  noEdgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingBottom: 2, minHeight: 52 },
  noEdgeTitle: { marginTop: 5, fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },
  analysis: { borderTopWidth: 1, marginTop: 3, paddingTop: 13, paddingBottom: 8 },
  analysisTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, marginBottom: 10 },
  analysisGroup: { marginTop: 11 },
  analysisRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 6 },
  analysisLabel: { flexShrink: 0, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  analysisValue: { flex: 1, textAlign: 'right', fontSize: 11, lineHeight: 15, fontFamily: 'Inter_600SemiBold' },
  insight: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium', marginTop: 10 },
});