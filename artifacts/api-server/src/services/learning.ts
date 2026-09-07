/**
 * Production learning boundary.
 *
 * The former game-level learner in this location mutated model_weights from
 * mutable game rows. It is deprecated and intentionally absent from the
 * production module graph. Retaining a narrow facade prevents a future caller
 * from selecting that unsafe path while preserving this module's public API.
 *
 * Graded picks are now handled by the v2 engine, which records immutable
 * outcome-review evidence only. Production champion weights and confidence
 * values remain frozen.
 */

export {
  runLearning,
} from "./learningEngine";