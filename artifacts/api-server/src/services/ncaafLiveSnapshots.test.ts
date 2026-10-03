import { describe, expect, it } from "vitest";
import { latestNcaafPregameSnapshotsQuery } from "./ncaafLiveSnapshots";

describe("bounded NCAAF live snapshot selection", () => {
  const now = new Date("2026-10-03T14:30:00Z");
  it("selects one newest snapshot per physical provider/event inside PostgreSQL", () => {
    const query = latestNcaafPregameSnapshotsQuery(now).toSQL();
    expect(query.sql).toContain('select distinct on ("ncaaf_football_intelligence_snapshots"."target_provider", case when');
    expect(query.sql).toContain("~ '^NCAAF-[0-9]+$'");
    expect(query.sql).toContain('"data_cutoff_at" desc');
    expect(query.sql).toContain('"id" desc');
    expect(query.sql).toContain('"data_cutoff_at" <= ');
    expect(query.sql).toContain('"data_cutoff_at" < "ncaaf_football_intelligence_snapshots"."kickoff_at"');
    expect(query.sql).toContain('"kickoff_at" > ');
  });
  it("restricts the board to its Eastern day and never widens a single-game request", () => {
    const start = new Date("2026-10-03T04:00:00Z");
    const end = new Date("2026-10-04T04:00:00Z");
    const query = latestNcaafPregameSnapshotsQuery(now, { eventId: "401752900", start, end }).toSQL();
    expect(query.params).toContain("espn");
    expect(query.params).toContain("401752900");
    expect(query.params).toContain("NCAAF-401752900");
    expect(query.params).toContain(start.toISOString());
    expect(query.params).toContain(end.toISOString());
    expect(query.sql).toContain('"kickoff_at" >= ');
    expect(query.sql).toContain('"kickoff_at" < ');
  });
});