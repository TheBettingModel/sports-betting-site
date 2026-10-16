import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyNflHistoricalEvidence as verify, type NflEvidenceVerificationInput } from "./nflHistoricalEvidenceVerification";
import { type NflCaptureManifest, type NflEvidenceRecord } from "./nflHistoricalEvidenceProvenance";
import { finalEvent, seattleNewEnglandEvent } from "../../test/nfl-offline/result-fixtures";

// Fictional providers/hosts and explicit synthetic capture manifests.
const capturedAt = "2026-09-15T12:00:00Z";
function capture(id: string, sourceId: string, event: unknown): { record: NflEvidenceRecord; manifest: NflCaptureManifest } {
  const rawEventJson = JSON.stringify(event);
  return {
    record: { evidenceId: id, rawEventJson },
    manifest: { evidenceId: id, sourceId, sourceUrl: `https://${sourceId}.example.test/nfl/results`,
      sha256: createHash("sha256").update(rawEventJson, "utf8").digest("hex"), retrievedAt: capturedAt, reviewStatus: "APPROVED" },
  };
}
function request(event = finalEvent()): NflEvidenceVerificationInput {
  const first = capture("capture-a", "scoreboard", event);
  const second = capture("capture-b", "reference", { ...event, syntheticSourceAnnotation: "independent reference snapshot" });
  return {
    candidate: { event, observedAt: capturedAt },
    candidateEvidence: first.record, references: [second.record], asOf: "2026-09-16T12:00:00Z",
    policy: {
      sources: [
        { sourceId: "scoreboard", upstreamProviderId: "espn", origin: "https://scoreboard.example.test", sport: "NFL", reviewStatus: "APPROVED" },
        { sourceId: "reference", upstreamProviderId: "independent-provider", origin: "https://reference.example.test", sport: "NFL", reviewStatus: "APPROVED" },
      ],
      captures: [first.manifest, second.manifest],
    },
  };
}
function manifestChange(input: NflEvidenceVerificationInput, id: string, changes: Partial<NflCaptureManifest>) {
  return { ...input, policy: { ...input.policy,
    captures: input.policy.captures.map(m => m.evidenceId === id ? { ...m, ...changes } : m) } };
}
function replaceReference(input: NflEvidenceVerificationInput, event: unknown) {
  const r = capture("capture-b", "reference", event);
  return { ...input, references: [r.record], policy: { ...input.policy, captures: [input.policy.captures[0]!, r.manifest] } };
}

describe("offline NFL historical source evidence", () => {
  it("corroborates a consistent regular-season final from approved independent upstreams", () => {
    const out = verify(request());
    expect(out.decision).toBe("VERIFIED");
    expect(out.independentUpstreamProviders).toEqual(["espn", "independent-provider"]);
    expect(out.verifiedResult).toMatchObject({ homeScore: 31, awayScore: 10 });
    expect(out.verificationStatus).toBe("OFFLINE_CORROBORATED");
    expect(out.persistenceAuthorized).toBe(false);
    expect(out.evidence.every(e => e.sourceAuthenticity === "NOT_CHECKED_OFFLINE" && e.byteIntegrity === "MATCHED")).toBe(true);
    expect(out.evidenceAvailableAt).toBe("2026-09-16T12:00:00.000Z");
  });
  it("requires candidate evidence and at least one independent reference", () => {
    expect(verify({ ...request(), candidateEvidence: null }).reasons).toContain("MISSING_CANDIDATE_EVIDENCE");
    const out = verify({ ...request(), references: [] });
    expect(out.decision).toBe("QUARANTINED");
    expect(out.reasons).toContain("MISSING_REFERENCE_EVIDENCE");
    expect(out.reasons).toContain("INSUFFICIENT_INDEPENDENT_PROVIDERS");
  });
  it("does not allow two references to substitute for absent candidate provenance", () => {
    const input = request();
    const c = capture("capture-c", "scoreboard", { ...finalEvent(), syntheticSourceAnnotation: "third capture" });
    const out = verify({ ...input, candidateEvidence: null, references: [...input.references, c.record],
      policy: { ...input.policy, captures: [...input.policy.captures, c.manifest] } });
    expect(out.decision).toBe("QUARANTINED");
    expect(out.verifiedResult).toBeNull();
  });
  it("does not count aliases, mirrors, casing, or multiple ESPN endpoints as independent providers", () => {
    const input = request();
    const out = verify({ ...input, policy: { ...input.policy, sources: input.policy.sources.map(s =>
      s.sourceId === "reference" ? { ...s, upstreamProviderId: " ESPN " } : s) } });
    expect(out.decision).toBe("QUARANTINED");
    expect(out.independentUpstreamProviders).toEqual(["espn"]);
    expect(out.evidence[1]!.reasons).toContain("REPEATED_UPSTREAM_PROVIDER");
  });
  it("retains duplicate agreeing evidence without increasing provider count", () => {
    const input = request();
    const out = verify({ ...input, references: [...input.references, input.candidateEvidence!, input.references[0]!] });
    expect(out.decision).toBe("VERIFIED");
    expect(out.evidence.filter(e => e.status === "DUPLICATE")).toHaveLength(2);
    expect(out.independentUpstreamProviders).toHaveLength(2);
  });
  it("rejects changed bytes even if the parsed event is semantically identical", () => {
    const input = request();
    const ref = input.references[0]!;
    const out = verify({ ...input, references: [{ ...ref, rawEventJson: ref.rawEventJson + " " }] });
    expect(out.decision).toBe("QUARANTINED");
    expect(out.reasons).toContain("PAYLOAD_HASH_MISMATCH");
  });
  it("cannot be promoted by a payload claiming its own review status or upstream", () => {
    const input = replaceReference(request(), { ...finalEvent(), reviewed: true, upstreamProviderId: "trusted-provider" });
    const unreviewed = manifestChange(input, "capture-b", { reviewStatus: "UNREVIEWED" });
    expect(verify(unreviewed).reasons).toContain("UNAPPROVED_CAPTURE");
  });
  it.each(["UNKNOWN_SOURCE", "UNAPPROVED_SOURCE"] as const)("quarantines %s", reason => {
    const input = request();
    const sources = reason === "UNKNOWN_SOURCE" ? input.policy.sources.slice(0, 1)
      : input.policy.sources.map(s => s.sourceId === "reference" ? { ...s, reviewStatus: "UNREVIEWED" as const } : s);
    expect(verify({ ...input, policy: { ...input.policy, sources } }).reasons).toContain(reason);
  });
  it("requires a manifest independent of the supplied payload", () => {
    const input = request();
    expect(verify({ ...input, policy: { ...input.policy, captures: [] } }).reasons).toContain("MISSING_CAPTURE_MANIFEST");
  });
  it.each(["https://unapproved.example.test/nfl", "https://reference.example.test.evil.test/nfl"])(
    "rejects origin mismatch %s", sourceUrl => {
      expect(verify(manifestChange(request(), "capture-b", { sourceUrl })).reasons).toContain("SOURCE_ORIGIN_MISMATCH");
    });
  it.each(["http://reference.example.test/nfl", "https://user:secret@reference.example.test/nfl",
    "https://reference.example.test/nfl?token=synthetic", "https://reference.example.test/nfl#fragment"])(
    "rejects unsafe locator without echoing it", sourceUrl => {
      const out = verify(manifestChange(request(), "capture-b", { sourceUrl }));
      expect(out.reasons).toContain("INVALID_SOURCE_LOCATOR");
      expect(out.evidence[1]!.sourceLocator).toBeNull();
    });
  it("quarantines duplicate source/catalog identities rather than selecting one", () => {
    const input = request();
    expect(verify({ ...input, policy: { ...input.policy, sources: [...input.policy.sources, input.policy.sources[0]!] } }).reasons).toContain("INVALID_POLICY");
    expect(verify({ ...input, policy: { ...input.policy, captures: [...input.policy.captures, input.policy.captures[0]!] } }).reasons).toContain("INVALID_POLICY");
  });
  it("does not allow one origin to claim two independent upstream providers", () => {
    const input = manifestChange(request(), "capture-b", { sourceUrl: "https://scoreboard.example.test/nfl/reference" });
    const out = verify({ ...input, policy: { ...input.policy, sources: input.policy.sources.map(s =>
      s.sourceId === "reference" ? { ...s, origin: "https://scoreboard.example.test" } : s) } });
    expect(out.decision).toBe("QUARANTINED");
    expect(out.reasons).toContain("INVALID_POLICY");
  });
  it.each(["missing-upstream", "non-nfl"] as const)("fails closed for source catalog defect %s", defect => {
    const input = request();
    const sources = input.policy.sources.map(s => s.sourceId !== "reference" ? s
      : defect === "missing-upstream" ? { ...s, upstreamProviderId: "" }
      : { ...s, sport: "NBA" as "NFL" });
    expect(verify({ ...input, policy: { ...input.policy, sources } }).reasons).toContain("INVALID_POLICY");
  });
  it.each(["", "2026-02-30T12:00:00Z", "2026-09-15"])("quarantines invalid capture timestamp %s", retrievedAt => {
    expect(verify(manifestChange(request(), "capture-b", { retrievedAt })).reasons).toContain("INVALID_CAPTURE_TIMESTAMP");
  });
  it("rejects a future capture using only the supplied audit cutoff", () => {
    expect(verify(manifestChange(request(), "capture-b", { retrievedAt: "2026-09-17T12:00:00Z" })).reasons).toContain("FUTURE_CAPTURE");
    expect(verify({ ...request(), asOf: "" }).reasons).toContain("INVALID_VERIFICATION_TIME");
  });
  it.each([
    ["invalid", "INVALID_PUBLICATION_TIMESTAMP"],
    ["2026-09-16T12:00:00Z", "PUBLICATION_AFTER_CAPTURE"],
    ["2026-09-13T12:00:00Z", "FINAL_PUBLICATION_BEFORE_KICKOFF"],
  ])("quarantines invalid final-publication evidence %s", (resultPublishedAt, reason) => {
    expect(verify(manifestChange(request(), "capture-b", { resultPublishedAt })).reasons).toContain(reason);
  });
  it("does not require an invented provider completion/publication timestamp", () => {
    expect(verify(request()).decision).toBe("VERIFIED");
    expect(verify(request()).evidence.every(e => e.resultPublishedAt === null)).toBe(true);
  });
  it("quarantines invalid JSON even when its supplied manifest hash matches", () => {
    const input = request(), rawEventJson = "{bad-json";
    const changed = manifestChange(input, "capture-b", { sha256: createHash("sha256").update(rawEventJson).digest("hex") });
    const out = verify({ ...changed, references: [{ evidenceId: "capture-b", rawEventJson }] });
    expect(out.reasons).toContain("INVALID_PAYLOAD");
    expect(out.verifiedResult).toBeNull();
  });
  it("quarantines mismatched game IDs, teams, kickoff, season year, or phase", () => {
    const variants = [finalEvent({ id: "900000099" }), finalEvent({ homeId: "17" }),
      finalEvent({ date: "2026-09-14T01:20:00Z" }), { ...finalEvent(), season: { year: 2025, type: 2 } },
      finalEvent({ seasonType: 1 })];
    for (const event of variants) expect(verify(replaceReference(request(), event)).reasons).toContain("GAME_IDENTITY_MISMATCH");
  });
  it("does not call scores from a different game a same-game score conflict", () => {
    const out = verify(replaceReference(request(), finalEvent({ homeId: "17", homeScore: "24" })));
    expect(out.reasons).toContain("GAME_IDENTITY_MISMATCH");
    expect(out.reasons).not.toContain("FINAL_SCORE_CONFLICT");
  });
  it("does not count a reference with missing final data", () => {
    const out = verify(replaceReference(request(), finalEvent({ homeScore: null })));
    expect(out.decision).toBe("QUARANTINED");
    expect(out.reasons).toContain("INVALID_RESULT");
    expect(out.evidence[1]!.validationReasons).toContain("MISSING_FINAL_SCORE");
    expect(out.verifiedResult).toBeNull();
  });
  it("requires the captured candidate body and observation timestamp to match the candidate", () => {
    const input = request();
    expect(verify({ ...input, candidate: { ...input.candidate, event: { ...finalEvent(), annotation: "not captured" } } }).reasons).toContain("CANDIDATE_PAYLOAD_MISMATCH");
    expect(verify({ ...input, candidate: { ...input.candidate, observedAt: "2026-09-15T13:00:00Z" } }).reasons).toContain("CANDIDATE_TIMESTAMP_MISMATCH");
  });
  it("quarantines Denver–KC 0–0 despite a supplied 31–10 correction; never replaces it", () => {
    const input = replaceReference(request(finalEvent({ homeScore: "0", awayScore: "0" })), finalEvent());
    const out = verify(input);
    expect(out.decision).toBe("QUARANTINED");
    expect(out.candidateValidationReasons).toContain("SUSPICIOUS_ZERO_ZERO_FINAL");
    expect(out.reasons).toContain("FINAL_SCORE_CONFLICT");
    expect(out.verifiedResult).toBeNull();
    expect(input.candidate.event).toEqual(finalEvent({ homeScore: "0", awayScore: "0" }));
  });
  it("detects a synthetic Seattle/New England reversal without asserting the real historical score", () => {
    const e = seattleNewEnglandEvent();
    const different = structuredClone(e);
    different.competitions[0]!.competitors[0]!.score = "24";
    different.competitions[0]!.competitors[1]!.score = "17";
    expect(verify(replaceReference(request(e), different)).reasons).toContain("FINAL_SCORE_CONFLICT");
  });
  it("does not use majority agreement to dismiss a conflicting reference", () => {
    const input = request();
    const bad = capture("capture-c", "reference", finalEvent({ homeScore: "30" }));
    const out = verify({ ...input, references: [...input.references, bad.record],
      policy: { ...input.policy, captures: [...input.policy.captures, bad.manifest] } });
    expect(out.decision).toBe("QUARANTINED");
    expect(out.reasons).toContain("FINAL_SCORE_CONFLICT");
  });
  it("detects one evidence ID reused for different bodies", () => {
    const input = request();
    const out = verify({ ...input, references: [...input.references,
      { evidenceId: "capture-b", rawEventJson: JSON.stringify(finalEvent({ homeScore: "30" })) }] });
    expect(out.reasons).toContain("CONFLICTING_EVIDENCE_ID");
  });
  it("quarantines byte-identical payloads attributed to different providers", () => {
    const input = replaceReference(request(), finalEvent());
    expect(verify(input).reasons).toContain("CROSS_PROVIDER_PAYLOAD_REUSE");
  });
  it("accepts corroborated legitimate shutouts and ties", () => {
    for (const [homeScore, awayScore] of [[31, 0], [0, 10], [17, 17]]) {
      expect(verify(request(finalEvent({ homeScore, awayScore }))).decision).toBe("VERIFIED");
    }
  });
  it("does not promote preseason, incomplete, or missing-score candidates", () => {
    expect(verify(request(finalEvent({ seasonType: 1 }))).decision).toBe("REJECTED");
    const e = finalEvent(); e.status.type.completed = false; e.status.type.state = "in";
    expect(verify(request(e)).decision).not.toBe("VERIFIED");
    expect(verify(request(finalEvent({ homeScore: null }))).decision).toBe("QUARANTINED");
  });
  it("is deterministic and does not mutate input or depend on reference order", () => {
    const input = request();
    const withDuplicate = { ...input, references: [...input.references, input.candidateEvidence!] };
    const before = structuredClone(withDuplicate);
    const out = verify(withDuplicate);
    expect(verify(withDuplicate)).toEqual(out);
    expect(verify({ ...withDuplicate, references: [...withDuplicate.references].reverse() })).toEqual(out);
    expect(withDuplicate).toEqual(before);
  });
});
