import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetProjectionPass,
  useClaimProjectionPass,
  type ProjectionPassGame,
  type ProjectionPassResponse,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { TeamLogo } from '@/components/TeamLogo';
import { RecoverableErrorState } from '@/components/RecoverableErrorState';
import { API_BASE_URL } from '@/lib/api-config';
import { projectionPassErrorMessage } from '@/lib/projection-pass-error';

type Colors = ReturnType<typeof useColors>;

export function projectionPassQueryKey(viewerId: string) {
  return ['/api/projection-pass', { viewerId, apiSource: API_BASE_URL }] as const;
}

function useProjectionPass(viewerId: string) {
  return useGetProjectionPass({
    query: {
      queryKey: projectionPassQueryKey(viewerId),
      enabled: Boolean(viewerId),
      staleTime: 0,
      refetchOnMount: 'always',
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  });
}

/**
 * Server-adjusted monotonic clock. Anchored to each response (dataUpdatedAt):
 * serverTime + initial response age + performance.now() elapsed since anchoring.
 * Device wall-clock changes after anchoring cannot extend a grant.
 */
function useServerNow(data: ProjectionPassResponse | undefined, receivedAt: number): number | null {
  const anchor = useRef<{ receivedAt: number; server: number; perf: number } | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!data || !receivedAt) return null;
  const server = Date.parse(data.serverTime);
  if (Number.isNaN(server)) return null;
  if (!anchor.current || anchor.current.receivedAt !== receivedAt || anchor.current.server !== server) {
    anchor.current = { receivedAt, server: server + Math.max(0, Date.now() - receivedAt), perf: performance.now() };
  }
  return anchor.current.server + Math.max(0, performance.now() - anchor.current.perf);
}

/** Fire one scoped refetch when the adjusted clock crosses expiresAt. */
function useExpiryRefetch(data: ProjectionPassResponse | undefined, now: number | null, refetch: () => unknown) {
  const fired = useRef<string | null>(null);
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const expiresAt = data?.expiresAt ?? null;
  const expiresMs = expiresAt ? Date.parse(expiresAt) : NaN;
  const expired = !Number.isNaN(expiresMs) && now != null && now >= expiresMs;
  useEffect(() => {
    if (expired && expiresAt && fired.current !== expiresAt) {
      fired.current = expiresAt;
      void refetchRef.current();
    }
  }, [expired, expiresAt]);
}

function errorStatus(error: unknown): number | undefined {
  const s = (error as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

function nickname(name: string): string {
  const parts = name.trim().split(' ');
  return parts[parts.length - 1] ?? name;
}

function displaySport(s: string) {
  return s === 'NCAAMB' ? 'NCAAB' : s === 'SOCCER' ? 'Soccer' : s;
}

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function pct(v: number | null | undefined) {
  if (v == null) return '—';
  return `${(v <= 1 ? v * 100 : v).toFixed(1)}%`;
}

type Availability = 'open' | 'selected' | 'started' | 'locked';

function kickoffMs(game: ProjectionPassGame): number | null {
  if (!game.startsAt) return null;
  const t = Date.parse(game.startsAt);
  return Number.isNaN(t) ? null : t;
}

function isUpcoming(game: ProjectionPassGame, now: number): boolean {
  if (game.status !== 'upcoming') return false;
  const k = kickoffMs(game);
  return k != null && k > now;
}

function statusLabel(game: ProjectionPassGame, now: number): string {
  const status = game.status.toLowerCase();
  if (status === 'live' || status === 'in_progress' || status === 'inprogress') return 'LIVE';
  if (status === 'final' || status === 'completed') return 'FINAL';
  if (status === 'postponed') return 'POSTPONED';
  const k = kickoffMs(game);
  if (k == null) return 'TIME TBD';
  if (k <= now) return 'STARTED';
  return game.gameTime || new Date(k).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function detailHref(game: ProjectionPassGame) {
  return `/game/${encodeURIComponent(game.id)}?sport=${encodeURIComponent(game.sport)}&slateDate=${encodeURIComponent(game.gameDate)}` as const;
}

/* ───────────────────────── Slate (Picks tab) ───────────────────────── */

export function FreeProjectionPassGames({ viewerId }: { viewerId: string }) {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const passQuery = useProjectionPass(viewerId);
  const data = passQuery.data;
  const now = useServerNow(data, passQuery.dataUpdatedAt);
  useExpiryRefetch(data, now, passQuery.refetch);
  const [sport, setSport] = useState('All');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<ProjectionPassGame | null>(null);

  const claim = useClaimProjectionPass({
    mutation: {
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: projectionPassQueryKey(viewerId) });
        void queryClient.invalidateQueries({ queryKey: ['/api/games/today'] });
      },
    },
  });

  const expiresMs = data?.expiresAt ? Date.parse(data.expiresAt) : null;
  const passActive = Boolean(data?.gameId && expiresMs && now != null && now < expiresMs);
  const canClaim = Boolean(data?.canClaim) && !passActive;

  const games = data?.games ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of games) c[displaySport(g.sport)] = (c[displaySport(g.sport)] ?? 0) + 1;
    return c;
  }, [games]);
  const sports = Object.keys(counts).sort();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games.filter((g) => (sport === 'All' || displaySport(g.sport) === sport)
      && (!q || `${g.awayTeamName} ${g.homeTeamName} ${g.awayTeamAbbr} ${g.homeTeamAbbr}`.toLowerCase().includes(q)));
  }, [games, sport, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, ProjectionPassGame[]>();
    for (const g of filtered) {
      const k = displaySport(g.sport);
      m.set(k, [...(m.get(k) ?? []), g]);
    }
    return [...m.entries()];
  }, [filtered]);

  const availability = (g: ProjectionPassGame): Availability => {
    if (passActive && data?.gameId === g.id) return 'selected';
    if (now == null || !isUpcoming(g, now)) return 'started';
    if (canClaim) return 'open';
    return 'locked';
  };

  const onPressGame = (g: ProjectionPassGame) => {
    const a = availability(g);
    if (a === 'selected') router.push(detailHref(g));
    else if (a === 'open') { claim.reset(); setPending(g); }
    else if (a === 'locked') router.push('/membership');
  };

  const confirm = () => {
    if (!pending || claim.isPending) return;
    const target = pending;
    claim.mutate({ data: { gameId: target.id, confirm: true } }, {
      onSuccess: (res) => {
        queryClient.setQueryData(projectionPassQueryKey(viewerId), res);
        setPending(null);
        if (res.gameId) {
          const g = res.selectedGame ?? res.games.find((x) => x.id === res.gameId) ?? target;
          router.push(detailHref(g.id === res.gameId ? g : { ...target, id: res.gameId }));
        }
      },
    });
  };

  if (passQuery.isLoading) {
    return (
      <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 8 }}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={[s.skeleton, { backgroundColor: colors.card, borderColor: colors.border }]} />)}
      </View>
    );
  }
  if (passQuery.isError || !data) {
    const unavailable = errorStatus(passQuery.error) === 503;
    return (
      <RecoverableErrorState
        title={unavailable ? 'Projection Pass is temporarily unavailable' : 'Games unavailable'}
        message={unavailable ? 'The service is catching up. Your pass has not been used.' : "We couldn't load today's slate. Your pass has not been used."}
        error={passQuery.error}
        isRetrying={passQuery.isFetching}
        onRetry={passQuery.refetch}
      />
    );
  }

  const claimError = claim.error ? errorStatus(claim.error) : undefined;

  return (
    <View>
      <PassBanner
        colors={colors}
        passActive={passActive}
        canClaim={canClaim}
        remainingMs={passActive && expiresMs && now != null ? expiresMs - now : null}
        selected={passActive ? data.selectedGame : null}
        onOpenSelected={() => data.selectedGame && router.push(detailHref(data.selectedGame))}
        onUpgrade={() => router.push('/membership')}
        showSelectedLink={passActive && Boolean(data.selectedGame)}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.chips}>
        {['All', ...sports].map((sp) => {
          const active = sp === sport;
          const n = sp === 'All' ? games.length : counts[sp];
          return (
            <Pressable
              key={sp}
              testID={`free-sport-${sp}`}
              onPress={() => setSport(sp)}
              style={[s.chip, { backgroundColor: active ? colors.primary : 'transparent', borderColor: active ? colors.primary : colors.border }]}
            >
              <Text style={[s.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{sp}</Text>
              <View style={[s.countBadge, { backgroundColor: active ? colors.primaryForeground + '30' : colors.border }]}>
                <Text style={[s.countText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{n}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[s.searchBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Feather name="search" size={17} color={colors.mutedForeground} />
        <TextInput
          accessibilityLabel="Search games by team"
          value={search}
          onChangeText={setSearch}
          placeholder="Search teams or matchups"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          style={[s.searchInput, { color: colors.foreground }]}
        />
        {search.length > 0 && (
          <Pressable accessibilityLabel="Clear team search" hitSlop={10} onPress={() => setSearch('')}>
            <Feather name="x-circle" size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {grouped.length === 0 ? (
        <View style={s.empty}>
          <Feather name="calendar" size={22} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            {search.trim() ? `No matchups found for "${search.trim()}".` : games.length ? 'No games for this sport today.' : 'No games are scheduled on today\'s slate.'}
          </Text>
        </View>
      ) : grouped.map(([sp, list]) => (
        <View key={sp}>
          <Text style={[s.section, { color: colors.mutedForeground }]}>{sp} SLATE · {list.length}</Text>
          {list.map((g) => (
            <GameRow key={g.id} game={g} availability={availability(g)} label={statusLabel(g, now ?? 0)} colors={colors} onPress={() => onPressGame(g)} />
          ))}
        </View>
      ))}

      <Modal visible={pending != null} transparent animationType="fade" onRequestClose={() => !claim.isPending && setPending(null)}>
        <View style={s.backdrop}>
          <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.sheetIcon, { backgroundColor: colors.goldBg }]}><Feather name="unlock" size={18} color={colors.primary} /></View>
            <Text style={[s.sheetTitle, { color: colors.foreground }]}>Use your Projection Pass?</Text>
            {pending && (
              <Text style={[s.sheetGame, { color: colors.foreground }]}>
                {pending.awayTeamName} at {pending.homeTeamName}
              </Text>
            )}
            <Text style={[s.sheetCopy, { color: colors.mutedForeground }]}>
              Your pass unlocks the TBM projection for this one game only. It stays open for a rolling 24 hours, including after kickoff. You cannot switch games until the pass expires.
            </Text>
            {claim.isError && (
              <Text style={[s.sheetError, { color: colors.destructive }]}>
                {projectionPassErrorMessage(claim.error)}
              </Text>
            )}
            <View style={s.sheetActions}>
              <Pressable
                testID="pass-cancel"
                disabled={claim.isPending}
                onPress={() => { setPending(null); claim.reset(); }}
                style={({ pressed }) => [s.btn, { borderColor: colors.border, opacity: pressed || claim.isPending ? 0.6 : 1 }]}
              >
                <Text style={[s.btnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="pass-confirm"
                disabled={claim.isPending || claimError === 409}
                onPress={confirm}
                style={({ pressed }) => [s.btn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: pressed || claimError === 409 ? 0.6 : 1 }]}
              >
                {claim.isPending
                  ? <ActivityIndicator color={colors.primaryForeground} />
                  : <Text style={[s.btnText, { color: colors.primaryForeground }]}>Unlock this game</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PassBanner({ colors, passActive, canClaim, remainingMs, selected, onOpenSelected, onUpgrade, showSelectedLink }: {
  colors: Colors; passActive: boolean; canClaim: boolean; remainingMs: number | null;
  selected: ProjectionPassGame | null; onOpenSelected: () => void; onUpgrade: () => void; showSelectedLink: boolean;
}) {
  return (
    <View style={[s.banner, { backgroundColor: colors.card, borderColor: passActive ? colors.primary + '55' : colors.border }]}>
      <View style={s.bannerTop}>
        <Feather name={passActive ? 'clock' : canClaim ? 'unlock' : 'lock'} size={15} color={colors.primary} />
        <Text style={[s.bannerEyebrow, { color: colors.primary }]}>PROJECTION PASS</Text>
      </View>
      {passActive ? (
        <>
          <Text style={[s.bannerTitle, { color: colors.foreground }]}>
            {selected ? `${nickname(selected.awayTeamName)} at ${nickname(selected.homeTeamName)} is unlocked` : 'Your pass is active'}
          </Text>
          <Text style={[s.bannerCopy, { color: colors.mutedForeground }]}>
            Next pass in {remainingMs != null ? countdown(remainingMs) : '—'}. Other games stay locked until then.
          </Text>
          {showSelectedLink && selected && (
            <Pressable onPress={onOpenSelected} style={[s.bannerLink, { borderColor: colors.primary }]}>
              <Text style={[s.bannerLinkText, { color: colors.primary }]}>Open your unlocked game</Text>
              <Feather name="chevron-right" size={14} color={colors.primary} />
            </Pressable>
          )}
        </>
      ) : canClaim ? (
        <>
          <Text style={[s.bannerTitle, { color: colors.foreground }]}>Pick one upcoming game to unlock</Text>
          <Text style={[s.bannerCopy, { color: colors.mutedForeground }]}>Free members get one full projection every rolling 24 hours. Choose before kickoff.</Text>
        </>
      ) : (
        <>
          <Text style={[s.bannerTitle, { color: colors.foreground }]}>No pass available right now</Text>
          <Text style={[s.bannerCopy, { color: colors.mutedForeground }]}>Browse the full slate. Upgrade to Pro for every projection.</Text>
        </>
      )}
      <Pressable onPress={onUpgrade} hitSlop={6} style={{ marginTop: 10 }}>
        <Text style={[s.upgrade, { color: colors.foreground }]}>Every game, every sport with Pro <Feather name="arrow-right" size={12} color={colors.foreground} /></Text>
      </Pressable>
    </View>
  );
}

function GameRow({ game, availability, label, colors, onPress }: {
  game: ProjectionPassGame; availability: Availability; label: string; colors: Colors; onPress: () => void;
}) {
  const disabled = availability === 'started';
  const tag = availability === 'selected' ? 'UNLOCKED' : availability === 'open' ? 'TAP TO UNLOCK' : availability === 'locked' ? 'PRO' : 'NOT AVAILABLE FOR FREE UNLOCK';
  const icon = availability === 'selected' ? 'check' : availability === 'open' ? 'unlock' : 'lock';
  return (
    <Pressable
      testID={`free-game-${game.id}`}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={`${game.awayTeamName} at ${game.homeTeamName}, ${label}, ${tag.toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [s.row, { borderBottomColor: colors.border, opacity: disabled ? 0.5 : pressed ? 0.62 : 1 },
        availability === 'selected' && { backgroundColor: colors.goldBg, borderRadius: 10, paddingHorizontal: 10, marginHorizontal: 6 }]}
    >
      <View style={s.teams}>
        {[{ n: game.awayTeamName, a: game.awayTeamAbbr, l: game.awayTeamLogo }, { n: game.homeTeamName, a: game.homeTeamAbbr, l: game.homeTeamLogo }].map((t) => (
          <View key={t.a + t.n} style={s.teamRow}>
            <TeamLogo sport={game.sport} abbr={t.a} logoUrl={t.l ?? undefined} size={22} />
            <Text style={[s.teamName, { color: colors.foreground }]} numberOfLines={1}>{nickname(t.n)}</Text>
          </View>
        ))}
      </View>
      <View style={s.meta}>
        <Text style={[s.time, { color: label === 'LIVE' ? colors.primary : colors.mutedForeground }]}>{label}</Text>
        <View style={[s.tag, { borderColor: availability === 'selected' || availability === 'open' ? colors.primary + '66' : colors.border }]}>
          <Feather name={icon} size={10} color={availability === 'selected' || availability === 'open' ? colors.primary : colors.mutedForeground} />
          <Text style={[s.tagText, { color: availability === 'selected' || availability === 'open' ? colors.primary : colors.mutedForeground }]} numberOfLines={2}>{tag}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/* ───────────────────────── Detail ───────────────────────── */

export function FreeProjectionPassDetail({ viewerId, gameId, onBack }: { viewerId: string; gameId: string; onBack: () => void }) {
  const colors = useColors();
  const router = useRouter();
  const passQuery = useProjectionPass(viewerId);
  const data = passQuery.data;
  const now = useServerNow(data, passQuery.dataUpdatedAt);
  useExpiryRefetch(data, now, passQuery.refetch);

  const header = (
    <View style={[s.dHeader, { paddingTop: Platform.OS === 'web' ? 67 : 12, borderBottomColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={{ padding: 4, marginLeft: -4 }}>
        <Feather name="chevron-left" size={24} color={colors.foreground} />
      </Pressable>
      <Text style={[s.dHeaderTitle, { color: colors.foreground }]}>Matchup Analysis</Text>
      <View style={{ width: 32 }} />
    </View>
  );

  if (passQuery.isLoading || passQuery.isFetching || (data && now == null)) {
    return <View style={{ flex: 1, backgroundColor: colors.background }}>{header}<ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /></View>;
  }
  if (passQuery.isError || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <RecoverableErrorState
          title={errorStatus(passQuery.error) === 503 ? 'Projection Pass is temporarily unavailable' : 'Matchup unavailable'}
          message="We couldn't verify your Projection Pass. Try again."
          error={passQuery.error}
          isRetrying={passQuery.isFetching}
          onRetry={passQuery.refetch}
        />
      </View>
    );
  }

  const expiresMs = data.expiresAt ? Date.parse(data.expiresAt) : NaN;
  const valid = data.gameId === gameId && data.selectedGame?.id === gameId && data.projection != null
    && !Number.isNaN(expiresMs) && now != null && now < expiresMs;

  if (!valid) {
    const expired = data.gameId === gameId;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <View style={s.lock}>
          <View style={[s.sheetIcon, { backgroundColor: colors.goldBg, width: 48, height: 48, borderRadius: 24 }]}><Feather name="lock" size={20} color={colors.primary} /></View>
          <Text style={[s.sheetTitle, { color: colors.foreground }]}>{expired ? 'Your pass for this game has ended' : 'This projection is a Pro projection'}</Text>
          <Text style={[s.sheetCopy, { color: colors.mutedForeground }]}>
            {expired
              ? 'Projection Pass access lasts a rolling 24 hours. Upgrade to Pro to keep every projection open.'
              : 'Free members can unlock one upcoming game with their Projection Pass. Upgrade to Pro for every game on the slate.'}
          </Text>
          <View style={[s.sheetActions, { alignSelf: 'stretch' }]}>
            <Pressable onPress={onBack} style={[s.btn, { borderColor: colors.border }]}><Text style={[s.btnText, { color: colors.foreground }]}>Back</Text></Pressable>
            <Pressable testID="detail-upgrade" onPress={() => router.push('/membership')} style={[s.btn, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <Text style={[s.btnText, { color: colors.primaryForeground }]}>Upgrade to Pro</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const g = data.selectedGame!;
  const p = data.projection!;
  const winner = p.projectedWinner === 'HOME' ? nickname(g.homeTeamName) : p.projectedWinner === 'AWAY' ? nickname(g.awayTeamName) : 'Draw';
  const winnerProb = p.projectedWinner === 'HOME' ? p.homeWinProbability : p.projectedWinner === 'AWAY' ? p.awayWinProbability : p.drawProbability;
  const margin = Math.abs(p.expectedHomeScore - p.expectedAwayScore);
  const label = statusLabel(g, now!);
  const outlook = p.projectedWinner === 'DRAW'
    ? `The draw is the most likely single outcome at ${pct(p.drawProbability)}. Neither side holds a decisive model advantage.`
    : `${winner} carries ${pct(winnerProb)} win probability and projects to finish ${margin.toFixed(1)} ahead.`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={[s.passStrip, { backgroundColor: colors.goldBg }]}>
          <Feather name="clock" size={13} color={colors.primary} />
          <Text style={[s.passStripText, { color: colors.primary }]}>PROJECTION PASS · {countdown(expiresMs - now!)} LEFT</Text>
        </View>
        <View style={[s.board, { borderBottomColor: colors.border }]}>
          <DTeam name={g.awayTeamName} abbr={g.awayTeamAbbr} logo={g.awayTeamLogo} sport={g.sport} score={p.expectedAwayScore} colors={colors} />
          <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Text style={[s.time, { color: colors.mutedForeground }]}>{label}</Text>
            <Text style={[s.dSmall, { color: colors.mutedForeground }]}>{displaySport(g.sport)}</Text>
            <Text style={[s.dSmall, { color: colors.mutedForeground }]}>PROJECTED</Text>
          </View>
          <DTeam name={g.homeTeamName} abbr={g.homeTeamAbbr} logo={g.homeTeamLogo} sport={g.sport} score={p.expectedHomeScore} colors={colors} />
        </View>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.bannerEyebrow, { color: colors.primary }]}>TBM OUTLOOK</Text>
          <Text style={[s.bannerTitle, { color: colors.foreground, marginTop: 6 }]}>{p.projectedWinner === 'DRAW' ? 'TBM sees a balanced matchup' : `TBM leans ${winner}`}</Text>
          <Text style={[s.bannerCopy, { color: colors.mutedForeground }]}>{outlook}</Text>
        </View>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.dLabel, { color: colors.mutedForeground }]}>WIN PROBABILITY</Text>
          <ProbRow name={nickname(g.awayTeamName)} value={p.awayWinProbability} colors={colors} />
          {p.drawProbability != null && <ProbRow name="Draw" value={p.drawProbability} colors={colors} />}
          <ProbRow name={nickname(g.homeTeamName)} value={p.homeWinProbability} colors={colors} />
        </View>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'row' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.dLabel, { color: colors.mutedForeground }]}>EXPECTED MARGIN</Text>
            <Text style={[s.dValue, { color: colors.foreground }]}>{margin < 0.05 ? 'Even' : `${nickname(p.expectedHomeScore > p.expectedAwayScore ? g.homeTeamName : g.awayTeamName)} by ${margin.toFixed(1)}`}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.dLabel, { color: colors.mutedForeground }]}>EXPECTED TOTAL</Text>
            <Text style={[s.dValue, { color: colors.foreground }]}>{(p.expectedHomeScore + p.expectedAwayScore).toFixed(1)}</Text>
          </View>
        </View>
        <Text style={[s.disclaimer, { color: colors.mutedForeground }]}>
          Forecast as of {new Date(p.forecastTimestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Independent model research, not a betting recommendation.
        </Text>
        <Pressable onPress={() => router.push('/membership')} style={[s.btn, { marginHorizontal: 16, marginTop: 16, backgroundColor: colors.primary, borderColor: colors.primary }]}>
          <Text style={[s.btnText, { color: colors.primaryForeground }]}>Unlock every game with Pro</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function DTeam({ name, abbr, logo, sport, score, colors }: { name: string; abbr: string; logo: string | null; sport: string; score: number; colors: Colors }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <TeamLogo sport={sport} abbr={abbr} logoUrl={logo ?? undefined} size={46} />
      <Text style={[s.teamName, { color: colors.foreground, flex: 0, textAlign: 'center' }]} numberOfLines={1}>{nickname(name)}</Text>
      <Text style={[s.dScore, { color: colors.foreground }]}>{score.toFixed(1)}</Text>
    </View>
  );
}

function ProbRow({ name, value, colors }: { name: string; value: number; colors: Colors }) {
  const w = Math.max(3, Math.min(100, value <= 1 ? value * 100 : value));
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[s.dSmallStrong, { color: colors.foreground }]}>{name}</Text>
        <Text style={[s.dSmallStrong, { color: colors.foreground }]}>{pct(value)}</Text>
      </View>
      <View style={[s.track, { backgroundColor: colors.secondary }]}>
        <View style={{ width: `${w}%`, height: '100%', borderRadius: 3, backgroundColor: colors.primary }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  skeleton: { height: 64, borderRadius: 10, borderWidth: 1, opacity: 0.6 },
  banner: { marginHorizontal: 16, marginBottom: 4, padding: 14, borderRadius: 12, borderWidth: 1 },
  bannerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerEyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  bannerTitle: { marginTop: 8, fontSize: 16, fontFamily: 'Inter_700Bold' },
  bannerCopy: { marginTop: 4, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  bannerLink: { marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  bannerLinkText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  upgrade: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' },
  chips: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  countBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center' },
  countText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  searchBox: { minHeight: 46, marginHorizontal: 16, paddingHorizontal: 13, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, minHeight: 44, paddingVertical: 0, fontSize: 14, fontFamily: 'Inter_400Regular' },
  section: { marginHorizontal: 16, marginTop: 18, marginBottom: 6, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.3 },
  row: { marginHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  teams: { flex: 1, gap: 9 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  teamName: { flex: 1, fontSize: 16, fontFamily: 'Inter_700Bold' },
  meta: { alignItems: 'flex-end', gap: 7, paddingLeft: 12, maxWidth: 150 },
  time: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  tagText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.4, flexShrink: 1, textAlign: 'right' },
  empty: { alignItems: 'center', gap: 8, padding: 32 },
  emptyText: { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 16, borderWidth: 1, padding: 20, alignItems: 'center' },
  sheetIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  sheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  sheetGame: { marginTop: 6, fontSize: 14, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  sheetCopy: { marginTop: 10, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  sheetError: { marginTop: 12, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, minHeight: 46, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  dHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dHeaderTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  lock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  passStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  passStripText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  board: { flexDirection: 'row', alignItems: 'center', padding: 22, borderBottomWidth: StyleSheet.hairlineWidth },
  dScore: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  dSmall: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.6 },
  dSmallStrong: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  card: { marginHorizontal: 16, marginTop: 14, padding: 16, borderRadius: 12, borderWidth: 1 },
  dLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  dValue: { marginTop: 6, fontSize: 15, fontFamily: 'Inter_700Bold' },
  track: { marginTop: 6, height: 6, borderRadius: 3, overflow: 'hidden' },
  disclaimer: { marginHorizontal: 16, marginTop: 14, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
});
