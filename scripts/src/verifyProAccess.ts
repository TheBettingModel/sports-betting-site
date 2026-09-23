import {
  getCustomer,
  listCustomerActiveEntitlements,
  listEntitlements,
} from "@replit/revenuecat-sdk";
import { getUncachableRevenueCatClient } from "./revenueCatClient.js";

const customerId = process.argv[2];
const projectId = process.env.REVENUECAT_PROJECT_ID;

if (!customerId) {
  throw new Error("Usage: pnpm --filter @workspace/scripts exec tsx src/verifyProAccess.ts <customer_id>");
}

if (!projectId) {
  throw new Error("REVENUECAT_PROJECT_ID is not configured");
}

async function main() {
  const client = await getUncachableRevenueCatClient();
  const { data: customer, error: customerError } = await getCustomer({
    client,
    path: { project_id: projectId!, customer_id: customerId },
  });
  if (customerError || !customer) {
    throw new Error(`RevenueCat customer lookup failed: ${JSON.stringify(customerError)}`);
  }

  const { data: entitlementCatalog, error: catalogError } = await listEntitlements({
    client,
    path: { project_id: projectId!, },
    query: { limit: 100 },
  });
  if (catalogError) {
    throw new Error(`RevenueCat entitlement catalog lookup failed: ${JSON.stringify(catalogError)}`);
  }
  const proDefinition = entitlementCatalog?.items?.find(
    (item) => item.lookup_key === "pro",
  );
  if (!proDefinition) {
    throw new Error('RevenueCat entitlement catalog has no "pro" lookup key');
  }

  const { data: entitlements, error } = await listCustomerActiveEntitlements({
    client,
    path: { project_id: projectId!, customer_id: customerId },
  });
  if (error) {
    throw new Error(`RevenueCat entitlement lookup failed: ${JSON.stringify(error)}`);
  }

  const pro = entitlements?.items?.find(
    (item) => item.entitlement_id === proDefinition.id,
  );
  console.log(JSON.stringify({
    customerId,
    customerFound: Boolean(customer),
    proActive: Boolean(pro),
    proDefinitionId: proDefinition.id,
    proEntitlement: pro
      ? {
          entitlementId: pro.entitlement_id,
          expiresAt: pro.expires_at ?? null,
        }
      : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});