// scripts/perf-budget.mjs — release gate for the dashboard's static JS closure (spec 1.49, T1.5).
//   node scripts/perf-budget.mjs scs-app          # compare against perf-budget.json, exit 1 on > +5 %
//   node scripts/perf-budget.mjs scs-app --write  # store the current value as the new baseline
// Why gzip of the static closure: it is the CI-computable proxy for "transfer KB before LCP",
// the metric the spec measures with Lighthouse; the closure grew 6.41 -> 6.54 MB raw in five
// days without anyone noticing, so a number nobody compares is not a budget.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [app, flag] = process.argv.slice(2);
if (!app) { console.error('usage: node scripts/perf-budget.mjs <app> [--write]'); process.exit(2); }
const dir = `dist/apps/${app}/browser`;
if (!fs.existsSync(dir)) { console.error(`perf-budget: ${dir} missing — build first`); process.exit(2); }
const out = execFileSync('node', ['scripts/bundle-closure.mjs', dir, '--json'], { encoding: 'utf8' });
const { chunks, gzipBytes } = JSON.parse(out.trim().split('\n').pop());
const file = 'perf-budget.json';
const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const TOLERANCE = 0.05;
if (flag === '--write') {
  all[app] = { dashboardClosureGzipBytes: gzipBytes, chunks, updated: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
  console.log(`perf-budget: ${app} baseline written — ${Math.round(gzipBytes / 1024)} KB gzip, ${chunks} chunks`);
  process.exit(0);
}
const base = all[app]?.dashboardClosureGzipBytes;
if (!base) { console.error(`perf-budget: no baseline for ${app} in ${file} — run with --write once`); process.exit(2); }
const limit = Math.round(base * (1 + TOLERANCE));
const kb = b => Math.round(b / 1024);
if (gzipBytes > limit) {
  console.error(`✖ perf-budget: ${app} dashboard closure is ${kb(gzipBytes)} KB gzip (${chunks} chunks); baseline ${kb(base)} KB, limit ${kb(limit)} KB (+${TOLERANCE * 100} %).`);
  console.error('  A new static import is binding a library into the dashboard. Find it: node scripts/bundle-closure.mjs ' + dir + ' <lib>');
  console.error('  If the growth is intended, rerun with --write and say why in the commit.');
  process.exit(1);
}
console.log(`✓ perf-budget: ${app} dashboard closure ${kb(gzipBytes)} KB gzip (baseline ${kb(base)} KB, limit ${kb(limit)} KB)`);
