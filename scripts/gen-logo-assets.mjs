#!/usr/bin/env node
/**
 * gen-logo-assets.mjs — every logo rendition for a tenant, from one master.
 *
 * One hand-authored master per tenant, named by `app-config.logoUrl` and square
 * and full-bleed. This script rasterizes it once and uploads the raster; imgix
 * produces every size from there. See the `logo` skill for the full contract.
 *
 * Why a local rasterization step at all: imgix does not accept SVG as a source
 * format. `logo.svg?w=512&fm=png` returns the SVG bytes unchanged — a silent
 * no-op, not an error. So exactly one rasterization happens here, and
 * everything downstream is imgix.
 *
 *   <logoUrl>.svg  --Playwright-->  logo-master.png (1024)  --upload-->  imgix
 *
 * The master keeps whatever name it has; the generated PNGs always land beside
 * it under fixed names, so manifest and index.html never need to know it.
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
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'bkaiser-org.appspot.com';
const RASTER = 1024; // master raster size; imgix scales down from here

/**
 * Optional companion masters, named after the master itself:
 * `bka-logo.svg` -> `bka-logo-inverse.svg`, `bka-logo-mono.svg`.
 * When absent the normal rasterizations stand in — callers fall back, not 404.
 */
const VARIANTS = [
  { suffix: '', required: true },
  { suffix: '-inverse', required: false },
  { suffix: '-mono', required: false },
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
    // An app is detected by its index.html — NOT by `src/assets/manifest.json`, the stale
    // unreferenced copy: once scs dropped it, every run silently skipped scs's app files.
    .filter((d) => d.endsWith('-app') && fs.existsSync(path.join(ROOT, 'apps', d, 'src/index.html')));
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
const COMPOSE = async ({ dataUri, size, bg }) => {
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

  /**
   * Most common opaque colour in a pixel set.
   *
   * Colours are bucketed coarsely (16 levels/channel) so that antialiasing and
   * gradients still agree on one dominant colour — but the bucket centre is NOT
   * the colour to paint with. bka's background is #f5f6f8, which buckets to
   * rgb(240,240,240); filling with that leaves a visible seam where the artwork
   * meets the backdrop. So we also average the true pixels of the winning
   * bucket and return that as `exact`, which is what gets painted.
   */
  function modal(px) {
    const m = new Map();
    let opaque = 0;
    for (const [r, g, b, a] of px) {
      if (a < 200) continue;
      opaque++;
      const k = key(r, g, b);
      let e = m.get(k);
      if (!e) m.set(k, (e = { n: 0, r: 0, g: 0, b: 0 }));
      e.n++; e.r += r; e.g += g; e.b += b;
    }
    if (!m.size) return { rgb: [255, 255, 255], exact: [255, 255, 255], share: 0, opq: 0 };
    const [k, e] = [...m.entries()].sort((x, y) => y[1].n - x[1].n)[0];
    return {
      rgb: k.split(',').map(Number),                                   // bucket, for comparisons
      exact: [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)], // for painting
      share: e.n / px.length,
      opq: opaque / px.length,
    };
  }

  const img = await load(dataUri);

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
  const backdrop = framed || (mode === 'bleed' && edge.opq > 0.9) ? rgb(mid.exact) : bg;

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
    rx.strokeStyle = rgb(edge.exact);
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
  // Place only the MARK when the master is framed. Such a master drags its own
  // rounded outline into the crop, where it reads as a ghost rectangle against
  // the fill. The mark is whatever differs from the backdrop and is NOT
  // connected to the artwork's border: the outline touches that border, a
  // centred mark never does. (Flooding from the canvas corners does not work —
  // they are already backdrop, so the flood stops before reaching the arcs.)
  let mark = null;
  if (framed) {
    const bd = mid.exact;
    const isMark = (x, y) => {
      const i = (y * N + x) * 4;
      return (
        D[i + 3] > 200 &&
        Math.abs(D[i] - bd[0]) + Math.abs(D[i + 1] - bd[1]) + Math.abs(D[i + 2] - bd[2]) > 40
      );
    };
    const edgeConnected = new Uint8Array(N * N);
    const st = [];
    for (let x = x0; x <= x1; x++) st.push(x + y0 * N, x + y1 * N);
    for (let y = y0; y <= y1; y++) st.push(x0 + y * N, x1 + y * N);
    while (st.length) {
      const idx = st.pop();
      if (edgeConnected[idx]) continue;
      const x = idx % N;
      const y = (idx - x) / N;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (!isMark(x, y)) continue; // spread only through non-backdrop pixels
      edgeConnected[idx] = 1;
      st.push(idx - 1, idx + 1, idx - N, idx + N);
    }
    let a0 = x1, b0 = y1, a1 = x0, b1 = y0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (edgeConnected[x + y * N] || !isMark(x, y)) continue;
        if (x < a0) a0 = x;
        if (x > a1) a1 = x;
        if (y < b0) b0 = y;
        if (y > b1) b1 = y;
      }
    if (a1 > a0 && b1 > b0) mark = { x: a0, y: b0, w: a1 - a0 + 1, h: b1 - b0 + 1 };
  }

  const inner =
    mark ||
    (framed
      ? { x: x0 + thick, y: y0 + thick, w: bw - 2 * thick, h: bh - 2 * thick }
      : { x: x0, y: y0, w: bw, h: bh });
  // A tight mark crop is scaled smaller than a whole panel: its bbox corners sit
  // closer to the safe-zone edge once centred.
  const ms = (N * (mark ? 0.62 : 0.72)) / Math.max(inner.w, inner.h);
  mx.drawImage(
    src, inner.x, inner.y, inner.w, inner.h,
    (N - inner.w * ms) / 2, (N - inner.h * ms) / 2, inner.w * ms, inner.h * ms,
  );

  // ── favicon — small, square, mark as large as the mode allows ─────────────
  // Websites keep this as a LOCAL asset rather than an imgix URL: versioned with
  // the deploy, no CDN round-trip, and immune both to the SVG path-cache trap and
  // to a bucket cleanup removing the file underneath a live site.
  const F = 96;
  const fav = mk(F);
  const fx = fav.getContext('2d');
  fx.fillStyle = backdrop;
  fx.fillRect(0, 0, F, F);
  if (framed) {
    const fi = mark || { x: x0 + thick, y: y0 + thick, w: bw - 2 * thick, h: bh - 2 * thick };
    const fs2 = (F * (mark ? 0.78 : 1)) / Math.max(fi.w, fi.h);
    fx.drawImage(src, fi.x, fi.y, fi.w, fi.h, (F - fi.w * fs2) / 2, (F - fi.h * fs2) / 2, fi.w * fs2, fi.h * fs2);
  } else if (padded) {
    const fs2 = (F * 0.86) / Math.max(bw, bh);
    fx.drawImage(src, x0, y0, bw, bh, (F - bw * fs2) / 2, (F - bh * fs2) / 2, bw * fs2, bh * fs2);
  } else {
    fx.drawImage(src, 0, 0, F, F);
  }

  return {
    mode,
    thick,
    favicon: fav.toDataURL('image/png'),
    natural: { w: nw, h: nh },
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

/** Canonical icon links.
 *
 *  `mask-icon` is deliberately absent — Safari-pinned-tab only, was present for
 *  just five tenants, and kwa's was the wrong aspect.
 *
 *  The SVG favicon is only emitted for a small master, for two reasons:
 *   1. imgix serves SVG unprocessed and caches it on the path alone. Replacing a
 *      master in place keeps serving the OLD bytes, and query params do not bust
 *      it (verified: `logo.svg?v=…` still returned the previous file). A stale
 *      favicon would linger with no way to force a refresh short of an imgix purge.
 *   2. Some masters are far too heavy to be a favicon — bka's portrait is 614 KB.
 *  The PNG favicon has neither problem: it is derived from `logo-master.png`, a
 *  path that is rewritten on every run, so it is always fresh.
 */
const SVG_FAVICON_MAX = 32 * 1024;

function iconLinks(base, dir, masterSvgPath, masterBytes, masterIsSvg) {
  const m = `${dir}/logo-master.png`;
  const k = `${dir}/logo-maskable.png`;
  const links = [];
  if (masterIsSvg && masterBytes && masterBytes <= SVG_FAVICON_MAX) {
    links.push(`<link rel="icon" type="image/svg+xml" sizes="any" href="${base}/${masterSvgPath}" />`);
  }
  links.push(
    `<link rel="icon" type="image/png" sizes="32x32" href="${png(base, m, 'w=32&h=32')}" />`,
    `<link rel="apple-touch-icon" href="${png(base, k, 'w=180&h=180')}" />`,
  );
  return links;
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
  // A comment sitting directly above them describes those links, so it goes too —
  // otherwise it is left stranded above unrelated markup, documenting tags that
  // no longer exist. The replacement block carries its own rationale.
  // `[\s\S]*?` is NOT safe here: when the lookahead fails the engine backtracks
  // past the first `-->` into the next comment, swallowing whatever sits between
  // them — which deleted the `<link rel="manifest">`. The tempered body below
  // cannot contain `-->`, so it matches exactly one comment and never spans a tag.
  html = html.replace(
    /^[ \t]*<!--(?:(?!-->)[\s\S])*-->[ \t]*\n(?=[ \t]*<link[^>]*\brel="(?:icon|apple-touch-icon|mask-icon)")/gim,
    '',
  );
  html = html.replace(/^[ \t]*<link[^>]*\brel="(?:icon|apple-touch-icon|mask-icon)"[^>]*>\s*\n/gim, '');
  const banner =
    '    <!-- Generated by scripts/gen-logo-assets.mjs from the tenant\'s single master.\n' +
    '         Do not edit by hand; the next `pnpm logo:gen` overwrites this block.\n' +
    '         A PNG favicon is always emitted: Safari (macOS and iOS) has never supported an\n' +
    '         SVG in `rel="icon"` — it silently shows nothing and falls back to /favicon.ico,\n' +
    '         which we do not serve. The SVG favicon is added only for a small master. -->\n';
  const block = banner + links.map((l) => `    ${l}`).join('\n') + '\n';
  if (/<link[^>]*\brel="manifest"[^>]*>\s*\n/i.test(html)) {
    html = html.replace(/(<link[^>]*\brel="manifest"[^>]*>\s*\n)/i, `$1${block}`);
  } else {
    html = html.replace(/(<\/head>)/i, `${block}$1`);
  }
  if (html === original) return false;
  if (!DRY) fs.writeFileSync(p, html);
  return true;
}

/**
 * Websites get a LOCAL favicon, not an imgix URL. Six of the eight already work
 * that way; p13 was the lone CDN holdout, and bka/scs had none at all —
 * `brunokaiser.ch` served no icon link and no /favicon.ico, so the tab was blank.
 */
function websiteIconLinks(masterBytes, masterIsSvg) {
  const links = [];
  if (masterIsSvg && masterBytes && masterBytes <= SVG_FAVICON_MAX) {
    links.push('<link rel="icon" type="image/svg+xml" href="assets/favicon.svg" />');
  }
  links.push('<link rel="icon" type="image/png" sizes="96x96" href="assets/favicon.png" />');
  return links;
}

function rewriteWebsitePage(file, links) {
  let html = fs.readFileSync(file, 'utf8');
  const original = html;
  html = html.replace(
    /^[ \t]*<link[^>]*\brel="(?:icon|apple-touch-icon|mask-icon|shortcut icon)"[^>]*>\s*\n/gim,
    '',
  );
  const indent = (html.match(/^([ \t]*)<title/im) || [, '  '])[1];
  const block = links.map((l) => `${indent}${l}`).join('\n') + '\n';
  if (/<\/title>\s*\n/i.test(html)) html = html.replace(/(<\/title>\s*\n)/i, `$1${block}`);
  else html = html.replace(/(<\/head>)/i, `${block}$1`);
  if (html === original) return false;
  if (!DRY) fs.writeFileSync(file, html);
  return true;
}

// ── main ────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });

/**
 * Native Android launcher icons (spec 1.10), derived from the same renditions as the PWA icons —
 * never hand-placed (skill `logo`). Written only when the app has a Capacitor Android project.
 *
 *   mipmap-<d>/ic_launcher.png             48dp, from logo-maskable (legacy, pre-API-26)
 *   mipmap-<d>/ic_launcher_round.png       48dp, from logo-round
 *   mipmap-<d>/ic_launcher_foreground.png  108dp adaptive foreground: the maskable raster scaled
 *                                          so its content (72% of the square) fits Android's
 *                                          66dp safe zone, on the maskable's own backdrop colour
 *   values/ic_launcher_background.xml      that backdrop colour, for the adaptive background
 *   drawable-<d>/ic_stat_notify.png        24dp status-bar icon from the `-mono` master, when one
 *                                          exists: Android draws only its ALPHA, in white. A mono
 *                                          master that is a filled tile with the mark cut out
 *                                          (ink covers > 50% of its box, e.g. scs) is inverted
 *                                          inside the box, so the MARK becomes the silhouette;
 *                                          white specks < 1% of the area (ragged artwork edges)
 *                                          are dropped. Content spans 20dp (2dp padding).
 */
/**
 * Native iOS app icon (spec 1.10 Phase 3): the single 1024² universal icon in
 * `ios/App/App/Assets.xcassets/AppIcon.appiconset`, from logo-maskable — square and opaque, like
 * apple-touch-icon; iOS applies its own rounded mask. Apple rejects an icon that merely HAS an alpha
 * channel (ITMS-90717), and a canvas PNG always has one, so `sips` drops it via a max-quality JPEG
 * round trip. The file name stays the one Contents.json references.
 */
function writeIosIcon(appDir, maskable) {
  const set = path.join(appDir, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
  if (!fs.existsSync(set) || !maskable) return null;
  const contents = JSON.parse(fs.readFileSync(path.join(set, 'Contents.json'), 'utf8'));
  const entry = contents.images.find((i) => i.size === '1024x1024' && i.filename);
  if (!entry) return 'no 1024x1024 entry in AppIcon Contents.json — skipped';
  if (DRY) return `${entry.filename} (dry run, not written)`;
  const target = path.join(set, entry.filename);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'okr-ios-icon-'));
  fs.writeFileSync(path.join(tmp, 'icon.png'), Buffer.from(maskable.split(',')[1], 'base64'));
  execFileSync('sips', ['-z', '1024', '1024', '-s', 'format', 'jpeg', '-s', 'formatOptions', '100',
    path.join(tmp, 'icon.png'), '--out', path.join(tmp, 'icon.jpg')], { stdio: 'ignore' });
  execFileSync('sips', ['-s', 'format', 'png', path.join(tmp, 'icon.jpg'), '--out', target], { stdio: 'ignore' });
  fs.rmSync(tmp, { recursive: true, force: true });
  return `${entry.filename} (1024², no alpha)`;
}

/**
 * Google Play listing graphics (spec 1.10 Phase 3b), written only when the app keeps its store
 * texts in `store/android/de-DE/` (fastlane `supply` layout):
 *
 *   images/icon.png            512² — the maskable rendition (Play applies its own mask)
 *   images/featureGraphic.png  1024×500 — the mark on its own backdrop colour, plus the app name
 *                              from `store/android/de-DE/title.txt`
 */
async function writeStoreGraphics(appDir, maskable) {
  const lang = path.join(appDir, 'store/android/de-DE');
  if (!fs.existsSync(lang) || !maskable) return null;
  const titleFile = path.join(lang, 'title.txt');
  const title = fs.existsSync(titleFile) ? fs.readFileSync(titleFile, 'utf8').trim() : '';
  const out = await page.evaluate(async ({ maskable, title }) => {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = maskable; });
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    probe.getContext('2d').drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = probe.getContext('2d').getImageData(0, 0, 1, 1).data;
    const backdrop = `rgb(${r},${g},${b})`;
    const icon = document.createElement('canvas');
    icon.width = icon.height = 512;
    icon.getContext('2d').drawImage(img, 0, 0, 512, 512);
    const fg = document.createElement('canvas');
    fg.width = 1024; fg.height = 500;
    const x = fg.getContext('2d');
    x.fillStyle = backdrop; x.fillRect(0, 0, 1024, 500);
    x.drawImage(img, 30, 0, 500, 500); // same backdrop, so the square edge is invisible
    x.fillStyle = '#ffffff';
    x.textBaseline = 'middle';
    let size = 76;
    x.font = `700 ${size}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    while (x.measureText(title).width > 450 && size > 40) { size -= 2; x.font = `700 ${size}px -apple-system, "Helvetica Neue", Arial, sans-serif`; }
    x.fillText(title, 540, 250);
    return { icon: icon.toDataURL('image/png'), feature: fg.toDataURL('image/png') };
  }, { maskable, title });
  if (DRY) return 'icon.png + featureGraphic.png (dry run, not written)';
  const images = path.join(lang, 'images');
  fs.mkdirSync(images, { recursive: true });
  fs.writeFileSync(path.join(images, 'icon.png'), Buffer.from(out.icon.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(images, 'featureGraphic.png'), Buffer.from(out.feature.split(',')[1], 'base64'));
  return 'images/icon.png 512² + images/featureGraphic.png 1024×500';
}

const ANDROID_DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const ADAPTIVE_SCALE = 66 / (108 * 0.72); // maskable content edge → 66dp safe zone

async function writeAndroidIcons(appDir, maskable, round, mono) {
  const res = path.join(appDir, 'android/app/src/main/res');
  if (!fs.existsSync(res) || !maskable || !round) return null;
  const out = await page.evaluate(
    async ({ maskable, round, mono, densities, scale }) => {
      const load = (s) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = s; });
      const [m, r] = await Promise.all([load(maskable), load(round)]);
      const silhouette = mono ? statusSilhouette(await load(mono)) : null;
      const probe = document.createElement('canvas');
      probe.width = probe.height = 1;
      probe.getContext('2d').drawImage(m, 0, 0, 1, 1, 0, 0, 1, 1); // corner pixel = backdrop
      const [cr, cg, cb] = probe.getContext('2d').getImageData(0, 0, 1, 1).data;
      const backdrop = '#' + [cr, cg, cb].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      const draw = (img, n, fit = 1, fill = null) => {
        const c = document.createElement('canvas');
        c.width = c.height = n;
        const x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        if (fill) { x.fillStyle = fill; x.fillRect(0, 0, n, n); }
        const w = Math.round(n * fit);
        x.drawImage(img, Math.round((n - w) / 2), Math.round((n - w) / 2), w, w);
        return c.toDataURL('image/png');
      };
      const files = {};
      for (const [d, f] of Object.entries(densities)) {
        files[`mipmap-${d}/ic_launcher.png`] = draw(m, Math.round(48 * f));
        files[`mipmap-${d}/ic_launcher_round.png`] = draw(r, Math.round(48 * f));
        files[`mipmap-${d}/ic_launcher_foreground.png`] = draw(m, Math.round(108 * f), scale, backdrop);
        if (silhouette) files[`drawable-${d}/ic_stat_notify.png`] = draw(silhouette, Math.round(24 * f), 20 / 24);
      }
      return { files, backdrop, inverted: silhouette?.inverted ?? null };

      /** White-on-transparent alpha mask of the mono master, cropped to its ink (see header). */
      function statusSilhouette(img) {
        const N = 512;
        const c = document.createElement('canvas');
        c.width = c.height = N;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, N, N);
        const px = cx.getImageData(0, 0, N, N).data;
        const ink = new Uint8Array(N * N);
        let x0 = N, y0 = N, x1 = -1, y1 = -1, inked = 0;
        for (let i = 0; i < N * N; i++) {
          const lum = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
          ink[i] = px[i * 4 + 3] > 0 && lum < 200 ? px[i * 4 + 3] : 0; // light details count as holes
          if (ink[i] > 127) {
            const x = i % N, y = (i - x) / N;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            inked++;
          }
        }
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        const inverted = inked > 0.5 * w * h;
        const al = new Uint8Array(N * N);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = y * N + x;
          al[i] = inverted ? 255 - ink[i] : ink[i];
        }
        // drop specks: connected components below 1% of the silhouette's area
        const lab = new Int32Array(N * N).fill(-1);
        const sizes = [];
        let total = 0;
        for (let i = 0; i < N * N; i++) {
          if (al[i] < 128 || lab[i] >= 0) continue;
          const id = sizes.length;
          let n = 0;
          const st = [i];
          lab[i] = id;
          while (st.length) {
            const j = st.pop();
            n++;
            const jx = j % N, jy = (j - jx) / N;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = jx + dx, ny = jy + dy;
              if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
              const k = ny * N + nx;
              if (al[k] >= 128 && lab[k] < 0) { lab[k] = id; st.push(k); }
            }
          }
          sizes.push(n);
          total += n;
        }
        // square canvas around the ink box, so draw() can scale it like the other renditions
        const side = Math.max(w, h);
        const out = document.createElement('canvas');
        out.width = out.height = side;
        const od = out.getContext('2d').createImageData(side, side);
        const ox = Math.floor((side - w) / 2), oy = Math.floor((side - h) / 2);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = y * N + x;
          const keep = lab[i] < 0 ? al[i] : sizes[lab[i]] >= total * 0.01 ? al[i] : 0;
          od.data.set([255, 255, 255, keep], ((y - y0 + oy) * side + (x - x0 + ox)) * 4);
        }
        out.getContext('2d').putImageData(od, 0, 0);
        out.inverted = inverted;
        return out;
      }
    },
    { maskable, round, mono, densities: ANDROID_DENSITIES, scale: ADAPTIVE_SCALE },
  );
  if (DRY) return `${Object.keys(out.files).length} launcher icons (dry run, not written)`;
  for (const [rel, dataUrl] of Object.entries(out.files)) {
    fs.mkdirSync(path.dirname(path.join(res, rel)), { recursive: true });
    fs.writeFileSync(path.join(res, rel), Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  fs.writeFileSync(
    path.join(res, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${out.backdrop}</color>\n</resources>\n`,
  );
  const stat = out.inverted === null ? 'no -mono master, no status-bar icon' : `status-bar icon${out.inverted ? ' (inverted tile)' : ''}`;
  return `${Object.keys(out.files).length} files · ic_launcher_background ${out.backdrop} · ${stat}`;
}

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
  const hasApp = fs.existsSync(path.join(appDir, 'src/index.html'));
  const bg =
    (hasApp && fs.existsSync(manifestPath(appDir)) &&
      JSON.parse(fs.readFileSync(manifestPath(appDir), 'utf8')).background_color) ||
    '#ffffff';

  // The master is whatever `app-config.logoUrl` points at. That field already
  // exists to name the tenant's logo, so the generator does not also impose a
  // fixed filename — one pointer, one place to change it.
  const masterPath = (cfg.logoUrl || '').replace(/^\//, '');
  if (!masterPath) {
    console.error(`   app-config/${tenant}.logoUrl is empty — nothing to generate from`);
    failures++;
    continue;
  }
  /** `bka-logo.svg` + `-inverse` -> `bka-logo-inverse.svg` */
  const sibling = (suffix) => masterPath.replace(/(\.[^./]+)$/, `${suffix}$1`);

  let generatedPrimary = false;
  let resolvedMaster = null;
  let resolvedBytes = 0;
  let lastFavicon = null;
  let lastMaskable = null;
  let lastRound = null;
  let lastMono = null;
  let resolvedIsSvg = false;

  for (const variant of VARIANTS) {
    const srcPath = variant.suffix === '' ? masterPath : sibling(variant.suffix);
    const [exists] = await bucket.file(srcPath).exists();
    if (!exists) {
      if (variant.required) {
        console.error(`   logoUrl points at ${srcPath}, which is not in the bucket`);
        failures++;
      }
      continue;
    }
    if (await generate(srcPath, variant.suffix) && variant.required) {
      generatedPrimary = true;
      resolvedMaster = srcPath;
    } else if (variant.required) {
      failures++;
    }
  }

  async function generate(srcPath, suffix) {
    const [buf] = await bucket.file(srcPath).download();
    const [meta] = await bucket.file(srcPath).getMetadata();
    const isSvg = /svg/i.test(meta.contentType || '') || /\.svg$/i.test(srcPath);

    // An SVG master is preferred but not required — a sufficiently large raster
    // works too. Read it as BYTES either way: decoding a PNG as UTF-8 corrupts it,
    // and the data URI has to carry the real media type or the image never loads.
    let dataUri;
    if (isSvg) {
      let svg = buf.toString('utf8');
      // Editor exports carry a root `transform` that the viewBox already handles.
      // Left in place it shrinks the artwork into a corner of the canvas.
      if (/<svg[^>]*\stransform=/i.test(svg)) {
        svg = svg.replace(/(<svg[^>]*?)\stransform="[^"]*"/i, '$1');
        console.warn(`   ${path.basename(srcPath)}: stripped a root transform (export artefact)`);
      }
      dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
    } else {
      dataUri = `data:${meta.contentType || 'image/png'};base64,${buf.toString('base64')}`;
    }
    if (suffix === '') {
      resolvedBytes = buf.length;
      resolvedIsSvg = isSvg;
    }

    const r = await page.evaluate(COMPOSE, { dataUri, size: RASTER, bg });
    if (r.reject) {
      console.warn(`   ${path.basename(srcPath)}: ${r.reject} — skipped`);
      return false;
    }
    if (!isSvg && r.natural && Math.min(r.natural.w, r.natural.h) < RASTER) {
      console.warn(
        `   ${path.basename(srcPath)}: raster master is only ${r.natural.w}x${r.natural.h}; ` +
          `upscaled to ${RASTER}. An SVG master would stay sharp at every size.`,
      );
    }
    console.log(
      `   ${path.basename(srcPath).padEnd(18)} ${r.mode.padEnd(7)} bbox=${r.bbox.padEnd(9)} bg=${r.backdrop}` +
        (r.mode === 'framed' ? `  border=${r.thick}px` : ''),
    );

    if (suffix === '') {
      lastFavicon = r.favicon;
      lastMaskable = r.maskable;
      lastRound = r.round;
    }
    if (suffix === '-mono') lastMono = r.master;

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
  const h = rewriteIndexHtml(appDir, iconLinks(base, dir, masterSvg, resolvedBytes, resolvedIsSvg));
  console.log(
    `   ${path.relative(appDir, mPath)} ${m ? 'rewritten' : 'unchanged'} · index.html ${h ? 'rewritten' : 'unchanged'}`,
  );
  const android = await writeAndroidIcons(appDir, lastMaskable, lastRound, lastMono);
  if (android) console.log(`   android: ${android}`);
  const ios = writeIosIcon(appDir, lastMaskable);
  if (ios) console.log(`   ios: ${ios}`);
  const storeGfx = await writeStoreGraphics(appDir, lastMaskable);
  if (storeGfx) console.log(`   store: ${storeGfx}`);

  await doWebsite();

  async function doWebsite() {
    const webDir = path.join(ROOT, 'apps', `${tenant}-website`);
    if (!fs.existsSync(webDir)) return;
    const assets = path.join(webDir, 'assets');
    if (!fs.existsSync(assets)) return;

    if (!DRY) {
      fs.writeFileSync(path.join(assets, 'favicon.png'), Buffer.from(lastFavicon.split(',')[1], 'base64'));
      if (resolvedIsSvg && resolvedBytes && resolvedBytes <= SVG_FAVICON_MAX) {
        const [mb] = await bucket.file(resolvedMaster).download();
        fs.writeFileSync(path.join(assets, 'favicon.svg'), mb);
      }
    }
    const links = websiteIconLinks(resolvedBytes, resolvedIsSvg);
    const pages = fs.readdirSync(webDir).filter((f) => f.endsWith('.html'));
    const changed = pages.filter((f) => rewriteWebsitePage(path.join(webDir, f), links));
    console.log(
      `   website: assets/favicon.png${resolvedIsSvg && resolvedBytes <= SVG_FAVICON_MAX ? ' + favicon.svg' : ''}` +
        ` · ${changed.length}/${pages.length} page(s) rewritten`,
    );
  }
}

await browser.close();

if (DRY) console.log('\nDry run — nothing uploaded, no files written.');
if (failures) {
  console.error(`\n${failures} tenant(s) failed.`);
  process.exit(1);
}
console.log('\nDone.');
