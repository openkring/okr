#!/usr/bin/env node
/**
 * gen-logo-assets.mjs — every logo rendition for a tenant, from one master.
 *
 * One hand-authored master per tenant (`tenant/<id>/logo/logo.svg`, square and
 * full-bleed). This script rasterizes it once and uploads the raster; imgix
 * produces every size from there. See the `logo` skill for the full contract.
 *
 * Why a local rasterization step at all: imgix does not accept SVG as a source
 * format. `logo.svg?w=512&fm=png` returns the SVG bytes unchanged — a silent
 * no-op, not an error. So exactly one rasterization happens here, and
 * everything downstream is imgix.
 *
 *   logo.svg  --Playwright-->  logo-master.png (1024)  --upload-->  imgix
 *
 * Generated per master (1024x1024 PNG):
 *   logo-master.png    plain rasterization, transparency preserved
 *                      -> manifest `any` icons, favicon
 *   logo-maskable.png  opaque, content inside the safe zone
 *                      -> manifest `maskable` icon, apple-touch-icon
 *   logo-round.png     circular, auto-corrected
 *                      -> round display surfaces (login page, tenant switcher)
 *
 * Optional masters get the same treatment under a suffix: `logo-inverse.svg`
 * and `logo-mono.svg` produce `logo-master-inverse.png` etc. When absent, the
 * normal rasterizations stand in — callers fall back rather than 404.
 *
 * Usage:
 *   node scripts/gen-logo-assets.mjs <tenant|app> [...]   one or more tenants
 *   node scripts/gen-logo-assets.mjs --all               every app in apps/
 *   node scripts/gen-logo-assets.mjs scs --dry-run       analyse + report only
 *   node scripts/gen-logo-assets.mjs scs --no-upload     write PNGs locally
 *   node scripts/gen-logo-assets.mjs scs --out-dir DIR   keep the PNGs
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'bkaiser-org.appspot.com';
const RASTER = 1024; // master raster size; imgix scales down from here

/** Master file name -> suffix on the generated raster. */
const VARIANTS = [
  { file: 'logo.svg', suffix: '', required: true },
  { file: 'logo-inverse.svg', suffix: '-inverse', required: false },
  { file: 'logo-mono.svg', suffix: '-mono', required: false },
];

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const DRY = flag('--dry-run');
const NO_UPLOAD = flag('--no-upload') || DRY;
const outDirIdx = argv.indexOf('--out-dir');
const OUT_DIR = outDirIdx >= 0 ? argv[outDirIdx + 1] : null;
const targets = argv.filter((a) => !a.startsWith('--') && a !== OUT_DIR);

function appDirs() {
  return fs
    .readdirSync(path.join(ROOT, 'apps'))
    .filter((d) => d.endsWith('-app') && fs.existsSync(path.join(ROOT, 'apps', d, 'src/assets/manifest.json')));
}
/** `scs`, `scs-app` and `apps/scs-app` all mean the same tenant. */
const toTenant = (s) => path.basename(s).replace(/-app$/, '');

const tenants = flag('--all') ? appDirs().map(toTenant) : targets.map(toTenant);
if (!tenants.length) {
  console.error('Nothing to do. Pass a tenant (e.g. `scs`) or `--all`.');
  process.exit(1);
}

// ── firebase ────────────────────────────────────────────────────────────────
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org', storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket();

// ── the compositor ──────────────────────────────────────────────────────────
/**
 * Runs in the page. Rasterizes the master, classifies it, and composes the
 * three renditions. Returns data URLs.
 *
 * Classification (measured on the artwork, not guessed):
 *   framed  — a uniform border colour distinct from the interior. The border is
 *             redrawn as a ring so a circular crop cannot slice it off.
 *   padded  — transparent margins. Content is trimmed and re-inset, so marks
 *             that touch the canvas edge are not amputated.
 *   bleed   — already full-bleed. A plain crop is correct; leave it alone.
 */
const COMPOSE = async ({ svg, size, bg }) => {
  const N = size;
  const load = (s) =>
    new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = s;
    });
  const mk = (n) => {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    return c;
  };
  const quant = (c) => (c >> 4) << 4;
  const key = (r, g, b) => `${quant(r)},${quant(g)},${quant(b)}`;
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const rgb = (v) => `rgb(${v[0]},${v[1]},${v[2]})`;

  /** Most common opaque colour in a pixel set, plus how dominant/opaque it is. */
  function modal(px) {
    const m = new Map();
    let opaque = 0;
    for (const [r, g, b, a] of px) {
      if (a < 200) continue;
      opaque++;
      const k = key(r, g, b);
      m.set(k, (m.get(k) || 0) + 1);
    }
    if (!m.size) return { rgb: [255, 255, 255], share: 0, opq: 0 };
    const best = [...m.entries()].sort((x, y) => y[1] - x[1])[0];
    return { rgb: best[0].split(',').map(Number), share: best[1] / px.length, opq: opaque / px.length };
  }

  const img = await load('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))));

  // A master must be square. Anything markedly wider or taller is a wordmark or
  // a lockup, and squeezing it into an icon makes it unreadable — refuse rather
  // than silently generate junk. (scs/bka/bkg still keep a wide `logo.svg`
  // wordmark; it belongs at `wordmark.svg`.)
  const nw = img.naturalWidth || N;
  const nh = img.naturalHeight || N;
  const ratio = nw / nh;
  if (ratio > 1.43 || ratio < 0.7) {
    return { reject: `not square (${nw}x${nh}, ratio ${ratio.toFixed(2)}) — looks like a wordmark` };
  }

  // Rasterize aspect-preserving (contain), centred. Drawing straight to N x N
  // would stretch any master whose viewBox is not exactly square.
  const src = mk(N);
  const sx = src.getContext('2d');
  const fit = Math.min(N / nw, N / nh);
  const dw = nw * fit;
  const dh = nh * fit;
  sx.drawImage(img, (N - dw) / 2, (N - dh) / 2, dw, dh);
  const D = sx.getImageData(0, 0, N, N).data;
  const at = (x, y) => {
    const i = (y * N + x) * 4;
    return [D[i], D[i + 1], D[i + 2], D[i + 3]];
  };

  // content bounding box
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (D[(y * N + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error('master rasterized to an empty image');
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;

  // Two sample rings: the very edge of the artwork, and 15% inside it.
  const ring = (inset) => {
    const px = [];
    const ix = Math.round(bw * inset);
    const iy = Math.round(bh * inset);
    const L = x0 + ix, R = x1 - ix, T = y0 + iy, B = y1 - iy;
    const step = Math.max(1, Math.round(N / 256));
    for (let x = L; x <= R; x += step) px.push(at(x, T), at(x, B));
    for (let y = T; y <= B; y += step) px.push(at(L, y), at(R, y));
    return px;
  };
  const edge = modal(ring(0.004));
  const mid = modal(ring(0.15));

  const framed = edge.share > 0.75 && mid.share > 0.4 && dist(edge.rgb, mid.rgb) > 60;
  const padded = !framed && (bw < N * 0.92 || bh < N * 0.92 || edge.opq < 0.7);
  const mode = framed ? 'framed' : padded ? 'padded' : 'bleed';

  // Border thickness, measured along the horizontal centre line.
  let thick = 0;
  if (framed) {
    const cy = Math.round((y0 + y1) / 2);
    for (let x = x0; x < x0 + bw * 0.3; x++) {
      const c = at(x, cy);
      if (c[3] > 200 && dist(c, mid.rgb) < 48) {
        thick = x - x0;
        break;
      }
    }
    if (!thick) thick = Math.round(bw * 0.05);
  }

  /** Background behind the opaque renditions. */
  const backdrop = framed || (mode === 'bleed' && edge.opq > 0.9) ? rgb(mid.rgb) : bg;

  // ── logo-master.png — plain, transparency preserved ───────────────────────
  const plain = mk(N);
  plain.getContext('2d').drawImage(src, 0, 0);

  // ── logo-round.png — circular, auto-corrected ─────────────────────────────
  const round = mk(N);
  const rx = round.getContext('2d');
  const R = N / 2;
  rx.save();
  rx.beginPath();
  rx.arc(R, R, R, 0, Math.PI * 2);
  rx.clip();
  rx.fillStyle = backdrop;
  rx.fillRect(0, 0, N, N);
  if (framed) {
    // Crop the border off and scale the interior to cover, preserving aspect —
    // interiors are rarely square, and stretching them distorts letterforms.
    const iw = bw - 2 * thick;
    const ih = bh - 2 * thick;
    const s = N / Math.max(iw, ih);
    rx.drawImage(src, x0 + thick, y0 + thick, iw, ih, (N - iw * s) / 2, (N - ih * s) / 2, iw * s, ih * s);
  } else if (padded) {
    const s = (N * 0.7) / Math.max(bw, bh);
    rx.drawImage(src, x0, y0, bw, bh, (N - bw * s) / 2, (N - bh * s) / 2, bw * s, bh * s);
  } else {
    rx.drawImage(src, 0, 0, N, N);
  }
  rx.restore();
  if (framed) {
    // Redraw the border as a ring, at the thickness it had as a frame.
    const tw = Math.max(3, thick * (N / bw));
    rx.beginPath();
    rx.arc(R, R, R - tw / 2, 0, Math.PI * 2);
    rx.strokeStyle = rgb(edge.rgb);
    rx.lineWidth = tw;
    rx.stroke();
  }

  // ── logo-maskable.png — square, opaque, content in the safe zone ───────────
  // Must stay square: the OS applies its own mask (circle, squircle, rounded
  // square). Pre-cutting a circle here would show a circle inside a squircle.
  const mask = mk(N);
  const mx = mask.getContext('2d');
  mx.fillStyle = backdrop;
  mx.fillRect(0, 0, N, N);
  const inner = framed
    ? { x: x0 + thick, y: y0 + thick, w: bw - 2 * thick, h: bh - 2 * thick }
    : { x: x0, y: y0, w: bw, h: bh };
  const ms = (N * 0.72) / Math.max(inner.w, inner.h); // 72% keeps clear of every mask shape
  mx.drawImage(
    src, inner.x, inner.y, inner.w, inner.h,
    (N - inner.w * ms) / 2, (N - inner.h * ms) / 2, inner.w * ms, inner.h * ms,
  );

  return {
    mode,
    thick,
    bbox: `${bw}x${bh}`,
    backdrop,
    edgeShare: +edge.share.toFixed(2),
    edgeOpq: +edge.opq.toFixed(2),
    master: plain.toDataURL('image/png'),
    round: round.toDataURL('image/png'),
    maskable: mask.toDataURL('image/png'),
  };
};

// ── imgix url builders ──────────────────────────────────────────────────────
// The trailing empty `auto=` is load-bearing: without it the imgix source's own
// `auto=format` wins and returns JPEG despite `fm=png`.
const png = (base, file, params) => `${base}/${file}?${params}&fm=png&auto=`;

function manifestIcons(base, dir, sfx) {
  const m = `${dir}/logo-master${sfx}.png`;
  const k = `${dir}/logo-maskable${sfx}.png`;
  return [
    { src: png(base, m, 'w=192&h=192'), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: png(base, m, 'w=512&h=512'), sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: png(base, k, 'w=512&h=512'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
}

/** Canonical icon links. `mask-icon` is deliberately absent — Safari-pinned-tab
 *  only, was present for just five tenants, and kwa's was the wrong aspect. */
function iconLinks(base, dir, masterSvgPath) {
  const m = `${dir}/logo-master.png`;
  const k = `${dir}/logo-maskable.png`;
  return [
    `<link rel="icon" type="image/svg+xml" sizes="any" href="${base}/${masterSvgPath}" />`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${png(base, m, 'w=32&h=32')}" />`,
    `<link rel="apple-touch-icon" href="${png(base, k, 'w=180&h=180')}" />`,
  ];
}

// ── file rewriting ──────────────────────────────────────────────────────────
/**
 * The manifest the browser actually loads, resolved from index.html.
 * Six of eight apps link `manifest.webmanifest` and ALSO carry a stale,
 * unreferenced `assets/manifest.json`; editing the latter changes nothing.
 */
function manifestPath(appDir) {
  const html = fs.readFileSync(path.join(appDir, 'src/index.html'), 'utf8');
  const m = html.match(/<link[^>]*\brel="manifest"[^>]*\bhref="([^"]+)"/i);
  const href = m ? m[1].replace(/^\.?\//, '') : 'assets/manifest.json';
  const p = path.join(appDir, 'src', href);
  return fs.existsSync(p) ? p : path.join(appDir, 'src/assets/manifest.json');
}

function rewriteManifest(appDir, icons) {
  const p = manifestPath(appDir);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  const before = JSON.stringify(json.icons);
  json.icons = icons;
  if (before === JSON.stringify(icons)) return false;
  if (!DRY) fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n');
  return true;
}

function rewriteIndexHtml(appDir, links) {
  const p = path.join(appDir, 'src/index.html');
  let html = fs.readFileSync(p, 'utf8');
  const original = html;
  // Drop every existing icon link; they are generated, not hand-maintained.
  html = html.replace(/^[ \t]*<link[^>]*\brel="(?:icon|apple-touch-icon|mask-icon)"[^>]*>\s*\n/gim, '');
  const block = links.map((l) => `    ${l}`).join('\n') + '\n';
  if (/<link[^>]*\brel="manifest"[^>]*>\s*\n/i.test(html)) {
    html = html.replace(/(<link[^>]*\brel="manifest"[^>]*>\s*\n)/i, `$1${block}`);
  } else {
    html = html.replace(/(<\/head>)/i, `${block}$1`);
  }
  if (html === original) return false;
  if (!DRY) fs.writeFileSync(p, html);
  return true;
}

// ── main ────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
await page.setContent('<body style="margin:0">');

let failures = 0;

for (const tenant of tenants) {
  console.log(`\n── ${tenant} ${'─'.repeat(Math.max(0, 56 - tenant.length))}`);

  const snap = await db.doc(`app-config/${tenant}`).get();
  if (!snap.exists) {
    console.error(`   app-config/${tenant} not found — skipping`);
    failures++;
    continue;
  }
  const cfg = snap.data();
  const base = (cfg.imgixBaseUrl || 'https://bkaiser.imgix.net').replace(/\/$/, '');
  const dir = `tenant/${tenant}/logo`;

  const appDir = path.join(ROOT, 'apps', `${tenant}-app`);
  const hasApp = fs.existsSync(path.join(appDir, 'src/assets/manifest.json'));
  const bg =
    (hasApp && JSON.parse(fs.readFileSync(path.join(appDir, 'src/assets/manifest.json'), 'utf8')).background_color) ||
    '#ffffff';

  let generatedPrimary = false;
  let resolvedMaster = null;

  for (const variant of VARIANTS) {
    if (variant.required) {
      // Candidate chain, best first. `logo_square.svg` is the square master
      // under its pre-rename name; app-config's `logoUrl` comes last because
      // for five tenants it still points at the ROUND badge. A candidate that
      // is rejected (e.g. scs/bka/bkg still keep a wordmark at logo.svg) falls
      // through to the next rather than failing the tenant.
      const candidates = [
        `${dir}/logo.svg`,
        `${dir}/logo_square.svg`,
        (cfg.logoUrl || '').replace(/^\//, ''),
      ].filter((c, i, arr) => c && arr.indexOf(c) === i);

      for (const cand of candidates) {
        const [ok] = await bucket.file(cand).exists();
        if (!ok) continue;
        if (cand !== `${dir}/logo.svg`) console.warn(`   using ${cand} (logo.svg not usable yet)`);
        if (await generate(cand, variant.suffix)) {
          generatedPrimary = true;
          resolvedMaster = cand;
          break;
        }
      }
      if (!generatedPrimary) {
        console.error(`   no usable square master among: ${candidates.join(', ')}`);
        failures++;
      }
      continue;
    }

    const srcPath = `${dir}/${variant.file}`;
    const [exists] = await bucket.file(srcPath).exists();
    if (exists) await generate(srcPath, variant.suffix);
  }

  async function generate(srcPath, suffix) {
    const [buf] = await bucket.file(srcPath).download();
    let svg = buf.toString('utf8');

    // Editor exports carry a root `transform` that the viewBox already handles.
    // Left in place it shrinks the artwork into a corner of the canvas.
    if (/<svg[^>]*\stransform=/i.test(svg)) {
      svg = svg.replace(/(<svg[^>]*?)\stransform="[^"]*"/i, '$1');
      console.warn(`   ${path.basename(srcPath)}: stripped a root transform (export artefact)`);
    }

    const r = await page.evaluate(COMPOSE, { svg, size: RASTER, bg });
    if (r.reject) {
      console.warn(`   ${path.basename(srcPath)}: ${r.reject} — skipped`);
      return false;
    }
    console.log(
      `   ${path.basename(srcPath).padEnd(18)} ${r.mode.padEnd(7)} bbox=${r.bbox.padEnd(9)} bg=${r.backdrop}` +
        (r.mode === 'framed' ? `  border=${r.thick}px` : ''),
    );

    const outputs = [
      [`logo-master${suffix}.png`, r.master],
      [`logo-round${suffix}.png`, r.round],
      [`logo-maskable${suffix}.png`, r.maskable],
    ];
    for (const [name, dataUrl] of outputs) {
      const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
      if (OUT_DIR) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(path.join(OUT_DIR, `${tenant}-${name}`), bytes);
      }
      if (NO_UPLOAD) {
        console.log(`     ${name.padEnd(26)} ${(bytes.length / 1024).toFixed(0)} KB  (not uploaded)`);
        continue;
      }
      await bucket.file(`${dir}/${name}`).save(bytes, {
        contentType: 'image/png',
        metadata: { cacheControl: 'public, max-age=31536000' },
      });
      console.log(`     ${name.padEnd(26)} ${(bytes.length / 1024).toFixed(0)} KB  uploaded`);
    }
    return true;
  }

  if (!generatedPrimary) continue;

  if (!hasApp) {
    console.log('   no app in apps/ — assets only, nothing to rewrite');
    continue;
  }
  // ...and the SVG favicon must be the master we actually used: scs/bka/bkg
  // still keep a wide wordmark at logo.svg, which would make a useless favicon.
  const masterSvg = resolvedMaster;
  const mPath = manifestPath(appDir);
  const m = rewriteManifest(appDir, manifestIcons(base, dir, ''));
  const h = rewriteIndexHtml(appDir, iconLinks(base, dir, masterSvg));
  console.log(
    `   ${path.relative(appDir, mPath)} ${m ? 'rewritten' : 'unchanged'} · index.html ${h ? 'rewritten' : 'unchanged'}`,
  );
}

await browser.close();

if (DRY) console.log('\nDry run — nothing uploaded, no files written.');
if (failures) {
  console.error(`\n${failures} tenant(s) failed.`);
  process.exit(1);
}
console.log('\nDone.');
