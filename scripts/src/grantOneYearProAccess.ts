import {
  getCustomer,
  grantCustomerEntitlement,
  listCustomerActiveEntitlements,
  listEntitlements,
} from "@replit/revenuecat-sdk";
import { getUncachableRevenueCatClient } from "./revenueCatClient.js";

const customerId = process.argv[2];
const configuredProjectId = process.env.REVENUECAT_PROJECT_ID;
const PRO_LOOKUP_KEY = "pro";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

if (!customerId) {
  throw new Error("Usage: pnpm --filter @workspace/scripts exec tsx src/grantOneYearProAccess.ts <customer_id>");
}

if (!configuredProjectId) {
  throw new Error("REVENUECAT_PROJECT_ID is not configured");
}

async function main() {
  const projectId = configuredProjectId!;
  const client = await getUncachableRevenueCatClient();

  const { data: customer, error: customerError } = await getCustomer({
    client,
    path: { project_id: projectId, customer_id: customerId },
  });
  if (customerError || !customer) {
    throw new Error(`RevenueCat customer lookup failed: ${JSON.stringify(customerError)}`);
  }

  const { data: entitlements, error: entitlementError } = await listEntitlements({
    client,
    path: { project_id: projectId },
    query: { limit: 100 },
  });
  if (entitlementError) {
    throw new Error(`RevenueCat entitlement lookup failed: ${JSON.stringify(entitlementError)}`);
  }

  const proEntitlement = entitlements?.items?.find(
    (entitlement) => entitlement.lookup_key === PRO_LOOKUP_KEY,
  );
  if (!proEntitlement) {
    throw new Error(`No active RevenueCat entitlement found with lookup key "${PRO_LOOKUP_KEY}"`);
  }
  if (proEntitlement.state !== "active") {
    throw new Error(`RevenueCat entitlement "${PRO_LOOKUP_KEY}" is not active`);
  }

  const before = await listCustomerActiveEntitlements({
    client,
    path: { project_id: projectId, customer_id: customerId },
  });
  if (before.error) {
    throw new Error(`Current entitlement lookup failed: ${JSON.stringify(before.error)}`);
  }

  const expiresAt = Date.now() + ONE_YEAR_MS;
  const { data: granted, error: grantError } = await grantCustomerEntitlement({
    client,
    path: { project_id: projectId, customer_id: customerId },
    body: {
      entitlement_id: proEntitlement.id,
      // RevenueCat Developer API expects milliseconds since epoch.
      expires_at: expiresAt,
    },
  });
  if (grantError || !granted) {
    throw new Error(`RevenueCat grant failed: ${JSON.stringify(grantError)}`);
  }

  const after = await listCustomerActiveEntitlements({
    client,
    path: { project_id: projectId, customer_id: customerId },
  });
  if (after.error) {
    throw new Error(`Post-grant entitlement lookup failed: ${JSON.stringify(after.error)}`);
  }

  const activePro = after.data?.items?.find(
    (entitlement) => entitlement.entitlement_id === proEntitlement.id,
  );
  if (!activePro) {
    throw new Error("Grant returned successfully, but the entitlement was not active on verification");
  }

  console.log(JSON.stringify({
    customerId,
    entitlement: proEntitlement.lookup_key,
    entitlementId: proEntitlement.id,
    previousActiveEntitlements: before.data?.items?.map((item) => item.entitlement_id) ?? [],
    expiresAt: new Date(expiresAt).toISOString(),
    verifiedActiveEntitlement: activePro.entitlement_id,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});