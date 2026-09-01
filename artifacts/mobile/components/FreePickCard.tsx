import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { TeamLogo } from '@/components/TeamLogo';
import type { FreePick } from '@workspace/api-client-react';

interface FreePickCardProps {
  freePick: FreePick;
}

export function FreePickCard({ freePick }: FreePickCardProps) {
  const colors = useColors();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const { homeTeamName, homeTeamAbbr, homeTeamLogo, awayTeamName, awayTeamAbbr, awayTeamLogo, startTime, sport, status, market, selection, recommendation } = freePick;
  
  const isFinal = status === 'final' || status === 'completed';
  const isUFC = sport === 'UFC';
  const homeDisplay = isUFC ? homeTeamName : homeTeamAbbr;
  const awayDisplay = isUFC ? awayTeamName : awayTeamAbbr;
  
  const pickTeamName = selection === 'home' ? homeTeamName : awayTeamName;
  const selectedMarketText = market === 'spread' ? 'Spread' : 'ML';

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
            <Text style={[styles.boardLabel, { color: colors.primary }]}>FREE PICK</Text>
            <Text style={[styles.boardSlash, { color: colors.mutedForeground }]}>/</Text>
            <Text style={[styles.boardSport, { color: colors.mutedForeground }]}>{sport}</Text>
          </View>
          <Text style={[styles.gameTime, { color: colors.mutedForeground }]}>{isFinal ? 'FINAL' : startTime}</Text>
        </View>
        <View style={styles.matchupRow}>
          <View style={styles.team}>
            <TeamLogo sport={sport} logoUrl={awayTeamLogo ?? undefined} abbr={awayTeamAbbr} size={40} />
            <View style={styles.teamCopy}>
              <Text numberOfLines={1} style={[styles.teamName, { color: colors.foreground }]}>{awayDisplay}</Text>
              <Text numberOfLines={1} style={[styles.record, { color: colors.mutedForeground }]}>AWAY</Text>
            </View>
          </View>
          <View style={styles.atWrap}>
            <Text style={[styles.at, { color: colors.mutedForeground }]}>AT</Text>
            <View style={[styles.atRule, { backgroundColor: colors.border }]} />
          </View>
          <View style={[styles.team, styles.homeTeam]}>
            <View style={[styles.teamCopy, styles.homeCopy]}>
              <Text numberOfLines={1} style={[styles.teamName, { color: colors.foreground }]}>{homeDisplay}</Text>
              <Text numberOfLines={1} style={[styles.record, { color: colors.mutedForeground }]}>HOME</Text>
            </View>
            <TeamLogo sport={sport} logoUrl={homeTeamLogo ?? undefined} abbr={homeTeamAbbr} size={40} />
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={[styles.pickLabel, { color: colors.primary }]}>TBM PICK</Text>
        <View style={styles.pickRow}>
          <Text numberOfLines={1} style={[styles.pickName, { color: colors.foreground }]}>
            {pickTeamName} {selectedMarketText}
          </Text>
        </View>
        <View style={styles.recommendationRow}>
          <Text style={[styles.tier, { color: colors.primary }]}>{recommendation.toUpperCase()}</Text>
        </View>
        <View style={styles.analysisActionRow}>
          <AnalysisButton open={analysisOpen} onPress={toggleAnalysis} color={colors.foreground} activeColor={colors.primary} />
        </View>

        {analysisOpen && (
          <View style={[styles.analysis, { borderTopColor: colors.border }]}>
            <Text style={[styles.analysisTitle, { color: colors.foreground }]}>
              WHY TBM LIKES {pickTeamName.toUpperCase()}
            </Text>
            <View style={styles.analysisRow}>
              <Text style={[styles.analysisValue, { color: colors.mutedForeground, textAlign: 'left' }]}>
                Pro members get access to exact model scores, probability edge, unit sizing, line movement signals, and starting pitcher advantages.
              </Text>
            </View>
            <View style={{ marginTop: 12 }}>
               <Text style={[styles.analysisValue, { color: colors.primary, textAlign: 'left' }]}>
                 Upgrade to Pro to see full model data.
               </Text>
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
  content: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 8 },
  pickLabel: { fontSize: 9, lineHeight: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  pickRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 5 },
  pickName: { flex: 1, fontSize: 27, lineHeight: 30, fontFamily: 'Inter_700Bold', letterSpacing: -1.15 },
  recommendationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  tier: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.1 },
  analysisActionRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 3 },
  analysisButtonHitArea: { minHeight: 38, minWidth: 118, alignItems: 'flex-end', justifyContent: 'center' },
  analysisButtonPressed: { opacity: 0.74 },
  analysisButton: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.95, textAlign: 'right' },
  analysis: { borderTopWidth: 1, marginTop: 3, paddingTop: 13, paddingBottom: 8 },
  analysisTitle: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, marginBottom: 10 },
  analysisRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginTop: 6 },
  analysisValue: { flex: 1, textAlign: 'right', fontSize: 11, lineHeight: 15, fontFamily: 'Inter_600SemiBold' },
});
