# nexus-eval-swebench-pro

SWE-bench **Pro** evaluation harness for [nexus-agents](https://github.com/williamzujkowski/nexus-agents) — implements the `BenchmarkAdapter` contract from nexus-agents ≥ 2.33.1.

> **Status**: v0.1 scaffold. The adapter compiles, smoke tests pass, and the type contract is locked. Real dataset loader, runner, and Docker eval ship in [tracked follow-ups](#implementation-roadmap).

## Why Pro

OpenAI and Anthropic both publicly signal that **SWE-bench Verified is largely contaminated and topped out** — top systems on Verified now cluster in the high 70s, where small differences are within noise. SWE-bench Pro is the next target:

- **731 instances** across **11 real-world repos** (Ansible, OpenLibrary, Teleport, Element, NodeBB, …)
- **Multi-language**: Python, JavaScript, TypeScript, Go (Verified is Python-only)
- **Top systems score ~23%** — meaningful differentiation across current state-of-the-art
- **Newer dataset** with stronger contamination resistance than Verified
- **Different prediction format** (`{instance_id, patch, prefix}`) and a different Docker eval harness (`scaleapi/SWE-bench_Pro-os`)

This repo is the dedicated harness for running Pro evaluations through nexus-agents' orchestration. Per the [nexus-agents harness-extraction policy](https://github.com/williamzujkowski/nexus-agents/issues/2514) (originally [#1960](https://github.com/williamzujkowski/nexus-agents/issues/1960)), benchmarks live in standalone `nexus-eval-*` repos so they can evolve independently of the core.

## Install

```sh
npm install nexus-eval-swebench-pro nexus-agents
```

`nexus-agents` is a peer dependency.

## Quick start (v0.1 scaffold — uses stub data)

```sh
# Smoke test the scaffold
npx nexus-eval-swebench-pro

# JSON summary
npx nexus-eval-swebench-pro --json
```

This currently exercises the type contract end-to-end against a single stub instance. Real Pro instances + real evaluation arrive in v0.2 (see [Implementation roadmap](#implementation-roadmap)).

## Library usage

```ts
import { runBenchmark } from 'nexus-agents';
import { SweBenchProAdapter } from 'nexus-eval-swebench-pro';

const adapter = new SweBenchProAdapter({ dataset: 'huggingface' });
const summary = await runBenchmark(adapter, {}, {
  concurrency: 4,
  limit: 25, // start small — full Pro is 731 instances
});

console.log(`Resolved ${summary.passed}/${summary.total} (${(summary.passRate * 100).toFixed(1)}%)`);

// Per-language breakdown — Pro's most interesting signal
const meta = summary.metadata as { byLanguage: Record<string, { total: number; passed: number; passRate: number }> };
for (const [lang, stats] of Object.entries(meta.byLanguage)) {
  console.log(`  ${lang}: ${stats.passed}/${stats.total} (${(stats.passRate * 100).toFixed(1)}%)`);
}
```

## What this harness will do (full implementation)

- Load Pro instances from the [`ScaleAI/SWE-bench_Pro` HuggingFace dataset](https://huggingface.co/datasets/ScaleAI/SWE-bench_Pro), or from a local `.jsonl` fixture.
- Compose prompts that surface Pro's `requirements` + `interface` fields (not present in Lite/Verified) so the solver sees the API contract it must satisfy.
- Invoke the configured agent executor inside a workspace cloned at each instance's `base_commit`.
- Capture the resulting patch + prefix in Pro's required `{instance_id, patch, prefix}` shape.
- Run the resulting predictions against the [`scaleapi/SWE-bench_Pro-os` Docker harness](https://github.com/scaleapi/SWE-bench_Pro-os) with `--use_local_docker`.
- Surface per-language pass-rates in the summary so multi-language differentials are visible (the headline Pro signal).

## Implementation roadmap

Tracked in this repo's issues (filed alongside this v0.1 scaffold):

- **[#2](https://github.com/williamzujkowski/nexus-eval-swebench-pro/issues/2) — Dataset loader** for the Pro format. HuggingFace fetcher + `.jsonl` reader + bundled fixture path. Handles the new `requirements`, `interface`, `repo_language` fields and the `languages` filter.
- **[#3](https://github.com/williamzujkowski/nexus-eval-swebench-pro/issues/3) — Solver runner + prompt template** (deliverables 2 + 3 from the original scope). Composes the Pro-specific prompt that surfaces `requirements` + `interface`, clones the repo at `base_commit`, invokes the agent, captures patch + prefix.
- **[#4](https://github.com/williamzujkowski/nexus-eval-swebench-pro/issues/4) — Docker eval integration** with `scaleapi/SWE-bench_Pro-os` and `--use_local_docker`. Per-instance Docker images, concurrency-safe, prepull support.
- **[#5](https://github.com/williamzujkowski/nexus-eval-swebench-pro/issues/5) — End-to-end smoke** against ≤5 real instances spanning all 4 languages, validating the full pipeline.

Cross-repo tracking lives at [nexus-agents #2513](https://github.com/williamzujkowski/nexus-agents/issues/2513) so anyone searching the main repo for "SWE-bench Pro" lands at this repo.

## The contract

`BenchmarkAdapter` from nexus-agents:

```ts
interface BenchmarkAdapter<TInstance, TPrediction, TEvalResult> {
  readonly name: string;
  readonly variant?: string;
  loadInstances(config): Promise<readonly TInstance[]>;
  runInstance(instance, ctx): Promise<TPrediction>;
  evaluate(instance, prediction): Promise<TEvalResult>;
  isPass(result): boolean;
  summarize(results, runTimeMs): BenchmarkRunSummary;
}
```

The orchestrator (`runBenchmark` in nexus-agents) handles concurrency, timeouts, progress, and partial failure — this repo doesn't reimplement the harness.

## Cost notes

Pro's per-instance cost is significant — each instance requires:
- A repo clone (some Pro repos are large; expect 100MB+ each)
- A solver invocation through your configured agent
- A Docker container per instance for evaluation

A full 731-instance sweep is operationally non-trivial. Start with `--limit 5` for smoke, then `--limit 25` for a meaningful slice, before committing to a full run. Per-language slices (`--languages python,go`) are useful for diagnosing routing decisions.

## License

MIT.
