// scripts/bundle-closure.mjs — which libraries does the dashboard load EAGERLY?
//
//   node scripts/bundle-closure.mjs dist/apps/<app>/browser [--json] [probe …]
//   e.g. node scripts/bundle-closure.mjs dist/apps/scs-app/browser echarts @fullcalendar ngx-editor matrix-js-sdk
//
// Walks the STATIC import graph from main-*.js and dashboard.page-*.js. esbuild emits three
// static forms — `from"./x.js"`, side-effect `import"./x.js"`, and `export*from"./x.js"` —
// and one dynamic form, `import("./x.js")`, which is NOT an edge. The previous version
// followed only the first form and therefore reported echarts/FullCalendar as absent while
// Lighthouse fetched them before LCP (spec 1.49, F2). Reports raw AND gzip bytes: gzip is
// what the release budget (scripts/perf-budget.mjs) compares. Probe matching also checks pnpm's
// `.pnpm/<name>@<version>/` content-addressed store layout — a package's sourcemap paths don't
// always contain a literal `node_modules/<name>/` segment, so don't drop the `.pnpm` branch.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const dir = args[0];
const json = args.includes('--json');
const probes = args.slice(1).filter(a => a !== '--json');
if (!dir || !fs.existsSync(dir)) { console.error('usage: node scripts/bundle-closure.mjs <dist/apps/<app>/browser> [--json] [probe …]'); process.exit(2); }

const roots = fs.readdirSync(dir).filter(f => /^(main-|dashboard\.page-).*\.js$/.test(f));
// static edges only: `from"./x.js"`, `import"./x.js"`, `export*from"./x.js"` (single or double quotes)
const RE = /(?:from|import|export\s*\*\s*from)\s*["'](\.\/[^"']+\.js)["']/g;
const parent = new Map(), seen = new Set(roots), q = [...roots];
while (q.length) {
  const f = q.shift(), p = path.join(dir, f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8'); let m; RE.lastIndex = 0;
  while ((m = RE.exec(src))) { const t = m[1].slice(2); if (!seen.has(t)) { seen.add(t); parent.set(t, f); q.push(t); } }
}
const list = [...seen].filter(f => fs.existsSync(path.join(dir, f)));
let raw = 0, gz = 0;
for (const f of list) { const buf = fs.readFileSync(path.join(dir, f)); raw += buf.length; gz += zlib.gzipSync(buf, { level: 6 }).length; }

const probeHits = {};
for (const lib of probes) {
  probeHits[lib] = list.filter(f => {
    const mp = path.join(dir, f + '.map'); if (!fs.existsSync(mp)) return false;
    const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
    // pnpm nests package sources under node_modules/.pnpm/<name>@<version>/…, with a scoped
    // name's slash encoded as '+': @fullcalendar/core -> .pnpm/@fullcalendar+core@6.1.0/…
    const pnpmName = lib.replace('/', '+');
    return (m.sources || []).some(s =>
      s.includes('/node_modules/' + lib + '/') ||
      s.includes('/.pnpm/' + pnpmName + '@') ||
      s.includes('/libs/' + lib + '/'));
  });
}

if (json) { console.log(JSON.stringify({ chunks: list.length, rawBytes: raw, gzipBytes: gz, probes: probeHits })); process.exit(0); }

console.log(`dashboard static closure: ${list.length} chunks, ${(raw / 1048576).toFixed(2)} MB raw, ${(gz / 1024).toFixed(0)} KB gzip`);
for (const lib of probes) {
  const hits = probeHits[lib];
  if (!hits.length) { console.log(`  ${lib.padEnd(24)} NOT in dashboard closure`); continue; }
  console.log(`  ${lib.padEnd(24)} IN closure via ${hits.length} chunk(s):`);
  for (const h of hits) { let c = h, chain = []; while (c) { chain.push(c); c = parent.get(c); } console.log(`      ${h}\n        ${chain.reverse().join(' -> ')}`); }
}
