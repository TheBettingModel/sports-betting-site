import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, ClerkLoaded } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SportsProvider } from '@/context/SportsContext';
import { setBaseUrl } from '@workspace/api-client-react';
import { initializeRevenueCat, SubscriptionProvider } from '@/lib/revenuecat';
import * as Updates from 'expo-updates';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

// Point the API client at this repl's dev domain
const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);

// Initialize RevenueCat (safe to call before auth — SDK auto-detects Expo Go and uses test mode)
try {
  initializeRevenueCat();
} catch (err: any) {
  // Non-fatal: paywall will be unavailable but rest of app works
  console.warn('[RevenueCat] init failed:', err?.message);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Check for an OTA update on every launch and reload immediately if one is found.
  // This eliminates the two-close cycle that Expo's built-in updater normally requires.
  useEffect(() => {
    let cancelled = false;
    const checkUpdate = async () => {
      try {
        // expo-updates API: checkForUpdateAsync returns { isAvailable, manifest? }
        const check = await Updates.checkForUpdateAsync();
        if (cancelled || !check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (!cancelled) await Updates.reloadAsync();
      } catch {
        // Silently ignore: custom OTA build or expo-updates not configured in
        // this environment — the built-in Expo updater handles it on next launch.
      }
    };
    // Delay so the splash screen dismisses before any potential reload
    const t = setTimeout(checkUpdate, 2000);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  if (!fontsLoaded && !fontError) return null;

  // publishableKey is provided by the @clerk/expo native plugin from Info.plist
  // at runtime. The env var is a JS-bundle fallback for dev/OTA builds.
  const resolvedKey =
    publishableKey ||
    'pk_test_cmVuZXdpbmctZmlsbHktNDkuY2xlcmsuYWNjb3VudHMuZGV2JA';

  return (
    // Outer boundary catches ClerkProvider/ClerkLoaded init failures
    <ErrorBoundary>
      <ClerkProvider
        publishableKey={resolvedKey}
        tokenCache={tokenCache}
        proxyUrl={proxyUrl}
      >
        <ClerkLoaded>
          <SafeAreaProvider>
            <ErrorBoundary>
              <QueryClientProvider client={queryClient}>
                <SubscriptionProvider>
                  <SportsProvider>
                    <GestureHandlerRootView>
                      <KeyboardProvider>
                        <RootLayoutNav />
                      </KeyboardProvider>
                    </GestureHandlerRootView>
                  </SportsProvider>
                </SubscriptionProvider>
              </QueryClientProvider>
            </ErrorBoundary>
          </SafeAreaProvider>
        </ClerkLoaded>
      </ClerkProvider>
    </ErrorBoundary>
  );
}
