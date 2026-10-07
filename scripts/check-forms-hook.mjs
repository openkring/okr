#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook: after a *.modal.ts, *.form.ts or *.validations.ts is written,
 * run scripts/check-forms.mjs and report the findings for THAT file (exit 2 → fed back to Claude).
 * Findings in other files are ignored here; `pnpm check-forms` still reports everything.
 * Wired in .claude/settings.json.
 */
import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;

let filePath = '';
try {
  const data = JSON.parse(input);
  filePath = data.tool_input?.file_path ?? data.tool_response?.filePath ?? '';
} catch {
  process.exit(0);
}
if (!/\.(modal|form|validations)\.ts$/.test(filePath) || filePath.endsWith('.spec.ts')) process.exit(0);

const root = new URL('..', import.meta.url).pathname;
const rel = relative(root, filePath);

let output = '';
try {
  execFileSync('node', ['scripts/check-forms.mjs'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.exit(0);
} catch (e) {
  output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
}

const mine = output.split('\n').filter((line) => line.trim().startsWith(`${rel}:`));
if (mine.length === 0) process.exit(0);

console.error(`check-forms: ${mine.length} finding(s) in ${rel}\n${mine.join('\n')}\n`
  + 'Fix them per the building-forms skill (a modal is okr-header + okr-change-confirmation + one okr-*-form).');
process.exit(2);
