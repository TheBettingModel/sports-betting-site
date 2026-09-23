import { describe, expect, it } from "vitest";
import { decideCfbdGameMapping, decideCfbdTeamMapping, normalizeNcaafSchoolIdentity } from "./ncaafCfbdIdentity";

describe("deterministic NCAAF CFBD identity repair", () => {
  it("mechanically normalizes Unicode, case, whitespace, and punctuation", () => {
    expect(normalizeNcaafSchoolIdentity("  SÃO\u00a0José—State!!! ")).toBe("sao jose state");
    expect(normalizeNcaafSchoolIdentity("Hawaiʻi")).toBe("hawaii");
    expect(normalizeNcaafSchoolIdentity("Ole Miss Rebels")).toBe("mississippi rebels");
  });

  it("requires full display corroboration before calling equal IDs an exact provider-ID match", () => {
    const corroborated = decideCfbdTeamMapping(
      { id: "42", school: "Ohio State", mascot: "Buckeyes" },
      [{ provider: "espn", teamId: "42", school: "Ohio State Buckeyes" }],
    );
    expect(corroborated).toMatchObject({
      state: "MAPPED", mappingMethod: "EXACT_PROVIDER_ID", confidence: "HIGH", reviewStatus: "AUTO_APPROVED",
    });

    const schoolOnly = decideCfbdTeamMapping(
      { id: "42", school: "Ohio State", mascot: "Buckeyes" },
      [{ provider: "espn", teamId: "42", school: "Ohio State" }],
    );
    expect(schoolOnly).toMatchObject({ state: "MAPPED", mappingMethod: "EXACT_SCHOOL" });

    const uncorroborated = decideCfbdTeamMapping(
      { id: "42", school: "Ohio State", mascot: "Buckeyes" },
      [{ provider: "espn", teamId: "42", school: "Oklahoma State Cowboys" }],
    );
    expect(uncorroborated).toMatchObject({
      state: "UNMAPPED", mappingMethod: "NONE", confidence: "NONE", reviewStatus: "REVIEW_REQUIRED",
    });
  });

  it("uses explicit aliases, preserves guards, and leaves collisions ambiguous", () => {
    expect(decideCfbdTeamMapping(
      { id: "9", school: "Ole Miss", mascot: "Rebels" },
      [{ provider: "espn", teamId: "145", school: "Mississippi Rebels" }],
    )).toMatchObject({ state: "MAPPED", mappingMethod: "EXACT_SCHOOL_MASCOT" });

    expect(decideCfbdTeamMapping(
      { id: "9", school: "Miami", conference: "ACC" },
      [{ provider: "espn", teamId: "1", school: "Miami", conference: "MAC" }],
    )).toMatchObject({ state: "UNMAPPED", reviewStatus: "REVIEW_REQUIRED" });

    expect(decideCfbdTeamMapping(
      { id: "9", school: "Miami", conference: "ACC" },
      [{ provider: "espn", teamId: "1", school: "Miami" }],
    )).toMatchObject({
      state: "UNMAPPED",
      reason: "Exact school identity requires equivalent canonical conference evidence",
    });

    expect(decideCfbdTeamMapping(
      { id: "9", school: "Miami" },
      [
        { provider: "espn", teamId: "1", school: "Miami" },
        { provider: "espn", teamId: "2", school: "Miami" },
      ],
    )).toMatchObject({ state: "AMBIGUOUS", reviewStatus: "REVIEW_REQUIRED" });
  });

  it("categorizes ordered-team game mapping failures", () => {
    const kickoffAt = new Date("2026-09-01T00:00:00Z");
    expect(decideCfbdGameMapping(
      { id: "g", homeCanonicalTeamId: "h", awayCanonicalTeamId: "a", kickoffAt },
      [{ provider: "espn", eventId: "e", homeTeamId: "x", awayTeamId: "a", kickoffAt }],
    ).reason).toContain("ordered team pair");
    expect(decideCfbdGameMapping(
      { id: "g", homeCanonicalTeamId: "h", awayCanonicalTeamId: "a", kickoffAt, neutralSite: true },
      [{ provider: "espn", eventId: "e", homeTeamId: "h", awayTeamId: "a", kickoffAt, neutralSite: false }],
    ).reason).toContain("neutral-site");
  });
});