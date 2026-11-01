import { randomUUID } from "node:crypto";
import {
  decideCreditReservation, isFreshCreditCache, oddsCollectionInterval,
  ODDS_CREDIT_POLICY, utcCreditPeriod, type ProviderUsage,
} from "./oddsCreditPolicy";

type Row = Record<string, unknown>;
type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Row[] }> };
export type CreditPool = Queryable & {
  connect: () => Promise<Queryable & { release: () => void }>;
};
export type OddsCache = { events: unknown[]; fetchedAt: Date };
export type CreditAdmission =
  | { kind: "cached"; cache: OddsCache }
  | { kind: "denied"; reason: string }
  | { kind: "reserved"; leaseId: string; month: string };

export class OddsCreditStore {
  constructor(private readonly pool: CreditPool) {}

  private cache(row: Row | undefined, now: Date, allowCached: boolean): OddsCache | null {
    if (!allowCached || !row?.fetched_at || !Array.isArray(row.payload)) return null;
    const fetchedAt = row.fetched_at instanceof Date ? row.fetched_at : new Date(String(row.fetched_at));
    return isFreshCreditCache(fetchedAt, now) ? { events: row.payload, fetchedAt } : null;
  }

  /** API readers never create counter rows, reserve credits, or update a lease. */
  async read(scope: string, feed: string, now: Date): Promise<OddsCache | null> {
    const { rows } = await this.pool.query(
      "SELECT payload, fetched_at FROM odds_api_collection_state WHERE scope=$1 AND feed=$2",
      [scope, feed],
    );
    return this.cache(rows[0], now, true);
  }

  async acquire(input: {
    scope: string; feed: string; now: Date; usage: ProviderUsage; allowCached: boolean;
  }): Promise<CreditAdmission> {
    const { scope, feed, now, usage, allowCached } = input;
    const { month, day } = utcCreditPeriod(now);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query(`INSERT INTO odds_api_credit_state(scope,month,day,updated_at)
        VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [scope, month, day, now]);
      // Every paid path takes the same per-key lock, always before the feed lock.
      const { rows: counters } = await client.query(
        "SELECT *,month::text AS month,day::text AS day FROM odds_api_credit_state WHERE scope=$1 FOR UPDATE", [scope],
      );
      const counter = counters[0]!;
      const sameMonth = String(counter.month).slice(0, 10) === month;
      const sameDay = sameMonth && String(counter.day).slice(0, 10) === day;
      const used = sameMonth ? Number(counter.used) : 0;
      const outstanding = sameMonth ? Number(counter.outstanding) : 0;
      const dayUsed = sameDay ? Number(counter.day_used) : 0;
      const providerUsed = sameMonth ? Math.max(Number(counter.provider_used), usage.used) : usage.used;
      const remaining = sameMonth ? Math.min(Number(counter.provider_remaining), usage.remaining) : usage.remaining;
      // Persist free status observations even when no paid request is admitted.
      // A pricing fault is deliberately not cleared by a month rollover.
      await client.query(`UPDATE odds_api_credit_state SET month=$2,day=$3,used=$4,
        outstanding=$5,day_used=$6,provider_used=$7,provider_remaining=$8,updated_at=$9
        WHERE scope=$1`, [
        scope, month, day, Math.max(used, providerUsed + outstanding),
        outstanding, dayUsed, providerUsed, remaining, now,
      ]);
      await client.query(`INSERT INTO odds_api_collection_state(scope,feed,next_allowed_at)
        VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [scope, feed, now]);
      const { rows } = await client.query(
        "SELECT * FROM odds_api_collection_state WHERE scope=$1 AND feed=$2 FOR UPDATE", [scope, feed],
      );
      const row = rows[0]!;
      const cache = this.cache(row, now, allowCached);
      const deny = (reason: string): CreditAdmission =>
        cache ? { kind: "cached", cache } : { kind: "denied", reason };
      let admission: CreditAdmission;
      if (counter.pricing_fault === true) {
        admission = deny("PROVIDER_PRICING_CHANGED");
      } else if (row.lease_id && row.lease_until && new Date(String(row.lease_until)) > now) {
        admission = deny("COLLECTION_IN_FLIGHT");
      } else if (new Date(String(row.next_allowed_at)) > now) {
        admission = deny("COLLECTION_NOT_DUE");
      } else {
        const decision = decideCreditReservation(
          { used, outstanding, dayUsed }, { used: providerUsed, remaining }, now,
        );
        if (!decision.allowed) {
          admission = deny(decision.reason!);
        } else {
          const leaseId = randomUUID();
          await client.query(`UPDATE odds_api_credit_state SET month=$2,day=$3,used=$4,
            outstanding=$5,day_used=$6,provider_used=$7,provider_remaining=$8,updated_at=$9
            WHERE scope=$1`, [
            scope, month, day, decision.nextUsed, outstanding + ODDS_CREDIT_POLICY.requestCredits,
            decision.nextDayUsed, providerUsed, remaining, now,
          ]);
          // A crash after this COMMIT cannot erase the credit reservation.
          await client.query(`UPDATE odds_api_collection_state SET lease_id=$3,lease_until=$4,
            next_allowed_at=$5 WHERE scope=$1 AND feed=$2`, [
            scope, feed, leaseId, new Date(now.getTime() + ODDS_CREDIT_POLICY.leaseMs),
            new Date(now.getTime() + oddsCollectionInterval([], now)),
          ]);
          admission = { kind: "reserved", leaseId, month };
        }
      }
      await client.query("COMMIT");
      return admission;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async finish(input: {
    scope: string; feed: string; leaseId: string; month: string; now: Date;
    events?: unknown[]; usage?: ProviderUsage; actualCost?: number; failureBackoffMs?: number;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SELECT scope FROM odds_api_credit_state WHERE scope=$1 FOR UPDATE", [input.scope]);
      // Failures and interrupted runs must not bypass the twice-daily cadence.
      const nextAllowed = new Date(input.now.getTime() + Math.max(oddsCollectionInterval([], input.now),
        input.events ? oddsCollectionInterval(input.events, input.now)
          : input.failureBackoffMs ?? ODDS_CREDIT_POLICY.nearIntervalMs
      ));
      const { rows } = await client.query(`UPDATE odds_api_collection_state
        SET next_allowed_at=$4,lease_id=NULL,lease_until=NULL,
          payload=CASE WHEN $5::jsonb IS NULL THEN payload ELSE $5::jsonb END,
          fetched_at=CASE WHEN $5::jsonb IS NULL THEN fetched_at ELSE $6 END
        WHERE scope=$1 AND feed=$2 AND lease_id=$3 RETURNING scope`, [
        input.scope, input.feed, input.leaseId, nextAllowed,
        input.events ? JSON.stringify(input.events) : null, input.now,
      ]);
      // A late completion must not release somebody else's reservation or cache.
      if (rows.length) {
        const extra = Math.max(0, (input.actualCost ?? ODDS_CREDIT_POLICY.requestCredits)
          - ODDS_CREDIT_POLICY.requestCredits);
        await client.query(`UPDATE odds_api_credit_state SET
          used=GREATEST(used+$2,COALESCE($3,0)+GREATEST(0,outstanding-$5)),
          day_used=day_used+$2,
          outstanding=GREATEST(0,outstanding-$5),
          provider_used=GREATEST(provider_used,COALESCE($3,0)),
          provider_remaining=LEAST(provider_remaining,COALESCE($4,provider_remaining)),
          pricing_fault=pricing_fault OR $8,
          updated_at=$6 WHERE scope=$1 AND month=$7`, [
          input.scope, extra, input.usage?.used ?? null, input.usage?.remaining ?? null,
          ODDS_CREDIT_POLICY.requestCredits, input.now, input.month, extra > 0,
        ]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

let defaultStore: Promise<OddsCreditStore> | undefined;
/** Lazy: importing policy/transport cannot instantiate a production DB pool. */
export function getOddsCreditStore(): Promise<OddsCreditStore> {
  return defaultStore ??= import("@workspace/db").then(({ pool }) => new OddsCreditStore(pool));
}
