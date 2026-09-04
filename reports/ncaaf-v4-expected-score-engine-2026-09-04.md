# NCAAF V4 Expected Score Engine — 2026-09-04

## 1. Identity

```json
{
  "modelId": "tbm-ncaaf-v4-expected-score",
  "approval": "UNVALIDATED",
  "champion": false,
  "publication": false,
  "datasetVersion": "ncaaf-v4-training-foundation-v2",
  "splitChecksum": "7cee52d5188179d81a177aa55b9ac54e06211f11ed8a5b0d29b032ff94095abc",
  "configurationHash": "212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86",
  "parameterHash": "792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81",
  "oosUntouchedDuringSelection": true,
  "compatibility2026": "PARTIAL",
  "generated2026Predictions": 0
}
```

## 2. Dataset

```json
{
  "artifact": "ncaaf-v4-training-foundation-v2",
  "counts": {
    "2023": 792,
    "2024": 798,
    "2025": 808
  }
}
```

## 3. Feature schema

ncaaf-chronological-team-game-v2

## 4. Immutability

```json
{
  "splitChecksum": "7cee52d5188179d81a177aa55b9ac54e06211f11ed8a5b0d29b032ff94095abc",
  "parameterHash": "792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81",
  "configurationHash": "212a6c78431a181821106721877155745724d3619ec63cf5424f098b07f9ae86"
}
```

## 5. Split

```json
{
  "training": 1590,
  "validation": 398,
  "oos": 410
}
```

## 6. Training

2023+2024

## 7. Validation

2025 weeks 1-7

## 8. OOS

2025 week 8+

## 9. Baseline A

```json
{
  "name": "A-historical-home-away-average",
  "validation": {
    "homeMae": 11.170854271356784,
    "homeRmse": 13.98036056979581,
    "awayMae": 10.250282860845116,
    "awayRmse": 12.39213668845147,
    "marginMae": 16.041408299358427,
    "marginRmse": 20.560482757617986,
    "totalMae": 13.317417275054513,
    "totalRmse": 16.592094970413665,
    "brier": 0.25,
    "logLoss": 0.6931471805599467,
    "count": 398
  },
  "oos": {
    "homeMae": 10.973538886332264,
    "homeRmse": 13.16695133055822,
    "awayMae": 9.967636140512349,
    "awayRmse": 12.53850632959786,
    "marginMae": 15.761132075471707,
    "marginRmse": 19.845382204802984,
    "totalMae": 13.31526000920386,
    "totalRmse": 16.350116262051404,
    "brier": 0.25,
    "logLoss": 0.6931471805599467,
    "count": 410
  }
}
```

## 10. Baseline B

```json
{
  "name": "B-prior-offense-vs-defense",
  "validation": {
    "homeMae": 10.4238114594721,
    "homeRmse": 13.201986859069594,
    "awayMae": 9.760198621216482,
    "awayRmse": 11.78544265376468,
    "marginMae": 14.932568863141595,
    "marginRmse": 19.123978726690005,
    "totalMae": 12.875753229237448,
    "totalRmse": 16.14471024222956,
    "brier": 0.25,
    "logLoss": 0.6931471805599467,
    "count": 398
  },
  "oos": {
    "homeMae": 9.464268558533218,
    "homeRmse": 11.832171944310888,
    "awayMae": 9.068144351211506,
    "awayRmse": 11.144251581163982,
    "marginMae": 13.401617980489448,
    "marginRmse": 16.813486506962104,
    "totalMae": 12.809552658721735,
    "totalRmse": 15.674691190841058,
    "brier": 0.25,
    "logLoss": 0.6931471805599467,
    "count": 410
  }
}
```

## 11. Baseline C

```json
{
  "name": "C-pregame-elo-winner",
  "validation": {
    "homeMae": 11.170854271356784,
    "homeRmse": 13.98036056979581,
    "awayMae": 10.250282860845116,
    "awayRmse": 12.39213668845147,
    "marginMae": 16.041408299358427,
    "marginRmse": 20.560482757617986,
    "totalMae": 13.317417275054513,
    "totalRmse": 16.592094970413665,
    "brier": 0.2431781113540396,
    "logLoss": 0.6794435986895123,
    "count": 398
  },
  "oos": {
    "homeMae": 10.973538886332264,
    "homeRmse": 13.16695133055822,
    "awayMae": 9.967636140512349,
    "awayRmse": 12.53850632959786,
    "marginMae": 15.761132075471707,
    "marginRmse": 19.845382204802984,
    "totalMae": 13.31526000920386,
    "totalRmse": 16.350116262051404,
    "brier": 0.22213300731526192,
    "logLoss": 0.6365384178532251,
    "count": 410
  }
}
```

## 12. Baseline D

```json
{
  "name": "D-simple-expected-score-linear",
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
  "oos": {
    "homeMae": 9.282625676397423,
    "homeRmse": 11.530185139642787,
    "awayMae": 8.498563584442126,
    "awayRmse": 10.582372882018044,
    "marginMae": 12.500839176319078,
    "marginRmse": 15.480162948634515,
    "totalMae": 12.939009077926592,
    "totalRmse": 15.818600615122184,
    "brier": 0.17828391985262818,
    "logLoss": 0.5279580658139891,
    "count": 410
  }
}
```

## 13. Candidate comparison

```json
[
  {
    "name": "simple-expected-score-linear",
    "ridge": 0,
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
    }
  },
  {
    "name": "ridge-score-4",
    "ridge": 4,
    "validation": {
      "homeMae": 10.28290701735524,
      "homeRmse": 12.865577494174454,
      "awayMae": 8.98659958919765,
      "awayRmse": 11.060090777023728,
      "marginMae": 13.83021841221571,
      "marginRmse": 17.725998365411034,
      "totalMae": 12.89086605838675,
      "totalRmse": 16.170540079374977,
      "brier": 0.19437245421413746,
      "logLoss": 0.5674850932616353,
      "count": 398
    }
  },
  {
    "name": "ridge-score-8",
    "ridge": 8,
    "validation": {
      "homeMae": 10.28067278063075,
      "homeRmse": 12.859487105989682,
      "awayMae": 8.989158090191063,
      "awayRmse": 11.061774068175163,
      "marginMae": 13.821591826620445,
      "marginRmse": 17.714260866194877,
      "totalMae": 12.895765826748827,
      "totalRmse": 16.176015278594775,
      "brier": 0.19420029999290642,
      "logLoss": 0.5669582273175634,
      "count": 398
    }
  }
]
```

## 14. Selected model

```json
{
  "name": "simple-expected-score-linear",
  "ridge": 0
}
```

## 15. Shrinkage

n/(n+4), prior-season then population fallback

## 16. Home score metrics

```json
{
  "homeMae": 9.282625676397423,
  "homeRmse": 11.530185139642787,
  "awayMae": 8.498563584442126,
  "awayRmse": 10.582372882018044,
  "marginMae": 12.500839176319078,
  "marginRmse": 15.480162948634515,
  "totalMae": 12.939009077926592,
  "totalRmse": 15.818600615122184,
  "brier": 0.18002337158123566,
  "logLoss": 0.534791746210304,
  "count": 410
}
```

## 17. Away score metrics

```json
{
  "homeMae": 9.282625676397423,
  "homeRmse": 11.530185139642787,
  "awayMae": 8.498563584442126,
  "awayRmse": 10.582372882018044,
  "marginMae": 12.500839176319078,
  "marginRmse": 15.480162948634515,
  "totalMae": 12.939009077926592,
  "totalRmse": 15.818600615122184,
  "brier": 0.18002337158123566,
  "logLoss": 0.534791746210304,
  "count": 410
}
```

## 18. Margin metrics

```json
{
  "homeMae": 9.282625676397423,
  "homeRmse": 11.530185139642787,
  "awayMae": 8.498563584442126,
  "awayRmse": 10.582372882018044,
  "marginMae": 12.500839176319078,
  "marginRmse": 15.480162948634515,
  "totalMae": 12.939009077926592,
  "totalRmse": 15.818600615122184,
  "brier": 0.18002337158123566,
  "logLoss": 0.534791746210304,
  "count": 410
}
```

## 19. Total metrics

```json
{
  "homeMae": 9.282625676397423,
  "homeRmse": 11.530185139642787,
  "awayMae": 8.498563584442126,
  "awayRmse": 10.582372882018044,
  "marginMae": 12.500839176319078,
  "marginRmse": 15.480162948634515,
  "totalMae": 12.939009077926592,
  "totalRmse": 15.818600615122184,
  "brier": 0.18002337158123566,
  "logLoss": 0.534791746210304,
  "count": 410
}
```

## 20. Moneyline metrics

```json
{
  "homeMae": 9.282625676397423,
  "homeRmse": 11.530185139642787,
  "awayMae": 8.498563584442126,
  "awayRmse": 10.582372882018044,
  "marginMae": 12.500839176319078,
  "marginRmse": 15.480162948634515,
  "totalMae": 12.939009077926592,
  "totalRmse": 15.818600615122184,
  "brier": 0.18002337158123566,
  "logLoss": 0.534791746210304,
  "count": 410
}
```

## 21. Validation metrics

```json
{
  "homeMae": 10.287789973117736,
  "homeRmse": 12.874284947623016,
  "awayMae": 8.978018169051618,
  "awayRmse": 11.054095929130463,
  "marginMae": 13.83860742671156,
  "marginRmse": 17.73646710672768,
  "totalMae": 12.883931882198755,
  "totalRmse": 16.16472189732905,
  "brier": 0.19505727325264602,
  "logLoss": 0.5711985471751657,
  "count": 398
}
```

## 22. Calibration

```json
[
  {
    "low": 0.5,
    "high": 0.55,
    "count": 62,
    "predicted": 0.5237330593257922,
    "observed": 0.7580645161290323,
    "calibrationError": 0.23433145680324008
  },
  {
    "low": 0.55,
    "high": 0.6,
    "count": 51,
    "predicted": 0.5753947837961574,
    "observed": 0.47058823529411764,
    "calibrationError": 0.10480654850203974
  },
  {
    "low": 0.6,
    "high": 0.65,
    "count": 61,
    "predicted": 0.6231134868202863,
    "observed": 0.5901639344262295,
    "calibrationError": 0.032949552394056836
  },
  {
    "low": 0.65,
    "high": 0.7,
    "count": 58,
    "predicted": 0.6768496536465206,
    "observed": 0.8103448275862069,
    "calibrationError": 0.13349517393968624
  },
  {
    "low": 0.7,
    "high": 0.75,
    "count": 54,
    "predicted": 0.7224233346235619,
    "observed": 0.7407407407407407,
    "calibrationError": 0.018317406117178803
  },
  {
    "low": 0.75,
    "high": 0.8,
    "count": 35,
    "predicted": 0.7714704599423282,
    "observed": 0.8,
    "calibrationError": 0.02852954005767183
  },
  {
    "low": 0.8,
    "high": 1.001,
    "count": 89,
    "predicted": 0.8741574908285754,
    "observed": 0.9438202247191011,
    "calibrationError": 0.06966273389052569
  }
]
```

## 23. Distribution

```json
{
  "assumption": "deterministic normal margin/total",
  "marginUncertainty": "training RMSE"
}
```

## 24. Residual diagnostics

Residual mean/variance are available from the immutable OOS artifact metrics; no retuning performed.

## 25. Coefficients

```json
{
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
}
```

## 26. Home/neutral

Home-field indicator is fitted; neutral-site indicator receives no ordinary home advantage.

## 27. Missing data

Explicit prior/population fallback, indicators, and quality state.

## 28. Data quality

HIGH/MEDIUM/LOW/INSUFFICIENT; not betting confidence.

## 29. Score distribution

Analytic normal; no random simulation.

## 30. Threshold interfaces

cover/over/under are distribution queries only.

## 31. Fair odds

American odds derive only from model probability.

## 32. Market firewall

```json
{
  "rows": 2398,
  "sameGameLeakage": 0,
  "futureGameLeakage": 0,
  "futureSeasonLeakage": 0,
  "postKickoffEvidence": 0,
  "marketLeakage": 0,
  "unresolvedLineage": 0,
  "invalidReplayProof": 0
}
```

## 33. PIT audit

```json
{
  "rows": 2398,
  "sameGameLeakage": 0,
  "futureGameLeakage": 0,
  "futureSeasonLeakage": 0,
  "postKickoffEvidence": 0,
  "marketLeakage": 0,
  "unresolvedLineage": 0,
  "invalidReplayProof": 0
}
```

## 34. OOS isolation

```json
true
```

## 35. Reproducibility

```json
{
  "deterministic": true,
  "parameterHash": "792ba805aaa666cfc23b4d304dfca3f6fab4194535c7909eab2cfb1041288d81"
}
```

## 36. Registry

```json
{
  "state": "CHALLENGER/UNVALIDATED",
  "environment": "development",
  "modelVersionId": 3411,
  "datasetId": 1,
  "incumbentUnchanged": true,
  "trainingRunCreated": false
}
```


## 37. Publication

No champion change, public output, wager, unit, or production call.

## 38. 2026 compatibility

PARTIAL: frozen snapshots are not feature-equivalent.

## 39. 2026 predictions

```json
0
```

## 40. Limitations

No optional QB/injury/PBP/weather features; global residual distribution; no prospective feature equivalence.

## 41. Final decision

**B. #222 ENGINE COMPLETE — ONE SPECIFIC MODEL QUALITY ISSUE MUST BE RESOLVED BEFORE #223**

The selected simple expected-score model is identical to declared Baseline D, so it does not yet demonstrate improvement over that baseline. It remains UNVALIDATED, non-production, non-champion, and unpublished. The 2026 compatibility result is PARTIAL and zero internal challenger predictions were generated.
