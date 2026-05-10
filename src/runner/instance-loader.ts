/**
 * SWE-bench Pro instance loader.
 *
 * Two sources:
 *   1. HuggingFace Hub — fetches `ScaleAI/SWE-bench_Pro` via the public
 *      datasets-server JSON endpoint.
 *   2. Local `.jsonl` file — one normalised SweBenchProInstance per line.
 *
 * Caching: HuggingFace responses are written to `<cacheDir>/pro.jsonl`
 * on first fetch, then read from disk on subsequent calls.
 *
 * Pro adds `requirements`, `interface`, and `repo_language` fields not
 * present in Lite/Verified. The loader normalises into the camelCase
 * canonical form; the prediction writer de-normalises back.
 *
 * @module runner/instance-loader
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { SweBenchProInstance } from '../adapter.js';

const HF_DATASET = 'ScaleAI/SWE-bench_Pro';
const HF_DATASETS_SERVER = 'https://datasets-server.huggingface.co/rows';

/**
 * Load Pro instances from the configured source.
 *
 * @param source - 'huggingface' (default), 'fixture' (bundled smoke set),
 *   or absolute path to a .jsonl file
 * @param cacheDir - HF download cache root; ignored for non-HF sources
 * @param maxInstances - optional cap; useful for smoke tests
 * @param languages - optional language filter
 */
export async function loadSweBenchProInstances(args: {
  readonly source?: 'huggingface' | 'fixture' | string;
  readonly cacheDir?: string;
  readonly maxInstances?: number;
  readonly languages?: ReadonlyArray<SweBenchProInstance['repoLanguage']>;
}): Promise<readonly SweBenchProInstance[]> {
  const source = args.source ?? 'huggingface';

  let all: readonly SweBenchProInstance[];
  if (source === 'huggingface') {
    all = await loadFromHuggingFace(args.cacheDir);
  } else if (source === 'fixture') {
    all = loadBundledFixture();
  } else {
    all = loadFromFile(source);
  }

  let filtered = all;
  if (args.languages !== undefined && args.languages.length > 0) {
    const allowed = new Set(args.languages);
    filtered = filtered.filter((i) => allowed.has(i.repoLanguage));
  }
  if (args.maxInstances !== undefined && args.maxInstances < filtered.length) {
    filtered = filtered.slice(0, args.maxInstances);
  }
  return filtered;
}

/**
 * Read a JSONL file of normalised instances. One SweBenchProInstance
 * per non-empty line.
 */
function loadFromFile(path: string): readonly SweBenchProInstance[] {
  if (!existsSync(path)) {
    throw new Error(`SWE-bench Pro fixture not found: ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  const out: SweBenchProInstance[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    out.push(JSON.parse(trimmed) as SweBenchProInstance);
  }
  return out;
}

/**
 * Bundled minimal fixture (1 instance per language). For smoke testing
 * the harness without a network round-trip.
 */
function loadBundledFixture(): readonly SweBenchProInstance[] {
  return [
    {
      instanceId: 'fixture__python__001',
      repo: 'example/python-repo',
      baseCommit: '0000000000000000000000000000000000000000',
      problemStatement: 'Stub Python instance — replace with real Pro data via --dataset.',
      repoLanguage: 'python',
      requirements: '- Function returns "ok" when given valid input.',
      interface: 'def solve(x: str) -> str: ...',
    },
    {
      instanceId: 'fixture__javascript__001',
      repo: 'example/js-repo',
      baseCommit: '0000000000000000000000000000000000000000',
      problemStatement: 'Stub JavaScript instance.',
      repoLanguage: 'javascript',
      requirements: '- Function returns "ok" when given valid input.',
      interface: 'function solve(x) { ... }',
    },
    {
      instanceId: 'fixture__typescript__001',
      repo: 'example/ts-repo',
      baseCommit: '0000000000000000000000000000000000000000',
      problemStatement: 'Stub TypeScript instance.',
      repoLanguage: 'typescript',
      requirements: '- Function returns "ok" when given valid input.',
      interface: 'function solve(x: string): string { ... }',
    },
    {
      instanceId: 'fixture__go__001',
      repo: 'example/go-repo',
      baseCommit: '0000000000000000000000000000000000000000',
      problemStatement: 'Stub Go instance.',
      repoLanguage: 'go',
      requirements: '- Function returns "ok" when given valid input.',
      interface: 'func Solve(x string) string',
    },
  ];
}

interface HfRow {
  readonly row: Record<string, unknown>;
}
interface HfResponse {
  readonly rows?: readonly HfRow[];
  readonly num_rows_total?: number;
}

async function loadFromHuggingFace(
  cacheDirRaw: string | undefined
): Promise<readonly SweBenchProInstance[]> {
  const cacheDir = cacheDirRaw ?? defaultCacheDir();
  const cachePath = `${cacheDir}/pro.jsonl`;
  if (existsSync(cachePath)) {
    return loadFromFile(cachePath);
  }

  const all: SweBenchProInstance[] = [];
  let offset = 0;
  const length = 100;
  for (let page = 0; page < 100; page += 1) {
    const url =
      `${HF_DATASETS_SERVER}?dataset=${encodeURIComponent(HF_DATASET)}` +
      `&config=default&split=test&offset=${String(offset)}&length=${String(length)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `HuggingFace dataset fetch failed (${HF_DATASET}): ` +
          `HTTP ${String(res.status)} ${res.statusText}`
      );
    }
    const body = (await res.json()) as HfResponse;
    const rows = body.rows ?? [];
    for (const r of rows) {
      const normalised = normaliseHfRow(r.row);
      if (normalised !== null) all.push(normalised);
    }
    if (rows.length === 0) break;
    if (body.num_rows_total !== undefined && all.length >= body.num_rows_total) break;
    offset += rows.length;
  }

  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(
    cachePath,
    all.map((i) => JSON.stringify(i)).join('\n') + '\n',
    'utf8'
  );
  return all;
}

/**
 * Normalise an HF row (snake_case, may have nullable fields) into the
 * canonical SweBenchProInstance shape. Returns null when the row is
 * missing required fields (instanceId, repo, baseCommit, problemStatement,
 * requirements, interface, repoLanguage).
 */
function normaliseHfRow(row: Record<string, unknown>): SweBenchProInstance | null {
  const str = (k: string): string => {
    const v = row[k];
    return typeof v === 'string' ? v : '';
  };
  const optStr = (k: string): string | undefined => {
    const v = row[k];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  };

  const instanceId = str('instance_id');
  const repo = str('repo');
  const baseCommit = str('base_commit');
  const problemStatement = str('problem_statement');
  const requirements = str('requirements');
  const interfaceField = str('interface');
  const langRaw = str('repo_language');

  if (
    instanceId === '' ||
    repo === '' ||
    baseCommit === '' ||
    problemStatement === '' ||
    requirements === '' ||
    interfaceField === ''
  ) {
    return null;
  }
  if (
    langRaw !== 'python' &&
    langRaw !== 'javascript' &&
    langRaw !== 'typescript' &&
    langRaw !== 'go'
  ) {
    return null;
  }

  const hints = optStr('hints_text');
  const base: SweBenchProInstance = {
    instanceId,
    repo,
    baseCommit,
    problemStatement,
    repoLanguage: langRaw,
    requirements,
    interface: interfaceField,
  };
  return hints !== undefined ? { ...base, hintsText: hints } : base;
}

function defaultCacheDir(): string {
  const home = process.env['HOME'] ?? '/tmp';
  return `${home}/.nexus-eval-swebench-pro/cache`;
}
