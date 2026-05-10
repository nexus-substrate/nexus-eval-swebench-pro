/**
 * Generate one SWE-bench Pro prediction by calling an `IModelAdapter`
 * and extracting the patch + prefix.
 *
 * MVP scope: single round-trip, model-only baseline. v0.3 follow-up
 * adds the agentic flow against a cloned workspace.
 *
 * @module runner/agent-invoker
 */

import { ok, err, type IModelAdapter, type Result } from 'nexus-agents';

import type { SweBenchProInstance, SweBenchProPrediction } from '../adapter.js';
import { extractPatch } from './patch-extractor.js';
import { composeUserPrompt, getSystemPrompt } from './prompt-template.js';

const PREFIX_RE = /```prefix\s*\n([\s\S]*?)\n```/;

export interface GeneratePredictionOptions {
  /** Hard timeout for the model call. Default: 5min. */
  readonly timeoutMs?: number;
  /** Model name recorded in the prediction. Default: adapter.modelId. */
  readonly modelLabel?: string;
}

/**
 * Generate one Pro prediction. Returns the prediction in the standard
 * Pro shape: `{ instanceId, patch, prefix, durationMs }`.
 *
 * Never throws — failures come back via Result.err. Empty patches
 * (model-couldn't-solve-it) are returned as `ok(...)` with an empty
 * patch so the orchestrator can record the attempt.
 */
export async function generatePrediction(
  instance: SweBenchProInstance,
  modelAdapter: IModelAdapter,
  options: GeneratePredictionOptions = {}
): Promise<Result<SweBenchProPrediction, Error>> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  void options.modelLabel; // prediction shape doesn't carry the model label

  const start = Date.now();
  try {
    const completion = await Promise.race([
      modelAdapter.complete({
        messages: [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: composeUserPrompt(instance) },
        ],
      }),
      timeoutAfter<never>(timeoutMs, `model call exceeded ${String(timeoutMs)}ms`),
    ]);

    if (!completion.ok) {
      return err(new Error(completion.error.message));
    }
    const responseText = extractResponseText(completion.value);
    const patch = extractPatch(responseText);
    const prefix = extractPrefix(responseText);

    return ok({
      instanceId: instance.instanceId,
      patch,
      prefix,
      durationMs: Date.now() - start,
    });
  } catch (caught: unknown) {
    return err(caught instanceof Error ? caught : new Error(String(caught)));
  }
}

/**
 * Pull the `prefix` text out of the model response. Prefers a fenced
 * ```prefix block; falls back to empty string when the model didn't
 * produce one (the patch will still be evaluated by the harness using
 * its own disambiguation logic).
 */
function extractPrefix(response: string): string {
  const match = PREFIX_RE.exec(response);
  if (match !== null && match[1] !== undefined) {
    return match[1].trim();
  }
  return '';
}

function timeoutAfter<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    const handle = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    handle.unref?.();
  });
}

function extractResponseText(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '';
  const obj = value as Record<string, unknown>;
  if (typeof obj['content'] === 'string') return obj['content'];
  if (typeof obj['text'] === 'string') return obj['text'];
  if (Array.isArray(obj['choices']) && obj['choices'].length > 0) {
    const first = obj['choices'][0] as { message?: { content?: unknown } } | undefined;
    if (
      first !== undefined &&
      typeof first.message === 'object' &&
      first.message !== null &&
      typeof first.message.content === 'string'
    ) {
      return first.message.content;
    }
  }
  return '';
}
