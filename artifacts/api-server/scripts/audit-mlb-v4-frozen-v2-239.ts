import {
  MLB_V4_FROZEN_V2_CONTRACT,
  MLB_V4_FROZEN_V2_DISPOSITIONS,
  MLB_V4_FROZEN_V2_DISPOSITION_HASH,
  MLB_V4_FROZEN_V2_FEATURE_ORDER,
  MLB_V4_FROZEN_V2_FEATURE_ORDER_HASH,
  MLB_V4_FROZEN_V2_HISTORICAL_ADAPTER_HASH,
  MLB_V4_FROZEN_V2_LIVE_ADAPTER_HASH,
  MLB_V4_FROZEN_V2_TARGET_HASH,
  MLB_V4_V2_DEFAULT_TRAINING_GATE,
} from "../src/services/mlbV4FrozenV2Foundation239";

// Read-only code-contract audit. It deliberately does not connect to any database,
// fit a model, write an artifact, or mutate serving state.
console.log(JSON.stringify({
  task: 239,
  mode: "READ_ONLY_NO_DATABASE",
  contractId: MLB_V4_FROZEN_V2_CONTRACT.contractId,
  contractHash: MLB_V4_FROZEN_V2_CONTRACT.contractHash,
  featureOrder: MLB_V4_FROZEN_V2_FEATURE_ORDER,
  featureOrderHash: MLB_V4_FROZEN_V2_FEATURE_ORDER_HASH,
  dispositionHash: MLB_V4_FROZEN_V2_DISPOSITION_HASH,
  historicalAdapterHash: MLB_V4_FROZEN_V2_HISTORICAL_ADAPTER_HASH,
  liveAdapterHash: MLB_V4_FROZEN_V2_LIVE_ADAPTER_HASH,
  targetHash: MLB_V4_FROZEN_V2_TARGET_HASH,
  dispositionCounts: {
    retained: MLB_V4_FROZEN_V2_DISPOSITIONS.filter((row) => row.disposition === "RETAINED").length,
    dropped: MLB_V4_FROZEN_V2_DISPOSITIONS.filter((row) => row.disposition === "DROPPED").length,
  },
  defaultTrainingGate: MLB_V4_V2_DEFAULT_TRAINING_GATE,
  modelTrained: false,
  productionRead: false,
  productionWrite: false,
}, null, 2));