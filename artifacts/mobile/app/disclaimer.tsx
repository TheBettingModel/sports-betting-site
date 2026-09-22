import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';

export const DISCLAIMER_KEY = '@tbm/disclaimer_accepted_v1';

const BULLETS = [
  'TheBettingModel provides AI-powered sports analytics and model-based picks for informational and entertainment purposes only.',
  'TheBettingModel does not facilitate, accept, process, or place real-money wagers on your behalf.',
  'Sports betting involves financial risk. Past model performance does not guarantee future results.',
  'You must be 18 years of age or older — or the minimum legal age in your jurisdiction — to use this app.',
  'If you or someone you know has a gambling problem, free help is available at 1-800-GAMBLER.',
];

export default function DisclaimerScreen() {
  const [saving, setSaving] = useState(false);

  const handleAccept = async () => {
    setSaving(true);
    try {
      await AsyncStorage.setItem(DISCLAIMER_KEY, 'true');
    } catch {
      // Non-fatal — proceed anyway so the user isn't blocked
    }
    router.replace('/(tabs)');
  };

  const handleExit = () => {
    Linking.openURL('https://www.ncpgambling.org/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>TBM</Text>
          </View>
          <Text style={styles.appName}>TheBettingModel</Text>
          <Text style={styles.tagline}>Sports Analytics & Model Picks</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>Before you continue</Text>
        <Text style={styles.subtitle}>
          Please read and agree to the following before using the app.
        </Text>

        {/* Bullets */}
        <View style={styles.bulletList}>
          {BULLETS.map((text, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.dot} />
              <Text style={styles.bulletText}>{text}</Text>
            </View>
          ))}
        </View>

        {/* Responsible gambling link */}
        <TouchableOpacity
          onPress={() => Linking.openURL('https://www.ncpgambling.org/')}
          style={styles.linkRow}
        >
          <Text style={styles.link}>National Problem Gambling Helpline →</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Actions — pinned to bottom */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.agreeBtn, saving && styles.agreeBtnDisabled]}
          onPress={handleAccept}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.agreeBtnText}>I agree — I'm 18 or older</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleExit} style={styles.exitBtn} activeOpacity={0.7}>
          <Text style={styles.exitText}>I'm under 18 — exit</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 16,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#111',
    borderWidth: 1.5,
    borderColor: '#84CC16',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#84CC16',
    letterSpacing: 1,
  },
  appName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  tagline: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    letterSpacing: 0.2,
  },

  // Body
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
    marginBottom: 24,
  },

  // Bullets
  bulletList: {
    gap: 14,
    marginBottom: 24,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#84CC16',
    marginTop: 6,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 21,
  },

  // Link
  linkRow: {
    marginBottom: 8,
  },
  link: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#84CC16',
    textDecorationLine: 'underline',
  },

  // Actions
  actions: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  agreeBtn: {
    backgroundColor: '#84CC16',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  agreeBtnDisabled: {
    opacity: 0.6,
  },
  agreeBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#000000',
    letterSpacing: 0.1,
  },
  exitBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  exitText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#6B7280',
  },
});
