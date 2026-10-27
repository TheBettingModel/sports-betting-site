import { createHash } from "node:crypto";
import { logger } from "../lib/logger";
import { ODDS_CREDIT_POLICY, parseProviderUsage, utcCreditPeriod, type ProviderUsage } from "./oddsCreditPolicy";
import { getOddsCreditStore, type OddsCache, type OddsCreditStore } from "./oddsCreditStore";

export class OddsCollectionDeferred extends Error {
  constructor(public readonly reason: string) {
    super(`Odds API collection deferred: ${reason}`);
    this.name = "OddsCollectionDeferred";
  }
}

type TransportOptions = {
  apiKey: string;
  feed: string;
  /** Audit ledgers may not relabel a cached receipt as a new provider capture. */
  allowCached?: boolean;
};
type Dependencies = {
  fetch: typeof fetch;
  now: () => Date;
  collectorEnabled: () => boolean;
  store: () => Promise<Pick<OddsCreditStore, "read" | "acquire" | "finish">>;
};

/** Injectable for offline tests. No HTTP or DB access until a request is made. */
export function createBudgetedOddsTransport(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    fetch: (...args) => fetch(...args),
    now: () => new Date(),
    collectorEnabled: () => process.env.ODDS_API_COLLECTION_ENABLED === "true",
    store: getOddsCreditStore,
    ...overrides,
  };
  const usageCache = new Map<string, { at: Date; promise: Promise<ProviderUsage> }>();
  async function usage(apiKey: string, scope: string): Promise<ProviderUsage> {
    const now = dependencies.now();
    const cached = usageCache.get(scope);
    if (cached && utcCreditPeriod(cached.at).month === utcCreditPeriod(now).month
      && now.getTime() - cached.at.getTime() < 15 * 60_000) return cached.promise;
    // This endpoint is explicitly zero-credit. Never bootstrap by spending a credit.
    const promise = (async () => {
      const url = new URL("https://api.the-odds-api.com/v4/sports/");
      url.searchParams.set("apiKey", apiKey);
      const response = await dependencies.fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new OddsCollectionDeferred(`USAGE_CHECK_HTTP_${response.status}`);
      await response.body?.cancel();
      return parseProviderUsage(response.headers);
    })();
    usageCache.set(scope, { at: now, promise });
    // Keep a failed probe cached too: no repeated probe loop on a large slate.
    return promise;
  }
  return async function fetchBudgetedOdds(options: TransportOptions): Promise<OddsCache> {
    if (!options.apiKey) throw new OddsCollectionDeferred("API_KEY_MISSING");
    if (!/^[a-z0-9_]+$/.test(options.feed)) throw new OddsCollectionDeferred("INVALID_FEED");
    // A one-way key fingerprint coordinates all services without storing credentials.
    const scope = createHash("sha256").update(options.apiKey).digest("hex");
    const allowCached = options.allowCached !== false;
    const store = await dependencies.store();
    if (!dependencies.collectorEnabled()) {
      const cached = allowCached ? await store.read(scope, options.feed, dependencies.now()) : null;
      if (cached) return cached;
      throw new OddsCollectionDeferred("COLLECTOR_DISABLED_OR_NO_FRESH_CACHE");
    }
    const providerUsage = await usage(options.apiKey, scope);
    const admission = await store.acquire({
      scope, feed: options.feed, now: dependencies.now(), usage: providerUsage, allowCached,
    });
    if (admission.kind === "cached") return admission.cache;
    if (admission.kind === "denied") {
      logger.info({ feed: options.feed, reason: admission.reason }, "OddsAPI: budget/cadence deferred");
      throw new OddsCollectionDeferred(admission.reason);
    }
    let completed = false;
    try {
      const url = new URL(`https://api.the-odds-api.com/v4/sports/${options.feed}/odds/`);
      url.searchParams.set("apiKey", options.apiKey);
      url.searchParams.set("regions", "us,eu");
      url.searchParams.set("markets", "h2h,spreads,totals");
      url.searchParams.set("oddsFormat", "american");
      const response = await dependencies.fetch(url.toString(), {
        headers: { "User-Agent": "TheBettingModel/2.0" },
        signal: AbortSignal.timeout(12_000),
      });
      const receiptUsage = parseProviderUsage(response.headers);
      const rawCost = response.headers.get("x-requests-last");
      const actualCost = rawCost && /^\d+$/.test(rawCost) ? Number(rawCost) : undefined;
      if (!response.ok) {
        await response.body?.cancel();
        completed = true;
        await store.finish({
          scope, feed: options.feed, leaseId: admission.leaseId, month: admission.month, now: dependencies.now(),
          usage: receiptUsage, actualCost,
          failureBackoffMs: response.status === 401 || response.status === 429
            ? ODDS_CREDIT_POLICY.farIntervalMs : ODDS_CREDIT_POLICY.nearIntervalMs,
        });
        // Do not put a raw provider body/URL in logs; it can echo API credentials.
        throw new OddsCollectionDeferred(`PROVIDER_HTTP_${response.status}`);
      }
      const events: unknown = await response.json();
      if (!Array.isArray(events)) throw new OddsCollectionDeferred("INVALID_PROVIDER_PAYLOAD");
      if (actualCost != null && actualCost > ODDS_CREDIT_POLICY.requestCredits) {
        completed = true;
        await store.finish({
          scope, feed: options.feed, leaseId: admission.leaseId, month: admission.month,
          now: dependencies.now(), usage: receiptUsage, actualCost,
          failureBackoffMs: ODDS_CREDIT_POLICY.farIntervalMs,
        });
        throw new OddsCollectionDeferred("PROVIDER_PRICING_CHANGED");
      }
      const fetchedAt = dependencies.now();
      completed = true;
      await store.finish({
        scope, feed: options.feed, leaseId: admission.leaseId, month: admission.month,
        now: fetchedAt, events, usage: receiptUsage, actualCost,
      });
      logger.info({
        feed: options.feed, remaining: receiptUsage.remaining, used: receiptUsage.used,
        reservedCost: ODDS_CREDIT_POLICY.requestCredits, actualCost,
      }, "OddsAPI: budgeted collection completed");
      return { events, fetchedAt };
    } catch (error) {
      if (!completed) {
        // Never retry/refund an uncertain paid call. A failed finish leaves the
        // committed lease/reservation intact, which is conservative after a crash.
        await store.finish({
          scope, feed: options.feed, leaseId: admission.leaseId, month: admission.month, now: dependencies.now(),
        }).catch(() => undefined);
      }
      if (error instanceof OddsCollectionDeferred) throw error;
      throw new OddsCollectionDeferred("COLLECTION_FAILED"); // no fetch URL/cause leakage
    }
  };
}

export const fetchBudgetedOdds = createBudgetedOddsTransport();
