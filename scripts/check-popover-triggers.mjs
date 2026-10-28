#!/usr/bin/env node
/**
 * Every ion-popover trigger id must come from contextMenuId() (@okr/shared-util-core).
 *
 * Ionic binds a popover to its trigger ONCE, via a global document.getElementById(trigger), and
 * keeps previous pages in the DOM. A literal id (`trigger="c_resource"`) or a data-derived one
 * (`c_tasks_${listId()}`) repeats as soon as the same list is open twice in the stack, and the new
 * popover binds to the HIDDEN page's button: the ellipsis shows, a click does nothing. No build,
 * lint or test notices. It was fixed one list at a time (tasks 2026-09-30, finance 2026-10-08)
 * until it was made a rule.
 *
 * Accepted:  trigger="{{ popupId }}"  or  [trigger]="popupId"
 *            where the same file declares  popupId = contextMenuId('<prefix>')
 *
 * Usage: node scripts/check-popover-triggers.mjs          (exit 1 on any finding — CI friendly)
 *        node scripts/check-popover-triggers.mjs --hook   (Claude Code PostToolUse hook: reads the
 *                                                          tool input on stdin, checks that file,
 *                                                          exit 2 with the findings)
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function check(file, src) {
  const findings = [];
  if (!src.includes('<ion-popover')) return findings;
  const lineOf = (index) => src.slice(0, index).split('\n').length;
  const declared = (name) =>
    new RegExp(`\\b${name}\\s*=\\s*contextMenuId\\(`).test(src);

  for (const m of src.matchAll(/(\[trigger\]|(?<![\w[])trigger)="([^"]*)"/g)) {
    const bound = m[1] === '[trigger]';
    const value = m[2].trim();
    const name = bound ? value : (value.match(/^\{\{\s*(.+?)\s*\}\}$/) ?? [])[1];
    const at = `${file}:${lineOf(m.index)}`;
    if (!name) {
      findings.push(`${at}  trigger="${value}" is a fixed id — use {{ popupId }} with popupId = contextMenuId('<prefix>')`);
    } else if (!/^\w+$/.test(name)) {
      findings.push(`${at}  trigger ${value} is not a plain field — declare popupId = contextMenuId('<prefix>') and bind that`);
    } else if (!declared(name)) {
      findings.push(`${at}  ${name} is not declared as contextMenuId('<prefix>') in this file — a fixed or data-derived id binds the popover to a hidden page's button`);
    }
  }
  return findings;
}

if (process.argv.includes('--hook')) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let filePath = '';
  try {
    const data = JSON.parse(input);
    filePath = data.tool_input?.file_path ?? data.tool_response?.filePath ?? '';
  } catch {
    process.exit(0);
  }
  if (!filePath.endsWith('.ts') || filePath.endsWith('.spec.ts') || !existsSync(filePath)) process.exit(0);
  const rel = relative(root, filePath);
  const findings = check(rel, readFileSync(filePath, 'utf8'));
  if (findings.length === 0) process.exit(0);
  console.error(`check-popover-triggers: ${findings.length} finding(s)\n${findings.join('\n')}\n`
    + "Bind ion-popover triggers to a field declared as contextMenuId('<prefix>') from @okr/shared-util-core.");
  process.exit(2);
}

process.chdir(root);
const files = execSync(
  "grep -rl --include='*.ts' '<ion-popover' libs apps/*/src 2>/dev/null || true", { encoding: 'utf8', shell: '/bin/bash' })
  .split('\n').filter((f) => f && !f.endsWith('.spec.ts')).sort();

const findings = files.flatMap((f) => check(f, readFileSync(f, 'utf8')));
if (findings.length > 0) {
  console.error(findings.join('\n'));
  console.error(`\n✖ ${findings.length} ion-popover trigger(s) without contextMenuId() — see scripts/check-popover-triggers.mjs`);
  process.exit(1);
}
console.log(`✔ ${files.length} files with ion-popover: every trigger comes from contextMenuId()`);
