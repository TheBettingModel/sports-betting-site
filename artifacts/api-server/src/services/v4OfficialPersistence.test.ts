import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.fn();
vi.mock("@workspace/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@workspace/db")>();
  return { ...original, db: { transaction } };
});
vi.mock("./guardedServing/approvalRegistry", () => ({
  acquireExactApprovalDecisionLock: vi.fn(),
  resolveExactApproval: vi.fn(),
}));

function emptyQuery() {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown[]) => void) => Promise.resolve([]).then(resolve);
  return query;
}

function transactionExecutor() {
  return {
    execute: vi.fn(async () => undefined),
    select: vi.fn(() => emptyQuery()),
    insert: vi.fn(() => emptyQuery()),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => []) })) })),
  };
}

describe("V4 official persistence transaction", () => {
  beforeEach(() => {
    transaction.mockReset();
    transaction.mockImplementation(async callback => callback(transactionExecutor()));
  });

  it("executes independent locked reconciliation with no forecasts", async () => {
    const { reconcileOfficialV4Day } = await import("./v4OfficialPersistence");
    await reconcileOfficialV4Day(new Date("2026-09-08T12:00:00Z"));
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("serializes each idempotent/concurrent reconciliation in its own transaction", async () => {
    const { reconcileOfficialV4Day } = await import("./v4OfficialPersistence");
    await Promise.all([
      reconcileOfficialV4Day(new Date("2026-09-08T12:00:00Z")),
      reconcileOfficialV4Day(new Date("2026-09-08T12:00:00Z")),
    ]);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("preserves a valid effective revision over withdrawn, stale, and newer alternatives", async () => {
    const { selectExecutableV4Revisions } = await import("./v4OfficialPersistence");
    const at = (minute: number) => new Date(`2026-09-08T12:${String(minute).padStart(2, "0")}:00Z`);
    const selected = selectExecutableV4Revisions([
      { value: "effective", gameId: "g", market: "moneyline", modelPredictionId: 1,
        decisionRevisionId: 1, marketEvidenceId: "e1", marketEvidenceHash: "h1",
        evidenceCapturedAt: at(1), existingEffective: true, executable: true },
      { value: "withdrawn", gameId: "g", market: "moneyline", modelPredictionId: 2,
        decisionRevisionId: 2, marketEvidenceId: "e2", marketEvidenceHash: "h2",
        evidenceCapturedAt: at(2), existingEffective: false, executable: false },
      { value: "stale", gameId: "g", market: "moneyline", modelPredictionId: 3,
        decisionRevisionId: 3, marketEvidenceId: "e3", marketEvidenceHash: "h3",
        evidenceCapturedAt: at(3), existingEffective: false, executable: false },
      { value: "fresh", gameId: "g", market: "moneyline", modelPredictionId: 4,
        decisionRevisionId: 4, marketEvidenceId: "e4", marketEvidenceHash: "h4",
        evidenceCapturedAt: at(4), existingEffective: false, executable: true },
    ]);
    expect(selected.map(item => item.value)).toEqual(["effective"]);
  });

  it("requalifies with the newest fresh revision and deterministic identity tie-break", async () => {
    const { selectExecutableV4Revisions } = await import("./v4OfficialPersistence");
    const captured = new Date("2026-09-08T12:10:00Z");
    const selected = selectExecutableV4Revisions([
      { value: "withdrawn", gameId: "g", market: "moneyline", modelPredictionId: 1,
        decisionRevisionId: 1, marketEvidenceId: "old", marketEvidenceHash: "old",
        evidenceCapturedAt: captured, existingEffective: false, executable: false },
      { value: "fresh-a", gameId: "g", market: "moneyline", modelPredictionId: 2,
        decisionRevisionId: 2, marketEvidenceId: "new-a", marketEvidenceHash: "ha",
        evidenceCapturedAt: captured, existingEffective: false, executable: true },
      { value: "fresh-b", gameId: "g", market: "moneyline", modelPredictionId: 3,
        decisionRevisionId: 3, marketEvidenceId: "new-b", marketEvidenceHash: "hb",
        evidenceCapturedAt: captured, existingEffective: false, executable: true },
    ]);
    expect(selected.map(item => item.value)).toEqual(["fresh-b"]);
  });
});