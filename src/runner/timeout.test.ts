/**
 * Tests that the per-instance timeout (ctx.timeoutMs / --timeout) is
 * actually threaded from the adapter into the model call (#33).
 *
 * Strategy: a mock IModelAdapter whose `complete` never resolves within
 * the timeout. With a small ctx.timeoutMs the generation must abort and
 * surface as an empty patch, proving the timeout was honoured rather than
 * the hardcoded 5-minute default.
 */
import { describe, it, expect, vi } from 'vitest';
import { ok, type IModelAdapter } from 'nexus-agents';
import { SweBenchProAdapter, type SweBenchProInstance } from '../adapter.js';

const fixtureInstance: SweBenchProInstance = {
  instanceId: 'ansible__ansible-1',
  repo: 'ansible/ansible',
  baseCommit: 'deadbeef',
  problemStatement: 'p',
  repoLanguage: 'python',
  requirements: '- r',
  interface: 'def f(): ...',
};

function makeSlowModelAdapter(delayMs: number): IModelAdapter {
  const completion = vi.fn(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(ok({ content: '```diff\n--- a/x\n+++ b/x\n```' })), delayMs);
      })
  );
  return {
    providerId: 'mock',
    modelId: 'mock-pro-model',
    capabilities: [],
    complete: completion as never,
    stream: (() => (async function* () {})()) as never,
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ({ ok: true as const, value: undefined }),
  };
}

describe('timeout threading (#33)', () => {
  it('aborts the model call when ctx.timeoutMs is exceeded', async () => {
    const adapter = new SweBenchProAdapter(makeSlowModelAdapter(10_000), {
      dataset: 'fixture',
    });
    // 20ms budget — far below the 5-min default. If the timeout were not
    // threaded, this test would hang until the 10s model "call" resolves.
    const prediction = await adapter.runInstance(fixtureInstance, {
      timeoutMs: 20,
    } as never);
    expect(prediction.patch).toBe('');
    const verdict = await adapter.evaluate(fixtureInstance, prediction);
    expect(verdict.passed).toBe(false);
    expect(String(verdict.reason)).toContain('20ms');
  });
});
