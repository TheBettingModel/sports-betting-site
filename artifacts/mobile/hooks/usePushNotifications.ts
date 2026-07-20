/**
 * usePushNotifications
 *
 * Handles Expo push notification setup:
 *   - Requests permission on first call (should be called after subscription)
 *   - Registers the Expo push token with the API server
 *   - Sets up a response listener to deep-link into the Picks tab
 *   - Returns helpers to enable/disable notifications
 *
 * Safe to call on web (no-ops gracefully).
 */

import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@tbm/push_token';
const STORAGE_ENABLED_KEY = '@tbm/push_enabled';

// Configure how notifications appear when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function getApiBaseUrl(): Promise<string> {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return 'http://localhost:3000';
}

async function registerTokenWithServer(
  token: string,
  platform: string,
  clerkToken: string,
): Promise<void> {
  const base = await getApiBaseUrl();
  const res = await fetch(`${base}/api/push-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${clerkToken}`,
    },
    body: JSON.stringify({ token, platform }),
  });
  if (!res.ok) {
    throw new Error(`Register push token failed: ${res.status}`);
  }
}

async function deregisterTokenWithServer(
  token: string,
  clerkToken: string,
): Promise<void> {
  const base = await getApiBaseUrl();
  await fetch(`${base}/api/push-tokens`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${clerkToken}`,
    },
    body: JSON.stringify({ token }),
  });
}

export function usePushNotifications() {
  const router = useRouter();
  const { getToken } = useAuth();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  // Deep-link handler: when user taps the notification, navigate to Picks tab
  useEffect(() => {
    if (Platform.OS === 'web') return;

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<string, unknown>;
        if (data?.screen === 'picks') {
          router.push('/(tabs)/picks');
        }
      },
    );

    return () => {
      responseListener.current?.remove();
    };
  }, [router]);

  /**
   * Request permission and register the device token with the server.
   * Call this after the user subscribes to Pro.
   */
  const enableNotifications = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;

    // Create Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('picks', {
        name: 'Daily Picks',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#84CC16',
        description: 'Notifies you when new Strong Buy picks are available',
      });
    }

    // expo-notifications returns a PermissionResponse-extended type; cast to access .granted
    const existingPerms = await Notifications.getPermissionsAsync() as unknown as { granted: boolean };

    if (!existingPerms.granted) {
      const newPerms = await Notifications.requestPermissionsAsync() as unknown as { granted: boolean };
      if (!newPerms.granted) {
        return false;
      }
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Persist locally
    await AsyncStorage.setItem(STORAGE_KEY, token);
    await AsyncStorage.setItem(STORAGE_ENABLED_KEY, 'true');

    // Register with server
    const clerkToken = await getToken();
    if (clerkToken) {
      await registerTokenWithServer(token, Platform.OS, clerkToken);
    }

    return true;
  }, [getToken]);

  /**
   * Deregister the device token — called when user toggles off or signs out.
   */
  const disableNotifications = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'web') return;

    const token = await AsyncStorage.getItem(STORAGE_KEY);
    if (!token) return;

    await AsyncStorage.setItem(STORAGE_ENABLED_KEY, 'false');

    const clerkToken = await getToken();
    if (clerkToken) {
      await deregisterTokenWithServer(token, clerkToken);
    }
  }, [getToken]);

  /**
   * Returns whether notifications are currently enabled (locally cached).
   */
  const getNotificationsEnabled = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    const val = await AsyncStorage.getItem(STORAGE_ENABLED_KEY);
    if (val !== 'true') return false;
    // Also check system permission
    const perms = await Notifications.getPermissionsAsync() as unknown as { granted: boolean };
    return perms.granted;
  }, []);

  return { enableNotifications, disableNotifications, getNotificationsEnabled };
}
