#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook: after a skill reference file (.claude/skills/**.md, not SKILL.md)
 * is written, run scripts/check-skill-contents.mjs on THAT file and report a missing or stale
 * Contents list (exit 2 → fed back to Claude). It reports rather than rewrites, so the file never
 * changes under the editor between a Read and the next Edit.
 * Wired in .claude/settings.json.
 */
import { execFileSync } from 'node:child_process';
import { basename, relative } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;

let filePath = '';
try {
  const data = JSON.parse(input);
  filePath = data.tool_input?.file_path ?? data.tool_response?.filePath ?? '';
} catch {
  process.exit(0);
}
if (!/\/\.claude\/skills\/.+\.md$/.test(filePath) || basename(filePath) === 'SKILL.md') process.exit(0);

const root = new URL('..', import.meta.url).pathname;
const rel = relative(root, filePath);

try {
  execFileSync('node', ['scripts/check-skill-contents.mjs', rel], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.exit(0);
} catch (e) {
  console.error(`${e.stdout ?? ''}${e.stderr ?? ''}`.trim()
    + `\nRegenerate it with: pnpm check-skill-contents --write ${rel}`);
  process.exit(2);
}
