/**
 * Offline identity audit of SELECT-only exported metadata. No database requests,
 * board requests, inference writes, repairs, or deployment operations.
 * Usage: pnpm exec tsx scripts/verify-ncaaf-event-identity.ts /tmp/cohort.json
 */
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { latestNcaafEventSnapshots, resolveNcaafEventIdentity, verifyNcaafEventAssociation } from "../src/services/ncaafEventIdentity";
import { safeCurrentMarketSnapshot } from "../src/services/ncaafV4GameDay";

const file = process.argv[2];
if (!file) throw new Error("Supply a SELECT-only metadata export path");
const now = new Date("2026-10-03T17:45:44.159Z");
const records = JSON.parse(readFileSync(file, "utf8")).map((row: any) => ({
  ...row, kickoffAt: new Date(row.kickoffAt), dataCutoffAt: new Date(row.dataCutoffAt),
  evidence: row.evidence && { ...row.evidence, kickoffAt: new Date(row.evidence.kickoffAt), capturedAt: new Date(row.evidence.capturedAt) },
  game: row.game && { ...row.game, startsAt: row.game.startsAt && new Date(row.game.startsAt) },
  markets: (row.markets ?? []).map((market: any) => ({ ...market, capturedAt: new Date(market.capturedAt) })),
}));
const selected = latestNcaafEventSnapshots(records);
const projections = selected.filter(row => row.projected);
const keys = projections.map(row => resolveNcaafEventIdentity(row.targetProvider, row.targetEventId)!.key);
assert.equal(keys.length, new Set(keys).size, "Physical fixture aliases survived selection");
const conflicts: { event: string; reason: string }[] = [];
let named = 0, matched = 0, reversals = 0;
for (const snapshot of projections) {
  const association = verifyNcaafEventAssociation(snapshot, snapshot.evidence ? [snapshot.evidence] : [], snapshot.game ? [snapshot.game] : []);
  if (!association.verified) {
    conflicts.push({ event: snapshot.targetEventId, reason: association.reason });
    continue;
  }
  named++;
  if (association.game.homeProviderTeamId !== snapshot.homeProviderTeamId
    || association.game.awayProviderTeamId !== snapshot.awayProviderTeamId) reversals++;
  const rows = snapshot.ambiguousMarkets ? [...snapshot.markets, {
    ...snapshot.markets[0], gameEvidenceId: association.game.id, marketIdentityStatus: "unmatched_ambiguous", isMatchedToGame: false,
  }] : snapshot.markets;
  if (safeCurrentMarketSnapshot(rows, association.game, now).rootCause === "SAFE_MATCH") matched++;
}
assert.equal(reversals, 0, "Ordered home/away identity reversed");
const previouslyDuplicated = ["401858247", "401858477", "401860898", "401860899", "401860900", "401860921", "401864513", "401864515"];
const latestCutoffs = previouslyDuplicated.map(event => {
  const row = projections.find(snapshot => resolveNcaafEventIdentity(snapshot.targetProvider, snapshot.targetEventId)?.providerEventId === event);
  assert(row, `Missing former duplicate ${event}`);
  assert.equal(row.dataCutoffAt.toISOString(), "2026-10-03T17:31:54.693Z", `Old alias won for ${event}`);
  return { event, selectedSnapshot: row.id, cutoff: row.dataCutoffAt.toISOString() };
});
console.log(JSON.stringify({
  verification: "offline production-cohort identity audit; compiled snapshot SQL executed SELECT-only",
  selectedSnapshots: selected.length, uniqueFixtures: new Set(keys).size,
  projectionRows: projections.length, aliasDuplicates: keys.length - new Set(keys).size,
  namedProjectionRows: named, blockedProjectionRows: conflicts.length,
  safelyMatchedMarketFixtures: matched, homeAwayReversals: reversals,
  latestCutoffs, conflicts,
}, null, 2));