/**
 * Smoke tests for the SWE-bench Pro adapter scaffold. These exercise the
 * `BenchmarkAdapter` contract end-to-end against the v0 stub
 * loader/runner/evaluator. Real Pro tests ship alongside the dataset
 * loader (#1), runner (#2), prompt template (#3), and Docker eval (#4).
 */
import { describe, it, expect } from 'vitest';
import { runBenchmark } from 'nexus-agents';
import { SweBenchProAdapter } from './adapter.js';

describe('SweBenchProAdapter (v0 scaffold)', () => {
  it('runs end-to-end with the stub loader / runner / evaluator', async () => {
    const adapter = new SweBenchProAdapter();
    const summary = await runBenchmark(adapter, {});
    expect(summary.name).toBe('swebench-pro');
    expect(summary.total).toBeGreaterThan(0);
    expect(summary.passRate).toBeGreaterThanOrEqual(0);
    expect(summary.passRate).toBeLessThanOrEqual(1);
  });

  it('produces a per-language pass-rate breakdown in metadata', async () => {
    const adapter = new SweBenchProAdapter();
    const summary = await runBenchmark(adapter, {});
    const meta = summary.metadata as { byLanguage?: Record<string, unknown> };
    expect(meta.byLanguage).toBeDefined();
  });

  it('honors limit option', async () => {
    const adapter = new SweBenchProAdapter();
    const summary = await runBenchmark(adapter, {}, { limit: 1 });
    expect(summary.total).toBe(1);
  });
});
