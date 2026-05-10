/**
 * Library entry point — exposes the SWE-bench Pro adapter for
 * composition into other harnesses (dashboards, multi-benchmark runners,
 * leaderboard tooling).
 *
 * @module index
 */

export {
  SweBenchProAdapter,
  type SweBenchProInstance,
  type SweBenchProPrediction,
  type SweBenchProEvalResult,
  type SweBenchProConfig,
} from './adapter.js';
