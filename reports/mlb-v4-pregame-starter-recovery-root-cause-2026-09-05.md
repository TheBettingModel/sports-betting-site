# TASK #224C-1 — MLB V4 PREGAME STARTING-PITCHER EVIDENCE RECOVERY & RUN-ENVIRONMENT ROOT-CAUSE AUDIT REPORT

Generated at: 2026-09-05T17:07:06.337Z
Deterministic payload hash: 09c92fa7f8094a9bd89475b079c99cb0f13c60b9223ba88581ccc6effe961db6

## 1. EXECUTIVE SUMMARY

**actualStarterLeakage:** 0

**classification:** C — PROSPECTIVE STARTER FOUNDATION REQUIRED

**historicalStarterCoverage:** 2023–2025: 0 recovered A/B games and 0 slots; no meaningful multi-season foundation

**marketLeakage:** 0

**pitViolations:** 0

**prospectiveCaptureStatus:** PASS — v3 has 15 Sep 5 games / 30 PROBABLE_PREGAME slots; superseded v1/v2 rows are excluded

**recommendedNextTask:** Confirm live MLB evidence is complete enough before building the next model

**rootCauseOfLowRunBias:** Validation underprediction is proven, but no single causal mechanism is isolated. No fundamental target/link/mapping bug was found.

**starterFoundationStatus:** Missing starters are a proven structural omission; aggregate bias contribution is unquantifiable because prior starter metrics are absent.

## 2. #224C ARTIFACT FREEZE

**artifactHashes:** 

```json
{
  "artifact": "cadb433dbbd7bbd26c27489596a779c7373ebdcaa82126df16a0320d7fb1be68",
  "candidates": "a0b65c73737294f9e40b2777e10541ebedd7c09c64985551be45537d3f58243d",
  "diagnostics": "b9273936246141412fd04f751a9724915a78d0fd58eae85f60a5056a80380e88",
  "lock": "c2bf47c951db64363e2f454c1175ae1b6511b78e481f73697b9c588276f9a21b",
  "manifest": "be61541890c85c7790a906cb529171b8bfc726ea79522bd94020ea49cfb8e648",
  "oosForecastSet": "2700408bd6d4c18be4b69c550a6d8d66c3fc5bcded148d039133d706739bff88"
}
```

**forecastImmutability:** true

**frozenPriorBenchmarkFactsOnly:** 

```json
{
  "accuracy": 0.5432,
  "actualAverageTotal": 8.9747,
  "brier": 0.2488,
  "ece": 0.0165,
  "logLoss": 0.6909,
  "marginMae": 3.5898,
  "predictedAverageTotal": 6.9514,
  "totalBias": -2.0233,
  "totalMae": 3.7581,
  "totalRmse": 4.9752
}
```

**model:** 224c-v3-cadb433dbbd7

**oosOpenedMetadata:** 

```json
{
  "futureUse": "HISTORICAL_BENCHMARK_ONLY",
  "gameCount": 2012,
  "opened": true,
  "openedByModel": "224c-v3-cadb433dbbd7",
  "purpose": "FINAL_224C_EVALUATION"
}
```

**status:** RESEARCH_FAILED_NOT_COMPETITIVE

## 3. STARTER SOURCE INVENTORY

**sources:** 

```json
[
  {
    "archivedRawPayload": true,
    "authority": "Official MLB Stats API",
    "coverage": "15 games / 30 slots in authoritative v3",
    "fieldCanChange": true,
    "identityQuality": "official stable game/team/player IDs",
    "licensingOperationalConcerns": "Public API availability/terms and schema stability require monitoring",
    "pitClassification": "A — AUTHORITATIVE PIT-SAFE",
    "rateLimits": "Undocumented; one schedule call/date used",
    "revisionHistory": "append-only snapshots",
    "seasons": "2026 prospective Sep 5",
    "source": "MLB official contemporaneous schedule probablePitcher",
    "timestampProof": "observed_at is strictly before scheduled first pitch"
  },
  {
    "archivedRawPayload": "hash when available",
    "authority": "TBM archived provider observations",
    "coverage": "25 games / 50 PROJECTED slots",
    "fieldCanChange": true,
    "identityQuality": "provider ID/name; weaker than official-ID bridge",
    "licensingOperationalConcerns": "UNAVAILABLE — provider contract metadata not stored in evidence rows",
    "pitClassification": "B — STRONG PIT-SAFE PROXY",
    "rateLimits": "UNAVAILABLE — not recorded in rows",
    "revisionHistory": "one row per feature snapshot/side",
    "seasons": [
      "2026-09-03",
      "2026-09-04"
    ],
    "source": "Legacy TBM prospective starter snapshots",
    "timestampProof": "retrieved_at/effective_at retained"
  },
  {
    "archivedRawPayload": true,
    "authority": "Authoritative outcomes",
    "coverage": "9,393 games / 80,298 appearances in frozen foundation",
    "fieldCanChange": false,
    "identityQuality": "strong actual identity",
    "licensingOperationalConcerns": "Actual identity is prohibited as a pregame substitute",
    "pitClassification": "C — RETROSPECTIVE / ACTUAL-ONLY",
    "rateLimits": "not applicable to persisted tables",
    "revisionHistory": "outcome ledger",
    "seasons": "2023–2026",
    "source": "Historical actual/boxscore and pitcher appearance tables",
    "timestampProof": "completion-time actuality, not pregame proof"
  },
  {
    "archivedRawPayload": "UNAVAILABLE — not accepted",
    "authority": "Non-authoritative/mixed",
    "coverage": 0,
    "fieldCanChange": true,
    "identityQuality": "unverified",
    "licensingOperationalConcerns": "Market firewall and retrospective timestamp risk",
    "pitClassification": "D — UNSAFE / UNVERIFIABLE",
    "rateLimits": "UNAVAILABLE — not called",
    "revisionHistory": "UNAVAILABLE — not proven",
    "seasons": "UNAVAILABLE — not used",
    "source": "Odds payloads and retrospective probable-pitcher/pages",
    "timestampProof": false
  }
]
```

## 4. HISTORICAL PREGAME STARTER COVERAGE

**2023:** 

```json
{
  "ambiguous": 0,
  "confirmed": 0,
  "games": 0,
  "probableProjected": 0,
  "teamStarterSlots": 0,
  "unknown": 0
}
```

**2024:** 

```json
{
  "ambiguous": 0,
  "confirmed": 0,
  "games": 0,
  "probableProjected": 0,
  "teamStarterSlots": 0,
  "unknown": 0
}
```

**2025:** 

```json
{
  "ambiguous": 0,
  "confirmed": 0,
  "games": 0,
  "probableProjected": 0,
  "teamStarterSlots": 0,
  "unknown": 0
}
```

**2026:** 

```json
{
  "authoritativeV3ProspectiveSep5": {
    "games": 15,
    "slots": 30,
    "states": {
      "ACTUAL_ONLY": 0,
      "AMBIGUOUS": 0,
      "CONFIRMED_PREGAME": 0,
      "PROBABLE_PREGAME": 30,
      "PROJECTED_PREGAME": 0,
      "UNKNOWN": 0
    }
  },
  "historicalRecoveredGames": 0,
  "historicalRecoveredSlots": 0,
  "legacyProspectiveSep3To4": {
    "games": 25,
    "slots": 50,
    "states": {
      "PROJECTED": 50
    }
  },
  "supersededV1V2": "PRESERVED BUT EXCLUDED FROM AUTHORITATIVE COVERAGE"
}
```

**totalHistoricalRecovery:** 

```json
{
  "ambiguous": 0,
  "conclusion": "No meaningful multi-season historical A/B foundation",
  "confirmed": 0,
  "games": 0,
  "probableProjected": 0,
  "teamStarterSlots": 0,
  "unknown": 0
}
```

## 5. STARTER IDENTITY

**ambiguous:** 0

**collisions:** 0

**mapping:** Official game/team/player IDs; names are descriptive only; TBM bridge remains NOT_ATTEMPTED

**resolved:** 30

**rookies:** UNAVAILABLE — rookie status is not in schedule evidence

**trades:** UNAVAILABLE — no trade bridge was needed/tested in 15-game capture

**uniquePitchers:** 30

**unresolved:** 0

## 6. STARTER EVIDENCE QUALITY

**actualOnly:** 0

**actualOnlyNeverPromoted:** true

**ambiguous:** 0

**confirmedPregame:** 0

**probablePregame:** 30

**projectedPregame:** 0

**semantics:** 

```json
[
  "CONFIRMED_PREGAME",
  "PROJECTED_PREGAME",
  "PROBABLE_PREGAME",
  "ACTUAL_ONLY",
  "UNKNOWN",
  "AMBIGUOUS"
]
```

**unknown:** 0

## 7. PROBABLE VS ACTUAL

**agreementRate:** UNAVAILABLE — actual outcomes were not read and one snapshot cannot establish changes

**changed:** UNAVAILABLE — one authoritative observation

**diagnosticOnly:** true

**lateScratches:** UNAVAILABLE — one authoritative observation

**matched:** UNAVAILABLE — no postgame comparison was performed

**unknown:** 0

## 8. STARTER PIT FEATURE FOUNDATION

**availableFeatures:** 

```json
[
  "official pregame identity",
  "scheduled first pitch",
  "observed time",
  "side/opponent",
  "state/confidence",
  "raw payload/state hashes"
]
```

**coverage:** Identity-only for 30/30 v3 slots

**earlySeasonPriors:** UNAVAILABLE — no pregame starter metric state was materialized

**futurePITSafeCandidateFeatures:** 

```json
[
  "career/season appearances and starts",
  "season innings",
  "days rest",
  "days since appearance/start",
  "last-start innings/pitches",
  "rolling 3/5-start innings and ERA",
  "season ERA/WHIP/K%/BB%/K-BB%/HR rate",
  "PIT-safe FIP",
  "prior season/career priors",
  "sample size",
  "rookie/missingness/role certainty"
]
```

**leakageAudit:** PASS — strict observed_at < feature_cutoff; actual starters excluded

**missingness:** 

```json
{
  "daysRest": "30/30",
  "recentWorkload": "30/30",
  "starterPitMetrics": "30/30"
}
```

## 9. EXPECTED STARTER WORKLOAD FEASIBILITY

**inputCoverage:** Identity 30/30; workload inputs 0/30

**openerBulkLimitations:** Traditional starter/opener/bulk/bullpen-game/TBD/late-scratch/emergency roles are UNKNOWN

**recommendation:** Accumulate PIT-safe identity, completed-prior-appearance state, pitch counts, rest and role snapshots before workload modeling; do not train now

**targetCoverage:** UNAVAILABLE — target starter innings/BF/pitches were not joined or read

## 10. PROSPECTIVE STARTER CAPTURE

**appendOnly:** New evidence state inserts; no updates

**changeTracking:** changed probable appends coherent two-slot game state and retains old state

**developmentTestResult:** 

```json
{
  "games": 15,
  "pitSafe": true,
  "slots": 30,
  "state": "PROBABLE_PREGAME"
}
```

**idempotence:** game + evidence_state_hash uniqueness

**performanceScale:** 

```json
{
  "archiveSizeBytes": 90696,
  "dbImpact": "30 append-only rows for this capture",
  "indexing": [
    "unique(schema_version, provider, source_record_id, evidence_state_hash)",
    "index(official_game_id, observed_at)",
    "index(scheduled_first_pitch, team_side)"
  ],
  "memoryConcerns": "Low at current schedule-day batch size",
  "rateLimitConcerns": "MLB limit undocumented; cache/archive one response and avoid per-game calls",
  "rowsCreated": 30,
  "runtime": "UNAVAILABLE — not recorded",
  "sourceCalls": "1 per requested date"
}
```

**schema:** 

```json
{
  "days_rest": "nullable",
  "effective_at": "nullable",
  "evidence_checksum": "evidenceChecksum",
  "evidence_state_hash": "evidenceStateHash",
  "feature_cutoff": "featureCutoff",
  "game_id": "officialGameId",
  "identity_confidence": "identityConfidence",
  "identity_provenance": "identityProvenance",
  "metrics_through_time": "nullable",
  "missingness": "missingness",
  "observed_at": "observedAt",
  "opponent_id": "officialOpponentTeamId",
  "pit_safe": "pitSafe",
  "pitcher_id": "officialPlayerId",
  "pitcher_name": "starterName",
  "projected_starter": "starterName",
  "projected_starter_provider_id": "officialPlayerId",
  "raw_payload": "rawGamePayload",
  "raw_payload_hash": "rawGamePayloadHash",
  "reason": "reason/pitSafetyReason",
  "recent_workload": "recentWorkload",
  "sample_sizes": "sampleSizes",
  "scheduled_first_pitch": "scheduledFirstPitch",
  "source": "provider/sourceRecordId",
  "source_record_id": "sourceRecordId",
  "source_timestamp": "nullable",
  "starter_evidence_state": "starterState",
  "starter_pit_metrics": "starterPitMetrics",
  "team_id": "officialTeamId"
}
```

**snapshotTiming:** 

```json
{
  "implemented": "manual/development first-available capture only",
  "productionSchedule": "NOT MODIFIED; cadence requires explicit isolated operational approval",
  "recommendedWithinExistingCapability": [
    "first available",
    "morning",
    "several hours pregame",
    "near model cutoff"
  ]
}
```

**sources:** 

```json
[
  "MLB official contemporaneous schedule"
]
```

## 11. #224C TARGET AUDIT

**conclusion:** No normalization, division, shrink, clipping, inverse-transform, duplicate, wrong-team or wrong-game target bug proven

**targetIntegrity:** 

```json
{
  "arithmeticFailures": 0,
  "duplicateGameIds": 0,
  "expectedCount": 7061,
  "forecastCount": 7061,
  "forecastHashFailures": 0,
  "membershipFailures": 0,
  "nonpositiveExpectedRuns": 0,
  "probabilityNormalizationFailures": 0,
  "rawForecastIdFailures": 0,
  "rawTargetGameCount": 7061,
  "swapsOrMisjoins": {
    "featureSnapshotHashesPresent": 0,
    "rawForecastIdFailures": 0,
    "result": "PROVEN_NO_ID_MISJOIN_IN_DEVELOPMENT_JOIN",
    "sideArithmeticFailures": 0
  },
  "transformsOrClips": {
    "exactForecastContract": "Stored expected-run decimals are hash-bound; total=home+away and margin=home-away were checked.",
    "rawTargetsAreNonnegativeIntegers": 0,
    "targetContract": "Raw integer home/away targets are compared directly; no target transform or clip is applied by this audit."
  }
}
```

**trainActualMeans:** 

```json
{
  "away": 4.514680851063829,
  "distribution": {
    "away": {
      "count": 4700,
      "highScoreFrequency": 0.07702127659574468,
      "highScoreThreshold": 10,
      "mean": 4.514680851063829,
      "median": 4,
      "oneFrequency": 0.10382978723404256,
      "variance": 10.334039791761112,
      "zeroFrequency": 0.06893617021276596
    },
    "byMonth": {
      "2023-04": {
        "away": {
          "count": 338,
          "highScoreFrequency": 0.09763313609467456,
          "highScoreThreshold": 10,
          "mean": 4.680473372781065,
          "median": 4,
          "oneFrequency": 0.07396449704142012,
          "variance": 11.010328770001072,
          "zeroFrequency": 0.09171597633136094
        },
        "home": {
          "count": 338,
          "highScoreFrequency": 0.07100591715976332,
          "highScoreThreshold": 10,
          "mean": 4.547337278106509,
          "median": 4,
          "oneFrequency": 0.08875739644970414,
          "variance": 10.431191134764205,
          "zeroFrequency": 0.0650887573964497
        },
        "total": {
          "count": 338,
          "highScoreFrequency": 0.27514792899408286,
          "highScoreThreshold": 12,
          "mean": 9.227810650887575,
          "median": 9,
          "oneFrequency": 0.03254437869822485,
          "variance": 21.70845733692796,
          "zeroFrequency": 0
        }
      },
      "2023-05": {
        "away": {
          "count": 408,
          "highScoreFrequency": 0.0857843137254902,
          "highScoreThreshold": 10,
          "mean": 4.5661764705882355,
          "median": 4,
          "oneFrequency": 0.10294117647058823,
          "variance": 10.529934400230673,
          "zeroFrequency": 0.0661764705882353
        },
        "home": {
          "count": 408,
          "highScoreFrequency": 0.0784313725490196,
          "highScoreThreshold": 10,
          "mean": 4.571078431372549,
          "median": 4,
          "oneFrequency": 0.1053921568627451,
          "variance": 9.901810601691666,
          "zeroFrequency": 0.05392156862745098
        },
        "total": {
          "count": 408,
          "highScoreFrequency": 0.25980392156862747,
          "highScoreThreshold": 12,
          "mean": 9.137254901960784,
          "median": 9,
          "oneFrequency": 0.00980392156862745,
          "variance": 21.54978854286812,
          "zeroFrequency": 0
        }
      },
      "2023-06": {
        "away": {
          "count": 381,
          "highScoreFrequency": 0.08136482939632546,
          "highScoreThreshold": 10,
          "mean": 4.566929133858268,
          "median": 4,
          "oneFrequency": 0.09711286089238845,
          "variance": 10.549982433298197,
          "zeroFrequency": 0.06299212598425197
        },
        "home": {
          "count": 381,
          "highScoreFrequency": 0.07874015748031496,
          "highScoreThreshold": 10,
          "mean": 4.467191601049869,
          "median": 4,
          "oneFrequency": 0.11811023622047244,
          "variance": 9.765983976412397,
          "zeroFrequency": 0.05774278215223097
        },
        "total": {
          "count": 381,
          "highScoreFrequency": 0.29658792650918636,
          "highScoreThreshold": 12,
          "mean": 9.034120734908136,
          "median": 9,
          "oneFrequency": 0.015748031496062992,
          "variance": 20.153691418493963,
          "zeroFrequency": 0
        }
      },
      "2023-07": {
        "away": {
          "count": 360,
          "highScoreFrequency": 0.08888888888888889,
          "highScoreThreshold": 10,
          "mean": 4.661111111111111,
          "median": 4,
          "oneFrequency": 0.09166666666666666,
          "variance": 10.090709876543176,
          "zeroFrequency": 0.06111111111111111
        },
        "home": {
          "count": 360,
          "highScoreFrequency": 0.07222222222222222,
          "highScoreThreshold": 10,
          "mean": 4.677777777777778,
          "median": 4,
          "oneFrequency": 0.08611111111111111,
          "variance": 9.785061728395066,
          "zeroFrequency": 0.06388888888888888
        },
        "total": {
          "count": 360,
          "highScoreFrequency": 0.29444444444444445,
          "highScoreThreshold": 12,
          "mean": 9.338888888888889,
          "median": 9,
          "oneFrequency": 0.019444444444444445,
          "variance": 21.98515432098765,
          "zeroFrequency": 0
        }
      },
      "2023-08": {
        "away": {
          "count": 408,
          "highScoreFrequency": 0.07598039215686274,
          "highScoreThreshold": 10,
          "mean": 4.590686274509804,
          "median": 4,
          "oneFrequency": 0.09068627450980392,
          "variance": 10.629030901576321,
          "zeroFrequency": 0.08088235294117647
        },
        "home": {
          "count": 408,
          "highScoreFrequency": 0.07598039215686274,
          "highScoreThreshold": 10,
          "mean": 4.75,
          "median": 4,
          "oneFrequency": 0.09313725490196079,
          "variance": 9.628676470588236,
          "zeroFrequency": 0.041666666666666664
        },
        "total": {
          "count": 408,
          "highScoreFrequency": 0.28921568627450983,
          "highScoreThreshold": 12,
          "mean": 9.340686274509803,
          "median": 9,
          "oneFrequency": 0.0196078431372549,
          "variance": 18.71481521530179,
          "zeroFrequency": 0
        }
      },
      "2023-09": {
        "away": {
          "count": 392,
          "highScoreFrequency": 0.08928571428571429,
          "highScoreThreshold": 10,
          "mean": 4.778061224489796,
          "median": 4,
          "oneFrequency": 0.08673469387755102,
          "variance": 10.779824812578068,
          "zeroFrequency": 0.04846938775510204
        },
        "home": {
          "count": 392,
          "highScoreFrequency": 0.07397959183673469,
          "highScoreThreshold": 10,
          "mean": 4.642857142857143,
          "median": 4,
          "oneFrequency": 0.08928571428571429,
          "variance": 10.030612244897974,
          "zeroFrequency": 0.061224489795918366
        },
        "total": {
          "count": 392,
          "highScoreFrequency": 0.30612244897959184,
          "highScoreThreshold": 12,
          "mean": 9.420918367346939,
          "median": 9,
          "oneFrequency": 0.017857142857142856,
          "variance": 20.37639915660141,
          "zeroFrequency": 0
        }
      },
      "2023-10": {
        "away": {
          "count": 58,
          "highScoreFrequency": 0.1206896551724138,
          "highScoreThreshold": 10,
          "mean": 4.603448275862069,
          "median": 4,
          "oneFrequency": 0.13793103448275862,
          "variance": 12.446195005945299,
          "zeroFrequency": 0.08620689655172414
        },
        "home": {
          "count": 58,
          "highScoreFrequency": 0.034482758620689655,
          "highScoreThreshold": 10,
          "mean": 3.4310344827586206,
          "median": 3,
          "oneFrequency": 0.1896551724137931,
          "variance": 6.486623067776458,
          "zeroFrequency": 0.06896551724137931
        },
        "total": {
          "count": 58,
          "highScoreFrequency": 0.15517241379310345,
          "highScoreThreshold": 12,
          "mean": 8.03448275862069,
          "median": 7.5,
          "oneFrequency": 0.034482758620689655,
          "variance": 20.067776456599294,
          "zeroFrequency": 0
        }
      },
      "2023-11": {
        "away": {
          "count": 2,
          "highScoreFrequency": 0.5,
          "highScoreThreshold": 10,
          "mean": 8,
          "median": 8,
          "oneFrequency": 0,
          "variance": 9,
          "zeroFrequency": 0
        },
        "home": {
          "count": 2,
          "highScoreFrequency": 0,
          "highScoreThreshold": 10,
          "mean": 3.5,
          "median": 3.5,
          "oneFrequency": 0,
          "variance": 12.25,
          "zeroFrequency": 0.5
        },
        "total": {
          "count": 2,
          "highScoreFrequency": 0.5,
          "highScoreThreshold": 12,
          "mean": 11.5,
          "median": 11.5,
          "oneFrequency": 0,
          "variance": 42.25,
          "zeroFrequency": 0
        }
      },
      "2024-04": {
        "away": {
          "count": 353,
          "highScoreFrequency": 0.07932011331444759,
          "highScoreThreshold": 10,
          "mean": 4.4164305949008495,
          "median": 4,
          "oneFrequency": 0.11614730878186968,
          "variance": 10.701939667279248,
          "zeroFrequency": 0.0679886685552408
        },
        "home": {
          "count": 353,
          "highScoreFrequency": 0.039660056657223795,
          "highScoreThreshold": 10,
          "mean": 4.15014164305949,
          "median": 4,
          "oneFrequency": 0.10764872521246459,
          "variance": 7.793321509682295,
          "zeroFrequency": 0.0679886685552408
        },
        "total": {
          "count": 353,
          "highScoreFrequency": 0.22946175637393768,
          "highScoreThreshold": 12,
          "mean": 8.56657223796034,
          "median": 8,
          "oneFrequency": 0.014164305949008499,
          "variance": 18.09259363288362,
          "zeroFrequency": 0
        }
      },
      "2024-05": {
        "away": {
          "count": 405,
          "highScoreFrequency": 0.04938271604938271,
          "highScoreThreshold": 10,
          "mean": 4.150617283950617,
          "median": 4,
          "oneFrequency": 0.13333333333333333,
          "variance": 8.55756134735555,
          "zeroFrequency": 0.056790123456790124
        },
        "home": {
          "count": 405,
          "highScoreFrequency": 0.07654320987654321,
          "highScoreThreshold": 10,
          "mean": 4.362962962962963,
          "median": 4,
          "oneFrequency": 0.0962962962962963,
          "variance": 9.184307270233209,
          "zeroFrequency": 0.07654320987654321
        },
        "total": {
          "count": 405,
          "highScoreFrequency": 0.20987654320987653,
          "highScoreThreshold": 12,
          "mean": 8.51358024691358,
          "median": 8,
          "oneFrequency": 0.01728395061728395,
          "variance": 17.54364273738759,
          "zeroFrequency": 0
        }
      },
      "2024-06": {
        "away": {
          "count": 403,
          "highScoreFrequency": 0.07444168734491315,
          "highScoreThreshold": 10,
          "mean": 4.349875930521092,
          "median": 4,
          "oneFrequency": 0.13647642679900746,
          "variance": 10.033914376666308,
          "zeroFrequency": 0.06451612903225806
        },
        "home": {
          "count": 403,
          "highScoreFrequency": 0.05955334987593052,
          "highScoreThreshold": 10,
          "mean": 4.617866004962779,
          "median": 4,
          "oneFrequency": 0.09429280397022333,
          "variance": 8.831641103633425,
          "zeroFrequency": 0.03722084367245657
        },
        "total": {
          "count": 403,
          "highScoreFrequency": 0.2729528535980149,
          "highScoreThreshold": 12,
          "mean": 8.96774193548387,
          "median": 8,
          "oneFrequency": 0.007444168734491315,
          "variance": 18.706155447050353,
          "zeroFrequency": 0
        }
      },
      "2024-07": {
        "away": {
          "count": 360,
          "highScoreFrequency": 0.05277777777777778,
          "highScoreThreshold": 10,
          "mean": 4.583333333333333,
          "median": 4,
          "oneFrequency": 0.09444444444444444,
          "variance": 9.370833333333337,
          "zeroFrequency": 0.075
        },
        "home": {
          "count": 360,
          "highScoreFrequency": 0.08333333333333333,
          "highScoreThreshold": 10,
          "mean": 4.613888888888889,
          "median": 4,
          "oneFrequency": 0.08333333333333333,
          "variance": 11.292584876543211,
          "zeroFrequency": 0.07222222222222222
        },
        "total": {
          "count": 360,
          "highScoreFrequency": 0.2611111111111111,
          "highScoreThreshold": 12,
          "mean": 9.197222222222223,
          "median": 9,
          "oneFrequency": 0.016666666666666666,
          "variance": 19.758325617283976,
          "zeroFrequency": 0
        }
      },
      "2024-08": {
        "away": {
          "count": 405,
          "highScoreFrequency": 0.08148148148148149,
          "highScoreThreshold": 10,
          "mean": 4.604938271604938,
          "median": 4,
          "oneFrequency": 0.0962962962962963,
          "variance": 10.890839811004424,
          "zeroFrequency": 0.06666666666666667
        },
        "home": {
          "count": 405,
          "highScoreFrequency": 0.05925925925925926,
          "highScoreThreshold": 10,
          "mean": 4.382716049382716,
          "median": 4,
          "oneFrequency": 0.08641975308641975,
          "variance": 7.855997561347347,
          "zeroFrequency": 0.05432098765432099
        },
        "total": {
          "count": 405,
          "highScoreFrequency": 0.2641975308641975,
          "highScoreThreshold": 12,
          "mean": 8.987654320987655,
          "median": 9,
          "oneFrequency": 0.019753086419753086,
          "variance": 18.876390794086255,
          "zeroFrequency": 0
        }
      },
      "2024-09": {
        "away": {
          "count": 384,
          "highScoreFrequency": 0.06510416666666667,
          "highScoreThreshold": 10,
          "mean": 4.2734375,
          "median": 4,
          "oneFrequency": 0.12239583333333333,
          "variance": 10.563252766927084,
          "zeroFrequency": 0.08072916666666667
        },
        "home": {
          "count": 384,
          "highScoreFrequency": 0.07291666666666667,
          "highScoreThreshold": 10,
          "mean": 4.158854166666667,
          "median": 4,
          "oneFrequency": 0.109375,
          "variance": 8.982577853732652,
          "zeroFrequency": 0.07552083333333333
        },
        "total": {
          "count": 384,
          "highScoreFrequency": 0.19791666666666666,
          "highScoreThreshold": 12,
          "mean": 8.432291666666666,
          "median": 8,
          "oneFrequency": 0.013020833333333334,
          "variance": 18.55270724826386,
          "zeroFrequency": 0
        }
      },
      "2024-10": {
        "away": {
          "count": 43,
          "highScoreFrequency": 0.046511627906976744,
          "highScoreThreshold": 10,
          "mean": 4.1395348837209305,
          "median": 4,
          "oneFrequency": 0.046511627906976744,
          "variance": 6.864250946457546,
          "zeroFrequency": 0.11627906976744186
        },
        "home": {
          "count": 43,
          "highScoreFrequency": 0.06976744186046512,
          "highScoreThreshold": 10,
          "mean": 4.27906976744186,
          "median": 4,
          "oneFrequency": 0.06976744186046512,
          "variance": 8.945375878853437,
          "zeroFrequency": 0.09302325581395349
        },
        "total": {
          "count": 43,
          "highScoreFrequency": 0.2558139534883721,
          "highScoreThreshold": 12,
          "mean": 8.418604651162791,
          "median": 8,
          "oneFrequency": 0.023255813953488372,
          "variance": 14.755002704164408,
          "zeroFrequency": 0
        }
      }
    },
    "bySeason": {
      "2023": {
        "away": {
          "count": 2347,
          "highScoreFrequency": 0.08734554750745632,
          "highScoreThreshold": 10,
          "mean": 4.6408180656156794,
          "median": 4,
          "oneFrequency": 0.09203238176395398,
          "variance": 10.655393962213058,
          "zeroFrequency": 0.06859821048146571
        },
        "home": {
          "count": 2347,
          "highScoreFrequency": 0.07413719642096293,
          "highScoreThreshold": 10,
          "mean": 4.58116744780571,
          "median": 4,
          "oneFrequency": 0.09927567106945036,
          "variance": 9.872725863311906,
          "zeroFrequency": 0.05752023860247124
        },
        "total": {
          "count": 2347,
          "highScoreFrequency": 0.28376651043885814,
          "highScoreThreshold": 12,
          "mean": 9.221985513421389,
          "median": 9,
          "oneFrequency": 0.019173412867490414,
          "variance": 20.762396909888192,
          "zeroFrequency": 0
        }
      },
      "2024": {
        "away": {
          "count": 2353,
          "highScoreFrequency": 0.06672333191670209,
          "highScoreThreshold": 10,
          "mean": 4.388865278368041,
          "median": 4,
          "oneFrequency": 0.1155971100722482,
          "variance": 9.981805469738154,
          "zeroFrequency": 0.06927326816829579
        },
        "home": {
          "count": 2353,
          "highScoreFrequency": 0.06544836379090523,
          "highScoreThreshold": 10,
          "mean": 4.381640458988525,
          "median": 4,
          "oneFrequency": 0.09562260943476412,
          "variance": 9.00607176703283,
          "zeroFrequency": 0.06417339566510838
        },
        "total": {
          "count": 2353,
          "highScoreFrequency": 0.23969400764980875,
          "highScoreThreshold": 12,
          "mean": 8.770505737356567,
          "median": 8,
          "oneFrequency": 0.014874628134296642,
          "variance": 18.58821636131414,
          "zeroFrequency": 0
        }
      }
    },
    "gameCount": 4700,
    "home": {
      "count": 4700,
      "highScoreFrequency": 0.06978723404255319,
      "highScoreThreshold": 10,
      "mean": 4.4812765957446805,
      "median": 4,
      "oneFrequency": 0.09744680851063829,
      "variance": 9.448798370303265,
      "zeroFrequency": 0.060851063829787236
    },
    "total": {
      "count": 4700,
      "highScoreFrequency": 0.26170212765957446,
      "highScoreThreshold": 12,
      "mean": 8.99595744680851,
      "median": 9,
      "oneFrequency": 0.01702127659574468,
      "variance": 19.724877274785808,
      "zeroFrequency": 0
    }
  },
  "home": 4.4812765957446805,
  "total": 8.99595744680851
}
```

**validationActualMeans:** 

```json
{
  "away": 4.398136382888606,
  "distribution": {
    "away": {
      "count": 2361,
      "highScoreFrequency": 0.08936891147818721,
      "highScoreThreshold": 10,
      "mean": 4.398136382888606,
      "median": 4,
      "oneFrequency": 0.11732316814908937,
      "variance": 11.229035069921569,
      "zeroFrequency": 0.0796272765777213
    },
    "byMonth": {
      "2025-04": {
        "away": {
          "count": 370,
          "highScoreFrequency": 0.07027027027027027,
          "highScoreThreshold": 10,
          "mean": 4.143243243243243,
          "median": 3,
          "oneFrequency": 0.11621621621621622,
          "variance": 10.911913805697573,
          "zeroFrequency": 0.08108108108108109
        },
        "home": {
          "count": 370,
          "highScoreFrequency": 0.07837837837837838,
          "highScoreThreshold": 10,
          "mean": 4.591891891891892,
          "median": 4,
          "oneFrequency": 0.08648648648648649,
          "variance": 9.922636961285619,
          "zeroFrequency": 0.07837837837837838
        },
        "total": {
          "count": 370,
          "highScoreFrequency": 0.24324324324324326,
          "highScoreThreshold": 12,
          "mean": 8.735135135135135,
          "median": 8,
          "oneFrequency": 0.024324324324324326,
          "variance": 20.870387143900658,
          "zeroFrequency": 0
        }
      },
      "2025-05": {
        "away": {
          "count": 401,
          "highScoreFrequency": 0.10224438902743142,
          "highScoreThreshold": 10,
          "mean": 4.384039900249377,
          "median": 4,
          "oneFrequency": 0.13466334164588528,
          "variance": 12.715356247784552,
          "zeroFrequency": 0.09725685785536159
        },
        "home": {
          "count": 401,
          "highScoreFrequency": 0.04987531172069826,
          "highScoreThreshold": 10,
          "mean": 4.124688279301745,
          "median": 4,
          "oneFrequency": 0.14463840399002495,
          "variance": 8.937071286870097,
          "zeroFrequency": 0.057356608478802994
        },
        "total": {
          "count": 401,
          "highScoreFrequency": 0.24688279301745636,
          "highScoreThreshold": 12,
          "mean": 8.508728179551122,
          "median": 8,
          "oneFrequency": 0.02743142144638404,
          "variance": 22.155160726612387,
          "zeroFrequency": 0
        }
      },
      "2025-06": {
        "away": {
          "count": 391,
          "highScoreFrequency": 0.09462915601023018,
          "highScoreThreshold": 10,
          "mean": 4.432225063938619,
          "median": 4,
          "oneFrequency": 0.1329923273657289,
          "variance": 11.340035714052085,
          "zeroFrequency": 0.07672634271099744
        },
        "home": {
          "count": 391,
          "highScoreFrequency": 0.0792838874680307,
          "highScoreThreshold": 10,
          "mean": 4.452685421994885,
          "median": 4,
          "oneFrequency": 0.09718670076726342,
          "variance": 10.462595090299006,
          "zeroFrequency": 0.0792838874680307
        },
        "total": {
          "count": 391,
          "highScoreFrequency": 0.24552429667519182,
          "highScoreThreshold": 12,
          "mean": 8.884910485933505,
          "median": 8,
          "oneFrequency": 0.02557544757033248,
          "variance": 22.766805554647082,
          "zeroFrequency": 0
        }
      },
      "2025-07": {
        "away": {
          "count": 362,
          "highScoreFrequency": 0.07734806629834254,
          "highScoreThreshold": 10,
          "mean": 4.403314917127072,
          "median": 4,
          "oneFrequency": 0.1132596685082873,
          "variance": 10.38429840358963,
          "zeroFrequency": 0.07734806629834254
        },
        "home": {
          "count": 362,
          "highScoreFrequency": 0.07734806629834254,
          "highScoreThreshold": 10,
          "mean": 4.593922651933702,
          "median": 4,
          "oneFrequency": 0.1298342541436464,
          "variance": 8.865487927718945,
          "zeroFrequency": 0.03314917127071823
        },
        "total": {
          "count": 362,
          "highScoreFrequency": 0.26795580110497236,
          "highScoreThreshold": 12,
          "mean": 8.997237569060774,
          "median": 9,
          "oneFrequency": 0.03038674033149171,
          "variance": 18.03590397118525,
          "zeroFrequency": 0
        }
      },
      "2025-08": {
        "away": {
          "count": 418,
          "highScoreFrequency": 0.10526315789473684,
          "highScoreThreshold": 10,
          "mean": 4.6913875598086126,
          "median": 4,
          "oneFrequency": 0.10047846889952153,
          "variance": 11.801887548362023,
          "zeroFrequency": 0.07177033492822966
        },
        "home": {
          "count": 418,
          "highScoreFrequency": 0.07177033492822966,
          "highScoreThreshold": 10,
          "mean": 4.684210526315789,
          "median": 4,
          "oneFrequency": 0.11244019138755981,
          "variance": 10.962477965248043,
          "zeroFrequency": 0.04784688995215311
        },
        "total": {
          "count": 418,
          "highScoreFrequency": 0.2727272727272727,
          "highScoreThreshold": 12,
          "mean": 9.375598086124402,
          "median": 9,
          "oneFrequency": 0.01674641148325359,
          "variance": 23.13883038391978,
          "zeroFrequency": 0
        }
      },
      "2025-09": {
        "away": {
          "count": 375,
          "highScoreFrequency": 0.088,
          "highScoreThreshold": 10,
          "mean": 4.354666666666667,
          "median": 4,
          "oneFrequency": 0.10133333333333333,
          "variance": 10.282211555555554,
          "zeroFrequency": 0.07733333333333334
        },
        "home": {
          "count": 375,
          "highScoreFrequency": 0.06133333333333333,
          "highScoreThreshold": 10,
          "mean": 4.413333333333333,
          "median": 4,
          "oneFrequency": 0.112,
          "variance": 8.770488888888893,
          "zeroFrequency": 0.048
        },
        "total": {
          "count": 375,
          "highScoreFrequency": 0.23733333333333334,
          "highScoreThreshold": 12,
          "mean": 8.768,
          "median": 8,
          "oneFrequency": 0.010666666666666666,
          "variance": 18.81284266666663,
          "zeroFrequency": 0
        }
      },
      "2025-10": {
        "away": {
          "count": 42,
          "highScoreFrequency": 0.047619047619047616,
          "highScoreThreshold": 10,
          "mean": 3.9047619047619047,
          "median": 3,
          "oneFrequency": 0.16666666666666666,
          "variance": 7.60997732426304,
          "zeroFrequency": 0.047619047619047616
        },
        "home": {
          "count": 42,
          "highScoreFrequency": 0.09523809523809523,
          "highScoreThreshold": 10,
          "mean": 4.5,
          "median": 3.5,
          "oneFrequency": 0.11904761904761904,
          "variance": 9.678571428571429,
          "zeroFrequency": 0.023809523809523808
        },
        "total": {
          "count": 42,
          "highScoreFrequency": 0.23809523809523808,
          "highScoreThreshold": 12,
          "mean": 8.404761904761905,
          "median": 7,
          "oneFrequency": 0,
          "variance": 16.431405895691608,
          "zeroFrequency": 0
        }
      },
      "2025-11": {
        "away": {
          "count": 2,
          "highScoreFrequency": 0,
          "highScoreThreshold": 10,
          "mean": 4,
          "median": 4,
          "oneFrequency": 0,
          "variance": 1,
          "zeroFrequency": 0
        },
        "home": {
          "count": 2,
          "highScoreFrequency": 0,
          "highScoreThreshold": 10,
          "mean": 2.5,
          "median": 2.5,
          "oneFrequency": 0.5,
          "variance": 2.25,
          "zeroFrequency": 0
        },
        "total": {
          "count": 2,
          "highScoreFrequency": 0,
          "highScoreThreshold": 12,
          "mean": 6.5,
          "median": 6.5,
          "oneFrequency": 0,
          "variance": 6.25,
          "zeroFrequency": 0
        }
      }
    },
    "bySeason": {
      "2025": {
        "away": {
          "count": 2361,
          "highScoreFrequency": 0.08936891147818721,
          "highScoreThreshold": 10,
          "mean": 4.398136382888606,
          "median": 4,
          "oneFrequency": 0.11732316814908937,
          "variance": 11.229035069921569,
          "zeroFrequency": 0.0796272765777213
        },
        "home": {
          "count": 2361,
          "highScoreFrequency": 0.0698856416772554,
          "highScoreThreshold": 10,
          "mean": 4.47437526471834,
          "median": 4,
          "oneFrequency": 0.11435832274459974,
          "variance": 9.709741509324655,
          "zeroFrequency": 0.056755612028801354
        },
        "total": {
          "count": 2361,
          "highScoreFrequency": 0.25201185938161796,
          "highScoreThreshold": 12,
          "mean": 8.872511647606947,
          "median": 8,
          "oneFrequency": 0.022024565861922914,
          "variance": 21.034572641223743,
          "zeroFrequency": 0
        }
      }
    },
    "gameCount": 2361,
    "home": {
      "count": 2361,
      "highScoreFrequency": 0.0698856416772554,
      "highScoreThreshold": 10,
      "mean": 4.47437526471834,
      "median": 4,
      "oneFrequency": 0.11435832274459974,
      "variance": 9.709741509324655,
      "zeroFrequency": 0.056755612028801354
    },
    "total": {
      "count": 2361,
      "highScoreFrequency": 0.25201185938161796,
      "highScoreThreshold": 12,
      "mean": 8.872511647606947,
      "median": 8,
      "oneFrequency": 0.022024565861922914,
      "variance": 21.034572641223743,
      "zeroFrequency": 0
    }
  },
  "home": 4.47437526471834,
  "total": 8.872511647606947
}
```

**violations:** 0

## 12. FEATURE SCALE AUDIT

**completeFeatureAudit:** 

```json
[
  {
    "coefficient": -0.08965849365947665,
    "directionality": "the batting team whose expected runs are the target",
    "group": "ownOffense",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "priorGames",
    "transform": null,
    "unit": "count"
  },
  {
    "coefficient": 0.03728934094959448,
    "directionality": "the batting team whose expected runs are the target",
    "group": "ownOffense",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "seasonGames",
    "transform": null,
    "unit": "count"
  },
  {
    "coefficient": -0.029297262900802024,
    "directionality": "the batting team whose expected runs are the target",
    "group": "ownOffense",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "runsPerGame5",
    "transform": null,
    "unit": "numeric"
  },
  {
    "coefficient": 0.019943588963958144,
    "directionality": "the batting team whose expected runs are the target",
    "group": "ownOffense",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "runsPerGame10",
    "transform": null,
    "unit": "numeric"
  },
  {
    "coefficient": 0.017612602276773505,
    "directionality": "the batting team whose expected runs are the target",
    "group": "ownOffense",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "runsPerGame20",
    "transform": null,
    "unit": "numeric"
  },
  {
    "coefficient": -0.0030343559865095575,
    "directionality": "the batting team whose expected runs are the target",
    "group": "ownOffense",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "runsPerGame30",
    "transform": null,
    "unit": "numeric"
  },
  {
    "coefficient": 0.052228819624098186,
    "directionality": "the batting team whose expected runs are the target",
    "group": "ownOffense",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "seasonRunsPerGame",
    "transform": null,
    "unit": "runs per game"
  },
  {
    "coefficient": 0.0013134064208615043,
    "directionality": "the batting team whose expected runs are the target",
    "group": "ownOffense",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "homeAwayRunsPerGame",
    "transform": null,
    "unit": "runs per game"
  },
  {
    "coefficient": -0.004386337448478288,
    "directionality": "point-in-time league state plus isHome for that batting side",
    "group": "leagueEnvironment",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "isHome",
    "transform": null,
    "unit": "binary 0/1"
  },
  {
    "coefficient": -0.08965849365947665,
    "directionality": "point-in-time league state plus isHome for that batting side",
    "group": "leagueEnvironment",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "priorGames",
    "transform": null,
    "unit": "count"
  },
  {
    "coefficient": -0.004939676645324189,
    "directionality": "point-in-time league state plus isHome for that batting side",
    "group": "leagueEnvironment",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "runsPerTeamGame7d",
    "transform": null,
    "unit": "runs per game"
  },
  {
    "coefficient": -0.004234451425536344,
    "directionality": "point-in-time league state plus isHome for that batting side",
    "group": "leagueEnvironment",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "runsPerTeamGame14d",
    "transform": null,
    "unit": "runs per game"
  },
  {
    "coefficient": 0.03225792488102696,
    "directionality": "point-in-time league state plus isHome for that batting side",
    "group": "leagueEnvironment",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "runsPerTeamGame30d",
    "transform": null,
    "unit": "runs per game"
  },
  {
    "coefficient": -0.0751174854783854,
    "directionality": "point-in-time league state plus isHome for that batting side",
    "group": "leagueEnvironment",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "seasonRunsPerTeamGame",
    "transform": null,
    "unit": "numeric"
  },
  {
    "coefficient": 0.07253929458301106,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenSeasonInnings",
    "transform": null,
    "unit": "innings"
  },
  {
    "coefficient": 0.007818022004219934,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenSeasonEra",
    "transform": null,
    "unit": "runs per game"
  },
  {
    "coefficient": 0.016194331191860305,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenSeasonWhip",
    "transform": null,
    "unit": "WHIP"
  },
  {
    "coefficient": -0.021414307287179395,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenSeasonKPct",
    "transform": null,
    "unit": "proportion (0–1)"
  },
  {
    "coefficient": 0.04859219983688817,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenSeasonBbPct",
    "transform": null,
    "unit": "proportion (0–1)"
  },
  {
    "coefficient": -0.03961075760558122,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenSeasonKMinusBbPct",
    "transform": null,
    "unit": "proportion (0–1)"
  },
  {
    "coefficient": 0.046938923632494724,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenSeasonHrRate",
    "transform": null,
    "unit": "home runs per inning"
  },
  {
    "coefficient": -0.08929670093042366,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenSeasonFip",
    "transform": null,
    "unit": "runs per game"
  },
  {
    "coefficient": -0.019704466333246115,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenLast3Innings",
    "transform": null,
    "unit": "innings"
  },
  {
    "coefficient": 0.023296968560628534,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenLast5Innings",
    "transform": null,
    "unit": "innings"
  },
  {
    "coefficient": 0.01440181660971999,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenLast10Era",
    "transform": null,
    "unit": "runs per game"
  },
  {
    "coefficient": 0.05846314472095651,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenPitchesLast1d",
    "transform": null,
    "unit": "pitches"
  },
  {
    "coefficient": -0.039819359961232446,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenPitchesLast2d",
    "transform": null,
    "unit": "pitches"
  },
  {
    "coefficient": -0.014829387996615373,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenPitchesLast3d",
    "transform": null,
    "unit": "pitches"
  },
  {
    "coefficient": -0.0441378020294153,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenInningsLast1d",
    "transform": null,
    "unit": "numeric"
  },
  {
    "coefficient": 0.02305711439922156,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenInningsLast2d",
    "transform": null,
    "unit": "numeric"
  },
  {
    "coefficient": 0.014178587754427487,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenInningsLast3d",
    "transform": null,
    "unit": "numeric"
  },
  {
    "coefficient": -0.0010715158526349443,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "relieversUsedLast1d",
    "transform": null,
    "unit": "numeric"
  },
  {
    "coefficient": 0.008304326868626252,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "relieversUsedLast2d",
    "transform": null,
    "unit": "numeric"
  },
  {
    "coefficient": 0.015313823531718215,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "backToBackRelievers",
    "transform": null,
    "unit": "count"
  },
  {
    "coefficient": -0.0020818599203224273,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "threeDayRelievers",
    "transform": null,
    "unit": "count"
  },
  {
    "coefficient": -0.06968581681606249,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "sourceGameCount",
    "transform": null,
    "unit": "count"
  },
  {
    "coefficient": -0.022104780975875385,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenSampleSize",
    "transform": null,
    "unit": "count"
  },
  {
    "coefficient": 0,
    "directionality": "the opposing team bullpen snapshot; own bullpen is never an offense input",
    "group": "opponentBullpen",
    "imputation": "Persisted model contract: deterministic TRAIN-derived median where nullable; no missing indicators",
    "missingness": "Reported in featureAuditByCohortSideGroup from TRAIN/VALIDATION raw feature rows",
    "name": "bullpenFeatureCompleteness",
    "transform": null,
    "unit": "numeric"
  }
]
```

**issuesChecked:** 

```json
[
  "units",
  "TRAIN-only standardization",
  "median imputation",
  "sign/directionality",
  "runs/game vs runs/inning",
  "per-nine vs raw",
  "percentage decimal scale",
  "home/away reversal",
  "opponent bullpen mapping",
  "offense/defense inversion",
  "double baseline shrink",
  "double division"
]
```

**issuesFound:** No fundamental scale/mapping defect proven; coefficients/features are hash-bound. Broad centering limitations remain strongly supported.

## 13. NB2 ARCHITECTURE AUDIT

**averagePredictedAwayLambda:** 4.0661524589238764

**averagePredictedHomeLambda:** 4.021581169033423

**baselineLambda:** exp(intercept) only when all transformed covariates are zero; unavailable if intercept is not separately persisted

**exposure:** NONE_PERSISTED

**findings:** No fundamental expected-run link/intercept implementation bug proven; log-link outputs are positive and arithmetic/hash checks pass

**intercept:** UNAVAILABLE

**link:** log

**offsets:** NONE_PERSISTED

**regularization:** 

```json
{
  "dispersionAlpha": 0.5,
  "ridgeLambda": 10
}
```

## 14. RIDGE / DISPERSION DIAGNOSTIC

**evidenceScope:** Existing 15-candidate TRAIN/VALIDATION evidence only; no tuning

**findings:** 

```json
[
  "Lambda 10 was selected under the frozen rule; candidate comparison below shows existing shrinkage behavior.",
  "TRAIN/VALIDATION counts are overdispersed, supporting NB2 variance treatment.",
  "Alpha affects variance, not a two-run aggregate mean correction; it does not explain run-total bias.",
  "No new lambda, alpha, prior, or coefficient was selected."
]
```

## 15. OFFENSE AUDIT

**centering:** POSSIBLE contributor; development residual patterns do not isolate offense from correlated run-environment/context effects

**findings:** Development underprediction persists across broad periods; no unit, sign, normalization or target mapping bug was proven, and attribution remains unresolved

**missingness:** Reported per feature/cohort/side in section 12 completeFeatureAudit source diagnostics

**monthBehavior:** 

```json
{
  "2023-04": {
    "actualMean": 4.613905325443787,
    "games": 338,
    "leaguePriorMean": 4.6252702303063975,
    "offensePriorMean": 4.6384181722315505,
    "predictedMean": 4.549998650601625,
    "residualMean": 0.06390667484216284
  },
  "2023-05": {
    "actualMean": 4.568627450980392,
    "games": 408,
    "leaguePriorMean": 4.588146379047631,
    "offensePriorMean": 4.587062296009147,
    "predictedMean": 4.5774921773875,
    "residualMean": -0.008864726407107781
  },
  "2023-06": {
    "actualMean": 4.517060367454068,
    "games": 381,
    "leaguePriorMean": 4.5595301907380685,
    "offensePriorMean": 4.552112745497299,
    "predictedMean": 4.610834254127954,
    "residualMean": -0.09377388667388598
  },
  "2023-07": {
    "actualMean": 4.669444444444444,
    "games": 360,
    "leaguePriorMean": 4.593206331082791,
    "offensePriorMean": 4.590855763930519,
    "predictedMean": 4.671338409159022,
    "residualMean": -0.0018939647145774785
  },
  "2023-08": {
    "actualMean": 4.670343137254902,
    "games": 408,
    "leaguePriorMean": 4.594667440941332,
    "offensePriorMean": 4.592500736569474,
    "predictedMean": 4.576016262304294,
    "residualMean": 0.09432687495060765
  },
  "2023-09": {
    "actualMean": 4.7104591836734695,
    "games": 392,
    "leaguePriorMean": 4.62632970738395,
    "offensePriorMean": 4.6361421606650985,
    "predictedMean": 4.679826918638269,
    "residualMean": 0.030632265035200668
  },
  "2023-10": {
    "actualMean": 4.017241379310345,
    "games": 58,
    "leaguePriorMean": 4.615141795506419,
    "offensePriorMean": 4.892773199615164,
    "predictedMean": 4.532369144131034,
    "residualMean": -0.5151277648206891
  },
  "2023-11": {
    "actualMean": 5.75,
    "games": 2,
    "leaguePriorMean": 4.609448956915915,
    "offensePriorMean": 5.033343232143757,
    "predictedMean": 4.403478784525,
    "residualMean": 1.3465212154749997
  },
  "2024-04": {
    "actualMean": 4.28328611898017,
    "games": 353,
    "leaguePriorMean": 4.523358057871218,
    "offensePriorMean": 4.539435511596249,
    "predictedMean": 4.2920429021203965,
    "residualMean": -0.008756783140226432
  },
  "2024-05": {
    "actualMean": 4.25679012345679,
    "games": 405,
    "leaguePriorMean": 4.345250839561569,
    "offensePriorMean": 4.348638481736073,
    "predictedMean": 4.42322155784556,
    "residualMean": -0.16643143438876962
  },
  "2024-06": {
    "actualMean": 4.483870967741935,
    "games": 403,
    "leaguePriorMean": 4.348509148865567,
    "offensePriorMean": 4.347544570427336,
    "predictedMean": 4.48002863488263,
    "residualMean": 0.003842332859305131
  },
  "2024-07": {
    "actualMean": 4.598611111111111,
    "games": 360,
    "leaguePriorMean": 4.3952933191686885,
    "offensePriorMean": 4.395373406489222,
    "predictedMean": 4.465565653884302,
    "residualMean": 0.13304545722680938
  },
  "2024-08": {
    "actualMean": 4.493827160493828,
    "games": 405,
    "leaguePriorMean": 4.433069777194146,
    "offensePriorMean": 4.434943323303994,
    "predictedMean": 4.389427067075432,
    "residualMean": 0.10440009341839573
  },
  "2024-09": {
    "actualMean": 4.216145833333333,
    "games": 384,
    "leaguePriorMean": 4.426347369835808,
    "offensePriorMean": 4.425403826943913,
    "predictedMean": 4.27484106753776,
    "residualMean": -0.05869523420442668
  },
  "2024-10": {
    "actualMean": 4.209302325581396,
    "games": 43,
    "leaguePriorMean": 4.398051890834173,
    "offensePriorMean": 4.795422488298154,
    "predictedMean": 4.234585410277906,
    "residualMean": -0.025283084696510194
  },
  "2025-04": {
    "actualMean": 4.367567567567567,
    "games": 370,
    "leaguePriorMean": 4.312019260407489,
    "offensePriorMean": 4.30941909179289,
    "predictedMean": 4.106733912955805,
    "residualMean": 0.260833654611762
  },
  "2025-05": {
    "actualMean": 4.254364089775561,
    "games": 401,
    "leaguePriorMean": 4.336943431043551,
    "offensePriorMean": 4.330503126096271,
    "predictedMean": 4.075898339093276,
    "residualMean": 0.17846575068228532
  },
  "2025-06": {
    "actualMean": 4.442455242966752,
    "games": 391,
    "leaguePriorMean": 4.30654869730158,
    "offensePriorMean": 4.3105856359470645,
    "predictedMean": 4.029970007852557,
    "residualMean": 0.412485235114195
  },
  "2025-07": {
    "actualMean": 4.498618784530387,
    "games": 362,
    "leaguePriorMean": 4.36641589220705,
    "offensePriorMean": 4.3670937500613185,
    "predictedMean": 4.1008564105381256,
    "residualMean": 0.39776237399226133
  },
  "2025-08": {
    "actualMean": 4.687799043062201,
    "games": 418,
    "leaguePriorMean": 4.41603701523935,
    "offensePriorMean": 4.412492161398869,
    "predictedMean": 4.004145106435883,
    "residualMean": 0.6836539366263183
  },
  "2025-09": {
    "actualMean": 4.384,
    "games": 375,
    "leaguePriorMean": 4.458298805441469,
    "offensePriorMean": 4.457485191044164,
    "predictedMean": 3.968912221630798,
    "residualMean": 0.4150877783692022
  },
  "2025-10": {
    "actualMean": 4.2023809523809526,
    "games": 42,
    "leaguePriorMean": 4.435650081993378,
    "offensePriorMean": 4.869489827663342,
    "predictedMean": 3.8807604021250004,
    "residualMean": 0.32162055025595215
  },
  "2025-11": {
    "actualMean": 3.25,
    "games": 2,
    "leaguePriorMean": 4.432465771379025,
    "offensePriorMean": 5.036965199784663,
    "predictedMean": 4.17389892855,
    "residualMean": -0.9238989285499999
  }
}
```

**seasonBehavior:** 

```json
{
  "2023": {
    "actualMean": 4.6109927567106945,
    "games": 2347,
    "leaguePriorMean": 4.597819780829872,
    "offensePriorMean": 4.606444546049633,
    "predictedMean": 4.608912307393439,
    "residualMean": 0.002080449317255706
  },
  "2024": {
    "actualMean": 4.3852528686782835,
    "games": 2353,
    "leaguePriorMean": 4.409500062656569,
    "offensePriorMean": 4.4197724145330435,
    "predictedMean": 4.386270784264354,
    "residualMean": -0.0010179155860701172
  },
  "2025": {
    "actualMean": 4.4362558238034735,
    "games": 2361,
    "leaguePriorMean": 4.36763756680224,
    "offensePriorMean": 4.37438158067479,
    "predictedMean": 4.043866813978529,
    "residualMean": 0.39238900982494407
  }
}
```

## 16. BULLPEN AUDIT

**directionality:** Opponent bullpen is defensive evidence affecting scoring team

**fatigue:** Included where available in persisted schema; missingness retained in diagnostics

**findings:** 

```json
{
  "contract": "the opposing team bullpen snapshot; own bullpen is never an offense input",
  "limitation": "Proof is schema/artifact-contract level; row-level mappings are not read by this diagnostic.",
  "persistedSchema": [
    "bullpenSeasonInnings",
    "bullpenSeasonEra",
    "bullpenSeasonWhip",
    "bullpenSeasonKPct",
    "bullpenSeasonBbPct",
    "bullpenSeasonKMinusBbPct",
    "bullpenSeasonHrRate",
    "bullpenSeasonFip",
    "bullpenLast3Innings",
    "bullpenLast5Innings",
    "bullpenLast10Era",
    "bullpenPitchesLast1d",
    "bullpenPitchesLast2d",
    "bullpenPitchesLast3d",
    "bullpenInningsLast1d",
    "bullpenInningsLast2d",
    "bullpenInningsLast3d",
    "relieversUsedLast1d",
    "relieversUsedLast2d",
    "backToBackRelievers",
    "threeDayRelievers",
    "sourceGameCount",
    "bullpenSampleSize",
    "bullpenFeatureCompleteness"
  ],
  "rank": "PROVEN"
}
```

**opponentMapping:** PROVEN contract: home expected runs use away bullpen; away expected runs use home bullpen

**quality:** No own-bullpen use, double-count, sign inversion, or ERA direction bug proven

## 17. STARTER ABSENCE DIAGNOSTIC

**actualStarterHindsightUsedForTrainingOrTuning:** false

**biasContribution:** UNAVAILABLE — prior starter FIP/ERA/WHIP coverage is zero in the actual-only snapshots

**conclusion:** Missing starters are a PROVEN structural omission and likely limit matchup discrimination, but their aggregate bias contribution is unquantifiable because prior starter metrics are absent

**diagnosticOnly:** true

**evidence:** 

```json
{
  "coverage": {
    "developmentGames": 7061,
    "matchedOpponentStarter": 14122,
    "scoringSides": 14122,
    "snapshotRows": 14122,
    "teamSideRows": 14122
  },
  "diagnosticOnly": true,
  "identityKnownVsUnknown": {
    "ACTUAL_ONLY": {
      "count": 14122,
      "mean": 0.1315561692919207,
      "variance": 9.954418926887321
    },
    "UNKNOWN": {
      "count": 0,
      "mean": null,
      "variance": null
    }
  },
  "join": "home scoring residual -> away actual starter; away scoring residual -> home actual starter",
  "pearsonResidualVsPrior": {
    "seasonEra": {
      "coverage": 0,
      "pearsonResidualCorrelation": null
    },
    "seasonFip": {
      "coverage": 0,
      "pearsonResidualCorrelation": null
    },
    "seasonWhip": {
      "coverage": 0,
      "pearsonResidualCorrelation": null
    }
  },
  "prohibitedFeatureUse": true,
  "qualityBins": {
    "definition": "opponent actual-starter prior season FIP: <=3.50, 3.51–4.50, >4.50; missing separately",
    "residual": {
      "FIP_3_51_TO_4_50": {
        "count": 0,
        "mean": null,
        "variance": null
      },
      "FIP_GT_4_50": {
        "count": 0,
        "mean": null,
        "variance": null
      },
      "FIP_LE_3_50": {
        "count": 0,
        "mean": null,
        "variance": null
      },
      "MISSING_FIP": {
        "count": 14122,
        "mean": 0.1315561692919207,
        "variance": 9.954418926887321
      }
    }
  },
  "source": "TRAIN/VALIDATION mlb_historical_pregame_pitcher_snapshots, authoritative v5 artifact only",
  "status": "COMPUTED_DEVELOPMENT_ONLY"
}
```

**residualRelationship:** 

```json
{
  "seasonEra": {
    "coverage": 0,
    "pearsonResidualCorrelation": null
  },
  "seasonFip": {
    "coverage": 0,
    "pearsonResidualCorrelation": null
  },
  "seasonWhip": {
    "coverage": 0,
    "pearsonResidualCorrelation": null
  }
}
```

**varianceContribution:** UNAVAILABLE — known-vs-unknown comparison has no informative prior-metric variation

## 18. LEAGUE RUN ENVIRONMENT

**actual:** actualMean fields

**bias:** residualMean = actual - predicted fields

**bySeasonMonth:** 

```json
{
  "byMonth": {
    "2023-04": {
      "actualMean": 4.613905325443787,
      "games": 338,
      "leaguePriorMean": 4.6252702303063975,
      "offensePriorMean": 4.6384181722315505,
      "predictedMean": 4.549998650601625,
      "residualMean": 0.06390667484216284
    },
    "2023-05": {
      "actualMean": 4.568627450980392,
      "games": 408,
      "leaguePriorMean": 4.588146379047631,
      "offensePriorMean": 4.587062296009147,
      "predictedMean": 4.5774921773875,
      "residualMean": -0.008864726407107781
    },
    "2023-06": {
      "actualMean": 4.517060367454068,
      "games": 381,
      "leaguePriorMean": 4.5595301907380685,
      "offensePriorMean": 4.552112745497299,
      "predictedMean": 4.610834254127954,
      "residualMean": -0.09377388667388598
    },
    "2023-07": {
      "actualMean": 4.669444444444444,
      "games": 360,
      "leaguePriorMean": 4.593206331082791,
      "offensePriorMean": 4.590855763930519,
      "predictedMean": 4.671338409159022,
      "residualMean": -0.0018939647145774785
    },
    "2023-08": {
      "actualMean": 4.670343137254902,
      "games": 408,
      "leaguePriorMean": 4.594667440941332,
      "offensePriorMean": 4.592500736569474,
      "predictedMean": 4.576016262304294,
      "residualMean": 0.09432687495060765
    },
    "2023-09": {
      "actualMean": 4.7104591836734695,
      "games": 392,
      "leaguePriorMean": 4.62632970738395,
      "offensePriorMean": 4.6361421606650985,
      "predictedMean": 4.679826918638269,
      "residualMean": 0.030632265035200668
    },
    "2023-10": {
      "actualMean": 4.017241379310345,
      "games": 58,
      "leaguePriorMean": 4.615141795506419,
      "offensePriorMean": 4.892773199615164,
      "predictedMean": 4.532369144131034,
      "residualMean": -0.5151277648206891
    },
    "2023-11": {
      "actualMean": 5.75,
      "games": 2,
      "leaguePriorMean": 4.609448956915915,
      "offensePriorMean": 5.033343232143757,
      "predictedMean": 4.403478784525,
      "residualMean": 1.3465212154749997
    },
    "2024-04": {
      "actualMean": 4.28328611898017,
      "games": 353,
      "leaguePriorMean": 4.523358057871218,
      "offensePriorMean": 4.539435511596249,
      "predictedMean": 4.2920429021203965,
      "residualMean": -0.008756783140226432
    },
    "2024-05": {
      "actualMean": 4.25679012345679,
      "games": 405,
      "leaguePriorMean": 4.345250839561569,
      "offensePriorMean": 4.348638481736073,
      "predictedMean": 4.42322155784556,
      "residualMean": -0.16643143438876962
    },
    "2024-06": {
      "actualMean": 4.483870967741935,
      "games": 403,
      "leaguePriorMean": 4.348509148865567,
      "offensePriorMean": 4.347544570427336,
      "predictedMean": 4.48002863488263,
      "residualMean": 0.003842332859305131
    },
    "2024-07": {
      "actualMean": 4.598611111111111,
      "games": 360,
      "leaguePriorMean": 4.3952933191686885,
      "offensePriorMean": 4.395373406489222,
      "predictedMean": 4.465565653884302,
      "residualMean": 0.13304545722680938
    },
    "2024-08": {
      "actualMean": 4.493827160493828,
      "games": 405,
      "leaguePriorMean": 4.433069777194146,
      "offensePriorMean": 4.434943323303994,
      "predictedMean": 4.389427067075432,
      "residualMean": 0.10440009341839573
    },
    "2024-09": {
      "actualMean": 4.216145833333333,
      "games": 384,
      "leaguePriorMean": 4.426347369835808,
      "offensePriorMean": 4.425403826943913,
      "predictedMean": 4.27484106753776,
      "residualMean": -0.05869523420442668
    },
    "2024-10": {
      "actualMean": 4.209302325581396,
      "games": 43,
      "leaguePriorMean": 4.398051890834173,
      "offensePriorMean": 4.795422488298154,
      "predictedMean": 4.234585410277906,
      "residualMean": -0.025283084696510194
    },
    "2025-04": {
      "actualMean": 4.367567567567567,
      "games": 370,
      "leaguePriorMean": 4.312019260407489,
      "offensePriorMean": 4.30941909179289,
      "predictedMean": 4.106733912955805,
      "residualMean": 0.260833654611762
    },
    "2025-05": {
      "actualMean": 4.254364089775561,
      "games": 401,
      "leaguePriorMean": 4.336943431043551,
      "offensePriorMean": 4.330503126096271,
      "predictedMean": 4.075898339093276,
      "residualMean": 0.17846575068228532
    },
    "2025-06": {
      "actualMean": 4.442455242966752,
      "games": 391,
      "leaguePriorMean": 4.30654869730158,
      "offensePriorMean": 4.3105856359470645,
      "predictedMean": 4.029970007852557,
      "residualMean": 0.412485235114195
    },
    "2025-07": {
      "actualMean": 4.498618784530387,
      "games": 362,
      "leaguePriorMean": 4.36641589220705,
      "offensePriorMean": 4.3670937500613185,
      "predictedMean": 4.1008564105381256,
      "residualMean": 0.39776237399226133
    },
    "2025-08": {
      "actualMean": 4.687799043062201,
      "games": 418,
      "leaguePriorMean": 4.41603701523935,
      "offensePriorMean": 4.412492161398869,
      "predictedMean": 4.004145106435883,
      "residualMean": 0.6836539366263183
    },
    "2025-09": {
      "actualMean": 4.384,
      "games": 375,
      "leaguePriorMean": 4.458298805441469,
      "offensePriorMean": 4.457485191044164,
      "predictedMean": 3.968912221630798,
      "residualMean": 0.4150877783692022
    },
    "2025-10": {
      "actualMean": 4.2023809523809526,
      "games": 42,
      "leaguePriorMean": 4.435650081993378,
      "offensePriorMean": 4.869489827663342,
      "predictedMean": 3.8807604021250004,
      "residualMean": 0.32162055025595215
    },
    "2025-11": {
      "actualMean": 3.25,
      "games": 2,
      "leaguePriorMean": 4.432465771379025,
      "offensePriorMean": 5.036965199784663,
      "predictedMean": 4.17389892855,
      "residualMean": -0.9238989285499999
    }
  },
  "bySeason": {
    "2023": {
      "actualMean": 4.6109927567106945,
      "games": 2347,
      "leaguePriorMean": 4.597819780829872,
      "offensePriorMean": 4.606444546049633,
      "predictedMean": 4.608912307393439,
      "residualMean": 0.002080449317255706
    },
    "2024": {
      "actualMean": 4.3852528686782835,
      "games": 2353,
      "leaguePriorMean": 4.409500062656569,
      "offensePriorMean": 4.4197724145330435,
      "predictedMean": 4.386270784264354,
      "residualMean": -0.0010179155860701172
    },
    "2025": {
      "actualMean": 4.4362558238034735,
      "games": 2361,
      "leaguePriorMean": 4.36763756680224,
      "offensePriorMean": 4.37438158067479,
      "predictedMean": 4.043866813978529,
      "residualMean": 0.39238900982494407
    }
  }
}
```

**featurePrior:** leaguePriorMean fields

**finding:** The model is underpredicted on development data, but offense versus run-environment attribution is not isolated; no future-data entry was found

**predicted:** predictedMean fields

## 19. HOME/AWAY AUDIT

**actualAway:** 4.398136382888606

**actualHome:** 4.47437526471834

**awayBias:** -0.33198392396473086

**finding:** Both sides contribute; no home/away reversal is proven

**homeBias:** -0.4527940956849081

**predictedAway:** 4.0661524589238764

**predictedHome:** 4.021581169033423

## 20. EARLY-SEASON AUDIT

**actual:** 4.387472527472528

**bias:** 0.05079603981386871

**laterSeason:** 

```json
{
  "actualMean": 4.520058503969913,
  "games": 4786,
  "leaguePriorMean": 4.461385390955611,
  "offensePriorMean": 4.47242412363922,
  "predictedMean": 4.350113430674105,
  "residualMean": 0.16994507329580788
}
```

**predicted:** 4.336676487658659

**priorBehavior:** Early priors are limited/stale-centering candidates; no mis-scaling bug proven

## 21. CANDIDATE FAMILY COMPARISON

**allUnderpredictedTotals:** true

**candidates:** 

```json
[
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.27087259631869687,
    "candidate": "ridge-linear-lambda-0-alpha-none",
    "family": "ridge-linear",
    "logLoss": 0.7557017932349696,
    "marginMae": 3.5523557350407975,
    "predictedAvgTotal": 3.9619344279102684,
    "totalBias": -4.9105772196966795,
    "totalMae": 5.304602524367388
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.27075377865063593,
    "candidate": "ridge-linear-lambda-1-alpha-none",
    "family": "ridge-linear",
    "logLoss": 0.755140216568428,
    "marginMae": 3.552089279917327,
    "predictedAvgTotal": 3.961650481362525,
    "totalBias": -4.910861166244429,
    "totalMae": 5.303280421010994
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.2697353774556192,
    "candidate": "ridge-linear-lambda-10-alpha-none",
    "family": "ridge-linear",
    "logLoss": 0.7522945379502818,
    "marginMae": 3.549343884753794,
    "predictedAvgTotal": 3.959982699526487,
    "totalBias": -4.912528948080458,
    "totalMae": 5.304104319345616
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.24925258706571685,
    "candidate": "poisson-lambda-0-alpha-none",
    "family": "poisson",
    "logLoss": 0.692060050952862,
    "marginMae": 3.526100990064475,
    "predictedAvgTotal": 8.05369902720026,
    "totalBias": -0.8188126204066761,
    "totalMae": 3.6103725519554715
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.2493309282762194,
    "candidate": "poisson-lambda-1-alpha-none",
    "family": "poisson",
    "logLoss": 0.6922043035665741,
    "marginMae": 3.5270536778198487,
    "predictedAvgTotal": 8.05492472322438,
    "totalBias": -0.8175869243825868,
    "totalMae": 3.609628760891558
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.24932602547655328,
    "candidate": "poisson-lambda-10-alpha-none",
    "family": "poisson",
    "logLoss": 0.6921982713222946,
    "marginMae": 3.5270361839124864,
    "predictedAvgTotal": 8.056056702082651,
    "totalBias": -0.8164549455242844,
    "totalMae": 3.6095668435988655
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.24920952927738663,
    "candidate": "nb2-lambda-0-alpha-0.1",
    "family": "nb2",
    "logLoss": 0.6919479951678292,
    "marginMae": 3.526199837261947,
    "predictedAvgTotal": 8.069263629102949,
    "totalBias": -0.8032480185040084,
    "totalMae": 3.609704608739045
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.2492864116023381,
    "candidate": "nb2-lambda-1-alpha-0.1",
    "family": "nb2",
    "logLoss": 0.6920904889006083,
    "marginMae": 3.527115543934269,
    "predictedAvgTotal": 8.069864747797048,
    "totalBias": -0.8026468998099114,
    "totalMae": 3.609103338670332
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.24927858433464548,
    "candidate": "nb2-lambda-10-alpha-0.1",
    "family": "nb2",
    "logLoss": 0.6920799465504686,
    "marginMae": 3.5270972268080265,
    "predictedAvgTotal": 8.071373430128782,
    "totalBias": -0.8011382174781616,
    "totalMae": 3.6090210731200743
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.24917859539192153,
    "candidate": "nb2-lambda-0-alpha-0.25",
    "family": "nb2",
    "logLoss": 0.6918693078197383,
    "marginMae": 3.526254944937783,
    "predictedAvgTotal": 8.078556382567173,
    "totalBias": -0.7939552650397723,
    "totalMae": 3.6093386752156693
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.2492539761107968,
    "candidate": "nb2-lambda-1-alpha-0.25",
    "family": "nb2",
    "logLoss": 0.6920095601997739,
    "marginMae": 3.527144429423073,
    "predictedAvgTotal": 8.078789706825582,
    "totalBias": -0.7937219407813607,
    "totalMae": 3.6087751542687676
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.2492413591068455,
    "candidate": "nb2-lambda-10-alpha-0.25",
    "family": "nb2",
    "logLoss": 0.6919912687771944,
    "marginMae": 3.527125142779993,
    "predictedAvgTotal": 8.080838383548402,
    "totalBias": -0.7916732640585364,
    "totalMae": 3.608664378746583
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.2491542838420219,
    "candidate": "nb2-lambda-0-alpha-0.5",
    "family": "nb2",
    "logLoss": 0.691808612301996,
    "marginMae": 3.5262878691383532,
    "predictedAvgTotal": 8.084740568344607,
    "totalBias": -0.787771079262347,
    "totalMae": 3.609107782165519
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.2492281463136002,
    "candidate": "nb2-lambda-1-alpha-0.5",
    "family": "nb2",
    "logLoss": 0.6919465549648326,
    "marginMae": 3.5271571516203286,
    "predictedAvgTotal": 8.084781043885558,
    "totalBias": -0.787730603721387,
    "totalMae": 3.6085467982255133
  },
  {
    "actualAvgTotal": 8.872511647606947,
    "brier": 0.24920706453115296,
    "candidate": "nb2-lambda-10-alpha-0.5",
    "family": "nb2",
    "logLoss": 0.6919140615575532,
    "marginMae": 3.527136130561173,
    "predictedAvgTotal": 8.08773362795731,
    "totalBias": -0.7847780196496407,
    "totalMae": 3.608377702013107
  }
]
```

**count:** 15

**countModelsOnly:** false

**linearModelsCenteredBetter:** See exact bias column; diagnosis only

**selectedDespiteBias:** true

## 22. MODEL-SELECTION AUDIT

**frozenSelectionRule:** 

```json
{
  "eligibility": "zero integrity and numerical issues",
  "lockedOosFailureFlags": {
    "absoluteTotalBias": "<=0.25",
    "baselineRegression": "selected model total MAE must not exceed the frozen home/away baseline",
    "numericalIssues": "zero",
    "validationCollapse": "OOS total MAE degradation versus validation <=0.50"
  },
  "oosUsedForSelection": false,
  "primary": "validation total MAE ascending",
  "provisionalFailureFlags": {
    "absoluteTotalBias": "<=0.25",
    "baselineImprovement": "total MAE improvement over home/away baseline must be >=0.02",
    "numericalIssues": "zero",
    "severeFoldInstability": "worst fold total MAE degradation versus aggregate <=0.50"
  },
  "tieBreakers": [
    "absolute total bias",
    "Brier",
    "log loss",
    "ECE",
    "worst-fold degradation",
    "simplicity"
  ],
  "tieTolerance": 0.02
}
```

**implementationCorrect:** true

**issues:** 

```json
[]
```

**proof:** PROVEN_BY_HASH-VERIFIED_PERSISTED_CANDIDATE_DIAGNOSTICS

**selectedModel:** nb2-lambda-10-alpha-0.5 / 224c-v3-cadb433dbbd7

## 23. DISTRIBUTION / PROBABILITY AUDIT

**calibrationInterpretation:** Low ECE does not prove discrimination. Conservative probabilities clustered near 50% can calibrate while Brier/log loss and accuracy remain weak.

**normalization:** 

```json
{
  "failures": 0,
  "tolerance": 1e-12
}
```

**poissonMapping:** PROVEN probability-only mismatch: NB2 mean model paired with independent Poisson score mapping; not a cause of run totals

**probabilitySpread:** 

```json
{
  "favoriteShare50To55": 0.5484963998305803,
  "favoriteShare55To60": 0.3269800931808556,
  "favoriteShare60To65": 0.08979246082168572,
  "favoriteShare65Plus": 0.03473104616687844,
  "max": 0.792159344316542,
  "meanHomeProbability": 0.5247166123332327,
  "min": 0.182175338299966,
  "standardDeviation": 0.0647738546538816
}
```

**tieHandling:** Home-win evaluation defines a tie as non-home-win; independent score convolution mapping is persisted model behavior.

## 24. ROOT-CAUSE CONCLUSION

**rankedCauses:** 

```json
[
  {
    "cause": "Validation expected runs are below actual runs",
    "rank": 1,
    "support": "PROVEN OBSERVATION; NOT CAUSAL ATTRIBUTION"
  },
  {
    "cause": "Missing PIT-safe pregame starter identity and prior performance state",
    "rank": 2,
    "support": "PROVEN structural omission; causal magnitude UNQUANTIFIABLE"
  },
  {
    "cause": "Offense centering, run-environment lag, regularization, and incomplete context may contribute; current diagnostics do not isolate them",
    "rank": 3,
    "support": "POSSIBLE"
  },
  {
    "cause": "NB2 mean model plus independent Poisson score mapping",
    "rank": 4,
    "support": "PROVEN probability-only mismatch; NOT run-bias cause"
  },
  {
    "cause": "Fundamental target/link/inverse-link, game/team join, bullpen mapping, arithmetic, hash, or probability-normalization bug",
    "rank": 5,
    "support": "NOT SUPPORTED"
  }
]
```

## 25. PARK / WEATHER / LINEUP / ADVANCED DATA

**advancedPitching:** 

```json
{
  "barrelRate": "UNAVAILABLE",
  "FIP": "RECONSTRUCTABLE_PIT_SAFE from prior completed appearances",
  "hardHitRate": "UNAVAILABLE",
  "K-BB%": "RECONSTRUCTABLE_PIT_SAFE",
  "pitchMix": "UNAVAILABLE",
  "SIERA": "UNAVAILABLE",
  "spin": "UNAVAILABLE",
  "velocity": "UNAVAILABLE",
  "xERA": "RETROSPECTIVE_ONLY/UNPROVEN",
  "xFIP": "UNAVAILABLE"
}
```

**lineup:** 

```json
{
  "pitClassification": "UNKNOWN; actual order is ACTUAL_ONLY",
  "status": "UNAVAILABLE — no historical confirmed/projected lineup archive with timestamp proof established"
}
```

**park:** 

```json
{
  "pitClassification": "UNAVAILABLE/DEFERRED",
  "status": "UNAVAILABLE — no historical timestamped park-factor artifact established"
}
```

**weather:** 

```json
{
  "pitClassification": "UNAVAILABLE/DEFERRED",
  "status": "UNAVAILABLE — no timestamped pregame temperature/wind/humidity/precipitation/roof history established"
}
```

## 26. FUTURE DATA TIERS

**baselineCore:** 

```json
[
  "PIT-safe offense",
  "opponent bullpen",
  "league environment",
  "home context"
]
```

**enhanced:** 

```json
[
  "only proven PIT-safe lineup",
  "park",
  "weather",
  "advanced pitching"
]
```

**minimumNextFoundation:** OFFENSE + BULLPEN + PREGAME STARTER + LEAGUE ENVIRONMENT + HOME CONTEXT

**starterCore:** 

```json
[
  "baseline core",
  "PIT-safe pregame starter identity",
  "starter prior state",
  "expected workload/role",
  "missingness/sample size"
]
```

## 27. NEW EVALUATION PROTOCOL

**opened2012GameCohort:** SPENT — HISTORICAL_BENCHMARK_ONLY; never untouched OOS again

**prohibition:** Do not relabel inspected outcomes or use the 2,012 cohort for features, priors, family, shrinkage, starter adjustment, run-environment correction, distribution, or calibration choices

**protocol:** 

```json
[
  "historical TRAIN",
  "historical VALIDATION",
  "freeze model",
  "genuinely future prospective shadow games unused in development",
  "promotion decision"
]
```

## 28. MARKET FIREWALL

**marketForecastFeatures:** 0

**prohibited:** 

```json
[
  "moneylines",
  "run lines",
  "totals",
  "opening/closing prices",
  "implied probability",
  "consensus",
  "sharp books",
  "line movement",
  "CLV"
]
```

**status:** PASS

## 29. PIT / LEAKAGE AUDIT

**actualStarterLeakage:** 0

**cutoffRule:** observed_at < feature_cutoff

**futureInformation:** 0

**marketLeakage:** 0

**oosReadFirewall:** Reporter performs no OOS outcome, feature, forecast, or evaluation query

**openedOosMisuse:** 0

**targetLeakage:** 0

## 30. DETERMINISM

**artifact:** reports/mlb-v4-pregame-starter-recovery-root-cause-2026-09-05.json

**candidateHash:** a0b65c73737294f9e40b2777e10541ebedd7c09c64985551be45537d3f58243d

**diagnosticsHash:** b9273936246141412fd04f751a9724915a78d0fd58eae85f60a5056a80380e88

**hash:** Stored as reportHash over payload excluding generatedAt and reportHash

**mismatchCount:** 0

**persistedEvidenceChecksumsRecomputed:** 30/30

**secondRun:** Verification evidence controls this field; stable source state yields identical payload hash

## 31. TESTS / BUILD

**exactCommandsResults:** 

```json
[
  {
    "command": "pnpm --filter @workspace/api-server exec vitest run src/services/mlbStarterEvidence224C.test.ts src/services/mlbExpectedRuns224C.test.ts src/services/mlbV4ExpectedRuns.test.ts src/services/mlbHistoricalChronology.test.ts src/services/mlbHistoricalPitFoundation.test.ts src/services/mlbHistoricalSource.test.ts src/services/mlbHistoricalIdentity.test.ts src/services/mlbHistoricalPitchingOutcomes.test.ts src/services/mlbHistoricalPitchingReplay.test.ts src/services/mlbPointInTime.test.ts src/services/mlbBullpen.test.ts src/services/mlbLineups.test.ts",
    "name": "Focused MLB starter/PIT/chronology/model checks",
    "result": "12 files; 63 tests passed",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/api-server test",
    "name": "Full API test suite",
    "result": "81 files; 500 tests passed",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/api-server run typecheck",
    "name": "API TypeScript",
    "result": "tsc --noEmit completed without errors",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/db exec tsc -p tsconfig.json --noEmit",
    "name": "Database TypeScript",
    "result": "tsc --noEmit completed without errors",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/api-server run build",
    "name": "API production bundle",
    "result": "esbuild completed successfully",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/db run push",
    "name": "Development schema application",
    "result": "Additive schema applied; unsafe non-null projection was refused and replaced by a nullable legacy-compatible projection",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/api-server run guard:mlb-historical-pit",
    "name": "Append-only guard installation",
    "result": "24 MLB historical/research tables guarded",
    "status": "PASS"
  },
  {
    "command": "UPDATE mlb_pregame_starter_evidence_snapshots SET reason=reason WHERE id=(SELECT MIN(id) FROM mlb_pregame_starter_evidence_snapshots)",
    "name": "Append-only mutation guard",
    "result": "Database rejected UPDATE: MLB historical foundation is append-only",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/api-server run capture:mlb-224c1-starters -- 2026-09-05",
    "name": "Prospective capture",
    "result": "Authoritative v3 capture: 15 games, 30 PROBABLE_PREGAME slots, one schedule call, 0 after-cutoff games; observed_at was recorded after response receipt",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/api-server run capture:mlb-224c1-starters -- 2026-09-05",
    "name": "Prospective capture idempotence",
    "result": "0 inserted; 15 unchanged games skipped",
    "status": "PASS"
  },
  {
    "command": "SELECT SUM(pg_column_size(raw_game_payload)) FROM mlb_pregame_starter_evidence_snapshots WHERE schema_version='mlb-starter-evidence-224c-v3'",
    "name": "Prospective capture archive size",
    "result": "49,404 bytes across 30 authoritative v3 rows",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/api-server run freeze:mlb-224c1",
    "name": "Research disposition freeze",
    "result": "Exactly one RESEARCH_FAILED_NOT_COMPETITIVE / HISTORICAL_BENCHMARK_ONLY fact remains",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/api-server run audit:mlb-224c1-root-cause (twice)",
    "name": "TRAIN/VALIDATION root-cause diagnostics",
    "result": "Both runs produced diagnosticsHash b9273936246141412fd04f751a9724915a78d0fd58eae85f60a5056a80380e88 and identical file SHA-256 422aa4e086b0fbc95f12e60d4949835a9d6f3af05fef05c3cbf8c59a8c1e4a22",
    "status": "PASS"
  },
  {
    "command": "pnpm --filter @workspace/api-server run audit:mlb-v4-expected-runs",
    "name": "Frozen #224C integrity",
    "result": "All violation categories zero; determinismHash 969a5fded14392137a439121a7021fe1978fc489dd80fcb9330838d912a96be2",
    "status": "PASS"
  },
  {
    "command": "pnpm run security:signing-credentials",
    "name": "Signing credential scan",
    "result": "No Apple signing credential artifacts or local key configuration found",
    "status": "PASS"
  },
  {
    "command": "git for-each-ref --format='%(refname)' | grep '^refs/replit/agent$'",
    "name": "Protected Replit Git-ref blocker",
    "result": "Protected refs/replit/agent is absent; no Git history was modified",
    "status": "PASS"
  },
  {
    "command": "git diff --check",
    "name": "Diff whitespace validation",
    "result": "No whitespace errors",
    "status": "PASS"
  },
  {
    "command": "Scope review",
    "name": "Production and cross-sport boundary",
    "result": "No production routing, scheduler, UI, entitlement, push, non-MLB sport, deployment, Apple, or EAS changes",
    "status": "PASS"
  },
  {
    "command": "Read-only architect review of final diff and 36-section report",
    "name": "Independent post-capture compliance review",
    "result": "PIT receipt timing, schema-backed atomic idempotence, checksum integrity, OOS firewall, causal claims, classification C, and hard-stop boundaries passed",
    "status": "PASS"
  }
]
```

**mutationGuardStatus:** PASS (required before report generation)

**note:** This section reads reports/mlb-224c1-verification.json; unavailable or missing guard status is a hard refusal

## 32. CROSS-SPORT REGRESSION

**NBAUnchanged:** true

**ncaafTodayOnlyUnchanged:** true

**NCAAFUnchanged:** true

**NFLUnchanged:** true

**nflV4NotStarted:** true

**NHLUnchanged:** true

**SoccerUnchanged:** true

**UFCUnchanged:** true

**WNBAUnchanged:** true

## 33. PRODUCTION STATE

**analyticsUnchanged:** true

**deploymentNotRun:** true

**failed224CModelUnchanged:** true

**mlbV1Unchanged:** true

**picksThresholdsUnitsUnchanged:** true

**publicationUnchanged:** true

**pushNotRun:** true

**sixPickCapUnchanged:** true

**uiUnchanged:** true

## 34. RISKS / LIMITATIONS

**CRITICAL:** 

```json
[
  "The 2,012-game 2026 cohort is opened/spent and cannot support new development or promotion claims"
]
```

**HIGH:** 

```json
[
  "2023–2025 A/B historical pregame recovery is zero",
  "No meaningful multi-season starter foundation",
  "Starter prior metrics/workload/role are absent, so aggregate bias contribution is unquantifiable"
]
```

**LOW:** 

```json
[
  "Park/weather/lineup/advanced inputs remain deferred",
  "Legacy 25-game evidence uses weaker PROJECTED proxy semantics"
]
```

**MEDIUM:** 

```json
[
  "Only 15 authoritative v3 games/30 slots from one date",
  "Probable-to-actual agreement, scratches and change rates unavailable",
  "Official API rate limit/SLA/licensing details are not recorded"
]
```

## 35. FINAL CLASSIFICATION

**classification:** C — PROSPECTIVE STARTER FOUNDATION REQUIRED

**explanation:** Legitimate historical pregame starter evidence cannot be recovered safely at sufficient multi-season scale. Actual-starter hindsight remains prohibited. Prospective v3 capture works but is only a one-day foundation.

## 36. NEXT RECOMMENDED TASK

**executeNow:** false

**notProposedOrStarted:** #224C-2 — MLB V4 STARTER-AWARE EXPECTED-RUNS CHALLENGER

**purpose:** Continue the existing project task as a prospective accumulation/readiness gate

**task:** Confirm live MLB evidence is complete enough before building the next model

**taskCount:** 1

