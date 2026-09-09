// CPU-Profil je langem Main-Thread-Task eines kalten Seitenaufrufs (ungedrosselt), über CDP-Tracing
// mit `disabled-by-default-v8.cpu_profiler`. Anders als der Lighthouse-Trace wird hier der Thread
// über `navigationStart` + `CrRendererMain` bestimmt, damit der Service-Worker-Thread desselben
// Prozesses nicht hineinmischt (perf-baselines.md, Fallen vom 2026-09-08). User-Timing-Marken
// (`okr:snapshot:*` aus dem FirestoreSubscriptionMonitor) liegen auf derselben Uhr wie die Samples,
// darum lässt sich je Task sagen: welche Snapshots kamen darin an, und welche Funktionen haben die
// Zeit verbraucht — Self-Time und inklusive Zeit, über Source Maps auf Datei:Zeile aufgelöst.
//
// Braucht das angemeldete Profil aus Regel 7 (/tmp/lh-profile) und einen lokalen Server (Regel 7,
// Variante). Schreibt den Trace nach <out>.trace.json und wertet ihn sofort aus; ein vorhandener
// Trace kann mit `--analyze <file>` erneut ausgewertet werden.
//
// Usage: node scripts/perf-cpu-task-profile.mjs [url] [--out /tmp/cpu] [--min 40] [--wait 14000]
//        node scripts/perf-cpu-task-profile.mjs --analyze /tmp/cpu.trace.json [--min 40] [--dist dist/apps/scs-app/browser]
import { chromium } from 'playwright';
import { rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const url = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--'))) ?? 'http://localhost:5050/private/dashboard/c-contentpage';
const out = opt('--out', '/tmp/cpu');
const MIN = Number(opt('--min', 40));
const waitMs = Number(opt('--wait', 14000));
const dist = opt('--dist', 'dist/apps/scs-app/browser');
const analyzeOnly = opt('--analyze', null);

async function record() {
  const PROFILE = '/tmp/lh-profile';
  for (const d of ['Cache', 'Code Cache', 'GPUCache', 'Service Worker']) rmSync(`${PROFILE}/Default/${d}`, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome', headless: false, viewport: { width: 412, height: 823 },
    args: ['--disable-extensions', '--no-first-run'],
  });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const chunks = [];
  const done = new Promise((res) => cdp.on('Tracing.tracingComplete', (e) => res(e.stream)));
  cdp.on('Tracing.dataCollected', (e) => chunks.push(...e.value));
  await cdp.send('Tracing.start', {
    traceConfig: {
      includedCategories: ['disabled-by-default-v8.cpu_profiler', 'devtools.timeline', 'blink.user_timing', 'toplevel', '__metadata'],
      recordMode: 'recordContinuously',
    },
    transferMode: 'ReturnAsStream',
  });
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForTimeout(waitMs);
  await cdp.send('Tracing.end');
  const stream = await done;
  let json = '';
  if (stream) {
    for (;;) {
      const r = await cdp.send('IO.read', { handle: stream, size: 1 << 20 });
      json += r.base64Encoded ? Buffer.from(r.data, 'base64').toString('utf8') : r.data;
      if (r.eof) break;
    }
    await cdp.send('IO.close', { handle: stream });
  } else {
    json = JSON.stringify({ traceEvents: chunks });
  }
  await ctx.close();
  writeFileSync(`${out}.trace.json`, json);
  console.log(`trace: ${out}.trace.json (${(json.length / 1e6).toFixed(1)} MB)`);
  return `${out}.trace.json`;
}

// ---- Source Maps ----------------------------------------------------------
const require = createRequire(import.meta.url);
let TraceMap = null, originalPositionFor = null;
// trace-mapping ist keine direkte Abhängigkeit; pnpm hält es unter .pnpm — beide Wege probieren.
for (const spec of ['@jridgewell/trace-mapping', ...(() => { try { return require('node:fs').readdirSync('node_modules/.pnpm').filter((d) => d.startsWith('@jridgewell+trace-mapping@')).map((d) => path.resolve('node_modules/.pnpm', d, 'node_modules/@jridgewell/trace-mapping')); } catch { return []; } })()]) {
  try { ({ TraceMap, originalPositionFor } = require(spec)); break; } catch { /* nächster */ }
}
const mapCache = new Map();
function resolve(u, line, col) {
  if (!TraceMap || !u) return null;
  const file = u.replace(/^https?:\/\/[^/]+\//, '');
  let tm = mapCache.get(file);
  if (tm === undefined) {
    const p = path.join(dist, `${file}.map`);
    tm = existsSync(p) ? new TraceMap(JSON.parse(readFileSync(p, 'utf8'))) : null;
    mapCache.set(file, tm);
  }
  if (!tm) return null;
  const pos = originalPositionFor(tm, { line: line + 1, column: col });
  if (!pos.source) return null;
  const src = pos.source.replace(/^.*?node_modules\//, 'npm:').replace(/^(\.\.\/)+/, '');
  return `${src}:${pos.line}${pos.name ? ` (${pos.name})` : ''}`;
}

// ---- Analyse ---------------------------------------------------------------
function analyze(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const events = Array.isArray(raw) ? raw : raw.traceEvents;
  // Haupt-Thread: der Renderer-Prozess mit navigationStart, darin CrRendererMain.
  const nav = events.filter((e) => e.name === 'navigationStart' && e.args?.data?.isLoadingMainFrame !== false).sort((a, b) => a.ts - b.ts).pop()
    ?? events.find((e) => e.name === 'navigationStart');
  if (!nav) throw new Error('kein navigationStart im Trace');
  const pid = nav.pid;
  const threadName = events.find((e) => e.name === 'thread_name' && e.pid === pid && e.args?.name === 'CrRendererMain');
  const tid = threadName?.tid ?? nav.tid;
  const navTs = nav.ts;
  const onThread = events.filter((e) => e.pid === pid && e.tid === tid);
  // `RunTask` heisst im devtools.timeline-Trace so, in der `toplevel`-Kategorie `ThreadControllerImpl::RunTask`.
  const tasks = onThread.filter((e) => (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.ph === 'X' && e.dur / 1000 >= MIN).sort((a, b) => a.ts - b.ts);
  const marks = onThread.filter((e) => e.cat?.includes('blink.user_timing') && typeof e.name === 'string' && e.name.startsWith('okr:snapshot:'));
  // Profil zusammensetzen
  const nodes = new Map(); const samples = []; // [{ts, id}]
  let cur = null;
  // Das `Profile`-Ereignis liegt auf dem Haupt-Thread, seine `ProfileChunk`s aber auf einem eigenen
  // Sampler-Thread desselben Prozesses — Zuordnung über die `id`, nicht über die tid.
  const profileIds = new Set(onThread.filter((e) => e.name === 'Profile').map((e) => e.id));
  const profiles = events.filter((e) => e.pid === pid && (e.name === 'Profile' || e.name === 'ProfileChunk') && profileIds.has(e.id)).sort((a, b) => a.ts - b.ts);
  const byId = new Map();
  for (const e of profiles) {
    const id = e.id ?? e.args?.data?.id ?? 'p';
    if (e.name === 'Profile') { byId.set(id, { t: e.args?.data?.startTime ?? e.ts }); continue; }
    const st = byId.get(id) ?? (byId.set(id, { t: e.ts }), byId.get(id));
    const cp = e.args?.data?.cpuProfile ?? {};
    for (const n of cp.nodes ?? []) {
      nodes.set(n.id, { id: n.id, parent: n.parent ?? nodes.get(n.id)?.parent, fn: n.callFrame?.functionName || '(anonymous)', url: n.callFrame?.url || '', line: n.callFrame?.lineNumber ?? 0, col: n.callFrame?.columnNumber ?? 0 });
      if (n.children) for (const c of n.children) { const cn = nodes.get(c) ?? { id: c }; cn.parent = n.id; nodes.set(c, cn); }
    }
    const deltas = e.args?.data?.timeDeltas ?? [];
    (cp.samples ?? []).forEach((s, i) => { st.t += deltas[i] ?? 0; samples.push({ ts: st.t, id: s, dt: deltas[i] ?? 0 }); });
    cur = st;
  }
  void cur;
  samples.sort((a, b) => a.ts - b.ts);
  const label = (n) => {
    const res = resolve(n.url, n.line, n.col);
    const u = n.url.replace(/^https?:\/\/[^/]+\//, '');
    return `${n.fn}  ${res ?? `${u}:${n.line}`}`;
  };
  const isApp = (n) => { const l = resolve(n.url, n.line, n.col) ?? ''; return l.startsWith('libs/') || l.startsWith('apps/'); };
  const ms = (us) => (us / 1000).toFixed(1).padStart(7);
  console.log(`Main-Thread pid ${pid} tid ${tid}; ${samples.length} Samples, ${tasks.length} Tasks ≥ ${MIN} ms, ${marks.length} Snapshot-Marken\n`);
  for (const t of tasks) {
    const t0 = t.ts, t1 = t.ts + t.dur;
    const inMarks = marks.filter((m) => m.ts >= t0 - 500 && m.ts <= t1).map((m) => `${((m.ts - navTs) / 1000).toFixed(1)}:${m.name.slice(13)}`);
    const win = samples.filter((s) => s.ts >= t0 && s.ts <= t1);
    const self = new Map(); const incl = new Map(); const app = new Map();
    for (const s of win) {
      const n = nodes.get(s.id); if (!n) continue;
      self.set(n.id, (self.get(n.id) ?? 0) + s.dt);
      const seen = new Set(); let firstApp = null;
      for (let c = n; c; c = nodes.get(c.parent)) {
        const k = label(c); if (seen.has(k)) continue; seen.add(k);
        incl.set(k, (incl.get(k) ?? 0) + s.dt);
        if (!firstApp && isApp(c)) firstApp = k;
      }
      if (firstApp) app.set(firstApp, (app.get(firstApp) ?? 0) + s.dt);
    }
    const total = win.reduce((a, s) => a + s.dt, 0);
    console.log(`=== Task @ ${((t0 - navTs) / 1000).toFixed(0)} ms, dur ${(t.dur / 1000).toFixed(0)} ms, sampled ${(total / 1000).toFixed(0)} ms; Snapshots (≤0.5 ms davor bis Ende): ${inMarks.join(' ') || '-'}`);
    const byUrl = new Map();
    for (const [id, dt] of self) { const n = nodes.get(id); const u = (n.url || '(native)').replace(/^https?:\/\/[^/]+\//, ''); byUrl.set(u, (byUrl.get(u) ?? 0) + dt); }
    console.log('  Self-Time je Skript:');
    for (const [u, dt] of [...byUrl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`   ${ms(dt)}  ${u}`);
    console.log('  Self-Time je Funktion (Top 8):');
    for (const [id, dt] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   ${ms(dt)}  ${label(nodes.get(id))}`);
    console.log('  Nächster App-Rahmen auf dem Stack (libs/ oder apps/, inklusive Zeit):');
    for (const [k, dt] of [...app.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`   ${ms(dt)}  ${k}`);
    console.log('  Inklusive Zeit (Top 12):');
    for (const [k, dt] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ${ms(dt)}  ${k}`);
    console.log();
  }
}

const file = analyzeOnly ?? await record();
analyze(file);
