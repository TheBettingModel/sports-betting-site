/**
 * useNotificationPreferences
 *
 * Fetches and updates the user's per-sport push notification preferences.
 * null enabledSports means "all sports" (the default).
 * [] means all disabled.
 * ['MLB', 'NFL'] means only those sports.
 *
 * Safe to call on web (returns defaults, ignores updates).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '@clerk/expo';

async function getApiBaseUrl(): Promise<string> {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return 'http://localhost:3000';
}

export const ALL_SPORTS = ['MLB', 'NFL', 'NHL', 'NBA', 'WNBA', 'NCAAB', 'NCAAF', 'Soccer'];

export interface NotificationPrefs {
  enabledSports: string[] | null; // null = all enabled
  allSports: string[];
}

function mobilePrefs(data: NotificationPrefs): NotificationPrefs {
  return {
    enabledSports: data.enabledSports?.filter((sport) => ALL_SPORTS.includes(sport)) ?? null,
    allSports: ALL_SPORTS,
  };
}

export function useNotificationPreferences() {
  const { getToken } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>({ enabledSports: null, allSports: ALL_SPORTS });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Use a ref so getToken identity changes don't re-trigger effects/callbacks
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  const fetchPrefs = useCallback(async () => {
    if (Platform.OS === 'web') return;
    setLoading(true);
    try {
      const [base, token] = await Promise.all([getApiBaseUrl(), getTokenRef.current()]);
      if (!token) return;
      const res = await fetch(`${base}/api/notification-preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as NotificationPrefs;
        setPrefs(mobilePrefs(data));
      }
    } catch {
      // Non-fatal — keep defaults
    } finally {
      setLoading(false);
    }
  }, []); // stable — uses ref internally

  useEffect(() => { void fetchPrefs(); }, [fetchPrefs]);

  const updatePrefs = useCallback(async (enabledSports: string[] | null) => {
    const mobileEnabledSports = enabledSports?.filter((sport) => ALL_SPORTS.includes(sport)) ?? null;
    if (Platform.OS === 'web') return;
    setSaving(true);
    try {
      const [base, token] = await Promise.all([getApiBaseUrl(), getTokenRef.current()]);
      if (!token) return;
      const res = await fetch(`${base}/api/notification-preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabledSports: mobileEnabledSports }),
      });
      if (res.ok) {
        const data = await res.json() as NotificationPrefs;
        setPrefs(mobilePrefs(data));
      }
    } catch {
      // Non-fatal
    } finally {
      setSaving(false);
    }
  }, []); // stable — uses ref internally

  /** Toggle a single sport on/off */
  const toggleSport = useCallback(async (sport: string) => {
    const current = prefs.enabledSports ?? ALL_SPORTS;
    const next = current.includes(sport)
      ? current.filter((s) => s !== sport)
      : [...current, sport];
    await updatePrefs(next.length === ALL_SPORTS.length ? null : next);
  }, [prefs.enabledSports, updatePrefs]);

  return { prefs, loading, saving, toggleSport, refetch: fetchPrefs };
}
