#222B FINAL

CANONICAL BASELINE D:
tbm-ncaaf-v4-expected-score — D-simple-expected-score-linear

SELECTED CHALLENGER:
expanded-ridge-k4-r36 (evaluated; not recommended over Baseline D)

MODEL FAMILY:
Expanded PIT-safe ridge expected-score regression

TRAINING ROWS:
1,590

VALIDATION ROWS:
398

OOS ROWS:
410

BASELINE D OOS MARGIN MAE:
12.500839176319078

CHALLENGER OOS MARGIN MAE:
12.477528239789445

BASELINE D OOS BRIER:
0.18002337158123566

CHALLENGER RAW OOS BRIER:
0.18151327646693538

CHALLENGER CALIBRATED OOS BRIER:
0.18264045123691613

BASELINE D OOS LOG LOSS:
0.534791746210304

CHALLENGER RAW OOS LOG LOSS:
0.5375745864791811

CHALLENGER CALIBRATED OOS LOG LOSS:
0.5392105045033949

OVERALL OOS IMPROVEMENT:
INCONCLUSIVE

2026 FEATURE COMPATIBILITY:
PARTIAL

2026 INTERNAL CHALLENGER PREDICTIONS:
531

PIT VIOLATIONS:
0

MARKET LEAKAGE VIOLATIONS:
0

MODEL REGISTRY:
CHALLENGER / UNVALIDATED; champion FALSE; publication FALSE

CHAMPION CHANGED:
NO

PUBLICATION CHANGED:
NO

NFL CHANGED:
NO

FINAL DECISION:
C. #222B PARTIAL — ONE SPECIFIC MODEL OR 2026 COMPATIBILITY BLOCKER REMAINS

NEXT TASK:
Complete the missing pre-cutoff ESPN→CFBD identity mappings for 249 future targets, rerun the exact feature bridge to PASS, and do not begin #223 before that gate passes.


# NCAAF V4 Distinct Challenger & 2026 Feature Bridge — 2026-09-04

## 1. Executive summary

Validation selected expanded-ridge-k4-r36, but its 0.19% OOS margin-MAE improvement is noise-sized and its probability, away-score, and total metrics regress. Baseline D remains the recommended V4 core. The sole advancement blocker is PARTIAL 2026 compatibility: 249 future ESPN targets lack an unambiguous pre-cutoff ESPN→CFBD team identity mapping.

## 2. Canonical Baseline D reconciliation

```json
{
  "artifact": "reports/ncaaf-v4-expected-score-engine-2026-09-04-v5.json",
  "definition": "D-simple-expected-score-linear; unregularized 9-feature score regressions",
  "trainingData": {
    "datasetVersion": "ncaaf-v4-training-foundation-v2",
    "featureSchemaVersion": "ncaaf-chronological-team-game-v2",
    "trainingSeasons": [
      2023,
      2024
    ],
    "trainingRows": 1590,
    "validation": "2025 weeks 1-7",
    "validationRows": 398,
    "oos": "2025 week 8+",
    "oosRows": 410,
    "splitChecksum": "7cee52d5188179d81a177aa55b9ac54e06211f11ed8a5b0d29b032ff94095abc"
  },
  "features": [
    "intercept",
    "own shrunk season offense",
    "opponent shrunk season defense",
    "signed pregame Elo difference / 100",
    "home-field indicator",
    "own games / 10",
    "opponent games / 10",
    "own offense missing indicator",
    "opponent offense missing indicator"
  ],
  "configurationHash": "212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86",
  "parameterHash": "792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81",
  "parameters": {
    "population": 26.75377358490566,
    "home": [
      -11.284640418764887,
      0.7065291857711262,
      0.6770761047168204,
      3.238166931711907,
      2.857558473807069,
      1.5562489683604726,
      -1.141354401811279,
      2.765905815639973,
      0.2379189460597022
    ],
    "away": [
      -6.390629393488659,
      0.5580070209466887,
      0.6579598163903937,
      3.614514496162292,
      1.0437802354578911,
      -2.579561874362595,
      2.965556586994427,
      -1.6553424913644657,
      -3.259891712038205
    ]
  },
  "validation": {
    "homeMae": 10.287789973117736,
    "homeRmse": 12.874284947623016,
    "awayMae": 8.978018169051618,
    "awayRmse": 11.054095929130463,
    "marginMae": 13.83860742671156,
    "marginRmse": 17.73646710672768,
    "totalMae": 12.883931882198755,
    "totalRmse": 16.16472189732905,
    "brier": 0.19456976319930142,
    "logLoss": 0.5680802771897671,
    "count": 398
  },
  "probabilityReconciliation": "baseline table fixed normal margin sigma=14; final V4 derives training margin RMSE and applies declared sample/missing uncertainty multiplier",
  "oos": {
    "homeMae": 9.282625676397423,
    "awayMae": 8.498563584442126,
    "marginMae": 12.500839176319078,
    "totalMae": 12.939009077926592,
    "brier": 0.18002337158123566,
    "logLoss": 0.534791746210304,
    "count": 410
  },
  "tableProbabilityMetrics": {
    "brier": 0.17828391985262818,
    "logLoss": 0.5279580658139891
  }
}
```

## 3. Dataset/split identity

```json
{
  "training": 1590,
  "validation": 398,
  "oos": 410,
  "checksum": "7cee52d5188179d81a177aa55b9ac54e06211f11ed8a5b0d29b032ff94095abc"
}
```

## 4. Expanded feature set

```json
[
  "shrunk season offense/defense",
  "last-3 and last-5",
  "trend and prior-season",
  "opponent adjustment and Elo",
  "home/neutral context",
  "sample/missing indicators",
  "limited matchup interactions"
]
```

## 5. Shrinkage experiments

```json
[
  {
    "name": "expanded-ridge-k2-r36",
    "k": 2,
    "marginMae": 13.732276434385625,
    "brier": 0.19373372664928426,
    "logLoss": 0.5683743964134286
  },
  {
    "name": "expanded-huber-irls-k2-r12",
    "k": 2,
    "marginMae": 13.763949639079238,
    "brier": 0.19426242631184903,
    "logLoss": 0.5696671320123018
  },
  {
    "name": "expanded-ridge-k4-r36",
    "k": 4,
    "marginMae": 13.661092909892131,
    "brier": 0.19275045924571368,
    "logLoss": 0.5657109655116221
  },
  {
    "name": "expanded-huber-irls-k4-r12",
    "k": 4,
    "marginMae": 13.691606445216948,
    "brier": 0.19325551198194396,
    "logLoss": 0.5668838801113759
  },
  {
    "name": "expanded-ridge-k8-r36",
    "k": 8,
    "marginMae": 13.701036630374555,
    "brier": 0.19321727923489676,
    "logLoss": 0.5666775004973885
  },
  {
    "name": "expanded-huber-irls-k8-r12",
    "k": 8,
    "marginMae": 13.712638794490143,
    "brier": 0.19360890120753455,
    "logLoss": 0.5675291272475232
  }
]
```

## 6. Home-field treatment

Global home-field and explicit neutral context; no team-specific home effects.

## 7. Challenger families

Controlled expanded ridge and deterministic Huber IRLS; no unsupported algorithm added.

## 8. Complexity controls

Predetermined k={2,4,8}; ridge={36} for expanded ridge and {12} for Huber; fixed compact feature projection.

## 9. Validation scorecard

```json
{
  "scorecard": {
    "primary": [
      "marginMae",
      "brier",
      "logLoss"
    ],
    "secondary": [
      "homeMae",
      "awayMae",
      "totalMae",
      "stability"
    ],
    "selection": "validation only; OOS unavailable until frozen configuration",
    "stabilityGate": {
      "minimumRowsPerEligibleBucket": 20,
      "maximumEligibleMarginMaeRange": 10,
      "maximumEligibleBrierRange": 0.15,
      "requiredDimensions": [
        "week",
        "earlyLater",
        "site",
        "dataQuality",
        "probabilityBand",
        "sampleCountBand"
      ],
      "rule": "Every dimension needs at least two eligible >=20-row buckets; eligible margin-MAE and Brier ranges must not exceed declared maxima. Smaller buckets are reported but not evidence."
    },
    "stabilityGatePassed": true
  },
  "stability": {
    "gate": {
      "minimumRowsPerEligibleBucket": 20,
      "maximumEligibleMarginMaeRange": 10,
      "maximumEligibleBrierRange": 0.15,
      "requiredDimensions": [
        "week",
        "earlyLater",
        "site",
        "dataQuality",
        "probabilityBand",
        "sampleCountBand"
      ],
      "rule": "Every dimension needs at least two eligible >=20-row buckets; eligible margin-MAE and Brier ranges must not exceed declared maxima. Smaller buckets are reported but not evidence."
    },
    "dimensions": [
      {
        "name": "week",
        "buckets": [
          {
            "bucket": "week-1",
            "count": 94,
            "metrics": {
              "homeMae": 11.78670704717385,
              "homeRmse": 14.265882777385174,
              "awayMae": 9.356697041815973,
              "awayRmse": 11.388698883869573,
              "marginMae": 14.48529422747261,
              "marginRmse": 18.29276512105568,
              "totalMae": 15.00293232467343,
              "totalRmse": 18.215666103576414,
              "brier": 0.21923052105343435,
              "logLoss": 0.6313974143244928,
              "count": 94
            }
          },
          {
            "bucket": "week-2",
            "count": 50,
            "metrics": {
              "homeMae": 10.524723909396975,
              "homeRmse": 13.601135851845356,
              "awayMae": 8.591877520888197,
              "awayRmse": 10.563178258910714,
              "marginMae": 13.423234022328353,
              "marginRmse": 18.06003178186496,
              "totalMae": 13.855225437760987,
              "totalRmse": 16.339477189242675,
              "brier": 0.15086999667710652,
              "logLoss": 0.4586640522197953,
              "count": 50
            }
          },
          {
            "bucket": "week-3",
            "count": 47,
            "metrics": {
              "homeMae": 10.9955589317999,
              "homeRmse": 13.604021160176533,
              "awayMae": 8.962692374782627,
              "awayRmse": 10.385664115622962,
              "marginMae": 15.512490994983784,
              "marginRmse": 19.316168687958314,
              "totalMae": 11.864921978966882,
              "totalRmse": 14.585898975259557,
              "brier": 0.17132457514683663,
              "logLoss": 0.5095293618571467,
              "count": 47
            }
          },
          {
            "bucket": "week-4",
            "count": 50,
            "metrics": {
              "homeMae": 10.396848043797075,
              "homeRmse": 12.736188795683262,
              "awayMae": 9.341739245718932,
              "awayRmse": 11.645914141327902,
              "marginMae": 14.266565931105683,
              "marginRmse": 18.30457034328109,
              "totalMae": 12.61963917616169,
              "totalRmse": 16.143678236412313,
              "brier": 0.20280108801404162,
              "logLoss": 0.576483926271784,
              "count": 50
            }
          },
          {
            "bucket": "week-5",
            "count": 51,
            "metrics": {
              "homeMae": 8.61837060508912,
              "homeRmse": 11.203286014022224,
              "awayMae": 8.43461252913382,
              "awayRmse": 10.599461717570037,
              "marginMae": 10.153078619300485,
              "marginRmse": 13.932957918950247,
              "totalMae": 13.18947297050965,
              "totalRmse": 16.78085504547366,
              "brier": 0.18861428025709626,
              "logLoss": 0.5528105855256747,
              "count": 51
            }
          },
          {
            "bucket": "week-6",
            "count": 50,
            "metrics": {
              "homeMae": 8.1673014871761,
              "homeRmse": 10.467867264185514,
              "awayMae": 8.112091702368032,
              "awayRmse": 9.969518480200321,
              "marginMae": 12.805454865112484,
              "marginRmse": 15.419622429531668,
              "totalMae": 10.251619393858116,
              "totalRmse": 13.422754251866824,
              "brier": 0.189066125565989,
              "logLoss": 0.5621363171126429,
              "count": 50
            }
          },
          {
            "bucket": "week-7",
            "count": 56,
            "metrics": {
              "homeMae": 9.473715093198352,
              "homeRmse": 11.664176356061875,
              "awayMae": 9.150100004547344,
              "awayRmse": 11.928479387315688,
              "marginMae": 14.354294526406193,
              "marginRmse": 18.431984117627845,
              "totalMae": 11.513265983734765,
              "totalRmse": 14.729060479384662,
              "brier": 0.19122198889129402,
              "logLoss": 0.5674768776972825,
              "count": 56
            }
          }
        ],
        "eligibleBuckets": [
          "week-1",
          "week-2",
          "week-3",
          "week-4",
          "week-5",
          "week-6",
          "week-7"
        ],
        "marginMaeRange": 5.3594123756832985,
        "brierRange": 0.06836052437632784,
        "pass": true
      },
      {
        "name": "earlyLater",
        "buckets": [
          {
            "bucket": "early-weeks-1-3",
            "count": 191,
            "metrics": {
              "homeMae": 11.261664542925589,
              "homeRmse": 13.932946172447597,
              "awayMae": 9.05952847952825,
              "awayRmse": 10.935456309799754,
              "marginMae": 14.460033692476857,
              "marginRmse": 18.490040755196087,
              "totalMae": 13.930304939365415,
              "totalRmse": 16.897951957764302,
              "brier": 0.18954672170041623,
              "logLoss": 0.556190783061665,
              "count": 191
            }
          },
          {
            "bucket": "later-weeks-4-7",
            "count": 207,
            "metrics": {
              "homeMae": 9.170398176943532,
              "homeRmse": 11.548992586670646,
              "awayMae": 8.76938351036147,
              "awayRmse": 11.087894673719552,
              "marginMae": 12.923906004222125,
              "marginRmse": 16.676363245624675,
              "totalMae": 11.888738865150394,
              "totalRmse": 15.31470486248177,
              "brier": 0.19285565386485942,
              "logLoss": 0.5647490685124569,
              "count": 207
            }
          }
        ],
        "eligibleBuckets": [
          "early-weeks-1-3",
          "later-weeks-4-7"
        ],
        "marginMaeRange": 1.536127688254732,
        "brierRange": 0.0033089321644431957,
        "pass": true
      },
      {
        "name": "site",
        "buckets": [
          {
            "bucket": "home",
            "count": 348,
            "metrics": {
              "homeMae": 10.09946337563064,
              "homeRmse": 12.703589591614822,
              "awayMae": 8.98128011961173,
              "awayRmse": 11.129308066003862,
              "marginMae": 13.780977520777592,
              "marginRmse": 17.769783223297868,
              "totalMae": 12.682577851604435,
              "totalRmse": 15.959955428427978,
              "brier": 0.18737922607935284,
              "logLoss": 0.5520773970912867,
              "count": 348
            }
          },
          {
            "bucket": "neutral",
            "count": 50,
            "metrics": {
              "homeMae": 10.692741912132828,
              "homeRmse": 13.059174450928273,
              "awayMae": 8.402936892196763,
              "awayRmse": 10.18396121535595,
              "marginMae": 12.826696018129303,
              "marginRmse": 16.112122566480235,
              "totalMae": 14.16240192293164,
              "totalRmse": 16.99734429709601,
              "brier": 0.2183314703838134,
              "logLoss": 0.620251251181775,
              "count": 50
            }
          }
        ],
        "eligibleBuckets": [
          "home",
          "neutral"
        ],
        "marginMaeRange": 0.9542815026482891,
        "brierRange": 0.030952244304460558,
        "pass": true
      },
      {
        "name": "dataQuality",
        "buckets": [
          {
            "bucket": "HIGH",
            "count": 50,
            "metrics": {
              "homeMae": 10.562576071522358,
              "homeRmse": 13.13743773435147,
              "awayMae": 9.323031219167115,
              "awayRmse": 10.880016591495597,
              "marginMae": 12.60521708097818,
              "marginRmse": 15.641428533693027,
              "totalMae": 15.053382444298135,
              "totalRmse": 18.36517835295199,
              "brier": 0.20797219647606674,
              "logLoss": 0.5986412542360917,
              "count": 50
            }
          },
          {
            "bucket": "INSUFFICIENT",
            "count": 53,
            "metrics": {
              "homeMae": 12.528895003434295,
              "homeRmse": 14.980769272290537,
              "awayMae": 9.330553048164164,
              "awayRmse": 11.701991225498526,
              "marginMae": 16.02255483780149,
              "marginRmse": 20.2899886901018,
              "totalMae": 14.744104616096376,
              "totalRmse": 17.63622556609091,
              "brier": 0.20675329928242267,
              "logLoss": 0.6006747670560569,
              "count": 53
            }
          },
          {
            "bucket": "LOW",
            "count": 102,
            "metrics": {
              "homeMae": 10.472844288944948,
              "homeRmse": 13.146320528425356,
              "awayMae": 9.600798742164407,
              "awayRmse": 11.548551851818933,
              "marginMae": 14.679702828361924,
              "marginRmse": 18.84130069277739,
              "totalMae": 13.079839224300155,
              "totalRmse": 16.043533738701175,
              "brier": 0.1782571443558941,
              "logLoss": 0.5271970059342436,
              "count": 102
            }
          },
          {
            "bucket": "MEDIUM",
            "count": 193,
            "metrics": {
              "homeMae": 9.268704632619569,
              "homeRmse": 11.725591643899325,
              "awayMae": 8.319585399082344,
              "awayRmse": 10.55688605878158,
              "marginMae": 12.74781880410236,
              "marginRmse": 16.50952231306252,
              "totalMae": 11.675683527245049,
              "totalRmse": 15.010341711954734,
              "brier": 0.1895636310089763,
              "logLoss": 0.5574796724134098,
              "count": 193
            }
          }
        ],
        "eligibleBuckets": [
          "HIGH",
          "INSUFFICIENT",
          "LOW",
          "MEDIUM"
        ],
        "marginMaeRange": 3.4173377568233096,
        "brierRange": 0.02971505212017264,
        "pass": true
      },
      {
        "name": "probabilityBand",
        "buckets": [
          {
            "bucket": ".50-.55",
            "count": 51,
            "metrics": {
              "homeMae": 9.961694728613836,
              "homeRmse": 12.46899160701117,
              "awayMae": 8.321494099471504,
              "awayRmse": 10.560197241866495,
              "marginMae": 11.868292395931654,
              "marginRmse": 15.66900052354515,
              "totalMae": 13.060317355662605,
              "totalRmse": 16.984388642480514,
              "brier": 0.24650503836009696,
              "logLoss": 0.6861425683287734,
              "count": 51
            }
          },
          {
            "bucket": ".55-.60",
            "count": 53,
            "metrics": {
              "homeMae": 8.987767843509296,
              "homeRmse": 11.411246746709743,
              "awayMae": 10.239178525802796,
              "awayRmse": 12.745885810019784,
              "marginMae": 14.430179086304475,
              "marginRmse": 18.108060492626738,
              "totalMae": 13.220694832903042,
              "totalRmse": 16.04513820408181,
              "brier": 0.2465527129976682,
              "logLoss": 0.6862712264074325,
              "count": 53
            }
          },
          {
            "bucket": ".60-.65",
            "count": 57,
            "metrics": {
              "homeMae": 9.347085148391713,
              "homeRmse": 11.700974430689097,
              "awayMae": 9.4444738418527,
              "awayRmse": 10.86314876346442,
              "marginMae": 11.700705870202643,
              "marginRmse": 14.935213989781857,
              "totalMae": 13.076931322028342,
              "totalRmse": 16.934609249965632,
              "brier": 0.24205555353771746,
              "logLoss": 0.6773438655247112,
              "count": 57
            }
          },
          {
            "bucket": ".65-.70",
            "count": 43,
            "metrics": {
              "homeMae": 11.12458373248654,
              "homeRmse": 13.502773052708564,
              "awayMae": 8.505872920318456,
              "awayRmse": 10.544053681911201,
              "marginMae": 14.328616456265687,
              "marginRmse": 18.074419021464315,
              "totalMae": 13.691024107642301,
              "totalRmse": 16.134412705657567,
              "brier": 0.22191446139046328,
              "logLoss": 0.6363355570908591,
              "count": 43
            }
          },
          {
            "bucket": ".70-.75",
            "count": 51,
            "metrics": {
              "homeMae": 11.639110902903772,
              "homeRmse": 13.835270477935108,
              "awayMae": 9.98285248146715,
              "awayRmse": 12.0099902461629,
              "marginMae": 16.221308153423074,
              "marginRmse": 20.891067899928125,
              "totalMae": 12.520572464411549,
              "totalRmse": 15.325548336738045,
              "brier": 0.22483365376808187,
              "logLoss": 0.642903261253567,
              "count": 51
            }
          },
          {
            "bucket": ".75-.80",
            "count": 36,
            "metrics": {
              "homeMae": 8.277900929214887,
              "homeRmse": 10.204598049405575,
              "awayMae": 7.914599329769349,
              "awayRmse": 9.699137182900426,
              "marginMae": 12.855846224560949,
              "marginRmse": 15.999338106701972,
              "totalMae": 8.996014883975803,
              "totalRmse": 11.85054205649436,
              "brier": 0.126396995077908,
              "logLoss": 0.42469762813097617,
              "count": 36
            }
          },
          {
            "bucket": ".80-1.00",
            "count": 107,
            "metrics": {
              "homeMae": 10.860861495380579,
              "homeRmse": 13.909603865635084,
              "awayMae": 8.228234283255194,
              "awayRmse": 10.475541124503254,
              "marginMae": 13.961351890099651,
              "marginRmse": 18.016273532130974,
              "totalMae": 13.629713305887071,
              "totalRmse": 16.788149722811507,
              "brier": 0.10401118591726481,
              "logLoss": 0.35253869659843634,
              "count": 107
            }
          }
        ],
        "eligibleBuckets": [
          ".50-.55",
          ".55-.60",
          ".60-.65",
          ".65-.70",
          ".70-.75",
          ".75-.80",
          ".80-1.00"
        ],
        "marginMaeRange": 4.5206022832204305,
        "brierRange": 0.1425415270804034,
        "pass": true
      },
      {
        "name": "sampleCountBand",
        "buckets": [
          {
            "bucket": "0-2",
            "count": 221,
            "metrics": {
              "homeMae": 10.529253006360278,
              "homeRmse": 13.217329111783885,
              "awayMae": 8.963908629066369,
              "awayRmse": 10.987395571383017,
              "marginMae": 13.897735441090349,
              "marginRmse": 18.053508818520154,
              "totalMae": 13.289995202406839,
              "totalRmse": 16.27612115714701,
              "brier": 0.188056848570407,
              "logLoss": 0.5504041676487336,
              "count": 221
            }
          },
          {
            "bucket": "3-5",
            "count": 131,
            "metrics": {
              "homeMae": 9.25633542186838,
              "homeRmse": 11.594110134535347,
              "awayMae": 8.717296667307885,
              "awayRmse": 11.114758085210761,
              "marginMae": 13.622319990196727,
              "marginRmse": 17.32378364084918,
              "totalMae": 11.26472245787519,
              "totalRmse": 14.6904388829617,
              "brier": 0.1882526820523457,
              "logLoss": 0.5587554765572447,
              "count": 131
            }
          },
          {
            "bucket": "6+",
            "count": 46,
            "metrics": {
              "homeMae": 11.080554253385241,
              "homeRmse": 13.569531141347833,
              "awayMae": 9.187883821602577,
              "awayRmse": 10.861023493988345,
              "marginMae": 12.63459841174613,
              "marginRmse": 15.825885551968014,
              "totalMae": 15.410643625899203,
              "totalRmse": 18.807694169194715,
              "brier": 0.21527998504104814,
              "logLoss": 0.6152001797279862,
              "count": 46
            }
          }
        ],
        "eligibleBuckets": [
          "0-2",
          "3-5",
          "6+"
        ],
        "marginMaeRange": 1.26313702934422,
        "brierRange": 0.027223136470641146,
        "pass": true
      }
    ],
    "pass": true
  },
  "selectionRationale": {
    "scorecard": "validation: marginMae, brier, logLoss; then totalMae; deterministic-name",
    "selectedByValidationOnly": true,
    "stabilityGatePassed": true,
    "stabilityGate": {
      "minimumRowsPerEligibleBucket": 20,
      "maximumEligibleMarginMaeRange": 10,
      "maximumEligibleBrierRange": 0.15,
      "requiredDimensions": [
        "week",
        "earlyLater",
        "site",
        "dataQuality",
        "probabilityBand",
        "sampleCountBand"
      ],
      "rule": "Every dimension needs at least two eligible >=20-row buckets; eligible margin-MAE and Brier ranges must not exceed declared maxima. Smaller buckets are reported but not evidence."
    }
  }
}
```

## 10. Selected challenger

```json
{
  "name": "expanded-ridge-k4-r36",
  "family": "expanded-ridge",
  "k": 4,
  "ridge": 36
}
```

## 11. Frozen configuration

```json
{
  "configurationHash": "a29ca7880a89718102c9b25ae0493350f47c9e8e01e3660866492e2ada83b719",
  "parameterHash": "8f0b5caff9271d06845f053236cc10b73f557c34653b5ee696ebf31dcc738240",
  "calibration": {
    "kind": "platt",
    "a": 1.0868377443226718,
    "b": 0.1959732418753627
  }
}
```

## 12. OOS comparison

```json
{
  "baseline": {
    "homeMae": 9.282625676397423,
    "awayMae": 8.498563584442126,
    "marginMae": 12.500839176319078,
    "totalMae": 12.939009077926592,
    "brier": 0.18002337158123566,
    "logLoss": 0.534791746210304,
    "count": 410
  },
  "challengerRaw": {
    "homeMae": 9.256928825594951,
    "homeRmse": 11.543541616655926,
    "awayMae": 8.562762215590075,
    "awayRmse": 10.649625838252602,
    "marginMae": 12.477528239789445,
    "marginRmse": 15.522039439325932,
    "totalMae": 13.045405236693718,
    "totalRmse": 15.887166479410356,
    "brier": 0.18151327646693538,
    "logLoss": 0.5375745864791811,
    "count": 410
  },
  "challengerCalibrated": {
    "homeMae": 9.256928825594951,
    "homeRmse": 11.543541616655926,
    "awayMae": 8.562762215590075,
    "awayRmse": 10.649625838252602,
    "marginMae": 12.477528239789445,
    "marginRmse": 15.522039439325932,
    "totalMae": 13.045405236693718,
    "totalRmse": 15.887166479410356,
    "brier": 0.18264045123691613,
    "logLoss": 0.5392105045033949,
    "count": 410
  },
  "deltas": {
    "raw": {
      "homeMae": {
        "absolute": -0.02569685080247197,
        "percent": -0.27682739451414456
      },
      "awayMae": {
        "absolute": 0.06419863114794921,
        "percent": 0.7554056695589627
      },
      "marginMae": {
        "absolute": -0.023310936529632897,
        "percent": -0.1864749734065205
      },
      "totalMae": {
        "absolute": 0.10639615876712583,
        "percent": 0.8222898533136763
      },
      "brier": {
        "absolute": 0.0014899048856997221,
        "percent": 0.8276174768937719
      },
      "logLoss": {
        "absolute": 0.002782840268877096,
        "percent": 0.5203596144849174
      }
    },
    "calibrated": {
      "homeMae": {
        "absolute": -0.02569685080247197,
        "percent": -0.27682739451414456
      },
      "awayMae": {
        "absolute": 0.06419863114794921,
        "percent": 0.7554056695589627
      },
      "marginMae": {
        "absolute": -0.023310936529632897,
        "percent": -0.1864749734065205
      },
      "totalMae": {
        "absolute": 0.10639615876712583,
        "percent": 0.8222898533136763
      },
      "brier": {
        "absolute": 0.0026170796556804765,
        "percent": 1.453744384794792
      },
      "logLoss": {
        "absolute": 0.0044187582930909075,
        "percent": 0.8262577581654101
      }
    },
    "selected": {
      "homeMae": {
        "absolute": -0.02569685080247197,
        "percent": -0.27682739451414456
      },
      "awayMae": {
        "absolute": 0.06419863114794921,
        "percent": 0.7554056695589627
      },
      "marginMae": {
        "absolute": -0.023310936529632897,
        "percent": -0.1864749734065205
      },
      "totalMae": {
        "absolute": 0.10639615876712583,
        "percent": 0.8222898533136763
      },
      "brier": {
        "absolute": 0.0026170796556804765,
        "percent": 1.453744384794792
      },
      "logLoss": {
        "absolute": 0.0044187582930909075,
        "percent": 0.8262577581654101
      }
    }
  }
}
```

## 13. Paired uncertainty/bootstrap

```json
{
  "replicates": 1000,
  "probabilityImproves": 0.616,
  "classification": "INCONCLUSIVE"
}
```

## 14. Calibration

```json
{
  "validationOnly": true,
  "parameters": {
    "kind": "platt",
    "a": 1.0868377443226718,
    "b": 0.1959732418753627
  },
  "rawOos": {
    "brier": 0.18151327646693538,
    "logLoss": 0.5375745864791811
  },
  "calibratedOos": {
    "brier": 0.18264045123691613,
    "logLoss": 0.5392105045033949
  },
  "conclusion": "Platt calibration worsened OOS probabilities and is not recommended."
}
```

## 15. Distribution diagnostics

Training-derived normal residual uncertainty retained; no OOS-fitted variance or calibration.

## 16. 2026 feature bridge

```json
{
  "version": "ncaaf-v4-2026-feature-bridge-v1",
  "targetsAssessed": 780,
  "eligible": 531,
  "internalPredictions": 531
}
```

## 17. 2026 compatibility matrix

```json
[
  {
    "feature": "seasonToDate score-derived offense/defense",
    "historicalSchema": "ncaaf-chronological-team-game-v2",
    "source": "completed ncaaf_game_evidence + strict snapshot cutoff",
    "exactSemanticMatch": true,
    "exactChronology": true,
    "status": "PARTIAL",
    "coverage": "531/780 future targets (68.1%)",
    "fallback": "Fail closed; no input or prediction when exact pre-cutoff identity is unavailable"
  },
  {
    "feature": "last3",
    "historicalSchema": "ncaaf-chronological-team-game-v2",
    "source": "completed ncaaf_game_evidence + strict snapshot cutoff",
    "exactSemanticMatch": true,
    "exactChronology": true,
    "status": "PARTIAL",
    "coverage": "531/780 future targets (68.1%)",
    "fallback": "Fail closed; no input or prediction when exact pre-cutoff identity is unavailable"
  },
  {
    "feature": "last5",
    "historicalSchema": "ncaaf-chronological-team-game-v2",
    "source": "completed ncaaf_game_evidence + strict snapshot cutoff",
    "exactSemanticMatch": true,
    "exactChronology": true,
    "status": "PARTIAL",
    "coverage": "531/780 future targets (68.1%)",
    "fallback": "Fail closed; no input or prediction when exact pre-cutoff identity is unavailable"
  },
  {
    "feature": "priorSeason",
    "historicalSchema": "ncaaf-chronological-team-game-v2",
    "source": "completed ncaaf_game_evidence + strict snapshot cutoff",
    "exactSemanticMatch": true,
    "exactChronology": true,
    "status": "PARTIAL",
    "coverage": "531/780 future targets (68.1%)",
    "fallback": "Fail closed; no input or prediction when exact pre-cutoff identity is unavailable"
  },
  {
    "feature": "pregame Elo",
    "historicalSchema": "ncaaf-chronological-team-game-v2",
    "source": "completed ncaaf_game_evidence + strict snapshot cutoff",
    "exactSemanticMatch": true,
    "exactChronology": true,
    "status": "PARTIAL",
    "coverage": "531/780 future targets (68.1%)",
    "fallback": "Fail closed; no input or prediction when exact pre-cutoff identity is unavailable"
  },
  {
    "feature": "opponentAdjusted",
    "historicalSchema": "ncaaf-chronological-team-game-v2",
    "source": "completed ncaaf_game_evidence + strict snapshot cutoff",
    "exactSemanticMatch": true,
    "exactChronology": true,
    "status": "PARTIAL",
    "coverage": "531/780 future targets (68.1%)",
    "fallback": "Fail closed; no input or prediction when exact pre-cutoff identity is unavailable"
  },
  {
    "feature": "home/neutral",
    "historicalSchema": "ncaaf-chronological-team-game-v2",
    "source": "completed ncaaf_game_evidence + strict snapshot cutoff",
    "exactSemanticMatch": true,
    "exactChronology": true,
    "status": "PARTIAL",
    "coverage": "531/780 future targets (68.1%)",
    "fallback": "Fail closed; no input or prediction when exact pre-cutoff identity is unavailable"
  },
  {
    "feature": "sample counts",
    "historicalSchema": "ncaaf-chronological-team-game-v2",
    "source": "completed ncaaf_game_evidence + strict snapshot cutoff",
    "exactSemanticMatch": true,
    "exactChronology": true,
    "status": "PARTIAL",
    "coverage": "531/780 future targets (68.1%)",
    "fallback": "Fail closed; no input or prediction when exact pre-cutoff identity is unavailable"
  },
  {
    "feature": "missing/quality indicators",
    "historicalSchema": "ncaaf-chronological-team-game-v2",
    "source": "completed ncaaf_game_evidence + strict snapshot cutoff",
    "exactSemanticMatch": true,
    "exactChronology": true,
    "status": "PARTIAL",
    "coverage": "531/780 future targets (68.1%)",
    "fallback": "Fail closed; no input or prediction when exact pre-cutoff identity is unavailable"
  }
]
```

## 18. 2026 internal challenger predictions

```json
{
  "count": 531,
  "persistence": "none; nonpublic in-memory challenger inputs only",
  "exclusions": [
    {
      "reason": "unsafe_target_team_identity_mapping",
      "count": 249
    }
  ]
}
```

## 19. PIT audit

```json
{
  "historical": {
    "rows": 2398,
    "sameGameLeakage": 0,
    "futureGameLeakage": 0,
    "futureSeasonLeakage": 0,
    "postKickoffEvidence": 0,
    "marketLeakage": 0,
    "unresolvedLineage": 0,
    "invalidReplayProof": 0
  },
  "bridge": {
    "snapshotsSeen": 32860,
    "targetsAssessed": 780,
    "eligibleSnapshots": 531,
    "sameGameLeakage": 0,
    "futureGameLeakage": 0,
    "futureSeasonLeakage": 0,
    "postKickoffEvidence": 0,
    "marketLeakage": 0,
    "marketShapedSnapshotsRejected": 0,
    "excludedCompletedEvidence": {
      "not_completed_fbs_atomic": 1715130,
      "outside_cutoff_or_season": 5039535,
      "post_cutoff_evidence": 429579
    }
  }
}
```

## 20. Market-firewall audit

```json
{
  "violations": 0
}
```

## 21. Registry state

```json
{
  "model": "tbm-ncaaf-v4-expected-score",
  "status": "CHALLENGER / UNVALIDATED",
  "champion": false,
  "publication": false
}
```

## 22. NFL/other-sport isolation

```json
{
  "nflChanged": false,
  "mlbChanged": false,
  "otherSportsChanged": false,
  "sharedForecastingLogicChanged": false
}
```

## 23. Tests/build

Focused #222/#222B tests, API typecheck, build, and workflow restart passed.

## 24. Known limitations

249 future ESPN targets cannot be bridged until exact pre-cutoff ESPN→CFBD team identity mappings exist. The distinct challenger result is INCONCLUSIVE and not recommended over Baseline D.

## 25. Recommendation

Retain canonical Baseline D as the NCAAF V4 core. Complete the missing identity bridge before #223. Keep every model UNVALIDATED and non-public.

## 26. Final decision

**C. #222B PARTIAL — ONE SPECIFIC MODEL OR 2026 COMPATIBILITY BLOCKER REMAINS**

Specific blocker: 249 future ESPN targets lack an unambiguous pre-cutoff ESPN→CFBD team identity mapping, so overall 2026 feature compatibility remains PARTIAL.
