// scripts/lh-bytes-before-lcp.mjs — usage: node scripts/lh-bytes-before-lcp.mjs report.json
import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const a = r.audits, lcp = a.metrics.details.items[0].observedLargestContentfulPaint;
const before = a['network-requests'].details.items.filter(i => i.networkEndTime <= lcp);
const kb = before.reduce((s, i) => s + (i.transferSize || 0), 0) / 1024;
const scripts = before.filter(i => i.resourceType === 'Script');
console.log(JSON.stringify({ observedLcpMs: Math.round(lcp), requestsBeforeLcp: before.length,
  scriptsBeforeLcp: scripts.length, kbBeforeLcp: Math.round(kb),
  lcpSimulatedMs: Math.round(a['largest-contentful-paint'].numericValue),
  speedIndexMs: Math.round(a['speed-index'].numericValue), score: r.categories.performance.score }));
