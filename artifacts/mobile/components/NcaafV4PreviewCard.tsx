import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { TeamLogo } from '@/components/TeamLogo';
import type { NcaafV4SubscriberProjection } from '@workspace/api-client-react';

function fmtOdds(odds: number | null | undefined): string {
  if (odds == null) return '—';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function NcaafV4PreviewCard({ projection }: { projection: NcaafV4SubscriberProjection }) {
  const colors = useColors();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const { awayTeam, homeTeam, model, market, comparison, v4ModelOpinion } = projection;

  const awayTeamName = awayTeam || 'Away';
  const homeTeamName = homeTeam || 'Home';
  
  // Use first 3 letters as fallback abbreviation if team names are long
  const awayAbbr = awayTeamName.length > 3 ? awayTeamName.substring(0, 3).toUpperCase() : awayTeamName.toUpperCase();
  const homeAbbr = homeTeamName.length > 3 ? homeTeamName.substring(0, 3).toUpperCase() : homeTeamName.toUpperCase();

  const isHomePick = comparison?.moneylineHomeEdge != null && comparison.moneylineHomeEdge >= 0;
  const edgeAbs = comparison?.moneylineHomeEdge != null ? Math.abs(comparison.moneylineHomeEdge) * 100 : null;
  
  const pickTeamName = isHomePick ? homeTeamName : awayTeamName;
  const pickOdds = isHomePick ? market?.moneyline?.homeOdds : market?.moneyline?.awayOdds;
  const pickProbability = isHomePick ? model.homeWinProbability : model.awayWinProbability;
  const fairOdds = model.fairHomeMoneyline != null && model.fairAwayMoneyline != null 
    ? (isHomePick ? model.fairHomeMoneyline : model.fairAwayMoneyline)
    : null;

  const timeDate = new Date(projection.kickoffAt);
  const timeString = isNaN(timeDate.getTime()) 
    ? 'TBD' 
    : timeDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
            <Text style={[styles.boardLabel, { color: colors.primary }]}>V4 MODEL PROJECTION</Text>
            <Text style={[styles.boardSlash, { color: colors.mutedForeground }]}>/</Text>
            <Text style={[styles.boardSport, { color: colors.mutedForeground }]}>NCAAF</Text>
          </View>
          <Text style={[styles.gameTime, { color: colors.mutedForeground }]}>{timeString}</Text>
        </View>
        <View style={styles.matchupRow}>
          <View style={styles.team}>
            <TeamLogo sport="NCAAF" abbr={awayAbbr} size={40} />
            <View style={styles.teamCopy}>
              <Text numberOfLines={1} style={[styles.teamName, { color: colors.foreground }]}>{awayTeamName}</Text>
              <Text numberOfLines={1} style={[styles.record, { color: colors.mutedForeground }]}>AWAY</Text>
            </View>
          </View>
          <View style={styles.atWrap}>
            <Text style={[styles.at, { color: colors.mutedForeground }]}>AT</Text>
            <View style={[styles.atRule, { backgroundColor: colors.border }]} />
          </View>
          <View style={[styles.team, styles.homeTeam]}>
            <View style={[styles.teamCopy, styles.homeCopy]}>
              <Text numberOfLines={1} style={[styles.teamName, { color: colors.foreground }]}>{homeTeamName}</Text>
              <Text numberOfLines={1} style={[styles.record, { color: colors.mutedForeground }]}>HOME</Text>
            </View>
            <TeamLogo sport="NCAAF" abbr={homeAbbr} size={40} />
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={[styles.pickLabel, { color: colors.primary }]}>PROJECTED OUTCOME</Text>
        <View style={styles.pickRow}>
          <Text numberOfLines={1} style={[styles.pickName, { color: colors.foreground }]}>
            {pickTeamName} ML
          </Text>
          <Text style={[styles.odds, { color: colors.foreground }]}>{fmtOdds(pickOdds)}</Text>
        </View>
        <View style={styles.recommendationRow}>
          <Text style={[styles.tier, { color: colors.primary }]}>{v4ModelOpinion}</Text>
          {edgeAbs != null && (
            <>
              <Text style={[styles.recommendationSeparator, { color: colors.mutedForeground }]}>·</Text>
              <Text style={[styles.units, { color: colors.foreground }]}>+{edgeAbs.toFixed(1)}% EDGE</Text>
            </>
          )}
        </View>
        <View style={styles.analysisActionRow}>
          <AnalysisButton open={analysisOpen} onPress={toggleAnalysis} color={colors.foreground} activeColor={colors.primary} />
        </View>

        {analysisOpen && (
          <View style={[styles.analysis, { borderTopColor: colors.border }]}>
            <Text style={[styles.analysisTitle, { color: colors.foreground }]}>V4 MODEL ANALYSIS</Text>
            <AnalysisRow label="Projected Score" value={`${awayAbbr} ${Math.round(model.expectedAwayPoints)} – ${homeAbbr} ${Math.round(model.expectedHomePoints)}`} colors={colors} />
            <AnalysisRow label={`${pickTeamName} Win Prob`} value={`${(pickProbability * 100).toFixed(1)}%`} colors={colors} />
            {fairOdds != null && <AnalysisRow label="Fair Price" value={fmtOdds(fairOdds)} colors={colors} />}
            {edgeAbs != null && <AnalysisRow label="Value Edge" value={`+${edgeAbs.toFixed(1)}%`} colors={colors} />}
            <View style={styles.analysisGroup}>
              <AnalysisRow label="About" value="This is an NCAA Football V4 model projection for matchup research." colors={colors} />
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
  return (
    <View style={styles.analysisRow}>
      <Text style={[styles.analysisLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.analysisValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
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
  analysis: { borderTopWidth: 1, marginTop: 3, paddingTop: 13, paddingBottom: 8 },
  analysisTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, marginBottom: 10 },
  analysisGroup: { marginTop: 11 },
  analysisRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 6 },
  analysisLabel: { flexShrink: 0, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  analysisValue: { flex: 1, textAlign: 'right', fontSize: 11, lineHeight: 15, fontFamily: 'Inter_600SemiBold' },
});
