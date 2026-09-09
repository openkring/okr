// Ordnet die langen Main-Thread-Tasks eines kalten Seitenaufrufs (ungedrosselt) den Firestore-
// Snapshots zu, die darin ausgeliefert wurden. Der FirestoreSubscriptionMonitor setzt je Snapshot
// eine User-Timing-Marke `okr:snapshot:<collection>:<n>` (detail = Cache-Schlüssel); dieses Skript
// sammelt Long Tasks (PerformanceObserver) und Marken und druckt je Task die Marken in seinem
// Fenster. So wird die Frage »welcher Snapshot ist der 170-ms-Task« beantwortet, ohne CPU-Profiler.
// Braucht das angemeldete Lighthouse-Profil aus Regel 7 (/tmp/lh-profile) und einen laufenden
// lokalen Server (perf-baselines.md, Regel 7 Variante).
// Usage: node scripts/perf-snapshot-tasks.mjs [url=http://localhost:5050/private/dashboard/c-contentpage] [waitMs=14000]
import { chromium } from 'playwright';
import { rmSync } from 'node:fs';

const PROFILE = '/tmp/lh-profile';
const url = process.argv[2] ?? 'http://localhost:5050/private/dashboard/c-contentpage';
const waitMs = Number(process.argv[3] ?? 14000);

for (const d of ['Cache', 'Code Cache', 'GPUCache', 'Service Worker']) {
  rmSync(`${PROFILE}/Default/${d}`, { recursive: true, force: true });
}
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: false, viewport: { width: 412, height: 823 },
  args: ['--disable-extensions', '--no-first-run'],
});
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.addInitScript(() => {
  window.__lt = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lt.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* kein longtask-Support */ }
});
await page.goto(url, { waitUntil: 'commit' });
await page.waitForTimeout(waitMs);
const out = await page.evaluate(() => {
  const marks = performance.getEntriesByType('mark')
    .filter((m) => m.name.startsWith('okr:snapshot:'))
    .map((m) => ({ t: m.startTime, name: m.name, key: String(m.detail ?? '') }));
  return { lt: window.__lt ?? [], marks };
});
await ctx.close();

const short = (k) => (k.length > 110 ? `${k.slice(0, 107)}...` : k);
console.log(`Long Tasks: ${out.lt.length}, Snapshot-Marken: ${out.marks.length}`);
console.log('\n== Long Tasks (>50 ms, beobachtet) mit den Snapshots in ihrem Fenster ==');
for (const t of out.lt.sort((a, b) => a.start - b.start)) {
  const inside = out.marks.filter((m) => m.t >= t.start && m.t <= t.start + t.dur);
  const after = out.marks.filter((m) => m.t > t.start + t.dur && m.t <= t.start + t.dur + 5);
  console.log(`${Math.round(t.start).toString().padStart(6)} ms  dur ${Math.round(t.dur).toString().padStart(4)}  snapshots=${inside.length}${after.length ? `  (+${after.length} ≤5 ms danach)` : ''}`);
  for (const m of inside) console.log(`         ${Math.round(m.t).toString().padStart(6)}  ${m.name}  ${short(m.key)}`);
}
console.log('\n== Alle Snapshot-Marken (Zeit · Name · Schlüssel) ==');
for (const m of out.marks.sort((a, b) => a.t - b.t)) {
  console.log(`${Math.round(m.t).toString().padStart(6)}  ${m.name}  ${short(m.key)}`);
}
