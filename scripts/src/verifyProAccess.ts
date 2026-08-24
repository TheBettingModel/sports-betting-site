import {
  getCustomer,
  listCustomerActiveEntitlements,
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

  const { data: entitlements, error } = await listCustomerActiveEntitlements({
    client,
    path: { project_id: projectId!, customer_id: customerId },
  });
  if (error) {
    throw new Error(`RevenueCat entitlement lookup failed: ${JSON.stringify(error)}`);
  }

  const pro = entitlements?.items?.find((item) => item.entitlement_id === "pro");
  console.log(JSON.stringify({
    customerId,
    customerFound: Boolean(customer),
    proActive: Boolean(pro),
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