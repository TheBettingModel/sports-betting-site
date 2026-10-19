import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getProductionApiUrl } = require("../artifacts/mobile/scripts/mobile-api-domain.cjs");

const mobileInputPaths = [
  "artifacts/mobile",
  "lib/api-client-react",
  "lib/api-spec",
  "lib/api-zod",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "patches",
];

const fail = (message) => {
  console.error(`RELEASE PREFLIGHT FAILED: ${message}`);
  process.exitCode = 1;
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const render = await readFile("render.yaml", "utf8");
const app = await readJson("artifacts/mobile/app.json");
const packageJson = await readJson("package.json");

const exactHead = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const expectedSha = process.env.TBM_RELEASE_SHA?.trim();
const args = process.argv.slice(2);
const mobileInputCommit = args.length === 2 && args[0] === "--mobile-input-commit"
  ? args[1]
  : null;

if (args.length && !mobileInputCommit) {
  fail("Usage: release:preflight [--mobile-input-commit <40-character Git SHA>]");
}
if (mobileInputCommit && !/^[a-f0-9]{40}$/.test(mobileInputCommit)) {
  fail("--mobile-input-commit must be a full Git commit SHA");
}

const mobileSourceTree = execFileSync("git", ["rev-parse", "HEAD:artifacts/mobile"], {
  encoding: "utf8",
}).trim();
const dirtyInputs = execFileSync("git", [
  "status", "--porcelain", "--untracked-files=all", "--", ...mobileInputPaths,
], { encoding: "utf8" }).trim();
if (dirtyInputs) {
  fail("Mobile release inputs have uncommitted changes; commit and review them before building");
}
if (mobileInputCommit && /^[a-f0-9]{40}$/.test(mobileInputCommit)) {
  try {
    execFileSync("git", [
      "diff", "--quiet", mobileInputCommit, "HEAD", "--", ...mobileInputPaths,
    ], { stdio: "ignore" });
  } catch {
    fail(`Mobile release inputs differ from reviewed commit ${mobileInputCommit}, or it is unavailable locally`);
  }
}

if (expectedSha && expectedSha !== exactHead) {
  fail(`TBM_RELEASE_SHA ${expectedSha} does not match HEAD ${exactHead}`);
}
if (!/autoDeploy:\s*false/.test(render)) {
  fail("Render must require an explicit deploy");
}
if (!/healthCheckPath:\s*\/api\/readyz/.test(render)) {
  fail("Render API must check database and schema readiness, not just process health");
}
if (!/key:\s*SCHEDULER_ENABLED\s*\n\s*value:\s*"false"/.test(render)) {
  fail("Render API must keep its in-process scheduler disabled");
}
if ((render.match(/key:\s*TBM_RELEASE_SHA/g) ?? []).length !== 2) {
  fail("Render API and scheduler must both receive TBM_RELEASE_SHA");
}
if ((render.match(/key:\s*TBM_DATABASE_TARGET_ID/g) ?? []).length !== 2) {
  fail("Render API and scheduler must both receive TBM_DATABASE_TARGET_ID");
}
if ((render.match(/key:\s*TBM_ENFORCE_RELEASE_ID/g) ?? []).length !== 2) {
  fail("Render API and scheduler must both enforce release identity");
}
if (app.expo?.updates || app.expo?.runtimeVersion) {
  fail("Expo OTA code delivery is prohibited; use a reviewed store build");
}
if (!/^[1-9]\d*$/.test(String(app.expo?.ios?.buildNumber ?? ""))) {
  fail("iOS build number must be a positive integer in app.json");
}
try {
  await readFile("artifacts/mobile/eas.json");
  fail("Replit Support requires eas.json to be absent from the publishing source");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let productionApiUrl;
let productionDomain;
try {
  productionApiUrl = getProductionApiUrl();
  productionDomain = new URL(productionApiUrl).hostname;
  if (productionApiUrl !== "https://tbm-api-v4-candidate.onrender.com") {
    fail("EXPO_PUBLIC_API_URL must target the verified Render production API");
  }
} catch (error) {
  fail(error.message);
}
const productionClerkProxy = process.env.EXPO_PUBLIC_CLERK_PROXY_URL ||
  (productionApiUrl && `${productionApiUrl}/api/__clerk`);
try {
  const proxy = new URL(productionClerkProxy);
  if (
    proxy.protocol !== "https:" ||
    proxy.hostname !== productionDomain ||
    proxy.pathname !== "/api/__clerk" ||
    proxy.search ||
    proxy.hash
  ) {
    fail("The production Clerk proxy must use /api/__clerk on the same Render host");
  }
} catch {
  fail("The production Clerk proxy URL is missing or invalid");
}
if (!packageJson.scripts?.["release:preflight"]) {
  fail("package.json must expose release:preflight");
}

if (!process.exitCode) {
  console.log(JSON.stringify({
    status: "PASS",
    sourceCommit: exactHead,
    render: {
      explicitDeploy: true,
      apiSchedulerDisabled: true,
      sharedReleaseIdentityRequired: true,
      sharedDatabaseTargetIdentityRequired: true,
    },
    mobile: {
      delivery: "APP_STORE_BUILD_ONLY",
      appVersion: app.expo.version,
      iosBuildNumber: app.expo.ios?.buildNumber,
      easProjectId: app.expo.extra?.eas?.projectId,
      apiUrl: productionApiUrl,
      clerkProxyUrl: productionClerkProxy,
      publishingPipeline: "REPLIT_EXPO_LAUNCH",
      storeReviewSubmission: "REQUIRES_OWNER_APPROVAL",
      sourceTree: mobileSourceTree,
      comparedWithCommit: mobileInputCommit,
    },
  }, null, 2));
}