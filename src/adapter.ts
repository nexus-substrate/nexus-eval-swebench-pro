/**
 * SWE-bench Pro adapter — implements the nexus-agents `BenchmarkAdapter`
 * contract for ScaleAI's SWE-bench Pro benchmark (731 multi-language
 * instances across 11 real-world repos).
 *
 * Differences from the existing `nexus-eval-swebench` (Lite/Verified/Full)
 * harness — these are the four implementation areas tracked in this repo's
 * `IMPLEMENTATION.md`:
 *
 * 1. **Dataset format**: Pro adds `requirements`, `interface`, and
 *    `repo_language` fields not present in Lite/Verified.
 * 2. **Prompt template**: must surface `requirements` + `interface`
 *    contextually so multi-language solvers can satisfy real APIs.
 * 3. **Prediction format**: Pro expects `{instance_id, patch, prefix}`
 *    instead of Lite/Verified's `{instance_id, model_patch, ...}`.
 * 4. **Eval harness**: uses `scaleapi/SWE-bench_Pro-os` Docker harness
 *    with `--use_local_docker`, distinct from the python-only Verified
 *    harness.
 *
 * Top systems on Pro score ~23% — meaningful differentiation vs the
 * largely-saturated Verified leaderboard. See repo README for context.
 *
 * @module adapter
 */

import type {
  BenchmarkAdapter,
  BenchmarkRunContext,
  BenchmarkRunSummary,
} from 'nexus-agents';

// ============================================================================
// SWE-bench Pro instance / prediction / eval shapes
// ============================================================================

/**
 * One Pro instance, mirroring the ScaleAI/SWE-bench_Pro HuggingFace
 * dataset row shape. Optional fields here exist on a subset of instances —
 * the loader normalises into this shape.
 */
export interface SweBenchProInstance {
  /** Stable cross-run identifier — `<repo>__<issue-number>` style. */
  readonly instanceId: string;
  /** Repo slug (e.g. `ansible/ansible`). */
  readonly repo: string;
  /** Commit hash to start from. */
  readonly baseCommit: string;
  /** Natural-language problem statement (issue body). */
  readonly problemStatement: string;
  /** Language tag — one of `python`, `javascript`, `typescript`, `go`. */
  readonly repoLanguage: 'python' | 'javascript' | 'typescript' | 'go';
  /**
   * Pro-specific: bullet-list style requirements describing what a
   * passing patch must satisfy. Surfaced into the prompt template.
   */
  readonly requirements: string;
  /**
   * Pro-specific: function/API signatures the patch must expose
   * (e.g. for downstream tests). May be a code block or a short
   * structured description.
   */
  readonly interface: string;
  /** Hints / context the dataset bundles for the solver (optional). */
  readonly hintsText?: string;
}

/**
 * Pro prediction shape. Differs from Lite/Verified in two ways:
 *   - field name `patch` (not `model_patch`)
 *   - new `prefix` field — text-prefix the harness uses to disambiguate
 *     when a patch is ambiguous against the source tree.
 */
export interface SweBenchProPrediction {
  readonly instanceId: string;
  readonly patch: string;
  readonly prefix: string;
  readonly durationMs: number;
}

/**
 * Verdict for one Pro instance. Pass/fail comes from the Docker harness;
 * `reason` carries the harness's failure message when not passing.
 */
export interface SweBenchProEvalResult {
  readonly instanceId: string;
  readonly passed: boolean;
  readonly reason?: string;
  /**
   * Repo language for breakdowns in the summary. Carried through from
   * the instance so summarize() doesn't need a second lookup.
   */
  readonly repoLanguage: SweBenchProInstance['repoLanguage'];
}

// ============================================================================
// Configuration
// ============================================================================

export interface SweBenchProConfig {
  /**
   * Where to load the dataset from. Three options:
   *   - `'huggingface'` (default): fetch via `@huggingface/hub` from
   *     `ScaleAI/SWE-bench_Pro`.
   *   - Absolute path to a `.jsonl` fixture: load from disk (used in
   *     CI + reproducibility runs).
   *   - `'fixture'`: load the bundled `fixtures/sample.jsonl` (10
   *     instances) for smoke testing.
   */
  readonly dataset?: 'huggingface' | 'fixture' | string;
  /**
   * Filter instances by language. When unset, runs all four.
   */
  readonly languages?: ReadonlyArray<SweBenchProInstance['repoLanguage']>;
  /**
   * Where the Docker harness is checked out / installed. Default:
   * `~/.nexus-eval-swebench-pro/harness/`.
   */
  readonly harnessPath?: string;
}

// ============================================================================
// Adapter
// ============================================================================

export class SweBenchProAdapter
  implements
    BenchmarkAdapter<SweBenchProInstance, SweBenchProPrediction, SweBenchProEvalResult>
{
  readonly name = 'swebench-pro';
  // No `variant` in v1 — Pro is one dataset. The optional `variant` field
  // from the BenchmarkAdapter contract is left absent; future Pro-S /
  // Pro-XL slices (if Scale ships them) would set it here.

  private readonly config: SweBenchProConfig;

  constructor(config: SweBenchProConfig = {}) {
    this.config = config;
  }

  /**
   * Load the Pro instance set. v0 returns the bundled fixture (10
   * instances) so the harness scaffold is exercisable without network.
   * Real HuggingFace + `.jsonl` loaders ship in follow-up PRs (see
   * IMPLEMENTATION.md item 1).
   */
  loadInstances(_runConfig: Record<string, unknown>): Promise<readonly SweBenchProInstance[]> {
    // TODO(#1): implement HF / .jsonl loader.
    // For v0, return a tiny synthetic fixture so smoke tests pass.
    return Promise.resolve([
      {
        instanceId: 'fixture__001',
        repo: 'example/repo',
        baseCommit: '0000000000000000000000000000000000000000',
        problemStatement: 'Stub problem — replace with real Pro instance loader.',
        repoLanguage: 'python',
        requirements: '- Function returns "ok" when given valid input.',
        interface: 'def solve(x: str) -> str: ...',
      },
    ]);
  }

  /**
   * Run the agent on one Pro instance. v0 returns a stub patch so the
   * eval-harness wiring can be exercised end-to-end. Real runner ships
   * in follow-up PRs (see IMPLEMENTATION.md item 2).
   *
   * The runner needs to:
   *   - Compose a prompt that includes `instance.requirements` +
   *     `instance.interface` + `instance.problemStatement`
   *   - Invoke an agent (Claude / Codex / Gemini / OpenCode) inside a
   *     workspace cloned at `instance.baseCommit`
   *   - Capture the resulting patch text + a meaningful `prefix`
   */
  runInstance(
    instance: SweBenchProInstance,
    ctx: BenchmarkRunContext
  ): Promise<SweBenchProPrediction> {
    // TODO(#2): wire to a real solver.
    void ctx;
    const start = performance.now();
    return Promise.resolve({
      instanceId: instance.instanceId,
      patch: '',
      prefix: '',
      durationMs: Math.round(performance.now() - start),
    });
  }

  /**
   * Evaluate a Pro prediction. v0 marks any non-empty patch as a pass
   * so the smoke test runs. Real evaluation ships in follow-up PRs
   * (see IMPLEMENTATION.md item 4) and shells out to
   * `scaleapi/SWE-bench_Pro-os` via Docker.
   */
  evaluate(
    instance: SweBenchProInstance,
    prediction: SweBenchProPrediction
  ): Promise<SweBenchProEvalResult> {
    // TODO(#4): wire to scaleapi/SWE-bench_Pro-os via Docker.
    const passed = prediction.patch.length > 0;
    return Promise.resolve({
      instanceId: instance.instanceId,
      passed,
      repoLanguage: instance.repoLanguage,
      ...(passed ? {} : { reason: 'stub evaluator: non-empty patch required' }),
    });
  }

  isPass(result: SweBenchProEvalResult): boolean {
    return result.passed;
  }

  /**
   * Aggregate verdicts. Pro-specific: pass-rate broken down by
   * `repoLanguage` so the summary surfaces multi-language differentials
   * (often the most interesting Pro signal).
   */
  summarize(
    results: readonly SweBenchProEvalResult[],
    runTimeMs: number
  ): BenchmarkRunSummary {
    const passed = results.filter((r) => r.passed).length;
    const byLanguage: Record<string, { total: number; passed: number }> = {};
    for (const r of results) {
      const bucket = byLanguage[r.repoLanguage] ?? { total: 0, passed: 0 };
      bucket.total += 1;
      if (r.passed) bucket.passed += 1;
      byLanguage[r.repoLanguage] = bucket;
    }
    return {
      name: this.name,
      variant: 'default',
      total: results.length,
      passed,
      passRate: results.length > 0 ? passed / results.length : 0,
      runTimeMs,
      metadata: {
        byLanguage: Object.fromEntries(
          Object.entries(byLanguage).map(([lang, b]) => [
            lang,
            { ...b, passRate: b.total > 0 ? b.passed / b.total : 0 },
          ])
        ),
      },
    };
  }
}
