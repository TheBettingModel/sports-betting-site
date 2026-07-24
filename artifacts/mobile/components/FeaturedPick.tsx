import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ValueBadge } from '@/components/ValueBadge';
import { TeamLogo } from '@/components/TeamLogo';
import type { Game } from '@/data/mockGames';

function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function StarRating({ stars }: { stars: number }) {
  return (
    <Text style={styles.stars}>
      {Array.from({ length: 5 }, (_, i) => i < stars ? '★' : '☆').join('')}
    </Text>
  );
}

interface FeaturedPickProps {
  game: Game;
}

export function FeaturedPick({ game }: FeaturedPickProps) {
  const colors = useColors();
  const { homeTeam, awayTeam, gameTime, sport, projection, vegasLine, insights } = game;
  const isFade = projection.valueRating === 'Fade';
  const isNeutral = projection.valueRating === 'Neutral';
  const pickTeam = projection.edge >= 0 ? homeTeam : awayTeam;
  const edgeAbs = Math.abs(projection.edge);

  const tier = projection.finalModelTier ?? 'TOP PICK';
  const stars = projection.finalModelStars ?? 0;
  const units = projection.units;
  const sharpSignal = projection.sharpSignal;

  // Phase 2 extras
  const homeStarter = projection.homeStarterName
    ? { name: projection.homeStarterName, era: projection.homeStarterRecentEra ?? projection.homeStarterEra }
    : null;
  const awayStarter = projection.awayStarterName
    ? { name: projection.awayStarterName, era: projection.awayStarterRecentEra ?? projection.awayStarterEra }
    : null;
  const hasPitchers = sport === 'MLB' && (homeStarter || awayStarter);
  const bestLineBook = projection.bestLineBook;
  const bestLineOdds = projection.bestLineOdds;
  const hasBestLine = bestLineBook != null && bestLineOdds != null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Green header band */}
      <View style={styles.gradientBand}>
        <Text style={styles.bandLeft}>{sport} · {tier.toUpperCase()}</Text>
        <Text style={styles.bandRight}>{gameTime}</Text>
      </View>

      <View style={styles.body}>

        {/* ── Logo matchup row ── */}
        <View style={styles.matchupRow}>
          {/* Home team */}
          <View style={styles.teamCol}>
            <TeamLogo sport={sport} espnId={homeTeam.espnId} abbr={homeTeam.abbr} size={64} />
            <Text style={[styles.teamAbbr, { color: colors.foreground }]}>{homeTeam.abbr}</Text>
            <Text style={[styles.teamRecord, { color: colors.mutedForeground }]}>{homeTeam.record}</Text>
          </View>

          {/* Centre: vs + full names */}
          <View style={styles.vsCol}>
            <Text style={[styles.vsText, { color: colors.mutedForeground }]}>vs</Text>
            <Text style={[styles.fullNames, { color: colors.mutedForeground }]} numberOfLines={2}>
              {homeTeam.city} {homeTeam.name}{'\n'}{awayTeam.city} {awayTeam.name}
            </Text>
          </View>

          {/* Away team */}
          <View style={styles.teamCol}>
            <TeamLogo sport={sport} espnId={awayTeam.espnId} abbr={awayTeam.abbr} size={64} />
            <Text style={[styles.teamAbbr, { color: colors.foreground }]}>{awayTeam.abbr}</Text>
            <Text style={[styles.teamRecord, { color: colors.mutedForeground }]}>{awayTeam.record}</Text>
          </View>
        </View>

        {/* ── MLB pitcher matchup ── */}
        {hasPitchers && (
          <View style={[styles.pitcherRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <View style={styles.pitcherSide}>
              {homeStarter && (
                <>
                  <Text style={[styles.pitcherLabel, { color: colors.mutedForeground }]}>SP</Text>
                  <Text style={[styles.pitcherName, { color: colors.foreground }]} numberOfLines={1}>
                    {homeStarter.name.split(' ').pop()}
                  </Text>
                  {homeStarter.era != null && (
                    <Text style={[styles.pitcherEra, { color: colors.primary }]}>
                      {homeStarter.era.toFixed(2)} ERA
                    </Text>
                  )}
                </>
              )}
            </View>
            <Text style={[styles.pitcherVs, { color: colors.mutedForeground }]}>vs</Text>
            <View style={[styles.pitcherSide, styles.pitcherSideRight]}>
              {awayStarter && (
                <>
                  <Text style={[styles.pitcherLabel, { color: colors.mutedForeground }]}>SP</Text>
                  <Text style={[styles.pitcherName, { color: colors.foreground }]} numberOfLines={1}>
                    {awayStarter.name.split(' ').pop()}
                  </Text>
                  {awayStarter.era != null && (
                    <Text style={[styles.pitcherEra, { color: colors.primary }]}>
                      {awayStarter.era.toFixed(2)} ERA
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* ── Model score + stars + badge ── */}
        <View style={[styles.scoreRow, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>MODEL SCORE</Text>
            <View style={styles.scoreInline}>
              <Text style={[styles.scoreNum, { color: colors.foreground }]}>
                {projection.modelScore}
              </Text>
              <Text style={[styles.scoreDenom, { color: colors.primary }]}>/100</Text>
            </View>
            {stars > 0 && <StarRating stars={stars} />}
          </View>
          <View style={styles.badgeCol}>
            <ValueBadge rating={projection.valueRating} />
            {units != null && units > 0 && (
              <View style={[styles.unitsPill, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[styles.unitsText, { color: colors.primary }]}>
                  {units.toFixed(1)}u
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Win probability + edge ── */}
        {!isFade && !isNeutral && (
          <View style={styles.winBlock}>
            <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>WIN PROBABILITY</Text>
            <Text style={[styles.winPct, { color: colors.foreground }]}>
              {projection.homeWinPct}%{' '}
              <Text style={[styles.winSub, { color: colors.mutedForeground }]}>HOME WIN</Text>
            </Text>
            <Text style={[styles.edgeText, { color: colors.primary }]}>
              EDGE: {pickTeam.abbr} +{edgeAbs.toFixed(1)}%
            </Text>
            {sharpSignal && sharpSignal !== 'No Signal' && (
              <Text style={[styles.sharpText, { color: colors.mutedForeground }]}>
                {sharpSignal === 'Sharp Play' ? '⚡ ' : ''}
                {sharpSignal.toUpperCase()}
              </Text>
            )}
          </View>
        )}

        {/* ── Vegas row ── */}
        <View style={[styles.vegasRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.vegasItem, { color: colors.mutedForeground }]}>
            VEGAS · {fmtOdds(vegasLine.homeOdds)}
          </Text>
          <Text style={[styles.vegasDivider, { color: colors.border }]}>|</Text>
          <Text style={[styles.vegasItem, { color: colors.mutedForeground }]}>
            O/U · {vegasLine.total}
          </Text>
          <Text style={[styles.vegasDivider, { color: colors.border }]}>|</Text>
          <Text style={[styles.vegasItem, { color: colors.mutedForeground }]}>
            SPREAD · {vegasLine.spread > 0 ? '+' : ''}{vegasLine.spread}
          </Text>
        </View>

        {/* ── Best available line ── */}
        {hasBestLine && (
          <View style={[styles.bestLineRow, { borderColor: colors.border }]}>
            <Text style={[styles.bestLineLabel, { color: colors.mutedForeground }]}>BEST LINE</Text>
            <Text style={[styles.bestLineOdds, { color: colors.primary }]}>
              {fmtOdds(bestLineOdds!)}
            </Text>
            <Text style={[styles.bestLineAt, { color: colors.mutedForeground }]}>at</Text>
            <Text style={[styles.bestLineBook, { color: colors.foreground }]}>{bestLineBook}</Text>
          </View>
        )}

        {/* ── Insight chips ── */}
        {insights && insights.length > 0 && (
          <View style={styles.insightsRow}>
            {insights.slice(0, 2).map((text, i) => (
              <View
                key={i}
                style={[styles.insightChip, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <Text style={[styles.insightText, { color: colors.mutedForeground }]}>{text}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },

  gradientBand: {
    backgroundColor: '#84CC16',
    paddingVertical: 9,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bandLeft: { color: '#000000', fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  bandRight: { color: 'rgba(0,0,0,0.65)', fontSize: 13, fontFamily: 'Inter_700Bold' },

  body: { padding: 16, gap: 16 },

  // ── Logo matchup ─────────────────────────────────────────────────────────
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamCol: {
    alignItems: 'center',
    gap: 4,
    width: 72,
  },
  teamAbbr: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  teamRecord: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  vsCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  vsText: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
  },
  fullNames: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 14,
  },

  // ── Score row ─────────────────────────────────────────────────────────────
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    paddingBottom: 16,
  },
  scoreLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginBottom: 4 },
  scoreInline: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  scoreNum: { fontSize: 56, fontFamily: 'Inter_700Bold', lineHeight: 60, letterSpacing: -1 },
  scoreDenom: { fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 6 },
  stars: { fontSize: 18, color: '#84CC16', letterSpacing: 1, marginTop: 4 },
  badgeCol: { alignItems: 'flex-end', gap: 8, paddingBottom: 4 },
  unitsPill: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  unitsText: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },

  // ── Win probability ───────────────────────────────────────────────────────
  winBlock: { gap: 3 },
  winPct: { fontSize: 28, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  winSub: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  edgeText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  sharpText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },

  // ── Vegas ─────────────────────────────────────────────────────────────────
  vegasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  vegasItem: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  vegasDivider: { fontSize: 14 },

  // ── Pitcher matchup (MLB) ─────────────────────────────────────────────────
  pitcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: -8, // pull up closer to logo row
  },
  pitcherSide: { flex: 1, gap: 2 },
  pitcherSideRight: { alignItems: 'flex-end' },
  pitcherLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 },
  pitcherName: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  pitcherEra: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  pitcherVs: { fontSize: 12, fontFamily: 'Inter_700Bold', paddingHorizontal: 8 },

  // ── Best available line ────────────────────────────────────────────────────
  bestLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  bestLineLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, flex: 1 },
  bestLineOdds: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  bestLineAt: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  bestLineBook: { fontSize: 13, fontFamily: 'Inter_700Bold' },

  // ── Insights ──────────────────────────────────────────────────────────────
  insightsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  insightChip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  insightText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
});
