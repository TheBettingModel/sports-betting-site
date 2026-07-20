import { getUncachableRevenueCatClient } from "./revenueCatClient.js";
import {
  Duration,
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "TheBettingModel";

// Monthly plan
const MONTHLY_ID = "tbm_pro_monthly";
const MONTHLY_PLAY_ID = "tbm_pro_monthly:monthly";
const MONTHLY_DISPLAY = "TBM Pro Monthly";
const MONTHLY_DURATION = Duration.P1M;
const MONTHLY_PRICES = [
  { amount_micros: 9990000, currency: "USD" }, // $9.99/mo
  { amount_micros: 8990000, currency: "EUR" },
];

// Annual plan
const ANNUAL_ID = "tbm_pro_annual";
const ANNUAL_PLAY_ID = "tbm_pro_annual:annual";
const ANNUAL_DISPLAY = "TBM Pro Annual";
const ANNUAL_DURATION = Duration.P1Y;
const ANNUAL_PRICES = [
  { amount_micros: 79990000, currency: "USD" }, // $79.99/yr
  { amount_micros: 71990000, currency: "EUR" },
];

const APP_STORE_APP_NAME = "TheBettingModel iOS";
const APP_STORE_BUNDLE_ID = "com.thebettingmodel.ios";
const PLAY_STORE_APP_NAME = "TheBettingModel Android";
const PLAY_STORE_PACKAGE_NAME = "com.thebettingmodel.android";

const ENTITLEMENT_IDENTIFIER = "pro";
const ENTITLEMENT_DISPLAY_NAME = "TBM Pro Access";
const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "Default Offering";

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function ensureProduct(
  client: any,
  projectId: string,
  existingProducts: Product[],
  targetApp: App,
  label: string,
  storeId: string,
  isTestStore: boolean,
  displayName: string,
  duration: Duration,
): Promise<Product> {
  const existing = existingProducts.find(
    (p) => p.store_identifier === storeId && p.app_id === targetApp.id,
  );
  if (existing) {
    console.log(`${label} product exists:`, existing.id);
    return existing;
  }
  const body: CreateProductData["body"] = {
    store_identifier: storeId,
    app_id: targetApp.id,
    type: "subscription",
    display_name: displayName,
  };
  if (isTestStore) {
    body.subscription = { duration };
    body.title = displayName;
  }
  const { data, error } = await createProduct({
    client,
    path: { project_id: projectId },
    body,
  });
  if (error) throw new Error(`Failed to create ${label} product: ${JSON.stringify(error)}`);
  console.log(`Created ${label} product:`, data.id);
  return data;
}

async function seedRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  // ── Project ──────────────────────────────────────────────────────────────
  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjectsError)
    throw new Error("Failed to list projects: " + JSON.stringify(listProjectsError));

  const existingProject = existingProjects.items?.find((p) => p.name === PROJECT_NAME);
  if (existingProject) {
    console.log("Project already exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data, error } = await createProject({ client, body: { name: PROJECT_NAME } });
    if (error) throw new Error("Failed to create project: " + JSON.stringify(error));
    console.log("Created project:", data.id);
    project = data;
  }

  // ── Apps ─────────────────────────────────────────────────────────────────
  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError || !apps?.items.length) throw new Error("No apps found");

  const testApp = apps.items.find((a) => a.type === "test_store")!;
  if (!testApp) throw new Error("No test store app found");
  console.log("Test store app:", testApp.id);

  let appStoreApp: App | undefined = apps.items.find((a) => a.type === "app_store");
  let playStoreApp: App | undefined = apps.items.find((a) => a.type === "play_store");

  if (!appStoreApp) {
    const { data, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: APP_STORE_APP_NAME, type: "app_store", app_store: { bundle_id: APP_STORE_BUNDLE_ID } },
    });
    if (error) throw new Error("Failed to create App Store app: " + JSON.stringify(error));
    appStoreApp = data;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: PLAY_STORE_APP_NAME, type: "play_store", play_store: { package_name: PLAY_STORE_PACKAGE_NAME } },
    });
    if (error) throw new Error("Failed to create Play Store app: " + JSON.stringify(error));
    playStoreApp = data;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app:", playStoreApp.id);
  }

  // ── Products ─────────────────────────────────────────────────────────────
  const { data: existingProductsData, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error("Failed to list products");
  const existingProducts: Product[] = existingProductsData.items ?? [];

  // Monthly
  const testMonthly = await ensureProduct(client, project.id, existingProducts, testApp, "Test/Monthly", MONTHLY_ID, true, MONTHLY_DISPLAY, MONTHLY_DURATION);
  const appMonthly = await ensureProduct(client, project.id, existingProducts, appStoreApp, "iOS/Monthly", MONTHLY_ID, false, MONTHLY_DISPLAY, MONTHLY_DURATION);
  const playMonthly = await ensureProduct(client, project.id, existingProducts, playStoreApp, "Android/Monthly", MONTHLY_PLAY_ID, false, MONTHLY_DISPLAY, MONTHLY_DURATION);

  const { error: monthlyPriceErr } = await client.post<TestStorePricesResponse>({
    url: "/projects/{project_id}/products/{product_id}/test_store_prices",
    path: { project_id: project.id, product_id: testMonthly.id },
    body: { prices: MONTHLY_PRICES },
  });
  if (monthlyPriceErr && (monthlyPriceErr as any)?.type !== "resource_already_exists") {
    throw new Error("Failed to add monthly prices: " + JSON.stringify(monthlyPriceErr));
  }
  console.log("Monthly test store prices set");

  // Annual
  const testAnnual = await ensureProduct(client, project.id, existingProducts, testApp, "Test/Annual", ANNUAL_ID, true, ANNUAL_DISPLAY, ANNUAL_DURATION);
  const appAnnual = await ensureProduct(client, project.id, existingProducts, appStoreApp, "iOS/Annual", ANNUAL_ID, false, ANNUAL_DISPLAY, ANNUAL_DURATION);
  const playAnnual = await ensureProduct(client, project.id, existingProducts, playStoreApp, "Android/Annual", ANNUAL_PLAY_ID, false, ANNUAL_DISPLAY, ANNUAL_DURATION);

  const { error: annualPriceErr } = await client.post<TestStorePricesResponse>({
    url: "/projects/{project_id}/products/{product_id}/test_store_prices",
    path: { project_id: project.id, product_id: testAnnual.id },
    body: { prices: ANNUAL_PRICES },
  });
  if (annualPriceErr && (annualPriceErr as any)?.type !== "resource_already_exists") {
    throw new Error("Failed to add annual prices: " + JSON.stringify(annualPriceErr));
  }
  console.log("Annual test store prices set");

  // ── Entitlement ───────────────────────────────────────────────────────────
  let entitlement: Entitlement;
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const existingEntitlement = existingEntitlements.items?.find(
    (e) => e.lookup_key === ENTITLEMENT_IDENTIFIER,
  );
  if (existingEntitlement) {
    console.log("Entitlement exists:", existingEntitlement.id);
    entitlement = existingEntitlement;
  } else {
    const { data, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: ENTITLEMENT_IDENTIFIER, display_name: ENTITLEMENT_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create entitlement: " + JSON.stringify(error));
    console.log("Created entitlement:", data.id);
    entitlement = data;
  }

  const { error: attachEntErr } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: {
      product_ids: [
        testMonthly.id, appMonthly.id, playMonthly.id,
        testAnnual.id, appAnnual.id, playAnnual.id,
      ],
    },
  });
  if (attachEntErr && (attachEntErr as any).type !== "unprocessable_entity_error") {
    throw new Error("Failed to attach products to entitlement: " + JSON.stringify(attachEntErr));
  }
  console.log("Products attached to entitlement");

  // ── Offering ──────────────────────────────────────────────────────────────
  let offering: Offering;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error("Failed to list offerings");

  const existingOffering = existingOfferings.items?.find(
    (o) => o.lookup_key === OFFERING_IDENTIFIER,
  );
  if (existingOffering) {
    console.log("Offering exists:", existingOffering.id);
    offering = existingOffering;
  } else {
    const { data, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: OFFERING_IDENTIFIER, display_name: OFFERING_DISPLAY_NAME },
    });
    if (error) throw new Error("Failed to create offering: " + JSON.stringify(error));
    console.log("Created offering:", data.id);
    offering = data;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering current: " + JSON.stringify(error));
    console.log("Set offering as current");
  }

  // ── Packages ─────────────────────────────────────────────────────────────
  const { data: existingPkgs, error: listPkgsError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 20 },
  });
  if (listPkgsError) throw new Error("Failed to list packages");

  const ensurePkg = async (lookupKey: string, displayName: string): Promise<Package> => {
    const existing = existingPkgs.items?.find((p) => p.lookup_key === lookupKey);
    if (existing) { console.log(`Package ${lookupKey} exists:`, existing.id); return existing; }
    const { data, error } = await createPackages({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { lookup_key: lookupKey, display_name: displayName },
    });
    if (error) throw new Error(`Failed to create package ${lookupKey}: ` + JSON.stringify(error));
    console.log(`Created package ${lookupKey}:`, data.id);
    return data;
  };

  const monthlyPkg = await ensurePkg("$rc_monthly", "Monthly");
  const annualPkg = await ensurePkg("$rc_annual", "Annual");

  const attachPkg = async (pkg: Package, products: Product[]) => {
    const { error } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: { products: products.map((p) => ({ product_id: p.id, eligibility_criteria: "all" as const })) },
    });
    if (error && !(error as any).message?.includes("Cannot attach product")) {
      throw new Error(`Failed to attach to ${pkg.lookup_key}: ` + JSON.stringify(error));
    }
    console.log(`Attached products to package ${pkg.lookup_key}`);
  };

  await attachPkg(monthlyPkg, [testMonthly, appMonthly, playMonthly]);
  await attachPkg(annualPkg, [testAnnual, appAnnual, playAnnual]);

  // ── API Keys ──────────────────────────────────────────────────────────────
  const [testKeys, appKeys, playKeys] = await Promise.all([
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: testApp.id } }),
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: appStoreApp.id } }),
    listAppPublicApiKeys({ client, path: { project_id: project.id, app_id: playStoreApp.id } }),
  ]);

  const testKey = testKeys.data?.items[0]?.key ?? "";
  const iosKey = appKeys.data?.items[0]?.key ?? "";
  const androidKey = playKeys.data?.items[0]?.key ?? "";

  console.log("\n====================");
  console.log("RevenueCat setup complete!");
  console.log("Project ID:", project.id);
  console.log("Test Store App ID:", testApp.id);
  console.log("App Store App ID:", appStoreApp.id);
  console.log("Play Store App ID:", playStoreApp.id);
  console.log("Entitlement Identifier:", ENTITLEMENT_IDENTIFIER);
  console.log("Test Store API Key:", testKey);
  console.log("App Store API Key:", iosKey);
  console.log("Play Store API Key:", androidKey);
  console.log("====================\n");
  console.log("REVENUECAT_PROJECT_ID=" + project.id);
  console.log("REVENUECAT_TEST_STORE_APP_ID=" + testApp.id);
  console.log("REVENUECAT_APPLE_APP_STORE_APP_ID=" + appStoreApp.id);
  console.log("REVENUECAT_GOOGLE_PLAY_STORE_APP_ID=" + playStoreApp.id);
  console.log("EXPO_PUBLIC_REVENUECAT_TEST_API_KEY=" + testKey);
  console.log("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=" + iosKey);
  console.log("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=" + androidKey);
}

seedRevenueCat().catch(console.error);
