/** UTC, deterministic policy; no database, network, timers, or application startup. */
export const ODDS_CREDIT_POLICY = Object.freeze({
  monthlyCredits: 20_000,
  monthlyReserve: 4_000,
  dailyCredits: 500,
  burstCredits: 120,
  requestCredits: 6, // three markets × two regions; keep transport parameters in sync
  nearKickoffMs: 3 * 60 * 60_000,
  // No near-kickoff acceleration on the 20K plan: at most two paid
  // collections per feed in 24 hours, shared across API/worker processes.
  nearIntervalMs: 12 * 60 * 60_000,
  farIntervalMs: 12 * 60 * 60_000,
  actionableCacheMs: 30 * 60_000,
  leaseMs: 120_000,
});

export type BudgetReason = "MONTHLY_LIMIT" | "DAILY_LIMIT" | "DAILY_PACING" | "RESET_WINDOW";
export type CreditCounter = { used: number; outstanding: number; dayUsed: number };
export type ProviderUsage = { used: number; remaining: number };

export function utcCreditPeriod(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid budget clock");
  const day = now.toISOString().slice(0, 10);
  return { month: `${day.slice(0, 7)}-01`, day };
}

export function parseProviderUsage(headers: Headers): ProviderUsage {
  const integer = (name: string) => {
    const value = headers.get(name);
    if (value == null || !/^\d+$/.test(value)) throw new Error("Odds API usage headers unavailable");
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error("Odds API usage headers invalid");
    return number;
  };
  return { used: integer("x-requests-used"), remaining: integer("x-requests-remaining") };
}

/** Unknown/failed requests keep their full reservation; never refund on a timeout. */
export function decideCreditReservation(counter: CreditCounter, usage: ProviderUsage, now: Date) {
  const policy = ODDS_CREDIT_POLICY;
  for (const value of [counter.used, counter.outstanding, counter.dayUsed, usage.used, usage.remaining]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid credit accounting");
  }
  const used = Math.max(counter.used, usage.used + counter.outstanding);
  const elapsed = now.getTime() - Date.parse(`${utcCreditPeriod(now).day}T00:00:00Z`);
  const pacedAllowance = Math.min(
    policy.dailyCredits,
    Math.floor(policy.dailyCredits * elapsed / 86_400_000) + policy.burstCredits,
  );
  let reason: BudgetReason | null = null;
  // Do not begin a 12-second HTTP request near a day/month accounting rollover.
  if (elapsed >= 86_400_000 - 60_000) {
    reason = "RESET_WINDOW";
  } else if (used + policy.requestCredits > policy.monthlyCredits - policy.monthlyReserve
    || usage.remaining < policy.monthlyReserve + counter.outstanding + policy.requestCredits) {
    reason = "MONTHLY_LIMIT";
  } else if (counter.dayUsed + policy.requestCredits > policy.dailyCredits) {
    reason = "DAILY_LIMIT";
  } else if (counter.dayUsed + policy.requestCredits > pacedAllowance) {
    reason = "DAILY_PACING";
  }
  return {
    allowed: reason == null, reason, used,
    nextUsed: used + policy.requestCredits,
    nextDayUsed: counter.dayUsed + policy.requestCredits,
    pacedAllowance,
  };
}

export function oddsCollectionInterval(events: readonly unknown[], now: Date): number {
  const near = events.some((event) => {
    if (!event || typeof event !== "object" || !("commence_time" in event)) return false;
    const time = typeof event.commence_time === "string" ? Date.parse(event.commence_time) : NaN;
    return time > now.getTime() && time - now.getTime() <= ODDS_CREDIT_POLICY.nearKickoffMs;
  });
  return near ? ODDS_CREDIT_POLICY.nearIntervalMs : ODDS_CREDIT_POLICY.farIntervalMs;
}

export function isFreshCreditCache(fetchedAt: Date, now: Date): boolean {
  const age = now.getTime() - fetchedAt.getTime();
  return Number.isFinite(age) && age >= 0 && age < ODDS_CREDIT_POLICY.actionableCacheMs;
}
