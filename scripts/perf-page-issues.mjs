// Diagnose eines kalten, anonymen Seitenaufrufs: das Chrome-»Issues«-Panel (CDP Audits), das
// LCP-Element und ob es aus dem HTML auffindbar ist, die Gründe gegen den Back/Forward-Cache
// (CDP Page.backForwardCacheNotRestoredReasons über eine echte Vor/Zurück-Navigation), eine
// DOM-Zählung (greifen die Menü-Optimierungen?) und die Byte-Bilanz je Ressourcentyp.
// Usage: node scripts/perf-page-issues.mjs [url=https://seeclub.org/public/welcome] [--width 412] [--profile /tmp/lh-anon]
import { chromium } from 'playwright';
import { rmSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const url = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))) ?? 'https://seeclub.org/public/welcome';
const width = Number(flag('--width') ?? 412);
const PROFILE = flag('--profile') ?? '/tmp/lh-anon';
mkdirSync(PROFILE, { recursive: true });
for (const d of ['Cache', 'Code Cache', 'GPUCache', 'Service Worker']) rmSync(`${PROFILE}/Default/${d}`, { recursive: true, force: true });

// Playwright startet Chrome standardmässig mit --disable-back-forward-cache; ohne diese Ausnahme
// meldet der bfcache-Test nur »BackForwardCacheDisabledByCommandLine« und nie den echten Grund.
const ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: false, viewport: { width, height: 823 }, args: ['--disable-extensions', '--no-first-run'], ignoreDefaultArgs: ['--disable-back-forward-cache'] });
const page = ctx.pages()[0] ?? await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const issues = [];
cdp.on('Audits.issueAdded', (e) => issues.push(e.issue));
await cdp.send('Audits.enable');
await cdp.send('Page.enable');
const bfReasons = [];
cdp.on('Page.backForwardCacheNotUsed', (e) => bfReasons.push(e));

const bytes = new Map(); const byHost = new Map(); let reqCount = 0;
page.on('response', async (r) => {
  try {
    const h = r.headers(); const len = Number(h['content-length'] ?? 0); const type = (h['content-type'] ?? '').split(';')[0] || '?';
    reqCount++; bytes.set(type, (bytes.get(type) ?? 0) + len);
    const host = new URL(r.url()).host; byHost.set(host, (byHost.get(host) ?? 0) + len);
  } catch { /* ignore */ }
});
const console_ = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console_.push(`${m.type()}: ${m.text().slice(0, 160)}`); });

await page.addInitScript(() => {
  window.__lcp = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp.push({ t: Math.round(e.startTime), url: e.url, tag: e.element?.tagName, id: e.element?.id, cls: e.element?.className, size: e.size }); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
});

await page.goto(url, { waitUntil: 'commit' });
await page.waitForTimeout(12000);

const html = await page.evaluate(() => document.documentElement.outerHTML.length);
const dom = await page.evaluate(() => ({
  counts: Object.fromEntries(['okr-menu', 'ion-item', 'ion-accordion', 'ion-menu', 'img', 'script', 'link[rel=preload]', 'link[rel=modulepreload]'].map((t) => [t, document.querySelectorAll(t).length])),
  lcp: window.__lcp,
  preloads: [...document.querySelectorAll('link[rel=preload],link[rel=modulepreload]')].map((l) => `${l.rel}:${l.as ?? ''}:${(l.href ?? '').replace(location.origin, '')}`).slice(0, 20),
  images: [...document.images].slice(0, 12).map((i) => ({ src: (i.currentSrc || i.src).slice(0, 120), w: i.naturalWidth, h: i.naturalHeight, cw: i.clientWidth, ch: i.clientHeight, loading: i.loading, fetchpriority: i.getAttribute('fetchpriority'), inViewport: i.getBoundingClientRect().top < innerHeight })),
  census: window.__okrFirestoreCensus?.() ?? null,
  title: document.title,
}));

// Back/Forward-Cache: auf eine FREMDE Origin wegnavigieren und zurück. Eine gleiche Origin
// wechselt die Browsing-Instanz nicht (»BrowsingInstanceNotSwapped«, ein Artefakt des Tests,
// kein Befund der Seite); erst der Cross-Site-Umweg zwingt Chrome, die echten Gründe zu nennen.
await page.goto('https://example.com/', { waitUntil: 'commit' }).catch(() => {});
await page.waitForTimeout(1500);
await page.goBack({ waitUntil: 'commit' }).catch(() => {});
await page.waitForTimeout(2500);
await ctx.close();

const fmtIssue = (i) => {
  const d = i.details ?? {}; const k = Object.keys(d)[0]; const v = d[k] ?? {};
  const bits = [i.code, v.type, v.reason, v.violatedDirective, v.blockedURL, v.request?.url, v.cookieWarningReasons?.join(','), v.cookieExclusionReasons?.join(','), v.deprecationType ?? v.type, v.violationType, v.sourceCodeLocation?.url].filter(Boolean).map(String).map((s) => s.slice(0, 110));
  return bits.join(' | ');
};
const grouped = new Map(); for (const i of issues) { const k = fmtIssue(i); grouped.set(k, (grouped.get(k) ?? 0) + 1); }
const rawPerf = issues.filter((i) => i.code !== 'CookieIssue').slice(0, 6).map((i) => JSON.stringify(i.details).slice(0, 300));
console.log(`\n== Chrome Issues (${issues.length}) ==`); for (const [k, n] of [...grouped].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(3)}× ${k}`);
if (rawPerf.length) { console.log('   Rohdetails (nicht-Cookie):'); for (const r of rawPerf) console.log('     ' + r); }
console.log(`\n== Konsole (error/warning, ${console_.length}) ==`); for (const c of [...new Set(console_)].slice(0, 15)) console.log('  ' + c);
console.log('\n== LCP-Kandidaten (Zeit, Element, URL) =='); for (const l of dom.lcp) console.log(`  ${l.t} ms  <${l.tag}${l.id ? '#' + l.id : ''}${l.cls ? '.' + String(l.cls).split(' ')[0] : ''}> size ${l.size}  ${l.url ?? ''}`);
console.log('\n== Preloads im HTML ==', dom.preloads.length ? '' : '(keine)'); for (const p of dom.preloads) console.log('  ' + p);
console.log('\n== Bilder (erste 12) =='); for (const i of dom.images) console.log(`  ${i.inViewport ? 'VIEWPORT' : '        '} ${i.w}x${i.h} → ${i.cw}x${i.ch} loading=${i.loading} fp=${i.fetchpriority}  ${i.src}`);
console.log('\n== DOM ==', JSON.stringify(dom.counts), 'title:', dom.title);
console.log('== Firestore-Census ==', dom.census ? `${dom.census.active} aktiv: ` + JSON.stringify(dom.census.byCollection?.slice(0, 8)) : '(kein __okrFirestoreCensus)');
console.log(`\n== Bytes (content-length, ${reqCount} Requests) ==`);
for (const [t, b] of [...bytes].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(Math.round(b / 1024)).padStart(6)} KB  ${t}`);
console.log('== Bytes je Host =='); for (const [h, b] of [...byHost].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${String(Math.round(b / 1024)).padStart(6)} KB  ${h}`);
console.log(`\n== Back/Forward-Cache (${bfReasons.length} Meldungen) ==`);
for (const r of bfReasons) for (const x of r.notRestoredExplanations ?? []) console.log(`  ${x.type}: ${x.reason}${x.context ? ' (' + x.context + ')' : ''}`);
if (!bfReasons.length) console.log('  (keine Meldung — entweder aus dem bfcache wiederhergestellt oder kein Ereignis)');
