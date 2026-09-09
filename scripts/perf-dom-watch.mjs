// DOM-Zeitachse eines kalten Seitenaufrufs, ungedrosselt: welche Elemente werden wann eingefügt
// oder entfernt (100-ms-Fenster), dazu ionStyle/ionColor-Events, Long Tasks und der Firestore-Census.
// So wurde am 2026-09-08 das doppelt gebaute Hauptmenü gefunden (perf-baselines.md). Braucht das
// angemeldete Lighthouse-Profil aus Regel 7 (/tmp/lh-profile) und einen laufenden lokalen Server.
// Usage: node scripts/perf-dom-watch.mjs [url=http://localhost:5050/private/dashboard/c-contentpage] [--width 412] [--expand]
//   --width 1280  Desktop-Viewport (Split-Pane ab 992 px), sonst Handy 412×823.
//   --expand      nach der Aufnahme den ersten Untermenü-Akkordeon öffnen und erneut zählen
//                 (Nachweis, dass lazy gerenderte Einträge beim Aufklappen erscheinen).
import { chromium } from 'playwright';
import { rmSync } from 'node:fs';
const PROFILE = '/tmp/lh-profile';
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const width = Number(flag('--width') ?? 412);
const expand = argv.includes('--expand');
const urlArg = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--')));
for (const d of ['Cache', 'Code Cache', 'GPUCache', 'Service Worker']) rmSync(`${PROFILE}/Default/${d}`, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: false, viewport: { width, height: 823 }, args: ['--disable-extensions', '--no-first-run'] });
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.addInitScript(() => {
  const W = 100; const bins = {}; window.__bins = bins;
  const TAGS = ['ION-ITEM', 'OKR-MENU', 'OKR-MULTI-AVATAR', 'ION-ICON', 'ION-ACCORDION', 'OKR-SPINNER', 'ION-CARD'];
  const bump = (k) => { const t = Math.floor(performance.now() / W) * W; const b = bins[t] ??= {}; b[k] = (b[k] ?? 0) + 1; };
  const rec = (kind, node) => { if (node.nodeType !== 1) return; const walk = (el) => { if (TAGS.includes(el.tagName)) bump(kind + ':' + el.tagName); for (const c of el.children) walk(c); }; walk(node); };
  new MutationObserver(ms => { for (const m of ms) { m.addedNodes.forEach(n => rec('add', n)); m.removedNodes.forEach(n => rec('rm', n)); } }).observe(document, { childList: true, subtree: true });
  window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(`${Math.round(e.startTime)}+${Math.round(e.duration)}`); }).observe({ type: 'longtask', buffered: true }); } catch {}
  for (const ev of ['ionStyle', 'ionColor', 'ionValueChange']) document.addEventListener(ev, () => bump('ev:' + ev), true);
});
page.on('console', async m => { if (m.type()==='table') { try { const rows = await m.args()[0].jsonValue(); const sel = (Array.isArray(rows)?rows:Object.values(rows)).filter(r => /users|menuItems|persons|orgs|address/.test(JSON.stringify(r))); console.log('TABLE', JSON.stringify(sel)); } catch (e) { console.log('TABLE-ERR', String(e)); } } const t = m.text(); if (t.startsWith('[perf-')) console.log('CONSOLE', t); });
await page.goto(urlArg ?? 'http://localhost:5050/private/dashboard/c-contentpage', { waitUntil: 'commit' });
await page.waitForTimeout(14000);
const census = () => page.evaluate(() => Object.fromEntries(['okr-menu', 'ion-item', 'ion-icon', 'ion-accordion', 'okr-multi-avatar'].map((t) => [t, document.querySelectorAll(t).length])));
const domBefore = await census();
let domAfter = null;
if (expand) {
  const header = page.locator('ion-accordion ion-item[slot="header"]').first();
  if (await header.count()) { await header.click(); await page.waitForTimeout(1500); domAfter = await census(); }
}
const out = await page.evaluate(() => {
  const lt = window.__lt ?? [];
  let streams = null; try { window.__okrFirestoreStreams?.(); streams = 'printed'; } catch (e) { streams = String(e); }
  let census = null; try { census = window.__okrFirestoreCensus?.(); } catch (e) { census = String(e); }
  return { bins: window.__bins, lt, streams, census };
});
await ctx.close();
console.log('LONGTASKS (perf API, >50ms):', out.lt.join(' '));
for (const [t, b] of Object.entries(out.bins).sort((a, b) => +a[0] - +b[0])) { const s = Object.entries(b).sort().map(([k, v]) => `${k}=${v}`).join(' '); if (s) console.log(String(t).padStart(6), s); }
console.log(`DOM-CENSUS (width ${width})`, JSON.stringify(domBefore));
if (domAfter) console.log('DOM-CENSUS nach erstem Aufklappen', JSON.stringify(domAfter));
console.log('CENSUS', JSON.stringify(out.census).slice(0, 600));
const st = Array.isArray(out.streams) ? out.streams : out.streams?.streams ?? out.streams;
console.log('STREAMS', typeof out.streams, JSON.stringify(out.streams ?? null).slice(0, 1500));
