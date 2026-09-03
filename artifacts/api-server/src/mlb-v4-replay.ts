// Separate build entry used exclusively by the read-only historical replay CLI.
export { computeMlbV4Forecast } from "./services/mlbV4Challenger";
export {
  computeMlbV41Forecast,
  MLB_V41_CALIBRATION_VERSION,
  MLB_V41_CONFIGURATION_HASH,
  MLB_V41_DISTRIBUTION_VERSION,
  MLB_V41_FEATURE_SCHEMA_VERSION,
  MLB_V41_MODEL_ID,
  MLB_V41_RUN_MODEL_VERSION,
} from "./services/mlbV41RunModel";
export {
  probabilityMetrics,
  reconstructMlbV4Input,
  runErrorMetrics,
  selectLatestValidPregameSnapshots,
} from "./services/mlbV4HistoricalReplay";