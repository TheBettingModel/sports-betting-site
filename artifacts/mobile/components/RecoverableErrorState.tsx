import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { safeRequestErrorCategory } from '@/utils/safeRequestErrorCategory';

interface RecoverableErrorStateProps {
  title: string;
  message: string;
  error: unknown;
  isRetrying: boolean;
  onRetry: () => unknown;
}

export function RecoverableErrorState({
  title,
  message,
  error,
  isRetrying,
  onRetry,
}: RecoverableErrorStateProps) {
  const colors = useColors();
  const category = safeRequestErrorCategory(error);

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text>
      <Text style={[styles.category, { color: colors.mutedForeground }]}>
        Diagnostic: {category}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        accessibilityState={{ busy: isRetrying, disabled: isRetrying }}
        disabled={isRetrying}
        onPress={() => { void onRetry(); }}
        style={[
          styles.retryButton,
          { backgroundColor: colors.primary, opacity: isRetrying ? 0.6 : 1 },
        ]}
      >
        <Text style={[styles.retryText, { color: colors.background }]}>
          {isRetrying ? 'Trying again…' : 'Try again'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  category: {
    marginTop: 10,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
});