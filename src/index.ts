/**
 * Library entry point — public exports of the SWE-bench Pro harness.
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

// Lower-level building blocks for consumers who want to use the loader,
// generator, prompt template, or patch extractor independently.
export { loadSweBenchProInstances } from './runner/instance-loader.js';
export { generatePrediction } from './runner/agent-invoker.js';
export type { GeneratePredictionOptions } from './runner/agent-invoker.js';
export { extractPatch } from './runner/patch-extractor.js';
export { composeUserPrompt, getSystemPrompt } from './runner/prompt-template.js';
