/**
 * Tests for patch extraction (src/runner/patch-extractor.ts).
 *
 * Covers legitimate fenced + bare unified-diff extraction and asserts that the
 * extractor is bounded-time on adversarial input — the `js/polynomial-redos`
 * CodeQL alerts the two extraction regexes previously raised. The untrusted
 * `response` is raw model output, so a malicious model could otherwise drive
 * O(n^2) backtracking.
 */
import { describe, it, expect } from 'vitest';
import { extractPatch } from './patch-extractor.js';

describe('extractPatch — legitimate extraction', () => {
  it('extracts a fenced ```diff block, ignoring surrounding prose', () => {
    const response =
      'Here is the fix:\n```diff\n--- a/x.py\n+++ b/x.py\n@@ -1 +1 @@\n-a\n+b\n```\nDone.';
    const patch = extractPatch(response);
    expect(patch).toContain('--- a/x.py');
    expect(patch).toContain('+++ b/x.py');
    expect(patch).toContain('+b');
  });

  it('extracts a fenced ```patch block', () => {
    const response = '```patch\n--- a/y\n+++ b/y\n@@ -1 +1 @@\n-x\n+y\n```';
    expect(extractPatch(response)).toContain('--- a/y');
  });

  it('extracts a bare unified diff with no fences', () => {
    const response = 'Explanation.\n--- a/z.go\n+++ b/z.go\n@@ -1 +1 @@\n-old\n+new\n';
    const patch = extractPatch(response);
    expect(patch).toContain('--- a/z.go');
    expect(patch).toContain('+++ b/z.go');
    expect(patch).toContain('+new');
  });

  it('strips trailing spaces/tabs per line and ensures a trailing newline', () => {
    const response = '```diff\n--- a/x   \n+++ b/x\t\n@@ -1 +1 @@\n-a\n+b\n```';
    const patch = extractPatch(response);
    expect(patch).toContain('--- a/x\n');
    expect(patch).toContain('+++ b/x\n');
    expect(patch.endsWith('\n')).toBe(true);
    expect(patch).not.toMatch(/[ \t]\n/);
  });

  it('returns empty string when there is no patch', () => {
    expect(extractPatch('No changes needed.')).toBe('');
  });
});

describe('extractPatch — ReDoS resistance (js/polynomial-redos)', () => {
  const BUDGET_MS = 250;

  it('is bounded-time on ~200k chars of near-miss bare-diff headers', () => {
    // Many `---  ` near-matches with no `+++` header to satisfy the matcher:
    // the pre-fix BARE_DIFF_RE would backtrack polynomially here.
    const adversarial = '--- '.repeat(50_000); // ~200k chars
    const start = performance.now();
    const out = extractPatch(adversarial);
    const elapsed = performance.now() - start;
    expect(out).toBe('');
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('is bounded-time on a long trailing-whitespace run with no line end', () => {
    // Targets the old `/[ \t]+$/` per-line strip inside normalise().
    const body = `--- a/x\n+++ b/x\n@@ -1 +1 @@\n${' '.repeat(180_000)}x`;
    const start = performance.now();
    const out = extractPatch(body);
    const elapsed = performance.now() - start;
    expect(out).toContain('--- a/x');
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('is bounded-time on a long unterminated fenced block', () => {
    const adversarial = '```diff\n' + 'a'.repeat(200_000);
    const start = performance.now();
    const out = extractPatch(adversarial);
    const elapsed = performance.now() - start;
    expect(out).toBe('');
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('rejects input above the length cap without scanning', () => {
    const huge = 'x'.repeat(1_048_577);
    const start = performance.now();
    expect(extractPatch(huge)).toBe('');
    expect(performance.now() - start).toBeLessThan(BUDGET_MS);
  });
});
