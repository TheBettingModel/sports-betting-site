import { describe, expect, it } from "vitest";
import { latestNcaafEventSnapshots, resolveNcaafEventIdentity, resolveNcaafPredictionHistory, verifyNcaafEventAssociation } from "./ncaafEventIdentity";
import type { NcaafIdentityTarget } from "./ncaafEventIdentity";
import { safeCurrentMarketSnapshot } from "./ncaafV4GameDay";

const now = new Date("2026-10-03T17:45:44Z");
const kickoffAt = new Date("2026-10-03T19:30:00Z");
const target = { id: 10, dataCutoffAt: now, targetProvider: "espn", targetEventId: "401866431", homeProviderTeamId: "2050", awayProviderTeamId: "2649", kickoffAt };
const evidence = { id: 20, provider: "espn", providerEventId: "NCAAF-401866431", capturedAt: now, kickoffAt, homeProviderTeamId: "2050", awayProviderTeamId: "2649", homeTeamName: "Ball State Cardinals", awayTeamName: "Toledo Rockets", neutralSite: false };
const game = { id: "NCAAF-401866431", homeTeamId: "2050", awayTeamId: "2649", startsAt: kickoffAt };
const verify = (s: NcaafIdentityTarget = target, e = evidence, g = game) => verifyNcaafEventAssociation(s, [e], [g]);

describe("verified NCAAF event identity", () => {
  it("resolves both exact ESPN aliases without changing the original provider identity", () => {
    const raw = resolveNcaafEventIdentity("espn", "401866431")!;
    const prefixed = resolveNcaafEventIdentity("espn", "NCAAF-401866431")!;
    expect(raw.key).toBe(prefixed.key);
    expect(raw.publicGameId).toBe(game.id);
    expect(prefixed.originalEventId).toBe("NCAAF-401866431");
    expect(prefixed.providerEventId).toBe("401866431");
    for (const id of ["NCAAF-NCAAF-401866431", "401866431x", " 401866431", "espn:401866431"]) expect(resolveNcaafEventIdentity("espn", id)).toBeNull();
    expect(resolveNcaafEventIdentity("college_football_data", "401866431")).toBeNull();
  });
  it("selects the newest complete original row across aliases and ties by ID", () => {
    const old = { ...target, id: 1, targetEventId: "NCAAF-401866431", dataCutoffAt: new Date("2026-09-07T12:00:00Z") };
    const newer = { ...target, id: 11 };
    expect(latestNcaafEventSnapshots([old, target, newer])).toEqual([newer]);
    expect(old.targetEventId).toBe("NCAAF-401866431");
    expect(latestNcaafEventSnapshots([target, { ...newer, targetEventId: "NCAAF-401866431" }])[0].targetEventId).toBe("NCAAF-401866431");
  });
  it("attaches correct ordered names and the verified public reference", () => {
    const result = verify();
    expect(result.verified).toBe(true);
    expect(result.publicGameId).toBe(game.id);
    expect(result.game?.homeTeamName).toBe("Ball State Cardinals");
    expect(result.game?.awayTeamName).toBe("Toledo Rockets");
  });
  it("rejects swapped or missing provider IDs instead of name-matching", () => {
    expect(verify(target, { ...evidence, homeProviderTeamId: "2649", awayProviderTeamId: "2050" }).reason).toBe("EVIDENCE_ORDERED_TEAM_CONFLICT");
    expect(verify({ ...target, homeProviderTeamId: null }).verified).toBe(false);
    expect(verify(target, evidence, { ...game, homeTeamId: "2649", awayTeamId: "2050" }).reason).toBe("PUBLIC_GAME_ORDERED_TEAM_CONFLICT");
  });
  it("uses the existing 90-minute fixture tolerance, not the six-hour market window", () => {
    expect(verify(target, { ...evidence, kickoffAt: new Date(kickoffAt.getTime() + 90 * 60_000) }).verified).toBe(true);
    expect(verify(target, { ...evidence, kickoffAt: new Date(kickoffAt.getTime() + 90 * 60_000 + 1) }).reason).toBe("EVIDENCE_KICKOFF_CONFLICT");
  });
  it("fails closed on the Memphis/Charlotte 15:00 vs 19:30 public kickoff conflict", () => {
    const result = verify(target, evidence, { ...game, startsAt: new Date("2026-10-03T15:00:00Z") });
    expect(result.reason).toBe("PUBLIC_GAME_KICKOFF_CONFLICT");
    expect(result.game).toBeNull();
    expect(result.publicGameId).toBeNull();
  });
  it("does not fall back to older evidence when newest metadata conflicts", () => {
    const conflict = { ...evidence, id: 21, capturedAt: new Date(now.getTime() + 1), kickoffAt: new Date("2026-10-03T15:00:00Z") };
    expect(verifyNcaafEventAssociation(target, [evidence, conflict], [game]).reason).toBe("EVIDENCE_KICKOFF_CONFLICT");
  });
  it("allows markets only with verified schedule identity and keeps orientation", () => {
    const verified = verify();
    const payload = { event: { sport_key: "americanfootball_ncaaf", commence_time: kickoffAt.toISOString(), home_team: evidence.homeTeamName, away_team: evidence.awayTeamName }, identity: { gameNeutralSite: false } };
    const rows = [evidence.homeTeamName, evidence.awayTeamName].map(selection => ({
      gameEvidenceId: evidence.id, marketKey: "h2h", selection, price: -110, line: null, bookmakerProviderId: "book", bookmakerName: "Book",
      capturedAt: new Date("2026-10-03T17:40:00Z"), isMatchedToGame: true, marketIdentityStatus: "matched_exact", payload,
    }));
    rows.push({ ...rows[0], marketKey: "spreads" }, { ...rows[0], marketKey: "totals" });
    expect(verified.game && safeCurrentMarketSnapshot(rows, verified.game, now).rows).toHaveLength(4);
    expect(verify(target, { ...evidence, homeProviderTeamId: "wrong" }).game).toBeNull();
  });
  it("resolves existing raw prediction references read-only with exact snapshot provenance", () => {
    const row = Object.freeze({ canonicalGameId: "401866431", sourceAudit: { snapshotId: 10 }, kickoffAt, featureCutoff: now });
    const before = JSON.stringify(row);
    const result = resolveNcaafPredictionHistory(row, target, [evidence], [game]);
    expect(result?.publicGameId).toBe(game.id);
    expect(result?.original).toBe(row);
    expect(JSON.stringify(row)).toBe(before);
    expect(row.canonicalGameId).toBe("401866431");
    expect(resolveNcaafPredictionHistory({ ...row, sourceAudit: { snapshotId: 9 } }, target, [evidence], [game])).toBeNull();
    expect(resolveNcaafPredictionHistory(row, target, [evidence], [{ ...game, startsAt: new Date("2026-10-03T15:00:00Z") }])).toBeNull();
  });
});