import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const fail = (message) => {
  console.error(`RELEASE PREFLIGHT FAILED: ${message}`);
  process.exitCode = 1;
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const render = await readFile("render.yaml", "utf8");
const app = await readJson("artifacts/mobile/app.json");
const eas = await readJson("artifacts/mobile/eas.json");
const packageJson = await readJson("package.json");

const exactHead = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const expectedSha = process.env.TBM_RELEASE_SHA?.trim();

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
if (eas.build?.production?.channel) {
  fail("The production EAS profile must not declare an OTA channel");
}
const productionDomain = eas.build?.production?.env?.EXPO_PUBLIC_DOMAIN;
const productionClerkProxy = eas.build?.production?.env?.EXPO_PUBLIC_CLERK_PROXY_URL;
if (!productionDomain || !/^[a-z0-9.-]+\.onrender\.com$/.test(productionDomain)) {
  fail("The production iOS build must explicitly target the verified Render host");
}
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
if (eas.cli?.appVersionSource !== "local") {
  fail("iOS version/build ownership must remain explicit and local");
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
    },
  }, null, 2));
}