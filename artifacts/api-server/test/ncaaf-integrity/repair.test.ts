import { describe, it, expect } from "vitest";
import { ncaafIntegrityHash } from "../../src/services/ncaafHistoricalIntegrity";
import { executeNcaafRepair, reviewOfficialFinal, validateRepairManifest, snapshotHash, officialDocumentHash, ncaafRepairRawBefore,
  type RepairJournal, type JournalRecord, type RepairStore, type RepairApproval } from "../../src/services/ncaafHistoricalRepair";
import { repairFixture } from "./repair-fixture";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function harness() {
  const f = repairFixture(), journalRecords = new Map<string, JournalRecord>();
  let snapshot = clone(f.snapshot), writes = 0, failAttach = false, failAppliedJournal = false;
  const journal: RepairJournal = {
    get: async key => clone(journalRecords.get(key) ?? null),
    put: async (key, record) => {
      if (failAppliedJournal && record.state === "APPLIED") throw Error("SIMULATED_POSTCOMMIT_CRASH");
      journalRecords.set(key, clone(record));
    },
  };
  const store: RepairStore = {
    async verifyTarget(target) { if (target.database !== "synthetic") throw Error("WRONG_TARGET"); },
    async transaction(_id, work) {
      const original = clone(snapshot), previousWrites = writes;
      try {
        return await work({
          observedAt: "2026-09-01T12:00:00.000Z", read: async () => clone(snapshot),
          async reconcile() {
            writes++; snapshot.game.homeScore = 21; snapshot.game.awayScore = 27;
            snapshot.game.updatedAt = "2026-09-01T12:00:00.000Z";
            snapshot.result ??= { id: 2, gameId: f.entry.before.gameId, homeScore: 21, awayScore: 27 };
            snapshot.result.rawResultJson = { tbmNcaafIntegrity: { phase: "REGULAR_SEASON", verification: "SINGLE_UPSTREAM" } };
            snapshot.result.updatedAt = "2026-09-01T12:00:00.000Z"; snapshot.rawIsSqlNull = false; snapshot.rawMd5 = "post";
            return "UPDATED";
          },
          async attach(receipt) {
            if (failAttach) throw Error("SIMULATED_TRANSACTION_CRASH");
            snapshot.result!.rawResultJson = { ...snapshot.result!.rawResultJson as object, tbmNcaafHistoricalRepair: receipt };
          },
          async restore(before) { writes++; snapshot = clone(before); },
        });
      } catch (error) { snapshot = original; writes = previousWrites; throw error; }
    },
  };
  const run = (approval: RepairApproval = f.approval) => executeNcaafRepair(store, journal, f.manifest, approval);
  const refresh = () => { f.approval.manifestHash = ncaafIntegrityHash(f.manifest); };
  return { f, store, journal, run, refresh, records: journalRecords, snapshot: () => snapshot,
    writes: () => writes, attachFailure: (v: boolean) => { failAttach = v; },
    journalFailure: (v: boolean) => { failAppliedJournal = v; } };
}
describe("controlled NCAA repair", () => {
  it.each([
    [1, true, null],
    [1, false, "37a6259cc0c1dae299a7866489dff0bd"],
    [null, null, null],
  ] as const)("preserves explicit SQL provenance %s/%s/%s", (id, sqlNull, md5) => {
    expect(ncaafRepairRawBefore(id, sqlNull, md5)).toEqual({ rawIsSqlNull: sqlNull, rawMd5: md5 });
  });
  it.each([
    [1, true, "37a6259cc0c1dae299a7866489dff0bd"],
    [null, null, "37a6259cc0c1dae299a7866489dff0bd"],
    [null, true, null],
    [1, false, null],
    [1, null, null],
    [1, false, "not-an-md5"],
  ] as const)("rejects invented or ambiguous SQL provenance %s/%s/%s", (id, sqlNull, md5) => {
    expect(() => ncaafRepairRawBefore(id, sqlNull, md5)).toThrow();
  });
  it("rejects a legacy missing SQL-null observation before touching the store", async () => {
    const h = harness();
    delete (h.f.entry.before as Partial<typeof h.f.entry.before>).rawIsSqlNull;
    h.refresh();
    await expect(h.run()).rejects.toThrow("INVALID_SQL_PROVENANCE_BEFOREIMAGE");
    expect(h.writes()).toBe(0);
  });
  it("SQL NULL cannot be confused with JSON null when the approved checksum is wrong", async () => {
    const h = harness();
    h.snapshot().rawIsSqlNull = true; h.snapshot().rawMd5 = null;
    expect((await h.run())[0]!.outcome).toBe("QUARANTINED_STALE_BEFOREIMAGE");
    expect(h.writes()).toBe(0);
  });
  it("the explicit SQL-null flag participates in before-image comparison", async () => {
    const h = harness();
    h.f.entry.before.rawIsSqlNull = true; h.f.entry.before.rawMd5 = null;
    h.snapshot().rawMd5 = null; h.refresh();
    expect((await h.run())[0]!.outcome).toBe("QUARANTINED_STALE_BEFOREIMAGE");
    expect(h.writes()).toBe(0);
  });
  it("accepts SQL NULL only after its exact before-image is approved", async () => {
    const h = harness();
    h.f.entry.before.rawIsSqlNull = true; h.f.entry.before.rawMd5 = null;
    h.snapshot().rawIsSqlNull = true; h.snapshot().rawMd5 = null; h.refresh();
    expect((await h.run())[0]!.outcome).toBe("APPLIED");
  });
  it("binds cumulative scoring columns and rejects unrelated later stat totals", () => {
    const {entry:e,manifest}=repairFixture();
    const table="| Qtr. - Time | Qtr | Time | Scoring Play | AWY | HME |\n| --- | --- | --- | --- | --- | --- |\n| 4th - 00:30 | 4th | 00:30 | HME - touchdown | 27 | 21 |";
    e.official.document="08/29/2026\n"+table; e.official.documentHash=officialDocumentHash(e.official.document);
    e.official.finalQuote=table;e.official.homeLabel="HME";e.official.awayLabel="AWY";
    e.official.homeScoreQuote=table.split("\n").at(-1)!;e.official.awayScoreQuote=e.official.homeScoreQuote;
    e.official.scoreLayout="SCORING_COLUMNS";
    expect(reviewOfficialFinal(e,manifest.asOf)).toEqual([]);
    e.official.finalQuote+="\n\nFirst downs\n| Total | 27 | 21 |";
    e.official.document="08/29/2026\n"+e.official.finalQuote;e.official.documentHash=officialDocumentHash(e.official.document);
    expect(reviewOfficialFinal(e,manifest.asOf)).toContain("TEAM_BOUND_FINAL_SCORE_REQUIRED");
  });
  it("binds official matchup score order to home/away status", () => {
    const {entry:e,manifest}=repairFixture();
    const quote="# Football Box Score\nAway\n\n27-21\n\n**at**\n\nHome\n\nDate08/29/2026\nStatusAway";
    e.official.document=quote;e.official.documentHash=officialDocumentHash(quote);e.official.finalQuote=quote;
    e.official.homeScoreQuote="27-21";e.official.awayScoreQuote="27-21";e.official.scoreLayout="MATCHUP_SCORELINE";
    expect(reviewOfficialFinal(e,manifest.asOf)).toEqual([]);
    e.official.document=quote.replace("StatusAway","StatusHome");e.official.finalQuote=e.official.document;
    e.official.documentHash=officialDocumentHash(e.official.document);
    expect(reviewOfficialFinal(e,manifest.asOf)).toContain("TEAM_BOUND_FINAL_SCORE_REQUIRED");
  });
  it("accepts a bound institutional final, not a guessed correction", () => {
    const f = repairFixture(); expect(reviewOfficialFinal(f.entry, f.manifest.asOf)).toEqual([]);
  });
  it.each([
    ["wrong sport", e => { e.input.sport = "NFL"; }],
    ["wrong event", e => { e.official.identity.gameId = "NCAAF-1"; }],
    ["wrong home identity", e => { e.official.identity.homeTeamId = "1"; }],
    ["wrong kickoff", e => { e.official.identity.kickoffAt = "2026-08-29T22:00:00Z"; }],
    ["score conflict", e => { e.official.homeScore = 99; }],
    ["replacement of existing final", e => { e.before.resultHomeScore = 99; }],
    ["missing result disagreement", e => { e.before.resultId = null; }],
    ["unapproved publisher", e => { e.official.sourceUrl = "https://espn.com/news/2026/test"; }],
    ["URL credentials", e => { e.official.sourceUrl = "https://user:pass@unlvrebels.com/news/2026/test"; }],
    ["preview path", e => { e.official.sourceUrl = "https://unlvrebels.com/game-center/123"; }],
    ["altered document", e => { e.official.document += " altered"; }],
    ["missing quotation", e => { e.official.finalQuote = "not in source"; }],
    ["missing team", e => { e.official.homeLabel = "Different"; }],
    ["equal labels", e => { e.official.homeLabel = e.official.awayLabel; }],
    ["reversed team-score assignment", e => { e.official.homeScoreQuote = "Away 27"; e.official.awayScoreQuote = "Home 21"; }],
    ["date conflict", e => { e.official.gameDate = "2026-08-30"; }],
    ["missing date quote", e => { e.official.dateQuote = "never present"; }],
    ["AP syndication", e => { e.official.authorship = "AP" as never; }],
    ["future capture", e => { e.official.capturedAt = "2027-01-01T00:00:00Z"; }],
    ["pregame capture", e => { e.official.capturedAt = "2026-08-29T22:00:00Z"; }],
  ] as const)("quarantines %s", (_label, mutate) => {
    const f = repairFixture(); mutate(f.entry); expect(reviewOfficialFinal(f.entry, f.manifest.asOf).length).toBeGreaterThan(0);
  });
  it("bounds manifests and rejects duplicate observations", () => {
    const f = repairFixture(); f.manifest.entries.push(clone(f.entry));
    expect(validateRepairManifest(f.manifest)).toContain("DUPLICATE_EVENT_ID");
    expect(validateRepairManifest({ ...f.manifest, entries: [] })).toContain("INVALID_BOUNDED_MANIFEST");
    expect(validateRepairManifest({ ...f.manifest, entries: Array(65).fill(f.entry) })).toContain("INVALID_BOUNDED_MANIFEST");
  });
  it("requires exact manifest approval before any database work", async () => {
    const h = harness(); await expect(h.run({ ...h.f.approval, manifestHash: "wrong" })).rejects.toThrow("EXACT_APPROVAL");
    expect(h.writes()).toBe(0);
  });
  it("does not allow a subset or extra approved game ID", async () => {
    const h = harness(); await expect(h.run({ ...h.f.approval, gameIds: [] })).rejects.toThrow("EXACT_APPROVAL");
  });
  it("rejects wrong database identity", async () => {
    const h = harness(); await expect(h.run({ ...h.f.approval, target: { ...h.f.approval.target, database: "production" } })).rejects.toThrow("WRONG_TARGET");
  });
  it("preserves full before images and protects non-owned model fields", async () => {
    const h = harness(); expect((await h.run())[0]!.outcome).toBe("APPLIED");
    expect(h.snapshot().game.protectedModelField).toBe(0.73);
    const receipt = (h.snapshot().result!.rawResultJson as any).tbmNcaafHistoricalRepair;
    expect(receipt.before).toEqual(h.f.snapshot);
    expect(receipt.availableAt).toBe("2026-09-01T12:00:00.000Z");
  });
  it("repeats without a second data write", async () => {
    const h = harness(); await h.run(); const after = clone(h.snapshot());
    expect((await h.run())[0]!.outcome).toBe("ALREADY_APPLIED"); expect(h.writes()).toBe(1); expect(h.snapshot()).toEqual(after);
  });
  it("rejects stale game timestamp", async () => {
    const h = harness(); h.snapshot().game.updatedAt = "2026-08-30T06:00:00.000Z";
    expect((await h.run())[0]!.outcome).toBe("QUARANTINED_STALE_BEFOREIMAGE"); expect(h.writes()).toBe(0);
  });
  it("rejects wrong stored sport", async () => {
    const h = harness(); h.snapshot().game.sport = "NFL";
    expect((await h.run())[0]!.outcome).toBe("QUARANTINED_STALE_BEFOREIMAGE");
  });
  it("rejects changed JSON evidence even when scores still agree", async () => {
    const h = harness(); h.snapshot().rawMd5 = "changed";
    expect((await h.run())[0]!.outcome).toBe("QUARANTINED_STALE_BEFOREIMAGE");
  });
  it("rolls back both database writes if receipt persistence fails", async () => {
    const h = harness(); h.attachFailure(true);
    await expect(h.run()).rejects.toThrow("TRANSACTION_CRASH"); expect(h.snapshot()).toEqual(h.f.snapshot);
    h.attachFailure(false); expect((await h.run())[0]!.outcome).toBe("APPLIED");
  });
  it("resumes after commit but before journal completion", async () => {
    const h = harness(); h.journalFailure(true); await expect(h.run()).rejects.toThrow("POSTCOMMIT_CRASH");
    expect(h.writes()).toBe(1); h.journalFailure(false);
    expect((await h.run())[0]!.outcome).toBe("ALREADY_APPLIED"); expect(h.writes()).toBe(1);
  });
  it("does not overwrite a changed post-image", async () => {
    const h = harness(); await h.run(); h.snapshot().game.protectedModelField = 0.99;
    expect((await h.run())[0]!.outcome).toBe("QUARANTINED_CHANGED_POSTIMAGE");
  });
  it("requires explicit acknowledgement before restoring bad fixture scores", async () => {
    const h = harness(); await h.run(); await expect(h.run({ ...h.f.approval, operation: "ROLLBACK" })).rejects.toThrow("KNOWN_BAD");
  });
  it("rolls back owned fields exactly and resumes a completed rollback", async () => {
    const h = harness(); await h.run();
    const rollback = { ...h.f.approval, operation: "ROLLBACK" as const, acknowledgeKnownBadBeforeScores: true };
    expect((await h.run(rollback))[0]!.outcome).toBe("ROLLED_BACK"); expect(h.snapshot()).toEqual(h.f.snapshot);
    expect((await h.run(rollback))[0]!.outcome).toBe("ALREADY_ROLLED_BACK");
    expect((await h.run())[0]!.outcome).toBe("QUARANTINED_PREVIOUS_ROLLBACK");
  });
  it("never deletes a committed new result without dependency review", async () => {
    const h = harness(); h.f.entry.before.resultId = null; h.f.entry.before.resultHomeScore = null;
    h.f.entry.before.resultAwayScore = null; h.f.entry.before.resultUpdatedAt = null;
    h.f.entry.before.gradingSource = null; h.f.entry.before.gradedAt = null; h.f.entry.before.rawMd5 = null;
    h.f.entry.before.rawIsSqlNull = null;
    h.f.entry.before.homeScore = 21; h.f.entry.before.awayScore = 27;
    h.snapshot().game.homeScore = 21; h.snapshot().game.awayScore = 27;
    h.snapshot().result = null; h.snapshot().rawIsSqlNull = null; h.snapshot().rawMd5 = null; h.refresh();
    expect((await h.run())[0]!.outcome).toBe("APPLIED");
    expect((await h.run({ ...h.f.approval, operation: "ROLLBACK", acknowledgeKnownBadBeforeScores: true }))[0]!.outcome)
      .toBe("QUARANTINED_INSERT_ROLLBACK_REQUIRES_DEPENDENCY_REVIEW");
  });
  it("detects corrupt durable receipts", async () => {
    const h = harness(); await h.run();
    (h.snapshot().result!.rawResultJson as any).tbmNcaafHistoricalRepair.afterHash = "forged";
    expect((await h.run())[0]!.outcome).toBe("QUARANTINED_UNOWNED_RECEIPT");
  });
  it("hashes Date-valued snapshots by their actual timestamp", () => {
    const f = repairFixture(); const a = clone(f.snapshot), b = clone(f.snapshot);
    a.game.updatedAt = new Date("2026-08-30T00:00:00Z"); b.game.updatedAt = new Date("2026-08-31T00:00:00Z");
    expect(snapshotHash(a)).not.toBe(snapshotHash(b));
  });
});
