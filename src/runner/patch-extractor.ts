/**
 * Extract a unified-diff patch from a model response.
 *
 * Handles the common shapes:
 *   1. Fenced ` ```diff ` / ` ```patch ` block (preferred)
 *   2. Bare unified diff (starts with `---` / `+++` headers)
 *   3. Empty / no-patch responses → empty string
 *
 * SECURITY: the `response` argument is untrusted model output. Both extraction
 * regexes below previously had the `prefix[\s\S]*?...[\s\S]*` shape that the
 * CodeQL `js/polynomial-redos` query flags: an unanchored quantifier followed
 * by another open-ended quantifier exhibits O(n^2) backtracking when the tail
 * fails to match on a long, adversarially-constructed input. We close that
 * class two ways that compose: (a) bound the input length before it reaches
 * any regex sink (a real SWE-bench patch is a few KiB; the cap is generous),
 * and (b) rewrite the matchers so they no longer rely on ambiguous overlapping
 * quantifiers — the bare-diff matcher is anchored to the `---`/`+++` header
 * pair and trailing-whitespace stripping is done without a backtracking regex.
 * See https://codeql.github.com/codeql-query-help/javascript/js-polynomial-redos/
 *
 * @module runner/patch-extractor
 */

/**
 * Maximum response length we will scan for a patch. SWE-bench Pro patches are
 * at most a few KiB; 1 MiB is far beyond any legitimate model response while
 * keeping the regex work bounded against pathological input. Anything larger
 * is treated as containing no extractable patch.
 */
const MAX_RESPONSE_LENGTH = 1_048_576;

const FENCED_DIFF_RE = /```(?:diff|patch)\n([\s\S]*?)```/;
// Anchor on the `---`/`+++` header pair. `[^\n]*` (no newline) for each header
// line is linear and unambiguous; the trailing `[\s\S]*` only runs once the
// header pair has matched, so there is no overlapping-quantifier backtracking.
const BARE_DIFF_RE = /(?:^|\n)(---[ \t]+\S[^\n]*\n\+\+\+[ \t]+\S[\s\S]*)/;

export function extractPatch(response: string): string {
  // Bound untrusted input before any regex sink (ReDoS guard).
  if (response.length > MAX_RESPONSE_LENGTH) {
    return '';
  }
  const fenced = FENCED_DIFF_RE.exec(response);
  if (fenced !== null && fenced[1] !== undefined) {
    return normalise(fenced[1]);
  }
  const bare = BARE_DIFF_RE.exec(response);
  if (bare !== null && bare[1] !== undefined) {
    return normalise(bare[1]);
  }
  return '';
}

/**
 * Normalise a patch string for harness consumption: trim trailing whitespace
 * per line, ensure exactly one trailing newline, drop leading blank lines.
 */
function normalise(patch: string): string {
  const trimmed = patch
    .split('\n')
    .map(stripTrailingBlanks)
    .join('\n')
    .replace(/^\n+/, '');
  return trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`;
}

/**
 * Strip trailing spaces and tabs from a single line without a regex. Using
 * `/[ \t]+$/` here is the canonical `js/polynomial-redos` pattern (the engine
 * retries the `+` run from each position when `$` is reached); a manual scan
 * from the end is unambiguously linear.
 */
function stripTrailingBlanks(line: string): string {
  let end = line.length;
  while (end > 0) {
    const ch = line.charCodeAt(end - 1);
    // 0x20 = space, 0x09 = tab
    if (ch !== 0x20 && ch !== 0x09) break;
    end -= 1;
  }
  return end === line.length ? line : line.slice(0, end);
}
