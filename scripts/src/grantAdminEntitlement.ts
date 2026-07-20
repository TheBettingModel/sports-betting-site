import { getUncachableRevenueCatClient } from "./revenueCatClient.js";
import { grantCustomerEntitlement } from "@replit/revenuecat-sdk";

const PROJECT_ID = "projba2ee534";
const CUSTOMER_ID = "user_3GmXMcCGzqs1c5aD1snP08e7Frx";
const ENTITLEMENT_IDENTIFIER = "pro";

async function grant() {
  const client = await getUncachableRevenueCatClient();

  const { data, error } = await grantCustomerEntitlement({
    client,
    path: {
      project_id: PROJECT_ID,
      customer_id: CUSTOMER_ID,
      entitlement_identifier: ENTITLEMENT_IDENTIFIER,
    },
    body: {
      entitlement_id: "entlb213906c27",
      expires_at: Math.floor(new Date("2099-01-01").getTime() / 1000), // Unix timestamp, effectively permanent
    },
  });

  if (error) {
    console.error("Failed:", JSON.stringify(error, null, 2));
    process.exit(1);
  }

  console.log("✅ Pro entitlement granted to", CUSTOMER_ID);
  console.log(JSON.stringify(data, null, 2));
}

grant().catch(console.error);
