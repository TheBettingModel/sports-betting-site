import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, ClerkLoaded, ClerkLoading } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SportsProvider } from '@/context/SportsContext';
import { setBaseUrl } from '@workspace/api-client-react';
import { initializeRevenueCat, SubscriptionProvider } from '@/lib/revenuecat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DISCLAIMER_KEY } from '@/app/disclaimer';
import * as Updates from 'expo-updates';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, router } from 'expo-router';
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

function RootLayoutNav({ showDisclaimer }: { showDisclaimer: boolean }) {
  // If the user hasn't accepted the disclaimer, replace the initial route.
  // Runs after the splash screen is dismissed so there is no visible flash.
  useEffect(() => {
    if (showDisclaimer) {
      router.replace('/disclaimer');
    }
  }, [showDisclaimer]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="disclaimer" options={{ headerShown: false }} />
      <Stack.Screen
        name="membership"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  // If Clerk hasn't initialised within 10 s, show a retry prompt instead of
  // staying black forever. The timer is cleared as soon as ClerkLoaded fires
  // (via the ClerkLoaded branch rendering), so it only triggers on genuine hangs.
  const [clerkTimedOut, setClerkTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setClerkTimedOut(true), 10_000);
    return () => clearTimeout(t);
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Check whether the user has previously accepted the disclaimer.
  // We hold the splash screen until both fonts AND this check complete so
  // the user never sees a partial-render flash before the disclaimer.
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISCLAIMER_KEY)
      .then(val => {
        setShowDisclaimer(!val);
        setDisclaimerChecked(true);
      })
      .catch(() => {
        // Non-fatal — default to not showing if storage is unavailable
        setDisclaimerChecked(true);
      });
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && disclaimerChecked) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, disclaimerChecked]);

  // Check for an OTA update on every launch and reload immediately if one is found.
  // Only runs when expo-updates is enabled (i.e. production EAS builds with an
  // updates channel configured). Skipped in Expo Go and dev builds to avoid
  // the black-screen flash caused by Updates.reloadAsync() in those environments.
  useEffect(() => {
    if (!Updates.isEnabled) return;
    let cancelled = false;
    const checkUpdate = async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (cancelled || !check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (!cancelled) await Updates.reloadAsync();
      } catch {
        // Silently ignore: network error or no update channel configured.
      }
    };
    // Delay so the splash screen dismisses before any potential reload
    const t = setTimeout(checkUpdate, 3000);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  // Hold rendering until both fonts and the disclaimer check are ready.
  // This keeps the splash screen visible and prevents any layout flash.
  if ((!fontsLoaded && !fontError) || !disclaimerChecked) return null;

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
        {/* ClerkLoading renders while Clerk initialises. After 10 s we show a
            retry prompt so the app never stays black forever on a stalled init. */}
        <ClerkLoading>
          <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' }}>
            {clerkTimedOut ? (
              <>
                <Text style={{ color: '#6B7280', fontSize: 14, marginBottom: 20, fontFamily: 'Inter_400Regular' }}>
                  Taking longer than expected…
                </Text>
                <Pressable
                  onPress={() => Updates.reloadAsync()}
                  style={{ backgroundColor: '#84CC16', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
                >
                  <Text style={{ color: '#000', fontFamily: 'Inter_700Bold', fontSize: 14 }}>Tap to Retry</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </ClerkLoading>
        <ClerkLoaded>
          <SafeAreaProvider>
            <ErrorBoundary>
              <QueryClientProvider client={queryClient}>
                <SubscriptionProvider>
                  <SportsProvider>
                    <GestureHandlerRootView>
                      <KeyboardProvider>
                        <RootLayoutNav showDisclaimer={showDisclaimer} />
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
