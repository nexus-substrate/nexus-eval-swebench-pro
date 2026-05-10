/**
 * Pro-specific prompt composition.
 *
 * Pro adds two fields not present in Lite/Verified — `requirements`
 * and `interface`. Both are first-class in the prompt because they
 * encode the contract the patch must satisfy.
 *
 * The template surfaces:
 *   - PROBLEM (problem_statement) — the issue body
 *   - REQUIREMENTS — bullet list the patch MUST satisfy
 *   - INTERFACE — function/API signatures the patch must expose
 *   - REPO LANGUAGE — for multi-language solver routing
 *   - hints (optional)
 *
 * @module runner/prompt-template
 */

import type { SweBenchProInstance } from '../adapter.js';

const SYSTEM_PROMPT = `You are an expert software engineer fixing a real-world bug from SWE-bench Pro.

You will receive:
1. A repo and base commit identifier (for context — you do NOT have a checkout).
2. A problem statement describing the bug.
3. A REQUIREMENTS list — bullet-style assertions the patch MUST satisfy.
4. An INTERFACE block — function/API signatures the patch must expose so downstream tests still link.
5. A REPO LANGUAGE tag (one of: python, javascript, typescript, go).
6. Optional hints.

Produce ONE unified diff patch and a PREFIX string. Output them in two fenced blocks.

Constraints:

- Patch must be a valid unified diff with \`---\`/\`+++\` headers, hunk headers (\`@@ ... @@\`), and the +/- lines.
- Patch paths are relative to the repo root.
- Patch must satisfy every REQUIREMENT and preserve every INTERFACE signature.
- Only modify code; do NOT modify tests (the harness adds its own test patch separately).
- The PREFIX is a short text identifier (e.g., the function name or the most relevant module) — the harness uses it to disambiguate when a patch is ambiguous against the source tree. Keep it short (under 80 chars).
- If you cannot solve the bug, emit an empty patch — do NOT hallucinate file contents.

Return both blocks back-to-back, no prose between or around:

\`\`\`diff
--- a/path/to/file.py
+++ b/path/to/file.py
@@ -10,3 +10,4 @@
 unchanged
-removed
+added
+also added
 unchanged
\`\`\`

\`\`\`prefix
solve_separability_matrix
\`\`\`
`;

export function composeUserPrompt(instance: SweBenchProInstance): string {
  const lines: string[] = [
    `Repo: ${instance.repo}`,
    `Base commit: ${instance.baseCommit}`,
    `Instance: ${instance.instanceId}`,
    `Repo language: ${instance.repoLanguage}`,
    '',
    'PROBLEM STATEMENT:',
    instance.problemStatement,
    '',
    'REQUIREMENTS (the patch MUST satisfy each):',
    instance.requirements,
    '',
    'INTERFACE (signatures the patch must preserve):',
    instance.interface,
  ];
  if (instance.hintsText !== undefined && instance.hintsText.length > 0) {
    lines.push('', 'HINTS:', instance.hintsText);
  }
  lines.push('', 'Produce the patch + prefix now.');
  return lines.join('\n');
}

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}
