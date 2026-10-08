#!/usr/bin/env node
/**
 * Guards the Contents-list rule for skill reference files: every markdown file under
 * .claude/skills/ other than SKILL.md that is longer than 100 lines starts with a `## Contents`
 * section directly below its H1, listing every `##` heading with its `###` headings nested two
 * spaces below. A file that already has a Contents section is checked whatever its length, so a
 * list never goes stale silently.
 *
 * Why: Claude often previews a long reference with a partial read; the list shows the whole
 * scope up front. A stale list is worse than none, hence the check.
 *
 * Usage: node scripts/check-skill-contents.mjs [--write] [file ...]
 *   no files → every skill reference; exit 1 on any finding (CI friendly)
 *   --write  → insert or regenerate the list in place instead of reporting
 * The skills submodule is private and empty in a public clone: nothing to check → exit 0.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKILLS = join(ROOT, '.claude/skills');
const MAX_LINES = 100;

const args = process.argv.slice(2);
const write = args.includes('--write');
const explicit = args.filter((a) => !a.startsWith('--'));

/** all *.md below .claude/skills except SKILL.md */
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name.startsWith('.') || name === 'node_modules' || name === '__pycache__') return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return name.endsWith('.md') && name !== 'SKILL.md' ? [p] : [];
  });
}

const isReference = (p) => p.startsWith(SKILLS + '/') && p.endsWith('.md') && basename(p) !== 'SKILL.md';

/** `##`/`###` headings outside code fences, skipping the Contents heading itself */
function headings(lines) {
  let fence = null;
  const out = [];
  for (const line of lines) {
    const f = line.match(/^\s*(```|~~~)/);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (m && m[2] !== 'Contents') out.push((m[1].length === 3 ? '  ' : '') + '- ' + m[2]);
  }
  return out;
}

/** [start, end) of the Contents block: the heading through the last list line */
function contentsBlock(lines) {
  const start = lines.findIndex((l) => l.trim() === '## Contents');
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === '' || /^\s*- /.test(lines[end]))) end++;
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  return { start, end, items: lines.slice(start + 1, end).filter((l) => l.trim() !== '') };
}

function check(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const block = contentsBlock(lines);
  const expected = headings(lines);
  const rel = relative(ROOT, file);

  if (!block) {
    if (lines.length <= MAX_LINES) return [];
    if (!write) return [`${rel}:1: ${lines.length} lines but no "## Contents" list below the H1`];
    const h1 = lines.findIndex((l) => l.startsWith('# '));
    let rest = h1 + 1;
    while (rest < lines.length && lines[rest].trim() === '') rest++;
    const next = [...lines.slice(0, h1 + 1), '', '## Contents', '', ...expected, '', ...lines.slice(rest)];
    writeFileSync(file, next.join('\n'));
    return [];
  }

  if (block.items.join('\n') === expected.join('\n')) return [];
  if (!write) {
    const missing = expected.filter((e) => !block.items.includes(e)).map((e) => e.trim().slice(2));
    const extra = block.items.filter((i) => !expected.includes(i)).map((i) => i.trim().slice(2));
    const detail = [missing.length && `missing ${missing.join(' | ')}`, extra.length && `stale ${extra.join(' | ')}`]
      .filter(Boolean).join('; ') || 'order or nesting differs from the headings';
    return [`${rel}:${block.start + 1}: Contents list out of sync — ${detail}`];
  }
  const next = [...lines.slice(0, block.start + 1), '', ...expected, ...lines.slice(block.end)];
  writeFileSync(file, next.join('\n'));
  return [];
}

const targets = (explicit.length ? explicit.map((f) => join(process.cwd(), f)) : walk(SKILLS))
  .filter((p) => isReference(p) && existsSync(p));
const findings = targets.flatMap(check);

if (findings.length) {
  console.error(findings.join('\n'));
  console.error(`\n${findings.length} finding(s). Fix with: pnpm check-skill-contents --write`);
  process.exit(1);
}
if (!write) console.log(`check-skill-contents: ${targets.length} skill reference file(s) OK`);
