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

function marketName(market: 'moneyline' | 'spread'): string {
  return market === 'spread' ? 'SPREAD' : 'MONEYLINE';
}

function signedLine(line: number): string {
  return line > 0 ? `+${line}` : `${line}`;
}

function ProbabilityPanel({
  label,
  probability,
  colors,
  detail,
}: {
  label: string;
  probability: number | null;
  colors: ReturnType<typeof useColors>;
  detail?: string;
}) {
  return (
    <View style={styles.probabilityPanel}>
      <Text style={[styles.probabilityLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <View style={styles.probabilityValueRow}>
        <Text style={[styles.probabilityValue, { color: colors.primary }]}>
          {probability == null ? '—' : `${probability.toFixed(1)}%`}
        </Text>
        {probability != null && (
          <View style={styles.signalBars} accessibilityLabel={`${probability.toFixed(1)} percent model probability`}>
            <View style={[styles.signalBar, styles.signalBarShort, { backgroundColor: colors.primary }]} />
            <View style={[styles.signalBar, styles.signalBarMedium, { backgroundColor: colors.primary }]} />
            <View style={[styles.signalBar, styles.signalBarTall, { backgroundColor: colors.primary }]} />
            <View style={[styles.signalBar, styles.signalBarFull, { backgroundColor: colors.primary }]} />
          </View>
        )}
      </View>
      {detail && <Text style={[styles.probabilityDetail, { color: colors.mutedForeground }]}>{detail}</Text>}
    </View>
  );
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
  const moneylineProbability = game.moneylineMarket?.modelProbability
    ?? (pickIsHome ? projection.homeWinPct : 100 - projection.homeWinPct);
  const spreadProbability = game.spreadMarket?.modelProbability ?? null;
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
          <View style={styles.headerMeta}>
            <Text style={[styles.label, { color: colors.primary }]}>THE PICK</Text>
            <Text style={[styles.sportMeta, { color: colors.mutedForeground }]}>{sport} · {isFinal ? 'FINAL' : gameTime}</Text>
          </View>
          <View style={styles.statusStack}>
            <View style={[styles.statusPill, { borderColor: isNeutral ? colors.border : colors.mutedForeground }]}>
              <Text style={[styles.statusText, { color: isNeutral ? colors.mutedForeground : colors.foreground }]}>
                {tier.toUpperCase()}
              </Text>
            </View>
            {showUnits && (
              <View style={[styles.unitsPill, { backgroundColor: colors.winBg, borderColor: colors.primary + '66' }]}>
                <Text style={[styles.unitsText, { color: colors.primary }]}>{selectedUnits!.toFixed(1)}u</Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.pickSummary, { borderColor: colors.border }]}>
          <Text style={[styles.pickSummaryLabel, { color: colors.mutedForeground }]}>PICK</Text>
          <Text numberOfLines={1} style={[styles.pickSummaryTeam, { color: colors.foreground }]}>
            {pickTeam.abbr}
          </Text>
          <Text style={[styles.pickSummaryMarket, { color: colors.foreground }]}>{marketName(selectedMarket)}</Text>
          <Text style={[styles.pickSummaryOdds, { color: colors.foreground }]}>{fmtOdds(pickOdds)}</Text>
        </View>

        {clv != null && (
          <View style={[styles.clvRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.clvLabel, { color: colors.mutedForeground }]}>CLV</Text>
            <Text style={[styles.clvOpen, { color: colors.mutedForeground }]}>Open <Text style={{ color: colors.foreground }}>{fmtOdds(openingOdds!)}</Text></Text>
            <Text style={[styles.clvArrow, { color: colors.mutedForeground }]}>→</Text>
            <Text style={[styles.clvCurrent, { color: colors.foreground }]}>{fmtOdds(pickOdds)}</Text>
            <Text style={[styles.clvDelta, { color: clv >= 0 ? colors.primary : colors.loss }]}>
              {clv >= 0 ? '▲' : '▼'} {Math.abs(clv).toFixed(1)}%
            </Text>
          </View>
        )}
      </View>

      {hasScores && (
        <View style={[styles.finalRow, { backgroundColor: colors.muted, borderBottomColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>FINAL</Text>
          <Text style={[styles.finalScore, { color: colors.foreground }]}>{awayTeam.abbr} {game.awayScore} – {game.homeScore} {homeTeam.abbr}</Text>
        </View>
      )}

      <View style={styles.content}>
        <View style={[styles.matchupBlock, { borderBottomColor: colors.border }]}>
          <View style={styles.matchupMeta}>
            <Text style={[styles.matchupSport, { color: colors.mutedForeground }]}>{sport}{game.league ? ` · ${game.league}` : ''}</Text>
            <Text style={[styles.matchupTime, { color: colors.mutedForeground }]}>{isFinal ? 'FINAL' : gameTime}</Text>
          </View>
          <View style={styles.matchupRow}>
            <View style={styles.team}>
              <TeamLogo sport={sport} logoUrl={awayTeam.logoUrl} abbr={awayTeam.abbr} size={54} />
              <View style={styles.teamCopy}>
                <Text numberOfLines={1} style={[styles.teamName, { color: colors.foreground }]}>{awayDisplay}</Text>
                <Text style={[styles.record, { color: colors.mutedForeground }]}>{awayTeam.record}</Text>
                <Text style={[styles.sideLabel, { color: colors.mutedForeground }]}>AWAY</Text>
              </View>
            </View>
            <Text style={[styles.at, { color: colors.mutedForeground }]}>VS</Text>
            <View style={[styles.team, styles.homeTeam]}>
              <View style={[styles.teamCopy, styles.homeCopy]}>
                <Text numberOfLines={1} style={[styles.teamName, { color: colors.foreground }]}>{homeDisplay}</Text>
                <Text style={[styles.record, { color: colors.mutedForeground }]}>{homeTeam.record}</Text>
                <Text style={[styles.sideLabel, { color: colors.primary }]}>HOME</Text>
              </View>
              <TeamLogo sport={sport} logoUrl={homeTeam.logoUrl} abbr={homeTeam.abbr} size={54} />
            </View>
          </View>
        </View>

        {hasEdge ? (
          <>
            <View style={styles.centerPick}>
              <Text style={[styles.centerPickLabel, { color: colors.mutedForeground }]}>PICK:</Text>
              <View style={styles.centerPickRow}>
                <Text numberOfLines={1} style={[styles.centerPickTeam, { color: colors.primary }]}>{pickTeam.abbr}</Text>
                <Text style={[styles.centerPickMarket, { color: colors.foreground }]}>
                  {pickLine != null ? ` ${signedLine(pickLine)}` : ''} {marketName(selectedMarket)}
                </Text>
              </View>
              <View style={[styles.pickUnderline, { backgroundColor: colors.primary }]} />
            </View>

            <View style={[styles.probabilityGrid, { borderColor: colors.border }]}>
              <ProbabilityPanel
                label="% TO WIN (ML)"
                probability={moneylineProbability}
                colors={colors}
              />
              <View style={[styles.probabilityDivider, { backgroundColor: colors.border }]} />
              <ProbabilityPanel
                label="% TO WIN (SPREAD)"
                probability={spreadProbability}
                colors={colors}
                detail={game.spreadMarket?.line != null
                  ? `SPREAD: ${game.spreadMarket.teamAbbr} ${signedLine(game.spreadMarket.line)} (${fmtOdds(game.spreadMarket.odds)})`
                  : undefined}
              />
            </View>

            <View style={[styles.metricsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.metricCell}>
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>EDGE</Text>
                <Text style={[styles.metricValue, { color: colors.primary }]}>+{probabilityEdge.toFixed(1)}%</Text>
              </View>
              <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
              <View style={styles.metricCell}>
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>CONFIDENCE</Text>
                <Text style={[styles.metricValueSmall, { color: colors.primary }]}>{projection.confidence.toUpperCase()}</Text>
              </View>
              <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
              <View style={styles.metricCell}>
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>MODEL SCORE</Text>
                <Text style={[styles.metricValueSmall, { color: colors.primary }]}>{projection.finalModelScore ?? projection.modelScore}/100</Text>
              </View>
            </View>

            <View style={styles.analysisActionRow}>
              <Text style={[styles.pickOddsCaption, { color: colors.mutedForeground }]}>
                {fmtOdds(pickOdds)}{pickLine != null ? ` · ${signedLine(pickLine)}` : ''}{selectedPick?.sportsbook ? ` · ${selectedPick.sportsbook}` : ''}
              </Text>
              <AnalysisButton open={analysisOpen} onPress={toggleAnalysis} color={colors.foreground} />
            </View>
          </>
        ) : (
          <View style={styles.noEdgeRow}>
            <View>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>MODEL STATUS</Text>
              <Text style={[styles.noEdgeTitle, { color: colors.foreground }]}>{isFade ? 'FADE' : 'NO ACTIONABLE EDGE'}</Text>
            </View>
            <AnalysisButton open={analysisOpen} onPress={toggleAnalysis} color={colors.foreground} />
          </View>
        )}

        {analysisOpen && (
          <View style={[styles.analysis, { borderTopColor: colors.border }]}>
            <Text style={[styles.analysisTitle, { color: colors.foreground }]}>
              {hasEdge ? `WHY TBM LIKES ${pickTeam.name.toUpperCase()}` : 'MODEL ANALYSIS'}
            </Text>
            <AnalysisRow label="Model score" value={`${projection.finalModelScore ?? projection.modelScore}/100`} colors={colors} />
            <AnalysisRow label="Confidence" value={`${projection.confidence}${projection.finalModelStars ? ` · ${'★'.repeat(projection.finalModelStars)}` : ''}`} colors={colors} />
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

function MarketRow({ label, market, colors }: { label: string; market: Game['moneylineMarket']; colors: ReturnType<typeof useColors> }) {
  const value = market
    ? `${market.teamAbbr}${market.line != null ? ` ${market.line > 0 ? '+' : ''}${market.line}` : ''} · ${market.modelProbability.toFixed(1)}% · ${fmtOdds(market.odds)}`
    : '—';
  return <View style={styles.marketRow}>
    <Text style={[styles.marketLabel, { color: colors.mutedForeground }]}>{label}</Text>
    <Text numberOfLines={1} style={[styles.marketValue, { color: colors.foreground }]}>{value}</Text>
  </View>;
}

function AnalysisButton({ open, onPress, color }: { open: boolean; onPress: () => void; color: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Hide game analysis' : 'View game analysis'} accessibilityState={{ expanded: open }} testID="game-card-analysis" onPress={onPress} hitSlop={8}><Text style={[styles.analysisButton, { color }]}>{open ? 'HIDE ANALYSIS ↑' : 'VIEW ANALYSIS →'}</Text></Pressable>;
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
  card: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderLeftWidth: 3, borderRadius: 18, overflow: 'hidden', ...(Platform.OS === 'ios' ? { shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } } : { elevation: 5 }) },
  header: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 13, borderBottomWidth: 1 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerMeta: { gap: 6 },
  sportMeta: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  statusStack: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { minHeight: 34, paddingHorizontal: 14, borderWidth: 1.5, borderRadius: 10, justifyContent: 'center' },
  statusText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  unitsPill: { minHeight: 34, paddingHorizontal: 12, borderWidth: 1, borderRadius: 9, justifyContent: 'center' },
  unitsText: { fontSize: 17, fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },
  pickSummary: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 15, paddingTop: 10, borderTopWidth: 1 },
  pickSummaryLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  pickSummaryTeam: { fontSize: 25, lineHeight: 29, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 },
  pickSummaryMarket: { flex: 1, fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  pickSummaryOdds: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  clvRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42, marginTop: 11, paddingHorizontal: 12, borderWidth: 1, borderRadius: 9, gap: 9 },
  clvLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  clvOpen: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  clvArrow: { fontSize: 16, marginTop: -1 },
  clvCurrent: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  clvDelta: { marginLeft: 'auto', fontSize: 13, fontFamily: 'Inter_700Bold' },
  label: { fontSize: 9, lineHeight: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  matchupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  team: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  homeTeam: { justifyContent: 'flex-end' },
  teamCopy: { flexShrink: 1, minWidth: 0 },
  homeCopy: { alignItems: 'flex-end' },
  teamName: { fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },
  record: { fontSize: 9, fontFamily: 'Inter_500Medium', letterSpacing: 0.6, marginTop: 3 },
  sideLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginTop: 4 },
  at: { fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: 1.8, marginHorizontal: 8 },
  finalRow: { paddingVertical: 7, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, borderBottomWidth: 1 },
  finalScore: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 },
  matchupBlock: { paddingBottom: 14, borderBottomWidth: 1 },
  matchupMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchupSport: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  matchupTime: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  centerPick: { alignItems: 'center', paddingVertical: 13 },
  centerPickLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  centerPickRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 2 },
  centerPickTeam: { fontSize: 33, lineHeight: 37, fontFamily: 'Inter_700Bold', letterSpacing: -1.6 },
  centerPickMarket: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },
  pickUnderline: { width: 148, height: 2, marginTop: 4, borderRadius: 1 },
  probabilityGrid: { flexDirection: 'row', minHeight: 101, borderWidth: 1, borderRadius: 11, overflow: 'hidden' },
  probabilityPanel: { flex: 1, minWidth: 0, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  probabilityDivider: { width: 1, marginVertical: 12 },
  probabilityLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  probabilityValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: 4 },
  probabilityValue: { fontSize: 27, lineHeight: 31, fontFamily: 'Inter_700Bold', letterSpacing: -1.3 },
  probabilityDetail: { marginTop: 5, fontSize: 9, lineHeight: 12, fontFamily: 'Inter_600SemiBold' },
  signalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 27 },
  signalBar: { width: 5, borderRadius: 1 },
  signalBarShort: { height: 8 },
  signalBarMedium: { height: 14 },
  signalBarTall: { height: 21 },
  signalBarFull: { height: 27 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', minHeight: 53, marginTop: 12, borderWidth: 1, borderRadius: 8 },
  metricCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  metricDivider: { width: 1, height: 27 },
  metricLabel: { fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  metricValue: { marginTop: 3, fontSize: 16, fontFamily: 'Inter_700Bold' },
  metricValueSmall: { marginTop: 3, fontSize: 12, fontFamily: 'Inter_700Bold' },
  analysisActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 4 },
  pickOddsCaption: { flex: 1, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  pickLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 5 },
  pickName: { flex: 1, fontSize: 25, lineHeight: 29, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  odds: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  recommendation: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, paddingBottom: 15, borderBottomWidth: 1 },
  tier: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  units: { fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.4 },
  outlook: { paddingVertical: 14, borderBottomWidth: 1 },
  outlookTitle: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.1, marginBottom: 10 },
  marketRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 5 },
  marketLabel: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  marketValue: { flex: 1, textAlign: 'right', fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  outlookColumns: { flexDirection: 'row' },
  outlookCell: { flex: 1, minWidth: 0 },
  outlookDivider: { borderLeftWidth: 1, paddingLeft: 8, marginLeft: 7 },
  winProbability: { fontSize: 22, lineHeight: 26, fontFamily: 'Inter_700Bold', letterSpacing: -1.2, marginTop: 5 },
  outlookValue: { fontSize: 16, lineHeight: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.4, marginTop: 5 },
  edgeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingTop: 14 },
  edge: { marginTop: 4, fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  analysisButton: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, paddingVertical: 9, textAlign: 'right' },
  noEdgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingBottom: 2 },
  noEdgeTitle: { marginTop: 5, fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },
  analysis: { borderTopWidth: 1, marginTop: 14, paddingTop: 13 },
  analysisTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, marginBottom: 10 },
  analysisGroup: { marginTop: 11 },
  analysisRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 6 },
  analysisLabel: { flexShrink: 0, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  analysisValue: { flex: 1, textAlign: 'right', fontSize: 11, lineHeight: 15, fontFamily: 'Inter_600SemiBold' },
  insight: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium', marginTop: 10 },
});