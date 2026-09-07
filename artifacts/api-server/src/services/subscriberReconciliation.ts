/**
 * Subscriber Reconciliation Service
 *
 * Calls the RevenueCat REST API to reconcile subscriber status for rows where
 * `expires_at` is in the past but `is_active` is still true. This catches
 * any webhook deliveries that were dropped at expiration time, which would
 * otherwise leave a user permanently marked active after their subscription lapses.
 */

import { createClient } from "@replit/revenuecat-sdk/client";
import { listCustomerActiveEntitlements } from "@replit/revenuecat-sdk";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { lt, and, eq, isNotNull } from "drizzle-orm";
import { db, subscribersTable } from "@workspace/db";
import { logger } from "../lib/logger";

const PRO_ENTITLEMENT = "pro";

/**
 * The RevenueCat project ID — set via REVENUECAT_PROJECT_ID env var.
 * Seeded during initial setup (scripts/src/seedRevenueCat.ts prints the value).
 */
const PROJECT_ID = process.env["REVENUECAT_PROJECT_ID"] ?? "";

/**
 * Creates a fresh authenticated RevenueCat client via Replit's connectors proxy.
 * Mirrors the pattern in scripts/src/revenueCatClient.ts.
 */
async function getRevenueCatClient() {
  const connectors = new ReplitConnectors();

  return createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      const path = url.pathname + url.search;

      let body: string | undefined;
      if (request.method !== "GET" && request.method !== "HEAD") {
        const text = await request.text();
        if (text) body = text;
      }

      const extraHeaders: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "host") {
          extraHeaders[key] = value;
        }
      });

      return connectors.proxy("revenuecat", path, {
        method: request.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        headers: extraHeaders,
        body,
      }) as unknown as Response;
    },
  });
}

/**
 * Check whether a given RevenueCat customer currently holds an active "pro"
 * entitlement. Returns true if they do, false if not or on any API error
 * (fail-open: we only revoke when we have a confirmed negative response).
 */
async function hasActiveProEntitlement(
  client: Awaited<ReturnType<typeof getRevenueCatClient>>,
  customerId: string,
): Promise<boolean | "error"> {
  try {
    const { data, error } = await listCustomerActiveEntitlements({
      client,
      path: { project_id: PROJECT_ID, customer_id: customerId },
    });

    if (error) {
      logger.warn(
        { customerId, error },
        "SubscriberReconciliation: RevenueCat API error checking entitlements",
      );
      return "error";
    }

    const items = data?.items ?? [];
    return items.some((e) => e.entitlement_id === PRO_ENTITLEMENT);
  } catch (err) {
    logger.warn(
      { customerId, err },
      "SubscriberReconciliation: unexpected error checking entitlements",
    );
    return "error";
  }
}

export async function getVerifiedProEntitlement(
  customerId: string,
): Promise<{ isActive: boolean; expiresAt: Date | null }> {
  if (!PROJECT_ID) {
    throw new Error("REVENUECAT_PROJECT_ID is not configured");
  }

  const client = await getRevenueCatClient();
  const { data, error } = await listCustomerActiveEntitlements({
    client,
    path: { project_id: PROJECT_ID, customer_id: customerId },
  });
  if (error) {
    throw new Error("RevenueCat entitlement verification failed");
  }

  const entitlement = data?.items?.find(
    (item) => item.entitlement_id === PRO_ENTITLEMENT,
  );
  return {
    isActive: Boolean(entitlement),
    expiresAt: entitlement?.expires_at
      ? new Date(entitlement.expires_at)
      : null,
  };
}

export interface ReconcileResult {
  checked: number;
  revoked: number;
  errors: number;
}

/**
 * Reconcile subscriber status against RevenueCat.
 *
 * Queries for rows where `is_active = true` AND `expires_at < now()`, then
 * verifies each against the RevenueCat API. Any that lack an active "pro"
 * entitlement are flipped to `is_active = false`.
 *
 * Skips (logs a warning, returns early) when REVENUECAT_PROJECT_ID is unset
 * so the job is a safe no-op until the env var is configured.
 */
export async function reconcileSubscriberStatus(): Promise<ReconcileResult> {
  if (!PROJECT_ID) {
    logger.warn(
      "SubscriberReconciliation: REVENUECAT_PROJECT_ID is not set — skipping reconciliation. " +
        "Run scripts/src/seedRevenueCat.ts and set this env var.",
    );
    return { checked: 0, revoked: 0, errors: 0 };
  }

  const now = new Date();

  // Find subscribers whose expiry has passed but are still marked active.
  // NULL expires_at rows are skipped — they may be lifetime grants.
  const lapsedRows = await db
    .select({ userId: subscribersTable.userId })
    .from(subscribersTable)
    .where(
      and(
        eq(subscribersTable.isActive, true),
        isNotNull(subscribersTable.expiresAt),
        lt(subscribersTable.expiresAt, now),
      ),
    );

  if (lapsedRows.length === 0) {
    logger.info("SubscriberReconciliation: no lapsed-but-active subscribers found");
    return { checked: 0, revoked: 0, errors: 0 };
  }

  logger.info(
    { count: lapsedRows.length },
    "SubscriberReconciliation: checking lapsed-but-active subscribers against RevenueCat",
  );

  const client = await getRevenueCatClient();
  let revoked = 0;
  let errors = 0;

  for (const { userId } of lapsedRows) {
    const result = await hasActiveProEntitlement(client, userId);

    if (result === "error") {
      errors++;
      continue; // fail-open: don't revoke on API errors
    }

    if (result === true) {
      // RevenueCat still shows an active entitlement — the local expires_at
      // may be stale. Leave is_active as true and let the next webhook update it.
      logger.info(
        { userId },
        "SubscriberReconciliation: RevenueCat shows active entitlement, skipping revoke",
      );
      continue;
    }

    // result === false: confirmed no active pro entitlement — revoke locally
    await db
      .update(subscribersTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(subscribersTable.userId, userId));

    revoked++;
    logger.info(
      { userId },
      "SubscriberReconciliation: revoked is_active — no active pro entitlement in RevenueCat",
    );
  }

  logger.info(
    { checked: lapsedRows.length, revoked, errors },
    "SubscriberReconciliation: reconciliation complete",
  );

  return { checked: lapsedRows.length, revoked, errors };
}
