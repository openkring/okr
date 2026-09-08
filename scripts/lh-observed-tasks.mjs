// Beobachtete (ungedrosselte) Main-Thread-Tasks aus einem Lighthouse-Trace (--save-assets), mit den
// Skript-URLs darin. Lighthouse' `long-tasks`/`bootup-time` sind Lantern-simuliert (×4 CPU) und
// verschieben Startzeiten — siehe perf-baselines.md, Regel 8. TBT ≈ Σ (beobachtet × 4 − 50).
// Usage: node scripts/lh-observed-tasks.mjs run1-0.trace.json [minMs=40]
import { readFileSync } from 'node:fs';
const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const events = Array.isArray(raw) ? raw : raw.traceEvents;
const counts = new Map();
for (const e of events) if (e.name === 'RunTask' && e.ph === 'X') { const k = e.pid+':'+e.tid; counts.set(k,(counts.get(k)??0)+1); }
const [mainKey] = [...counts.entries()].sort((a,b)=>b[1]-a[1])[0];
const [mpid, mtid] = mainKey.split(':').map(Number);
const navStart = events.find(e => e.name === 'navigationStart' && e.pid === mpid)?.ts;
const onThread = events.filter(e => e.pid===mpid && e.tid===mtid && e.ph==='X' && e.dur>0).sort((a,b)=>a.ts-b.ts||b.dur-a.dur);
const tasks = onThread.filter(e => e.name==='RunTask');
const MIN = Number(process.argv[3] ?? 40);
const big = tasks.filter(t => t.dur/1000 >= MIN);
let blocking = 0; for (const t of tasks) if (t.dur/1000 > 50) blocking += t.dur/1000 - 50;
console.log(`tasks ${tasks.length}, >=${MIN}ms: ${big.length}, sum(dur-50) over 50ms = ${blocking.toFixed(0)} ms (observed, unthrottled)`);
const url = e => { const d=e.args?.data??{}; return d.url||d.fileName||d.stackTrace?.[0]?.url||null; };
for (const t of big) {
  const end = t.ts+t.dur;
  const kids = onThread.filter(e => e!==t && e.ts>=t.ts && e.ts+e.dur<=end);
  const agg = new Map();
  for (const k of kids) { const u=url(k); if(!u) continue; const a=agg.get(u)??0; agg.set(u, Math.max(a, k.dur)); }
  const top = [...agg.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([u,d])=>`${u.replace('http://localhost:5050/','')}(${(d/1000).toFixed(0)})`).join(' ');
  const first = kids.find(k => ['TimerFire','FunctionCall','EvaluateScript','XHRReadyStateChange','EventDispatch','RunMicrotasks'].includes(k.name));
  console.log(`${((t.ts-navStart)/1000).toFixed(0).padStart(6)} ms  dur ${(t.dur/1000).toFixed(0).padStart(5)}  first=${first?.name ?? '-'}  ${top}`);
}
