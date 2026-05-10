/**
 * Tests for the SWE-bench Pro adapter (v0.2 — model-only baseline).
 *
 * Mocks IModelAdapter so tests don't make real model calls. Asserts the
 * BenchmarkAdapter contract end-to-end against the bundled fixture
 * (no network).
 */
import { describe, it, expect, vi } from 'vitest';
import { ok, runBenchmark, type IModelAdapter } from 'nexus-agents';
import { SweBenchProAdapter, type SweBenchProInstance } from './adapter.js';
import { extractPatch } from './runner/patch-extractor.js';
import { composeUserPrompt, getSystemPrompt } from './runner/prompt-template.js';

const fixtureInstance: SweBenchProInstance = {
  instanceId: 'ansible__ansible-12345',
  repo: 'ansible/ansible',
  baseCommit: 'abc123def456',
  problemStatement: 'Bug: handler_x panics on Y',
  repoLanguage: 'python',
  requirements: '- handler_x must return ok\n- callers must not panic',
  interface: 'def handler_x(input: dict) -> Result: ...',
};

function makeMockModelAdapter(response: string): IModelAdapter {
  const completion = vi.fn(() => Promise.resolve(ok({ content: response })));
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

describe('SweBenchProAdapter', () => {
  it('extracts patch + prefix from a model response', async () => {
    const patch = '--- a/handler.py\n+++ b/handler.py\n@@ -1 +1 @@\n-old\n+new\n';
    const response = `\`\`\`diff\n${patch}\n\`\`\`\n\n\`\`\`prefix\nhandler_x_fix\n\`\`\``;
    const adapter = new SweBenchProAdapter(makeMockModelAdapter(response), {
      dataset: 'fixture',
    });
    const prediction = await adapter.runInstance(fixtureInstance, {} as never);
    expect(prediction.instanceId).toBe('ansible__ansible-12345');
    expect(prediction.patch).toContain('--- a/handler.py');
    expect(prediction.prefix).toBe('handler_x_fix');
  });

  it('captures empty patch + empty prefix when model returns nothing useful', async () => {
    const adapter = new SweBenchProAdapter(makeMockModelAdapter('I cannot solve this.'), {
      dataset: 'fixture',
    });
    const prediction = await adapter.runInstance(fixtureInstance, {} as never);
    expect(prediction.patch).toBe('');
    expect(prediction.prefix).toBe('');
    const verdict = await adapter.evaluate(fixtureInstance, prediction);
    expect(verdict.passed).toBe(false);
    expect(adapter.isPass(verdict)).toBe(false);
  });

  it('isPass true when patch is non-empty', async () => {
    const adapter = new SweBenchProAdapter(
      makeMockModelAdapter(
        '```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n```\n```prefix\np\n```'
      ),
      { dataset: 'fixture' }
    );
    const prediction = await adapter.runInstance(fixtureInstance, {} as never);
    const verdict = await adapter.evaluate(fixtureInstance, prediction);
    expect(adapter.isPass(verdict)).toBe(true);
  });

  it('summarize includes byLanguage breakdown', () => {
    const adapter = new SweBenchProAdapter(makeMockModelAdapter(''), {
      dataset: 'fixture',
    });
    const verdicts = [
      { instanceId: 'a', passed: true, repoLanguage: 'python' as const },
      { instanceId: 'b', passed: false, repoLanguage: 'python' as const, reason: 'empty' },
      { instanceId: 'c', passed: true, repoLanguage: 'go' as const },
    ];
    const summary = adapter.summarize(verdicts, 200);
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(2);
    const meta = summary.metadata as {
      byLanguage: Record<string, { total: number; passed: number; passRate: number }>;
    };
    expect(meta.byLanguage['python']).toEqual({
      total: 2,
      passed: 1,
      passRate: 0.5,
    });
    expect(meta.byLanguage['go']).toEqual({ total: 1, passed: 1, passRate: 1 });
  });

  it('runs end-to-end against the bundled fixture', async () => {
    // Mock adapter returns a non-empty patch for every call so we get
    // a deterministic 4/4 from the 4-instance fixture.
    const response = '```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n```\n```prefix\np\n```';
    const adapter = new SweBenchProAdapter(makeMockModelAdapter(response), {
      dataset: 'fixture',
    });
    const summary = await runBenchmark(adapter, {});
    expect(summary.name).toBe('swebench-pro');
    expect(summary.total).toBe(4); // bundled fixture has 4 instances
    expect(summary.passed).toBe(4);
  });

  it('language filter narrows the fixture set', async () => {
    const adapter = new SweBenchProAdapter(makeMockModelAdapter(''), {
      dataset: 'fixture',
      languages: ['python', 'go'],
    });
    const instances = await adapter.loadInstances({});
    expect(instances).toHaveLength(2);
    expect(instances.every((i) => i.repoLanguage === 'python' || i.repoLanguage === 'go')).toBe(true);
  });
});

describe('extractPatch (Pro fenced + prefix tolerance)', () => {
  it('extracts diff while ignoring the trailing prefix block', () => {
    const response =
      'Some prose.\n```diff\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n```\n```prefix\nhandler_x\n```';
    expect(extractPatch(response)).toContain('--- a/x');
  });
});

describe('Pro prompt template', () => {
  it('system prompt names requirements + interface as first-class', () => {
    expect(getSystemPrompt()).toContain('REQUIREMENTS');
    expect(getSystemPrompt()).toContain('INTERFACE');
    expect(getSystemPrompt()).toContain('PREFIX');
  });

  it('user prompt includes all Pro-specific fields', () => {
    const prompt = composeUserPrompt(fixtureInstance);
    expect(prompt).toContain('ansible/ansible');
    expect(prompt).toContain('Bug: handler_x panics');
    expect(prompt).toContain('handler_x must return ok');
    expect(prompt).toContain('def handler_x');
    expect(prompt).toContain('python');
  });
});
