/**
 * useUserPreferences
 *
 * Fetches and updates the user's push notification preferences via /api/preferences.
 * Tracks notifSports, notifMinTier, and notifEnabled.
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

export const VALID_SPORTS = ['MLB', 'NFL', 'NBA', 'WNBA', 'NHL', 'Soccer'];
export const VALID_TIERS = ['Playable', 'Strong Buy', 'Elite'];

export const TIER_LABELS: Record<string, string> = {
  Playable: 'Playable or better',
  'Strong Buy': 'Strong Buy or better',
  Elite: 'Elite only',
};

export interface UserPrefs {
  notifSports: string[] | null; // null = all sports
  notifMinTier: string;         // 'Playable' | 'Strong Buy' | 'Elite'
  notifEnabled: boolean;
  validSports: string[];
  validTiers: string[];
}

const DEFAULT_PREFS: UserPrefs = {
  notifSports: null,
  notifMinTier: 'Playable',
  notifEnabled: true,
  validSports: VALID_SPORTS,
  validTiers: VALID_TIERS,
};

export function useUserPreferences() {
  const { getToken } = useAuth();
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
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
      const res = await fetch(`${base}/api/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as UserPrefs;
        setPrefs(data);
      }
    } catch {
      // Non-fatal — keep defaults
    } finally {
      setLoading(false);
    }
  }, []); // stable — uses ref internally

  useEffect(() => {
    void fetchPrefs();
  }, [fetchPrefs]);

  const updatePrefs = useCallback(
    async (patch: Partial<Pick<UserPrefs, 'notifSports' | 'notifMinTier' | 'notifEnabled'>>) => {
      if (Platform.OS === 'web') return;
      setSaving(true);
      try {
        const [base, token] = await Promise.all([getApiBaseUrl(), getTokenRef.current()]);
        if (!token) return;
        const res = await fetch(`${base}/api/preferences`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const data = await res.json() as UserPrefs;
          setPrefs(data);
        }
      } catch {
        // Non-fatal
      } finally {
        setSaving(false);
      }
    },
    [], // stable — uses ref internally
  );

  /** Toggle a single sport on/off */
  const toggleSport = useCallback(
    async (sport: string) => {
      const current = prefs.notifSports ?? VALID_SPORTS;
      const next = current.includes(sport)
        ? current.filter((s) => s !== sport)
        : [...current, sport];
      // null = all sports enabled (reset to default when all are checked)
      await updatePrefs({
        notifSports: next.length === VALID_SPORTS.length ? null : next,
      });
    },
    [prefs.notifSports, updatePrefs],
  );

  /** Set minimum tier */
  const setMinTier = useCallback(
    async (tier: string) => {
      await updatePrefs({ notifMinTier: tier });
    },
    [updatePrefs],
  );

  /** Toggle master notification switch */
  const setNotifEnabled = useCallback(
    async (enabled: boolean) => {
      await updatePrefs({ notifEnabled: enabled });
    },
    [updatePrefs],
  );

  return {
    prefs,
    loading,
    saving,
    toggleSport,
    setMinTier,
    setNotifEnabled,
    refetch: fetchPrefs,
  };
}
