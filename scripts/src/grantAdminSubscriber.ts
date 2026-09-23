import { db } from "@workspace/db";
import { subscribersTable } from "@workspace/db";

const ADMIN_USER_ID = "user_3GmXMcCGzqs1c5aD1snP08e7Frx";

async function grant() {
  await db
    .insert(subscribersTable)
    .values({
      userId: ADMIN_USER_ID,
      entitlement: "pro",
      isActive: true,
      expiresAt: new Date("2099-01-01"),
    })
    .onConflictDoUpdate({
      target: subscribersTable.userId,
      set: {
        isActive: true,
        entitlement: "pro",
        expiresAt: new Date("2099-01-01"),
      },
    });

  console.log("✅ Admin user inserted into subscribers table as active Pro");
  process.exit(0);
}

grant().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
