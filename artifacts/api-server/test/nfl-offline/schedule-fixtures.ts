import { createHash } from "node:crypto";
import { finalEvent } from "./result-fixtures";
import type { NflScheduleEvidence } from "../../src/services/nflHistoricalScheduleEvidence";

/** Fictional IDs/kickoffs and source manifests, not a recovered NFL schedule. */
export function scheduleEvent(input: Parameters<typeof finalEvent>[0] = {}, week = 3) {
  const event = finalEvent({ date: "2026-09-27T17:00:00Z", ...input });
  event.status.type = { state: "pre", completed: false, name: "STATUS_SCHEDULED" };
  event.competitions[0]!.competitors.forEach(c => { c.score = "0"; });
  return { ...event, week: { number: week } };
}
export function scheduleProof(event: unknown, annotation = "independent schedule"): NflScheduleEvidence {
  const snapshots = [JSON.stringify(event), JSON.stringify({ ...(event as object), syntheticSourceAnnotation: annotation })];
  const sources = ["schedule-a", "schedule-b"];
  const prefix = `schedule-${String((event as { id?: string })?.id ?? "invalid")}`;
  const ids = [`${prefix}-a`, `${prefix}-b-${createHash("sha256").update(annotation).digest("hex").slice(0, 8)}`];
  return {
    primary: { evidenceId: ids[0]!, rawEventJson: snapshots[0]! },
    references: [{ evidenceId: ids[1]!, rawEventJson: snapshots[1]! }],
    policy: {
      sources: sources.map(sourceId => ({ sourceId, upstreamProviderId: sourceId,
        origin: `https://${sourceId}.example.test`, sport: "NFL", reviewStatus: "APPROVED" })),
      captures: sources.map((sourceId, i) => ({
        evidenceId: ids[i]!, sourceId,
        sourceUrl: `https://${sourceId}.example.test/nfl/schedule`,
        sha256: createHash("sha256").update(snapshots[i]!, "utf8").digest("hex"),
        retrievedAt: "2026-09-20T12:00:00Z", reviewStatus: "APPROVED",
      })),
    },
  };
}
export function missingSeptember27Scenario() {
  const ramsDenver = scheduleEvent({
    id: "900000027", homeId: "7", awayId: "14", homeName: "Denver Broncos", awayName: "Los Angeles Rams",
  });
  const seattleWashington = scheduleEvent({
    id: "900000028", homeId: "28", awayId: "26", homeName: "Washington Commanders", awayName: "Seattle Seahawks",
    date: "2026-09-27T20:25:00Z",
  });
  return [ramsDenver, seattleWashington];
}
