import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { ValueBadge } from '@/components/ValueBadge';
import { TeamLogo } from '@/components/TeamLogo';
import type { Game } from '@/data/mockGames';

import { getSportColor } from '@/constants/sportColors';

function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/**
 * Implied-probability shift between two American-odds lines.
 * Positive result means the current line has a *higher* implied prob for
 * the pick side than the opening — market moved against you (bad).
 * We flip the sign so that positive = market moved YOUR way (good).
 */
function clvShift(opening: number, current: number): number {
  const toImpl = (o: number) =>
    o < 0 ? Math.abs(o) / (Math.abs(o) + 100) : 100 / (o + 100);
  // positive = opening was cheaper (shorter implied prob) → market drifted away → bad
  const raw = (toImpl(current) - toImpl(opening)) * 100;
  return -raw; // flip: positive = moved your way
}

interface GameCardProps {
  game: Game;
}

export function GameCard({ game }: GameCardProps) {
  const colors = useColors();
  const { homeTeam, awayTeam, gameTime, sport, projection, vegasLine } = game;
  const sportColor = getSportColor(sport);

  // ── Pick identity ──────────────────────────────────────────────
  const isNeutral = projection.valueRating === 'Neutral';
  const isFade    = projection.valueRating === 'Fade';
  const hasEdge   = !isNeutral && !isFade;
  const pickIsHome = projection.edge >= 0;
  const pickTeam   = pickIsHome ? homeTeam : awayTeam;
  const pickOdds   = pickIsHome ? vegasLine.homeOdds : vegasLine.awayOdds;
  const openingOdds = pickIsHome
    ? vegasLine.openingHomeOdds
    : vegasLine.openingAwayOdds;

  // CLV: only meaningful when we have an opening line that differs from current
  const clv = openingOdds != null && openingOdds !== pickOdds
    ? clvShift(openingOdds, pickOdds)
    : null;
  const clvUp = clv != null && clv > 0;

  const units = projection.units;
  const stars = projection.finalModelStars;
  const showUnits = hasEdge && units != null && units > 0;

  // ── Starters (MLB) ─────────────────────────────────────────────
  const showStarters = sport === 'MLB'
    && (projection.homeStarterName || projection.awayStarterName);

  // ── UFC: use last name (homeTeam.name) instead of abbreviation ──
  const isUFC = sport === 'UFC';
  const homeDisplay = isUFC ? homeTeam.name : homeTeam.abbr;
  const awayDisplay = isUFC ? awayTeam.name : awayTeam.abbr;
  const pickDisplay = isUFC ? pickTeam.name : pickTeam.abbr;

  return (
    <Pressable
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderBottomColor: colors.border,
          borderRightColor: colors.border,
          borderLeftColor: sportColor,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      {/* ══════════════════════════════════════════════
          PICK BAND — hero section
          Only shown when the model has a real edge
         ══════════════════════════════════════════════ */}
      {hasEdge && (
        <View style={styles.pickBand}>

          {/* Row 1: label + badge + units */}
          <View style={styles.pickBandTop}>
            <Text style={styles.pickLabel}>THE PICK</Text>
            <View style={styles.pickBandRight}>
              <ValueBadge rating={projection.valueRating} compact />
              {showUnits && (
                <View style={[styles.unitsPill, { backgroundColor: '#0d1f00', borderColor: '#2a3d00' }]}>
                  <Text style={[styles.unitsText, { color: colors.primary }]}>
                    {units!.toFixed(1)}u
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Row 2: pick team + home/away + bet type + current odds */}
          <View style={styles.pickRow}>
            <Text style={[styles.pickAbbr, { color: colors.foreground, fontSize: isUFC ? 20 : 26 }]}>
              {pickDisplay}
            </Text>
            {!isUFC && (
              <View style={styles.homeAwayPill}>
                <Text style={styles.homeAwayText}>
                  {pickIsHome ? 'HOME' : 'AWAY'}
                </Text>
              </View>
            )}
            <Text style={[styles.betType, { color: colors.mutedForeground }]}>
              Moneyline
            </Text>
            <View style={[styles.oddsPill, { backgroundColor: '#1a1a1a', borderColor: '#2a2a2a' }]}>
              <Text style={[styles.oddsText, { color: '#e5e7eb' }]}>
                {fmtOdds(pickOdds)}
              </Text>
            </View>
          </View>

          {/* Row 3: CLV line movement */}
          {clv != null && openingOdds != null && (
            <View style={[styles.clvRow, { backgroundColor: '#0a0a0a', borderColor: '#1d1d1d' }]}>
              <Text style={styles.clvLabel}>CLV</Text>
              <Text style={styles.clvBody}>
                Open{' '}
                <Text style={styles.clvOpenOdds}>{fmtOdds(openingOdds)}</Text>
              </Text>
              <Text style={styles.clvArrow}>→</Text>
              <Text style={[styles.clvCurrent, { color: '#e5e7eb' }]}>
                {fmtOdds(pickOdds)}
              </Text>
              <View style={styles.clvRight}>
                <Text style={[styles.clvShift, { color: clvUp ? colors.primary : '#EF4444' }]}>
                  {clvUp ? '▲' : '▼'} {Math.abs(clv).toFixed(1)}%
                </Text>
                <Text style={[styles.clvContext, { color: clvUp ? colors.primary : '#EF4444' }]}>
                  {clvUp ? 'with sharp' : 'fading'}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ══════════════════════════════════════════════
          MATCHUP — sport/time header + logos row
         ══════════════════════════════════════════════ */}

      {/* Sport + time — own line so logos row has full width */}
      <View style={styles.matchupMeta}>
        <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
          {sport}  ·  {gameTime}
        </Text>
      </View>

      {/* Logos row: Logo + abbr + record  |  vs  |  record + abbr + Logo */}
      <View style={styles.matchupRow}>

        {/* Home team */}
        <View style={styles.teamBlock}>
          <TeamLogo sport={sport} logoUrl={homeTeam.logoUrl} abbr={homeTeam.abbr} size={34} />
          <View style={styles.teamMeta}>
            <Text
              numberOfLines={1}
              style={[
                styles.teamAbbr,
                {
                  color: (hasEdge && pickIsHome) || !hasEdge ? colors.foreground : colors.mutedForeground,
                  fontSize: isUFC ? 13 : 15,
                },
              ]}
            >
              {homeDisplay}
            </Text>
            <Text style={[styles.record, { color: colors.mutedForeground }]}>{homeTeam.record}</Text>
          </View>
        </View>

        {/* VS centre */}
        <View style={styles.matchupCenter}>
          <Text style={[styles.vs, { color: '#4B5563' }]}>vs</Text>
        </View>

        {/* Away team */}
        <View style={[styles.teamBlock, styles.teamBlockRight]}>
          <View style={[styles.teamMeta, styles.teamMetaRight]}>
            <Text
              numberOfLines={1}
              style={[
                styles.teamAbbr,
                {
                  color: (hasEdge && !pickIsHome) || !hasEdge ? colors.foreground : colors.mutedForeground,
                  fontSize: isUFC ? 13 : 15,
                },
              ]}
            >
              {awayDisplay}
            </Text>
            <Text style={[styles.record, { color: colors.mutedForeground }]}>{awayTeam.record}</Text>
          </View>
          <TeamLogo sport={sport} logoUrl={awayTeam.logoUrl} abbr={awayTeam.abbr} size={34} />
        </View>
      </View>

      {/* ══════════════════════════════════════════════
          STARTING PITCHERS — MLB only
         ══════════════════════════════════════════════ */}
      {showStarters && (
        <View style={[styles.startersRow, { backgroundColor: '#0a0a0a', borderColor: '#1a1a1a' }]}>
          <Text style={[
            styles.starterName,
            { color: (hasEdge && pickIsHome) ? '#d1d5db' : colors.mutedForeground },
          ]}>
            {projection.homeStarterName ?? '—'}
          </Text>
          <Text style={styles.starterSP}>SP</Text>
          <Text style={[
            styles.starterName,
            { color: (hasEdge && !pickIsHome) ? '#d1d5db' : colors.mutedForeground },
          ]}>
            {projection.awayStarterName ?? '—'}
          </Text>
        </View>
      )}

      {/* ══════════════════════════════════════════════
          METRICS — score · edge · confidence
         ══════════════════════════════════════════════ */}
      <View style={styles.metricsRow}>
        {/* Model score */}
        <View style={styles.scoreBlock}>
          <Text style={[
            styles.score,
            { color: hasEdge ? colors.foreground : colors.mutedForeground },
          ]}>
            {projection.modelScore}
          </Text>
          <Text style={[
            styles.scoreDenom,
            { color: hasEdge ? colors.primary : colors.mutedForeground },
          ]}>
            /100
          </Text>
        </View>

        {/* Divider */}
        {hasEdge && <View style={[styles.divider, { backgroundColor: colors.border }]} />}

        {/* Edge */}
        {hasEdge && (
          <View style={styles.metricBlock}>
            <Text style={[styles.metricLabel, { color: '#9CA3AF' }]}>EDGE</Text>
            <Text style={[styles.metricValue, { color: colors.primary }]}>
              +{Math.abs(projection.edge).toFixed(1)}%
            </Text>
          </View>
        )}

        {/* Stars */}
        {hasEdge && stars != null && stars >= 4 && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.metricBlock}>
              <Text style={[styles.metricLabel, { color: '#9CA3AF' }]}>CONF</Text>
              <Text style={[styles.starBadge, { color: colors.primary }]}>
                {'★'.repeat(stars)}
              </Text>
            </View>
          </>
        )}

        {/* No edge fallback */}
        {!hasEdge && (
          <Text style={[styles.noEdge, { color: colors.mutedForeground }]}>NO EDGE</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderLeftWidth: 4,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    ...(Platform.OS === 'ios' ? { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } } : { elevation: 6 }),
    overflow: 'hidden',
    gap: 0,
  },

  // ── Pick band ─────────────────────────────────────────────────
  pickBand: {
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    gap: 7,
  },
  pickBandTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickLabel: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#6B7280',
    letterSpacing: 1.4,
  },
  pickBandRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unitsPill: {
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  unitsText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pickAbbr: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  homeAwayPill: {
    backgroundColor: '#1e1e1e',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  homeAwayText: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  betType: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  oddsPill: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  oddsText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },

  // CLV row
  clvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  clvLabel: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#9CA3AF',
    letterSpacing: 1,
  },
  clvBody: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#9CA3AF',
  },
  clvOpenOdds: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#d1d5db',
  },
  clvArrow: {
    fontSize: 10,
    color: '#4B5563',
  },
  clvCurrent: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  clvRight: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clvShift: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  clvContext: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    opacity: 0.75,
  },

  // ── Matchup ────────────────────────────────────────────────────
  matchupMeta: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  metaText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 0,
  },
  teamBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamBlockRight: {
    flexDirection: 'row-reverse',
  },
  teamMeta: {
    gap: 2,
  },
  teamMetaRight: {
    alignItems: 'flex-end',
  },
  teamAbbr: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.2,
  },
  record: {
    fontSize: 9,
    fontFamily: 'Inter_500Medium',
  },
  matchupCenter: {
    flex: 1,
    alignItems: 'center',
  },
  vs: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },

  // ── Starters ──────────────────────────────────────────────────
  startersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  starterName: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
  },
  starterSP: {
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    color: '#6B7280',
    letterSpacing: 0.5,
  },

  // ── Metrics ───────────────────────────────────────────────────
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 0,
  },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
  },
  score: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  scoreDenom: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    marginBottom: 3,
  },
  divider: {
    width: 1,
    height: 22,
    marginHorizontal: 12,
  },
  metricBlock: {
    gap: 1,
  },
  metricLabel: {
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  metricValue: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  starBadge: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  noEdge: {
    marginLeft: 'auto',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});
